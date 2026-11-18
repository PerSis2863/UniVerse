// Trace's scan funnel (M307): of the units people scanned in a period, how many were then sold (a shop
// claimed them), got an owner, a warranty and a review. Each step's share of the first and of the step
// before, so a brand sees where people stop.

export type FunnelCounts = { scanned: number; sold: number; owned: number; warranted: number; reviewed: number };
export const FUNNEL_STEPS: { key: keyof FunnelCounts; label: string }[] = [
  { key: 'scanned', label: 'Scanned' },
  { key: 'sold', label: 'Sold in a shop' },
  { key: 'owned', label: 'Owner registered' },
  { key: 'warranted', label: 'Warranty' },
  { key: 'reviewed', label: 'Review' },
];

export function funnelSteps(c: FunnelCounts) {
  const first = c.scanned || 0;
  return FUNNEL_STEPS.map((s, i) => {
    const n = Math.max(0, c[s.key] || 0);
    const before = i ? Math.max(0, c[FUNNEL_STEPS[i - 1].key] || 0) : n;
    return { ...s, n, ofAll: first ? Math.round((n / first) * 100) : 0, ofBefore: before ? Math.round((n / before) * 100) : 0 };
  });
}

/** The step with the biggest drop from the one before (where to look first), once there are 20 scans. */
export function biggestDrop(steps: ReturnType<typeof funnelSteps>) {
  if ((steps[0]?.n ?? 0) < 20) return null;
  return steps.slice(1).reduce<(typeof steps)[number] | null>((worst, s) => (!worst || s.ofBefore < worst.ofBefore ? s : worst), null);
}

export const FUNNEL_DAYS = [30, 90, 365] as const;
