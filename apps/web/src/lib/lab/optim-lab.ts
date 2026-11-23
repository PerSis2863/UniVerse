import { LabError } from './parse';
import { BUILTINS, random, type Builtin } from './builtins';
import type { Lab } from './interp';
import { textOf } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as op from './optim';
import * as om from './optim-multi';

// Hyperion's optimisation toolbox in the language (M422): fminsearch, fminunc, fmincon, linprog, intlinprog,
// quadprog, lsqnonlin, lsqcurvefit, fsolve, ga, particleswarm, optimset and optimoptions. Display 'iter' prints each
// step, 'PlotFcns', 'optimplotfval' draws the objective by iteration, and every output struct also carries `path` (a
// row per iterate) so the way the solver went can be drawn over a contour.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const isEmpty = (v: Value | undefined) => !v || (v.k === 'mat' && v.d.length === 0);
const vec = (v: Value | undefined, what: string): number[] => (isEmpty(v) ? [] : [...toMat(v!, what).d]);
const rows = (v: Value | undefined, what: string): number[][] => { if (isEmpty(v)) return []; const m = toMat(v!, what); return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r])); };
const matRows = (R: number[][], c: number): Mat => { const m = mat(R.length, c); R.forEach((r, i) => r.forEach((v, j) => { m.d[i + j * R.length] = v; })); return m; };

// ——— Options ———
const ALIASES: Record<string, string> = {
  tolx: 'steptolerance', steptolerance: 'steptolerance', tolfun: 'functiontolerance', functiontolerance: 'functiontolerance', optimalitytolerance: 'optimalitytolerance',
  maxiter: 'maxiterations', maxiterations: 'maxiterations', maxfunevals: 'maxfunctionevaluations', maxfunctionevaluations: 'maxfunctionevaluations',
  display: 'display', plotfcns: 'plotfcns', plotfcn: 'plotfcns', gradobj: 'specifyobjectivegradient', specifyobjectivegradient: 'specifyobjectivegradient',
  populationsize: 'populationsize', maxgenerations: 'maxgenerations', swarmsize: 'swarmsize', hybridfcn: 'hybridfcn', paretosetsize: 'paretosetsize',
};
const NAMES: Record<string, string> = { steptolerance: 'StepTolerance', functiontolerance: 'FunctionTolerance', optimalitytolerance: 'OptimalityTolerance', maxiterations: 'MaxIterations', maxfunctionevaluations: 'MaxFunctionEvaluations', display: 'Display', plotfcns: 'PlotFcns', specifyobjectivegradient: 'SpecifyObjectiveGradient', populationsize: 'PopulationSize', maxgenerations: 'MaxGenerations', swarmsize: 'SwarmSize', hybridfcn: 'HybridFcn', paretosetsize: 'ParetoSetSize' };
function makeOptions(a: Value[]): Struct {
  const f = new Map<string, Value>();
  let i = 0;
  if (a[0]?.k === 'struct') { for (const [k, v] of a[0].f) f.set(k, v); i = 1; }
  for (; i < a.length; i += 2) {
    if (a[i].k !== 'str') throw new LabError('Options come in pairs: a name in quotes, then its value.');
    const key = ALIASES[(a[i] as { v: string }).v.toLowerCase()];
    if (!key) throw new LabError(`“${(a[i] as { v: string }).v}” isn’t an option Hyperion's solvers know (they know ${Object.values(NAMES).join(', ')}).`);
    if (!a[i + 1]) throw new LabError(`The option ${NAMES[key]} needs a value.`);
    f.set(NAMES[key], a[i + 1]);
  }
  return { k: 'struct', f };
}
def('optimset', (a) => [makeOptions(a)]);
// optimoptions('fmincon', 'Display', 'iter'): the solver's name is accepted and not needed.
def('optimoptions', (a) => [makeOptions(a[0]?.k === 'str' && !ALIASES[a[0].v.toLowerCase()] ? a.slice(1) : a)]);
interface Read { tolX?: number; tolFun?: number; tolOpt?: number; maxIter?: number; maxEvals?: number; display: string; plots: string[]; grad: boolean; pop?: number; gens?: number }
function readOptions(v: Value | undefined, display: string): Read {
  const s = v && v.k === 'struct' ? v : null, get = (k: string) => s?.f.get(k);
  const n = (k: string) => { const x = get(k); return x && !isEmpty(x) ? toMat(x).d[0] : undefined; };
  const plot = get('PlotFcns'), plots = !plot ? [] : (plot.k === 'cell' ? plot.d : [plot]).map((p) => (p.k === 'fn' ? p.name ?? '' : p.k === 'str' ? p.v : '').toLowerCase());
  const g = get('SpecifyObjectiveGradient');
  return { tolX: n('StepTolerance'), tolFun: n('FunctionTolerance'), tolOpt: n('OptimalityTolerance'), maxIter: n('MaxIterations'), maxEvals: n('MaxFunctionEvaluations'), display: get('Display') ? textOf(get('Display')!).toLowerCase() : display, plots, grad: !!g && (g.k === 'str' ? /^(on|true)$/i.test(g.v) : toMat(g).d[0] !== 0), pop: n('PopulationSize') ?? n('SwarmSize'), gens: n('MaxGenerations') ?? n('MaxIterations') };
}

// ——— Calling the person's functions ———
function objective(lab: Lab, fn: Value, shape: [number, number], what = 'The objective'): op.Fn {
  if (fn.k !== 'fn' && fn.k !== 'str') throw new LabError(`${what} must be a function, like @(x) x(1)^2 + x(2)^2.`);
  return (x) => { const v = toMat(lab.callFn(fn, [mat(shape[0], shape[1], x)])[0], what); if (v.d.length !== 1) throw new LabError(`${what} must give one number.`); return v.d[0]; };
}
const shapeOf = (m: Mat): [number, number] => (m.r === 1 ? [1, m.c] : [m.d.length, 1]);

/** Prints each step ('iter') and keeps the objective by iteration for the plot. */
function watcher(lab: Lab, o: Read, header: string) {
  const fs: number[] = [];
  if (o.display === 'iter') lab.host.out(`${header}\n`);
  return {
    fs,
    onIter: (k: number, _x: number[], f: number, evals: number) => { fs.push(f); if (o.display === 'iter') lab.host.out(`${String(k).padStart(6)}  ${String(evals).padStart(8)}   ${String(+f.toPrecision(6)).padEnd(14)}\n`); },
  };
}
function finish(lab: Lab, o: Read, r: op.Result, w: { fs: number[] }, algorithm: string, solver: string) {
  const ok = r.flag > 0;
  if (o.display === 'iter' || o.display === 'final' || (o.display === 'notify' && !ok)) lab.host.out(`${ok ? '' : `${solver}: `}${r.message}\n`);
  if (o.plots.includes('optimplotfval') && w.fs.length) {
    call(lab, 'figure');
    call(lab, 'plot', mat(1, w.fs.length, w.fs.map((_, i) => i + 1)), mat(1, w.fs.length, w.fs), str('o-'));
    call(lab, 'title', str(`Current function value: ${+r.f.toPrecision(6)}`)); call(lab, 'xlabel', str('Iteration')); call(lab, 'ylabel', str('Function value')); call(lab, 'grid', str('on'));
  }
  if (o.plots.includes('optimplotx')) { call(lab, 'figure'); call(lab, 'bar', mat(1, r.x.length, r.x)); call(lab, 'title', str('Current point')); call(lab, 'xlabel', str('Variable number')); }
  return { k: 'struct', f: new Map<string, Value>([['iterations', num(r.iterations)], ['funcCount', num(r.evals)], ['algorithm', str(algorithm)], ['message', str(r.message)], ...(r.violation !== undefined ? [['constrviolation', num(r.violation)] as [string, Value]] : []), ['path', matRows(r.path, r.x.length)]]) } satisfies Struct;
}
const HEAD = ' Iteration  F-count   f(x)';
const out = (x0: Mat, x: number[]) => mat(x0.r === 1 ? 1 : x.length, x0.r === 1 ? x.length : 1, x);

def('fminsearch', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('fminsearch needs a function and a starting point: fminsearch(@(x) (x(1)-1)^2 + x(2)^2, [0 0]).');
  const x0 = toMat(a[1], 'The starting point'), o = readOptions(a[2], 'notify'), w = watcher(lab, o, HEAD);
  const r = op.nelderMead(objective(lab, a[0], shapeOf(x0)), [...x0.d], { tolX: o.tolX, tolFun: o.tolFun, maxIter: o.maxIter, maxEvals: o.maxEvals, onIter: w.onIter });
  return [out(x0, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'Nelder-Mead simplex direct search', 'fminsearch')];
});
def('fminunc', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('fminunc needs a function and a starting point.');
  const x0 = toMat(a[1], 'The starting point'), o = readOptions(a[2], 'final'), w = watcher(lab, o, HEAD), shape = shapeOf(x0);
  const grad = o.grad ? (x: number[]) => [...toMat(lab.callFn(a[0], [mat(shape[0], shape[1], x)], 2)[1], 'The gradient').d] : undefined;
  const r = op.bfgs(objective(lab, a[0], shape), [...x0.d], { tolX: o.tolX, tolFun: o.tolFun, tolOpt: o.tolOpt, maxIter: o.maxIter, maxEvals: o.maxEvals, grad, onIter: w.onIter });
  return [out(x0, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'quasi-newton (BFGS)', 'fminunc'), mat(r.x.length, 1, op.numGrad(objective(lab, a[0], shape), r.x))];
});
function constraintsOf(lab: Lab, a: Value[], from: number, n: number, shape: [number, number], nonlcon?: Value): op.Constraints {
  const k: op.Constraints = { A: rows(a[from], 'A'), b: vec(a[from + 1], 'b'), Aeq: rows(a[from + 2], 'Aeq'), beq: vec(a[from + 3], 'beq'), lb: vec(a[from + 4], 'lb'), ub: vec(a[from + 5], 'ub') };
  if (k.A!.some((r) => r.length !== n) || k.A!.length !== k.b!.length) throw new LabError(`A needs ${n} columns and one row per entry of b.`);
  if (k.Aeq!.some((r) => r.length !== n) || k.Aeq!.length !== k.beq!.length) throw new LabError(`Aeq needs ${n} columns and one row per entry of beq.`);
  if ((k.lb!.length && k.lb!.length !== n) || (k.ub!.length && k.ub!.length !== n)) throw new LabError(`lb and ub need ${n} entries (or [] for none).`);
  if (nonlcon && !isEmpty(nonlcon)) k.nonlcon = (x) => { const r = lab.callFn(nonlcon, [mat(shape[0], shape[1], x)], 2); return [vec(r[0], 'c'), vec(r[1], 'ceq')]; };
  return k;
}
def('fmincon', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('fmincon needs a function, a starting point and constraints: fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon).');
  const x0 = toMat(a[1], 'The starting point'), shape = shapeOf(x0), o = readOptions(a[9], 'final'), w = watcher(lab, o, HEAD);
  const k = constraintsOf(lab, a, 2, x0.d.length, shape, a[8]);
  const grad = o.grad ? (x: number[]) => [...toMat(lab.callFn(a[0], [mat(shape[0], shape[1], x)], 2)[1], 'The gradient').d] : undefined;
  const r = op.augLag(objective(lab, a[0], shape), [...x0.d], k, { grad, onIter: w.onIter });
  return [out(x0, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'augmented Lagrangian (bound-projected BFGS)', 'fmincon')];
});
def('quadprog', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('quadprog needs H and f: quadprog(H, f, A, b, Aeq, beq, lb, ub).');
  const H = rows(a[0], 'H'), f = vec(a[1], 'f'), n = f.length;
  if (H.length !== n || H.some((r) => r.length !== n)) throw new LabError(`H must be ${n} × ${n}, as long as f.`);
  const k = constraintsOf(lab, a, 2, n, [n, 1]), x0 = !isEmpty(a[8]) ? vec(a[8], 'x0') : new Array(n).fill(0), o = readOptions(a[9], 'final'), w = watcher(lab, o, HEAD);
  const q = (x: number[]) => 0.5 * x.reduce((s, xi, i) => s + xi * H[i].reduce((t, h, j) => t + h * x[j], 0), 0) + f.reduce((s, v, i) => s + v * x[i], 0);
  const r = op.augLag(q, x0, k, { grad: (x) => H.map((row, i) => row.reduce((t, h, j) => t + h * x[j], 0) + f[i]), onIter: w.onIter });
  return [mat(n, 1, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'augmented Lagrangian', 'quadprog')];
});
def('linprog', (a, _n, lab) => {
  if (!a[0]) throw new LabError('linprog needs the costs f: linprog(f, A, b, Aeq, beq, lb, ub).');
  const f = vec(a[0], 'f'), k = constraintsOf(lab, a, 1, f.length, [f.length, 1]), o = readOptions(a[7], 'final');
  const r = op.linprog(f, k);
  return [mat(f.length, 1, r.x), num(r.f), num(r.flag), finish(lab, o, r, { fs: [] }, 'dual simplex (two-phase, Bland)', 'linprog')];
});
def('intlinprog', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('intlinprog needs the costs and which variables are whole: intlinprog(f, intcon, A, b, Aeq, beq, lb, ub).');
  const f = vec(a[0], 'f'), intcon = vec(a[1], 'intcon'), k = constraintsOf(lab, a, 2, f.length, [f.length, 1]), o = readOptions(a[9] ?? a[8], 'final');
  if (intcon.some((i) => !(i >= 1 && i <= f.length && Number.isInteger(i)))) throw new LabError(`intcon lists variable numbers from 1 to ${f.length}.`);
  const r = op.intlinprog(f, intcon, k);
  return [mat(f.length, 1, r.x), num(r.f), num(r.flag), finish(lab, o, r, { fs: [] }, 'branch and bound on the simplex method', 'intlinprog')];
});
function leastSquares(lab: Lab, residual: (x: number[]) => number[], x0: Mat, lbv: Value | undefined, ubv: Value | undefined, ov: Value | undefined, solver: string) {
  const o = readOptions(ov, 'final'), w = watcher(lab, o, ' Iteration  F-count   sum of squares');
  const r = op.levenbergMarquardt(residual, [...x0.d], { lb: vec(lbv, 'lb'), ub: vec(ubv, 'ub'), maxIter: o.maxIter, tolX: o.tolX, tolFun: o.tolFun, tolOpt: o.tolOpt, onIter: w.onIter });
  return { r, output: finish(lab, o, r, w, 'levenberg-marquardt', solver) };
}
def('lsqnonlin', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('lsqnonlin needs a function giving the residuals and a starting point.');
  const x0 = toMat(a[1], 'The starting point'), shape = shapeOf(x0);
  const { r, output } = leastSquares(lab, (x) => vec(lab.callFn(a[0], [mat(shape[0], shape[1], x)])[0], 'The residuals'), x0, a[2], a[3], a[4], 'lsqnonlin');
  return [out(x0, r.x), num(r.f), mat(r.residual.length, 1, r.residual), num(r.flag), output];
});
def('lsqcurvefit', (a, _n, lab) => {
  if (a.length < 4) throw new LabError('lsqcurvefit needs a model, a starting point and the data: lsqcurvefit(@(p, x) p(1)*exp(p(2)*x), p0, xdata, ydata).');
  const x0 = toMat(a[1], 'The starting point'), shape = shapeOf(x0), yd = vec(a[3], 'ydata');
  const { r, output } = leastSquares(lab, (x) => { const y = vec(lab.callFn(a[0], [mat(shape[0], shape[1], x), a[2]])[0], 'The model'); if (y.length !== yd.length) throw new LabError(`The model gives ${y.length} values for ${yd.length} data points.`); return y.map((v, i) => v - yd[i]); }, x0, a[4], a[5], a[6], 'lsqcurvefit');
  return [out(x0, r.x), num(r.f), mat(r.residual.length, 1, r.residual), num(r.flag), output];
});
def('fsolve', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('fsolve needs a function F (with F(x) = 0 wanted) and a starting point.');
  const x0 = toMat(a[1], 'The starting point'), shape = shapeOf(x0);
  const { r, output } = leastSquares(lab, (x) => vec(lab.callFn(a[0], [mat(shape[0], shape[1], x)])[0], 'F'), x0, undefined, undefined, a[2], 'fsolve');
  const solved = Math.sqrt(r.f) <= 1e-6;
  return [out(x0, r.x), mat(r.residual.length, 1, r.residual), num(solved ? 1 : -2), output];
});
def('ga', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('ga needs a function and the number of variables: ga(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options).');
  const n = Math.round(toMat(a[1]).d[0]), k = constraintsOf(lab, a, 2, n, [1, n], a[8]), o = readOptions(a[9], 'final'), w = watcher(lab, o, ' Generation  F-count   Best f(x)');
  const penalty = (x: number[]) => { let v = 0; (k.A ?? []).forEach((row, i) => { v += Math.max(0, row.reduce((s, q, j) => s + q * x[j], 0) - k.b![i]); }); (k.Aeq ?? []).forEach((row, i) => { v += Math.abs(row.reduce((s, q, j) => s + q * x[j], 0) - k.beq![i]); }); if (k.nonlcon) { const [c, ceq] = k.nonlcon(x); v += c.reduce((s, q) => s + Math.max(0, q), 0) + ceq.reduce((s, q) => s + Math.abs(q), 0); } return v; };
  const r = op.ga(objective(lab, a[0], [1, n]), n, random, { lb: k.lb, ub: k.ub, pop: o.pop, gens: o.gens, penalty, onIter: w.onIter });
  return [mat(1, n, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'genetic algorithm', 'ga')];
});
def('particleswarm', (a, _n, lab) => {
  if (a.length < 2) throw new LabError('particleswarm needs a function and the number of variables: particleswarm(fun, nvars, lb, ub).');
  const n = Math.round(toMat(a[1]).d[0]), o = readOptions(a[4], 'final'), w = watcher(lab, o, ' Iteration  F-count   Best f(x)');
  const r = op.particleswarm(objective(lab, a[0], [1, n]), n, random, { lb: vec(a[2], 'lb'), ub: vec(a[3], 'ub'), size: o.pop, iters: o.maxIter, onIter: w.onIter });
  return [mat(1, n, r.x), num(r.f), num(r.flag), finish(lab, o, r, w, 'particle swarm', 'particleswarm')];
});

// ——— Several goals at once (M440) ———
/** A function giving a row of goals for a row of variables. */
function goals(lab: Lab, fn: Value, n: number): om.MultiFn {
  if (fn.k !== 'fn' && fn.k !== 'str') throw new LabError('The goals must be a function giving a row of numbers, like @(x) [x(1)^2, (x(1)-2)^2].');
  return (x) => [...toMat(lab.callFn(fn, [mat(1, n, x)])[0], 'The goals').d];
}
const frontOut = (P: { x: number[]; f: number[] }[], n: number) => [matRows(P.map((p) => p.x), n), matRows(P.map((p) => p.f), P[0]?.f.length ?? 0)];
const drawFront = (lab: Lab, P: { f: number[] }[], name: string) => {
  const m = P[0]?.f.length ?? 0;
  if (m === 2) call(lab, 'plot', mat(1, P.length, P.map((p) => p.f[0])), mat(1, P.length, P.map((p) => p.f[1])), str('o'));
  else if (m >= 3) call(lab, 'plot3', mat(1, P.length, P.map((p) => p.f[0])), mat(1, P.length, P.map((p) => p.f[1])), mat(1, P.length, P.map((p) => p.f[2])), str('o'));
  call(lab, 'xlabel', str('Goal 1')); call(lab, 'ylabel', str('Goal 2')); if (m >= 3) call(lab, 'zlabel', str('Goal 3'));
  call(lab, 'grid', str('on')); call(lab, 'title', str(`${name}: ${P.length} best trade-offs (the Pareto front)`));
};
def('gamultiobj', (a, nout, lab) => {
  if (a.length < 2) throw new LabError('gamultiobj needs the goals and the number of variables: gamultiobj(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options).');
  const n = Math.round(toMat(a[1]).d[0]), k = constraintsOf(lab, a, 2, n, [1, n], a[8]), o = readOptions(a[9], 'off');
  if (!k.lb?.length || !k.ub?.length || k.lb.some((v, i) => !(Number.isFinite(v) && Number.isFinite(k.ub![i]) && k.ub![i] > v))) throw new LabError('gamultiobj needs finite bounds lb and ub for every variable.');
  const f = goals(lab, a[0], n), rough = om.nsga2(f, n, k.lb, k.ub, random, { pop: o.pop, gens: o.gens, violation: (x) => om.violation(k, x) });
  // Polished onto the true front point by point (MATLAB's hybrid step) unless options say 'HybridFcn', 'none'.
  const hy = a[9] && a[9].k === 'struct' ? a[9].f.get('HybridFcn') : undefined, P = hy && hy.k === 'str' && /^none$/i.test(hy.v) ? rough : om.polish(f, n, { ...k, lb: k.lb, ub: k.ub }, rough);
  if (!P.length) throw new LabError('No point kept every constraint: loosen them or widen the bounds.');
  if (nout === 0) { drawFront(lab, P, 'Genetic algorithm (NSGA-II)'); return []; }
  return [...frontOut(P, n), num(1)];
});
def('paretosearch', (a, nout, lab) => {
  if (a.length < 2) throw new LabError('paretosearch needs the goals and the number of variables: paretosearch(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options).');
  const n = Math.round(toMat(a[1]).d[0]), k = constraintsOf(lab, a, 2, n, [1, n], a[8]), s = a[9] && a[9].k === 'struct' ? a[9] : null;
  if (!k.lb?.length || !k.ub?.length) throw new LabError('paretosearch needs bounds lb and ub for every variable.');
  const size = s?.f.get('ParetoSetSize') ? Math.round(toMat(s.f.get('ParetoSetSize')!).d[0]) : 30;
  const P = om.paretoSearch(goals(lab, a[0], n), n, { ...k, lb: k.lb, ub: k.ub }, random, Math.max(2, Math.min(200, size)));
  if (!P.length) throw new LabError('No point kept every constraint: loosen them or widen the bounds.');
  if (nout === 0) { drawFront(lab, P, 'Pareto search'); return []; }
  return [...frontOut(P, n), num(1)];
});

