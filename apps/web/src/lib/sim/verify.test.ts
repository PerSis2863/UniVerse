import { describe, expect, it } from 'vitest';
import { EXAMPLES, newBlock, type Block, type Diagram, type Req } from './blocks';
import { checkReq, generateTests, modelChecks, outcomes, run, verifyAll } from './verify';

const ex = (id: string) => EXAMPLES.find((e) => e.id === id)!.make();
const idOf = (d: Diagram, kind: string) => d.blocks.find((b) => b.kind === kind)!.id;
const req = (signal: string, kind: Req['kind'], a: number, b: number, from: number): Req => ({ id: 'r', text: '', signal, kind, a, b, from });

describe('verification', () => {
  it('requirements on the cruise control: settles, reaches, overshoots, stays in range', () => {
    const d = ex('cruise'), car = `${idOf(d, 'tf')}#0`, r = run(d, [car]);
    expect(checkReq(req(car, 'settle', 25, 0.5, 60), r).pass).toBe(true);
    expect(checkReq(req(car, 'reach', 22.5, 0, 30), r).pass).toBe(true);
    expect(checkReq(req(car, 'reach', 22.5, 0, 3), r).pass).toBe(false);
    const os = checkReq(req(car, 'overshoot', 5, 0, 1), r);
    expect(os.pass).toBe(false);
    expect(os.detail).toMatch(/overshoots/);
    const rg = checkReq(req(car, 'range', 0, 20, 0), r);
    expect(rg.pass).toBe(false);
    expect(rg.at).toBeGreaterThan(1);
  });

  it('generated tests reach decisions the model as it is never does (the saturation below its range)', () => {
    const d = ex('cruise'), sat = idOf(d, 'saturation');
    expect(run(d).hit.has(`${sat}:below`)).toBe(false);
    const g = generateTests(d);
    expect(g.hit.has(`${sat}:below`)).toBe(true);
    expect(g.tests.length).toBeGreaterThan(1);
    expect(generateTests(d).tests.map((t) => t.changes)).toEqual(g.tests.map((t) => t.changes));
  });

  it('a chart’s states, transitions and both sides of each condition are outcomes', () => {
    const d = ex('tank'), all = outcomes(d), g = generateTests(d, 40);
    expect(all.filter((o) => o.id.includes(':state:')).length).toBe(3);
    expect(all.filter((o) => o.id.includes(':fire:')).length).toBe(4);
    expect(g.hit.size / all.length).toBeGreaterThan(0.9);
  });

  it('model checks: an unreachable state, a transition that can never fire, an unstable derivative filter, unwired inputs', () => {
    const c = newBlock('chart', 0, 0); c.p.chart = 'inputs: u\noutputs: y\nstate A\nstate B\nstate C\nA -> B: 1\nA -> C: u > 1';
    const pid: Block = { ...newBlock('pid', 0, 0), p: { Kp: 1, Ki: 0, Kd: 1, N: 500 } };
    const checks = modelChecks({ blocks: [c, pid], wires: [], stop: 1, dt: 0.01 }).map((x) => x.text).join('\n');
    expect(checks).toMatch(/A → C can never fire/);
    expect(checks).toMatch(/derivative filter is unstable/);
    expect(checks).toMatch(/input 1 isn’t wired/);
    const c2 = newBlock('chart', 0, 0); c2.p.chart = 'outputs: y\nstate A\nstate B';
    expect(modelChecks({ blocks: [c2], wires: [], stop: 1, dt: 0.01 }).map((x) => x.text).join('\n')).toMatch(/state B can never be reached/);
  });

  it('verifyAll: requirements, tests, coverage and checks together', () => {
    const d = ex('cruise'), car = `${idOf(d, 'tf')}#0`;
    const v = verifyAll({ ...d, reqs: [req(car, 'settle', 25, 0.5, 60)] }, 20);
    expect(v.results[0].pass).toBe(true);
    expect(v.perTest.length).toBe(v.tests.length - 1);
    expect(v.checks.length).toBeGreaterThan(0);
  });
});
