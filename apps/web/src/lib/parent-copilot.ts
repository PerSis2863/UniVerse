import { wallClock } from './local-time';

// Stage 5 · D16, the parent co-pilot: the rules, with no database (tested). A parent's weekly summary
// is written from a child's week as the school's records show it (grades, attendance, work due and
// late, achievements, report cards): never from messages. Weekdays run 0 = Monday … 6 = Sunday.

export const QUESTIONS_A_DAY = 10;
export const MAX_QUESTION = 300;
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface WeekFacts {
  child: string;
  /** The 7 days covered (YYYY-MM-DD). */
  from: string; to: string;
  grades: { course: string; title: string; percent: number }[];
  attendance: { present: number; late: number; absent: number; excused: number };
  absences: { course: string; date: string }[];
  due: { course: string; title: string; kind: 'assignment' | 'quiz' | 'exam' | 'deadline'; at: string }[];
  late: { course: string; title: string; due: string }[];
  /** The overall average now and a week earlier (percent), when there are grades. */
  average: number | null; averageBefore: number | null;
  achievements: string[];
  reportCards: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 new grades · 1 absence · 3 things due" (nothing to say: an empty string). */
export function factsLine(f: WeekFacts) {
  return [
    f.grades.length ? `${plural(f.grades.length, 'new grade')}` : null,
    f.attendance.absent ? plural(f.attendance.absent, 'absence') : null,
    f.late.length ? `${plural(f.late.length, 'piece')} of work late` : null,
    f.due.length ? `${plural(f.due.length, 'thing')} due` : null,
    f.achievements.length ? plural(f.achievements.length, 'achievement') : null,
  ].filter(Boolean).join(' · ');
}

/** Whether the week has anything in it worth a summary. */
export const quietWeek = (f: WeekFacts) => !f.grades.length && !f.due.length && !f.late.length && !f.achievements.length && !f.reportCards.length
  && !(f.attendance.present + f.attendance.late + f.attendance.absent + f.attendance.excused);

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The summary in plain English, written from the facts alone (used when AI isn't available). */
export function templateSummary(f: WeekFacts): string {
  if (quietWeek(f)) return `A quiet week for ${f.child}: no new grades, classes marked or work due in the school's records.`;
  const out: string[] = [];
  const marked = f.attendance.present + f.attendance.late + f.attendance.absent;
  if (marked) {
    out.push(f.attendance.absent
      ? `${f.child} was marked present at ${f.attendance.present + f.attendance.late} of ${marked} classes this week, and absent at ${f.attendance.absent}${f.absences.length ? ` (${list([...new Set(f.absences.map((a) => a.course))])})` : ''}.`
      : `${f.child} was at all ${marked} classes marked this week${f.attendance.late ? `, late to ${f.attendance.late}` : ''}.`);
  }
  if (f.grades.length) {
    const best = [...f.grades].sort((a, b) => b.percent - a.percent)[0];
    out.push(`${plural(f.grades.length, 'new grade')}: ${list(f.grades.slice(0, 4).map((g) => `${g.percent}% in ${g.course} (${g.title})`))}${f.grades.length > 4 ? ', and more' : ''}.${f.grades.length > 1 ? ` The best was ${best.course}.` : ''}`);
  }
  if (f.average != null && f.averageBefore != null && f.average !== f.averageBefore) {
    out.push(`The overall average went ${f.average > f.averageBefore ? 'up' : 'down'} from ${f.averageBefore}% to ${f.average}%.`);
  } else if (f.average != null) out.push(`The overall average is ${f.average}%.`);
  if (f.late.length) out.push(`Still to hand in, past the deadline: ${list(f.late.slice(0, 3).map((l) => `${l.title} (${l.course})`))}.`);
  if (f.due.length) out.push(`Coming up: ${list(f.due.slice(0, 3).map((d) => `${d.title} (${d.course})`))}${f.due.length > 3 ? `, and ${f.due.length - 3} more` : ''}.`);
  if (f.achievements.length) out.push(`Well done for ${list(f.achievements.slice(0, 2))}.`);
  if (f.reportCards.length) out.push(`A new report card is ready: ${f.reportCards[0]}.`);
  return out.join(' ');
}

/** The Monday of the week a date is in (YYYY-MM-DD): the weekly summary's key. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** The UTC moment it's `hour`:00 on the local day `add` days after `from`'s, in this time zone. */
function localAt(tz: string, from: number, add: number, hour: number) {
  const w = wallClock(new Date(from), tz);
  const guess = Date.UTC(w.y, w.m - 1, w.d + add, hour, 0);
  const g = wallClock(new Date(guess), tz);
  const offset = Date.UTC(g.y, g.m - 1, g.d, g.hour, g.min) - Math.floor(guess / 60_000) * 60_000;
  return guess - offset;
}

/** The next time it's `weekday` at `hour`:00 in this time zone, after `from`. */
export function nextWeekly(tz: string, weekday: number, hour: number, from = Date.now()): Date {
  for (let add = 0; add < 8; add++) {
    const at = localAt(tz, from, add, hour);
    const w = wallClock(new Date(at), tz);
    const dow = (new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay() + 6) % 7;
    if (dow === weekday && at > from) return new Date(at);
  }
  return new Date(from + 7 * 86_400_000);
}

/** A question as asked: one line, trimmed; null when it's too short to answer. */
export function cleanQuestion(q: unknown): string | null {
  const s = typeof q === 'string' ? q.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION) : '';
  return s.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 ? s : null;
}

/** The records an answer may name as its sources (anything else the AI says is dropped). */
export function cleanUsed(used: unknown, courses: string[]): string[] {
  const allowed = new Set(['Grades', 'Attendance', 'Work due', 'Late work', 'Report cards', 'Achievements', ...courses]);
  return Array.isArray(used) ? [...new Set(used.filter((u): u is string => typeof u === 'string' && allowed.has(u)))].slice(0, 5) : [];
}
