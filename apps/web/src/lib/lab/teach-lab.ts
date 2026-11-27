import { LabError } from './parse';
import { BUILTINS } from './builtins';
import { type Lab } from './interp';
import { num, str, toMat, TEX_CLOSE, TEX_MID, TEX_OPEN, type Cell, type Value } from './values';
import { symOf, toSym } from './sym-lab';
import * as S from './sym';
import * as tc from './teach';
import { call, def, need, nums, options, optText, row } from './sci-kit';

// Hyperion's maths teaching in the language (M503): diffSteps, intSteps, solveSteps, rrefSteps, detSteps, eigSteps
// (worked examples on symbolic values, each step set as real maths), and graphs for a class: tangentLine, riemannSum,
// newtonSteps, taylorPlot (live sliders and Sweep animate them). Our own names (MATLAB's Symbolic Math Toolbox gives
// answers, not worked steps).

const expr = (v: Value | undefined, what: string) => { if (!v) throw new LabError(`${what} is needed: make it with syms x, then an expression like x^2*sin(x).`); const s = toSym(v, what); if (s.d.length !== 1) throw new LabError(`${what} must be one expression.`); return s.d[0]; };
const varOf = (e: S.N, v: Value | undefined) => { if (v) { const n = expr(v, 'The variable'); if (n.t !== 's') throw new LabError('The variable must be a symbol, like x.'); return n.name; } const m = S.mainVar(e); if (!m) throw new LabError('That expression has no variable.'); return m; };
const shown = (tex: string, plain: string) => `${TEX_OPEN}${tex}${TEX_MID}${plain}${TEX_CLOSE}`;
function print(lab: Lab, title: string, steps: tc.Step[]) {
  lab.host.out(`${title}\n\n`);
  steps.forEach((s, i) => lab.host.out(`Step ${i + 1}, ${s.rule}:\n\n${shown(s.tex, s.plain)}\n\n`));
}
const stepsCell = (steps: tc.Step[]): Cell => ({ k: 'cell', r: steps.length, c: 1, d: steps.map((s) => str(`${s.rule}: ${s.plain}`)) });
const one = (n: S.N) => symOf(1, 1, [n]);

def('diffSteps', (a, nout, lab) => {
  const e = expr(a[0], 'The expression'), x = varOf(e, a[1]), r = tc.diffSteps(e, x);
  if (nout > 0) return [one(r.result), stepsCell(r.steps)];
  print(lab, `Differentiating with respect to ${x}:`, r.steps);
  return [];
});
def('intSteps', (a, nout, lab) => {
  const e = expr(a[0], 'The expression'), x = varOf(e, a[1]), lim = a.length >= 4 ? [expr(a[2], 'The lower limit'), expr(a[3], 'The upper limit')] as [S.N, S.N] : undefined;
  const r = tc.intSteps(e, x, lim);
  if (nout > 0) return [r.result ? one(r.result) : symOf(0, 0, []), stepsCell(r.steps)];
  print(lab, `Integrating with respect to ${x}:`, r.steps);
  return [];
});
def('solveSteps', (a, nout, lab) => {
  const e = expr(a[0], 'The equation'), x = varOf(e.t === '=' ? S.sub(e.l, e.r) : e, a[1]), r = tc.solveSteps(e, x);
  if (nout > 0) return [symOf(r.result.length, 1, r.result), stepsCell(r.steps)];
  print(lab, `Solving for ${x}:`, r.steps);
  return [];
});
const matrixOf = (v: Value | undefined) => {
  if (!v) throw new LabError('A matrix is needed.');
  const s = toSym(v, 'The matrix');
  if (s.r < 1 || s.c < 1 || s.r > 8 || s.c > 9) throw new LabError('Worked steps take matrices up to 8 × 9 (by hand, that is already a lot).');
  return Array.from({ length: s.r }, (_, i) => Array.from({ length: s.c }, (_, j) => s.d[i + j * s.r]));
};
const symMat = (A: S.N[][]) => symOf(A.length, A[0].length, Array.from({ length: A.length * A[0].length }, (_, k) => A[k % A.length][Math.floor(k / A.length)]));
def('rrefSteps', (a, nout, lab) => {
  const r = tc.rrefSteps(matrixOf(a[0]));
  if (nout > 0) return [symMat(r.R), stepsCell(r.steps), num(r.rank)];
  print(lab, 'Gauss–Jordan elimination:', r.steps);
  lab.host.out(`Rank ${r.rank}; pivots in column${r.pivots.length === 1 ? '' : 's'} ${r.pivots.map((p) => p + 1).join(', ') || 'none'}.\n`);
  return [];
});
def('detSteps', (a, nout, lab) => {
  const A = matrixOf(a[0]);
  if (A.length !== A[0].length) throw new LabError('A determinant needs a square matrix.');
  const r = tc.rrefSteps(A), d = r.det!;
  const last: tc.Step = { rule: `the determinant: the product of the pivots${r.swaps ? `, the sign flipped for each of the ${r.swaps} swap${r.swaps > 1 ? 's' : ''}` : ''}`, tex: `\\det A = ${S.latex(d)}`, plain: `det A = ${S.print(d)}` };
  if (nout > 0) return [one(d), stepsCell([...r.steps, last])];
  print(lab, 'The determinant by elimination:', [...r.steps, last]);
  return [];
});
def('eigSteps', (a, nout, lab) => {
  const A = matrixOf(a[0]);
  if (A.length !== A[0].length || A.length > 4) throw new LabError('eigSteps takes a square matrix up to 4 × 4.');
  const r = tc.eigSteps(A);
  if (nout > 0) return [symOf(r.values.length, 1, r.values), stepsCell(r.steps)];
  print(lab, 'Eigenvalues by the characteristic polynomial:', r.steps);
  return [];
});

// ——— Graphs for a class (numbers, through a function handle) ———
const fnOf = (lab: Lab, v: Value | undefined) => {
  if (v?.k !== 'fn') throw new LabError('Give the function as a handle, like @(x) x.^2.');
  return (x: number) => { const m = toMat(lab.callFn(v, [num(x)])[0], 'The function’s value'); return m.d[0]; };
};
const linspace = (a: number, b: number, n = 400) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
def('tangentLine', (a, _n, lab) => {
  const f = fnOf(lab, a[0]), x0 = need(a[1], 'The point'), range = a[2] ? nums(a[2], 'The range') : [x0 - 3, x0 + 3];
  const h = 1e-5 * Math.max(1, Math.abs(x0)), m = (f(x0 + h) - f(x0 - h)) / (2 * h), y0 = f(x0), xs = linspace(range[0], range[1]);
  call(lab, 'plot', row(xs), row(xs.map(f)), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(xs), row(xs.map((x) => y0 + m * (x - x0))), str('--')); call(lab, 'plot', num(x0), num(y0), str('o'), str('MarkerFaceColor'), str('r')); call(lab, 'hold', str('off'));
  call(lab, 'legend', str('f(x)'), str('Tangent')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`At x = ${+x0.toFixed(4)}: slope ${+m.toFixed(4)}, tangent y = ${+y0.toFixed(4)} ${m < 0 ? '−' : '+'} ${Math.abs(+m.toFixed(4))}(x − ${+x0.toFixed(4)})`));
  return [];
});
def('riemannSum', (a, nout, lab) => {
  const f = fnOf(lab, a[0]), lo = need(a[1], 'a'), hi = need(a[2], 'b'), n = Math.round(need(a[3], 'The number of strips')), how = optText(options(a, 4, ['Method'], 'riemannSum'), 'Method', 'mid').toLowerCase();
  if (!(hi > lo && n >= 1 && n <= 10_000)) throw new LabError('riemannSum(f, a, b, n): a < b, 1 to 10,000 strips.');
  if (!['left', 'right', 'mid', 'trap'].includes(how)) throw new LabError("'Method' is 'left', 'right', 'mid' or 'trap'.");
  const w = (hi - lo) / n, xs = Array.from({ length: n }, (_, i) => lo + i * w);
  const hts = xs.map((x) => (how === 'left' ? f(x) : how === 'right' ? f(x + w) : how === 'mid' ? f(x + w / 2) : (f(x) + f(x + w)) / 2)), sum = hts.reduce((s, v) => s + v * w, 0);
  const exact = toMat(BUILTINS.integral([a[0], num(lo), num(hi)], 1, lab)[0]).d[0];
  if (nout > 0) return [num(sum), num(exact)];
  const fine = linspace(lo, hi);
  // The strips as one outline: up the left edge, across, down the right edge.
  const px: number[] = [], py: number[] = [];
  xs.forEach((x, i) => { if (how === 'trap') { px.push(x, x, x + w, x + w, NaN); py.push(0, f(x), f(x + w), 0, NaN); } else { px.push(x, x, x + w, x + w, NaN); py.push(0, hts[i], hts[i], 0, NaN); } });
  call(lab, 'plot', row(px), row(py), str('Color'), str('#a1a1aa')); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(fine), row(fine.map(f)), str('LineWidth'), num(2)); call(lab, 'hold', str('off')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`${n} ${how} strips: ${sum.toPrecision(8)}; the integral ${exact.toPrecision(8)} (error ${(sum - exact).toExponential(2)})`));
  return [];
});
def('newtonSteps', (a, nout, lab) => {
  const f = fnOf(lab, a[0]), x0 = need(a[1], 'The start'), n = Math.round(a[2] ? need(a[2], 'The steps') : 6);
  if (!(n >= 1 && n <= 50)) throw new LabError('newtonSteps takes 1 to 50 steps.');
  const xs = [x0];
  for (let k = 0; k < n; k++) { const x = xs[k], h = 1e-6 * Math.max(1, Math.abs(x)), d = (f(x + h) - f(x - h)) / (2 * h); if (!Number.isFinite(d) || d === 0) break; xs.push(x - f(x) / d); }
  if (nout > 0) return [row(xs)];
  lab.host.out(`  k   x_k                    f(x_k)\n${xs.map((x, k) => `  ${String(k).padEnd(3)} ${x.toPrecision(16).padEnd(22)} ${f(x).toExponential(3)}`).join('\n')}\n`);
  const lo = Math.min(...xs) - 1, hi = Math.max(...xs) + 1, fine = linspace(lo, hi), px: number[] = [], py: number[] = [];
  for (let k = 0; k + 1 < xs.length; k++) { px.push(xs[k], xs[k], xs[k + 1], NaN); py.push(0, f(xs[k]), 0, NaN); }
  call(lab, 'plot', row(fine), row(fine.map(f)), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(px), row(py), str('r--')); call(lab, 'plot', row([lo, hi]), row([0, 0]), str('k:')); call(lab, 'hold', str('off'));
  call(lab, 'title', str(`Newton's method from ${x0}: ${xs[xs.length - 1].toPrecision(10)} after ${xs.length - 1} steps`)); call(lab, 'grid', str('on'));
  return [];
});
def('taylorPlot', (a, _n, lab) => {
  const e = expr(a[0], 'The expression'), x = varOf(e, undefined), x0 = a[1] ? need(a[1], 'The centre') : 0, orders = a[2] ? nums(a[2], 'The orders').map(Math.round) : [1, 3, 5];
  const range = a[3] ? nums(a[3], 'The range') : [x0 - 4, x0 + 4];
  if (orders.some((k) => !(k >= 0 && k <= 30))) throw new LabError('The orders are 0 to 30.');
  // The derivatives at x0, exactly, then numbers.
  const X = S.sym(x), at = (d: S.N) => S.evalC(S.subst(d, X, S.flt(x0)))[0], ev = (d: S.N, v: number) => S.evalC(S.subst(d, X, S.flt(v)))[0];
  const ds: number[] = [];
  let d = e;
  for (let k = 0; k <= Math.max(...orders); k++) { ds.push(at(d)); d = S.diff(d, x); }
  const xs = linspace(range[0], range[1]), fact = (k: number) => (k < 2 ? 1 : k * fact(k - 1));
  const T = (k: number, v: number) => ds.slice(0, k + 1).reduce((s, c, j) => s + (c / fact(j)) * (v - x0) ** j, 0);
  call(lab, 'plot', row(xs), row(xs.map((v) => ev(e, v))), str('k'), str('LineWidth'), num(2)); call(lab, 'hold', str('on'));
  for (const k of orders) call(lab, 'plot', row(xs), row(xs.map((v) => T(k, v))), str('--'));
  call(lab, 'hold', str('off')); call(lab, 'legend', str(S.print(e)), ...orders.map((k) => str(`order ${k}`)));
  const ys = xs.map((v) => ev(e, v)).filter(Number.isFinite), span = Math.max(...ys) - Math.min(...ys) || 1;
  call(lab, 'ylim', row([Math.min(...ys) - 0.5 * span, Math.max(...ys) + 0.5 * span])); call(lab, 'grid', str('on')); call(lab, 'title', str(`Taylor polynomials about ${x0}`));
  return [];
});
