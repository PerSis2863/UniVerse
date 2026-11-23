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

describe('power electronics (M424)', () => {
  const average = async (id: string, settle: number, span: number) => {
    const { netlist, EXAMPLES } = await import('./schematic');
    const { Circuit } = await import('./circuit');
    const board = EXAMPLES.find((e) => e.id === id)!.make(), net = netlist(board), c = new Circuit(net.parts);
    const out = net.probes[1].node, coil = net.parts.find((p) => p.kind === 'L')!;
    while (c.t < settle) c.step(board.dt);
    let sum = 0, n = 0, iMin = Infinity, iMax = -Infinity;
    while (c.t < settle + span) { c.step(board.dt); sum += c.v(out); n++; const i = c.current(coil); iMin = Math.min(iMin, i); iMax = Math.max(iMax, i); }
    return { v: sum / n, ripple: iMax - iMin };
  };
  it('a buck converter gives about D·Vin less the diode’s share; the coil’s ripple is (Vin − Vout)·D/(L·f)', async () => {
    const r = await average('buck', 0.02, 0.002);
    // 0.5 × 12 V, less about 0.8 V of diode drop for the half of each period it carries the current.
    expect(r.v).toBeGreaterThan(5.4);
    expect(r.v).toBeLessThan(5.8);
    expect(Math.abs(r.ripple / (((12 - r.v) * 0.5) / (100e-6 * 50_000)) - 1)).toBeLessThan(0.1);
  });
  it('a boost converter gives about Vin/(1 − D) less the diode drop', async () => {
    const r = await average('boost', 0.03, 0.002);
    expect(r.v).toBeGreaterThan(8.9);
    expect(r.v).toBeLessThan(9.6);
  });
});

describe('the transistor (M430)', () => {
  it('its slopes match its current (square law, both directions)', async () => {
    const { mosfet } = await import('./circuit');
    for (const [vgs, vds] of [[3, 0.5], [3, 5], [5, -0.4], [1, 2], [4, 1.99]]) {
      const m = mosfet(vgs, vds, 2, 0.5, 0.02), h = 1e-6;
      expect(m.gm).toBeCloseTo((mosfet(vgs + h, vds, 2, 0.5, 0.02).id - mosfet(vgs - h, vds, 2, 0.5, 0.02).id) / (2 * h), 5);
      expect(m.gds).toBeCloseTo((mosfet(vgs, vds + h, 2, 0.5, 0.02).id - mosfet(vgs, vds - h, 2, 0.5, 0.02).id) / (2 * h), 5);
    }
    expect(mosfet(1, 5, 2, 1, 0).id).toBe(0); // off below its threshold
  });
  it('a common-source stage: 4 mA through 1 kΩ leaves 6 V on the drain; power adds up to zero', () => {
    const parts: Part[] = [
      { id: 'vdd', kind: 'V', a: 'vdd', b: '0', value: 10, wave: 'dc', freq: 0 }, { id: 'rd', kind: 'R', a: 'vdd', b: 'd', value: 1000 },
      { id: 'vg', kind: 'V', a: 'g', b: '0', value: 3, wave: 'dc', freq: 0 }, { id: 'm', kind: 'M', a: 'd', b: '0', g: 'g', vth: 1, k: 2e-3, lambda: 0 },
    ];
    const c = new Circuit(parts).dc();
    expect(c.v('d')).toBeCloseTo(6, 4);
    expect(c.current(parts[3])).toBeCloseTo(4e-3, 6);
    // Tellegen: what the sources give is what the rest takes.
    expect(parts.reduce((s, p) => s + c.power(p), 0)).toBeCloseTo(0, 9);
    expect(c.power(parts[0])).toBeCloseTo(-0.04, 6);
  });
  it('a boost converter with a real transistor gives about Vin/(1 − D), and its losses are small', async () => {
    const { netlist, EXAMPLES } = await import('./schematic');
    const board = EXAMPLES.find((e) => e.id === 'mosfet-boost')!.make(), net = netlist(board), c = new Circuit(net.parts);
    expect(net.parts.find((p) => p.kind === 'M')).toMatchObject({ g: '10,7', b: '0' });
    while (c.t < 0.03) c.step(board.dt);
    let v = 0, n = 0;
    const e: Record<string, number> = {};
    while (c.t < 0.032) { c.step(board.dt); v += c.v(net.probes[1].node); n++; for (const p of net.parts) e[p.kind + p.id] = (e[p.kind + p.id] ?? 0) + c.power(p); }
    expect(v / n).toBeGreaterThan(8.9); expect(v / n).toBeLessThan(9.6);
    const avg = (k: string) => Object.entries(e).filter(([id]) => id.startsWith(k)).reduce((s, [, x]) => s + x / n, 0);
    const input = -Object.entries(e).filter(([id]) => id.startsWith('V')).map(([, x]) => x / n).reduce((s, x) => s + x, 0), load = avg('R');
    expect(load / input).toBeGreaterThan(0.85); expect(load / input).toBeLessThan(1);
    expect(avg('M')).toBeGreaterThan(0); expect(avg('M')).toBeLessThan(0.05 * input);
  });
});

describe('converters that hold their voltage (M431)', () => {
  const settle = async (id: string, until: number) => {
    const { netlist, EXAMPLES } = await import('./schematic');
    const board = EXAMPLES.find((e) => e.id === id)!.make(), net = netlist(board), c = new Circuit(net.parts);
    let peak = 0;
    while (c.t < until) { c.step(board.dt); peak = Math.max(peak, c.v(net.probes[0].node)); }
    let sum = 0, n = 0;
    while (c.t < until + 0.002) { c.step(board.dt); sum += c.v(net.probes[0].node); n++; }
    return { v: sum / n, peak, sw: net.parts.find((p) => p.kind === 'S')! };
  };
  it('a switch edge splits the step, so a duty isn’t rounded to whole steps', async () => {
    const { nextEdge } = await import('./circuit');
    expect(nextEdge(50_000, 0.463, 0)).toBeCloseTo(0.463 / 50_000, 15);
    expect(nextEdge(50_000, 0.463, 0.463 / 50_000)).toBeCloseTo(1 / 50_000, 15);
  });
  it('the buck holds 5 V from 12 V, the boost 12 V from 5 V, without a big overshoot', async () => {
    const b = await settle('reg-buck', 0.025);
    expect(Math.abs(b.v - 5)).toBeLessThan(0.02); expect(b.peak).toBeLessThan(5.3);
    expect(b.sw).toMatchObject({ kind: 'S', hold: { target: 5 } });
    const u = await settle('reg-boost', 0.035);
    expect(Math.abs(u.v - 12)).toBeLessThan(0.1); expect(u.peak).toBeLessThan(13.5);
  });
  it('stays steady for a long run (no near-zero steps at the edges, no ringing after a flip)', async () => {
    const { netlist, EXAMPLES } = await import('./schematic');
    const board = EXAMPLES.find((e) => e.id === 'reg-buck')!.make(), net = netlist(board), c = new Circuit(net.parts), node = net.probes[0].node;
    while (c.t < 0.13) c.step(board.dt);
    let mn = Infinity, mx = -Infinity;
    while (c.t < 0.15) { c.step(board.dt); mn = Math.min(mn, c.v(node)); mx = Math.max(mx, c.v(node)); }
    expect(mx - mn).toBeLessThan(0.05);
    expect(Math.abs(c.t - 0.15)).toBeLessThan(2e-6);
  }, 60_000);
  it('a kept board keeps a switch’s hold; nonsense is dropped', async () => {
    const { readBoard } = await import('./schematic');
    const b = readBoard({ items: [{ kind: 'S', x1: 1, y1: 1, x2: 3, y2: 1, hold: 5, sense: 'p1' }, { kind: 'S', x1: 1, y1: 2, x2: 3, y2: 2, hold: 'x', sense: 'p1' }], marks: [] });
    expect(b.items[0]).toMatchObject({ hold: 5, sense: 'p1' }); expect(b.items[1].hold).toBeUndefined();
  });
});

describe('inverters and motor drives (M432)', () => {
  const run = async (id: string, until: number) => {
    const { netlist, EXAMPLES } = await import('./schematic');
    const board = EXAMPLES.find((e) => e.id === id)!.make(), net = netlist(board), c = new Circuit(net.parts);
    while (c.t < until) c.step(board.dt);
    return { c, net, board };
  };
  it('an inverter: two switches take turns, and the filtered output is a 50 Hz sine of about 0.8 × 24 V', async () => {
    const { c, net, board } = await run('inverter', 0.06);
    const [top, bottom] = net.parts.filter((p) => p.kind === 'S') as Extract<Part, { kind: 'S' }>[];
    for (const t of [0.06001, 0.06004, 0.06007]) expect(c.isOn(top, t)).toBe(!c.isOn(bottom, t));
    const out = net.probes[1].node, v: number[] = [], ts: number[] = [];
    while (c.t < 0.1) { c.step(board.dt); v.push(c.v(out)); ts.push(c.t); }
    // Fit a 50 Hz sine (least squares on sin and cos): its amplitude, and how little is left over.
    let ss = 0, cc = 0, sc = 0, vs = 0, vc = 0;
    ts.forEach((t, i) => { const s = Math.sin(2 * Math.PI * 50 * t), q = Math.cos(2 * Math.PI * 50 * t); ss += s * s; cc += q * q; sc += s * q; vs += v[i] * s; vc += v[i] * q; });
    const det = ss * cc - sc * sc, A = (vs * cc - vc * sc) / det, B = (vc * ss - vs * sc) / det, amp = Math.hypot(A, B);
    const rest = Math.sqrt(ts.reduce((s, t, i) => s + (v[i] - A * Math.sin(2 * Math.PI * 50 * t) - B * Math.cos(2 * Math.PI * 50 * t)) ** 2, 0) / ts.length);
    // The LC filter (2 mH, 10 µF into 10 Ω) passes 50 Hz with a small gain and phase shift.
    expect(amp).toBeGreaterThan(18); expect(amp).toBeLessThan(21);
    expect(rest / amp).toBeLessThan(0.05);
  }, 60_000);
  it('a DC motor driven at half duty from 24 V settles near (12 V − r·i)/k', async () => {
    const { c, net } = await run('motor', 0.15);
    const m = net.parts.find((p) => p.kind === 'Mo')!;
    // The load 0.05 N·m needs i = 0.5 A; the back-EMF is then 12 − 0.5 − the diode's share ≈ 11 V: ~110 rad/s.
    const w = c.speedOf(m);
    expect(w).toBeGreaterThan(100); expect(w).toBeLessThan(118);
    const { MOTOR } = await import('./schematic');
    expect(MOTOR.k * c.current(m)).toBeGreaterThan(0.04); // the torque ≈ the load
  }, 60_000);
});
