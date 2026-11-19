// M345 (Zoom's, Meet's and Teams' recurring meetings): when a meeting repeats. Each date becomes its own scheduled call
// (its own reminder, Join button and calendar entry), so cancelling one leaves the rest. Ten at most at a time.

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';
export const REPEATS: Repeat[] = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'];
export const MAX_TIMES = 10;

/** The start of every meeting in the series, the first included (same clock time each day). */
export function repeatDates(start: Date, repeat: Repeat, times: number): Date[] {
  const n = Math.max(1, Math.min(MAX_TIMES, Math.round(times) || 1));
  const out: Date[] = [new Date(start)];
  const d = new Date(start);
  while (out.length < n) {
    if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + (repeat === 'weekly' ? 7 : repeat === 'biweekly' ? 14 : 1));
    if (repeat === 'weekdays' && (d.getUTCDay() === 0 || d.getUTCDay() === 6)) continue;
    out.push(new Date(d));
  }
  return out;
}

export const repeatLabel = (r: Repeat) => ({ daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' })[r];
