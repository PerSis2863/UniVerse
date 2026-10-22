import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { notifyMany } from './email';
import { BadRequestException, NotFoundException } from './http';
import { taughtBy } from '@/lib/course-access';
import { schoolsOf, usersIn } from './school-scope';

// Course announcements (Stage 5 · B2): sent now or at a set time (the 15-minute cron sends the due
// ones: cloudflare/due-check.ts → /api/cron/reminders), pinned to the top, and "seen by 28 of 32"
// for the teacher. Students see an announcement only from its time. Notices are in-app, never email.

const YEAR = 366 * 86_400_000;

/** Announcements students may see now: no time set, or the time has come. */
export const visibleNow = (now = new Date()) => ({ OR: [{ publishAt: null }, { publishAt: { lte: now } }] });

/** When it shows as posted: its set time, or when it was written. */
export const postedAt = (a: { publishAt: Date | null; createdAt: Date }) => a.publishAt ?? a.createdAt;

/** A requested time, or null for "now". It must be later than now and within a year. */
export function publishTime(raw: unknown, now = Date.now()): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
  if (!Number.isFinite(t)) throw new BadRequestException('Choose a date and time for the announcement.');
  if (t <= now + 60_000) throw new BadRequestException('Choose a time at least a minute from now, or send it now.');
  if (t > now + YEAR) throw new BadRequestException('Announcements can be scheduled up to a year ahead.');
  return new Date(t);
}

/** Tells the course's students (in the app and by push to open apps) and marks it sent. */
export async function sendAnnouncement(a: { id: string; title: string; body: string; courseId: string | null }, code: string) {
  await prisma.announcement.update({ where: { id: a.id }, data: { sentAt: new Date() } });
  if (!a.courseId) return 0;
  const students = await prisma.enrollment.findMany({ where: { courseId: a.courseId }, select: { studentId: true }, take: 2000 });
  if (!students.length) return 0;
  return notifyMany(students.map((s) => s.studentId), {
    title: `${code}: ${a.title}`, body: a.body.slice(0, 200), type: 'announcement', email: false,
    link: `/student/blackboard?course=${a.courseId}`, courseId: a.courseId,
  });
}

/** Board POST { kind: 'announcement', title, body, publishAt? } (the teacher, already checked). */
export async function postAnnouncement(course: { id: string; code: string }, user: SessionUser, title: string, body: string, rawPublishAt: unknown) {
  const publishAt = publishTime(rawPublishAt);
  const item = await prisma.announcement.create({ data: { title, body, courseId: course.id, authorId: user.id, target: 'COURSE', publishAt } });
  if (!publishAt) await sendAnnouncement(item, course.code);
  return item;
}

/** The 15-minute cron: send scheduled announcements whose time has come (a few per run). */
export async function sendDueAnnouncements(now = new Date()) {
  const due = await prisma.announcement.findMany({
    where: { sentAt: null, publishAt: { not: null, lte: now } },
    orderBy: { publishAt: 'asc' }, take: 8,
    select: { id: true, title: true, body: true, courseId: true, course: { select: { code: true } } },
  });
  let sent = 0;
  for (const a of due) sent += await sendAnnouncement(a, a.course?.code ?? 'Course');
  return { announcements: due.length, told: sent };
}

/** Board POST { kind: 'pin', id, on } (the teacher). */
export async function pinAnnouncement(courseId: string, id: unknown, on: boolean) {
  const a = typeof id === 'string' ? await prisma.announcement.findFirst({ where: { id, courseId }, select: { id: true } }) : null;
  if (!a) throw new NotFoundException('That announcement isn’t there any more.');
  await prisma.announcement.update({ where: { id: a.id }, data: { pinnedAt: on ? new Date() : null } });
  return { ok: true };
}

/**
 * POST /api/courses/:id/announcements/seen { ids }: a student opened the board and these were on
 * it. Only the course's students count, and only announcements they could see.
 */
export async function markSeen(courseId: string, user: SessionUser, rawIds: unknown) {
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
  if (!enrolled) return { seen: 0 };
  const asked = Array.isArray(rawIds) ? [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && x.length <= 40))].slice(0, 50) : [];
  if (!asked.length) return { seen: 0 };
  const ids = (await prisma.announcement.findMany({ where: { id: { in: asked }, courseId, ...visibleNow() }, select: { id: true } })).map((a) => a.id);
  if (!ids.length) return { seen: 0 };
  const now = new Date().toISOString().replace('Z', '+00:00');
  // 3 values a row: 30 rows a statement keeps within D1's 100.
  let seen = 0;
  for (let i = 0; i < ids.length; i += 30) {
    const part = ids.slice(i, i + 30);
    seen += await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "announcement_reads" ("announcementId", "userId", "readAt") VALUES ${part.map(() => '(?, ?, ?)').join(', ')}`,
      ...part.flatMap((id) => [id, user.id, now]),
    );
  }
  return { seen };
}

/**
 * Who may read an announcement: school-wide ones (no course) for everyone at that school, a
 * course's for its students, teacher and admins. Scheduled ones only once their time has come,
 * except for whoever wrote them and admins. (Before, any signed-in person could read any course's.)
 */
export async function announcementWhere(user: SessionUser) {
  // Admins: their school's (by author, school-scope.ts); the owner sees all.
  if (user.role === 'ADMIN') {
    const people = usersIn(await schoolsOf(user));
    return Object.keys(people).length ? { author: people } : {};
  }
  const school = user.organizationId && !user.owner ? { author: { organizationId: user.organizationId } } : {};
  const [enrolled, taught] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true }, take: 200 }),
    user.role === 'TEACHER' ? prisma.course.findMany({ where: taughtBy(user.id), select: { id: true }, take: 200 }) : Promise.resolve([]),
  ]);
  const courses = [...new Set([...enrolled.map((e) => e.courseId), ...taught.map((c) => c.id)])].slice(0, 90);
  // Teachers also see what students were told.
  const audience = user.role === 'TEACHER' ? ['ALL', 'TEACHERS', 'STUDENTS'] : ['ALL', 'STUDENTS'];
  return {
    AND: [
      { OR: [{ courseId: null, target: { in: audience as ('ALL' | 'STUDENTS' | 'TEACHERS')[] }, ...school }, ...(courses.length ? [{ courseId: { in: courses } }] : [])] },
      { OR: [...visibleNow().OR, { authorId: user.id }] },
    ],
  };
}
