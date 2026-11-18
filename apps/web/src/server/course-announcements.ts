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
export async function postAnnouncement(course: { id: string; code: string }, user: SessionUser, title: string, body: string, rawPublishAt: unknown, needsAck = false) {
  const publishAt = publishTime(rawPublishAt);
  const item = await prisma.announcement.create({ data: { title, body, courseId: course.id, authorId: user.id, target: 'COURSE', publishAt, needsAck } });
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

// ── M299: who has seen it, a reminder to the rest, and "I've read it" ──

const REMIND_EVERY = 12 * 3600_000;

async function courseAnnouncement(courseId: string, id: string) {
  const a = await prisma.announcement.findFirst({ where: { id, courseId }, select: { id: true, title: true, needsAck: true, remindedAt: true, publishAt: true, course: { select: { code: true } } } });
  if (!a) throw new NotFoundException('That announcement isn’t there any more.');
  return a;
}

/** GET (teachers): each enrolled student with when they saw it and, if it asks, confirmed it. */
export async function announcementReaders(courseId: string, id: string) {
  const a = await courseAnnouncement(courseId, id);
  const [students, reads] = await Promise.all([
    prisma.enrollment.findMany({ where: { courseId }, select: { student: { select: { id: true, name: true } } }, take: 1000 }),
    prisma.announcementRead.findMany({ where: { announcementId: id }, select: { userId: true, readAt: true, ackAt: true } }),
  ]);
  const byUser = new Map(reads.map((r) => [r.userId, r]));
  const people = students.map((e) => ({ id: e.student.id, name: e.student.name, seenAt: byUser.get(e.student.id)?.readAt ?? null, ackAt: byUser.get(e.student.id)?.ackAt ?? null })).sort((x, y) => x.name.localeCompare(y.name));
  return { needsAck: a.needsAck, remindedAt: a.remindedAt, canRemind: !a.remindedAt || Date.now() - a.remindedAt.getTime() > REMIND_EVERY, people };
}

/** POST (teachers): an in-app reminder to the students who haven't seen it (or, if it asks, confirmed it). */
export async function remindAnnouncement(courseId: string, id: string) {
  const a = await courseAnnouncement(courseId, id);
  if (a.publishAt && a.publishAt > new Date()) throw new BadRequestException('It isn’t out yet.');
  if (a.remindedAt && Date.now() - a.remindedAt.getTime() <= REMIND_EVERY) throw new BadRequestException('You reminded them less than 12 hours ago.');
  const { people } = await announcementReaders(courseId, id);
  const rest = people.filter((p) => (a.needsAck ? !p.ackAt : !p.seenAt)).map((p) => p.id);
  if (!rest.length) return { reminded: 0 };
  const claimed = await prisma.announcement.updateMany({ where: { id, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(Date.now() - REMIND_EVERY) } }] }, data: { remindedAt: new Date() } });
  if (!claimed.count) return { reminded: 0 };
  await notifyMany(rest, { title: `${a.course?.code ?? 'Course'}: please read “${a.title}”`, body: a.needsAck ? 'Your teacher asks you to confirm you’ve read it.' : 'Your teacher posted something you haven’t seen yet.', link: `/student/blackboard?course=${courseId}`, type: 'reminder', courseId, email: false });
  return { reminded: rest.length };
}

/** POST (an enrolled student): "I've read it" on an announcement that asks. */
export async function acknowledgeAnnouncement(courseId: string, user: SessionUser, id: string) {
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId } }, select: { id: true } });
  if (!enrolled) throw new NotFoundException('That announcement isn’t there any more.');
  const a = await courseAnnouncement(courseId, id);
  if (!a.needsAck) throw new BadRequestException('This announcement doesn’t ask for a confirmation.');
  const now = new Date();
  await prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: user.id } }, create: { announcementId: id, userId: user.id, ackAt: now }, update: { ackAt: now } });
  return { ackAt: now };
}
