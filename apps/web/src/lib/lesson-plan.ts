// The term lesson planner (M293): every class of a course across the weeks of a term, from its
// timetable slots, each with a topic, goals, materials and homework. Pure date maths shared by the
// planner (src/components/dashboard/LessonPlanner.tsx) and the server (src/server/lesson-plans.ts).

export type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string; type: string };
export type LessonDate = { day: string; slotId: string; start: string; end: string; type: string; week: number };

export const MAX_WEEKS = 26;
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Monday of the week a date (YYYY-MM-DD) falls in. */
export function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday, as TimetableSlot.dayOfWeek
  return iso(t - dow * DAY);
}

/** Each class from the week of `from` for `weeks` weeks, in order (slots with a bad time are skipped). */
export function lessonDates(slots: Slot[], from: string, weeks: number): LessonDate[] {
  if (!DAY_RE.test(from)) return [];
  const start = Date.parse(`${mondayOf(from)}T00:00:00Z`);
  const n = Math.min(Math.max(Math.round(weeks) || 1, 1), MAX_WEEKS);
  const good = slots.filter((s) => s.dayOfWeek >= 0 && s.dayOfWeek <= 6 && TIME.test(s.startTime) && TIME.test(s.endTime));
  const out: LessonDate[] = [];
  for (let w = 0; w < n; w++) {
    for (const s of good) out.push({ day: iso(start + (w * 7 + s.dayOfWeek) * DAY), slotId: s.id, start: s.startTime, end: s.endTime, type: s.type, week: w + 1 });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));
}

/**
 * Spread a course's modules over its classes in order: each module gets an equal share (at least one class),
 * the first lessons of a module take its title, the rest "… (continued)". Lessons already planned keep theirs.
 */
export function spreadModules(lessons: { key: string; planned: boolean }[], modules: string[]): Map<string, string> {
  const free = lessons.filter((l) => !l.planned);
  const out = new Map<string, string>();
  if (!free.length || !modules.length) return out;
  const each = Math.max(1, Math.floor(free.length / modules.length));
  free.forEach((l, i) => {
    const m = Math.min(Math.floor(i / each), modules.length - 1);
    const first = i === m * each;
    out.set(l.key, first ? modules[m] : `${modules[m]} (continued)`);
  });
  return out;
}

export const lessonKey = (l: { day: string; slotId: string }) => `${l.day}|${l.slotId}`;
