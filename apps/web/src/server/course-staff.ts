import prisma from '@/lib/db';
import { courseAccess, ownsCourse, STAFF_ROLES, type StaffRole } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { notify } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// A course's teaching team (Stage 5 · B2): its teacher adds co-teachers (everything but the team,
// copying and deleting) and teaching assistants (grading, attendance, the discussion) by email.
// They must have a teacher account at the same school. Everyone on the team can see who's on it,
// and leave it.

const MAX_STAFF = 12;
export const ROLE_LABEL: Record<StaffRole, string> = { CO_TEACHER: 'Co-teacher', TA: 'Teaching assistant' };

async function load(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a || !a.canGrade) throw new NotFoundException('Course not found.');
  return a;
}

/** GET /api/courses/:id/staff */
export async function listStaff(courseId: string, user: SessionUser) {
  const a = await load(courseId, user);
  const [teacher, staff] = await Promise.all([
    prisma.user.findUnique({ where: { id: a.course.teacherId }, select: { id: true, name: true, email: true, avatar: true } }),
    prisma.courseStaff.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' }, select: { role: true, user: { select: { id: true, name: true, email: true, avatar: true } } } }),
  ]);
  return {
    canEdit: ownsCourse(a.course, user),
    teacher,
    staff: staff.map((s) => ({ ...s.user, role: s.role as StaffRole, me: s.user.id === user.id })),
  };
}

const roleOf = (v: unknown): StaffRole => {
  if (!(STAFF_ROLES as unknown[]).includes(v)) throw new BadRequestException('Choose co-teacher or teaching assistant.');
  return v as StaffRole;
};

/** POST /api/courses/:id/staff { action: 'add', email, role } · { action: 'role', userId, role } · { action: 'remove', userId } */
export async function changeStaff(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  const a = await load(courseId, user);
  const owner = ownsCourse(a.course, user);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, teacher: { select: { organizationId: true } } } });
  if (!course) throw new NotFoundException('Course not found.');

  if (b.action === 'remove') {
    const userId = typeof b.userId === 'string' ? b.userId : '';
    // The teacher (or an admin) removes anyone; anyone on the team can leave it.
    if (!owner && userId !== user.id) throw new ForbiddenException('Only the course’s teacher can change its team.');
    await prisma.courseStaff.deleteMany({ where: { courseId, userId } });
    return { ok: true };
  }
  if (!owner) throw new ForbiddenException('Only the course’s teacher can change its team.');

  if (b.action === 'role') {
    const role = roleOf(b.role);
    const done = await prisma.courseStaff.updateMany({ where: { courseId, userId: typeof b.userId === 'string' ? b.userId : '' }, data: { role } });
    if (!done.count) throw new NotFoundException('They aren’t on the team any more.');
    return { ok: true };
  }

  if (b.action !== 'add') throw new BadRequestException('Unknown action.');
  const role = roleOf(b.role);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 200) : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter their email address.');
  const person = await prisma.user.findFirst({ where: { email }, select: { id: true, name: true, role: true, status: true, organizationId: true } });
  // The same answer whether there's no account or it's someone else's school, so it can't be used to find people.
  const school = course.teacher.organizationId;
  if (!person || person.status === 'SUSPENDED' || (school && person.organizationId !== school)) throw new NotFoundException('No teacher at your school has that email address.');
  if (person.role !== 'TEACHER' && person.role !== 'ADMIN') throw new BadRequestException(`${person.name} doesn’t have a teacher account. An admin can give them one (Admin → People).`);
  if (person.id === a.course.teacherId) throw new BadRequestException('They already teach this course.');
  if ((await prisma.courseStaff.count({ where: { courseId } })) >= MAX_STAFF) throw new BadRequestException(`A course can have up to ${MAX_STAFF} people on its team.`);
  await prisma.courseStaff.upsert({
    where: { courseId_userId: { courseId, userId: person.id } },
    create: { courseId, userId: person.id, role, addedById: user.id },
    update: { role },
  });
  await notify(person.id, {
    title: `You’re on ${course.code}’s teaching team`,
    body: `${user.name} added you as ${ROLE_LABEL[role].toLowerCase()}. The course is now in your Blackboard.`,
    type: 'info', email: false, link: `/teacher/blackboard?course=${courseId}`,
  });
  return { ok: true, name: person.name };
}
