// M143: how many things happened on each of the last `days` days (oldest first, today last), per key,
// in the viewer's time zone (`tz`: minutes east of UTC). The courses page's small charts.

export function dailyCounts(items: { key: string; at: Date }[], keys: string[], days: number, now: number, tz: number): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, new Array<number>(days).fill(0)]));
  const dayOf = (t: number) => Math.floor((t + tz * 60_000) / 86_400_000);
  const today = dayOf(now);
  for (const it of items) {
    const ago = today - dayOf(it.at.getTime());
    if (ago >= 0 && ago < days && out[it.key]) out[it.key][days - 1 - ago]++;
  }
  return out;
}
