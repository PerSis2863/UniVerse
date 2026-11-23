// Hyperion's optimisation with several goals at once (M461, the owner: "optimising several goals at once"): NSGA-II
// (Deb et al. 2002: fast non-dominated sorting, crowding distance, simulated binary crossover and polynomial mutation,
// constraints by Deb's feasibility rules) for a spread of best trade-offs (the Pareto front), and a Pareto search that
// walks the front point by point (a Chebyshev scalarisation per direction, each point solved by Nelder–Mead from
// optim.ts). Our own code from the published methods.

import { nelderMead, type Constraints, type Rand } from './optim';

export type MultiFn = (x: number[]) => number[];
interface Ind { x: number[]; f: number[]; v: number; rank: number; crowd: number }

/** a dominates b: no worse in every goal and better in one; feasibility first (Deb's rules). */
function dominates(a: Ind, b: Ind) {
  if (a.v > 0 || b.v > 0) return a.v < b.v;
  let better = false;
  for (let j = 0; j < a.f.length; j++) { if (a.f[j] > b.f[j]) return false; if (a.f[j] < b.f[j]) better = true; }
  return better;
}
/** Fronts by non-dominated sorting; each individual's rank set. */
function sortFronts(P: Ind[]) {
  const S: number[][] = P.map(() => []), count = new Array(P.length).fill(0), fronts: number[][] = [[]];
  for (let p = 0; p < P.length; p++) for (let q = 0; q < P.length; q++) {
    if (p === q) continue;
    if (dominates(P[p], P[q])) S[p].push(q); else if (dominates(P[q], P[p])) count[p]++;
  }
  P.forEach((ind, p) => { if (!count[p]) { ind.rank = 0; fronts[0].push(p); } });
  for (let i = 0; fronts[i].length; i++) {
    const next: number[] = [];
    for (const p of fronts[i]) for (const q of S[p]) if (--count[q] === 0) { P[q].rank = i + 1; next.push(q); }
    fronts.push(next);
  }
  return fronts.filter((f) => f.length);
}
/** Crowding distance within a front: how much room each point has along every goal (ends infinite). */
function crowd(P: Ind[], front: number[]) {
  for (const i of front) P[i].crowd = 0;
  const m = P[front[0]].f.length;
  for (let j = 0; j < m; j++) {
    const s = [...front].sort((a, b) => P[a].f[j] - P[b].f[j]), lo = P[s[0]].f[j], hi = P[s[s.length - 1]].f[j];
    P[s[0]].crowd = P[s[s.length - 1]].crowd = Infinity;
    if (hi > lo) for (let k = 1; k < s.length - 1; k++) P[s[k]].crowd += (P[s[k + 1]].f[j] - P[s[k - 1]].f[j]) / (hi - lo);
  }
}
/** The best trade-offs between goals by NSGA-II within bounds lb…ub (needed); `violation` gives how far a point breaks
 * the constraints (0 when it keeps them). The final non-dominated, feasible set. */
export function nsga2(fun: MultiFn, n: number, lb: number[], ub: number[], rand: Rand, o: { pop?: number; gens?: number; violation?: (x: number[]) => number; onGen?: (g: number, front: number) => void } = {}) {
  const N = Math.max(8, Math.round((o.pop ?? 50 * Math.min(n, 4)) / 2) * 2), G = o.gens ?? 200, viol = o.violation ?? (() => 0), etaC = 20, etaM = 20;
  const make = (x: number[]): Ind => ({ x, f: fun(x), v: viol(x), rank: 0, crowd: 0 });
  let P = Array.from({ length: N }, () => make(lb.map((l, i) => l + rand() * (ub[i] - l))));
  sortFronts(P).forEach((f) => crowd(P, f));
  const better = (a: Ind, b: Ind) => (a.rank !== b.rank ? a.rank < b.rank : a.crowd > b.crowd);
  const pick = () => { const a = P[Math.floor(rand() * N)], b = P[Math.floor(rand() * N)]; return better(a, b) ? a : b; };
  for (let g = 0; g < G; g++) {
    const kids: Ind[] = [];
    while (kids.length < N) {
      const p1 = pick().x, p2 = pick().x, c1 = [...p1], c2 = [...p2];
      // Simulated binary crossover, then polynomial mutation, each gene within its bounds. Half the time one spread
      // for every gene (the children stay on the line through the parents, so goals that need the variables to move
      // together, a rotated front, still converge); otherwise gene by gene.
      const shared = rand() < 0.5, spread = () => { const u = rand(); return u <= 0.5 ? (2 * u) ** (1 / (etaC + 1)) : (1 / (2 * (1 - u))) ** (1 / (etaC + 1)); }, common = spread();
      for (let i = 0; i < n; i++) {
        if ((shared || rand() < 0.5) && Math.abs(p1[i] - p2[i]) > 1e-14) {
          const beta = shared ? common : spread();
          c1[i] = 0.5 * ((1 + beta) * p1[i] + (1 - beta) * p2[i]); c2[i] = 0.5 * ((1 - beta) * p1[i] + (1 + beta) * p2[i]);
        }
        for (const c of [c1, c2]) {
          if (rand() < 1 / n) { const u = rand(), d = u < 0.5 ? (2 * u) ** (1 / (etaM + 1)) - 1 : 1 - (2 * (1 - u)) ** (1 / (etaM + 1)); c[i] += d * (ub[i] - lb[i]); }
          c[i] = Math.min(ub[i], Math.max(lb[i], c[i]));
        }
      }
      kids.push(make(c1), make(c2));
    }
    const R = [...P, ...kids], fronts = sortFronts(R), next: Ind[] = [];
    for (const f of fronts) {
      crowd(R, f);
      if (next.length + f.length <= N) { for (const i of f) next.push(R[i]); continue; }
      [...f].sort((a, b) => R[b].crowd - R[a].crowd).slice(0, N - next.length).forEach((i) => next.push(R[i]));
      break;
    }
    P = next;
    o.onGen?.(g + 1, P.filter((p) => p.rank === 0).length);
  }
  sortFronts(P);
  const front = P.filter((p) => p.rank === 0 && p.v <= 1e-9);
  // Unique points, sorted along the first goal.
  const seen = new Set<string>();
  return front.filter((p) => { const k = p.f.map((v) => v.toPrecision(10)).join(','); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.f[0] - b.f[0]).map((p) => ({ x: p.x, f: p.f }));
}

/** How far x breaks the constraints (0 when it keeps them). */
export function violation(k: Constraints, x: number[]) {
  let v = 0;
  (k.A ?? []).forEach((r, i) => { v += Math.max(0, r.reduce((s, q, j) => s + q * x[j], 0) - k.b![i]); });
  (k.Aeq ?? []).forEach((r, i) => { v += Math.abs(r.reduce((s, q, j) => s + q * x[j], 0) - k.beq![i]); });
  if (k.nonlcon) { const [c, ceq] = k.nonlcon(x); v += c.reduce((s, q) => s + Math.max(0, q), 0) + ceq.reduce((s, q) => s + Math.abs(q), 0); }
  return v;
}
/** One point pushed as far as it goes from the ideal point z along direction w: the augmented Chebyshev distance
 * max_j w_j·(f_j − z_j)/s_j (+ a ten-thousandth of their sum, so no goal is left slack) minimised by Nelder–Mead in
 * variables scaled to the bounds, constraints as a steep penalty. Null if it ends outside the constraints or worse. */
function push(fun: MultiFn, n: number, k: Constraints & { lb: number[]; ub: number[] }, x0: number[], w: number[], z: number[], scale: number[]) {
  const span = k.lb.map((l, i) => (Number.isFinite(l) && Number.isFinite(k.ub[i]) ? k.ub[i] - l : Math.max(1, Math.abs(x0[i])))), toX = (u: number[]) => u.map((v, i) => Math.min(k.ub[i], Math.max(k.lb[i], x0[i] + v * span[i])));
  const g = (u: number[]) => {
    const x = toX(u), f = fun(x), d = f.map((v, j) => (w[j] * (v - z[j])) / scale[j]);
    return Math.max(...d) + 1e-4 * d.reduce((a, b) => a + b, 0) + 1e6 * violation(k, x) + 1e3 * u.reduce((s, v, i) => s + Math.max(0, Math.abs(x0[i] + v * span[i] - toX(u)[i])), 0);
  };
  // A small first simplex (2 % of each range) around the point itself.
  const r = nelderMead((u) => g(u.map((v) => v - 0.02)), new Array(n).fill(0.02), { tolX: 1e-10, tolFun: 1e-12, maxIter: 150 * n, maxEvals: 150 * n });
  const x = toX(r.x.map((v) => v - 0.02)), f = fun(x), f0 = fun(x0);
  if (violation(k, x) > 1e-6 || (f.every((v, t) => v >= f0[t] - 1e-12) && f.some((v, t) => v > f0[t] + 1e-12))) return null;
  return { x, f };
}
const nonDominated = (P: { x: number[]; f: number[] }[]) => P.filter((p, i) => !P.some((q, j) => j !== i && q.f.every((v, t) => v <= p.f[t] + 1e-12) && q.f.some((v, t) => v < p.f[t] - 1e-12))).sort((a, b) => a.f[0] - b.f[0]);
const idealOf = (P: { f: number[] }[]) => {
  const m = P[0].f.length, lo = Array.from({ length: m }, (_, j) => Math.min(...P.map((p) => p.f[j]))), hi = Array.from({ length: m }, (_, j) => Math.max(...P.map((p) => p.f[j])));
  const scale = lo.map((v, j) => Math.max(1e-12, hi[j] - v));
  return { z: lo.map((v, j) => v - 0.05 * scale[j]), scale };
};
/** A front polished point by point (MATLAB's hybrid step): each pushed straight towards the true front along the ray
 * from just below the ideal point through it, so the points keep their places and spread. */
export function polish(fun: MultiFn, n: number, k: Constraints & { lb: number[]; ub: number[] }, P: { x: number[]; f: number[] }[]) {
  if (!P.length) return P;
  const { z, scale } = idealOf(P);
  return nonDominated(P.map((p) => {
    const w = p.f.map((v, j) => 1 / Math.max(1e-9, (v - z[j]) / scale[j])), sw = w.reduce((a, b) => a + b, 0);
    return push(fun, n, k, p.x, w.map((v) => v / sw), z, scale) ?? p;
  }));
}

/** Pareto search: NSGA-II's rough front, then for each of `count` directions from just below the ideal point the
 * point that pushes furthest along it, started from the rough point that does best that way. */
export function paretoSearch(fun: MultiFn, n: number, k: Constraints & { lb: number[]; ub: number[] }, rand: Rand, count = 30) {
  const seed = nsga2(fun, n, k.lb, k.ub, rand, { pop: 40, gens: 60, violation: (x) => violation(k, x) });
  if (!seed.length) return [];
  const m = seed[0].f.length, { z, scale } = idealOf(seed);
  const dirs: number[][] = m === 2 ? Array.from({ length: count }, (_, i) => { const a = 0.01 + (0.98 * i) / Math.max(1, count - 1); return [a, 1 - a]; }) : Array.from({ length: count }, () => { const w = Array.from({ length: m }, () => -Math.log(1 - rand())); const s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); });
  const score = (f: number[], w: number[]) => Math.max(...f.map((v, j) => (w[j] * (v - z[j])) / scale[j]));
  const out = dirs.map((w) => push(fun, n, k, seed.reduce((best, p) => (score(p.f, w) < score(best.f, w) ? p : best), seed[0]).x, w, z, scale)).filter((p): p is { x: number[]; f: number[] } => !!p);
  return nonDominated(out);
}
