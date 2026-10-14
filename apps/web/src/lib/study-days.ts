// Calendar days for study streaks (src/server/streaks.ts), with no database, so the light API path
// (cloudflare/fast-lists.ts) can use them too.

/** YYYY-MM-DD in a time zone (falls back to UTC for unknown zones). */
export function dayIn(timeZone: string | undefined, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** The calendar day before a YYYY-MM-DD day. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const timeZoneOf = (req: Request) => (req as Request & { cf?: { timezone?: string } }).cf?.timezone;

/** The 7 days ending today, oldest first. */
export function lastWeek(today: string) {
  const days = [today];
  for (let i = 0; i < 6; i++) days.unshift(dayBefore(days[0]));
  return days;
}
