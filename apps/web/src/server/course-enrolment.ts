import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';

// Who's in a course (Stage 5 · B2): a class-size limit with a waitlist, students' requests to join
// (elective requests), and sections. A request the teacher accepts, or a student joining a shared
// course, gets a place if there is one; otherwise it waits (status WAITLISTED) and is let in, oldest
// first, as places free up. The school's own ways in (imports, admissions, its systems) aren't limited.

const MAX_CAPACITY = 2000;
const MAX_SECTIONS = 30;
const link = (courseId: string) => `/student/blackboard?course=${courseId}`;

async function placesLeft(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { capacity: true, _count: { select: { enrollments: true } } } });
  if (!course) throw new NotFoundException('Course not found.');
  return course.capacity === null ? Infinity : Math.max(0, course.capacity - course._count.enrollments);
}

async function enrol(courseId: string, studentIds: string[]) {
  if (!studentIds.length) return;
  for (const studentId of studentIds) {
    await prisma.enrollment.upsert({ where: { studentId_courseId: { studentId, courseId } }, create: { studentId, courseId }, update: {} });
  }
  await prisma.electiveRequest.updateMany({ where: { courseId, studentId: { in: studentIds }, status: { in: ['PENDING', 'REVIEWING', 'WAITLISTED'] } }, data: { status: 'ACCEPTED' } });
}

/**
 * A place for the student, or a place in the queue: returns where they are. `force`: the teacher
 * letting someone in over the limit.
 */
export async function enrolOrWait(courseId: string, studentId: string, force = false): Promise<{ enrolled: boolean; position: number | null }> {
  if (await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } })) return { enrolled: true, position: null };
  if (force || (await placesLeft(courseId)) > 0) {
    await enrol(courseId, [studentId]);
    return { enrolled: true, position: null };
  }
  const existing = await prisma.electiveRequest.findFirst({ where: { courseId, studentId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (existing) await prisma.electiveRequest.update({ where: { id: existing.id }, data: { status: 'WAITLISTED' } });
  else await prisma.electiveRequest.create({ data: { courseId, studentId, semesterId: '', status: 'WAITLISTED' } });
  return { enrolled: false, position: await waitPosition(courseId, studentId) };
}

export async function waitPosition(courseId: string, studentId: string) {
  const mine = await prisma.electiveRequest.findFirst({ where: { courseId, studentId, status: 'WAITLISTED' }, select: { createdAt: true } });
  if (!mine) return null;
  return 1 + (await prisma.electiveRequest.count({ where: { courseId, status: 'WAITLISTED', createdAt: { lt: mine.createdAt } } }));
}

/** Lets waiting students in, oldest first, while there are places. */
export async function promoteWaitlist(courseId: string) {
  const left = await placesLeft(courseId);
  if (left <= 0) return 0;
  const next = await prisma.electiveRequest.findMany({ where: { courseId, status: 'WAITLISTED' }, orderBy: { createdAt: 'asc' }, take: Math.min(left, 50), select: { studentId: true } });
  if (!next.length) return 0;
  const ids = next.map((n) => n.studentId);
  await enrol(courseId, ids);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true } });
  await notifyMany(ids, { title: `You’re in ${course?.code ?? 'the course'}`, body: 'A place opened up and you were next on the waitlist.', type: 'info', email: false, link: link(courseId) });
  return ids.length;
}

/** A student leaving (or being removed from) a course: the next on the waitlist gets the place. */
export async function leaveCourse(courseId: string, studentId: string) {
  await prisma.enrollment.deleteMany({ where: { studentId, courseId } });
  await prisma.electiveRequest.updateMany({ where: { courseId, studentId, status: { in: ['PENDING', 'REVIEWING', 'WAITLISTED', 'ACCEPTED'] } }, data: { status: 'WITHDRAWN' } });
  await promoteWaitlist(courseId);
}

async function staffOf(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a || !a.canGrade) throw new NotFoundException('Course not found.');
  return a;
}

/** GET /api/courses/:id/enrolment — the class list, requests, waitlist and sections (the teaching team). */
export async function enrolmentView(courseId: string, user: SessionUser) {
  const a = await staffOf(courseId, user);
  const student = { select: { id: true, name: true, email: true, avatar: true } } as const;
  const [course, enrolled, requests, sections] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { capacity: true } }),
    prisma.enrollment.findMany({ where: { courseId }, orderBy: { enrolledAt: 'asc' }, take: 1000, select: { sectionId: true, enrolledAt: true, student: { select: { ...student.select, accommodation: { select: { extraDays: true, extraTimePct: true, note: true } } } } } }),
    prisma.electiveRequest.findMany({ where: { courseId, status: { in: ['PENDING', 'REVIEWING', 'WAITLISTED'] } }, orderBy: { createdAt: 'asc' }, take: 300, select: { id: true, status: true, note: true, createdAt: true, student } }),
    prisma.courseSection.findMany({ where: { courseId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
  ]);
  const count = (id: string) => enrolled.filter((e) => e.sectionId === id).length;
  return {
    canManage: a.canManage,
    capacity: course?.capacity ?? null,
    // Extra days and extra time (Stage 5 · B3.1, src/server/accommodations.ts), for the teaching team.
    students: enrolled.map(({ student: { accommodation, ...s }, ...e }) => ({ ...s, sectionId: e.sectionId, enrolledAt: e.enrolledAt, accommodation: accommodation ?? null })),
    requests: requests.filter((r) => r.status !== 'WAITLISTED').map((r) => ({ id: r.id, note: r.note, createdAt: r.createdAt, student: r.student })),
    waitlist: requests.filter((r) => r.status === 'WAITLISTED').map((r, i) => ({ id: r.id, position: i + 1, createdAt: r.createdAt, student: r.student })),
    sections: sections.map((s) => ({ ...s, students: count(s.id) })),
  };
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');

/**
 * POST /api/courses/:id/enrolment { action, … } (teacher and co-teachers):
 * accept { requestId, force? } · decline { requestId } · remove { studentId } · capacity { capacity: number | null } ·
 * section-add { name } · section-rename { sectionId, name } · section-delete { sectionId } · assign { studentId, sectionId | null }.
 */
export async function changeEnrolment(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  const a = await staffOf(courseId, user);
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can change who’s in it.');
  const request = async () => {
    const r = typeof b.requestId === 'string' ? await prisma.electiveRequest.findFirst({ where: { id: b.requestId, courseId, status: { in: ['PENDING', 'REVIEWING', 'WAITLISTED'] } }, select: { id: true, studentId: true } }) : null;
    if (!r) throw new NotFoundException('That request isn’t open any more.');
    return r;
  };
  const section = async (id: unknown) => {
    const s = typeof id === 'string' ? await prisma.courseSection.findFirst({ where: { id, courseId }, select: { id: true } }) : null;
    if (!s) throw new NotFoundException('That section isn’t there any more.');
    return s;
  };

  switch (b.action) {
    case 'accept': {
      const r = await request();
      const out = await enrolOrWait(courseId, r.studentId, b.force === true);
      const code = a.course.code;
      await notifyMany([r.studentId], out.enrolled
        ? { title: `You’re in ${code}`, body: 'Your request to join was accepted.', type: 'info', email: false, link: link(courseId) }
        : { title: `You’re on the waitlist for ${code}`, body: `The class is full. You’re number ${out.position} on the waitlist and will be let in when a place opens.`, type: 'info', email: false, link: '/student/courses' });
      return out;
    }
    case 'decline': {
      const r = await request();
      await prisma.electiveRequest.update({ where: { id: r.id }, data: { status: 'REJECTED' } });
      return { ok: true };
    }
    case 'remove': {
      const studentId = typeof b.studentId === 'string' ? b.studentId : '';
      if (!(await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } }))) throw new NotFoundException('They aren’t in this course.');
      await leaveCourse(courseId, studentId);
      return { ok: true };
    }
    case 'capacity': {
      const raw = b.capacity;
      const capacity = raw === null || raw === '' ? null : Math.floor(Number(raw));
      if (capacity !== null && !(capacity >= 1 && capacity <= MAX_CAPACITY)) throw new BadRequestException(`A class can take 1 to ${MAX_CAPACITY} students, or no limit.`);
      await prisma.course.update({ where: { id: courseId }, data: { capacity } });
      // A higher limit (or none) lets the waitlist in.
      return { ok: true, letIn: await promoteWaitlist(courseId) };
    }
    case 'section-add': {
      const name = cleanName(b.name);
      if (!name) throw new BadRequestException('Name the section.');
      if ((await prisma.courseSection.count({ where: { courseId } })) >= MAX_SECTIONS) throw new BadRequestException(`A course can have up to ${MAX_SECTIONS} sections.`);
      if (await prisma.courseSection.findFirst({ where: { courseId, name }, select: { id: true } })) throw new BadRequestException('There’s already a section with that name.');
      const last = await prisma.courseSection.findFirst({ where: { courseId }, orderBy: { position: 'desc' }, select: { position: true } });
      return prisma.courseSection.create({ data: { courseId, name, position: (last?.position ?? -1) + 1 }, select: { id: true, name: true } });
    }
    case 'section-rename': {
      const s = await section(b.sectionId);
      const name = cleanName(b.name);
      if (!name) throw new BadRequestException('Name the section.');
      if (await prisma.courseSection.findFirst({ where: { courseId, name, id: { not: s.id } }, select: { id: true } })) throw new BadRequestException('There’s already a section with that name.');
      await prisma.courseSection.update({ where: { id: s.id }, data: { name } });
      return { ok: true };
    }
    case 'section-delete': {
      const s = await section(b.sectionId);
      // Its students stay in the course, in no section.
      await prisma.courseSection.delete({ where: { id: s.id } });
      return { ok: true };
    }
    case 'assign': {
      const studentId = typeof b.studentId === 'string' ? b.studentId : '';
      const sectionId = b.sectionId === null || b.sectionId === '' ? null : (await section(b.sectionId)).id;
      const done = await prisma.enrollment.updateMany({ where: { courseId, studentId }, data: { sectionId } });
      if (!done.count) throw new NotFoundException('They aren’t in this course.');
      return { ok: true };
    }
    default:
      throw new BadRequestException('Unknown action.');
  }
}
