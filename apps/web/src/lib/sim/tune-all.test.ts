import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/interp';
import { EXAMPLES } from './blocks';
import { closedLoopStable, plantSeenBy, tuneAll } from './tune-all';

void Lab;
describe('tuning loops together (M568)', () => {
  const d = EXAMPLES.find((e) => e.id === 'twoloops')!.make();
  it('each loop sees the other one: with loop 2 closed, loop 1’s plant isn’t just 1/(s+1)', () => {
    const c1 = d.blocks.filter((b) => b.kind === 'pid')[0].id, G = plantSeenBy(d, c1), val = (p: number[], s: number) => p.reduce((a, c) => a * s + c, 0);
    expect(Math.abs(val(G.n, 0) / val(G.d, 0) - 1)).toBeGreaterThan(0.05);
  });
  it('tunes both, every loop keeps its margin with the other closed, the whole thing is stable', () => {
    const r = tuneAll(d, { type: 'PI', pm: 60 });
    expect(r.loops.length).toBe(2);
    // Rounds stop once no gain moves by 1 %, so each margin is within a degree or two of the 60 asked for.
    for (const l of r.loops) expect(Math.abs(l.Pm - 60)).toBeLessThan(2);
    expect(r.stable).toBe(true);
    expect(r.rounds).toBeLessThanOrEqual(20);
    const f = tuneAll(d, { type: 'PIDF', pm: 60 });
    expect(f.settled).toBe(true);
    for (const l of f.loops) expect(Math.abs(l.Pm - 60)).toBeLessThan(3);
  });
  it('the starting diagram is stable too, and a wildly high gain isn’t', () => {
    expect(closedLoopStable(d).stable).toBe(true);
    const hot = { ...d, blocks: d.blocks.map((b) => (b.kind === 'pid' ? { ...b, p: { ...b.p, Kp: -5 } } : b)) };
    expect(closedLoopStable(hot).stable).toBe(false);
  });
});
