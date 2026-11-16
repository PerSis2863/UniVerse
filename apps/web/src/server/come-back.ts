import prisma from '@/lib/db';
import { notify, notifyMany } from './email';
import { pushService } from './services/push.service';

// M197: reasons to come back, in the app and by push (no emails). Two daily-job steps:
//  - "Due soon": an assignment due within two days, once: its students who haven't handed it in are
//    reminded (in the app and by push), and its teacher is told who they are (first names).
//  - "Your week": on Mondays, each student who used UniVerse in the last 30 days gets their week in
//    one line (work handed in, work due this week), in the app only.

const DAY = 86_400_000;
const first = (name: string) => name.trim().split(/\s+/)[0] || 'A student';

/** Due-soon reminders for up to `limit` assignments. Returns how many were looked at and how many people were reminded. */
export async function dueSoonNudges(limit = 5, now = new Date()) {
  const soon = await prisma.assignment.findMany({
    where: { status: 'OPEN', nudgedAt: null, dueDate: { gt: now, lte: new Date(now.getTime() + 2 * DAY) } },
    orderBy: { dueDate: 'asc' }, take: limit,
    select: { id: true, title: true, dueDate: true, courseId: true, course: { select: { code: true, teacherId: true } } },
  });
  let sent = 0;
  for (const a of soon) {
    // Claimed first, so two runs never remind twice.
    const claimed = await prisma.assignment.updateMany({ where: { id: a.id, nudgedAt: null }, data: { nudgedAt: now } });
    if (!claimed.count) continue;
    const [enrolled, handed] = await Promise.all([
      prisma.enrollment.findMany({ where: { courseId: a.courseId, student: { status: 'ACTIVE' } }, select: { studentId: true, student: { select: { name: true } } }, take: 500 }),
      prisma.assignmentSubmission.findMany({ where: { assignmentId: a.id }, select: { studentId: true }, take: 500 }),
    ]);
    const done = new Set(handed.map((h) => h.studentId));
    const missing = enrolled.filter((e) => !done.has(e.studentId));
    if (!missing.length) continue;
    const when = dueLabel(a.dueDate!, now);
    const ids = missing.map((m) => m.studentId);
    const title = `“${a.title.slice(0, 80)}” is ${when}`;
    const body = `${a.course.code}: you haven’t handed it in yet.`;
    sent += await notifyMany(ids, { title, body, link: '/student/assignments', type: 'warning', email: false, courseId: a.courseId });
    for (let i = 0; i < ids.length; i += 90) await pushService.sendToMany(ids.slice(i, i + 90), { title, body, url: '/student/assignments', tag: `due-${a.id}` }).catch(() => 0);
    const names = missing.slice(0, 5).map((m) => first(m.student.name)).join(', ') + (missing.length > 5 ? ` and ${missing.length - 5} more` : '');
    await notify(a.course.teacherId, { title: `${missing.length} of ${enrolled.length} haven’t handed in “${a.title.slice(0, 80)}”`, body: `${a.course.code}, ${when}: ${names}.`, link: '/teacher/assignments', type: 'info', email: false, courseId: a.courseId });
  }
  return { checked: soon.length, sent };
}

/** "due within a day" or "due in two days", from the hours left. */
export function dueLabel(due: Date, now: Date) {
  return due.getTime() - now.getTime() <= DAY ? 'due within a day' : 'due in two days';
}

/** One student's week in a line, or null when there's nothing to say. */
export function weekLine(handedIn: number, dueThisWeek: number) {
  if (!handedIn && !dueThisWeek) return null;
  const done = handedIn ? `Last week you handed in ${handedIn} piece${handedIn === 1 ? '' : 's'} of work.` : 'Nothing handed in last week.';
  const ahead = dueThisWeek ? ` ${dueThisWeek} ${dueThisWeek === 1 ? 'is' : 'are'} due this week.` : ' Nothing is due this week.';
  return done + ahead;
}

/**
 * "Your week" for students, on Mondays (UTC), a page at a time while `room()` allows (about three
 * queries each). `cursor`: the last student done today.
 */
export async function weeklyProgress(cursor: string | null, room: () => number, now = new Date()) {
  if (now.getUTCDay() !== 1) return { done: true, cursor, info: 0 };
  let sent = 0;
  for (;;) {
    const page = await prisma.user.findMany({
      where: { role: 'STUDENT', status: 'ACTIVE', lastSeenAt: { gte: new Date(now.getTime() - 30 * DAY) }, enrollments: { some: {} }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' }, take: 10, select: { id: true },
    });
    if (!page.length) return { done: true, cursor, info: sent };
    for (const s of page) {
      if (room() < 8) return { done: false, cursor, info: sent };
      const [handedIn, due] = await Promise.all([
        prisma.assignmentSubmission.count({ where: { studentId: s.id, submittedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
        prisma.assignment.count({ where: { status: 'OPEN', dueDate: { gt: now, lte: new Date(now.getTime() + 7 * DAY) }, course: { enrollments: { some: { studentId: s.id } } }, submissions: { none: { studentId: s.id } } } }),
      ]);
      const line = weekLine(handedIn, due);
      if (line) { await notify(s.id, { title: 'Your week', body: line, link: '/student/assignments', type: 'info', email: false }); sent++; }
      cursor = s.id;
    }
  }
}
