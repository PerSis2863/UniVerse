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

describe('delays (M567)', () => {
  it('a Delay block gives its input back L seconds later, and linearises as e^(−sL)', async () => {
    const { newBlock, simulate } = await import('./blocks');
    const s = newBlock('step', 0, 0), dl = newBlock('delay', 0, 0), sc = newBlock('scope', 0, 0);
    s.p = { ...s.p, time: 0.2 }; dl.p = { time: 0.5, initial: -1 };
    const d = { stop: 2, dt: 0.01, blocks: [s, dl, sc], wires: [{ id: 'a', from: s.id, out: 0, to: dl.id, in: 0 }, { id: 'b', from: dl.id, out: 0, to: sc.id, in: 0 }] };
    const r = simulate(d), y = [...r.scopes.values()][0][0], at = (t: number) => y[r.t.findIndex((x) => x >= t - 1e-9)];
    expect(at(0.1)).toBe(-1);
    expect(at(0.6)).toBe(0);
    expect(at(0.75)).toBe(1);
    const l = linearize(d, s.id, dl.id), w = 1.3;
    // |e^(−jwL)| = 1 and its phase −wL, from the Padé form.
    const re = (p: number[]) => p.reduce((acc, c) => { const [a, b] = acc; return [a * 0 - b * w + c, a * w + b * 0]; }, [0, 0]);
    const [nr, ni] = re(l.num), [dr, di] = re(l.den), mag = Math.hypot(nr, ni) / Math.hypot(dr, di), ph = Math.atan2(ni, nr) - Math.atan2(di, dr);
    expect(mag).toBeCloseTo(1, 6);
    expect(Math.atan2(Math.sin(ph), Math.cos(ph))).toBeCloseTo(-w * 0.5, 4);
  });
});
