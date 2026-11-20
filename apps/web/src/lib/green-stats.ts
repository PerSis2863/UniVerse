// M359: the numbers on Green's redesigned home, from the year of kg-per-day the server already sends (`year`).

/** kg saved in a calendar month (UTC), from a day → kg map. `offset` 0 is this month, -1 the one before. */
export function monthKg(year: Record<string, number>, now: number, offset = 0) {
  const d = new Date(now), y = d.getUTCFullYear(), m = d.getUTCMonth() + offset;
  const key = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  let kg = 0;
  for (const [day, v] of Object.entries(year)) if (day.startsWith(key)) kg += v;
  return Math.round(kg * 10) / 10;
}

/** The change from one number to another in whole percent, or null when there's nothing to compare with. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/** The last `n` months' kg, oldest first, with a short label ("Nov"). */
export function months(year: Record<string, number>, now: number, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const off = i - (n - 1), d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + off, 1));
    return { label: d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }), kg: monthKg(year, now, off) };
  });
}

/** Actions as a spreadsheet (CSV) for "Download". */
export function actionsCsv(rows: { createdAt: string; kind: string; amount: number; units: string; co2Kg: number; note: string | null; verifiedAt: string | null }[]) {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ['Date,What,Amount,Unit,CO2 saved (kg),Note,Confirmed',
    ...rows.map((r) => [r.createdAt.slice(0, 10), r.kind, String(r.amount), r.units, String(r.co2Kg), q(r.note ?? ''), r.verifiedAt ? 'yes' : 'no'].join(','))].join('\n');
}
