// Hyperion's finance, portfolios and risk (M502, the owner's list, group 7): returns from prices and back, mean–variance
// portfolios (Markowitz) and the efficient frontier with or without short selling (an active-set method on the KKT
// equations), the tangency (best Sharpe) portfolio, value at risk and expected shortfall (historical, normal,
// Cornish–Fisher), Kupiec's test of a VaR model against what happened (model risk), GARCH(1,1) volatility fitted by
// maximum likelihood and the RiskMetrics EWMA, back-testing a moving-average strategy against buy and hold, drawdowns,
// and a plain carbon-price stress (a climate transition risk basic). Pure: randomness comes in as a function.
import { nelderMead, solve } from './optim';
import { ncdf, npdf } from './fin';

export type Rand = () => number;
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
const sd = (x: number[]) => { const m = mean(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };

export const toReturns = (p: number[], log = false) => p.slice(1).map((v, i) => (log ? Math.log(v / p[i]) : v / p[i] - 1));
export const toPrices = (r: number[], start = 1, log = false) => { const out = [start]; for (const v of r) out.push(out[out.length - 1] * (log ? Math.exp(v) : 1 + v)); return out; };

/** The sample mean of each column and their covariance. */
export function stats(R: number[][]) {
  const T = R.length, n = R[0].length, mu = Array.from({ length: n }, (_, j) => R.reduce((s, r) => s + r[j], 0) / T);
  const C = mu.map((_, a) => mu.map((__, b) => R.reduce((s, r) => s + (r[a] - mu[a]) * (r[b] - mu[b]), 0) / (T - 1)));
  return { mu, C };
}
const quad = (w: number[], C: number[][]) => w.reduce((s, wi, i) => s + wi * C[i].reduce((t, c, j) => t + c * w[j], 0), 0);
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** The least-risk portfolio with return `target` (or any return when it is undefined): minimise w'Cw with 1'w = 1,
 * μ'w = target and, long-only, w ≥ 0 (assets leave and join the free set until the KKT conditions hold). */
export function minRisk(mu: number[], C: number[][], target?: number, longOnly = true) {
  const n = mu.length;
  let free = mu.map((_, i) => i);
  for (let iter = 0; iter < 10 * n + 20; iter++) {
    const k = free.length, eqs = target === undefined ? 1 : 2, A: number[][] = [], b: number[] = [];
    // KKT: 2 C_FF w_F − γ μ_F − δ 1 = 0; 1'w_F = 1; μ_F'w_F = target.
    for (const i of free) { A.push([...free.map((j) => 2 * C[i][j]), -1, ...(eqs === 2 ? [-mu[i]] : [])]); b.push(0); }
    A.push([...free.map(() => 1), 0, ...(eqs === 2 ? [0] : [])]); b.push(1);
    if (eqs === 2) { A.push([...free.map((i) => mu[i]), 0, 0]); b.push(target!); }
    const x = solve(A, b);
    if (!x) return null;
    const w = new Array(n).fill(0);
    free.forEach((i, q) => { w[i] = x[q]; });
    if (!longOnly) return w;
    const neg = free.filter((i) => w[i] < -1e-12);
    if (neg.length) { const worst = neg.reduce((a, i) => (w[i] < w[a] ? i : a), neg[0]); free = free.filter((i) => i !== worst); if (!free.length) return null; continue; }
    // Multipliers of the assets held at zero: one that wants in (negative) rejoins.
    const delta = x[k], gamma = eqs === 2 ? x[k + 1] : 0, out = mu.map((_, i) => i).filter((i) => !free.includes(i));
    const lam = out.map((i) => 2 * C[i].reduce((s, c, j) => s + c * w[j], 0) - delta - gamma * mu[i]);
    const j = lam.findIndex((v) => v < -1e-12);
    if (j < 0) return w.map((v) => Math.max(0, v));
    free = [...free, out[j]].sort((p, q) => p - q);
  }
  return null;
}
/** Points along the efficient frontier from the least-risk portfolio to the highest reachable return. */
export function frontier(mu: number[], C: number[][], n = 20, longOnly = true) {
  const w0 = minRisk(mu, C, undefined, longOnly)!, lo = dot(w0, mu), hi = longOnly ? Math.max(...mu) : lo + 3 * (Math.max(...mu) - lo);
  const pts: { risk: number; ret: number; w: number[] }[] = [];
  for (let k = 0; k < n; k++) { const t = lo + ((hi - lo) * k) / (n - 1), w = k === 0 ? w0 : minRisk(mu, C, t, longOnly); if (w) pts.push({ risk: Math.sqrt(quad(w, C)), ret: dot(w, mu), w }); }
  return pts;
}
/** The tangency portfolio: the highest Sharpe ratio over the risk-free rate (searched along a fine frontier and refined). */
export function maxSharpe(mu: number[], C: number[][], rf = 0, longOnly = true) {
  const f = frontier(mu, C, 200, longOnly);
  let best = f.reduce((a, p) => ((p.ret - rf) / p.risk > (a.ret - rf) / a.risk ? p : a), f[0]);
  // Golden-section on the target return around the best point.
  const i = f.indexOf(best), lo0 = f[Math.max(0, i - 1)].ret, hi0 = f[Math.min(f.length - 1, i + 1)].ret, g = (Math.sqrt(5) - 1) / 2;
  const sr = (t: number) => { const w = minRisk(mu, C, t, longOnly); return w ? (dot(w, mu) - rf) / Math.sqrt(quad(w, C)) : -Infinity; };
  let a = lo0, b = hi0;
  for (let k = 0; k < 60; k++) { const c = b - g * (b - a), d = a + g * (b - a); if (sr(c) > sr(d)) b = d; else a = c; }
  const w = minRisk(mu, C, (a + b) / 2, longOnly);
  if (w) { const r = { risk: Math.sqrt(quad(w, C)), ret: dot(w, mu), w }; if ((r.ret - rf) / r.risk >= (best.ret - rf) / best.risk) best = r; }
  return { ...best, sharpe: (best.ret - rf) / best.risk };
}
export const portfolio = (w: number[], mu: number[], C: number[][]) => ({ risk: Math.sqrt(quad(w, C)), ret: dot(w, mu) });

/** The inverse of the normal distribution function (Acklam's rational approximation, refined by one Newton step). */
export function ninv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  let x: number;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  return x - (ncdf(x) - p) / npdf(x);
}

/** Value at risk and expected shortfall of returns at confidence c (0.95, 0.99), as positive losses (fractions). */
export function var_(r: number[], c: number, method: 'historical' | 'normal' | 'cornishfisher') {
  const m = mean(r), s = sd(r);
  if (method === 'historical') {
    const sorted = [...r].sort((p, q) => p - q), k = (1 - c) * (r.length - 1), lo = Math.floor(k), q = sorted[lo] + (k - lo) * ((sorted[lo + 1] ?? sorted[lo]) - sorted[lo]);
    const tail = sorted.filter((v) => v <= q);
    return { var: -q, es: -mean(tail.length ? tail : [q]) };
  }
  let z = ninv(1 - c);
  if (method === 'cornishfisher') {
    const n = r.length, sk = r.reduce((a, v) => a + ((v - m) / s) ** 3, 0) / n, ku = r.reduce((a, v) => a + ((v - m) / s) ** 4, 0) / n - 3;
    z = z + ((z * z - 1) * sk) / 6 + ((z ** 3 - 3 * z) * ku) / 24 - ((2 * z ** 3 - 5 * z) * sk * sk) / 36;
  }
  return { var: -(m + z * s), es: -(m - (s * npdf(ninv(1 - c))) / (1 - c)) };
}
/** Kupiec's proportion-of-failures test: given the losses beyond VaR on `x` of `n` days at confidence c, the
 * likelihood ratio (χ² with 1 degree of freedom) and its p-value (small: the model is wrong). */
export function kupiec(x: number, n: number, c: number) {
  const p = 1 - c, ph = x / n, ll = (q: number) => (n - x) * Math.log(1 - q) + (x ? x * Math.log(q) : 0);
  const lr = x === 0 ? -2 * n * Math.log(1 - p) : x === n ? -2 * n * Math.log(p) : -2 * (ll(p) - ll(ph));
  return { lr, p: erfc(Math.sqrt(lr / 2)) };
}
function erfc(x: number) { return 2 * (1 - ncdf(x * Math.SQRT2)); }

/** GARCH(1,1): σ²_t = ω + α r²_{t−1} + β σ²_{t−1}, fitted by maximum likelihood (normal), α + β < 1. */
export function garchFit(r: number[]) {
  const m = mean(r), e = r.map((v) => v - m), v0 = e.reduce((s, x) => s + x * x, 0) / e.length;
  const unpack = (p: number[]) => { const s = 0.9999 / (1 + Math.exp(-p[1])), share = 1 / (1 + Math.exp(-p[2])); return { omega: Math.exp(p[0]), alpha: s * (1 - share), beta: s * share }; };
  const series = (g: { omega: number; alpha: number; beta: number }) => { const v = [v0]; for (let t = 1; t < e.length; t++) v.push(g.omega + g.alpha * e[t - 1] ** 2 + g.beta * v[t - 1]); return v; };
  const nll = (p: number[]) => { const g = unpack(p), v = series(g); let s = 0; for (let t = 0; t < e.length; t++) s += Math.log(v[t]) + (e[t] * e[t]) / v[t]; return Number.isFinite(s) ? 0.5 * s : 1e18; };
  // Start where α + β = 0.95, β/(α+β) = 0.9, ω giving the sample variance.
  const s0 = Math.log(0.95 / 0.0499), p0 = [Math.log(v0 * 0.05), s0, Math.log(9)];
  let best = nelderMead(nll, p0, { maxIter: 2000, maxEvals: 4000, tolX: 1e-9, tolFun: 1e-10 });
  best = nelderMead(nll, best.x, { maxIter: 2000, maxEvals: 4000, tolX: 1e-10, tolFun: 1e-12 });
  const g = unpack(best.x), v = series(g);
  return { ...g, mean: m, sigma: v.map(Math.sqrt), longRun: Math.sqrt(g.omega / (1 - g.alpha - g.beta)), logLik: -best.f - (e.length / 2) * Math.log(2 * Math.PI) };
}
/** A GARCH(1,1) path, for practice and tests. */
export function garchSim(n: number, omega: number, alpha: number, beta: number, rand: Rand) {
  const g = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  let v = omega / (1 - alpha - beta), prev = 0;
  return Array.from({ length: n }, () => { v = omega + alpha * prev * prev + beta * v; prev = Math.sqrt(v) * g(); return prev; });
}
/** RiskMetrics: σ²_t = λ σ²_{t−1} + (1 − λ) r²_{t−1}. */
export function ewma(r: number[], lambda = 0.94) { let v = r.slice(0, 20).reduce((s, x) => s + x * x, 0) / Math.min(20, r.length); return r.map((x) => { const out = Math.sqrt(v); v = lambda * v + (1 - lambda) * x * x; return out; }); }

/** The deepest fall from a peak (a fraction), and where it started and ended. */
export function maxDrawdown(p: number[]) {
  let peak = p[0], at = 0, best = 0, from = 0, to = 0;
  p.forEach((v, i) => { if (v > peak) { peak = v; at = i; } const dd = (peak - v) / peak; if (dd > best) { best = dd; from = at; to = i; } });
  return { dd: best, from, to };
}
/** A moving-average crossover: hold the asset while the short average is above the long one (decided on yesterday's
 * close, so no look-ahead), paying `cost` of each trade. Returns both equity curves and their statistics. */
export function backtestMA(p: number[], short: number, long: number, cost = 0.001, perYear = 252) {
  const ma = (n: number, i: number) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += p[k]; return s / n; };
  const eq = [1], hold = [1], pos: number[] = [0];
  let trades = 0;
  for (let i = 1; i < p.length; i++) {
    const r = p[i] / p[i - 1] - 1, inNow = i - 1 >= long - 1 && ma(short, i - 1) > ma(long, i - 1) ? 1 : 0;
    if (inNow !== pos[pos.length - 1]) trades++;
    eq.push(eq[i - 1] * (1 + inNow * r) * (inNow !== pos[pos.length - 1] ? 1 - cost : 1));
    hold.push(hold[i - 1] * (1 + r)); pos.push(inNow);
  }
  const summary = (e: number[]) => { const r = toReturns(e), years = (e.length - 1) / perYear; return { cagr: e[e.length - 1] ** (1 / years) - 1, vol: sd(r) * Math.sqrt(perYear), sharpe: (mean(r) / sd(r)) * Math.sqrt(perYear), maxdd: maxDrawdown(e).dd }; };
  return { equity: eq, hold, position: pos, trades, strategy: summary(eq), buyHold: summary(hold) };
}

/** A carbon-price stress: each holding's yearly extra cost (emissions × price × (1 − pass-through)) valued as a
 * perpetuity at `rate`, as a share of the holding's value (capped at 100%). Values and emissions in consistent units:
 * value in $, emissions in tonnes CO₂ a year, price in $ a tonne. */
export function carbonStress(values: number[], emissions: number[], price: number, passThrough = 0, rate = 0.08) {
  const loss = values.map((v, i) => Math.min(v, (emissions[i] * price * (1 - passThrough)) / rate));
  const total = values.reduce((s, v) => s + v, 0);
  return { loss, share: loss.map((l, i) => l / values[i]), portfolio: loss.reduce((s, v) => s + v, 0) / total };
}

// ——— Climate scenarios (M509) ———

/** One time series of an IAMC-format scenario file (the format of NGFS's and IPCC's scenario explorers). */
export interface IamcSeries { model: string; scenario: string; region: string; variable: string; unit: string; years: number[]; values: number[] }
/** Reads IAMC rows: a header with Model, Scenario, Region, Variable, Unit and a column per year (in any order and
 * case); rows missing a name are skipped, empty cells become NaN. */
export function readIamc(rows: string[][]): IamcSeries[] {
  const h = rows.findIndex((r) => r.some((c) => /^model$/i.test(c.trim())) && r.some((c) => /^variable$/i.test(c.trim())));
  if (h < 0) throw new Error('No header with Model, Scenario, Region, Variable and Unit: this isn’t an IAMC scenario file.');
  const head = rows[h].map((c) => c.trim()), at = (n: string) => head.findIndex((c) => c.toLowerCase() === n);
  const cols = { model: at('model'), scenario: at('scenario'), region: at('region'), variable: at('variable'), unit: at('unit') };
  if (Object.values(cols).some((i) => i < 0)) throw new Error('The header needs Model, Scenario, Region, Variable and Unit columns.');
  const yearCols = head.map((c, i) => [Number(c), i] as const).filter(([y]) => Number.isInteger(y) && y > 1800 && y < 2500);
  if (!yearCols.length) throw new Error('The header has no year columns (2020, 2025, …).');
  const out: IamcSeries[] = [];
  for (const r of rows.slice(h + 1)) {
    if (!r[cols.variable]?.trim() || !r[cols.scenario]?.trim()) continue;
    out.push({
      model: r[cols.model]?.trim() ?? '', scenario: r[cols.scenario].trim(), region: r[cols.region]?.trim() ?? '', variable: r[cols.variable].trim(), unit: r[cols.unit]?.trim() ?? '',
      years: yearCols.map(([y]) => y), values: yearCols.map(([, i]) => { const t = (r[i] ?? '').trim(); return t === '' ? NaN : Number(t); }),
    });
  }
  return out;
}

/** NGFS Phase V's stated range of the global (shadow) carbon price in Net Zero 2050, across its models, in US$2010 a
 * tonne of CO₂: "100-260 US$2010/t CO2 in 2030, and 500-1,250 US$2010/t CO2 in 2050" (NGFS long-term scenarios,
 * narratives and key findings, 2025). Shared under the NGFS Scenarios' licence (adapted CC BY 4.0) as a small part,
 * with credit; other scenarios and years come from the person's own download. */
export const NGFS_NZ2050 = {
  scenario: 'Net Zero 2050', years: [2030, 2050], low: [100, 500], high: [260, 1250], unit: 'US$2010/t CO2',
  source: 'NGFS long-term scenarios, narratives and key findings (NGFS, Phase V, 2025): global shadow carbon price in Net Zero 2050 across models. Licence: data.ene.iiasa.ac.at/ngfs/#/license (adapted CC BY 4.0).',
};

/** A price path given at some years, read at each whole year from `start` to the last given year: straight lines
 * between given years; before the first, a straight line from `before` at `start` (0: no price yet). */
export function yearly(years: number[], prices: number[], start: number, before = 0): { year: number[]; price: number[] } {
  const pts = years.map((y, i) => [y, prices[i]] as const).filter(([y, p]) => Number.isFinite(y) && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  if (!pts.length) throw new Error('The price path has no numbers.');
  const end = pts[pts.length - 1][0], year: number[] = [], price: number[] = [];
  for (let t = Math.min(start, end); t <= end; t++) {
    const k = pts.findIndex(([y]) => y >= t);
    let p: number;
    if (k === 0 && pts[0][0] > t) { const [y0, p0] = pts[0]; p = start >= y0 ? p0 : before + ((p0 - before) * (t - start)) / (y0 - start); }
    else if (pts[k][0] === t) p = pts[k][1];
    else { const [y0, p0] = pts[k - 1], [y1, p1] = pts[k]; p = p0 + ((p1 - p0) * (t - y0)) / (y1 - y0); }
    year.push(t); price.push(p);
  }
  return { year, price };
}

/** A carbon-price path's stress: each holding pays emissions × price × (1 − pass-through) every year, its emissions
 * falling by `decline` a year, discounted at `rate` to `start`; after the path's last year the last cost goes on for
 * ever (a growing-or-falling perpetuity). The loss is capped at the holding's value. */
export function carbonStressPath(values: number[], emissions: number[], years: number[], prices: number[], o: { passThrough?: number; rate?: number; decline?: number; start?: number } = {}) {
  const pass = o.passThrough ?? 0, rate = o.rate ?? 0.08, d = o.decline ?? 0, start = o.start ?? Math.min(...years);
  const path = yearly(years, prices, start);
  const loss = values.map((v, i) => {
    let pv = 0, last = 0;
    path.year.forEach((t, k) => { const n = t - start; last = emissions[i] * (1 - d) ** n * path.price[k] * (1 - pass); pv += last / (1 + rate) ** (n + 1); }); // paid at each year's end, as carbonStress's perpetuity
    const n = path.year[path.year.length - 1] - start;
    pv += (last * (1 - d)) / (rate + d) / (1 + rate) ** (n + 1); // the years after, as a perpetuity shrinking with the emissions
    return Math.min(v, pv);
  });
  const total = values.reduce((s, v) => s + v, 0);
  return { loss, share: loss.map((l, i) => l / values[i]), portfolio: loss.reduce((s, v) => s + v, 0) / total, path };
}
