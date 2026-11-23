import { describe, expect, it } from 'vitest';
import { Lab } from './interp';
import { Graphics, legendSeries } from './plot';
import { toMat } from './values';
import './optim-lab';
import * as op from './optim';

const run = (code: string) => { let out = ''; const graphics = new Graphics(); const lab = new Lab({ out: (t) => { out += t; }, graphics }); lab.run(code); return { out, graphics, d: (n: string) => [...toMat(lab.vars.get(n)!).d] }; };
const rosen = (x: number[]) => 100 * (x[1] - x[0] ** 2) ** 2 + (1 - x[0]) ** 2;
const close = (a: number[], b: number[], tol: number) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(tol));
let seed = 3;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);

describe('Hyperion optimisation (M422): the methods', () => {
  it('Nelder–Mead and BFGS find Rosenbrock’s valley floor at (1, 1)', () => {
    const nm = op.nelderMead(rosen, [-1.2, 1]);
    expect(nm.flag).toBe(1);
    close(nm.x, [1, 1], 1e-3);
    const q = op.bfgs(rosen, [-1.2, 1]);
    close(q.x, [1, 1], 1e-4);
    expect(q.path.length).toBeGreaterThan(5);
  });

  it('constrained: the textbook answers', () => {
    // Rosenbrock inside the unit disc: MATLAB's fmincon example, x ≈ (0.7864, 0.6177).
    const r = op.augLag(rosen, [0, 0], { nonlcon: (x) => [[x[0] ** 2 + x[1] ** 2 - 1], []] });
    close(r.x, [0.7864, 0.6177], 1e-3);
    expect(r.violation).toBeLessThan(1e-6);
    close(op.augLag((x) => x[0] ** 2 + x[1] ** 2, [3, 1], { A: [[-1, -1]], b: [-1] }).x, [0.5, 0.5], 1e-4);
    close(op.augLag((x) => (x[0] - 3) ** 2, [0], { ub: [2] }).x, [2], 1e-6);
    close(op.augLag((x) => x[0] + x[1], [1, 1], { Aeq: [[1, -1]], beq: [0], lb: [0.5, -10] }).x, [0.5, 0.5], 1e-5);
  });

  it('linear programs by the simplex method, and whole-number ones', () => {
    // MATLAB's linprog example: x = (2/3, 4/3), f = −10/9.
    const r = op.linprog([-1, -1 / 3], { A: [[1, 1], [1, 1 / 4], [1, -1], [-1 / 4, -1], [-1, -1], [-1, 1]], b: [2, 1, 2, 1, -1, 2] });
    close(r.x, [2 / 3, 4 / 3], 1e-9);
    expect(r.f).toBeCloseTo(-10 / 9, 9);
    expect(op.linprog([1, 1], { A: [[1, 1]], b: [-1], lb: [0, 0] }).flag).toBe(-2);
    expect(op.linprog([-1, 0], { lb: [0, 0] }).flag).toBe(-3);
    // MATLAB's intlinprog example: x = (0, 5.5, 1), f = −12.
    const m = op.intlinprog([-3, -2, -1], [3], { A: [[1, 1, 1]], b: [7], Aeq: [[4, 2, 1]], beq: [12], lb: [0, 0, 0], ub: [Infinity, Infinity, 1] });
    close(m.x, [0, 5.5, 1], 1e-7);
    expect(m.f).toBeCloseTo(-12, 9);
    // A knapsack: values 10, 13, 7, 8; weights 5, 7, 4, 3; room 12 → items 2 and 3 and… the best is 1 + 2 = 23? No: 2 + 3 (11 kg, 20) or 1 + 4 + 3 (12 kg, 25).
    const k = op.intlinprog([-10, -13, -7, -8], [1, 2, 3, 4], { A: [[5, 7, 4, 3]], b: [12], lb: [0, 0, 0, 0], ub: [1, 1, 1, 1] });
    expect(k.x).toEqual([1, 0, 1, 1]);
  });

  it('least squares, a system of equations, and the global searchers', () => {
    const xs = [0, 0.5, 1, 1.5, 2, 3], ys = xs.map((x) => 2 * Math.exp(-0.5 * x));
    close(op.levenbergMarquardt((p) => xs.map((x, i) => p[0] * Math.exp(p[1] * x) - ys[i]), [1, 0]).x, [2, -0.5], 1e-6);
    close(op.levenbergMarquardt((v) => [v[0] ** 2 + v[1] ** 2 - 4, v[0] - v[1]], [1, 0.5]).x, [Math.SQRT2, Math.SQRT2], 1e-8);
    const rastrigin = (x: number[]) => 20 + x.reduce((s, v) => s + v * v - 10 * Math.cos(2 * Math.PI * v), 0);
    expect(op.ga(rastrigin, 2, rand, { lb: [-5.12, -5.12], ub: [5.12, 5.12] }).f).toBeLessThan(0.05);
    expect(op.particleswarm((x) => x.reduce((s, v) => s + (v - 1) ** 2, 0), 3, rand, { lb: [-5, -5, -5], ub: [5, 5, 5] }).f).toBeLessThan(1e-6);
  });
});

describe('Hyperion optimisation (M422): in the language', () => {
  it('fminsearch, fminunc and fmincon with their outputs and the path', () => {
    const r = run("f = @(x) 100*(x(2) - x(1)^2)^2 + (1 - x(1))^2;\n[x1, f1, e1, o1] = fminsearch(f, [-1.2 1]);\nx2 = fminunc(f, [-1.2; 1], optimoptions('fminunc', 'Display', 'off'));\nnonlcon = @(x) deal(x(1)^2 + x(2)^2 - 1, []);\n[x3, f3] = fmincon(f, [0 0], [], [], [], [], [], [], nonlcon, optimset('Display', 'off'));\nn = size(o1.path, 2);");
    close(r.d('x1'), [1, 1], 1e-3);
    close(r.d('x2'), [1, 1], 1e-4);
    close(r.d('x3'), [0.7864, 0.6177], 1e-3);
    expect(r.d('f3')[0]).toBeCloseTo(0.0457, 3);
    expect(r.d('e1')).toEqual([1]);
    expect(r.d('n')).toEqual([2]);
  });

  it('linprog, intlinprog and quadprog with MATLAB’s examples; least squares and fsolve', () => {
    const r = run("[x, fval] = linprog([-1 -1/3], [1 1; 1 1/4; 1 -1; -1/4 -1; -1 -1; -1 1], [2 1 2 1 -1 2]);\n[q, fq] = quadprog([1 -1; -1 2], [-2; -6], [1 1; -1 2; 2 1], [2; 2; 3]);\n[z, fz] = intlinprog([-3 -2 -1], 3, [1 1 1], 7, [4 2 1], 12, [0 0 0], [Inf Inf 1]);\nxd = 0:0.5:3; yd = 2*exp(-0.5*xd);\np = lsqcurvefit(@(p, x) p(1)*exp(p(2)*x), [1 0], xd, yd);\ns = fsolve(@(v) [v(1)^2 + v(2)^2 - 4; v(1) - v(2)], [1; 0.5]);");
    close(r.d('x'), [2 / 3, 4 / 3], 1e-9);
    close(r.d('q'), [2 / 3, 4 / 3], 1e-4);
    expect(r.d('fq')[0]).toBeCloseTo(-8.2222, 3);
    expect(r.d('fz')[0]).toBeCloseTo(-12, 9);
    close(r.d('p'), [2, -0.5], 1e-6);
    close(r.d('s'), [Math.SQRT2, Math.SQRT2], 1e-8);
    expect(r.out).toContain('The best point was found.');
  });

  it('prints each step, draws the objective, and explains mistakes', () => {
    const r = run("rng(1)\n[x, f] = ga(@(x) sum(x.^2), 2, [], [], [], [], [-5 -5], [5 5], [], optimoptions('ga', 'Display', 'iter', 'PlotFcns', @optimplotfval));");
    expect(r.out).toContain('Generation');
    expect(r.d('f')[0]).toBeLessThan(1e-3);
    expect(r.graphics.figures.length).toBe(1);
    expect(() => run("optimset('Tolerence', 1)")).toThrow(/isn’t an option/);
    expect(() => run('linprog([1 1], [1 1 1], 2)')).toThrow(/A needs 2 columns/);
  });

  it('a contour counts once in a legend (the paths drawn over it keep their own entries)', () => {
    const r = run("[X, Y] = meshgrid(-2:0.2:2); contour(X, Y, X.^2 + Y.^2, 8); hold on; plot([0 1], [0 1]); legend('bowl', 'line')");
    expect(legendSeries([...r.graphics.figures[0].axes.values()][0])).toHaveLength(2);
  });
});

describe('several goals at once (M440)', () => {
  let seed = 5;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  it('NSGA-II finds the ZDT1 front (f2 = 1 − √f1) end to end; Schaffer’s front is x in [0, 2]', async () => {
    const om = await import('./optim-multi');
    const zdt = (x: number[]) => { const g = 1 + (9 * x.slice(1).reduce((p, q) => p + q, 0)) / (x.length - 1); return [x[0], g * (1 - Math.sqrt(x[0] / g))]; };
    const z = om.nsga2(zdt, 10, new Array(10).fill(0), new Array(10).fill(1), rand, { pop: 100, gens: 250 });
    expect(Math.sqrt(z.reduce((s, p) => s + (p.f[1] - (1 - Math.sqrt(p.f[0]))) ** 2, 0) / z.length)).toBeLessThan(0.01);
    expect(Math.min(...z.map((p) => p.f[0]))).toBeLessThan(0.01); expect(Math.max(...z.map((p) => p.f[0]))).toBeGreaterThan(0.95);
    const s = om.nsga2((x) => [x[0] ** 2, (x[0] - 2) ** 2], 1, [-5], [5], rand, { pop: 60, gens: 80 });
    expect(s.every((p) => p.x[0] > -0.01 && p.x[0] < 2.01)).toBe(true);
    // A constraint (x ≥ 1) cuts the front to [1, 2].
    const c = om.nsga2((x) => [x[0] ** 2, (x[0] - 2) ** 2], 1, [-5], [5], rand, { pop: 40, gens: 60, violation: (x) => Math.max(0, 1 - x[0]) });
    expect(Math.min(...c.map((p) => p.x[0]))).toBeGreaterThan(0.999);
  }, 30_000);
  it('Pareto search puts every point exactly on the front', async () => {
    const om = await import('./optim-multi');
    const P = om.paretoSearch((x) => [x[0] ** 2, (x[0] - 2) ** 2], 1, { lb: [-5], ub: [5] }, rand, 20);
    expect(P.length).toBeGreaterThan(15);
    for (const p of P) expect(p.f[1]).toBeCloseTo((Math.sqrt(p.f[0]) - 2) ** 2, 5);
  }, 30_000);
  it('in the language', () => {
    const r = run("rng(1); f = @(x) [x(1)^2 + x(2)^2, (x(1)-1)^2 + (x(2)-1)^2];\n[x, fv] = gamultiobj(f, 2, [], [], [], [], [-2 -2], [2 2], [], optimoptions('gamultiobj', 'PopulationSize', 60, 'MaxGenerations', 200));\ngap = max(fv(:,2) - 2*(1 - sqrt(fv(:,1)/2)).^2);\n[xp, fp] = paretosearch(f, 2, [], [], [], [], [-2 -2], [2 2]);\nn = size(fp, 1);\ngamultiobj(@(x) [x^2, (x-2)^2], 1, [], [], [], [], -5, 5)");
    // The front of two squared distances: on the segment from (0, 0) to (1, 1), f2 = 2(1 − √(f1/2))².
    expect(r.d('gap')[0]).toBeLessThan(0.02);
    expect(r.d('n')[0]).toBeGreaterThan(10);
    expect(r.graphics.figures.length).toBe(1);
    expect(() => run('gamultiobj(@(x) [x, -x], 1)')).toThrow(/bounds/);
  }, 30_000);
});
