import { describe, expect, it } from 'vitest';
import { chartStart, chartStep, evalExpr, parseChart, parseExpr } from './chart';
import { EXAMPLES, newBlock, simulate, type Block, type BlockKind, type Diagram, type Wire } from './blocks';

describe('state charts', () => {
  it('expressions follow the usual precedence', () => {
    const v = (s: string, env = {}) => evalExpr(parseExpr(s), env);
    expect(v('1 + 2 * 3 ^ 2')).toBe(19);
    expect(v('-2 ^ 2')).toBe(-4);
    expect(v('a > 1 && !(b == 2) || 0', { a: 2, b: 3 })).toBe(1);
    expect(v('max(abs(-3), 2) / 2')).toBe(1.5);
    expect(() => parseExpr('1 +')).toThrow();
    expect(() => parseExpr('foo(1)')).toThrow(/isn’t a function/);
  });

  it('a hysteresis switch: transitions in order, after, entry and transition actions', () => {
    const ch = parseChart(`inputs: u
outputs: y, n
state Low
  entry: y = -3.2
state High
  entry: y = 3.2; n = n + 1
Low -> High: u >= 0.5
High -> Low: u < 0.5 after 1 / n = n + 10`);
    const r = chartStart(ch);
    expect(r.vars.y).toBe(-3.2);
    chartStep(ch, r, { u: 0.7 }, 0.1);
    expect([r.active, r.vars.y, r.vars.n]).toEqual([1, 3.2, 1]);
    chartStep(ch, r, { u: 0 }, 0.5); // not yet a second in High
    expect(r.active).toBe(1);
    chartStep(ch, r, { u: 0 }, 1.1);
    expect([r.active, r.vars.y, r.vars.n]).toEqual([0, -3.2, 11]);
    expect(r.fired).toEqual([1, 1]);
  });

  it('mistakes name their line', () => {
    expect(() => parseChart('state A\nA -> B: 1')).toThrow(/Line 2: there’s no state called B/);
    expect(() => parseChart('inputs: u\nstate A\n  entry: u = 1')).toThrow(/it’s an input/);
    expect(() => parseChart('state A\n  entry: y = z')).toThrow(/uses z/);
    expect(() => parseChart('hello')).toThrow(/Line 1/);
  });

  it('a chart block in a diagram: the tank supervisor keeps the level between its limits', () => {
    const d = EXAMPLES.find((e) => e.id === 'tank')!.make(), r = simulate(d);
    expect(r.error).toBeUndefined();
    const id = d.blocks.find((b) => b.kind === 'chart')!.id, level = [...r.scopes.values()][0][0];
    const after = level.filter((_, k) => r.t[k] > 10);
    expect(Math.min(...after)).toBeGreaterThan(0.8);
    expect(Math.max(...after)).toBeLessThan(3.2);
    expect(r.charts[id].fired.every((f) => f > 0)).toBe(true);
    expect(new Set(r.charts[id].active).size).toBe(3);
  });

  it('a second output wired on its own', () => {
    const B = (kind: BlockKind, p: Block['p'] = {}): Block => { const b = newBlock(kind, 0, 0); b.p = { ...b.p, ...p }; return b; };
    const s = B('step', { time: 1 }), c = B('chart', { chart: 'inputs: u\noutputs: a, b\nstate S\n  during: a = u; b = 2 * u' }), sc = B('scope', { inputs: 2 });
    const W = (from: Block, to: Block, inPort = 0, out = 0): Wire => ({ id: `${from.id}${inPort}${out}`, from: from.id, out, to: to.id, in: inPort });
    const d: Diagram = { stop: 2, dt: 0.01, blocks: [s, c, sc], wires: [W(s, c), W(c, sc), W(c, sc, 1, 1)] };
    const r = simulate(d), [a, b] = [...r.scopes.values()][0];
    expect(a.at(-1)).toBe(1);
    expect(b.at(-1)).toBe(2);
  });
});

describe('states inside states (M569)', () => {
  const text = `inputs: u, fault
outputs: y, n
state Running
  entry: n = n + 1
  during: y = y
state Slow in Running
  entry: y = 2
state Fast in Running
  entry: y = 3
state Fault
  entry: y = -1
Running -> Fault: fault > 0.5
Slow -> Fast: u > 1
Fast -> Slow: u < 1
Fault -> Running: fault < 0.5 after 1`;
  it('enters the first inner state, the outer transition wins from inside, and comes back to the first inner state', () => {
    const ch = parseChart(text), r = chartStart(ch), name = () => ch.states[r.active].name;
    expect([name(), r.vars.y, r.vars.n]).toEqual(['Running.Slow', 2, 1]);
    chartStep(ch, r, { u: 2, fault: 0 }, 0.1);
    expect([name(), r.vars.y]).toEqual(['Running.Fast', 3]);
    chartStep(ch, r, { u: 0, fault: 1 }, 0.2); // both Fast → Slow and Running → Fault hold: the outer one fires
    expect([name(), r.vars.y]).toEqual(['Fault', -1]);
    chartStep(ch, r, { u: 0, fault: 0 }, 0.5);
    expect(name()).toBe('Fault');
    chartStep(ch, r, { u: 0, fault: 0 }, 1.3);
    expect([name(), r.vars.y, r.vars.n]).toEqual(['Running.Slow', 2, 2]);
    expect(ch.parents).toEqual([['Running'], ['Running'], []]);
  });
  it('an outer state’s after counts from when the outer state was entered, not the inner one', () => {
    const ch = parseChart(`inputs: u
outputs: y
state A
state A1 in A
state A2 in A
state B
  entry: y = 1
A1 -> A2: u > 0
A -> B: 1 after 2`);
    const r = chartStart(ch, 0);
    chartStep(ch, r, { u: 1 }, 1.5); // into A2 at 1.5 s; A has been active since 0
    expect(ch.states[r.active].name).toBe('A.A2');
    chartStep(ch, r, { u: 1 }, 2.1);
    expect(ch.states[r.active].name).toBe('B');
  });
  it('a hierarchical chart runs in a diagram and its generated C matches', async () => {
    const { buildIr, emulate } = await import('./blockir');
    const s = newBlock('pulse', 0, 0), c = newBlock('chart', 0, 0), sc = newBlock('scope', 0, 0);
    s.p = { ...s.p, amplitude: 2, period: 4 };
    c.p.chart = text.replace('inputs: u, fault', 'inputs: u');
    c.p.chart = String(c.p.chart).replace(/fault > 0.5/, 't > 3').replace(/fault < 0.5 after 1/, '1 after 1');
    const d: Diagram = { stop: 20, dt: 0.01, blocks: [s, c, sc], wires: [{ id: 'a', from: s.id, out: 0, to: c.id, in: 0 }, { id: 'b', from: c.id, out: 0, to: sc.id, in: 0 }] };
    const r = simulate(d);
    expect(r.error).toBeUndefined();
    expect(new Set([...r.scopes.values()][0][0])).toEqual(new Set([2, 3, -1]));
    const ir = buildIr(d), o = emulate(ir, 2000);
    expect(new Set(o[ir.outputs[0].name])).toEqual(new Set([2, 3, -1]));
  });
});
