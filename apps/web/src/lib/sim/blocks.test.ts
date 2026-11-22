import { describe, expect, it } from 'vitest';
import { EXAMPLES, newBlock, readDiagram, simulate, type Block, type BlockKind, type Diagram, type Wire } from './blocks';

const B = (kind: BlockKind, p: Block['p'] = {}): Block => { const b = newBlock(kind, 0, 0); b.p = { ...b.p, ...p }; return b; };
const W = (from: Block, to: Block, inPort = 0): Wire => ({ id: `${from.id}-${to.id}-${inPort}`, from: from.id, out: 0, to: to.id, in: inPort });
/** The first scope's first trace at time t (the nearest sample). */
const at = (d: Diagram, t: number, trace = 0) => {
  const r = simulate(d), s = [...r.scopes.values()][0][trace];
  let k = 0;
  while (k < r.t.length - 1 && r.t[k] < t) k++;
  return s[k];
};

describe('block diagrams', () => {
  it('a gain and an integrator in a loop follow 1 − e^(−2t)', () => {
    const d = EXAMPLES.find((e) => e.id === 'loop')!.make();
    for (const t of [0.25, 1, 2]) expect(at(d, t)).toBeCloseTo(1 - Math.exp(-2 * t), 3);
  });

  it('a damped mass on a spring matches the exact answer', () => {
    const d = EXAMPLES.find((e) => e.id === 'spring')!.make();
    const wd = Math.sqrt(4 - 0.04), exact = (t: number) => Math.exp(-0.2 * t) * (Math.cos(wd * t) + (0.2 / wd) * Math.sin(wd * t));
    for (const t of [1, 3.3, 7.5]) expect(at(d, t)).toBeCloseTo(exact(t), 3);
  });

  it('transfer functions: 1/(s+1) and (s+2)/(s+1) answering a step', () => {
    const s = B('step', { time: 0 }), g = B('tf', { num: '1', den: '1 1' }), h = B('tf', { num: '1 2', den: '1 1' }), sc = B('scope', { inputs: 2 });
    const d: Diagram = { stop: 3, dt: 0.001, blocks: [s, g, h, sc], wires: [W(s, g), W(s, h), W(g, sc), W(h, sc, 1)] };
    expect(at(d, 1)).toBeCloseTo(1 - Math.exp(-1), 4);
    expect(at(d, 1, 1)).toBeCloseTo(2 - Math.exp(-1), 4);
  });

  it('a second-order transfer function settles at its gain with the textbook overshoot', () => {
    // ωn = 2, ζ = 0.25: overshoot e^(−πζ/√(1−ζ²)) ≈ 44.4 %.
    const s = B('step', { time: 0 }), g = B('tf', { num: '12', den: '1 1 4' }), sc = B('scope');
    const d: Diagram = { stop: 30, dt: 0.002, blocks: [s, g, sc], wires: [W(s, g), W(g, sc)] };
    const r = simulate(d), y = [...r.scopes.values()][0][0];
    expect(y.at(-1)!).toBeCloseTo(3, 2);
    expect(Math.max(...y) / 3 - 1).toBeCloseTo(Math.exp((-Math.PI * 0.25) / Math.sqrt(1 - 0.0625)), 2);
  });

  it('a PI cruise control reaches its set speed; saturation holds the force inside its limits', () => {
    const d = EXAMPLES.find((e) => e.id === 'cruise')!.make();
    expect(Math.abs(at(d, 99.9) - 25)).toBeLessThan(0.1);
    const sat = d.blocks.find((b) => b.kind === 'saturation')!, sc = d.blocks.find((b) => b.kind === 'scope')!;
    d.wires = d.wires.map((w) => (w.to === sc.id && w.in === 1 ? { ...w, from: sat.id } : w));
    const force = [...simulate(d).scopes.values()][0][1];
    expect(Math.max(...force)).toBe(5000);
  });

  it('the PID derivative of a ramp is its slope times Kd', () => {
    const r = B('ramp', { slope: 3 }), pid = B('pid', { Kp: 0, Ki: 0, Kd: 2, N: 200 }), sc = B('scope');
    expect(at({ stop: 2, dt: 0.001, blocks: [r, pid, sc], wires: [W(r, pid), W(pid, sc)] }, 1.5)).toBeCloseTo(6, 3);
  });

  it('refuses a loop with no state in it, in plain words', () => {
    const s = B('step'), sum = B('sum', { signs: '+-' }), k = B('gain'), sc = B('scope');
    expect(() => simulate({ stop: 1, dt: 0.01, blocks: [s, sum, k, sc], wires: [W(s, sum), W(sum, k), W(k, sum, 1), W(k, sc)] })).toThrow(/algebraic loop/);
  });

  it('says when a loop blows up, and when a run is cut short', () => {
    const s = B('step', { time: 0 }), sum = B('sum', { signs: '++' }), k = B('gain', { k: 500 }), it = B('integrator'), sc = B('scope');
    const r = simulate({ stop: 10, dt: 0.01, blocks: [s, sum, k, it, sc], wires: [W(s, sum), W(sum, k), W(k, it), W(it, sum, 1), W(it, sc)] });
    expect(r.error).toMatch(/blew up/);
    expect(simulate({ stop: 100, dt: 1e-4, blocks: [B('sine'), B('scope')], wires: [] }).capped).toBe(true);
  });

  it('reads a kept diagram back safely', () => {
    const d = EXAMPLES[0].make();
    expect(readDiagram(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(readDiagram({ blocks: [{ id: 'a', kind: 'sum', x: 1, y: 2, p: { signs: 'x' } }, { id: 'b', kind: 'nope' }], wires: [{ id: 'w', from: 'a', to: 'gone' }], stop: 1e9, dt: 0 })).toEqual({
      blocks: [{ id: 'a', kind: 'sum', x: 1, y: 2, p: { signs: '+-' } }], wires: [], stop: 1e5, dt: 1e-5,
    });
    expect(readDiagram(null).blocks.length).toBeGreaterThan(0);
  });
});
