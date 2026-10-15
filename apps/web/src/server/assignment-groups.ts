import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { isGroupMode, makeGroups } from '@/lib/group-maker';
import { audit } from './audit';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Groups for a group assignment (Stage 5 · B3.2): one hand-in per group, then one grade for everyone
// (SHARED) or a grade for each member (INDIVIDUAL). The teacher and co-teachers make the groups: at
// random, from the course's sections, or by hand; a group that has handed in keeps its hand-in.
// Many rows at once go in one statement each (json_each), so a big class stays within D1's limits.

const MAX_GROUPS = 300, MAX_MEMBERS = 20;
const newId = () => `c${[...randomBytes(18)].map((x) => (x % 36).toString(36)).join('').slice(0, 24)}`;
const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');

/** The groups with their members, in name order ("Group 2" before "Group 10"). */
export async function groupsOf(assignmentId: string) {
  const groups = await prisma.assignmentGroup.findMany({
    where: { assignmentId }, take: MAX_GROUPS,
    select: { id: true, name: true, members: { take: MAX_MEMBERS, select: { student: { select: { id: true, name: true } } } } },
  });
  return groups
    .map((g) => ({ id: g.id, name: g.name, members: g.members.map((m) => m.student).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** A student's group for an assignment, with who's in it. */
export async function myGroup(assignmentId: string, studentId: string) {
  const m = await prisma.assignmentGroupMember.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
    select: { group: { select: { id: true, name: true, members: { take: MAX_MEMBERS, select: { student: { select: { id: true, name: true } } } } } } },
  });
  return m ? { id: m.group.id, name: m.group.name, members: m.group.members.map((x) => x.student) } : null;
}

/** Many groups and members in two statements (one bound value each). */
async function insertGroups(assignmentId: string, groups: { name: string; studentIds: string[] }[]) {
  const rows = groups.map((g) => ({ id: newId(), name: g.name, studentIds: g.studentIds }));
  if (!rows.length) return 0;
  await prisma.$executeRawUnsafe(
    `INSERT INTO assignment_groups (id, assignmentId, name) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.name') FROM json_each(?)`,
    assignmentId, JSON.stringify(rows.map(({ id, name }) => ({ id, name }))),
  );
  const members = rows.flatMap((g) => g.studentIds.map((studentId) => ({ id: newId(), groupId: g.id, studentId })));
  if (members.length) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO assignment_group_members (id, assignmentId, groupId, studentId) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.groupId'), json_extract(value, '$.studentId') FROM json_each(?)`,
      assignmentId, JSON.stringify(members),
    );
  }
  return rows.length;
}

/**
 * POST /api/assignments/:id/groups { action, … } (teacher and co-teachers):
 * mode { groupMode: null | SHARED | INDIVIDUAL } · make { size } · sections · add { name } ·
 * rename { groupId, name } · delete { groupId } · move { studentId, groupId | null }.
 */
export async function changeGroups(assignmentId: string, user: SessionUser, b: Record<string, unknown>, req: Request) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, title: true, courseId: true, groupMode: true } });
  const a = assignment ? await courseAccess(assignment.courseId, user) : null;
  if (!assignment || !a) throw new NotFoundException('Assignment not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can change the groups.');
  const handedIn = () => prisma.assignmentSubmission.count({ where: { assignmentId, groupId: { not: null } } });
  const group = async (id: unknown) => {
    const g = typeof id === 'string' ? await prisma.assignmentGroup.findFirst({ where: { id, assignmentId }, select: { id: true, name: true } }) : null;
    if (!g) throw new NotFoundException('That group isn’t there any more.');
    return g;
  };
  const enrolled = () => prisma.enrollment.findMany({ where: { courseId: assignment.courseId }, take: 2000, select: { studentId: true, sectionId: true } });

  switch (b.action) {
    case 'mode': {
      const mode = b.groupMode === null || b.groupMode === '' || b.groupMode === 'NONE' ? null : isGroupMode(b.groupMode) ? b.groupMode : undefined;
      if (mode === undefined) throw new BadRequestException('Choose who hands in.');
      // Individual hand-ins and group ones don't mix: switch before anyone hands in.
      if ((mode === null) !== (assignment.groupMode === null) && (await prisma.assignmentSubmission.count({ where: { assignmentId } }))) {
        throw new BadRequestException('Students have handed in already, so this can’t switch between individual and group work. Make a new assignment for it.');
      }
      await prisma.assignment.update({ where: { id: assignmentId }, data: { groupMode: mode } });
      return { ok: true };
    }
    case 'make': case 'sections': {
      if (await handedIn()) throw new BadRequestException('Some groups have handed in already: move students one by one instead.');
      const people = await enrolled();
      const groups = b.action === 'make'
        ? makeGroups(people.map((p) => p.studentId), Number(b.size)).map((ids, i) => ({ name: `Group ${i + 1}`, studentIds: ids }))
        : await prisma.courseSection.findMany({ where: { courseId: assignment.courseId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true } })
          .then((secs) => secs.map((s) => ({ name: s.name, studentIds: people.filter((p) => p.sectionId === s.id).map((p) => p.studentId) })).filter((g) => g.studentIds.length));
      if (!groups.length) throw new BadRequestException(b.action === 'sections' ? 'The course has no sections with students in them yet.' : 'There are no students in the course yet.');
      if (groups.length > MAX_GROUPS || groups.some((g) => g.studentIds.length > MAX_MEMBERS)) throw new BadRequestException(`Groups can have up to ${MAX_MEMBERS} students, and an assignment up to ${MAX_GROUPS} groups.`);
      await prisma.assignmentGroup.deleteMany({ where: { assignmentId } });
      const made = await insertGroups(assignmentId, groups);
      audit(user, { action: 'assignment.groups', summary: `Made ${made} groups for “${assignment.title}” (${a.course.code})`, targetType: 'assignment', targetId: assignmentId }, req);
      return { groups: made };
    }
    case 'add': {
      const name = cleanName(b.name);
      if (!name) throw new BadRequestException('Name the group.');
      if ((await prisma.assignmentGroup.count({ where: { assignmentId } })) >= MAX_GROUPS) throw new BadRequestException(`An assignment can have up to ${MAX_GROUPS} groups.`);
      if (await prisma.assignmentGroup.findFirst({ where: { assignmentId, name }, select: { id: true } })) throw new BadRequestException('There’s already a group with that name.');
      return prisma.assignmentGroup.create({ data: { assignmentId, name }, select: { id: true, name: true } });
    }
    case 'rename': {
      const g = await group(b.groupId);
      const name = cleanName(b.name);
      if (!name) throw new BadRequestException('Name the group.');
      if (await prisma.assignmentGroup.findFirst({ where: { assignmentId, name, id: { not: g.id } }, select: { id: true } })) throw new BadRequestException('There’s already a group with that name.');
      await prisma.assignmentGroup.update({ where: { id: g.id }, data: { name } });
      return { ok: true };
    }
    case 'delete': {
      const g = await group(b.groupId);
      if (await prisma.assignmentSubmission.count({ where: { groupId: g.id } })) throw new BadRequestException('This group has handed in, so it stays.');
      await prisma.assignmentGroup.delete({ where: { id: g.id } });
      return { ok: true };
    }
    case 'move': {
      const studentId = typeof b.studentId === 'string' ? b.studentId : '';
      if (!studentId || !(await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId: assignment.courseId } }, select: { id: true } }))) throw new NotFoundException('They aren’t in this course.');
      if (b.groupId === null || b.groupId === '') {
        await prisma.assignmentGroupMember.deleteMany({ where: { assignmentId, studentId } });
        return { ok: true };
      }
      const g = await group(b.groupId);
      if ((await prisma.assignmentGroupMember.count({ where: { groupId: g.id } })) >= MAX_MEMBERS) throw new BadRequestException(`A group can have up to ${MAX_MEMBERS} students.`);
      await prisma.assignmentGroupMember.upsert({ where: { assignmentId_studentId: { assignmentId, studentId } }, create: { assignmentId, groupId: g.id, studentId }, update: { groupId: g.id } });
      return { ok: true };
    }
    default:
      throw new BadRequestException('Unknown action.');
  }
}
