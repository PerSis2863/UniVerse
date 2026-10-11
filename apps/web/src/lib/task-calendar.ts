// Task board calendar and timeline (Stage 5 · B9.8): the date maths, in the reader's local time.

/** A day as "YYYY-MM-DD" (local). */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The six weeks shown for a month, Monday first: 42 days starting on or before the 1st. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const back = (first.getDay() + 6) % 7; // days since Monday
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - back + i));
}

/** The Monday of the week a day falls in (local midnight). */
export function weekStart(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const DAY = 86_400_000;
/** Whole days from a to b (local dates; daylight-saving changes don't matter). */
export function daysBetween(a: Date, b: Date) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
}

/**
 * Where a task's bar sits on a timeline that starts on `start` and is `days` long: from when it was
 * made (or a day before its due date, if made after it) to its due date, cut to the visible range.
 * Null when it's entirely outside, or has no due date.
 */
export function barSpan(created: Date, due: Date | null, start: Date, days: number): { from: number; to: number; cutStart: boolean; cutEnd: boolean } | null {
  if (!due) return null;
  const to = daysBetween(start, due);
  let from = daysBetween(start, created);
  if (from > to) from = to - 1;
  if (to < 0 || from >= days) return null;
  return { from: Math.max(0, from), to: Math.min(days - 1, to), cutStart: from < 0, cutEnd: to > days - 1 };
}

/** A due date moved to another day, keeping its time of day (or 17:00 when it had none). */
export function moveDue(oldIso: string | null, day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const old = oldIso ? new Date(oldIso) : null;
  return new Date(y, m - 1, d, old ? old.getHours() : 17, old ? old.getMinutes() : 0).toISOString();
}
