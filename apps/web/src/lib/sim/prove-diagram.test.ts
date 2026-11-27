import { describe, expect, it } from 'vitest';
import { canon, chartOf, newBlock, readDiagram, type Block, type BlockKind, type Diagram } from './blocks';
import { parseChart } from './chart';
import { prove } from './prove';
import { chartInputRanges, diagramRanges, impulseParts } from './prove-diagram';

const blk = (kind: BlockKind, p: Block['p'] = {}) => { const b = newBlock(kind, 0, 0); b.p = { ...b.p, ...p }; return b; };
const wire = (a: Block, b: Block, out = 0, port = 0) => ({ id: `${a.id}-${b.id}-${port}`, from: a.id, out, to: b.id, in: port });
const verdict = (r: ReturnType<typeof prove>, text: string) => r.proofs.find((p) => p.text === text)?.verdict;

describe('proofs over the rest of the diagram (M574)', () => {
  it('a transfer function’s impulse response, split by sign', () => {
    const [pos, neg] = impulseParts(canon([1], [1, 1]), 20)!;
    expect(pos).toBeCloseTo(1, 2);
    expect(pos).toBeGreaterThanOrEqual(1 - Math.exp(-20));
    expect(neg).toBeLessThanOrEqual(0);
    expect(neg).toBeGreaterThan(-1e-9);
    // An underdamped one rings below zero: ∫h⁻ is real, ∫h⁺ + ∫h⁻ is its DC gain.
    const [p2, n2] = impulseParts(canon([1], [1, 0.4, 1]), 60)!;
    expect(n2).toBeLessThan(-0.1);
    expect(p2 + n2).toBeCloseTo(1, 2);
  });

  it('a saturated sine reaching a chart: a transition the chart alone can’t rule out is proved dead', () => {
    const s = blk('sine', { amplitude: 3 }), g = blk('gain', { k: 2 }), sat = blk('saturation', { lower: -1, upper: 1 });
    const c = blk('chart', { chart: 'inputs: u\noutputs: y\nstate Low\n  entry: y = 0\nstate High\n  entry: y = 1\nLow -> High: u > 5\nHigh -> Low: u < 0' });
    const dg: Diagram = { stop: 10, dt: 0.01, blocks: [s, g, sat, c], wires: [wire(s, g), wire(g, sat), wire(sat, c)] };
    const r = diagramRanges(dg);
    expect(r.sig.get(`${g.id}#0`)).toEqual([-6, 6]);
    const ins = chartInputRanges(dg, c.id, r);
    expect(ins).toEqual({ u: [-1, 1] });
    expect(verdict(prove(chartOf(c), { ranges: ins }), 'state High can never be reached')).toBe('proved');
    expect(verdict(prove(chartOf(c)), 'state High can be reached')).toBe('proved');
  });

  it('a step through a first-order lag stays within 0 … 1, and an integrator within its run', () => {
    const st = blk('step', { time: 1, before: 0, after: 1 }), tf = blk('tf', { num: '1', den: '1 1' }), i = blk('integrator', { initial: 2 });
    const dg: Diagram = { stop: 5, dt: 0.01, blocks: [st, tf, i], wires: [wire(st, tf), wire(st, i)] };
    const r = diagramRanges(dg), y = r.sig.get(`${tf.id}#0`)!;
    expect(y[0]).toBeCloseTo(0, 6);
    expect(y[1]).toBeGreaterThanOrEqual(1 - Math.exp(-5)); // over a 5 s run it gets that far
    expect(y[1]).toBeLessThan(1.01);
    expect(r.sig.get(`${i.id}#0`)).toEqual([2, 7]);
  });

  it('a chart in a loop: its own outputs come back round and the loop settles on finite ranges', () => {
    const c = blk('chart', { chart: 'inputs: level\noutputs: pump\nstate On\n  entry: pump = 1\nstate Off\n  entry: pump = 0\nOn -> Off: level >= 2\nOff -> On: level <= 1' });
    const tank = blk('tf', { num: '3', den: '1 1' });
    const dg: Diagram = { stop: 30, dt: 0.01, blocks: [c, tank], wires: [wire(c, tank), wire(tank, c)] };
    const r = diagramRanges(dg);
    expect(r.sig.get(`${c.id}#0`)).toEqual([0, 1]);
    const lvl = chartInputRanges(dg, c.id, r).level;
    expect(lvl[0]).toBeCloseTo(0, 6);
    expect(lvl[1]).toBeLessThan(3.01);
    expect(r.widened).toBe(false);
  });

  it('a loop of integrators alone ends, opened to ±∞ (sound, not sharp), and a board pin is anything', () => {
    const i = blk('integrator', { initial: 1 }), g = blk('gain', { k: -1 }), pin = blk('boardIn');
    const dg: Diagram = { stop: 10, dt: 0.01, blocks: [i, g, pin], wires: [wire(i, g), wire(g, i)] };
    const r = diagramRanges(dg);
    expect(r.widened).toBe(true);
    expect(r.sig.get(`${i.id}#0`)).toEqual([-Infinity, Infinity]);
    expect(r.sig.get(`${pin.id}#0`)).toEqual([-Infinity, Infinity]);
  });

  it('what was typed into Prove is kept with the diagram, read back safely', () => {
    const c = blk('chart');
    const back = readDiagram(JSON.parse(JSON.stringify({ stop: 5, dt: 0.01, blocks: [c], wires: [], prove: {
      [c.id]: { props: ['y <= 1', 7], ranges: { u: ['0', '2'], 'bad name': ['1', '2'] }, fromDiagram: true }, gone: { props: ['x'], ranges: {} },
    } })));
    expect(back.prove).toEqual({ [c.id]: { props: ['y <= 1'], ranges: { u: ['0', '2'] }, fromDiagram: true } });
  });

  it('a chart with history is proved too: it can come back to Fast without passing Slow', () => {
    const ch = parseChart('inputs: u, f\noutputs: y\nstate Run history\nstate Slow in Run\n  entry: y = 2\nstate Fast in Run\n  entry: y = 3\nstate Stop\n  entry: y = 0\nRun -> Stop: f > 0\nSlow -> Fast: u > 1\nFast -> Slow: u < 1\nStop -> Run: f <= 0');
    const r = prove(ch, { ranges: { u: [2, 3] }, props: ['in(Stop) || y >= 2', 'y != 2 || in(Slow)'] });
    expect(verdict(r, 'always in(Stop) || y >= 2')).toBe('proved');
    expect(verdict(r, 'always y != 2 || in(Slow)')).toBe('proved');
    expect(r.proofs.find((p) => p.name === 'y')?.range).toEqual([0, 3]);
  });
});
