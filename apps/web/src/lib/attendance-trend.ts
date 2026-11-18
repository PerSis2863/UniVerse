// Attendance trends (M297): a student's attendance week by week, and whether it is falling, for the
// parent app and the alerts parents get in it (src/server/attendance-plus.ts).

type Row = { date: Date; status: string };
export type WeekRate = { week: string; rate: number | null; counted: number };

const DAY = 86_400_000;
const mondayUtc = (t: number) => { const d = new Date(t); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY; };

/** The last `weeks` weeks (oldest first): the share of counted classes attended (present or late; excused not counted). */
export function weeklyRates(rows: Row[], weeks = 8, now = Date.now()): WeekRate[] {
  const thisWeek = mondayUtc(now);
  return Array.from({ length: weeks }, (_, i) => {
    const start = thisWeek - (weeks - 1 - i) * 7 * DAY, end = start + 7 * DAY;
    const mine = rows.filter((r) => r.status !== 'EXCUSED' && r.date.getTime() >= start && r.date.getTime() < end);
    const attended = mine.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    return { week: new Date(start).toISOString().slice(0, 10), rate: mine.length ? Math.round((attended / mine.length) * 100) : null, counted: mine.length };
  });
}

/** Falling: the last two weeks with classes average 15 points or more below the weeks before them (at least 4 classes each side). */
export function falling(rates: WeekRate[]): { from: number; to: number } | null {
  const had = rates.filter((r) => r.rate !== null && r.counted > 0);
  if (had.length < 3) return null;
  const recent = had.slice(-2), before = had.slice(0, -2).slice(-4);
  const n = (xs: WeekRate[]) => xs.reduce((s, r) => s + r.counted, 0);
  if (n(recent) < 4 || n(before) < 4) return null;
  const avg = (xs: WeekRate[]) => Math.round(xs.reduce((s, r) => s + (r.rate ?? 0) * r.counted, 0) / n(xs));
  const from = avg(before), to = avg(recent);
  return from - to >= 15 ? { from, to } : null;
}

export const ALERT_CHOICES = ['EACH', 'OFTEN', 'NONE'] as const;
export type AlertChoice = (typeof ALERT_CHOICES)[number];
