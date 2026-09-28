/** Groups rows into calendar months (UTC), summing `value` per month. */
export function byMonth<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number = () => 1) {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const key = date(r).toISOString().slice(0, 7);
    sums.set(key, (sums.get(key) ?? 0) + value(r));
  }
  return [...sums].map(([key, v]) => ({ month: new Date(`${key}-01T00:00:00Z`), value: v }));
}
