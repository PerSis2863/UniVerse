import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './blocks';
import { linearize, ssToTf } from './linearize';

const val = (p: number[], s: number) => p.reduce((a, c) => a * s + c, 0);
const H = (l: { num: number[]; den: number[] }, s: number) => val(l.num, s) / val(l.den, s);

describe('linearising a diagram', () => {
  const dg = EXAMPLES.find((e) => e.id === 'cruise')!.make(), id = (k: string) => dg.blocks.find((b) => b.kind === k)!.id;
  it('the cruise model, opened at the PID: the car is 1/(1000 s + 50)', () => {
    const l = linearize(dg, id('pid'), id('tf'));
    for (const s of [0.1, 1, 3]) expect(H(l, s)).toBeCloseTo(1 / (1000 * s + 50), 8);
  });
  it('seen from the PID’s input, the plant comes back with a minus (the error falls as the push grows)', () => {
    const l = linearize(dg, id('pid'), id('sum'));
    expect(H(l, 0.5)).toBeCloseTo(-1 / (1000 * 0.5 + 50), 8);
  });
  it('a saturation pinned at its limit passes nothing', () => {
    const d2 = { ...dg, blocks: dg.blocks.map((b) => (b.kind === 'saturation' ? { ...b, p: { lower: 100, upper: 200 } } : b)) };
    expect(H(linearize(d2, id('pid'), id('tf')), 1)).toBeCloseTo(0, 10);
  });
  it('ss to tf: a mass on a spring', () => {
    const t = ssToTf([[0, 1], [-4, -0.4]], [0, 1], [1, 0], 0);
    expect(t.den.map((v) => +v.toFixed(9))).toEqual([1, 0.4, 4]);
    expect(t.num.map((v) => +v.toFixed(9))).toEqual([0, 0, 1]);
  });
});
