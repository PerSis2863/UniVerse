// Hyperion's optimisation (M422, the owner's list: "Optimization"): finding the best x. Our own code from the textbook
// methods: Nelder–Mead (fminsearch), BFGS (fminunc), an augmented Lagrangian around a bound-projected BFGS
// (fmincon, quadprog), the two-phase simplex method with Bland's rule (linprog) and branch and bound (intlinprog),
// Levenberg–Marquardt (lsqnonlin, lsqcurvefit, fsolve), a genetic algorithm (ga) and a particle swarm (particleswarm).
// Every solver keeps the path of its iterates so it can be drawn.

export type Fn = (x: number[]) => number;
export type Rand = () => number;
export interface Opts { tolX?: number; tolFun?: number; tolOpt?: number; maxIter?: number; maxEvals?: number; onIter?: (k: number, x: number[], f: number, evals: number) => void }
export interface Result { x: number[]; f: number; iterations: number; evals: number; path: number[][]; flag: number; message: string; violation?: number }

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Nelder–Mead on a simplex started 5% away from x0 along each axis (0.00025 for a zero entry). */
export function nelderMead(f0: Fn, x0: number[], o: Opts = {}): Result {
  const n = x0.length, tolX = o.tolX ?? 1e-4, tolF = o.tolFun ?? 1e-4, maxIter = o.maxIter ?? 200 * n, maxEvals = o.maxEvals ?? 200 * n;
  let evals = 0;
  const f = (x: number[]) => { evals++; return f0(x); };
  let S = [x0.slice(), ...x0.map((_, i) => { const y = x0.slice(); y[i] = y[i] ? 1.05 * y[i] : 0.00025; return y; })], F = S.map(f);
  const sort = () => { const o2 = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o2.map((i) => S[i]); F = o2.map((i) => F[i]); };
  sort();
  const path = [S[0].slice()];
  let k = 0, flag = 0;
  for (; k < maxIter && evals < maxEvals; k++) {
    if (Math.max(...F.slice(1).map((v) => Math.abs(v - F[0]))) <= tolF && Math.max(...S.slice(1).flatMap((v) => v.map((x, j) => Math.abs(x - S[0][j])))) <= tolX) { flag = 1; break; }
    const c = Array.from({ length: n }, (_, j) => S.slice(0, n).reduce((s, v) => s + v[j], 0) / n), w = S[n];
    const at = (t: number) => c.map((x, j) => x + t * (w[j] - x));
    const xr = at(-1), fr = f(xr);
    if (fr < F[0]) { const xe = at(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else {
      const outside = fr < F[n], xc = at(outside ? -0.5 : 0.5), fc = f(xc);
      if (fc < (outside ? fr : F[n])) { S[n] = xc; F[n] = fc; }
      else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((x, j) => S[0][j] + 0.5 * (x - S[0][j])); F[i] = f(S[i]); } }
    }
    sort();
    path.push(S[0].slice());
    o.onIter?.(k + 1, S[0], F[0], evals);
  }
  return { x: S[0], f: F[0], iterations: k, evals, path, flag, message: flag ? 'The simplex shrank below the tolerances.' : 'Stopped at the limit on iterations or evaluations.' };
}

/** The gradient by central differences (or the one given). */
export const numGrad = (f: Fn, x: number[]) => x.map((v, i) => { const h = 1e-6 * Math.max(1, Math.abs(v)), up = x.slice(), dn = x.slice(); up[i] += h; dn[i] -= h; return (f(up) - f(dn)) / (2 * h); });

/** BFGS (on the box lb ≤ x ≤ ub: a variable held at a bound that the gradient pushes out stays there; steps are
 * projected back into the box). */
export function bfgs(f0: Fn, x0: number[], o: Opts & { grad?: (x: number[]) => number[]; lb?: number[]; ub?: number[] } = {}): Result {
  const n = x0.length, lb = o.lb ?? x0.map(() => -Infinity), ub = o.ub ?? x0.map(() => Infinity), P = (x: number[]) => x.map((v, i) => Math.min(ub[i], Math.max(lb[i], v)));
  let evals = 0;
  const f = (x: number[]) => { evals++; return f0(x); }, grad = o.grad ?? ((x: number[]) => numGrad(f, x));
  let x = P(x0), fx = f(x), g = grad(x), H: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const path = [x.slice()], tolOpt = o.tolOpt ?? 1e-6, tolX = o.tolX ?? 1e-6, maxIter = o.maxIter ?? 400, maxEvals = o.maxEvals ?? 100 * n * 10;
  let k = 0, flag = 0, message = 'Stopped at the limit on iterations or evaluations.';
  for (; k < maxIter && evals < maxEvals; k++) {
    const active = x.map((v, i) => (v <= lb[i] && g[i] > 0) || (v >= ub[i] && g[i] < 0));
    const pg = g.map((v, i) => (active[i] ? 0 : v));
    if (Math.max(...pg.map(Math.abs)) <= tolOpt * Math.max(1, Math.abs(fx))) { flag = 1; message = 'The gradient is (close to) zero: a local minimum.'; break; }
    let d = H.map((row, i) => (active[i] ? 0 : -row.reduce((s, h, j) => s + (active[j] ? 0 : h * g[j]), 0)));
    if (dot(d, pg) >= 0) { H = H.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))); d = pg.map((v) => -v); }
    // The first step is scaled so it isn't wild; then a full step is tried first.
    let t = k === 0 ? Math.min(1, 1 / Math.max(1e-12, norm(pg))) : 1, xn = x, fn = fx, ok = false;
    for (let tries = 0; tries < 50; tries++) {
      xn = P(x.map((v, i) => v + t * d[i])); fn = f(xn);
      if (Number.isFinite(fn) && fn <= fx + 1e-4 * dot(g, xn.map((v, i) => v - x[i]))) { ok = true; break; }
      t /= 2;
    }
    if (!ok) { flag = 2; message = 'No step lowered the objective further.'; break; }
    const gn = grad(xn), s = xn.map((v, i) => v - x[i]), y = gn.map((v, i) => v - g[i]), sy = dot(s, y);
    if (sy > 1e-12) {
      const Hy = H.map((row) => dot(row, y)), yHy = dot(y, Hy);
      H = H.map((row, i) => row.map((h, j) => h + ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy));
    }
    const step = norm(s), drop = fx - fn;
    x = xn; fx = fn; g = gn;
    path.push(x.slice());
    o.onIter?.(k + 1, x, fx, evals);
    if (step <= tolX * (1 + norm(x))) { flag = 2; message = 'The step became smaller than the tolerance.'; k++; break; }
    if (drop >= 0 && drop <= (o.tolFun ?? 1e-12) * (1 + Math.abs(fx)) && k > 2) { flag = 3; message = 'The objective stopped changing.'; k++; break; }
  }
  return { x, f: fx, iterations: k, evals, path, flag, message };
}

export interface Constraints { A?: number[][]; b?: number[]; Aeq?: number[][]; beq?: number[]; lb?: number[]; ub?: number[]; nonlcon?: (x: number[]) => [number[], number[]] }
/** Minimises f subject to A x ≤ b, Aeq x = beq, lb ≤ x ≤ ub and c(x) ≤ 0, ceq(x) = 0, by an augmented Lagrangian:
 * the constraints become penalties with multipliers, each round solved by the bound-projected BFGS above. */
export type Inner = (f: Fn, x: number[], lb: number[], ub: number[], onStep: (y: number[]) => void) => Result;
export function augLag(f0: Fn, x0: number[], k: Constraints, o: Opts & { grad?: (x: number[]) => number[]; inner?: Inner } = {}): Result {
  const lb = k.lb?.length ? k.lb : x0.map(() => -Infinity), ub = k.ub?.length ? k.ub : x0.map(() => Infinity);
  if (lb.some((v, i) => v > ub[i])) return { x: x0, f: NaN, iterations: 0, evals: 0, path: [x0], flag: -2, message: 'The bounds leave no room (a lower bound is above its upper bound).', violation: Infinity };
  let evals = 0;
  const f = (x: number[]) => { evals++; return f0(x); };
  const cons = (x: number[]) => {
    const ineq = (k.A ?? []).map((row, i) => dot(row, x) - (k.b ?? [])[i]), eq = (k.Aeq ?? []).map((row, i) => dot(row, x) - (k.beq ?? [])[i]);
    if (k.nonlcon) { const [c, ceq] = k.nonlcon(x); ineq.push(...c); eq.push(...ceq); }
    return { ineq, eq };
  };
  const viol = (x: number[]) => { const c = cons(x); return Math.max(0, ...c.ineq, ...c.eq.map(Math.abs)); };
  const c0 = cons(x0);
  let lam = c0.ineq.map(() => 0), mu = c0.eq.map(() => 0), rho = 10, x = x0.map((v, i) => Math.min(ub[i], Math.max(lb[i], v)));
  const path = [x.slice()];
  let iterations = 0, last = viol(x);
  if (!c0.ineq.length && !c0.eq.length) {
    const r = o.inner ? o.inner(f, x, lb, ub, (y) => path.push(y.slice())) : bfgs(f, x, { ...o, lb, ub, tolFun: 1e-14 });
    return { ...r, evals: evals, violation: 0 };
  }
  for (let round = 0; round < 30; round++) {
    const L = (y: number[]) => {
      const c = cons(y);
      let v = f(y);
      c.eq.forEach((h, j) => { v += mu[j] * h + (rho / 2) * h * h; });
      c.ineq.forEach((g, i) => { const m = Math.max(0, lam[i] + rho * g); v += (m * m - lam[i] * lam[i]) / (2 * rho); });
      return v;
    };
    const r = o.inner ? o.inner(L, x, lb, ub, (y) => path.push(y.slice())) : bfgs(L, x, { lb, ub, maxIter: 300, tolOpt: 1e-9, tolX: 1e-12, tolFun: 1e-15, onIter: (_k, y) => path.push(y.slice()) });
    iterations += r.iterations;
    const moved = norm(r.x.map((v, i) => v - x[i]));
    x = r.x;
    const c = cons(x);
    lam = lam.map((l, i) => Math.max(0, l + rho * c.ineq[i]));
    mu = mu.map((m, j) => m + rho * c.eq[j]);
    const v = viol(x);
    o.onIter?.(round + 1, x, f0(x), evals);
    if (v <= 1e-8 && moved <= 1e-9 * (1 + norm(x))) break;
    if (v > 0.25 * last) rho = Math.min(1e10, rho * 10);
    last = v;
  }
  const v = viol(x);
  return { x, f: f0(x), iterations, evals, path, flag: v <= 1e-6 ? 1 : -2, message: v <= 1e-6 ? 'A local minimum that meets the constraints.' : 'No point meeting the constraints was found.', violation: v };
}

/** Linear programming: minimise c·x with A x ≤ b, Aeq x = beq, lb ≤ x ≤ ub, by the two-phase simplex method. */
export function linprog(c: number[], k: Constraints): Result {
  const n = c.length, lb = k.lb?.length ? k.lb : c.map(() => -Infinity), ub = k.ub?.length ? k.ub : c.map(() => Infinity);
  if (lb.some((v, i) => v > ub[i])) return { x: c.map(() => NaN), f: NaN, iterations: 0, evals: 0, path: [], flag: -2, message: 'The bounds leave no room.' };
  // Variables: x_i = lb_i + p_i (lb finite) or p_i − q_i (free); an upper bound becomes a row.
  const cols: { i: number; sign: number }[] = [], shift = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(lb[i])) { shift[i] = lb[i]; cols.push({ i, sign: 1 }); }
    else if (Number.isFinite(ub[i])) { shift[i] = ub[i]; cols.push({ i, sign: -1 }); }
    else { cols.push({ i, sign: 1 }, { i, sign: -1 }); }
  }
  const rows: { a: number[]; b: number; eq: boolean }[] = [], m0 = cols.length;
  const toCols = (row: number[]) => cols.map(({ i, sign }) => row[i] * sign), shifted = (row: number[]) => row.reduce((s, v, i) => s + v * shift[i], 0);
  (k.A ?? []).forEach((row, r) => rows.push({ a: toCols(row), b: (k.b ?? [])[r] - shifted(row), eq: false }));
  (k.Aeq ?? []).forEach((row, r) => rows.push({ a: toCols(row), b: (k.beq ?? [])[r] - shifted(row), eq: true }));
  for (let i = 0; i < n; i++) if (Number.isFinite(lb[i]) && Number.isFinite(ub[i])) { const e = new Array(n).fill(0); e[i] = 1; rows.push({ a: toCols(e), b: ub[i] - shift[i], eq: false }); }
  const cc = cols.map(({ i, sign }) => c[i] * sign), m = rows.length;
  // Tableau columns: the variables, a slack per ≤ row, an artificial per row; the right-hand side last.
  const slack = rows.map((r) => !r.eq), nS = slack.filter(Boolean).length, W = m0 + nS + m + 1;
  const T = rows.map((r, ri) => {
    const row = new Array(W).fill(0), s = r.b < 0 ? -1 : 1;
    r.a.forEach((v, j) => { row[j] = s * v; });
    if (!r.eq) row[m0 + rows.slice(0, ri).filter((q) => !q.eq).length] = s;
    row[m0 + nS + ri] = 1; row[W - 1] = s * r.b;
    return row;
  });
  const basis = rows.map((_, ri) => m0 + nS + ri);
  let iterations = 0;
  const pivot = (r: number, col: number) => {
    const p = T[r][col];
    for (let j = 0; j < W; j++) T[r][j] /= p;
    for (let q = 0; q < m; q++) if (q !== r && T[q][col]) { const fct = T[q][col]; for (let j = 0; j < W; j++) T[q][j] -= fct * T[r][j]; }
    basis[r] = col; iterations++;
  };
  /** Simplex on the cost (over the allowed columns) with Bland's rule; false when unbounded. */
  const run = (cost: number[], allowed: (j: number) => boolean) => {
    for (let guard = 0; guard < 50_000; guard++) {
      const reduced = (j: number) => cost[j] - basis.reduce((s, b, r) => s + cost[b] * T[r][j], 0);
      let enter = -1;
      for (let j = 0; j < W - 1; j++) if (allowed(j) && !basis.includes(j) && reduced(j) < -1e-10) { enter = j; break; }
      if (enter < 0) return true;
      let leave = -1, best = Infinity;
      for (let r = 0; r < m; r++) if (T[r][enter] > 1e-12) { const ratio = T[r][W - 1] / T[r][enter]; if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[r] < basis[leave])) { best = ratio; leave = r; } }
      if (leave < 0) return false;
      pivot(leave, enter);
    }
    return true;
  };
  // Phase one: drive the artificial variables to zero.
  const phase1 = new Array(W - 1).fill(0).map((_, j) => (j >= m0 + nS ? 1 : 0));
  run(phase1, () => true);
  const artificial = basis.reduce((s, b, r) => s + (b >= m0 + nS ? T[r][W - 1] : 0), 0);
  if (artificial > 1e-7) return { x: c.map(() => NaN), f: NaN, iterations, evals: 0, path: [], flag: -2, message: 'No point meets all the constraints (infeasible).' };
  // Artificials still in the basis (at zero) are swapped out where possible.
  basis.forEach((b, r) => { if (b >= m0 + nS) { const j = T[r].findIndex((v, q) => q < m0 + nS && Math.abs(v) > 1e-9); if (j >= 0) pivot(r, j); } });
  const cost = new Array(W - 1).fill(0);
  cc.forEach((v, j) => { cost[j] = v; });
  if (!run(cost, (j) => j < m0 + nS)) return { x: c.map(() => NaN), f: -Infinity, iterations, evals: 0, path: [], flag: -3, message: 'The objective can fall without end (unbounded).' };
  const p = new Array(m0).fill(0);
  basis.forEach((b, r) => { if (b < m0) p[b] = T[r][W - 1]; });
  const x = shift.slice();
  cols.forEach(({ i, sign }, j) => { x[i] += sign * p[j]; });
  return { x, f: dot(c, x), iterations, evals: 0, path: [x], flag: 1, message: 'The best point was found.' };
}
/** Mixed-integer linear programming: linprog, then branch and bound on the integer variables (depth first, the
 * best whole answer kept to prune). */
export function intlinprog(c: number[], intcon: number[], k: Constraints, maxNodes = 20_000): Result {
  let best: Result | null = null, nodes = 0;
  const stack: Constraints[] = [{ ...k, lb: k.lb?.length ? k.lb.slice() : c.map(() => -Infinity), ub: k.ub?.length ? k.ub.slice() : c.map(() => Infinity) }];
  while (stack.length && nodes < maxNodes) {
    const node = stack.pop()!, r = linprog(c, node);
    nodes++;
    if (r.flag !== 1 || (best && r.f >= best.f - 1e-9)) continue;
    const frac = intcon.map((i) => i - 1).find((i) => Math.abs(r.x[i] - Math.round(r.x[i])) > 1e-7);
    if (frac === undefined) { best = { ...r, x: r.x.map((v, i) => (intcon.includes(i + 1) ? Math.round(v) : v)) }; best.f = dot(c, best.x); continue; }
    const v = r.x[frac], down = { ...node, ub: node.ub!.slice() }, up = { ...node, lb: node.lb!.slice() };
    down.ub![frac] = Math.floor(v); up.lb![frac] = Math.ceil(v);
    stack.push(down, up);
  }
  return best ? { ...best, iterations: nodes, message: nodes >= maxNodes ? 'The best whole answer found before the node limit.' : 'The best whole answer was found.' } : { x: c.map(() => NaN), f: NaN, iterations: nodes, evals: 0, path: [], flag: -2, message: 'No whole-number point meets the constraints.' };
}

/** Least squares: minimise |F(x)|² by Levenberg–Marquardt with a difference Jacobian, inside the box. */
export function levenbergMarquardt(F0: (x: number[]) => number[], x0: number[], o: Opts & { lb?: number[]; ub?: number[] } = {}): Result & { residual: number[] } {
  const n = x0.length, lb = o.lb?.length ? o.lb : x0.map(() => -Infinity), ub = o.ub?.length ? o.ub : x0.map(() => Infinity), P = (x: number[]) => x.map((v, i) => Math.min(ub[i], Math.max(lb[i], v)));
  let evals = 0;
  const F = (x: number[]) => { evals++; return F0(x); };
  let x = P(x0), r = F(x), cost = dot(r, r), lambda = 1e-3;
  const path = [x.slice()], maxIter = o.maxIter ?? 400;
  let k = 0, flag = 0, message = 'Stopped at the limit on iterations.';
  for (; k < maxIter; k++) {
    const J = x.map((v, i) => { const h = 1e-7 * Math.max(1, Math.abs(v)), y = x.slice(); y[i] += h; const ry = F(y); return ry.map((q, j) => (q - r[j]) / h); });
    const m = r.length, JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => { let s = 0; for (let q = 0; q < m; q++) s += J[a][q] * J[b][q]; return s; }));
    const Jtr = Array.from({ length: n }, (_, a) => { let s = 0; for (let q = 0; q < m; q++) s += J[a][q] * r[q]; return s; });
    if (Math.max(...Jtr.map(Math.abs)) <= (o.tolOpt ?? 1e-10) * Math.max(1, cost)) { flag = 1; message = 'The gradient is (close to) zero.'; break; }
    let improved = false;
    for (let tries = 0; tries < 30; tries++) {
      const M = JtJ.map((row, a) => row.map((v, b) => v + (a === b ? lambda * Math.max(v, 1e-12) : 0)));
      const step = solve(M, Jtr.map((v) => -v));
      if (!step) { lambda *= 10; continue; }
      const xn = P(x.map((v, i) => v + step[i])), rn = F(xn), cn = dot(rn, rn);
      if (cn < cost) {
        const moved = norm(xn.map((v, i) => v - x[i])), drop = cost - cn;
        x = xn; r = rn; cost = cn; lambda = Math.max(1e-12, lambda / 10); improved = true;
        path.push(x.slice());
        o.onIter?.(k + 1, x, cost, evals);
        if (moved <= (o.tolX ?? 1e-10) * (1 + norm(x)) || drop <= (o.tolFun ?? 1e-14) * (1 + cost)) { flag = 2; message = 'The step or the change in the sum of squares became tiny.'; }
        break;
      }
      lambda *= 10;
    }
    if (!improved) { flag = 3; message = 'No step lowered the sum of squares further.'; break; }
    if (flag) { k++; break; }
  }
  return { x, f: cost, iterations: k, evals, path, flag: flag || 0, message, residual: r };
}
/** Gaussian elimination with partial pivoting; null when singular. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const fct = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= fct * M[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) x[i] = (M[i][n] - M[i].slice(i + 1, n).reduce((s, v, j) => s + v * x[i + 1 + j], 0)) / M[i][i];
  return x;
}

/** A genetic algorithm in the box: tournaments pick parents, blends of them are children, a few genes jump (less
 * as generations pass), the best few carry over unchanged. Constraint violations add a large penalty. */
export function ga(f: Fn, n: number, rand: Rand, o: { lb?: number[]; ub?: number[]; pop?: number; gens?: number; penalty?: (x: number[]) => number; onIter?: Opts['onIter'] } = {}): Result {
  const lb = o.lb?.length ? o.lb : new Array(n).fill(-10), ub = o.ub?.length ? o.ub : new Array(n).fill(10), size = o.pop ?? (n <= 5 ? 50 : 200), gens = o.gens ?? 100 * n;
  const lo = lb.map((v) => (Number.isFinite(v) ? v : -10)), hi = ub.map((v) => (Number.isFinite(v) ? v : 10));
  const fit = (x: number[]) => f(x) + (o.penalty ? 1e6 * o.penalty(x) : 0), clip = (x: number[]) => x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  let pop = Array.from({ length: size }, () => lo.map((l, i) => l + rand() * (hi[i] - l))), scores = pop.map(fit), evals = size;
  const path: number[][] = [], gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  let stall = 0, bestSoFar = Infinity, g = 0;
  for (; g < gens; g++) {
    const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]), elite = Math.max(1, Math.round(0.05 * size));
    path.push(pop[order[0]].slice());
    o.onIter?.(g + 1, pop[order[0]], scores[order[0]], evals);
    if (scores[order[0]] < bestSoFar - 1e-6 * (1 + Math.abs(bestSoFar))) { bestSoFar = scores[order[0]]; stall = 0; } else if (++stall >= 50) break;
    const pick = () => { const a = Math.floor(rand() * size), b = Math.floor(rand() * size); return scores[a] < scores[b] ? pop[a] : pop[b]; };
    const spread = 1 - g / gens, next = order.slice(0, elite).map((i) => pop[i]);
    while (next.length < size) {
      const p = pick(), q = pick(), w = rand() * 1.5 - 0.25;
      next.push(clip(p.map((v, i) => v + w * (q[i] - v) + (rand() < 0.2 ? 0.1 * spread * (hi[i] - lo[i]) * gauss() : 0))));
    }
    pop = next; scores = pop.map(fit); evals += size;
  }
  const i = scores.indexOf(Math.min(...scores));
  return { x: pop[i], f: f(pop[i]), iterations: g, evals, path, flag: 1, message: stall >= 50 ? 'The best stopped improving.' : 'The generations ran out.' };
}
/** A particle swarm in the box: each particle pulled towards its own best and the swarm's best. */
export function particleswarm(f: Fn, n: number, rand: Rand, o: { lb?: number[]; ub?: number[]; size?: number; iters?: number; onIter?: Opts['onIter'] } = {}): Result {
  const lo = (o.lb?.length ? o.lb : new Array(n).fill(-1000)).map((v) => (Number.isFinite(v) ? v : -1000)), hi = (o.ub?.length ? o.ub : new Array(n).fill(1000)).map((v) => (Number.isFinite(v) ? v : 1000));
  const size = o.size ?? Math.min(100, 10 * n), iters = o.iters ?? 200 * n;
  const X = Array.from({ length: size }, () => lo.map((l, i) => l + rand() * (hi[i] - l))), V = X.map((x) => x.map((_, i) => (rand() - 0.5) * (hi[i] - lo[i]) * 0.2));
  const P = X.map((x) => x.slice()), PF = X.map(f);
  let gi = PF.indexOf(Math.min(...PF)), evals = size, k = 0;
  const path = [P[gi].slice()], bests = [PF[gi]];
  for (; k < iters; k++) {
    // Clerc's constriction: inertia 0.7298, pulls 1.49445 towards each particle's best and the swarm's.
    for (let p = 0; p < size; p++) {
      for (let i = 0; i < n; i++) {
        V[p][i] = 0.7298 * V[p][i] + 1.49445 * rand() * (P[p][i] - X[p][i]) + 1.49445 * rand() * (P[gi][i] - X[p][i]);
        X[p][i] = Math.min(hi[i], Math.max(lo[i], X[p][i] + V[p][i]));
      }
      const fp = f(X[p]);
      evals++;
      if (fp < PF[p]) { PF[p] = fp; P[p] = X[p].slice(); if (fp < PF[gi]) gi = p; }
    }
    path.push(P[gi].slice()); bests.push(PF[gi]);
    o.onIter?.(k + 1, P[gi], PF[gi], evals);
    // Stop when the best moved less than 1e-6 (relative) over the last 20 iterations.
    if (bests.length > 20 && bests[bests.length - 21] - PF[gi] <= 1e-6 * Math.max(1, Math.abs(PF[gi]))) { k++; break; }
  }
  return { x: P[gi], f: PF[gi], iterations: k, evals, path, flag: 1, message: 'The swarm’s best stopped improving.' };
}
