import { augLag, type Constraints, type Fn, type Rand, type Result } from './optim';
import type { MultiFn } from './optim-multi';

// Hyperion's rarer solvers (M441), pure: Brent's root finder and minimiser (fzero, fminbnd), non-negative and
// constrained linear least squares (lsqnonneg, lsqlin), goal attainment and minimax (fgoalattain, fminimax), pattern
// search and simulated annealing (patternsearch, simulannealbnd).

const EPS = 2.220446049250313e-16;
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Scalar { x: number; f: number; iterations: number; evals: number; flag: number; message: string }

/** Brent's method (zeroin): bisection kept safe, secant and inverse quadratic steps when they help. a, b must bracket. */
export function brentZero(f: (x: number) => number, a: number, b: number, tolX = EPS, maxIter = 400): Scalar {
  let fa = f(a), fb = f(b), evals = 2;
  if (fa === 0) return { x: a, f: 0, iterations: 0, evals, flag: 1, message: 'Zero found at the end of the interval.' };
  if (fb === 0) return { x: b, f: 0, iterations: 0, evals, flag: 1, message: 'Zero found at the end of the interval.' };
  if (Math.sign(fa) === Math.sign(fb)) return { x: NaN, f: NaN, iterations: 0, evals, flag: -6, message: 'The function has the same sign at both ends of the interval.' };
  let c = a, fc = fa, d = b - a, e = d, k = 0;
  for (; k < maxIter; k++) {
    if (Math.sign(fb) === Math.sign(fc)) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol = 2 * EPS * Math.abs(b) + tolX / 2, m = (c - b) / 2;
    if (Math.abs(m) <= tol || fb === 0) break;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      let p: number, q: number;
      const s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else { const qq = fa / fc, r = fb / fc; p = s * (2 * m * qq * (qq - r) - (b - a) * (r - 1)); q = (qq - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b); evals++;
  }
  return { x: b, f: fb, iterations: k, evals, flag: k < maxIter ? 1 : 0, message: k < maxIter ? 'Zero found in the interval.' : 'Stopped at the iteration limit.' };
}

/** fzero's search for a sign change around a single guess: widening by √2 each side, as MATLAB does. */
export function bracket(f: (x: number) => number, x0: number): { a: number; b: number; evals: number } | null {
  const f0 = f(x0);
  if (f0 === 0) return { a: x0, b: x0, evals: 1 };
  let dx = x0 === 0 ? 1 / 50 : Math.abs(x0) / 50;
  for (let k = 0; k < 200 && Number.isFinite(dx); k++, dx *= Math.SQRT2) {
    const lo = x0 - dx, hi = x0 + dx, flo = f(lo), fhi = f(hi);
    if (Math.sign(flo) !== Math.sign(f0) && Number.isFinite(flo)) return { a: lo, b: x0, evals: 2 * k + 3 };
    if (Math.sign(fhi) !== Math.sign(f0) && Number.isFinite(fhi)) return { a: x0, b: hi, evals: 2 * k + 3 };
  }
  return null;
}

/** Brent's minimiser on [a, b]: golden sections, parabolic steps when they fall inside and shrink enough. */
export function brentMin(f: (x: number) => number, a: number, b: number, tolX = 1e-4, maxIter = 500): Scalar {
  const g = (3 - Math.sqrt(5)) / 2;
  let x = a + g * (b - a), w = x, v = x, fx = f(x), fw = fx, fv = fx, d = 0, e = 0, evals = 1, k = 0;
  for (; k < maxIter; k++) {
    const m = (a + b) / 2, tol = Math.sqrt(EPS) * Math.abs(x) + tolX / 3, t2 = 2 * tol;
    if (Math.abs(x - m) <= t2 - (b - a) / 2) break;
    let golden = true;
    if (Math.abs(e) > tol) {
      let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r); if (q > 0) p = -p; else q = -q;
      r = e;
      if (Math.abs(p) < Math.abs(0.5 * q * r) && p > q * (a - x) && p < q * (b - x)) {
        e = d; d = p / q; golden = false;
        const u = x + d;
        if (u - a < t2 || b - u < t2) d = x < m ? tol : -tol;
      }
    }
    if (golden) { e = (x < m ? b : a) - x; d = g * e; }
    const u = x + (Math.abs(d) >= tol ? d : d > 0 ? tol : -tol), fu = f(u); evals++;
    if (fu <= fx) { if (u < x) b = x; else a = x; v = w; fv = fw; w = x; fw = fx; x = u; fx = fu; }
    else {
      if (u < x) a = u; else b = u;
      if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; }
    }
  }
  return { x, f: fx, iterations: k, evals, flag: k < maxIter ? 1 : 0, message: k < maxIter ? 'The smallest value within the tolerance.' : 'Stopped at the iteration limit.' };
}

// ——— Linear least squares ———
/** Solves the normal equations of the chosen columns (Cholesky-free: Gaussian elimination with pivoting). */
function lsCols(C: number[][], d: number[], P: number[]): number[] {
  const n = P.length, A = P.map((i) => P.map((j) => C.reduce((s, row) => s + row[i] * row[j], 0))), b = P.map((i) => C.reduce((s, row, r) => s + row[i] * d[r], 0));
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-300) continue;
    for (let r = i + 1; r < n; r++) { const q = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= q * A[i][c]; b[r] -= q * b[i]; }
  }
  const z = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) z[i] = Math.abs(A[i][i]) < 1e-300 ? 0 : (b[i] - A[i].slice(i + 1).reduce((s, v, j) => s + v * z[i + 1 + j], 0)) / A[i][i];
  return z;
}

/** Lawson and Hanson's active set method: the least-squares x ≥ 0 for C x ≈ d. lambda is the gradient's multipliers. */
export function nnls(C: number[][], d: number[], tol?: number) {
  const n = C[0]?.length ?? 0, x = new Array(n).fill(0), Pset = new Set<number>();
  const grad = () => Array.from({ length: n }, (_, j) => C.reduce((s, row, r) => s + row[j] * (d[r] - dot(row, x)), 0));
  const t = tol ?? 10 * EPS * Math.max(1, ...C.map((r) => r.reduce((s, v) => s + Math.abs(v), 0))) * Math.max(C.length, n);
  let iterations = 0, w = grad();
  while (iterations < 3 * n + 30) {
    const free = [...Array(n).keys()].filter((j) => !Pset.has(j) && w[j] > t);
    if (!free.length) break;
    Pset.add(free.reduce((best, j) => (w[j] > w[best] ? j : best)));
    for (;;) {
      iterations++;
      const P = [...Pset].sort((a, b) => a - b), z = lsCols(C, d, P);
      if (z.every((v) => v > 0)) { P.forEach((j, i) => { x[j] = z[i]; }); break; }
      let alpha = Infinity;
      P.forEach((j, i) => { if (z[i] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[i])); });
      P.forEach((j, i) => { x[j] += alpha * (z[i] - x[j]); if (Math.abs(x[j]) < t || x[j] < 0) { x[j] = 0; Pset.delete(j); } });
      if (!Pset.size) break;
    }
    w = grad();
  }
  const residual = C.map((row, r) => d[r] - dot(row, x));
  return { x, resnorm: dot(residual, residual), residual, lambda: w.map((v, j) => (Pset.has(j) ? 0 : -v)), iterations };
}

/** Least squares with linear constraints and bounds: ½‖C x − d‖² through the augmented Lagrangian with its exact gradient. */
export function lsqlin(C: number[][], d: number[], k: Constraints, x0?: number[]): Result & { residual: number[] } {
  const n = C[0]?.length ?? 0, CtC = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => C.reduce((s, r) => s + r[i] * r[j], 0))), Ctd = Array.from({ length: n }, (_, i) => C.reduce((s, r, q) => s + r[i] * d[q], 0));
  const f = (x: number[]) => C.reduce((s, row, r) => s + (dot(row, x) - d[r]) ** 2, 0) / 2;
  const r = augLag(f, x0 ?? new Array(n).fill(0), k, { grad: (x) => CtC.map((row, i) => dot(row, x) - Ctd[i]) });
  const residual = C.map((row, q) => dot(row, r.x) - d[q]);
  return { ...r, f: dot(residual, residual), residual };
}

// ——— Goal attainment and minimax ———
/** Minimises γ with F(x) − weight·γ ≤ goal (and the person's constraints): an extra variable γ, as MATLAB poses it.
 * A zero weight makes that goal a hard limit. fminimax is goal 0, weight 1 (γ is then the largest of the F's). */
export function goalAttain(F: MultiFn, x0: number[], goal: number[], weight: number[], k: Constraints): Result & { fval: number[]; gamma: number } {
  const n = x0.length, f0 = F(x0);
  if (goal.length !== f0.length || weight.length !== f0.length) throw new Error(`goal and weight need ${f0.length} entries, one per goal.`);
  const g0 = Math.max(0, ...f0.map((v, i) => (weight[i] > 0 ? (v - goal[i]) / weight[i] : -Infinity)).filter(Number.isFinite));
  const wide = (M?: number[][]) => M?.map((row) => [...row, 0]);
  const kk: Constraints = {
    A: wide(k.A), b: k.b, Aeq: wide(k.Aeq), beq: k.beq,
    lb: k.lb?.length ? [...k.lb, -Infinity] : undefined, ub: k.ub?.length ? [...k.ub, Infinity] : undefined,
    nonlcon: (z) => {
      const x = z.slice(0, n), c = F(x).map((v, i) => v - weight[i] * z[n] - goal[i]);
      if (!k.nonlcon) return [c, []];
      const [c2, ceq] = k.nonlcon(x); return [[...c, ...c2], ceq];
    },
  };
  if (kk.lb && !kk.ub) kk.ub = [...x0.map(() => Infinity), Infinity];
  if (kk.ub && !kk.lb) kk.lb = [...x0.map(() => -Infinity), -Infinity];
  const r = augLag((z) => z[n], [...x0, g0], kk);
  const x = r.x.slice(0, n);
  return { ...r, x, f: r.x[n], path: r.path.map((z) => z.slice(0, n)), fval: F(x), gamma: r.x[n] };
}

// ——— Direct search ———
/** Generalised pattern search: poll ±each axis (opportunistic), double the mesh after a success, halve it after a
 * failure. Bounds are kept by never polling outside them. As the inner solver of the augmented Lagrangian it handles
 * linear and nonlinear constraints too. */
export function patternSearch(f: Fn, x0: number[], lb: number[], ub: number[], o: { meshTol?: number; maxEvals?: number; onStep?: (x: number[], f: number, evals: number) => void } = {}): Result {
  const n = x0.length, meshTol = o.meshTol ?? 1e-6, maxEvals = o.maxEvals ?? 2000 * n;
  let x = x0.map((v, i) => clamp(v, lb[i] ?? -Infinity, ub[i] ?? Infinity)), fx = f(x), mesh = 1, evals = 1, iterations = 0;
  const path = [x.slice()];
  while (mesh > meshTol && evals < maxEvals) {
    iterations++;
    let won = false;
    for (let j = 0; j < 2 * n && !won; j++) {
      const i = j >> 1, y = x.slice();
      y[i] += j & 1 ? -mesh : mesh;
      if (y[i] < (lb[i] ?? -Infinity) || y[i] > (ub[i] ?? Infinity)) continue;
      const fy = f(y); evals++;
      if (fy < fx) { x = y; fx = fy; won = true; }
    }
    mesh *= won ? 2 : 0.5;
    if (won) { path.push(x.slice()); o.onStep?.(x, fx, evals); }
  }
  const ok = mesh <= meshTol;
  return { x, f: fx, iterations, evals, path, flag: ok ? 1 : 0, message: ok ? 'The mesh became smaller than its tolerance.' : 'Stopped at the limit of function evaluations.' };
}

/** Simulated annealing within bounds: random steps of size √T in a random direction, worse points kept with
 * probability 1/(1 + exp(Δ/T)), the temperature T0·0.95^k, reheated (k halved) every 100 accepted points, stopping
 * when the best value moves less than tolFun over stall iterations. */
export function anneal(f: Fn, x0: number[], lb: number[], ub: number[], rand: Rand, o: { T0?: number; maxEvals?: number; stall?: number; tolFun?: number; onIter?: (k: number, x: number[], f: number, evals: number) => void } = {}): Result {
  const n = x0.length, T0 = o.T0 ?? 100, maxEvals = o.maxEvals ?? 3000 * n, stall = o.stall ?? 500 * n, tolFun = o.tolFun ?? 1e-6;
  const lo = (i: number) => lb[i] ?? -Infinity, hi = (i: number) => ub[i] ?? Infinity;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  let x = x0.map((v, i) => clamp(v, lo(i), hi(i))), fx = f(x), best = x.slice(), fBest = fx, evals = 1, k = 0, accepted = 0, since = 0, fMark = fx, iter = 0;
  const path = [x.slice()];
  while (evals < maxEvals && since < stall) {
    iter++; k++;
    const T = T0 * 0.95 ** k, step = Math.sqrt(T), dir = x.map(gauss), len = Math.hypot(...dir) || 1;
    // A step past a bound lands at a random place between the point and that bound (MATLAB's way).
    const y = x.map((v, i) => { const t = v + (step * dir[i]) / len; return t < lo(i) ? v + rand() * (lo(i) - v) : t > hi(i) ? v + rand() * (hi(i) - v) : t; });
    const fy = f(y); evals++;
    const delta = fy - fx;
    if (delta <= 0 || rand() < 1 / (1 + Math.exp(Math.min(700, delta / Math.max(T, 1e-300))))) {
      x = y; fx = fy; accepted++;
      if (accepted % 100 === 0) k = Math.floor(k / 2);
    }
    if (fx < fBest) { best = x.slice(); fBest = fx; path.push(best.slice()); }
    if (fMark - fBest > tolFun) { fMark = fBest; since = 0; } else since++;
    if (iter % 50 === 0) o.onIter?.(iter, best, fBest, evals);
  }
  const ok = since >= stall;
  return { x: best, f: fBest, iterations: iter, evals, path, flag: ok ? 1 : 0, message: ok ? 'The best value stopped improving by more than the tolerance.' : 'Stopped at the limit of function evaluations.' };
}
