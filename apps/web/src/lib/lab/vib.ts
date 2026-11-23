import { dft } from './signal';

// Hyperion's vibration analysis (M442, the owner, 23 Nov: "more advanced vibration analysis"): what a test rig and a
// maintenance engineer read from measured vibration. A structure's frequency response from a hammer or shaker test
// (H1 from Welch's averages) and its modes picked from it; the spectral kurtosis and the kurtogram that find the band
// where a bearing's impacts ring; time-synchronous averaging over a shaft's turns; and the order spectrum, the
// spectrum against multiples of the shaft speed, for a machine that speeds up or slows down.

const hann = (n: number) => Array.from({ length: n }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n));

/** Welch's averaged cross-spectra of x and y (Hann or the given window, 50 % overlap): Sxx, Syy and Syx per frequency. */
export function welch(x: number[], y: number[], win: number[] | number, overlap?: number) {
  const w = typeof win === 'number' ? hann(Math.max(2, Math.round(win))) : win, L = w.length;
  if (x.length < L) throw new Error(`The signal (${x.length} samples) is shorter than the window (${L}).`);
  const step = Math.max(1, L - (overlap ?? Math.floor(L / 2))), half = Math.floor(L / 2) + 1;
  const sxx = new Float64Array(half), syy = new Float64Array(half), sr = new Float64Array(half), si = new Float64Array(half);
  let segs = 0;
  for (let s = 0; s + L <= x.length; s += step) {
    const [xr, xi] = dft(w.map((v, k) => v * x[s + k]), new Array(L).fill(0));
    const [yr, yi] = dft(w.map((v, k) => v * y[s + k]), new Array(L).fill(0));
    for (let k = 0; k < half; k++) {
      sxx[k] += xr[k] ** 2 + xi[k] ** 2; syy[k] += yr[k] ** 2 + yi[k] ** 2;
      sr[k] += yr[k] * xr[k] + yi[k] * xi[k]; si[k] += yi[k] * xr[k] - yr[k] * xi[k];
    }
    segs++;
  }
  return { sxx, syy, sr, si, segs, L };
}

/** The H1 frequency response (output over input, complex) and its coherence, at fs·k/L for k = 0…L/2. */
export function frf(x: number[], y: number[], fs: number, win: number[] | number, overlap?: number) {
  const { sxx, syy, sr, si, L } = welch(x, y, win, overlap);
  const re = Float64Array.from(sr, (v, k) => v / (sxx[k] || 1e-300)), im = Float64Array.from(si, (v, k) => v / (sxx[k] || 1e-300));
  const coh = Float64Array.from(sr, (v, k) => (v * v + si[k] * si[k]) / ((sxx[k] * syy[k]) || 1e-300));
  return { re, im, coh, f: Float64Array.from(re, (_, k) => (k * fs) / L) };
}

/**
 * Modes from a frequency response by peak picking: the `count` tallest peaks of |H| (each refined by a parabola
 * through its three points) and each one's damping from its half-power width, ζ = (f₂ − f₁) / 2f₀.
 */
export function peakPick(mag: ArrayLike<number>, f: ArrayLike<number>, count: number) {
  const n = mag.length, peaks: { k: number; v: number }[] = [];
  for (let k = 1; k < n - 1; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) peaks.push({ k, v: mag[k] });
  const df = f[1] - f[0];
  return peaks.sort((a, b) => b.v - a.v).slice(0, count).sort((a, b) => a.k - b.k).map(({ k }) => {
    const a = mag[k - 1], b = mag[k], c = mag[k + 1], d = a - 2 * b + c, off = d ? (0.5 * (a - c)) / d : 0;
    const f0 = f[k] + off * df, top = b - 0.25 * (a - c) * off, hp = top / Math.SQRT2;
    // The half-power points: walk out each side and interpolate where |H| crosses top/√2.
    let i = k; while (i > 0 && mag[i] > hp) i--;
    let j = k; while (j < n - 1 && mag[j] > hp) j++;
    const f1 = mag[i] <= hp && mag[i + 1] !== mag[i] ? f[i] + ((hp - mag[i]) / (mag[i + 1] - mag[i])) * df : f[i];
    const f2 = mag[j] <= hp && mag[j - 1] !== mag[j] ? f[j] - ((hp - mag[j]) / (mag[j - 1] - mag[j])) * df : f[j];
    return { fn: f0, zeta: Math.max(0, f2 - f1) / (2 * f0), peak: top };
  });
}

/** The short-time spectra of x: one row of |X|² per frame (Hann window of nw, hop nw/4), frequencies fs·k/nw. */
function stftPower(x: number[], nw: number) {
  const w = hann(nw), hop = Math.max(1, nw >> 2), half = (nw >> 1) + 1, rows: Float64Array[] = [];
  const m = x.reduce((s, v) => s + v, 0) / x.length;
  for (let s = 0; s + nw <= x.length; s += hop) {
    const [r, i] = dft(w.map((v, k) => v * (x[s + k] - m)), new Array(nw).fill(0));
    rows.push(Float64Array.from({ length: half }, (_, k) => r[k] ** 2 + i[k] ** 2));
  }
  return rows;
}

/** The spectral kurtosis: ⟨|X|⁴⟩ / ⟨|X|²⟩² − 2 per frequency. About 0 for steady noise or tones; large where impacts ring. */
export function spectralKurtosis(x: number[], fs: number, nw: number) {
  if (x.length < nw) throw new Error(`The signal (${x.length} samples) is shorter than the window (${nw}).`);
  const rows = stftPower(x, nw), half = (nw >> 1) + 1, sk = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    let s2 = 0, s4 = 0;
    for (const r of rows) { s2 += r[k]; s4 += r[k] * r[k]; }
    s2 /= rows.length; s4 /= rows.length;
    sk[k] = s2 > 0 ? s4 / (s2 * s2) - 2 : 0;
  }
  // The ends (0 Hz and Nyquist) are real-valued bins: their kurtosis isn't comparable, so they are left at 0.
  sk[0] = 0; sk[half - 1] = 0;
  return { sk, f: Float64Array.from(sk, (_, k) => (k * fs) / nw) };
}

/**
 * The kurtogram by short-time spectra (Antoni 2006): the spectral kurtosis for windows of 2^(lo)…2^(lo+levels−1)
 * samples, each on a common frequency grid; the best window and band are where it is highest. The band's centre
 * and width (fs/window) are what to filter before an envelope spectrum.
 */
export function kurtogram(x: number[], fs: number, levels: number) {
  const lo = 3, grid = 256;
  const f = Float64Array.from({ length: grid }, (_, k) => (k * fs) / 2 / (grid - 1)), wins: number[] = [], rows: Float64Array[] = [];
  let best = { v: -Infinity, fc: 0, nw: 0 };
  for (let l = 0; l < levels; l++) {
    const nw = 2 ** (lo + l);
    if (nw * 4 > x.length) break;
    const { sk, f: fk } = spectralKurtosis(x, fs, nw);
    for (let k = 1; k < sk.length - 1; k++) if (sk[k] > best.v) best = { v: sk[k], fc: fk[k], nw };
    // On the common grid: each grid frequency takes its nearest bin.
    rows.push(Float64Array.from(f, (hz) => sk[Math.min(sk.length - 1, Math.round((hz / fs) * nw))]));
    wins.push(nw);
  }
  if (!rows.length) throw new Error('The signal is too short for a kurtogram (it needs at least 32 samples).');
  return { rows, f, wins, fc: best.fc, nw: best.nw, bw: best.nw ? fs / best.nw : 0, max: best.v };
}

/**
 * Time-synchronous averaging: the signal cut into the shaft's turns at the tachometer's pulse times (seconds), each turn
 * stretched to the same number of samples (linear interpolation), and averaged: what turns with the shaft stays, the
 * rest averages away. `turns` groups that many turns into one average period.
 */
export function tsa(x: number[], fs: number, pulses: number[], turns = 1) {
  const p = pulses.filter((t) => t >= 0 && t <= (x.length - 1) / fs).sort((a, b) => a - b);
  const starts = p.filter((_, i) => i % turns === 0);
  if (starts.length < 2) throw new Error('tsa needs at least two pulses inside the signal (one shaft turn).');
  const periods = starts.slice(1).map((t, i) => t - starts[i]), mean = periods.reduce((s, v) => s + v, 0) / periods.length;
  const n = Math.max(2, Math.round(mean * fs)), ta = new Float64Array(n);
  const at = (t: number) => { const u = t * fs, i = Math.min(x.length - 2, Math.floor(u)), r = u - i; return x[i] * (1 - r) + x[i + 1] * r; };
  for (let r = 0; r < periods.length; r++) for (let k = 0; k < n; k++) ta[k] += at(starts[r] + (k / n) * periods[r]);
  for (let k = 0; k < n; k++) ta[k] /= periods.length;
  return { ta, t: Float64Array.from(ta, (_, k) => k / fs), rpm: (60 * turns) / mean, count: periods.length };
}

/**
 * The order spectrum: the signal resampled at even steps of shaft angle (from the speed in rpm, one per sample), so a
 * vibration tied to the shaft stays at one order however the speed changes; then a Hann-windowed amplitude spectrum
 * (peak amplitude) against order (cycles per turn).
 */
export function orderSpectrum(x: number[], fs: number, rpm: number[], perTurn?: number) {
  if (rpm.length !== x.length) throw new Error('The speed needs one value (rpm) per sample of the signal.');
  if (rpm.some((v) => !(v > 0))) throw new Error('The speed must be above 0 rpm throughout.');
  // Turns so far at each sample (trapezoids).
  const turns = new Float64Array(x.length);
  for (let k = 1; k < x.length; k++) turns[k] = turns[k - 1] + ((rpm[k] + rpm[k - 1]) / 2 / 60) / fs;
  const ppr = perTurn ?? Math.max(8, 2 ** Math.floor(Math.log2(fs / (Math.max(...rpm) / 60))));
  const total = turns[x.length - 1], N = Math.floor(total * ppr);
  if (N < 16) throw new Error('The signal covers too few shaft turns for an order spectrum.');
  const y = new Array<number>(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const th = k / ppr;
    while (j < x.length - 2 && turns[j + 1] < th) j++;
    const r = (th - turns[j]) / (turns[j + 1] - turns[j] || 1);
    y[k] = x[j] * (1 - r) + x[j + 1] * r;
  }
  const m = y.reduce((s, v) => s + v, 0) / N, w = hann(N), sw = w.reduce((s, v) => s + v, 0);
  const [re, im] = dft(y.map((v, k) => (v - m) * w[k]), new Array(N).fill(0)), half = Math.floor(N / 2) + 1;
  const spec = Float64Array.from({ length: half }, (_, k) => ((k && k < N / 2 ? 2 : 1) * Math.hypot(re[k], im[k])) / sw);
  return { spec, order: Float64Array.from(spec, (_, k) => (k * ppr) / N), ppr };
}
