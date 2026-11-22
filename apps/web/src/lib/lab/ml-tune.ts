import type { Rand } from './ml';

// Hyperion's automatic tuning (M419, the owner: "automatic tuning of settings"): finds the settings with the lowest
// value of an objective (for a model, its cross-validated error) by Bayesian optimisation (a Gaussian process guesses
// the objective everywhere from the points tried; the next point is where the expected improvement is largest), a
// grid, or random points. Each setting is mapped to [0, 1] (on a log scale when asked), so the search sees a unit box.

export interface TuneVar { name: string; type: 'real' | 'integer' | 'categorical'; range: [number, number] | string[]; log: boolean }
export type Setting = number | string;
export interface TuneOpts { evals?: number; method?: 'bayesopt' | 'gridsearch' | 'randomsearch'; divisions?: number; seeds?: number; onEval?: (i: number, at: Setting[], value: number, best: number) => void }
export interface TuneResult { tried: Setting[][]; values: number[]; best: number }

const isCat = (v: TuneVar): v is TuneVar & { range: string[] } => v.type === 'categorical';
/** A point of the unit box as settings. */
export function decode(vars: TuneVar[], u: number[]): Setting[] {
  return vars.map((v, k) => {
    if (isCat(v)) return v.range[Math.min(v.range.length - 1, Math.floor(u[k] * v.range.length))];
    const [lo, hi] = v.range as [number, number], x = v.log ? Math.exp(Math.log(lo) + u[k] * (Math.log(hi) - Math.log(lo))) : lo + u[k] * (hi - lo);
    return v.type === 'integer' ? Math.min(hi, Math.max(lo, Math.round(x))) : x;
  });
}
/** Settings as a point of the unit box (a category sits in the middle of its slice). */
export function encode(vars: TuneVar[], s: Setting[]): number[] {
  return vars.map((v, k) => {
    if (isCat(v)) return (v.range.indexOf(String(s[k])) + 0.5) / v.range.length;
    const [lo, hi] = v.range as [number, number], x = Number(s[k]);
    return v.log ? (Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1) : (x - lo) / (hi - lo || 1);
  });
}

/** Solves the symmetric positive-definite system K a = b by Cholesky (a little jitter added if needed). */
function cholesky(K: number[][]) {
  const n = K.length, L = K.map(() => new Array(n).fill(0));
  for (let jitter = 0, tries = 0; tries < 6; tries++, jitter = jitter ? jitter * 10 : 1e-10) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) for (let j = 0; j <= i; j++) {
      let s = K[i][j] + (i === j ? jitter : 0);
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) { ok = false; break; } L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    if (ok) return L;
  }
  return null;
}
const solveL = (L: number[][], b: number[]) => { const n = b.length, x = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * x[k]; x[i] = s / L[i][i]; } return x; };
const solveLt = (L: number[][], b: number[]) => { const n = b.length, x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; };

/** A Gaussian process on the points tried (squared-exponential kernel, its length picked by the marginal likelihood). */
export function gp(X: number[][], y: number[]) {
  const n = y.length, mean = y.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(y.reduce((s, v) => s + (v - mean) ** 2, 0) / n) || 1, z = y.map((v) => (v - mean) / sd);
  const d2 = (a: number[], b: number[]) => a.reduce((s, v, k) => s + (v - b[k]) ** 2, 0);
  let best: { ll: number; len: number; L: number[][]; alpha: number[] } | null = null;
  for (const len of [0.05, 0.1, 0.2, 0.35, 0.6, 1]) {
    const K = X.map((a, i) => X.map((b, j) => Math.exp(-d2(a, b) / (2 * len * len)) + (i === j ? 1e-4 : 0))), L = cholesky(K);
    if (!L) continue;
    const alpha = solveLt(L, solveL(L, z)), ll = -0.5 * z.reduce((s, v, i) => s + v * alpha[i], 0) - L.reduce((s, r, i) => s + Math.log(r[i]), 0);
    if (!best || ll > best.ll) best = { ll, len, L, alpha };
  }
  const g = best!;
  return (x: number[]) => {
    const k = X.map((a) => Math.exp(-d2(a, x) / (2 * g.len * g.len))), m = k.reduce((s, v, i) => s + v * g.alpha[i], 0), v = solveL(g.L, k);
    return { mean: mean + sd * m, sd: sd * Math.sqrt(Math.max(1e-12, 1 + 1e-4 - v.reduce((s, q) => s + q * q, 0))) };
  };
}
/** The expected improvement below `best` of a normal guess. */
export function expectedImprovement(mean: number, sd: number, best: number) {
  const z = (best - mean) / sd, pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  // Φ(z) by erf's Abramowitz–Stegun fit (error below 1.5e-7).
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2)), e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2), cdf = 0.5 * (1 + Math.sign(z) * e);
  return (best - mean) * cdf + sd * pdf;
}

/** Looks for the settings with the lowest objective. A failed evaluation (NaN or an error) counts as the worst seen. */
export function tune(vars: TuneVar[], objective: (s: Setting[]) => number, rand: Rand, o: TuneOpts = {}): TuneResult {
  const evals = Math.max(1, o.evals ?? 30), method = o.method ?? 'bayesopt', tried: Setting[][] = [], values: number[] = [], U: number[][] = [];
  const keyOf = (s: Setting[]) => JSON.stringify(s);
  const seen = new Set<string>();
  let best = Infinity;
  const evaluate = (u: number[]) => {
    const s = decode(vars, u), key = keyOf(s);
    if (seen.has(key)) return false;
    seen.add(key);
    let v: number;
    try { v = objective(s); } catch { v = NaN; }
    if (!Number.isFinite(v)) v = values.length ? Math.max(...values.filter(Number.isFinite)) + 1 : 1;
    tried.push(s); values.push(v); U.push(encode(vars, s));
    best = Math.min(best, v);
    o.onEval?.(tried.length, s, v, best);
    return true;
  };
  const randomPoint = () => vars.map(() => rand());
  if (method === 'gridsearch') {
    const div = Math.max(2, o.divisions ?? 10), axes = vars.map((v) => (isCat(v) ? v.range.map((_, i) => (i + 0.5) / v.range.length) : Array.from({ length: div }, (_, i) => i / (div - 1))));
    const all: number[][] = [[]];
    for (const ax of axes) { const next: number[][] = []; for (const p of all) for (const a of ax) next.push([...p, a]); all.splice(0, all.length, ...next); if (all.length > 100_000) break; }
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    for (const p of all) { if (tried.length >= evals) break; evaluate(p); }
  } else {
    const seeds = method === 'randomsearch' ? evals : Math.min(evals, o.seeds ?? 4);
    for (let tries = 0; tried.length < seeds && tries < seeds * 20; tries++) evaluate(randomPoint());
    for (let tries = 0; tried.length < evals && tries < evals * 20; tries++) {
      if (method === 'randomsearch') { evaluate(randomPoint()); continue; }
      const f = gp(U, values), cur = Math.min(...values), bestAt = U[values.indexOf(cur)];
      // Candidates: random points everywhere, and small steps around the best so far.
      let pick: number[] | null = null, top = -Infinity;
      for (let c = 0; c < 1500; c++) {
        const p = c < 1000 ? randomPoint() : bestAt.map((v) => Math.min(1, Math.max(0, v + (rand() - 0.5) * 0.1)));
        if (seen.has(keyOf(decode(vars, p)))) continue;
        const { mean, sd } = f(p), ei = expectedImprovement(mean, sd, cur);
        if (ei > top) { top = ei; pick = p; }
      }
      if (!pick || !evaluate(pick)) evaluate(randomPoint());
    }
  }
  return { tried, values, best: values.indexOf(Math.min(...values)) };
}
