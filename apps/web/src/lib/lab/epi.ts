// Hyperion's epidemics (M492, the owner's list, group 7: "epidemics"): compartment models of an outbreak from the
// textbooks (Kermack–McKendrick SIR, SEIR with a latent stage, SIR by age groups with a contact matrix), what lowers
// transmission for a while (a lockdown, masks) and vaccination, the basic reproduction number (from the next-generation
// matrix for age groups), the final size and herd-immunity threshold, fitting a model to daily case counts (Levenberg–Marquardt), and the
// reproduction number over time from cases (the renewal equation, as in Cori et al. 2013). Pure: no language values.
import { levenbergMarquardt, solve } from './optim';
import { rk4Grid, root } from './sci-num';

/** A stretch of days when transmission is cut by `cut` (0.3 = 30% fewer infections). */
export interface Intervention { from: number; to: number; cut: number }
export interface EpiOptions { interventions?: Intervention[]; vaccinate?: number; vaccineFrom?: number; mu?: number; step?: number }
export interface EpiRun { t: number[]; y: number[][]; names: string[]; incidence: number[] }

/** How much of transmission is left at time t. */
export const left = (t: number, iv: Intervention[] = []) => iv.reduce((s, v) => (t >= v.from && t < v.to ? s * (1 - v.cut) : s), 1);

const grid = (days: number, step = 1) => Array.from({ length: Math.floor(days / step) + 1 }, (_, k) => k * step);

/** Daily new infections from the cumulative count C (the last compartment of the state). */
const incidenceOf = (y: number[][]) => y.map((s, k) => (k ? s[s.length - 1] - y[k - 1][s.length - 1] : 0));

/** SIR: S' = −β S I / N, I' = β S I / N − γ I, R' = γ I; vaccination moves `vaccinate` of S a day to R, `mu` births and
 * deaths keep N steady. */
export function sir(beta: number, gamma: number, y0: [number, number, number], days: number, o: EpiOptions = {}): EpiRun {
  const N = y0[0] + y0[1] + y0[2], mu = o.mu ?? 0, v = o.vaccinate ?? 0, vFrom = o.vaccineFrom ?? 0;
  const f = (t: number, [S, I]: number[]) => {
    const inf = (beta * left(t, o.interventions) * S * I) / N, vac = t >= vFrom ? v * S : 0;
    return [mu * N - inf - vac - mu * S, inf - gamma * I - mu * I, gamma * I + vac - mu * (N - S - I), inf];
  };
  const r = rk4Grid(f, grid(days), [...y0, 0], o.step ?? 0.05);
  return { t: r.t, y: r.y.map((s) => s.slice(0, 3)), names: ['S', 'I', 'R'], incidence: incidenceOf(r.y) };
}

/** SEIR: the infected first pass a latent stage E (mean 1/σ days) before they infect others. */
export function seir(beta: number, sigma: number, gamma: number, y0: [number, number, number, number], days: number, o: EpiOptions = {}): EpiRun {
  const N = y0.reduce((s, x) => s + x, 0), mu = o.mu ?? 0, v = o.vaccinate ?? 0, vFrom = o.vaccineFrom ?? 0;
  const f = (t: number, [S, E, I, R]: number[]) => {
    const inf = (beta * left(t, o.interventions) * S * I) / N, vac = t >= vFrom ? v * S : 0;
    return [mu * N - inf - vac - mu * S, inf - sigma * E - mu * E, sigma * E - gamma * I - mu * I, gamma * I + vac - mu * R, inf];
  };
  const r = rk4Grid(f, grid(days), [...y0, 0], o.step ?? 0.05);
  return { t: r.t, y: r.y.map((s) => s.slice(0, 4)), names: ['S', 'E', 'I', 'R'], incidence: incidenceOf(r.y) };
}

/** SIR by age group: group i is infected at β S_i Σ_j C_ij I_j / N_j (C_ij: daily contacts a person in i has with
 * group j). The state is [S_1…S_n, I_1…I_n, R_1…R_n]. */
export function sirAge(beta: number, C: number[][], gamma: number, N: number[], I0: number[], days: number, o: EpiOptions = {}): EpiRun {
  const n = N.length, v = o.vaccinate ?? 0, vFrom = o.vaccineFrom ?? 0;
  const f = (t: number, y: number[]) => {
    const S = y.slice(0, n), I = y.slice(n, 2 * n), b = beta * left(t, o.interventions), d = new Array(3 * n + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let force = 0;
      for (let j = 0; j < n; j++) force += (C[i][j] * I[j]) / N[j];
      const inf = b * S[i] * force, vac = t >= vFrom ? v * S[i] : 0;
      d[i] = -inf - vac; d[n + i] = inf - gamma * I[i]; d[2 * n + i] = gamma * I[i] + vac; d[3 * n] += inf;
    }
    return d;
  };
  const y0 = [...N.map((x, i) => x - I0[i]), ...I0, ...N.map(() => 0), 0];
  const r = rk4Grid(f, grid(days), y0, 0.05);
  return { t: r.t, y: r.y.map((s) => s.slice(0, 3 * n)), names: ['S', 'I', 'R'].flatMap((k) => N.map((_, i) => `${k}${i + 1}`)), incidence: incidenceOf(r.y) };
}

/** The spectral radius (the largest |eigenvalue|) of a non-negative matrix, by power iteration. */
export function spectralRadius(K: number[][]): number {
  let v = K.map(() => 1), lambda = 0;
  for (let k = 0; k < 2000; k++) {
    const w = K.map((r) => r.reduce((s, x, j) => s + x * v[j], 0)), m = Math.max(...w.map(Math.abs));
    if (m === 0) return 0;
    const next = w.map((x) => x / m);
    if (Math.abs(m - lambda) < 1e-13 * m && next.every((x, i) => Math.abs(x - v[i]) < 1e-12)) return m;
    v = next; lambda = m;
  }
  return lambda;
}

/** R0 = β / γ for one group; for age groups the spectral radius of the next-generation matrix K_ij = β C_ij N_i / (γ N_j). */
export function r0(beta: number, gamma: number, C?: number[][], N?: number[]): number {
  if (!C || !N) return beta / gamma;
  return spectralRadius(C.map((r, i) => r.map((c, j) => (beta * c * N[i]) / (gamma * N[j]))));
}

/** The share of a population ever infected when R0 > 1 and nothing intervenes: z = 1 − exp(−R0 z). */
export const finalSize = (R0: number) => (R0 <= 1 ? 0 : root((z) => z - 1 + Math.exp(-R0 * z), 1e-9, 1));
/** The share that must be immune to stop growth: 1 − 1 / R0. */
export const herdImmunity = (R0: number) => Math.max(0, 1 - 1 / R0);

export interface Fit { beta: number; gamma: number; i0: number; sigma?: number; r0: number; rmse: number; model: number[]; iterations: number; ci: { beta: [number, number]; gamma: [number, number]; i0: [number, number]; r0: [number, number] } }

/** Fits SIR (or SEIR with σ fixed) to daily new cases: β, γ and the first infected, by least squares on their logs,
 * against log(1 + cases) so the small early counts count as much as the peak. `report` is the share of infections
 * that are counted as cases. */
export function fitEpidemic(cases: number[], N: number, kind: 'SIR' | 'SEIR' = 'SIR', o: { sigma?: number; report?: number; guess?: [number, number, number] } = {}): Fit {
  const days = cases.length - 1, rep = o.report ?? 1, sigma = o.sigma ?? 1 / 5;
  const model = (p: number[], step = 0.05) => {
    const [b, g, i0] = p.map(Math.exp);
    const run = kind === 'SEIR' ? seir(b, sigma, g, [N - i0, 0, i0, 0], days, { step }) : sir(b, g, [N - i0, i0, 0], days, { step });
    return run.incidence.map((x) => x * rep);
  };
  const lc = cases.map((c) => Math.log1p(Math.max(0, c)));
  const resid = (step: number) => (p: number[]) => { if (p.some((x) => !Number.isFinite(x) || x > 12)) return lc.slice(1).map(() => 1e3); const m = model(p, step); return m.slice(1).map((x, k) => { const r = Math.log1p(Math.max(0, x)) - lc[k + 1]; return Number.isFinite(r) ? r : 1e3; }); };
  const seed = Math.max(1, cases.slice(1, 4).reduce((s, x) => s + x, 0) / rep);
  // Levenberg–Marquardt on the logs of β, γ and I0 finds the nearest valley, so it starts from nine pairs (R0 1.5, 2.5,
  // 4 × infectious 3, 7, 14 days) on a coarse step; the best is then polished on the fine one.
  const starts = o.guess ? [o.guess] : [1.5, 2.5, 4].flatMap((R) => [3, 7, 14].map((d) => [R / d, 1 / d, seed] as [number, number, number]));
  const coarse = resid(0.25);
  let best = starts.map((g) => levenbergMarquardt(coarse, g.map(Math.log), { maxIter: 60, lb: [-12, -12, -5], ub: [5, 5, 18] })).sort((a, b) => a.f - b.f)[0];
  best = levenbergMarquardt(resid(0.05), best.x, { maxIter: 100, lb: [-12, -12, -5], ub: [5, 5, 18] });
  const [beta, gamma, i0] = best.x.map(Math.exp), m = model(best.x);
  const rmse = Math.sqrt(m.slice(1).reduce((s, x, k) => s + (x - cases[k + 1]) ** 2, 0) / Math.max(1, days));
  return { beta, gamma, i0, ...(kind === 'SEIR' ? { sigma } : {}), r0: beta / gamma, rmse, model: m, iterations: best.iterations, ci: intervals(resid(0.05), best.x, best.f) };
}

/** 95% intervals from the curvature at the best fit (M510): the covariance s² (JᵀJ)⁻¹ of the log-parameters, s² the
 * residual variance, turned back from logs (so the intervals are lopsided, as they should be for rates); R0's from
 * var(log β − log γ). An interval is [NaN NaN] when the data can't pin the parameters apart (JᵀJ singular). */
function intervals(F: (p: number[]) => number[], x: number[], cost: number) {
  const r = F(x), n = x.length, m = r.length;
  const J = x.map((v, i) => { const h = 1e-5 * Math.max(1, Math.abs(v)), y = x.slice(); y[i] += h; const ry = F(y); return ry.map((q, j) => (q - r[j]) / h); });
  const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, q, k) => s + q * J[b][k], 0)));
  const s2 = cost / Math.max(1, m - n), z = studentT975(Math.max(1, m - n));
  const cov = Array.from({ length: n }, (_, i) => solve(A, A.map((_, k) => (k === i ? 1 : 0))));
  const nan: [number, number] = [NaN, NaN];
  const band = (mu: number, v: number): [number, number] => (v >= 0 && Number.isFinite(v) ? [Math.exp(mu - z * Math.sqrt(v)), Math.exp(mu + z * Math.sqrt(v))] : nan);
  if (cov.some((c) => !c)) return { beta: nan, gamma: nan, i0: nan, r0: nan };
  const C = (cov as number[][]).map((c) => c.map((q) => q * s2));
  return { beta: band(x[0], C[0][0]), gamma: band(x[1], C[1][1]), i0: band(x[2], C[2][2]), r0: band(x[0] - x[1], C[0][0] + C[1][1] - 2 * C[0][1]) };
}
/** Student's t at 97.5% for `df` degrees of freedom (Hill's expansion; within 1e-4 from df = 3). */
export function studentT975(df: number): number {
  const z = 1.959963984540054, z3 = z ** 3, z5 = z ** 5, z7 = z ** 7;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
}

/** A gamma distribution's weights on days 1…max (the serial interval: days from one case to the case it causes). */
export function serialWeights(mean: number, sd: number, max = Math.ceil(mean + 5 * sd)): number[] {
  const k = (mean / sd) ** 2, th = (sd * sd) / mean;
  const pdf = (x: number) => (x <= 0 ? 0 : Math.exp((k - 1) * Math.log(x) - x / th - k * Math.log(th) - lgamma(k)));
  // Each day's weight is the density's area over [d − 0.5, d + 0.5], by Simpson's rule.
  const w = Array.from({ length: max }, (_, i) => { const a = i + 0.5, b = i + 1.5, m = (a + b) / 2; return ((b - a) / 6) * (pdf(a) + 4 * pdf(m) + pdf(b)); });
  const s = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / s);
}
/** log Γ(x) by Lanczos (g = 7). */
export function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The reproduction number over time from daily cases (renewal equation, a gamma prior a = 1, b = 5 and a sliding
 * window of `win` days): R_t's posterior mean and its 95% interval by a normal approximation of the gamma posterior. */
export function rt(cases: number[], mean: number, sd: number, win = 7): { r: number[]; lo: number[]; hi: number[] } {
  const w = serialWeights(mean, sd), a0 = 1, b0 = 5;
  const lam = cases.map((_, t) => w.reduce((s, ws, i) => (t - i - 1 >= 0 ? s + ws * cases[t - i - 1] : s), 0));
  const r: number[] = [], lo: number[] = [], hi: number[] = [];
  for (let t = 0; t < cases.length; t++) {
    if (t < win) { r.push(NaN); lo.push(NaN); hi.push(NaN); continue; }
    let A = a0, B = 1 / b0;
    for (let s = t - win + 1; s <= t; s++) { A += cases[s]; B += lam[s]; }
    const m = A / B, sdev = Math.sqrt(A) / B;
    r.push(m); lo.push(Math.max(0, m - 1.96 * sdev)); hi.push(m + 1.96 * sdev);
  }
  return { r, lo, hi };
}

/** A stochastic SIR outbreak (M510), Gillespie's exact method: one infection (rate β S I / N) or one recovery (γ I) at a
 * time, waiting an exponential time between them, so small outbreaks can die out by chance. The state is read at each
 * whole day; `rand` gives uniform numbers in [0, 1). Stops early when nobody is infectious, or after `maxEvents`. */
export function sirGillespie(beta: number, gamma: number, y0: [number, number, number], days: number, rand: () => number, maxEvents = 5_000_000): { t: number[]; y: number[][]; events: number } {
  const N = y0[0] + y0[1] + y0[2];
  let [S, I, R] = y0, t = 0, events = 0, next = 0;
  const y: number[][] = [];
  while (next <= days) {
    const a1 = (beta * S * I) / N, a2 = gamma * I, a = a1 + a2;
    const dt = a > 0 && events < maxEvents ? -Math.log(1 - rand()) / a : Infinity;
    while (next <= days && next < t + dt) { y.push([S, I, R]); next++; }
    if (!Number.isFinite(dt)) break;
    t += dt; events++;
    if (rand() * a < a1) { S--; I++; } else { I--; R++; }
  }
  return { t: y.map((_, k) => k), y, events };
}

export interface CareOptions extends EpiOptions { hospital?: number; stay?: number; fatality?: number; beds?: number; fatalityNoBed?: number }
/** SEIHRD (M510): SEIR where a share `hospital` of those leaving I goes to hospital H for `stay` days on average; of
 * those leaving hospital a share `fatality` dies (D), the rest recover. Past `beds` patients, the ones without a bed
 * die at `fatalityNoBed`. State [S E I H R D]; the day's new admissions come back as `admissions`. */
export function seihrd(beta: number, sigma: number, gamma: number, y0: number[], days: number, o: CareOptions = {}): EpiRun & { admissions: number[] } {
  const N = y0.reduce((s, x) => s + x, 0), h = o.hospital ?? 0.05, d = 1 / (o.stay ?? 10), m = o.fatality ?? 0.15, B = o.beds ?? Infinity, mo = o.fatalityNoBed ?? m;
  const v = o.vaccinate ?? 0, vFrom = o.vaccineFrom ?? 0;
  const f = (t: number, [S, E, I, H]: number[]) => {
    const inf = (beta * left(t, o.interventions) * (S * I)) / N, vac = t >= vFrom ? v * S : 0;
    const out = d * H, inBed = Math.min(H, B), die = d * (m * inBed + mo * Math.max(0, H - B));
    return [-inf - vac, inf - sigma * E, sigma * E - gamma * I, h * gamma * I - out, (1 - h) * gamma * I + vac + out - die, die, h * gamma * I, inf];
  };
  const r = rk4Grid(f, grid(days), [...y0, 0, 0], o.step ?? 0.05);
  const adm = r.y.map((s, k) => (k ? s[6] - r.y[k - 1][6] : 0));
  return { t: r.t, y: r.y.map((s) => s.slice(0, 6)), names: ['S', 'E', 'I', 'H', 'R', 'D'], incidence: incidenceOf(r.y), admissions: adm };
}
