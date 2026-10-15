import { feedBlocks } from './smart-planner';
import prisma from '@/lib/db';
import { courseAccess, taughtBy } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';

// The calendar feed (/api/calendar/<token>): a person's weekly classes, quiz due dates, exams and
// deadlines as an iCalendar file that Google, Apple or Outlook Calendar subscribe to and re-read
// on their own. Two queries: the person's courses (taught or enrolled) with their timetable and
// quizzes, and their calendar events.

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Classes are stored as wall-clock times ("09:00") without a timezone, so they go out as floating
// times: each calendar app shows them at that time in the person's own zone.
const floating = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(h)}${pad(m)}00`;
};
const esc = (v: string) => v.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545 §3.1). */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const SLOT_TYPE: Record<string, string> = { LECTURE: 'Lecture', LAB: 'Lab', TUTORIAL: 'Tutorial' };

export async function calendarFeed(userId: string): Promise<string> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const until = new Date(now.getTime() + 365 * 86_400_000);
  const mine = { OR: [...taughtBy(userId).OR, { enrollments: { some: { studentId: userId } } }] };

  const [courses, events] = await Promise.all([
    prisma.course.findMany({
      where: mine,
      take: 60,
      select: {
        code: true, name: true, teacherId: true, staff: { where: { userId }, select: { id: true }, take: 1 },
        timetableSlots: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true, type: true, createdAt: true, room: { select: { name: true } } } },
        quizzes: { where: { dueDate: { gte: since, lte: until }, status: { not: 'CLOSED' } }, select: { id: true, title: true, dueDate: true, status: true } },
        // Stage 5 · B2: assignment due dates too.
        assignments: { where: { dueDate: { gte: since, lte: until }, status: 'OPEN' }, select: { id: true, title: true, dueDate: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: since, lte: until }, OR: [{ userId }, { course: mine }] },
      orderBy: { startAt: 'asc' },
      take: 300,
      select: { id: true, title: true, description: true, startAt: true, endAt: true, type: true, course: { select: { code: true } } },
    }),
  ]);

  const stamp = utc(now);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:UniVerse', 'X-WR-CALDESC:Your classes\\, quizzes and deadlines from UniVerse',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  const event = (uid: string, props: string[]) => lines.push('BEGIN:VEVENT', `UID:${uid}@universe`, `DTSTAMP:${stamp}`, ...props, 'END:VEVENT');

  for (const c of courses) {
    const teaching = c.teacherId === userId || c.staff.length > 0;
    // Weekly classes repeat with no end date: when a class is removed from the timetable it leaves
    // the feed, and calendars drop it at their next refresh.
    for (const s of c.timetableSlots) {
      if (!TIME.test(s.startTime) || !TIME.test(s.endTime) || s.dayOfWeek < 0 || s.dayOfWeek > 6) continue;
      const made = new Date(Date.UTC(s.createdAt.getUTCFullYear(), s.createdAt.getUTCMonth(), s.createdAt.getUTCDate()));
      const monday = new Date(made.getTime() - ((made.getUTCDay() + 6) % 7) * 86_400_000);
      const day = new Date(monday.getTime() + s.dayOfWeek * 86_400_000);
      event(`slot-${s.id}`, [
        `DTSTART:${floating(day, s.startTime)}`, `DTEND:${floating(day, s.endTime)}`, 'RRULE:FREQ=WEEKLY',
        `SUMMARY:${esc(`${c.code} ${c.name} · ${SLOT_TYPE[s.type] ?? s.type.toLowerCase()}`)}`,
        ...(s.room?.name ? [`LOCATION:${esc(s.room.name)}`] : []),
        'TRANSP:OPAQUE',
      ]);
    }
    // Students see published quizzes; the teacher also sees drafts that already have a due date.
    for (const q of c.quizzes) {
      if (!q.dueDate || (q.status !== 'PUBLISHED' && !teaching)) continue;
      event(`quiz-${q.id}`, [
        `DTSTART:${utc(new Date(q.dueDate.getTime() - 30 * 60_000))}`, `DTEND:${utc(q.dueDate)}`,
        `SUMMARY:${esc(`Quiz due: ${q.title} (${c.code})${q.status === 'DRAFT' ? ' · draft' : ''}`)}`,
        `DESCRIPTION:${esc(teaching ? 'Quiz due date for your course.' : 'Hand this quiz in on UniVerse before this time.')}`,
        'TRANSP:TRANSPARENT',
      ]);
    }
    for (const a of c.assignments) {
      if (!a.dueDate) continue;
      event(`assignment-${a.id}`, [
        `DTSTART:${utc(new Date(a.dueDate.getTime() - 30 * 60_000))}`, `DTEND:${utc(a.dueDate)}`,
        `SUMMARY:${esc(`Assignment due: ${a.title} (${c.code})`)}`,
        `DESCRIPTION:${esc(teaching ? 'Assignment due date for your course.' : 'Hand this in on UniVerse before this time.')}`,
        'TRANSP:TRANSPARENT',
      ]);
    }
  }

  for (const e of events) {
    const label = e.type === 'EXAM' ? 'Exam: ' : e.type === 'DEADLINE' ? 'Due: ' : '';
    const end = e.endAt > e.startAt ? e.endAt : new Date(e.startAt.getTime() + 30 * 60_000);
    event(`event-${e.id}`, [
      `DTSTART:${utc(e.startAt)}`, `DTEND:${utc(end)}`,
      `SUMMARY:${esc(`${label}${e.title}${e.course ? ` (${e.course.code})` : ''}`)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description.slice(0, 1000))}`] : []),
    ]);
  }

  // Study sessions from the smart planner, when the student turned that on (local times).
  for (const b of await feedBlocks(userId)) {
    const day = new Date(`${b.date}T00:00:00Z`);
    event(`study-${b.id}`, [
      `DTSTART:${floating(day, b.start)}`, `DTEND:${floating(day, b.end)}`,
      `SUMMARY:${esc(`${b.done ? '✓ ' : ''}Study: ${b.title}${b.courseCode ? ` (${b.courseCode})` : ''}`)}`,
      'TRANSP:OPAQUE',
    ]);
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ─── One course's calendar (Stage 5 · B2) ────────────────────────────────────────────────────

export type CourseCalendarItem = { id: string; kind: 'assignment' | 'quiz' | 'oral' | 'event' | 'call'; title: string; at: string; endAt: string | null; note: string | null; href: string | null };
export type CourseWeekly = { id: string; dayOfWeek: number; startTime: string; endTime: string; type: string; room: string | null; createdAt: string };

const DAY = 86_400_000;

/**
 * GET /api/courses/:id/calendar: everything dated in a course from two weeks ago to about half a
 * year ahead (assignment, quiz and oral due dates, events, scheduled class calls) and its weekly
 * classes. Students see published quizzes and open orals; the teaching team also sees drafts.
 */
export async function courseCalendar(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a) return null;
  const staff = a.canGrade;
  const now = Date.now();
  const since = new Date(now - 14 * DAY), until = new Date(now + 200 * DAY);
  const side = staff ? 'teacher' : 'student';
  const [slots, assignments, quizzes, orals, events, calls] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { courseId }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }], take: 40, select: { id: true, dayOfWeek: true, startTime: true, endTime: true, type: true, createdAt: true, room: { select: { name: true } } } }),
    prisma.assignment.findMany({ where: { courseId, dueDate: { gte: since, lte: until } }, orderBy: { dueDate: 'asc' }, take: 100, select: { id: true, title: true, dueDate: true, status: true } }),
    prisma.quiz.findMany({ where: { courseId, dueDate: { gte: since, lte: until }, ...(staff ? {} : { status: { not: 'DRAFT' } }) }, orderBy: { dueDate: 'asc' }, take: 100, select: { id: true, title: true, dueDate: true, status: true } }),
    prisma.oralCheck.findMany({ where: { courseId, dueAt: { gte: since, lte: until }, ...(staff ? {} : { status: 'OPEN' }) }, orderBy: { dueAt: 'asc' }, take: 50, select: { id: true, title: true, dueAt: true } }),
    prisma.calendarEvent.findMany({ where: { courseId, startAt: { gte: since, lte: until } }, orderBy: { startAt: 'asc' }, take: 200, select: { id: true, title: true, description: true, startAt: true, endAt: true, type: true } }),
    prisma.scheduledCall.findMany({ where: { courseId, startAt: { gte: since, lte: until } }, orderBy: { startAt: 'asc' }, take: 100, select: { id: true, title: true, kind: true, startAt: true, durationMin: true } }),
  ]);
  const iso = (d: Date) => d.toISOString();
  const EVENT_NOTE: Record<string, string> = { EXAM: 'Exam', DEADLINE: 'Deadline', MEETING: 'Session' };
  const items: CourseCalendarItem[] = [
    ...assignments.flatMap((x) => (x.dueDate ? [{ id: x.id, kind: 'assignment' as const, title: x.title, at: iso(x.dueDate), endAt: null, note: x.status === 'CLOSED' ? 'Closed' : 'Due', href: `/${side}/assignments/${x.id}` }] : [])),
    ...quizzes.flatMap((x) => (x.dueDate ? [{ id: x.id, kind: 'quiz' as const, title: x.title, at: iso(x.dueDate), endAt: null, note: x.status === 'DRAFT' ? 'Draft' : 'Due', href: `/${side}/quizzes` }] : [])),
    ...orals.flatMap((x) => (x.dueAt ? [{ id: x.id, kind: 'oral' as const, title: x.title, at: iso(x.dueAt), endAt: null, note: 'Oral due', href: `/${side}/blackboard?course=${courseId}&tab=orals` }] : [])),
    ...events.map((x) => ({ id: x.id, kind: 'event' as const, title: x.title, at: iso(x.startAt), endAt: x.endAt > x.startAt ? iso(x.endAt) : null, note: x.description ? `${EVENT_NOTE[x.type] ?? 'Event'} · ${x.description.slice(0, 120)}` : EVENT_NOTE[x.type] ?? 'Event', href: null })),
    ...calls.map((x) => ({ id: x.id, kind: 'call' as const, title: x.title, at: iso(x.startAt), endAt: iso(new Date(x.startAt.getTime() + x.durationMin * 60_000)), note: x.kind === 'audio' ? 'Voice class' : 'Video class', href: `/call/c_${courseId}?kind=${x.kind === 'audio' ? 'audio' : 'video'}` })),
  ].sort((p, q) => p.at.localeCompare(q.at));
  return {
    course: { id: a.course.id, code: a.course.code, name: a.course.name },
    canManage: a.canManage,
    weekly: slots.map((x) => ({ id: x.id, dayOfWeek: x.dayOfWeek, startTime: x.startTime, endTime: x.endTime, type: x.type, room: x.room?.name ?? null, createdAt: iso(x.createdAt) })),
    items,
  };
}

/** The same as an iCalendar file to download (weekly classes repeat; the rest are one-offs). */
export function courseCalendarIcs(cal: NonNullable<Awaited<ReturnType<typeof courseCalendar>>>): string {
  const stamp = utc(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Course calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(`${cal.course.code} ${cal.course.name}`)}`];
  const event = (uid: string, props: string[]) => lines.push('BEGIN:VEVENT', `UID:${uid}@universe`, `DTSTAMP:${stamp}`, ...props, 'END:VEVENT');
  const code = cal.course.code;
  for (const s of cal.weekly) {
    if (!TIME.test(s.startTime) || !TIME.test(s.endTime) || s.dayOfWeek < 0 || s.dayOfWeek > 6) continue;
    const made = new Date(s.createdAt);
    const start = new Date(Date.UTC(made.getUTCFullYear(), made.getUTCMonth(), made.getUTCDate()));
    const monday = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * DAY);
    const day = new Date(monday.getTime() + s.dayOfWeek * DAY);
    event(`slot-${s.id}`, [`DTSTART:${floating(day, s.startTime)}`, `DTEND:${floating(day, s.endTime)}`, 'RRULE:FREQ=WEEKLY', `SUMMARY:${esc(`${code} · ${SLOT_TYPE[s.type] ?? s.type.toLowerCase()}`)}`, ...(s.room ? [`LOCATION:${esc(s.room)}`] : [])]);
  }
  const LABEL: Record<CourseCalendarItem['kind'], string> = { assignment: 'Assignment due', quiz: 'Quiz due', oral: 'Oral due', event: '', call: 'Class call' };
  for (const i of cal.items) {
    const at = new Date(i.at);
    const due = i.kind === 'assignment' || i.kind === 'quiz' || i.kind === 'oral';
    const end = i.endAt ? new Date(i.endAt) : due ? at : new Date(at.getTime() + 30 * 60_000);
    const begin = due ? new Date(at.getTime() - 30 * 60_000) : at;
    event(`${i.kind}-${i.id}`, [`DTSTART:${utc(begin)}`, `DTEND:${utc(end)}`, `SUMMARY:${esc(`${LABEL[i.kind] ? `${LABEL[i.kind]}: ` : ''}${i.title} (${code})`)}`, ...(i.note && i.kind === 'event' ? [`DESCRIPTION:${esc(i.note)}`] : []), ...(due ? ['TRANSP:TRANSPARENT'] : [])]);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
