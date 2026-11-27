import { describe, expect, it } from 'vitest';
import { chartOf, EXAMPLES, newBlock, readDiagram, type Block, type BlockKind, type Diagram } from './blocks';
import { parseChart } from './chart';
import { prove } from './prove';
import { chartInputRanges, diagramRanges } from './prove-diagram';
import { coefficients, linearNet } from './prove-linear';

const blk = (kind: BlockKind, p: Block['p'] = {}) => { const b = newBlock(kind, 0, 0); b.p = { ...b.p, ...p }; return b; };
const wire = (a: Block, b: Block, out = 0, port = 0) => ({ id: `${a.id}-${b.id}-${port}`, from: a.id, out, to: b.id, in: port });
const verdict = (r: ReturnType<typeof prove>, text: string) => r.proofs.find((p) => p.text === text)?.verdict;

describe('proofs over the rest of the diagram (M574)', () => {
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
    const ir = r.sig.get(`${i.id}#0`)!;
    expect(ir[0]).toBeCloseTo(2, 5);
    expect(ir[1]).toBeCloseTo(7, 2);
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

  it('a loop of integrators that holds itself (a damped spring) is bounded, and forever; a board pin is anything', () => {
    // x'' = −4x − 0.4x', from x = 1 at rest: |x| ≤ 1 always, the velocity within ±2.
    const xg = blk('gain', { k: -4 }), vg = blk('gain', { k: -0.4 }), sum = blk('sum', { signs: '++' }), v = blk('integrator'), x = blk('integrator', { initial: 1 }), pin = blk('boardIn');
    const dg: Diagram = { stop: 20, dt: 0.01, blocks: [xg, vg, sum, v, x, pin], wires: [wire(xg, sum), wire(vg, sum, 0, 1), wire(sum, v), wire(v, x), wire(x, xg), wire(v, vg)] };
    const r = diagramRanges(dg), xr = r.forever.get(`${x.id}#0`)!;
    expect(xr[0]).toBeGreaterThan(-1.01);
    expect(xr[1]).toBeGreaterThanOrEqual(1);
    expect(xr[1]).toBeLessThan(1.01);
    expect(r.sig.get(`${v.id}#0`)![1]).toBeLessThan(2.1);
    expect(r.sig.get(`${pin.id}#0`)).toEqual([-Infinity, Infinity]);
  });

  it('a bare integrator in a loop with nothing holding it is bounded over the run only', () => {
    const i = blk('integrator', { initial: 1 }), g = blk('gain', { k: 1 }), c = blk('constant', { value: 0 });
    const dg: Diagram = { stop: 2, dt: 0.01, blocks: [i, g, c], wires: [wire(i, g), wire(g, i)] };
    const r = diagramRanges(dg), run = r.sig.get(`${i.id}#0`)!;
    expect(run[1]).toBeGreaterThanOrEqual(Math.exp(2) - 1e-6);
    expect(run[1]).toBeLessThan(Math.exp(2) * 1.01);
    expect(r.forever.get(`${i.id}#0`)).toEqual([-Infinity, Infinity]);
  });

  it('a stable loop under a PI controller: the whole loop bounds the plant, not each block alone', () => {
    const net = linearNet({ stop: 30, dt: 0.01, blocks: [], wires: [] });
    expect(coefficients(net, Infinity)).toEqual([]);
    const set = blk('step', { time: 1, before: 0, after: 1 }), e = blk('sum', { signs: '+-' }), pid = blk('pid', { Kp: 2, Ki: 1, Kd: 0 }), plant = blk('tf', { num: '1', den: '1 1' });
    const dg: Diagram = { stop: 30, dt: 0.01, blocks: [set, e, pid, plant], wires: [wire(set, e), wire(e, pid), wire(pid, plant), wire(plant, e, 0, 1)] };
    const r = diagramRanges(dg), y = r.forever.get(`${plant.id}#0`)!;
    expect(y[0]).toBeGreaterThan(-0.3);
    expect(y[1]).toBeLessThan(1.6);
    expect(r.sig.get(`${pid.id}#0`)![1]).toBeLessThan(3);
  });

  it('the tank example: the chart and the tank proved together keep the level near 1 … 2.5, forever', () => {
    const dg = EXAMPLES.find((x) => x.id === 'tank')!.make(), lvl = dg.blocks.find((b) => b.kind === 'integrator')!, c = dg.blocks.find((b) => b.kind === 'chart')!;
    const r = diagramRanges(dg);
    for (const m of [r.sig, r.forever]) {
      const [lo, hi] = m.get(`${lvl.id}#0`)!;
      expect(lo).toBeGreaterThan(0.9);
      expect(lo).toBeLessThanOrEqual(1);
      expect(hi).toBeGreaterThanOrEqual(2.5);
      expect(hi).toBeLessThan(2.6);
    }
    const ins = chartInputRanges(dg, c.id, r, 'forever');
    expect(verdict(prove(chartOf(c), { ranges: ins, props: ['level > 0.5'] }), 'always level > 0.5')).toBe('proved');
    expect(verdict(prove(chartOf(c), { props: ['level > 0.5'] }), 'always level > 0.5')).not.toBe('proved');
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
