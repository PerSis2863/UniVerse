// Hyperion's finance, pricing (M501, the owner's list, group 7: "finance: options, portfolios, risk"): Black–Scholes
// (Merton's form with a continuous dividend yield) and its Greeks, implied volatility, the Cox–Ross–Rubinstein binomial
// tree (European or American), Monte Carlo pricing (European, Asian and knock-out barrier options, antithetic
// variates), and bonds: price from yield, yield from price, Macaulay and modified duration, convexity, a zero curve
// bootstrapped from par yields, and a Nelson–Siegel curve fitted to yields. Rates are continuously compounded for the
// options, per period (with the coupon frequency) for bonds, as in the textbooks (Hull; Fabozzi). Pure.
import { levenbergMarquardt } from './optim';

export type Rand = () => number;
const gauss = (rand: Rand) => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

/** The standard normal distribution function to double precision (Hart's algorithm, after West 2005). */
export function ncdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) c = 0;
  else {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-2 * z + 0.700383064443688; b = b * z + 6.37396220353165; b = b * z + 33.912866078383; b = b * z + 112.079291497871; b = b * z + 221.213596169931; b = b * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264; d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674; d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
      c = (e * b) / d;
    } else { let b = z + 0.65; b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b; c = e / b / 2.506628274631; }
  }
  return x > 0 ? 1 - c : c;
}
export const npdf = (x: number) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

export interface BsGreeks { call: number; put: number; deltaC: number; deltaP: number; gamma: number; vega: number; thetaC: number; thetaP: number; rhoC: number; rhoP: number }
/** Black–Scholes–Merton: spot S, strike K, rate r, years T, volatility σ, dividend yield q. Theta per year. */
export function bs(S: number, K: number, r: number, T: number, sigma: number, q = 0): BsGreeks {
  if (T <= 0 || sigma <= 0) {
    const fwd = S * Math.exp(-q * Math.max(T, 0)), df = Math.exp(-r * Math.max(T, 0));
    const call = Math.max(0, fwd - K * df), put = Math.max(0, K * df - fwd);
    return { call, put, deltaC: fwd > K * df ? Math.exp(-q * T) : 0, deltaP: fwd < K * df ? -Math.exp(-q * T) : 0, gamma: 0, vega: 0, thetaC: 0, thetaP: 0, rhoC: 0, rhoP: 0 };
  }
  const st = sigma * Math.sqrt(T), d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / st, d2 = d1 - st, eq = Math.exp(-q * T), er = Math.exp(-r * T);
  const call = S * eq * ncdf(d1) - K * er * ncdf(d2), put = K * er * ncdf(-d2) - S * eq * ncdf(-d1);
  const common = -(S * eq * npdf(d1) * sigma) / (2 * Math.sqrt(T));
  return {
    call, put, deltaC: eq * ncdf(d1), deltaP: eq * (ncdf(d1) - 1), gamma: (eq * npdf(d1)) / (S * st), vega: S * eq * npdf(d1) * Math.sqrt(T),
    thetaC: common - r * K * er * ncdf(d2) + q * S * eq * ncdf(d1), thetaP: common + r * K * er * ncdf(-d2) - q * S * eq * ncdf(-d1),
    rhoC: K * T * er * ncdf(d2), rhoP: -K * T * er * ncdf(-d2),
  };
}

/** The volatility at which Black–Scholes gives `price` (Newton's method, kept inside a bracket by bisection); NaN when
 * the price is outside what any volatility gives. */
export function impliedVol(price: number, S: number, K: number, r: number, T: number, q = 0, put = false) {
  const val = (s: number) => (put ? bs(S, K, r, T, s, q).put : bs(S, K, r, T, s, q).call);
  let lo = 1e-6, hi = 10;
  if (!(price > val(lo) - 1e-12 && price < val(hi))) return NaN;
  let s = 0.3;
  for (let i = 0; i < 100; i++) {
    const f = val(s) - price;
    if (Math.abs(f) < 1e-12 * Math.max(1, price)) return s;
    if (f > 0) hi = s; else lo = s;
    const v = bs(S, K, r, T, s, q).vega, next = s - f / v;
    s = v > 1e-12 && next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return s;
}

/** The Cox–Ross–Rubinstein tree: prices of the asset and the option at every node (rows are nodes, columns steps). */
export function crr(S: number, K: number, r: number, T: number, sigma: number, n: number, call: boolean, american: boolean, q = 0) {
  const dt = T / n, u = Math.exp(sigma * Math.sqrt(dt)), d = 1 / u, p = (Math.exp((r - q) * dt) - d) / (u - d), disc = Math.exp(-r * dt);
  const asset: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i <= j ? S * u ** (j - i) * d ** i : NaN)));
  const value: number[][] = asset.map((row) => row.slice());
  const pay = (x: number) => Math.max(0, call ? x - K : K - x);
  for (let i = 0; i <= n; i++) value[i][n] = pay(asset[i][n]);
  for (let j = n - 1; j >= 0; j--) for (let i = 0; i <= j; i++) {
    const cont = disc * (p * value[i][j + 1] + (1 - p) * value[i + 1][j + 1]);
    value[i][j] = american ? Math.max(cont, pay(asset[i][j])) : cont;
  }
  return { asset, value, price: value[0][0], p, u };
}

export type Payoff = 'european' | 'asian' | 'barrier';
/** Monte Carlo under geometric Brownian motion: paths of `steps` steps; antithetic pairs; returns the price and its
 * standard error. A barrier option knocks out when the path touches the barrier (above the start: up-and-out). */
export function monteCarlo(S: number, K: number, r: number, T: number, sigma: number, paths: number, rand: Rand, o: { put?: boolean; payoff?: Payoff; barrier?: number; steps?: number; q?: number; antithetic?: boolean } = {}) {
  const steps = o.payoff === 'european' || !o.payoff ? 1 : o.steps ?? 252, dt = T / steps, drift = (r - (o.q ?? 0) - sigma * sigma / 2) * dt, vol = sigma * Math.sqrt(dt);
  const anti = o.antithetic ?? true, B = o.barrier, up = B !== undefined && B > S, pay = (x: number) => Math.max(0, o.put ? K - x : x - K);
  const walk = (z: number[]) => {
    let x = S, sum = 0, alive = true;
    for (const e of z) { x *= Math.exp(drift + vol * e); sum += x; if (B !== undefined && (up ? x >= B : x <= B)) alive = false; }
    if (o.payoff === 'asian') return pay(sum / steps);
    if (o.payoff === 'barrier') return alive ? pay(x) : 0;
    return pay(x);
  };
  const n = anti ? Math.ceil(paths / 2) : paths, vals: number[] = [];
  for (let k = 0; k < n; k++) {
    const z = Array.from({ length: steps }, () => gauss(rand));
    vals.push(anti ? (walk(z) + walk(z.map((v) => -v))) / 2 : walk(z));
  }
  const df = Math.exp(-r * T), m = vals.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  return { price: df * m, se: (df * sd) / Math.sqrt(n) };
}

// ——— Bonds ———
/** Cash flows of a bond: `years` to maturity, coupon rate c a year paid f times a year, face F (whole periods). */
const flows = (F: number, c: number, years: number, f: number) => { const n = Math.max(1, Math.round(years * f)); return Array.from({ length: n }, (_, k) => [(k + 1) / f, (F * c) / f + (k === n - 1 ? F : 0)]); };
export function bondPrice(F: number, c: number, years: number, y: number, f = 2) { return flows(F, c, years, f).reduce((s, [t, cf]) => s + cf / (1 + y / f) ** (t * f), 0); }
export function bondYield(price: number, F: number, c: number, years: number, f = 2) {
  let lo = -0.99 * f, hi = 10;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (bondPrice(F, c, years, m, f) > price) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** Macaulay duration (years), modified duration, and convexity (years²), at yield y. */
export function bondRisk(F: number, c: number, years: number, y: number, f = 2) {
  const cf = flows(F, c, years, f), P = bondPrice(F, c, years, y, f), v = 1 + y / f;
  const mac = cf.reduce((s, [t, x]) => s + (t * x) / v ** (t * f), 0) / P;
  const conv = cf.reduce((s, [t, x]) => s + (x * t * f * (t * f + 1)) / v ** (t * f + 2), 0) / (P * f * f);
  return { price: P, macaulay: mac, modified: mac / v, convexity: conv };
}
/** Zero rates (per period compounding at f) bootstrapped from par yields at maturities 1/f, 2/f, … (each par bond is
 * priced at 100 by the discount factors before it). */
export function bootstrap(par: number[], f = 1) {
  const df: number[] = [];
  par.forEach((c) => { const s = df.reduce((a, d) => a + d, 0); df.push((1 - (c / f) * s) / (1 + c / f)); });
  return { df, zero: df.map((d, k) => f * (d ** (-1 / (k + 1)) - 1)), t: par.map((_, k) => (k + 1) / f) };
}
/** Nelson–Siegel: y(t) = β0 + β1 (1 − e^(−t/τ))/(t/τ) + β2 ((1 − e^(−t/τ))/(t/τ) − e^(−t/τ)). */
export const nelsonSiegel = (p: number[], t: number) => { const [b0, b1, b2, tau] = p, x = t / tau, g = x < 1e-9 ? 1 : (1 - Math.exp(-x)) / x; return b0 + b1 * g + b2 * (g - Math.exp(-x)); };
export function fitNelsonSiegel(t: number[], y: number[]) {
  let best = { x: [0, 0, 0, 1], f: Infinity };
  for (const tau of [0.5, 1, 2, 4, 8]) {
    const r = levenbergMarquardt((p) => t.map((s, i) => nelsonSiegel(p, s) - y[i]), [y[y.length - 1], y[0] - y[y.length - 1], 0, tau], { lb: [-1, -1, -1, 0.05], ub: [1, 1, 1, 50], maxIter: 400 });
    if (r.f < best.f) best = r;
  }
  return { params: best.x, rmse: Math.sqrt(best.f / t.length) };
}
