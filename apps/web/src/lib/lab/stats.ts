// Hyperion's statistics core (M556): the special functions and distributions every test needs, and the tests
// themselves, from the textbook definitions (Numerical Recipes' series and continued fractions; Lanczos' log-gamma),
// accurate to about 1e-12. Pure functions on plain numbers; stats-lab.ts gives them the language's names.

const EPS = 1e-15, FPMIN = 1e-300;

/** log Γ(x) for x > 0 (Lanczos, g = 7, 9 terms). */
export function gammaln(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaln(1 - x);
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The regularised lower incomplete gamma P(a, x). */
export function gammainc(x: number, a: number): number {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const lead = -x + a * Math.log(x) - gammaln(a);
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * EPS) break; }
    return sum * Math.exp(lead);
  }
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN; c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - Math.exp(lead) * h;
}

/** The regularised incomplete beta I_x(a, b). */
export function betainc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (x2: number, a2: number, b2: number) => {
    const qab = a2 + b2, qap = a2 + 1, qam = a2 - 1;
    let c = 1, d = 1 - (qab * x2) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 1000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b2 - m) * x2) / ((qam + m2) * (a2 + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = (-(a2 + m) * (qab + m) * x2) / ((a2 + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(x, a, b)) / a : 1 - (bt * cf(1 - x, b, a)) / b;
}

/** Inverts an increasing cdf on [lo, hi] by bisection (to the last bit). */
function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  if (!(p >= 0 && p <= 1)) return NaN;
  if (p === 0) return lo; if (p === 1) return hi;
  // Widen an open upper end until it covers p.
  if (!Number.isFinite(hi)) { hi = 1; while (cdf(hi) < p && hi < 1e300) hi *= 2; }
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; if (hi - lo <= 1e-15 * Math.max(1, Math.abs(m))) break; }
  return (lo + hi) / 2;
}

export const normcdf = (x: number, mu = 0, s = 1) => { const z = (x - mu) / (s * Math.SQRT2); return z >= 0 ? 0.5 + 0.5 * gammainc(z * z, 0.5) : 0.5 - 0.5 * gammainc(z * z, 0.5); };
export const norminv = (p: number, mu = 0, s = 1) => mu + s * (p <= 0 ? -Infinity : p >= 1 ? Infinity : invert((z) => normcdf(z), p, -40, 40));
export const tcdf = (t: number, v: number) => { const x = v / (v + t * t), q = 0.5 * betainc(x, v / 2, 0.5); return t >= 0 ? 1 - q : q; };
export const tinv = (p: number, v: number) => (p <= 0 ? -Infinity : p >= 1 ? Infinity : invert((t) => tcdf(t, v), p, -1e6, 1e6));
export const chi2cdf = (x: number, v: number) => gammainc(x / 2, v / 2);
export const chi2inv = (p: number, v: number) => (p >= 1 ? Infinity : invert((x) => chi2cdf(x, v), p, 0, Infinity));
export const fcdf = (x: number, v1: number, v2: number) => (x <= 0 ? 0 : betainc((v1 * x) / (v1 * x + v2), v1 / 2, v2 / 2));
export const finv = (p: number, v1: number, v2: number) => (p >= 1 ? Infinity : invert((x) => fcdf(x, v1, v2), p, 0, Infinity));
export const betacdf = (x: number, a: number, b: number) => betainc(x, a, b);
export const gamcdf = (x: number, k: number, theta = 1) => gammainc(x / theta, k);
export const binocdf = (x: number, n: number, p: number) => (x < 0 ? 0 : x >= n ? 1 : 1 - betainc(p, Math.floor(x) + 1, n - Math.floor(x)));
export const poisscdf = (x: number, l: number) => (x < 0 ? 0 : 1 - gammainc(l, Math.floor(x) + 1));

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
const vari = (x: number[]) => { const m = mean(x); return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1); };
/** A two-sided (or one-sided: 'right' / 'left') p-value from a t statistic. */
const tp = (t: number, df: number, tail: Tail) => (tail === 'right' ? 1 - tcdf(t, df) : tail === 'left' ? tcdf(t, df) : 2 * (1 - tcdf(Math.abs(t), df)));
export type Tail = 'both' | 'right' | 'left';

/** One-sample (or paired, on the differences) t-test of mean m. */
export function ttest(x: number[], m = 0, alpha = 0.05, tail: Tail = 'both') {
  const n = x.length, df = n - 1, sd = Math.sqrt(vari(x)), se = sd / Math.sqrt(n), t = (mean(x) - m) / se, p = tp(t, df, tail);
  const q = tail === 'both' ? tinv(1 - alpha / 2, df) : tinv(1 - alpha, df);
  const ci: [number, number] = tail === 'both' ? [mean(x) - q * se, mean(x) + q * se] : tail === 'right' ? [mean(x) - q * se, Infinity] : [-Infinity, mean(x) + q * se];
  return { h: p <= alpha ? 1 : 0, p, ci, tstat: t, df, sd };
}
/** Two-sample t-test: equal variances (pooled) or not (Welch–Satterthwaite). */
export function ttest2(x: number[], y: number[], alpha = 0.05, tail: Tail = 'both', equal = true) {
  const nx = x.length, ny = y.length, vx = vari(x), vy = vari(y), d = mean(x) - mean(y);
  let df: number, se: number;
  if (equal) { df = nx + ny - 2; const sp = ((nx - 1) * vx + (ny - 1) * vy) / df; se = Math.sqrt(sp * (1 / nx + 1 / ny)); }
  else { const a = vx / nx, b = vy / ny; se = Math.sqrt(a + b); df = (a + b) ** 2 / (a * a / (nx - 1) + b * b / (ny - 1)); }
  const t = d / se, p = tp(t, df, tail), q = tail === 'both' ? tinv(1 - alpha / 2, df) : tinv(1 - alpha, df);
  const ci: [number, number] = tail === 'both' ? [d - q * se, d + q * se] : tail === 'right' ? [d - q * se, Infinity] : [-Infinity, d + q * se];
  return { h: p <= alpha ? 1 : 0, p, ci, tstat: t, df, sd: equal ? Math.sqrt(((nx - 1) * vx + (ny - 1) * vy) / (nx + ny - 2)) : [Math.sqrt(vx), Math.sqrt(vy)] };
}

/** Ranks with ties given their average rank; also the tie correction Σ(t³ − t). */
export function tiedrank(x: number[]) {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(x.length);
  let ties = 0;
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1, t = j - i + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    if (t > 1) ties += t ** 3 - t;
    i = j + 1;
  }
  return { r, ties };
}

/** Wilcoxon rank-sum (Mann–Whitney): exact for small samples without ties, otherwise the normal approximation with a
 *  tie and continuity correction. W is the first sample's rank sum. */
export function ranksum(x: number[], y: number[], alpha = 0.05) {
  const nx = x.length, ny = y.length, { r, ties } = tiedrank([...x, ...y]), W = r.slice(0, nx).reduce((s, v) => s + v, 0), N = nx + ny;
  let p: number, z: number | null = null;
  if (nx + ny <= 20 && ties === 0) {
    // Count, by dynamic programming, the subsets of size nx of 1..N with each rank sum.
    const max = (N * (N + 1)) / 2, f: number[][] = Array.from({ length: nx + 1 }, () => new Array<number>(max + 1).fill(0));
    f[0][0] = 1;
    for (let k = 1; k <= N; k++) for (let c = Math.min(k, nx); c >= 1; c--) for (let s = max; s >= k; s--) f[c][s] += f[c - 1][s - k];
    const total = f[nx].reduce((a, b) => a + b, 0), lo = f[nx].slice(0, Math.floor(W) + 1).reduce((a, b) => a + b, 0) / total, hi = f[nx].slice(Math.ceil(W)).reduce((a, b) => a + b, 0) / total;
    p = Math.min(1, 2 * Math.min(lo, hi));
  } else {
    const mu = (nx * (N + 1)) / 2, s = Math.sqrt(((nx * ny) / 12) * (N + 1 - ties / (N * (N - 1))));
    z = (W - mu - 0.5 * Math.sign(W - mu)) / s;
    p = 2 * (1 - normcdf(Math.abs(z)));
  }
  return { p, h: p <= alpha ? 1 : 0, ranksum: W, zval: z };
}

/** Wilcoxon signed-rank test of median m (or of paired differences): exact up to 15 non-zero differences. */
export function signrank(x: number[], m = 0, alpha = 0.05) {
  const d = x.map((v) => v - m).filter((v) => v !== 0), n = d.length, { r, ties } = tiedrank(d.map(Math.abs));
  const Wp = d.reduce((s, v, i) => s + (v > 0 ? r[i] : 0), 0);
  let p: number, z: number | null = null;
  if (n <= 15 && ties === 0) {
    const max = (n * (n + 1)) / 2, f = new Array<number>(max + 1).fill(0);
    f[0] = 1;
    for (let k = 1; k <= n; k++) for (let s = max; s >= k; s--) f[s] += f[s - k];
    const total = 2 ** n, W = Math.min(Wp, max - Wp), tail = f.slice(0, Math.floor(W) + 1).reduce((a, b) => a + b, 0) / total;
    p = Math.min(1, 2 * tail);
  } else {
    const mu = (n * (n + 1)) / 4, s = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - ties / 48);
    z = (Wp - mu - 0.5 * Math.sign(Wp - mu)) / s;
    p = 2 * (1 - normcdf(Math.abs(z)));
  }
  return { p, h: p <= alpha ? 1 : 0, signedrank: Wp, zval: z };
}

/** One-way ANOVA: groups' values; the table rows Groups, Error, Total as [SS df MS F p]. */
export function anova1(groups: number[][]) {
  const all = groups.flat(), g = mean(all), k = groups.length, N = all.length;
  const ssb = groups.reduce((s, x) => s + x.length * (mean(x) - g) ** 2, 0), ssw = groups.reduce((s, x) => s + x.reduce((t, v) => t + (v - mean(x)) ** 2, 0), 0);
  const dfb = k - 1, dfw = N - k, F = ssb / dfb / (ssw / dfw), p = 1 - fcdf(F, dfb, dfw);
  return { p, F, table: [['Groups', ssb, dfb, ssb / dfb, F, p], ['Error', ssw, dfw, ssw / dfw, NaN, NaN], ['Total', ssb + ssw, N - 1, NaN, NaN, NaN]] as [string, number, number, number, number, number][] };
}
/** Two-way ANOVA with `reps` rows per cell (MATLAB's anova2 layout: columns one factor, row blocks the other). */
export function anova2(y: number[][], reps = 1) {
  const R = y.length / reps, C = y[0].length, N = y.length * C, g = mean(y.flat());
  const cell = (i: number, j: number) => y.slice(i * reps, (i + 1) * reps).map((row) => row[j]);
  const colM = Array.from({ length: C }, (_, j) => mean(y.map((row) => row[j]))), rowM = Array.from({ length: R }, (_, i) => mean(y.slice(i * reps, (i + 1) * reps).flat()));
  const ssc = R * reps * colM.reduce((s, m) => s + (m - g) ** 2, 0), ssr = C * reps * rowM.reduce((s, m) => s + (m - g) ** 2, 0);
  const sst = y.flat().reduce((s, v) => s + (v - g) ** 2, 0);
  let sse = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const c = cell(i, j), m = mean(c); sse += c.reduce((s, v) => s + (v - m) ** 2, 0); }
  const ssi = reps > 1 ? sst - ssc - ssr - sse : 0, dfc = C - 1, dfr = R - 1, dfi = reps > 1 ? dfc * dfr : 0;
  const dfe = reps > 1 ? R * C * (reps - 1) : dfc * dfr, mse = (reps > 1 ? sse : sst - ssc - ssr) / dfe;
  const row = (name: string, ss: number, df: number): [string, number, number, number, number, number] => { const F = ss / df / mse; return [name, ss, df, ss / df, F, 1 - fcdf(F, df, dfe)]; };
  const table = [row('Columns', ssc, dfc), row('Rows', ssr, dfr), ...(reps > 1 ? [row('Interaction', ssi, dfi)] : []), ['Error', mse * dfe, dfe, mse, NaN, NaN] as [string, number, number, number, number, number], ['Total', sst, N - 1, NaN, NaN, NaN] as [string, number, number, number, number, number]];
  return { p: table.filter((r) => Number.isFinite(r[5])).map((r) => r[5]), table };
}
/** Kruskal–Wallis: ranks across groups; H with the tie correction, χ² with k − 1 degrees of freedom. */
export function kruskalwallis(groups: number[][]) {
  const all = groups.flat(), N = all.length, { r, ties } = tiedrank(all);
  let at = 0, H = 0;
  for (const gp of groups) { const R = r.slice(at, at + gp.length).reduce((s, v) => s + v, 0); H += (R * R) / gp.length; at += gp.length; }
  H = ((12 / (N * (N + 1))) * H - 3 * (N + 1)) / (1 - ties / (N ** 3 - N));
  return { p: 1 - chi2cdf(H, groups.length - 1), H, df: groups.length - 1 };
}

/** χ² goodness of fit to a normal with the data's mean and sd, in bins of at least 5 expected (pooled from the tails). */
export function chi2gof(x: number[], nbins = 10, alpha = 0.05) {
  const n = x.length, m = mean(x), s = Math.sqrt(vari(x)), lo = Math.min(...x), hi = Math.max(...x), w = (hi - lo) / nbins;
  let edges = Array.from({ length: nbins + 1 }, (_, i) => lo + i * w);
  const counts = (e: number[]) => e.slice(0, -1).map((a, i) => x.filter((v) => (i === e.length - 2 ? v >= a && v <= e[i + 1] : v >= a && v < e[i + 1])).length);
  const expected = (e: number[]) => e.slice(0, -1).map((a, i) => n * ((i === e.length - 2 ? 1 : normcdf(e[i + 1], m, s)) - (i === 0 ? 0 : normcdf(a, m, s))));
  // Merge bins whose expected count is under 5, from the outside in.
  for (let guard = 0; guard < nbins; guard++) {
    const E = expected(edges);
    if (E.length <= 2 || Math.min(...E) >= 5) break;
    const i = E.indexOf(Math.min(...E));
    edges = edges.filter((_, k) => k !== (i === 0 ? 1 : i === E.length - 1 ? E.length - 1 : E[i - 1] < E[i + 1] ? i : i + 1));
  }
  const O = counts(edges), E = expected(edges), stat = O.reduce((s, o, i) => s + (o - E[i]) ** 2 / E[i], 0), df = O.length - 1 - 2;
  const p = df > 0 ? 1 - chi2cdf(stat, df) : NaN;
  return { h: p <= alpha ? 1 : 0, p, chi2stat: stat, df, edges, O, E };
}

/** Normal fit: mean, sd and their confidence intervals. */
export function normfit(x: number[], alpha = 0.05) {
  const n = x.length, m = mean(x), s = Math.sqrt(vari(x)), q = tinv(1 - alpha / 2, n - 1);
  return { mu: m, sigma: s, muci: [m - (q * s) / Math.sqrt(n), m + (q * s) / Math.sqrt(n)] as [number, number], sigmaci: [s * Math.sqrt((n - 1) / chi2inv(1 - alpha / 2, n - 1)), s * Math.sqrt((n - 1) / chi2inv(alpha / 2, n - 1))] as [number, number] };
}

/** Maximum-likelihood fits by name, with their parameters' names and the log-likelihood. */
export function fitdist(x: number[], name: string): { name: string; names: string[]; params: number[]; logL: number } {
  const n = x.length, m = mean(x), d = name.toLowerCase();
  if (d === 'normal') { const s = Math.sqrt(vari(x)); return { name: 'Normal', names: ['mu', 'sigma'], params: [m, s], logL: x.reduce((a, v) => a - 0.5 * Math.log(2 * Math.PI * s * s) - (v - m) ** 2 / (2 * s * s), 0) }; }
  if (d === 'exponential') return { name: 'Exponential', names: ['mu'], params: [m], logL: -n * Math.log(m) - n };
  if (d === 'poisson') return { name: 'Poisson', names: ['lambda'], params: [m], logL: x.reduce((a, k) => a + k * Math.log(m) - m - gammaln(k + 1), 0) };
  if (d === 'lognormal') { const l = x.map(Math.log), lm = mean(l), ls = Math.sqrt(l.reduce((a, v) => a + (v - lm) ** 2, 0) / n); return { name: 'Lognormal', names: ['mu', 'sigma'], params: [lm, ls], logL: l.reduce((a, v) => a - v - 0.5 * Math.log(2 * Math.PI * ls * ls) - (v - lm) ** 2 / (2 * ls * ls), 0) }; }
  if (d === 'gamma') {
    // Shape by Newton on log k − ψ(k) = log m − mean(log x) (Minka's start), scale = m / k.
    const s = Math.log(m) - mean(x.map(Math.log));
    let k = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
    const psi = (z: number) => (gammaln(z + 1e-5) - gammaln(z - 1e-5)) / 2e-5, tri = (z: number) => (psi(z + 1e-4) - psi(z - 1e-4)) / 2e-4;
    for (let i = 0; i < 50; i++) { const f = Math.log(k) - psi(k) - s, step = f / (1 / k - tri(k)); k -= step; if (Math.abs(step) < 1e-12 * k) break; }
    const th = m / k;
    return { name: 'Gamma', names: ['a', 'b'], params: [k, th], logL: x.reduce((a, v) => a + (k - 1) * Math.log(v) - v / th - gammaln(k) - k * Math.log(th), 0) };
  }
  throw new Error(`fitdist knows Normal, Exponential, Poisson, Lognormal and Gamma, not ${name}.`);
}

/** Bootstrap: `stat` of n resamples (with replacement, from `rand`), and a confidence interval (percentile or BCa). */
export function bootstrap(data: number[], stat: (x: number[]) => number, n: number, rand: () => number) {
  const N = data.length, out = new Array<number>(n);
  for (let b = 0; b < n; b++) { const s = new Array<number>(N); for (let i = 0; i < N; i++) s[i] = data[Math.floor(rand() * N)]; out[b] = stat(s); }
  return out;
}
export function bootci(data: number[], stat: (x: number[]) => number, n: number, rand: () => number, alpha = 0.05, type: 'bca' | 'per' = 'bca'): [number, number] {
  const b = bootstrap(data, stat, n, rand).sort((x, y) => x - y), q = (p: number) => b[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  if (type === 'per') return [q(alpha / 2), q(1 - alpha / 2)];
  // BCa: the bias from the share of resamples below the estimate, the acceleration from the jackknife.
  const t0 = stat(data), z0 = norminv(b.filter((v) => v < t0).length / n), jack = data.map((_, i) => stat(data.filter((__, k) => k !== i))), jm = mean(jack);
  const a = jack.reduce((s, v) => s + (jm - v) ** 3, 0) / (6 * jack.reduce((s, v) => s + (jm - v) ** 2, 0) ** 1.5 || 1);
  const adj = (z: number) => normcdf(z0 + (z0 + z) / (1 - a * (z0 + z)));
  return [q(adj(norminv(alpha / 2))), q(adj(norminv(1 - alpha / 2)))];
}
