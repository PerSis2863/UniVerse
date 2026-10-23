// Chat streaks (M17, after Snapchat): days in a row on which both people in a one-to-one chat sent
// something. A streak still counts if today is quiet so far; a missed day ends it. Days are UTC.

/** rows: one per chat and day with how many different people wrote; today: "YYYY-MM-DD". */
export function streaksFrom(rows: { c: string; d: string; n: number }[], today: string): Record<string, number> {
  const both = new Map<string, Set<string>>();
  for (const r of rows) if (r.n >= 2) (both.get(r.c) ?? both.set(r.c, new Set()).get(r.c)!).add(r.d);
  const day = (d: string, back: number) => new Date(Date.parse(`${d}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
  const out: Record<string, number> = {};
  for (const [c, days] of both) {
    let back = days.has(today) ? 0 : 1;
    let n = 0;
    while (days.has(day(today, back))) { n++; back++; }
    if (n >= 2) out[c] = n; // one day isn't a streak yet
  }
  return out;
}
