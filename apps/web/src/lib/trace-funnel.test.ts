import { describe, expect, it } from 'vitest';
import { biggestDrop, funnelSteps } from './trace-funnel';

describe('the scan funnel', () => {
  it('gives each step’s share of all and of the step before', () => {
    const s = funnelSteps({ scanned: 200, sold: 120, owned: 30, warranted: 24, reviewed: 6 });
    expect(s.map((x) => [x.n, x.ofAll, x.ofBefore])).toEqual([[200, 100, 100], [120, 60, 60], [30, 15, 25], [24, 12, 80], [6, 3, 25]]);
    expect(biggestDrop(s)?.key).toBe('owned');
  });
  it('waits for enough scans and survives zeros', () => {
    expect(biggestDrop(funnelSteps({ scanned: 5, sold: 1, owned: 0, warranted: 0, reviewed: 0 }))).toBeNull();
    expect(funnelSteps({ scanned: 0, sold: 0, owned: 0, warranted: 0, reviewed: 0 }).every((x) => x.ofAll === 0)).toBe(true);
  });
});
