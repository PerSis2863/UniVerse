// The landing's live totals (M44): counted once a day (src/server/site-totals.ts) and shown rounded
// down, so no single person's action can be told apart. A total under 10 isn't shown at all.

export const TOTAL_KEYS = ['people', 'co2Kg', 'helped', 'games', 'scans'] as const;
export type TotalKey = (typeof TOTAL_KEYS)[number];
export type Totals = Partial<Record<TotalKey, number>>;

/** Down to two significant figures and to tens at least (1,234 → 1,200; 87 → 80); 0 under 10. */
export function roundDown(n: number): number {
  if (!Number.isFinite(n) || n < 10) return 0;
  const step = 10 ** Math.max(1, Math.floor(Math.log10(n)) - 1);
  return Math.floor(n / step) * step;
}

/** How a rounded total reads: 1,200+ up to 9,999, then 12K+, 1.2M+. */
export function totalLabel(n: number): string {
  return `${n < 10_000 ? n.toLocaleString('en-US') : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}+`;
}
