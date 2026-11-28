import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/interp';
import { EXAMPLES } from './blocks';
import { systune } from './systune';

void Lab;
describe('tuning every loop at once (M572)', () => {
  it('meets the margins on every loop, keeps the loop stable and tracks at least as well as loop by loop', () => {
    const d = EXAMPLES.find((e) => e.id === 'twoloops')!.make();
    const r = systune(d, { type: 'PI', pm: 60 });
    expect(r.stable).toBe(true);
    expect(r.hard).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.soft).toBeLessThanOrEqual(r.startSoft * 1.0001 + (r.startHard > 1 ? 100 : 0));
    for (const l of r.loops) expect(l.Pm).toBeGreaterThanOrEqual(60 - 1e-3);
  });
  it('tunes a PIDF’s filter time too (a fixed fast filter can’t roll off)', () => {
    const d = EXAMPLES.find((e) => e.id === 'twoloops')!.make(), r = systune(d, { type: 'PIDF', pm: 60, N: 100 });
    expect(r.stable).toBe(true);
    expect(r.hard).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.startHard).toBeGreaterThan(2);
    expect(r.soft).toBeLessThan(r.startSoft);
  }, 30_000);
});
