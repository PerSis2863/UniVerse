// Hyperion's radar (M429, the owner's list: "Radar"): the radar equation (signal-to-noise, the farthest range, the
// power needed), a linear-FM (chirp) pulse and its compression by a matched filter, echoes of moving targets over a
// train of pulses, the range–Doppler map, a cell-averaging CFAR detector and the ambiguity function. Our own code from
// the textbook formulas (stop-and-hop targets; ranges and speeds are along the line of sight).

import { dft } from './signal';

export const C = 299_792_458;
export const K_BOLTZMANN = 1.380649e-23;
export type Rand = () => number;

export interface RadarParams { gain: [number, number]; rcs: number; ts: number; loss: number }
export const DEFAULT_RADAR: RadarParams = { gain: [20, 20], rcs: 1, ts: 290, loss: 0 };
const lin = (db: number) => 10 ** (db / 10);
/** SNR (dB) of one pulse: Pt τ Gt Gr λ² σ / ((4π)³ R⁴ k Ts L). Gains and loss in dB. */
export function radarSnr(lambda: number, R: number, Pt: number, tau: number, p: RadarParams = DEFAULT_RADAR) {
  return 10 * Math.log10((Pt * tau * lin(p.gain[0]) * lin(p.gain[1]) * lambda ** 2 * p.rcs) / ((4 * Math.PI) ** 3 * R ** 4 * K_BOLTZMANN * p.ts * lin(p.loss)));
}
/** The farthest range at which one pulse still gives snrDb. */
export const radarRange = (lambda: number, snrDb: number, Pt: number, tau: number, p: RadarParams = DEFAULT_RADAR) => (10 ** ((radarSnr(lambda, 1, Pt, tau, p) - snrDb) / 10)) ** 0.25;
/** The peak power that gives snrDb at range R. */
export const radarPower = (lambda: number, R: number, snrDb: number, tau: number, p: RadarParams = DEFAULT_RADAR) => 10 ** ((snrDb - radarSnr(lambda, R, 1, tau, p)) / 10);

/** A linear-FM pulse sweeping bandwidth B over T seconds, at baseband (−B/2 … B/2), sampled at fs. */
export function lfm(B: number, T: number, fs: number): [Float64Array, Float64Array] {
  const n = Math.max(1, Math.round(T * fs)), re = new Float64Array(n), im = new Float64Array(n), k = B / T;
  for (let i = 0; i < n; i++) { const t = i / fs - T / 2, ph = Math.PI * k * t * t; re[i] = Math.cos(ph); im[i] = Math.sin(ph); }
  return [re, im];
}

/** Echoes from targets over a train of pulses: a fast-time (range) × slow-time (pulse) complex matrix, column-major.
 * Each target at range R + v·t (v > 0 going away) returns the pulse delayed by 2R/c with the carrier's phase −4πR/λ,
 * plus complex white noise of power 1 / 10^(snr/10) against a unit echo. */
export function echoes(wave: [Float64Array, Float64Array], fs: number, prf: number, pulses: number, fc: number, targets: { range: number; speed: number; amp: number }[], snrDb: number, rand: Rand, clutterDb?: number) {
  const rows = Math.max(wave[0].length, Math.floor(fs / prf)), lambda = C / fc, re = new Float64Array(rows * pulses), im = new Float64Array(rows * pulses);
  if (clutterDb !== undefined) {
    // M439: ground clutter, a still scatterer in every range cell past the pulse (Rayleigh, of clutter-to-noise ratio
    // clutterDb against the noise), with 1 % of its power slowly wandering (wind on trees: ρ = 0.95 pulse to pulse).
    const L = wave[0].length, sd = Math.sqrt(lin(clutterDb - snrDb) / 2), g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
    for (let k = L; k < rows; k++) {
      const cr = sd * g(), ci = sd * g();
      let ur = g(), ui = g();
      for (let m = 0; m < pulses; m++) {
        ur = 0.95 * ur + Math.sqrt(1 - 0.95 * 0.95) * g(); ui = 0.95 * ui + Math.sqrt(1 - 0.95 * 0.95) * g();
        const ar_ = cr * (Math.sqrt(0.99) + 0.1 * ur / Math.SQRT2) - ci * (0.1 * ui / Math.SQRT2), ai = ci * (Math.sqrt(0.99) + 0.1 * ur / Math.SQRT2) + cr * (0.1 * ui / Math.SQRT2);
        for (let i = 0; i < L && k + i < rows; i++) { re[k + i + m * rows] += wave[0][i] * ar_ - wave[1][i] * ai; im[k + i + m * rows] += wave[0][i] * ai + wave[1][i] * ar_; }
      }
    }
  }
  for (let m = 0; m < pulses; m++) for (const t of targets) {
    const R = t.range + t.speed * (m / prf), d = Math.round((2 * R / C) * fs), ph = (-4 * Math.PI * R) / lambda, cr = t.amp * Math.cos(ph), ci = t.amp * Math.sin(ph);
    for (let i = 0; i < wave[0].length; i++) {
      const k = d + i;
      if (k < 0 || k >= rows) continue;
      re[k + m * rows] += wave[0][i] * cr - wave[1][i] * ci; im[k + m * rows] += wave[0][i] * ci + wave[1][i] * cr;
    }
  }
  const sd = Math.sqrt(1 / lin(snrDb) / 2), g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  for (let k = 0; k < re.length; k++) { re[k] += sd * g(); im[k] += sd * g(); }
  return { rows, cols: pulses, re, im };
}

/** Pulse compression of one column by the matched filter (correlation with the pulse), lined up so a target's peak
 * sits at its delay's sample. */
export function compress(re: ArrayLike<number>, im: ArrayLike<number>, wave: [Float64Array, Float64Array]): [Float64Array, Float64Array] {
  const n = re.length, L = wave[0].length, N = nextPow2(n + L - 1);
  const xr = new Array(N).fill(0), xi = new Array(N).fill(0), hr = new Array(N).fill(0), hi = new Array(N).fill(0);
  for (let i = 0; i < n; i++) { xr[i] = re[i]; xi[i] = im[i]; }
  for (let i = 0; i < L; i++) { hr[i] = wave[0][i]; hi[i] = wave[1][i]; }
  const [Xr, Xi] = dft(xr, xi), [Hr, Hi] = dft(hr, hi), pr = new Array(N), pi = new Array(N);
  // X · conj(H): the correlation's spectrum.
  for (let k = 0; k < N; k++) { pr[k] = Xr[k] * Hr[k] + Xi[k] * Hi[k]; pi[k] = Xi[k] * Hr[k] - Xr[k] * Hi[k]; }
  const [yr, yi] = dft(pr, pi, true);
  return [yr.slice(0, n), yi.slice(0, n)];
}
const nextPow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };

/** The range–Doppler map: each pulse compressed, then a Hamming-windowed FFT across the pulses, zero Doppler in the
 * middle. Power in dB (rows: range cells, columns: Doppler bins), with the axes. */
export function rangeDoppler(cube: { rows: number; cols: number; re: Float64Array; im: Float64Array }, wave: [Float64Array, Float64Array], fs: number, prf: number, fc: number, nfft = nextPow2(cube.cols)) {
  const { rows, cols } = cube, cr = new Float64Array(rows * cols), ci = new Float64Array(rows * cols);
  for (let m = 0; m < cols; m++) {
    const [a, b] = compress(cube.re.subarray(m * rows, (m + 1) * rows), cube.im.subarray(m * rows, (m + 1) * rows), wave);
    cr.set(a, m * rows); ci.set(b, m * rows);
  }
  const w = Array.from({ length: cols }, (_, m) => (cols > 1 ? 0.54 - 0.46 * Math.cos((2 * Math.PI * m) / (cols - 1)) : 1)), map = new Float64Array(rows * nfft);
  for (let i = 0; i < rows; i++) {
    const xr = new Array(nfft).fill(0), xi = new Array(nfft).fill(0);
    for (let m = 0; m < cols; m++) { xr[m] = cr[i + m * rows] * w[m]; xi[m] = ci[i + m * rows] * w[m]; }
    const [Xr, Xi] = dft(xr, xi);
    for (let k = 0; k < nfft; k++) { const s = (k + nfft / 2) % nfft; map[i + k * rows] = 10 * Math.log10(Xr[s] ** 2 + Xi[s] ** 2 + 1e-30); }
  }
  const lambda = C / fc, range = Array.from({ length: rows }, (_, i) => (C * i) / (2 * fs));
  // Doppler fd = −2v/λ, so a bin's speed is −fd·λ/2 (going away: positive).
  const doppler = Array.from({ length: nfft }, (_, k) => ((k - nfft / 2) * prf) / nfft), speed = doppler.map((f) => (-f * lambda) / 2);
  return { map, rows, cols: nfft, range, doppler, speed };
}

/** Cell-averaging CFAR along a vector of powers (linear): each cell against the mean of `train` cells on each side
 * beyond `guard` cells, scaled for the false-alarm rate. */
export function cfar(power: ArrayLike<number>, guard: number, train: number, pfa: number) {
  const n = power.length, out = new Uint8Array(n), th = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0, N = 0;
    for (let k = guard + 1; k <= guard + train; k++) { if (i - k >= 0) { s += power[i - k]; N++; } if (i + k < n) { s += power[i + k]; N++; } }
    if (!N) continue;
    const alpha = N * (pfa ** (-1 / N) - 1);
    th[i] = (alpha * s) / N;
    if (power[i] > th[i]) out[i] = 1;
  }
  return { detections: out, threshold: th };
}

/** The ambiguity function |χ(τ, fd)| of a pulse (normalised to 1 at the origin): delays −(N−1)…N−1 samples,
 * Dopplers −fs/2 … fs/2 on an FFT grid. */
export function ambiguity(re: ArrayLike<number>, im: ArrayLike<number>, fs: number) {
  const N = re.length, M = nextPow2(2 * N), D = 2 * N - 1, out = new Float64Array(D * M);
  let e = 0;
  for (let i = 0; i < N; i++) e += re[i] ** 2 + im[i] ** 2;
  for (let d = 0; d < D; d++) {
    const tau = d - (N - 1), pr = new Array(M).fill(0), pi = new Array(M).fill(0);
    for (let t = 0; t < N; t++) { const u = t - tau; if (u < 0 || u >= N) continue; pr[t] = re[t] * re[u] + im[t] * im[u]; pi[t] = im[t] * re[u] - re[t] * im[u]; }
    const [Xr, Xi] = dft(pr, pi, true);
    for (let k = 0; k < M; k++) { const s = (k + M / 2) % M; out[d + k * D] = (Math.hypot(Xr[s], Xi[s]) * M) / e; }
  }
  return { mag: out, delays: Array.from({ length: D }, (_, d) => (d - (N - 1)) / fs), dopplers: Array.from({ length: M }, (_, k) => ((k - M / 2) * fs) / M) };
}

/** A real swept cosine: linear, quadratic or logarithmic from f0 at t = 0 to f1 at t1; phase in degrees. */
export function chirp(t: number, f0: number, t1: number, f1: number, method: 'linear' | 'quadratic' | 'logarithmic' = 'linear', phiDeg = 0) {
  const phi = (phiDeg * Math.PI) / 180;
  if (method === 'quadratic') return Math.cos(2 * Math.PI * (f0 * t + ((f1 - f0) / (t1 * t1)) * (t ** 3) / 3) + phi);
  if (method === 'logarithmic') { const r = f1 / f0; return Math.cos(2 * Math.PI * ((f0 * t1) / Math.log(r)) * (r ** (t / t1) - 1) + phi); }
  return Math.cos(2 * Math.PI * (f0 * t + ((f1 - f0) / t1) * (t * t) / 2) + phi);
}
