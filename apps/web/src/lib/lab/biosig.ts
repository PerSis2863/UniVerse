// Hyperion's biosignals (M499, the owner's list, group 7: "medical devices: ECG and biosignals"): a synthetic ECG
// (each beat P, Q, R, S and T waves as Gaussians, the beat-to-beat interval breathing with the lungs), QRS detection by
// Pan and Tompkins' 1985 algorithm (band-pass, derivative, square, moving-window integration, adaptive thresholds with a
// search back), heart rate and its variability (SDNN, RMSSD, pNN50, LF and HF power), EEG band powers by Welch's method,
// and a hearing aid's wide dynamic range compression across bands. For learning, not diagnosis. Pure: randomness comes in
// as a function. The filters are our own biquads (Butterworth by the bilinear transform), run forwards and backwards.
import { dft } from './fft';

export type Rand = () => number;
const gauss = (rand: Rand) => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

// ——— Filters ———
type Biquad = [number, number, number, number, number]; // b0 b1 b2 a1 a2 (a0 = 1)
/** Second-order Butterworth low- or high-pass at fc (Hz), by the bilinear transform with pre-warping. */
export function biquad(kind: 'low' | 'high', fc: number, fs: number): Biquad {
  const k = Math.tan((Math.PI * fc) / fs), q = Math.SQRT1_2, n = 1 / (1 + k / q + k * k);
  if (kind === 'low') { const b0 = k * k * n; return [b0, 2 * b0, b0, 2 * (k * k - 1) * n, (1 - k / q + k * k) * n]; }
  return [n, -2 * n, n, 2 * (k * k - 1) * n, (1 - k / q + k * k) * n];
}
export function runBiquad(x: ArrayLike<number>, [b0, b1, b2, a1, a2]: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
/** Forwards then backwards: no delay, the response squared. */
export function zeroPhase(x: ArrayLike<number>, stages: Biquad[]) {
  let y: Float64Array = Float64Array.from(x);
  for (const s of stages) y = runBiquad(y, s);
  y.reverse();
  for (const s of stages) y = runBiquad(y, s);
  return y.reverse();
}
export const bandpass = (x: ArrayLike<number>, lo: number, hi: number, fs: number) => zeroPhase(x, [biquad('high', lo, fs), biquad('low', hi, fs)]);

// ——— A synthetic ECG ———
const WAVES = [ // [time from R (s), width (s), height (mV)] for P, Q, R, S, T at 60 beats a minute
  [-0.2, 0.025, 0.15], [-0.03, 0.01, -0.12], [0, 0.011, 1.2], [0.03, 0.01, -0.25], [0.3, 0.045, 0.3],
] as const;
/** An ECG at fs Hz for T s: mean heart rate hr, the interval swinging with breathing (RSA, s) and at random (s). */
export function ecgSynth(fs: number, T: number, hr: number, rand: Rand, o: { rsa?: number; jitter?: number; noise?: number; wander?: number; mains?: number; breath?: number } = {}) {
  const n = Math.round(fs * T), x = new Float64Array(n), beats: number[] = [], rr0 = 60 / hr, breath = o.breath ?? 0.25;
  let t = 0.5;
  while (t < T + 1) { beats.push(t); t += rr0 + (o.rsa ?? 0.04) * Math.sin(2 * Math.PI * breath * t) + (o.jitter ?? 0.01) * gauss(rand); }
  // The QT interval shortens with a faster rate (Bazett: QT ∝ √RR).
  for (const b of beats) {
    const s = Math.sqrt(rr0);
    for (const [dt, w, h] of WAVES) {
      const c = b + (dt > 0.1 ? dt * s : dt), w2 = 2 * (w * (dt > 0.1 ? s : 1)) ** 2, from = Math.max(0, Math.floor((c - 5 * w) * fs)), to = Math.min(n - 1, Math.ceil((c + 5 * w) * fs));
      for (let i = from; i <= to; i++) x[i] += h * Math.exp(-((i / fs - c) ** 2) / w2);
    }
  }
  for (let i = 0; i < n; i++) x[i] += (o.noise ?? 0.02) * gauss(rand) + (o.wander ?? 0) * Math.sin(2 * Math.PI * 0.3 * (i / fs)) + (o.mains ?? 0) * Math.sin(2 * Math.PI * 50 * (i / fs));
  return { x, beats: beats.filter((b) => b < T) };
}

// ——— Pan–Tompkins ———
export function panTompkins(x: ArrayLike<number>, fs: number) {
  const f = bandpass(x, 5, 15, fs), n = f.length, d = new Float64Array(n);
  // The five-point derivative, then squared, then integrated over 150 ms.
  for (let i = 2; i < n - 2; i++) d[i] = ((-f[i - 2] - 2 * f[i - 1] + 2 * f[i + 1] + f[i + 2]) * fs) / 8;
  const w = Math.max(1, Math.round(0.15 * fs)), m = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += d[i] * d[i]; if (i >= w) acc -= d[i - w] * d[i - w]; m[i] = acc / w; }
  // Peaks of the integrated signal at least 200 ms apart.
  const peaks: number[] = [], gap = Math.round(0.2 * fs);
  for (let i = 1; i < n - 1; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1]) { if (peaks.length && i - peaks[peaks.length - 1] < gap) { if (m[i] > m[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; } else peaks.push(i); }
  // Thresholds learnt over the first two seconds, then updated with each peak.
  const learn = m.subarray(0, Math.min(n, 2 * fs));
  let spk = 0.25 * Math.max(...learn), npk = 0.5 * (learn.reduce((s, v) => s + v, 0) / learn.length);
  const qrs: number[] = [];
  const th = () => npk + 0.25 * (spk - npk);
  const rrs = () => { const r = qrs.slice(-8).map((q, i, a) => (i ? q - a[i - 1] : 0)).slice(1); return r.length ? r.reduce((s, v) => s + v, 0) / r.length : 0; };
  let skipped: number[] = [];
  for (const p of peaks) {
    if (m[p] > th()) {
      qrs.push(p); spk = 0.125 * m[p] + 0.875 * spk; skipped = [];
    } else {
      npk = 0.125 * m[p] + 0.875 * npk; skipped.push(p);
      // Search back: a long gap since the last beat takes the biggest skipped peak above half the threshold.
      const avg = rrs();
      if (qrs.length > 1 && avg && p - qrs[qrs.length - 1] > 1.66 * avg) {
        const cand = skipped.filter((s) => m[s] > 0.5 * th() && s - qrs[qrs.length - 1] > gap).sort((a, b) => m[b] - m[a])[0];
        if (cand !== undefined) { qrs.push(cand); qrs.sort((a, b) => a - b); spk = 0.25 * m[cand] + 0.75 * spk; skipped = []; }
      }
    }
  }
  // Each beat's R peak: the largest band-passed value in the window that integrated it.
  const r = qrs.map((q) => { const lo = Math.max(0, q - w); let best = lo; for (let i = lo; i <= Math.min(n - 1, q); i++) if (f[i] > f[best]) best = i; return best; });
  return { r: [...new Set(r)].sort((a, b) => a - b), filtered: f, integrated: m };
}

// ——— Heart rate variability ———
/** From RR intervals (s): mean heart rate, SDNN, RMSSD, pNN50 (ms and %), and LF (0.04–0.15 Hz) and HF (0.15–0.4 Hz)
 * power (ms²) from the RR series resampled at 4 Hz. */
export function hrv(rr: number[]) {
  const ms = rr.map((v) => v * 1000), n = ms.length, mean = ms.reduce((s, v) => s + v, 0) / n;
  const sdnn = Math.sqrt(ms.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const d = ms.slice(1).map((v, i) => v - ms[i]), rmssd = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length), pnn50 = (100 * d.filter((v) => Math.abs(v) > 50).length) / d.length;
  // Resample the tachogram at 4 Hz (linear), take out its mean, Welch with 256-point Hann segments.
  const t: number[] = []; let acc = 0; for (const v of rr) { acc += v; t.push(acc); }
  const fs = 4, grid: number[] = [];
  for (let s = t[0]; s <= t[t.length - 1]; s += 1 / fs) { let k = 0; while (k < t.length - 2 && t[k + 1] < s) k++; grid.push(ms[k] + ((ms[k + 1] - ms[k]) * (s - t[k])) / (t[k + 1] - t[k])); }
  const g = grid.reduce((s, v) => s + v, 0) / grid.length, p = welch(grid.map((v) => v - g), fs, Math.min(256, 2 ** Math.floor(Math.log2(grid.length))));
  const band = (lo: number, hi: number) => p.f.reduce((s, f, i) => (f >= lo && f < hi ? s + p.p[i] * (p.f[1] - p.f[0]) : s), 0);
  const lf = band(0.04, 0.15), hf = band(0.15, 0.4);
  return { hr: 60000 / mean, meanRR: mean, sdnn, rmssd, pnn50, lf, hf, ratio: lf / hf };
}

/** Welch's one-sided power spectral density (units² per Hz): Hann segments of `seg` samples, half overlapping. */
export function welch(x: ArrayLike<number>, fs: number, seg = 256) {
  const L = Math.min(seg, x.length), step = Math.max(1, Math.floor(L / 2)), win = Array.from({ length: L }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / L));
  const U = win.reduce((s, v) => s + v * v, 0), half = Math.floor(L / 2) + 1, p = new Float64Array(half);
  let count = 0;
  for (let s = 0; s + L <= x.length; s += step) {
    const [re, im] = dft(win.map((w, k) => w * x[s + k]), new Array(L).fill(0));
    for (let k = 0; k < half; k++) p[k] += (re[k] ** 2 + im[k] ** 2) / (fs * U) * (k === 0 || (L % 2 === 0 && k === L / 2) ? 1 : 2);
    count++;
  }
  return { f: Array.from({ length: half }, (_, k) => (k * fs) / L), p: Array.from(p, (v) => v / Math.max(1, count)) };
}

export const EEG_BANDS: [string, number, number][] = [['Delta', 0.5, 4], ['Theta', 4, 8], ['Alpha', 8, 13], ['Beta', 13, 30], ['Gamma', 30, 45]];
/** Each band's absolute power (units²) and share of the total 0.5–45 Hz, from Welch's spectrum with 2 s segments. */
export function eegBands(x: ArrayLike<number>, fs: number) {
  const p = welch(x, fs, Math.min(x.length, Math.round(2 * fs))), df = p.f[1] - p.f[0];
  const pow = EEG_BANDS.map(([, lo, hi]) => p.f.reduce((s, f, i) => (f >= lo && f < hi ? s + p.p[i] * df : s), 0)), total = pow.reduce((s, v) => s + v, 0);
  return { names: EEG_BANDS.map((b) => b[0]), power: pow, relative: pow.map((v) => v / total), spectrum: p };
}
/** A made-up EEG: pink-ish background plus rhythms [frequency amplitude] (µV). */
export function eegSynth(fs: number, T: number, rhythms: number[][], rand: Rand, background = 5) {
  const n = Math.round(fs * T), x = new Float64Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) { b = 0.97 * b + background * 0.25 * gauss(rand); x[i] = b + rhythms.reduce((s, [f, a]) => s + a * Math.sin(2 * Math.PI * f * (i / fs) + f), 0); }
  return x;
}

// ——— Hearing aid ———
/** Wide dynamic range compression: above the threshold (dB re full scale, as a sine's peak) the level grows 1/ratio as
 * fast; `gain` dB added throughout. */
export function wdrc(x: ArrayLike<number>, fs: number, threshold: number, ratio: number, attack = 0.005, release = 0.05, gain = 0) {
  // The level is a 10 ms running mean square, read as a sine's peak (10 log10(2 × mean square)); the gain it asks for
  // falls at the attack's pace and recovers at the release's.
  const m = Math.exp(-1 / (0.01 * fs)), a = Math.exp(-1 / (attack * fs)), r = Math.exp(-1 / (release * fs)), y = new Float64Array(x.length);
  let ms = 0, g = gain, primed = false;
  for (let i = 0; i < x.length; i++) {
    ms = m * ms + (1 - m) * x[i] * x[i];
    const over = 10 * Math.log10(Math.max(1e-18, 2 * ms)) - threshold, want = gain - (over > 0 ? over * (1 - 1 / ratio) : 0);
    if (!primed) { g = want; primed = true; }
    const c = want < g ? a : r;
    g = c * g + (1 - c) * want;
    y[i] = x[i] * 10 ** (g / 20);
  }
  return y;
}
/** A multi-band hearing aid: the sound split at `edges` (Hz) by zero-phase Butterworth pairs, each band given its own
 * gain (dB) and compression, then summed. */
export function hearingAid(x: ArrayLike<number>, fs: number, edges: number[], gains: number[], threshold: number, ratio: number) {
  const cuts = [...edges].sort((p, q) => p - q), out = new Float64Array(x.length);
  for (let b = 0; b <= cuts.length; b++) {
    const st = [...(b > 0 ? [biquad('high', cuts[b - 1], fs)] : []), ...(b < cuts.length ? [biquad('low', cuts[b], fs)] : [])];
    const band = st.length ? zeroPhase(x, st) : Float64Array.from(x), y = wdrc(band, fs, threshold, ratio, 0.005, 0.05, gains[b] ?? 0);
    for (let i = 0; i < out.length; i++) out[i] += y[i];
  }
  return out;
}
