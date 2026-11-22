import { describe, expect, it } from 'vitest';
import { Circuit, parseSi, si, type Part } from './circuit';

describe('Hyperion Simulate: circuits (M410)', () => {
  it('a divider: 10 V across 1 kΩ and 2 kΩ gives 6.67 V', () => {
    const c = new Circuit([
      { id: 'v', kind: 'V', a: 'in', b: '0', value: 10, wave: 'dc', freq: 0 },
      { id: 'r1', kind: 'R', a: 'in', b: 'mid', value: 1000 },
      { id: 'r2', kind: 'R', a: 'mid', b: '0', value: 2000 },
    ]).dc();
    expect(c.v('mid')).toBeCloseTo(20 / 3, 6);
    expect(c.current(c.parts[1])).toBeCloseTo(10 / 3000, 9);
    expect(c.current(c.parts[0])).toBeCloseTo(-10 / 3000, 9); // the battery pushes current out of its + end
  });
  it('RC: a capacitor charges to V(1 − e^(−t/RC))', () => {
    const c = new Circuit([
      { id: 'v', kind: 'V', a: 'in', b: '0', value: 5, wave: 'dc', freq: 0 },
      { id: 'r', kind: 'R', a: 'in', b: 'out', value: 1000 },
      { id: 'c', kind: 'C', a: 'out', b: '0', value: 1e-6 },
    ]);
    for (let i = 0; i < 100; i++) c.step(1e-5);
    expect(c.t).toBeCloseTo(1e-3, 12);
    expect(c.v('out')).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
    expect(c.current(c.parts[2])).toBeCloseTo((5 * Math.exp(-1)) / 1000, 4);
  });
  it('RLC: rings at √(1/LC − (R/2L)²) and dies away at R/2L', () => {
    const parts: Part[] = [
      { id: 'v', kind: 'V', a: 'in', b: '0', value: 1, wave: 'dc', freq: 0 },
      { id: 'r', kind: 'R', a: 'in', b: 'x', value: 10 },
      { id: 'l', kind: 'L', a: 'x', b: 'y', value: 10e-3 },
      { id: 'c', kind: 'C', a: 'y', b: '0', value: 1e-6 },
    ];
    const c = new Circuit(parts), h = 1e-6, vs: number[] = [];
    for (let i = 0; i < 4000; i++) { c.step(h); vs.push(c.v('y') - 1); }
    const ups: number[] = [];
    for (let i = 1; i < vs.length; i++) if (vs[i - 1] < 0 && vs[i] >= 0) ups.push(i);
    const period = ((ups[ups.length - 1] - ups[0]) / (ups.length - 1)) * h, wd = Math.sqrt(1 / (10e-3 * 1e-6) - (10 / (2 * 10e-3)) ** 2);
    expect(period / ((2 * Math.PI) / wd)).toBeCloseTo(1, 2);
    // The first overshoot: e^(−α·π/ωd) of the step.
    const peak = Math.max(...vs.slice(0, 600));
    expect(peak).toBeCloseTo(Math.exp((-500 * Math.PI) / wd), 2);
  });
  it('a diode with 1 kΩ from 5 V drops about 0.7 V (Shockley)', () => {
    const c = new Circuit([
      { id: 'v', kind: 'V', a: 'in', b: '0', value: 5, wave: 'dc', freq: 0 },
      { id: 'r', kind: 'R', a: 'in', b: 'a', value: 1000 },
      { id: 'd', kind: 'D', a: 'a', b: '0' },
    ]).dc();
    const vd = c.v('a'), i = (5 - vd) / 1000;
    expect(vd).toBeGreaterThan(0.6); expect(vd).toBeLessThan(0.75);
    expect(c.current(c.parts[2])).toBeCloseTo(i, 6);
    // Turned round it blocks: almost all 5 V across it.
    const r = new Circuit([{ id: 'v', kind: 'V', a: 'in', b: '0', value: 5, wave: 'dc', freq: 0 }, { id: 'r', kind: 'R', a: 'in', b: 'a', value: 1000 }, { id: 'd', kind: 'D', a: '0', b: 'a' }]).dc();
    expect(r.v('a')).toBeCloseTo(5, 3);
  });
  it('a low-pass RC passes 1/√2 at f = 1/(2πRC)', () => {
    const R = 1000, C = 1e-6, f = 1 / (2 * Math.PI * R * C);
    const c = new Circuit([{ id: 'v', kind: 'V', a: 'in', b: '0', value: 1, wave: 'sine', freq: f }, { id: 'r', kind: 'R', a: 'in', b: 'out', value: R }, { id: 'c', kind: 'C', a: 'out', b: '0', value: C }]);
    const h = 1 / f / 400;
    let peak = 0;
    for (let i = 0; i < 400 * 12; i++) { c.step(h); if (i > 400 * 8) peak = Math.max(peak, c.v('out')); }
    expect(peak).toBeCloseTo(Math.SQRT1_2, 2);
  });
  it('a coil across a source is refused in plain words; SI values read and write', () => {
    const c = new Circuit([{ id: 'v', kind: 'V', a: 'in', b: '0', value: 1, wave: 'dc', freq: 0 }, { id: 'l', kind: 'L', a: 'in', b: '0', value: 1e-3 }]);
    expect(() => c.dc()).toThrow(/shorted/);
    expect(si(4700, 'Ω')).toBe('4.7 kΩ');
    expect(si(2.2e-6, 'F')).toBe('2.2 µF');
    expect(parseSi('4.7k')).toBe(4700);
    expect(parseSi('10u')).toBeCloseTo(1e-5, 15);
    expect(parseSi('2m')).toBe(0.002);
    expect(parseSi('x')).toBeNull();
  });
});

describe('Hyperion Simulate: the drawing board (M410)', () => {
  it('wires join points into nodes, the ground symbol makes node 0, and the examples run', async () => {
    const { netlist, EXAMPLES, readBoard } = await import('./schematic');
    const board = EXAMPLES[0].make(), { parts, probes, grounded, node } = netlist(board);
    expect(grounded).toBe(true);
    expect(node(14, 10)).toBe('0'); // joined to the ground by the bottom wire
    expect(parts.map((p) => p.kind)).toEqual(['V', 'R', 'C']);
    expect([parts[0].a, parts[0].b]).toEqual(['4,4', '0']); // + at the top (the first end), − on the ground
    expect(probes.map((p) => p.label)).toEqual(['P1', 'P2']);
    for (const ex of EXAMPLES) {
      const n = netlist(ex.make()), c = new Circuit(n.parts);
      for (let i = 0; i < 200; i++) c.step(ex.make().dt);
      expect(n.probes.every((p) => Number.isFinite(c.v(p.node))), ex.id).toBe(true);
    }
    expect(readBoard({ items: 'x' }).items.length).toBeGreaterThan(0);
    expect(readBoard({ items: [{ kind: 'R', x1: 1, y1: 1, x2: 3, y2: 1 }, { kind: 'bomb' }], marks: [] }).items).toHaveLength(1);
  });
});
