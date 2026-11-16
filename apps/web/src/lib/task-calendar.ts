// Task board calendar and timeline (Stage 5 · B9.8): the date maths, in the reader's local time.

/** A day as "YYYY-MM-DD" (local). */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The six weeks shown for a month, Monday first (or Sunday, `first` 0): 42 days starting on or before the 1st. */
export function monthGrid(year: number, month: number, first: 0 | 1 = 1): Date[] {
  const back = (new Date(year, month, 1).getDay() + 7 - first) % 7; // days since the week began
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - back + i));
}

/** The Monday (or Sunday, `first` 0) of the week a day falls in (local midnight). */
export function weekStart(d: Date, first: 0 | 1 = 1) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 7 - first) % 7));
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

/** M230: a card's dates moved by whole days (dragging its Gantt bar): the start (when it has one) and the due date. */
export function shiftDates(startIso: string | null, dueIso: string, days: number) {
  const add = (iso: string) => { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); };
  return { startAt: startIso ? add(startIso) : null, dueAt: add(dueIso) };
}

/** M230: minutes as "1 h 20 min", "45 min", "3 h". */
export function hoursText(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/** M230: what a time field holds ("1:30", "1h 30m", "90m", "1.5", "45 min") as minutes; null when it isn't a time. */
export function parseMinutes(s: string): number | null {
  const t = s.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):([0-5]\d)$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?$/)) && (m[1] || m[2])) return Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  if ((m = t.match(/^\d+(?:\.\d+)?$/))) return Math.round(Number(t) * 60);
  return null;
}
