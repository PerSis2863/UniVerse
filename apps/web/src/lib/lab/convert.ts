// Hyperion's converter imperfections (M437, the owner: "detailed converter imperfections"): a real ADC (offset, gain
// error, uneven code edges for INL and DNL, noise, sampling-clock jitter), the dynamic measures read from a spectrum
// (SNR, SINAD, THD, SFDR, ENOB, as IEEE 1241 defines them), INL and DNL measured from a sine's code histogram, and a
// sigma-delta modulator (first or second order) with its sinc decimator. Our own code from the standard methods.

import { dft } from './signal';

export type Rand = () => number;
const gauss = (rand: Rand) => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

export interface Flaws { offset?: number; gain?: number; inl?: number; noise?: number; jitter?: number; fs?: number }
/** An N-bit converter over [lo, hi] with flaws (offset and noise in LSB, gain as a share, `inl` the spread of each code
 * edge in LSB, jitter in seconds at sample rate fs): each sample's code and the value it stands for, and the edges. */
export function realAdc(x: number[], bits: number, lo: number, hi: number, f: Flaws, rand: Rand) {
  const levels = 2 ** bits, lsb = (hi - lo) / levels;
  // The code edges: ideally lo + k·LSB (k = 1 … levels−1), each moved at random by `inl` LSB, kept in order.
  const edges = Array.from({ length: levels - 1 }, (_, k) => lo + (k + 1) * lsb + (f.inl ? f.inl * lsb * gauss(rand) : 0));
  for (let k = 1; k < edges.length; k++) if (edges[k] < edges[k - 1]) edges[k] = edges[k - 1];
  const dt = f.fs ? 1 / f.fs : 0;
  const codes = x.map((v, i) => {
    // Jitter: the sample taken τ late sees v + v'·τ (the slope by central differences).
    let s = v;
    if (f.jitter && dt) { const slope = ((x[Math.min(x.length - 1, i + 1)] - x[Math.max(0, i - 1)]) / ((Math.min(x.length - 1, i + 1) - Math.max(0, i - 1)) * dt)) || 0; s += slope * f.jitter * gauss(rand); }
    s = (s - (lo + hi) / 2) * (1 + (f.gain ?? 0)) + (lo + hi) / 2 + (f.offset ?? 0) * lsb + (f.noise ? f.noise * lsb * gauss(rand) : 0);
    // The code is the number of edges below the sample (binary search).
    let a = 0, b = edges.length;
    while (a < b) { const m = (a + b) >> 1; if (edges[m] <= s) a = m + 1; else b = m; }
    return a;
  });
  return { codes, values: codes.map((c) => lo + (c + 0.5) * lsb), edges, lsb };
}

/** The 4-term Blackman–Harris window (side lobes 92 dB down), so a sine's leakage doesn't pass for noise. */
const bh4 = (n: number, N: number) => 0.35875 - 0.48829 * Math.cos((2 * Math.PI * n) / N) + 0.14128 * Math.cos((4 * Math.PI * n) / N) - 0.01168 * Math.cos((6 * Math.PI * n) / N);
/** The dynamic measures of a sampled sine: its frequency, SNR, SINAD, THD (first `harmonics` harmonics, folded back
 * into the band), SFDR (dB), ENOB, and the one-sided spectrum in dB of the fundamental (dBc). */
export function adcMetrics(y: number[], fs: number, harmonics = 5) {
  const N = y.length, mean = y.reduce((s, v) => s + v, 0) / N;
  const [re, im] = dft(y.map((v, n) => (v - mean) * bh4(n, N)), new Array(N).fill(0));
  const half = Math.floor(N / 2), P = Array.from({ length: half + 1 }, (_, k) => re[k] ** 2 + im[k] ** 2);
  const W = 4, band = (k: number) => { let s = 0; for (let j = Math.max(1, k - W); j <= Math.min(half, k + W); j++) s += P[j]; return s; };
  let f0 = W + 1;
  for (let k = W + 1; k <= half; k++) if (P[k] > P[f0]) f0 = k;
  const used = new Set<number>(), take = (k: number) => { for (let j = Math.max(0, k - W); j <= Math.min(half, k + W); j++) used.add(j); };
  for (let j = 0; j <= W; j++) used.add(j); // DC and the window's spread of it
  const pf = band(f0); take(f0);
  let ph = 0;
  for (let h = 2; h <= harmonics + 1; h++) {
    let k = (h * f0) % N;
    if (k > half) k = N - k;
    if (used.has(k)) continue;
    ph += band(k); take(k);
  }
  let pn = 0, spur = 0;
  for (let k = 0; k <= half; k++) if (!used.has(k)) pn += P[k];
  for (let k = W + 1; k <= half; k++) if (Math.abs(k - f0) > W) spur = Math.max(spur, P[k]);
  // The harmonics' own peaks count as spurs too.
  for (let h = 2; h <= harmonics + 1; h++) { let k = (h * f0) % N; if (k > half) k = N - k; if (Math.abs(k - f0) > W) for (let j = Math.max(1, k - W); j <= Math.min(half, k + W); j++) spur = Math.max(spur, P[j]); }
  const peak = Math.max(...P.slice(Math.max(1, f0 - W), f0 + W + 1)), db = (r: number) => 10 * Math.log10(r);
  const sinad = db(pf / (pn + ph));
  return {
    freq: (f0 * fs) / N, snr: db(pf / pn), sinad, thd: db(ph / pf), sfdr: db(peak / Math.max(spur, 1e-300)), enob: (sinad - 1.76) / 6.02,
    spectrum: P.map((p) => db(Math.max(p, 1e-300) / peak)), freqs: P.map((_, k) => (k * fs) / N),
  };
}

/** INL and DNL (LSB) from a sine's code histogram (the code-density test, IEEE 1241): each code edge from the running
 * count, T_k = −cos(π·(samples below code k)/n), for a sine slightly beyond full scale; then against the straight line
 * through the first and last edges. Each code's INL is at its middle (the mean of its two edges'); the end codes are 0. */
export function inlDnl(codes: number[], bits: number) {
  const L = 2 ** bits, H = new Float64Array(L), n = codes.length;
  for (const c of codes) if (c >= 0 && c < L) H[c]++;
  const T = new Float64Array(L);
  let below = 0;
  for (let k = 1; k < L; k++) { below += H[k - 1]; T[k] = -Math.cos((Math.PI * below) / n); }
  const lsb = (T[L - 1] - T[1]) / (L - 2), edge = (k: number) => (T[k] - (T[1] + (k - 1) * lsb)) / lsb;
  const dnl = new Array(L).fill(0), inl = new Array(L).fill(0);
  for (let k = 1; k < L - 1; k++) { dnl[k] = (T[k + 1] - T[k]) / lsb - 1; inl[k] = (edge(k) + edge(k + 1)) / 2; }
  return { inl, dnl };
}

/** A sigma-delta modulator (first or second order, a 1-bit quantiser at ±1) on x in −1…1 oversampled `osr` times:
 * the bit stream, and the output after a sinc^(order+1) decimator brings it back to the original rate. */
export function sigmaDelta(x: number[], order: 1 | 2, osr: number) {
  const bits: number[] = [];
  let i1 = 0, i2 = 0, y = 0;
  for (const v of x) {
    if (order === 1) { i1 += v - y; y = i1 >= 0 ? 1 : -1; }
    else { i1 += v - y; i2 += i1 - y; y = i2 >= 0 ? 1 : -1; }
    bits.push(y);
  }
  // sinc^K: K moving sums of length osr, then every osr-th sample (scaled back to the input's range).
  let s = bits.slice();
  for (let k = 0; k <= order; k++) {
    const out: number[] = [];
    let acc = 0;
    for (let i = 0; i < s.length; i++) { acc += s[i] - (i >= osr ? s[i - osr] : 0); out.push(acc / osr); }
    s = out;
  }
  const delay = Math.round(((order + 1) * (osr - 1)) / 2);
  const dec: number[] = [];
  for (let i = delay + osr * (order + 1); i < s.length; i += osr) dec.push(s[i]);
  return { bits, decimated: dec };
}
