import { dft } from './fft';

// Hyperion's predictive maintenance (M423, the owner's list: "Predictive Maintenance"): telling a machine's health from
// its signals and when it will need fixing. Our own code from the standard formulas: the analytic signal (Hilbert),
// envelopes and the envelope spectrum (bearing faults show at their defect frequencies), bearing defect frequencies,
// change points (exact dynamic programming or a penalty per change), CUSUM, how good a feature is for prognosis
// (monotonicity, trendability, prognosability), and degradation models (exponential and linear) that learn from a
// fleet and update on one machine (Bayesian linear regression) to predict its remaining useful life.

export type Rand = () => number;
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** x + i·H{x}: the FFT with the negative frequencies removed and the positive ones doubled. */
export function analytic(x: number[]): { re: Float64Array; im: Float64Array } {
  const n = x.length, [re, im] = dft(x, new Array(n).fill(0));
  for (let k = 1; k < n; k++) { const w = k < n / 2 ? 2 : k === n / 2 ? 1 : 0; re[k] *= w; im[k] *= w; }
  const [r, i] = dft([...re], [...im], true);
  return { re: r, im: i };
}
/** The upper envelope: the analytic signal's size around the mean. */
export function envelope(x: number[]) { const m = mean(x), a = analytic(x.map((v) => v - m)); return Array.from(a.re, (r, k) => m + Math.hypot(r, a.im[k])); }
/** The envelope's one-sided amplitude spectrum: frequencies and amplitudes. */
export function envspectrum(x: number[], fs: number) {
  const m = mean(x), a = analytic(x.map((v) => v - m)), env = Array.from(a.re, (r, k) => Math.hypot(r, a.im[k])), em = mean(env), n = env.length;
  const [re, im] = dft(env.map((v) => v - em), new Array(n).fill(0)), half = Math.floor(n / 2) + 1;
  return { f: Array.from({ length: half }, (_, k) => (k * fs) / n), p: Array.from({ length: half }, (_, k) => ((k && k !== n / 2 ? 2 : 1) * Math.hypot(re[k], im[k])) / n) };
}
/** A rolling-element bearing's defect frequencies (Hz): outer race, inner race, cage and ball spin. */
export function bearingFrequencies(fr: number, nb: number, db: number, dp: number, betaDeg = 0) {
  const r = (db / dp) * Math.cos((betaDeg * Math.PI) / 180);
  return { BPFO: (nb / 2) * fr * (1 - r), BPFI: (nb / 2) * fr * (1 + r), FTF: (fr / 2) * (1 - r), BSF: (dp / (2 * db)) * fr * (1 - r * r) };
}

// ——— Change points ———
export type Stat = 'mean' | 'rms' | 'std' | 'linear';
/** The cost of x[i..j) as one segment, from running sums (constant time). */
function costs(x: number[], stat: Stat) {
  const n = x.length, S = [0], Q = [0], T = [0], TT = [0], TX = [0];
  for (let k = 0; k < n; k++) { S.push(S[k] + x[k]); Q.push(Q[k] + x[k] * x[k]); T.push(T[k] + k); TT.push(TT[k] + k * k); TX.push(TX[k] + k * x[k]); }
  return (i: number, j: number) => {
    const m = j - i, s = S[j] - S[i], q = Q[j] - Q[i];
    if (stat === 'mean') return q - (s * s) / m;
    if (stat === 'rms') return m * Math.log(Math.max(q / m, 1e-300));
    if (stat === 'std') return m * Math.log(Math.max((q - (s * s) / m) / m, 1e-300));
    const t = T[j] - T[i], tt = TT[j] - TT[i], tx = TX[j] - TX[i], d = m * tt - t * t;
    if (d <= 0) return q - (s * s) / m;
    const b = (m * tx - t * s) / d, a = (s - b * t) / m;
    return Math.max(0, q - a * s - b * tx);
  };
}
/** Where a signal changes: the k changes that lower the total cost most (exact, by dynamic programming), or, with a
 * penalty, as many as are each worth it. Returns the 0-based index where each new segment starts. */
export function changePoints(x: number[], o: { stat?: Stat; max?: number; penalty?: number; minDistance?: number } = {}): number[] {
  const n = x.length, stat = o.stat ?? 'mean', minD = Math.max(stat === 'linear' ? 3 : 2, o.minDistance ?? (stat === 'mean' ? 1 : 2)), cost = costs(x, stat);
  if (n < 2 * minD) return [];
  if (o.penalty !== undefined) {
    // Optimal partitioning: F(j) = min over i of F(i) + cost(i, j) + penalty.
    const F = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(0);
    F[0] = -o.penalty;
    for (let j = minD; j <= n; j++) for (let i = 0; i <= j - minD; i++) { if (i && i < minD) continue; const v = F[i] + cost(i, j) + o.penalty; if (v < F[j]) { F[j] = v; prev[j] = i; } }
    const out: number[] = [];
    for (let j = n; j > 0; j = prev[j]) if (prev[j] > 0) out.push(prev[j]);
    return out.reverse();
  }
  const K = Math.max(1, Math.min(o.max ?? 1, Math.floor(n / minD) - 1));
  // D[k][j]: the best cost of x[0..j) in k + 1 segments.
  const D = [Array.from({ length: n + 1 }, (_, j) => (j >= minD ? cost(0, j) : Infinity))], back: number[][] = [[]];
  for (let k = 1; k <= K; k++) {
    const row = new Array(n + 1).fill(Infinity), b = new Array(n + 1).fill(0);
    for (let j = (k + 1) * minD; j <= n; j++) for (let i = k * minD; i <= j - minD; i++) { const v = D[k - 1][i] + cost(i, j); if (v < row[j]) { row[j] = v; b[j] = i; } }
    D.push(row); back.push(b);
  }
  const out: number[] = [];
  for (let k = K, j = n; k > 0; k--) { j = back[k][j]; out.push(j); }
  return out.reverse();
}
/** CUSUM: running sums of the drift above and below the target; an alarm when either passes climit standard
 * deviations. */
export function cusum(x: number[], climit = 5, mshift = 1, tmean?: number, tdev?: number) {
  const m = tmean ?? mean(x), sd = tdev ?? Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, x.length - 1)), up: number[] = [], lo: number[] = [];
  let u = 0, l = 0, iu = -1, il = -1;
  x.forEach((v, k) => {
    u = Math.max(0, u + v - m - (mshift * sd) / 2); l = Math.min(0, l + v - m + (mshift * sd) / 2);
    up.push(u); lo.push(l);
    if (iu < 0 && u > climit * sd) iu = k;
    if (il < 0 && l < -climit * sd) il = k;
  });
  return { iupper: iu, ilower: il, upper: up, lower: lo, mean: m, sd };
}

// ——— How good a feature is ———
const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** 1 when every member's feature only rises (or only falls), 0 when it wanders. */
export const monotonicity = (members: number[][]) => mean(members.map((x) => Math.abs(x.slice(1).reduce((s, v, k) => s + sign(v - x[k]), 0)) / Math.max(1, x.length - 1)));
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let ab = 0, aa = 0, bb = 0; a.forEach((v, k) => { ab += (v - ma) * (b[k] - mb); aa += (v - ma) ** 2; bb += (b[k] - mb) ** 2; }); return ab / Math.sqrt(aa * bb || 1); };
/** The weakest likeness between members' paths (each cut to the shortest): 1 when all follow one shape. */
export function trendability(members: number[][]) {
  const n = Math.min(...members.map((m) => m.length)), cut = members.map((m) => m.slice(0, n));
  let worst = 1;
  for (let a = 0; a < cut.length; a++) for (let b = a + 1; b < cut.length; b++) worst = Math.min(worst, Math.abs(corr(cut[a], cut[b])));
  return worst;
}
/** How alike the members' failure values are, against how far each travelled: 1 when all fail at the same level. */
export function prognosability(members: number[][]) {
  const ends = members.map((m) => m[m.length - 1]), me = mean(ends), sd = Math.sqrt(ends.reduce((s, v) => s + (v - me) ** 2, 0) / Math.max(1, ends.length - 1));
  return Math.exp(-sd / mean(members.map((m) => Math.abs(m[0] - m[m.length - 1]))));
}

// ——— Degradation models ———
export interface Degradation { kind: 'exponential' | 'linear'; phi: number; mean: [number, number]; cov: [[number, number], [number, number]]; noise: number; time: number }
const z = (kind: Degradation['kind'], phi: number, y: number) => (kind === 'exponential' ? Math.log(y - phi) : y);
/** Least squares of zs on [1, t]: intercept, slope and the residual variance. */
function line(t: number[], zs: number[]) {
  const n = t.length, mt = mean(t), mz = mean(zs), stt = t.reduce((s, v) => s + (v - mt) ** 2, 0), slope = stt ? t.reduce((s, v, k) => s + (v - mt) * (zs[k] - mz), 0) / stt : 0, a = mz - slope * mt;
  return { a, b: slope, s2: n > 2 ? zs.reduce((s, v, k) => s + (v - a - slope * t[k]) ** 2, 0) / (n - 2) : 0 };
}
/** Learns the prior from a fleet run to failure: each member's own line (on log(y − φ) for the exponential model),
 * their mean and spread, and the noise around them. */
export function fitDegradation(kind: Degradation['kind'], members: { t: number[]; y: number[] }[], phi = 0): Degradation {
  if (members.length < 2) throw new Error('A degradation model learns from at least two machines’ histories.');
  const fits = members.map((m) => {
    if (kind === 'exponential' && m.y.some((v) => v <= phi)) throw new Error(`The exponential model needs every value above Phi (${phi}); set 'Phi' below the smallest value.`);
    return line(m.t, m.y.map((v) => z(kind, phi, v)));
  });
  const ma = mean(fits.map((f) => f.a)), mb = mean(fits.map((f) => f.b)), k = fits.length - 1;
  const caa = fits.reduce((s, f) => s + (f.a - ma) ** 2, 0) / k, cbb = fits.reduce((s, f) => s + (f.b - mb) ** 2, 0) / k, cab = fits.reduce((s, f) => s + (f.a - ma) * (f.b - mb), 0) / k;
  const tiny = 1e-12 * (1 + ma * ma + mb * mb);
  return { kind, phi, mean: [ma, mb], cov: [[caa + tiny, cab], [cab, cbb + tiny]], noise: Math.max(1e-12, mean(fits.map((f) => f.s2))), time: 0 };
}
const inv2 = (m: number[][]) => { const d = m[0][0] * m[1][1] - m[0][1] * m[1][0]; return [[m[1][1] / d, -m[0][1] / d], [-m[1][0] / d, m[0][0] / d]]; };
/** The model after seeing one machine's readings so far (a conjugate Bayesian update of intercept and slope). */
export function updateDegradation(d: Degradation, t: number[], y: number[]): Degradation {
  const zs = y.map((v) => { if (d.kind === 'exponential' && v <= d.phi) throw new Error(`A reading (${v}) is not above Phi (${d.phi}).`); return z(d.kind, d.phi, v); });
  const P = inv2(d.cov), s2 = d.noise;
  const A = [[P[0][0] + t.length / s2, P[0][1] + t.reduce((s, v) => s + v, 0) / s2], [P[1][0] + t.reduce((s, v) => s + v, 0) / s2, P[1][1] + t.reduce((s, v) => s + v * v, 0) / s2]];
  const C = inv2(A), r = [P[0][0] * d.mean[0] + P[0][1] * d.mean[1] + zs.reduce((s, v) => s + v, 0) / s2, P[1][0] * d.mean[0] + P[1][1] * d.mean[1] + zs.reduce((s, v, k) => s + v * t[k], 0) / s2];
  return { ...d, mean: [C[0][0] * r[0] + C[0][1] * r[1], C[1][0] * r[0] + C[1][1] * r[1]], cov: [[C[0][0], C[0][1]], [C[1][0], C[1][1]]], time: Math.max(d.time, ...t) };
}
/** When the level will reach the threshold, from now: the estimate (from the mean), a 90% range and the spread of
 * possible times (from 4,000 draws of intercept and slope). Infinity when the trend never gets there. */
export function remainingLife(d: Degradation, threshold: number, rand: Rand, now = d.time) {
  if (d.kind === 'exponential' && threshold <= d.phi) throw new Error(`The threshold must be above Phi (${d.phi}).`);
  const target = z(d.kind, d.phi, threshold), cross = (a: number, b: number) => (b > 0 ? (target - a) / b - now : Infinity);
  const L = [[Math.sqrt(Math.max(0, d.cov[0][0])), 0], [0, 0]];
  L[1][0] = L[0][0] ? d.cov[1][0] / L[0][0] : 0; L[1][1] = Math.sqrt(Math.max(0, d.cov[1][1] - L[1][0] ** 2));
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const draws: number[] = [];
  for (let k = 0; k < 4000; k++) { const e1 = gauss(), e2 = gauss(); draws.push(Math.max(0, cross(d.mean[0] + L[0][0] * e1, d.mean[1] + L[1][0] * e1 + L[1][1] * e2))); }
  draws.sort((a, b) => a - b);
  const q = (p: number) => draws[Math.min(draws.length - 1, Math.floor(p * draws.length))];
  return { rul: Math.max(0, cross(d.mean[0], d.mean[1])), ci: [q(0.05), q(0.95)] as [number, number], draws };
}
