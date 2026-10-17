// Times for the home pages (Stage 5 · Q8), with no database, so the light API path can use them:
// timetable slots are "HH:MM" in the school's own time, and "today" is the viewer's day.

/** A time zone the browser sent, if it's a real one; else undefined. */
export function cleanTimeZone(tz: unknown): string | undefined {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return undefined;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return undefined; }
}

/** How far a time zone is ahead of UTC at a moment, in ms. */
export function zoneOffsetMs(timeZone: string | undefined, at: number): number {
  if (!timeZone) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second')) - Math.floor(at / 1000) * 1000;
  } catch { return 0; }
}

/** The moment a local day and "HH:MM" happen in a time zone (ms). */
export function localTime(day: string, hhmm: string, timeZone: string | undefined): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // Two passes, so a day when the clocks change still lands on the right hour.
  const first = naive - zoneOffsetMs(timeZone, naive);
  return naive - zoneOffsetMs(timeZone, first);
}

/** When a local day starts and ends in a time zone (ms). */
export function dayBounds(day: string, timeZone: string | undefined) {
  const start = localTime(day, '00:00', timeZone) ?? Date.parse(`${day}T00:00:00Z`);
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = localTime(next.toISOString().slice(0, 10), '00:00', timeZone) ?? start + 86_400_000;
  return { start, end };
}

/** The first day of the month a local day is in. */
export const monthStart = (day: string) => `${day.slice(0, 8)}01`;

/** Monday (0) to Sunday (6) for a local day, as timetable slots store it. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}
