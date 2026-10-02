import prisma from '@/lib/db';

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
  const mine = { OR: [{ teacherId: userId }, { enrollments: { some: { studentId: userId } } }] };

  const [courses, events] = await Promise.all([
    prisma.course.findMany({
      where: mine,
      take: 60,
      select: {
        code: true, name: true, teacherId: true,
        timetableSlots: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true, type: true, createdAt: true, room: { select: { name: true } } } },
        quizzes: { where: { dueDate: { gte: since, lte: until }, status: { not: 'CLOSED' } }, select: { id: true, title: true, dueDate: true, status: true } },
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
    const teaching = c.teacherId === userId;
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

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
