// This week on calls (M17, Calls → This week): minutes on calls each day for the last seven days
// (today last), the totals, the longest call and who you call most. Local days.

interface Row { at: string; durationSec: number | null; missed: boolean; answered: boolean; title: string; type: string }
const DAY = 86_400_000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function callInsights(rows: Row[], now: number) {
  const today = midnight(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ label: WEEKDAY[new Date(today - (6 - i) * DAY + DAY / 2).getDay()], minutes: 0 }));
  let calls = 0, missed = 0, longest = 0;
  const people = new Map<string, number>();
  for (const r of rows) {
    const t = Date.parse(r.at);
    const back = Math.round((today - midnight(t)) / DAY);
    if (!Number.isFinite(t) || back < 0 || back > 6) continue;
    calls++;
    if (r.missed) missed++;
    const sec = r.durationSec ?? 0;
    days[6 - back].minutes += Math.round(sec / 60);
    longest = Math.max(longest, sec);
    if (r.type === 'chat' && !r.missed) people.set(r.title, (people.get(r.title) ?? 0) + 1);
  }
  const best = [...people].sort((a, b) => b[1] - a[1])[0];
  return { days, minutes: days.reduce((a, d) => a + d.minutes, 0), calls, missed, longest, top: best ? { title: best[0], count: best[1] } : null };
}
