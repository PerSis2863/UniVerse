// A person's own clock (time zone from their browser): their day, hour and minute at a moment.
// Used by the daily brief (src/server/daily-brief.ts) and quiet hours (src/server/quiet-hours.ts).

/** A time zone name the runtime knows, or UTC. */
export function validZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}

/** A moment's wall clock in a time zone. */
export function wallClock(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour), min: Number(p.minute) };
}

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Whether "HH:MM" `now` falls between start and end (an overnight span like 22:00–07:00 works). */
export function within(start: string, end: string, nowMin: number) {
  const s = minutesOf(start), e = minutesOf(end);
  if (s === e) return false;
  return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}
