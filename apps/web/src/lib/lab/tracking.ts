// Hyperion's radar, second wave (M439, the owner: "following targets over time, ground clutter, the radar used in cars
// (FMCW), merging detections"): CFAR hits grouped so one target is one detection, a moving-target-indication filter
// that cancels still clutter, an FMCW radar's beat signal and its range–Doppler map, a constant-velocity Kalman filter,
// and a multi-target tracker (gating, nearest-neighbour assignment, tracks started, confirmed and dropped). Our own code
// from the textbook methods.

import { C, type Rand } from './radar';
import { dft } from './signal';
import { label } from './image';

/** One detection per group of neighbouring hits, at the group's strongest cell: a vector's runs, or a matrix's
 * 8-connected patches (0-based [row, col]). */
export function groupDetections(det: ArrayLike<number>, power: ArrayLike<number>, rows: number, cols: number): [number, number][] {
  const { L, n } = label(det, rows, cols, 8), best = new Array(n + 1).fill(-1);
  for (let k = 0; k < L.length; k++) { const l = L[k]; if (l && (best[l] < 0 || power[k] > power[best[l]])) best[l] = k; }
  return best.slice(1).map((k) => [k % rows, Math.floor(k / rows)]);
}
/** Moving-target indication: the pulse-to-pulse difference down the slow-time columns (2: x_m − x_{m−1}; 3:
 * x_m − 2x_{m−1} + x_{m−2}), which cancels anything that doesn't move. Fewer columns come out. */
export function mti(re: Float64Array, im: Float64Array, rows: number, cols: number, order: 2 | 3 = 2) {
  const w = order === 2 ? [1, -1] : [1, -2, 1], out = cols - w.length + 1, or = new Float64Array(rows * out), oi = new Float64Array(rows * out);
  for (let m = 0; m < out; m++) for (let i = 0; i < rows; i++) for (let q = 0; q < w.length; q++) { const k = i + (m + w.length - 1 - q) * rows; or[i + m * rows] += w[q] * re[k]; oi[i + m * rows] += w[q] * im[k]; }
  return { re: or, im: oi, cols: out };
}

/** An FMCW radar's complex beat signal: each chirp sweeps B over T seconds, sampled at fs; a target at range R moving
 * at v (+ away) beats at 2BR/(cT) + 2v/λ and turns its phase by 4πvT/λ from chirp to chirp. Samples × chirps. */
export function fmcwBeat(B: number, T: number, fs: number, fc: number, chirps: number, targets: { range: number; speed: number; amp: number }[], snrDb: number, rand: Rand) {
  const N = Math.max(2, Math.round(T * fs)), lambda = C / fc, re = new Float64Array(N * chirps), im = new Float64Array(N * chirps), sd = Math.sqrt(10 ** (-snrDb / 10) / 2);
  const g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  for (let m = 0; m < chirps; m++) for (let n = 0; n < N; n++) {
    const t = n / fs;
    let r = 0, i = 0;
    for (const tg of targets) {
      const R = tg.range + tg.speed * (m * T + t), ph = 2 * Math.PI * ((2 * B * R) / (C * T)) * t + (4 * Math.PI * R) / lambda;
      r += tg.amp * Math.cos(ph); i += tg.amp * Math.sin(ph);
    }
    re[n + m * N] = r + sd * g(); im[n + m * N] = i + sd * g();
  }
  return { re, im, rows: N, cols: chirps };
}
/** The FMCW range–Doppler map: Hann-windowed FFTs down each chirp (range) and across chirps (Doppler), in dB, with its
 * range (m) and speed (m/s, + away) axes. Only the positive beat frequencies (ranges ahead) are kept. */
export function fmcwMap(re: Float64Array, im: Float64Array, rows: number, cols: number, B: number, T: number, fs: number, fc: number) {
  const hann = (k: number, n: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n), Nr = rows, Nd = cols, half = Math.floor(Nr / 2);
  const Rr = new Float64Array(half * Nd), Ri = new Float64Array(half * Nd);
  for (let m = 0; m < Nd; m++) {
    const [a, b] = dft(Array.from({ length: Nr }, (_, n) => re[n + m * Nr] * hann(n, Nr)), Array.from({ length: Nr }, (_, n) => im[n + m * Nr] * hann(n, Nr)));
    for (let k = 0; k < half; k++) { Rr[k + m * half] = a[k]; Ri[k + m * half] = b[k]; }
  }
  const map = new Float64Array(half * Nd);
  for (let k = 0; k < half; k++) {
    const [a, b] = dft(Array.from({ length: Nd }, (_, m) => Rr[k + m * half] * hann(m, Nd)), Array.from({ length: Nd }, (_, m) => Ri[k + m * half] * hann(m, Nd)));
    for (let q = 0; q < Nd; q++) { const s = (q + Math.floor(Nd / 2)) % Nd; map[k + q * half] = 10 * Math.log10(a[s] ** 2 + b[s] ** 2 + 1e-30); }
  }
  const lambda = C / fc;
  return {
    map, rows: half, cols: Nd,
    range: Array.from({ length: half }, (_, k) => ((k * fs) / Nr) * ((C * T) / (2 * B))),
    // A chirp-to-chirp phase step Δφ = 4πvT/λ sits at Doppler bin Δφ/2π of the chirp rate.
    speed: Array.from({ length: Nd }, (_, q) => (((q - Math.floor(Nd / 2)) / Nd) * lambda) / (2 * T)),
  };
}

// ——— Tracking ———
type V4 = [number, number, number, number];
type M4 = number[][];
const mul = (A: M4, B: M4) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const tr = (A: M4) => A[0].map((_, j) => A.map((r) => r[j]));
/** The constant-velocity model for state [x, vx, y, vy]: F and Q (white acceleration of spectral density q). */
function model(dt: number, q: number) {
  const F = [[1, dt, 0, 0], [0, 1, 0, 0], [0, 0, 1, dt], [0, 0, 0, 1]], a = (q * dt ** 3) / 3, b = (q * dt * dt) / 2, c = q * dt;
  return { F, Q: [[a, b, 0, 0], [b, c, 0, 0], [0, 0, a, b], [0, 0, b, c]] };
}
export interface Track { id: number; x: V4; P: M4; hits: number; misses: number; confirmed: boolean }
function predict(t: Track, F: M4, Q: M4) {
  t.x = F.map((r) => r.reduce((s, v, k) => s + v * t.x[k], 0)) as V4;
  t.P = mul(mul(F, t.P), tr(F)).map((r, i) => r.map((v, j) => v + Q[i][j]));
}
/** The innovation, its covariance's inverse and the squared Mahalanobis distance of a measurement [x, y]. */
function innovation(t: Track, z: [number, number], r: number) {
  const nu = [z[0] - t.x[0], z[1] - t.x[2]], S = [[t.P[0][0] + r * r, t.P[0][2]], [t.P[2][0], t.P[2][2] + r * r]], det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
  const Si = [[S[1][1] / det, -S[0][1] / det], [-S[1][0] / det, S[0][0] / det]];
  return { nu, Si, d2: nu[0] * (Si[0][0] * nu[0] + Si[0][1] * nu[1]) + nu[1] * (Si[1][0] * nu[0] + Si[1][1] * nu[1]) };
}
function update(t: Track, z: [number, number], r: number) {
  const { nu, Si } = innovation(t, z, r);
  // K = P Hᵀ S⁻¹ with H picking x and y (state rows 0 and 2).
  const PHt = t.P.map((row) => [row[0], row[2]]), K = PHt.map((row) => [row[0] * Si[0][0] + row[1] * Si[1][0], row[0] * Si[0][1] + row[1] * Si[1][1]]);
  t.x = t.x.map((v, i) => v + K[i][0] * nu[0] + K[i][1] * nu[1]) as V4;
  // Joseph-free form P = (I − KH)P, kept symmetric.
  const P = t.P.map((row, i) => row.map((v, j) => v - (K[i][0] * t.P[0][j] + K[i][1] * t.P[2][j])));
  t.P = P.map((row, i) => row.map((v, j) => (v + P[j][i]) / 2));
}
const start = (id: number, z: [number, number], r: number, vmax: number): Track => ({ id, x: [z[0], 0, z[1], 0], P: [[r * r, 0, 0, 0], [0, vmax * vmax, 0, 0], [0, 0, r * r, 0], [0, 0, 0, vmax * vmax]], hits: 1, misses: 0, confirmed: false });
/** One target's measurements [x, y] each dt (a row of NaN: missed): the filtered [x, y, vx, vy] each scan. */
export function kalmanTrack(Z: [number, number][], dt: number, q: number, r: number, vmax = 100) {
  const { F, Q } = model(dt, q);
  let t: Track | null = null;
  return Z.map((z) => {
    const seen = Number.isFinite(z[0]) && Number.isFinite(z[1]);
    if (!t) { if (seen) t = start(1, z, r, vmax); return t ? [t.x[0], t.x[2], t.x[1], t.x[3]] : [NaN, NaN, NaN, NaN]; }
    predict(t, F, Q);
    if (seen) update(t, z, r);
    return [t.x[0], t.x[2], t.x[1], t.x[3]];
  });
}
/** Many targets: each scan's detections [x, y] (some of them false). Tracks predicted, gated (χ² with 2 degrees of
 * freedom, 99 %: 9.21), paired with detections nearest first, updated; leftover detections start tentative tracks;
 * a track is confirmed after `confirm` hits and dropped after `drop` misses in a row (a tentative one after 2). */
export function multiTrack(scans: [number, number][][], dt: number, o: { q?: number; r?: number; gate?: number; confirm?: number; drop?: number; vmax?: number } = {}) {
  const q = o.q ?? 1, r = o.r ?? 1, gate = o.gate ?? 9.21, confirm = o.confirm ?? 3, drop = o.drop ?? 4, vmax = o.vmax ?? 50, { F, Q } = model(dt, q);
  let tracks: Track[] = [], next = 1;
  const out: { scan: number; id: number; x: number; y: number; vx: number; vy: number }[] = [];
  scans.forEach((dets, s) => {
    tracks.forEach((t) => predict(t, F, Q));
    const pairs: { t: number; d: number; d2: number }[] = [];
    tracks.forEach((t, i) => dets.forEach((z, j) => { const { d2 } = innovation(t, z, r); if (d2 < gate) pairs.push({ t: i, d: j, d2 }); }));
    // Confirmed tracks choose first, then the nearest pairs.
    pairs.sort((a, b) => Number(tracks[b.t].confirmed) - Number(tracks[a.t].confirmed) || a.d2 - b.d2);
    const usedT = new Set<number>(), usedD = new Set<number>();
    for (const p of pairs) if (!usedT.has(p.t) && !usedD.has(p.d)) { usedT.add(p.t); usedD.add(p.d); update(tracks[p.t], dets[p.d], r); tracks[p.t].hits++; tracks[p.t].misses = 0; if (tracks[p.t].hits >= confirm) tracks[p.t].confirmed = true; }
    tracks.forEach((t, i) => { if (!usedT.has(i)) t.misses++; });
    tracks = tracks.filter((t) => t.misses < (t.confirmed ? drop : 2));
    dets.forEach((z, j) => { if (!usedD.has(j)) tracks.push(start(next++, z, r, vmax)); });
    for (const t of tracks) if (t.confirmed) out.push({ scan: s + 1, id: t.id, x: t.x[0], y: t.x[2], vx: t.x[1], vy: t.x[3] });
  });
  return out;
}
