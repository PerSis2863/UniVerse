import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics } from './plot';
import { toMat, plainOf } from './values';
import './sciences';
import * as S from './sym';
import * as tc from './teach';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out: plainOf(out), graphics, lab, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const x = S.sym('x'), X2 = S.pow(x, S.rat(2));
const same = (a: S.N, b: S.N) => [0.3, 1.7, -2.2].every((v) => Math.abs(S.evalC(S.subst(S.sub(a, b), x, S.flt(v)))[0]) < 1e-9);

describe('Hyperion maths teaching (M503)', () => {
  it('derivatives: right answers with the rules named', () => {
    const f = S.mul(X2, S.fn('sin', x)), r = tc.diffSteps(f, 'x');
    expect(same(r.result, S.diff(f, 'x'))).toBe(true);
    expect(r.steps.map((s) => s.rule).join(' | ')).toMatch(/product rule.*power rule.*table/);
    const g = S.fn('exp', S.mul(S.rat(3), X2)), rg = tc.diffSteps(g, 'x');
    expect(rg.steps[0].rule).toMatch(/chain rule/);
    expect(same(rg.result, S.mul(S.rat(6), x, g))).toBe(true);
    const q = S.div(S.fn('sin', x), S.add(x, S.ONE)), rq = tc.diffSteps(q, 'x');
    expect(rq.steps[0].rule).toMatch(/quotient rule/);
    expect(same(rq.result, S.diff(q, 'x'))).toBe(true);
  });
  it('integrals and definite integrals', () => {
    const f = S.add(S.mul(S.rat(3), X2), S.fn('cos', x), S.pow(x, S.MINUS)), r = tc.intSteps(f, 'x');
    expect(same(S.diff(r.result!, 'x'), f)).toBe(true);
    expect(r.steps[0].rule).toMatch(/linearity/);
    const d = tc.intSteps(X2, 'x', [S.ZERO, S.rat(3)]);
    expect(S.val(d.result!)).toBe(9);
    expect(d.steps.at(-1)!.rule).toMatch(/fundamental theorem/);
  });
  it('equations: linear and the quadratic formula', () => {
    const lin = tc.solveSteps(S.eq(S.add(S.mul(S.rat(3), x), S.rat(4)), S.rat(10)), 'x');
    expect(S.val(lin.result[0])).toBe(2);
    const qd = tc.solveSteps(S.add(X2, S.mul(S.rat(-5), x), S.rat(6)), 'x');
    expect(qd.result.map(S.val).sort()).toEqual([2, 3]);
    expect(qd.steps.some((s) => /discriminant/.test(s.rule) && s.plain.includes('1'))).toBe(true);
    expect(tc.solveSteps(S.add(X2, S.ONE), 'x').steps.some((s) => /complex/.test(s.rule))).toBe(true);
  });
  it('linear algebra with exact fractions', () => {
    const A = [[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]].map((r) => r.map((v) => S.rat(v)));
    const r = tc.rrefSteps(A);
    // The textbook system: x = 2, y = 3, z = −1.
    expect(r.R.map((row) => S.val(row[3]))).toEqual([2, 3, -1]);
    expect(r.rank).toBe(3);
    const sq = tc.rrefSteps([[0, 2], [3, 4]].map((rw) => rw.map((v) => S.rat(v))));
    expect(S.val(sq.det!)).toBe(-6);
    expect(sq.swaps).toBe(1);
    const e = tc.eigSteps([[2, 1], [1, 2]].map((rw) => rw.map((v) => S.rat(v))));
    expect(e.values.map(S.val).sort()).toEqual([1, 3]);
  });
  it('in the language', () => {
    const r = run("syms x\n[d, s] = diffSteps(x^2*sin(x)); n = numel(s);\nintSteps(3*x^2 + 2, x, 0, 2)\nsolveSteps(x^2 - 5*x + 6 == 0, x)\ndetSteps([1 2; 3 4])\n[S, ex] = riemannSum(@(t) t.^2, 0, 3, 100); err = abs(S - ex);\nxs = newtonSteps(@(t) t.^2 - 2, 1, 6);\ntangentLine(@(t) sin(t), 1)\nfigure; taylorPlot(sin(x), 0, [1 3 5])");
    expect(r.d('n')[0]).toBeGreaterThan(3);
    expect(r.out).toContain('the fundamental theorem');
    expect(r.out).toContain('= 12');
    expect(r.out).toContain('the discriminant');
    expect(r.out).toMatch(/det A = -2|det A = −2/);
    expect(r.d('err')[0]).toBeLessThan(1e-3);
    expect(r.d('xs').at(-1)).toBeCloseTo(Math.SQRT2, 12);
    expect(r.graphics.figures.length).toBe(2);
  });
});
