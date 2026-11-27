// Hyperion's signal and power integrity (M576, "High-speed digital interconnect developers"): the links between AI
// accelerators and the power that feeds them. Signal integrity: a lossy board trace's S-parameters (skin effect and
// dielectric loss, a via stub's notch) or a Touchstone file's, the channel's pulse response, the eye at a symbol rate
// (NRZ or PAM4 on PRBS patterns) with crosstalk from neighbours, random and deterministic jitter and noise, the
// equalisers a SerDes uses (transmit FFE, CTLE, DFE; zero-forcing and automatic choices), the eye's height and width,
// the bit error rate and its bathtub, and a compliance mask. Power integrity: the power distribution network's
// impedance from the regulator through bulk and ceramic capacitors (their mounting inductance set by the vias) to the
// planes and the die, against the target impedance, with the voltage droop when the load steps; and the DC voltage
// drop and current density across a copper plane solved on a grid (a resistor mesh, conjugate gradients), the areas
// over the limits flagged. Our own code from the textbook relations (Bogatin, Hall and Heck, Pozar). Pure.

import { dft } from './fft';

export type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const sc = (a: C, k: number): C => [a[0] * k, a[1] * k];
const cosh = (z: C): C => [Math.cosh(z[0]) * Math.cos(z[1]), Math.sinh(z[0]) * Math.sin(z[1])];
const sinh = (z: C): C => [Math.sinh(z[0]) * Math.cos(z[1]), Math.cosh(z[0]) * Math.sin(z[1])];
export const cabs = (z: C) => Math.hypot(z[0], z[1]);

const C0 = 299792458, MU0 = 4e-7 * Math.PI, RHO_CU = 1.72e-8;
export interface Line { length: number; z0: number; dk: number; df: number; width: number; zref: number; stub?: { length: number; at: number; z0: number } }
/** The propagation constant (1/m) of a trace at f, causal so its pulse response has no false pre-cursors: the skin
 * effect's resistance R = √(πfμ0ρ)/w (smooth copper) with its equal internal reactance, α_c(1 + j) with α_c = R/(2Z0);
 * the dielectric as a constant loss tangent consistent with Kramers–Kronig, ε(f) = Dk·(jf/1 GHz)^(−2Df/π) (Dk and Df
 * quoted at 1 GHz), γ_d = j(2πf/c)√ε: its loss is ≈ πf√Dk·Df/c and its permittivity falls slowly with frequency. */
export function gamma(f: number, l: Pick<Line, 'z0' | 'dk' | 'df' | 'width'>): C {
  const R = Math.sqrt(Math.PI * f * MU0 * RHO_CU) / l.width, ac = R / (2 * l.z0);
  const k0 = (2 * Math.PI * f) / C0, mag = k0 * Math.sqrt(l.dk) * (f / 1e9) ** (-l.df / Math.PI);
  return [ac + mag * Math.sin(l.df / 2), ac + mag * Math.cos(l.df / 2)];
}
type Abcd = [C, C, C, C];
const lineAbcd = (g: C, len: number, z0: number): Abcd => { const gl = sc(g, len), ch = cosh(gl), sh = sinh(gl); return [ch, sc(sh, z0), sc(sh, 1 / z0), ch]; };
const cascade = (x: Abcd, y: Abcd): Abcd => [add(mul(x[0], y[0]), mul(x[1], y[2])), add(mul(x[0], y[1]), mul(x[1], y[3])), add(mul(x[2], y[0]), mul(x[3], y[2])), add(mul(x[2], y[1]), mul(x[3], y[3]))];
/** S11 and S21 of a trace between two ports of impedance zref, with an optional via stub (an open line in shunt at
 * share `at` of the length: its quarter-wave resonance notches S21). */
export function lineS(f: number[], l: Line) {
  const s11: C[] = [], s21: C[] = [];
  for (const fi of f) {
    const g = gamma(Math.max(fi, 1), l);
    let m: Abcd;
    if (l.stub) {
      const gs = gamma(Math.max(fi, 1), { ...l, z0: l.stub.z0 }), y = div(sinh(sc(gs, l.stub.length)), sc(cosh(sc(gs, l.stub.length)), l.stub.z0));
      m = cascade(cascade(lineAbcd(g, l.length * l.stub.at, l.z0), [[1, 0], [0, 0], y, [1, 0]]), lineAbcd(g, l.length * (1 - l.stub.at), l.z0));
    } else m = lineAbcd(g, l.length, l.z0);
    const den = add(add(m[0], sc(m[1], 1 / l.zref)), add(sc(m[2], l.zref), m[3]));
    s21.push(div([2, 0], den));
    s11.push(div(add(add(m[0], sc(m[1], 1 / l.zref)), add(sc(m[2], -l.zref), sc(m[3], -1))), den));
  }
  return { s11, s21 };
}

/** A Touchstone file (.s1p–.s4p, v1): frequencies (Hz), the ports, the reference impedance and each frequency's n×n
 * S matrix (row by row), from MA, DB or RI pairs. The port count is the file's, or what the numbers per frequency say. */
export function touchstone(text: string, ports?: number) {
  let unit = 1e9, fmt = 'MA', zref = 50;
  const nums: number[] = [], counts: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/!.*/, '').trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const t = line.slice(1).trim().toUpperCase().split(/\s+/);
      for (let i = 0; i < t.length; i++) {
        if (['HZ', 'KHZ', 'MHZ', 'GHZ'].includes(t[i])) unit = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 }[t[i] as 'HZ'];
        else if (['MA', 'DB', 'RI'].includes(t[i])) fmt = t[i];
        else if (t[i] === 'R' && t[i + 1]) zref = Number(t[++i]);
        else if (t[i] !== 'S') throw new Error(`Touchstone: only S-parameters are read (the option line says ${t[i]}).`);
      }
      continue;
    }
    if (line.startsWith('[')) throw new Error('Touchstone: version 2 keywords are not read; save the file as version 1.');
    counts.push(line.split(/\s+/).length);
    for (const x of line.split(/\s+/)) { const v = Number(x); if (!Number.isFinite(v)) throw new Error(`Touchstone: "${x}" is not a number.`); nums.push(v); }
  }
  // the port count from the lines' shape: 3 numbers a line is a 1-port, 9 a 2-port (a 4-port's 9 are followed by 8s),
  // 7 then 6s a 3-port
  const [c1, c2] = counts;
  let n = ports ?? (c1 === 3 ? 1 : c1 === 9 ? (c2 === 8 ? 4 : 2) : c1 === 7 ? 3 : 0);
  if (!n) for (const k of [8, 6, 4, 3, 2, 1]) if (nums.length > 0 && nums.length % (1 + 2 * k * k) === 0) { n = k; break; }
  const per = 1 + 2 * n * n;
  if (!n || nums.length % per) throw new Error('Touchstone: the numbers do not divide into frequencies of an n-port.');
  const f: number[] = [], s: C[][][] = [];
  for (let k = 0; k < nums.length; k += per) {
    f.push(nums[k] * unit);
    const m: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0] as C));
    for (let q = 0; q < n * n; q++) {
      const a = nums[k + 1 + 2 * q], b = nums[k + 2 + 2 * q];
      // 2-ports store S11 S21 S12 S22 (column order); larger ones row by row
      const [r, c] = n === 2 ? [q % 2, Math.floor(q / 2)] : [Math.floor(q / n), q % n];
      const mag = fmt === 'DB' ? 10 ** (a / 20) : a, ang = (b * Math.PI) / 180;
      m[r][c] = fmt === 'RI' ? [a, b] : [mag * Math.cos(ang), mag * Math.sin(ang)];
    }
    s.push(m);
  }
  return { f, n, zref, s };
}
/** The differential through response of a 4-port with ports 1, 2 the input pair and 3, 4 the output pair. */
/** A 4-port's mixed-mode differential parameter from port pair Q to port pair P (ports 1, 2 in: [0, 1]; 3, 4 out). */
export const sddPair = (m: C[][], P: number[], Q: number[]): C => sc(add(add(m[P[0]][Q[0]], sc(m[P[0]][Q[1]], -1)), add(sc(m[P[1]][Q[0]], -1), m[P[1]][Q[1]])), 0.5);
export const sdd21 = (m: C[][]): C => sddPair(m, [2, 3], [0, 1]);
/** Write S-parameters as Touchstone v1 text (RI, Hz). */
export function writeTouchstone(f: number[], s: C[][][], zref = 50) {
  const n = s[0]?.length ?? 0, out = [`! Written by Hyperion`, `# HZ S RI R ${zref}`];
  f.forEach((fi, k) => {
    const v: number[] = [];
    for (let q = 0; q < n * n; q++) { const [r, c] = n === 2 ? [q % 2, Math.floor(q / 2)] : [Math.floor(q / n), q % n]; v.push(s[k][r][c][0], s[k][r][c][1]); }
    out.push([fi, ...v].map((x) => x.toPrecision(10)).join(' '));
  });
  return out.join('\n') + '\n';
}

/** A CTLE's response: DC gain (dB), a zero and two poles (Hz). */
export const ctle = (f: number, dc: number, fz: number, fp1: number, fp2: number): C =>
  sc(div([1, f / fz], mul([1, f / fp1], [1, f / fp2])), 10 ** (dc / 20));

/** The channel's response at the FFT's bins up to fs/2, from samples at f: magnitude interpolated linearly and the
 * unwrapped phase too (to 0 at DC); past the last frequency the magnitude falls to 0 over an octave. */
function resample(f: number[], H: C[], bins: number[]): C[] {
  const mag = H.map(cabs), ph: number[] = [];
  let prev = 0, off = 0;
  H.forEach((h, i) => { const p = Math.atan2(h[1], h[0]); if (i) { while (p + off - prev > Math.PI) off -= 2 * Math.PI; while (p + off - prev < -Math.PI) off += 2 * Math.PI; } prev = p + off; ph.push(prev); });
  const f0 = f[0], ph0 = ph[0], fl = f[f.length - 1];
  return bins.map((b) => {
    if (b <= f0) { const p = f0 > 0 ? (ph0 * b) / f0 : 0; return [mag[0] * Math.cos(p), mag[0] * Math.sin(p)]; }
    if (b >= fl) { const fall = Math.max(0, 1 - Math.log2(b / fl)), p = ph[ph.length - 1] + ((ph[ph.length - 1] - ph[ph.length - 2]) / (fl - f[f.length - 2])) * (b - fl); return [mag[mag.length - 1] * fall * Math.cos(p), mag[mag.length - 1] * fall * Math.sin(p)]; }
    let lo = 0, hi = f.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m] <= b) lo = m; else hi = m; }
    const w = (b - f[lo]) / (f[hi] - f[lo]), m = mag[lo] + w * (mag[hi] - mag[lo]), p = ph[lo] + w * (ph[hi] - ph[lo]);
    return [m * Math.cos(p), m * Math.sin(p)];
  });
}
/** The channel's response to one symbol (a 1 V, one-UI rectangle; `rise` s of transmitter edge as a Gaussian filter):
 * `spu` samples a UI over `span` UI, the main cursor at its peak. An extra response (a CTLE) multiplies the channel. */
export function pulseResponse(f: number[], H: C[], rate: number, spu: number, span = 512, rise = 0, extra?: (f: number) => C) {
  const N = 2 ** Math.ceil(Math.log2(spu * span)), fs = rate * spu, bins = Array.from({ length: N / 2 + 1 }, (_, k) => (k * fs) / N);
  const Hc = resample(f, H, bins), x = Array.from({ length: N }, (_, n) => (n < spu ? 1 : 0)), [Xr, Xi] = dft(x, new Array(N).fill(0));
  const sig = rise > 0 ? rise / 2.563 : 0, re = new Array(N).fill(0), im = new Array(N).fill(0);
  for (let k = 0; k <= N / 2; k++) {
    let h = Hc[k];
    if (extra) h = mul(h, extra(bins[k]));
    const g = sig ? Math.exp(-2 * (Math.PI * bins[k] * sig) ** 2) : 1, y = sc(mul([Xr[k], Xi[k]], h), g);
    re[k] = y[0]; im[k] = y[1];
    if (k > 0 && k < N / 2) { re[N - k] = y[0]; im[N - k] = -y[1]; }
  }
  im[N / 2] = 0;
  const [p] = dft(re, im, true), pr = Array.from(p);
  let cur = 0; for (let n = 1; n < N; n++) if (pr[n] > pr[cur]) cur = n;
  return { p: pr, cursor: cur, dt: 1 / fs, N };
}

/** A response in time on impulseResponse's grid, per sample (dimensionless, whole: the analog channel's scattering
 * responses, M585). */
export function sampled(f: number[], H: C[], rate: number, spu: number, span = 512) {
  const N = 2 ** Math.ceil(Math.log2(spu * span)), fs = rate * spu, bins = Array.from({ length: N / 2 + 1 }, (_, k) => (k * fs) / N);
  const Hc = resample(f, H, bins), re = new Array(N).fill(0), im = new Array(N).fill(0);
  for (let k = 0; k <= N / 2; k++) { re[k] = Hc[k][0]; im[k] = Hc[k][1]; if (k > 0 && k < N / 2) { re[N - k] = Hc[k][0]; im[N - k] = -Hc[k][1]; } }
  im[N / 2] = 0;
  return Array.from(dft(re, im, true)[0]);
}
/** The channel's impulse response h(t) (V/s, as IBIS-AMI's AMI_Init takes it) sampled every UI/spu: the IFFT of the
 * channel (times a CTLE if given), divided by the sample interval, cut where it has died away (at least 32 UI). */
export function impulseResponse(f: number[], H: C[], rate: number, spu: number, span = 512, extra?: (f: number) => C) {
  const N = 2 ** Math.ceil(Math.log2(spu * span)), fs = rate * spu, dt = 1 / fs, bins = Array.from({ length: N / 2 + 1 }, (_, k) => (k * fs) / N);
  const Hc = resample(f, H, bins), re = new Array(N).fill(0), im = new Array(N).fill(0);
  for (let k = 0; k <= N / 2; k++) { const h = extra ? mul(Hc[k], extra(bins[k])) : Hc[k]; re[k] = h[0]; im[k] = h[1]; if (k > 0 && k < N / 2) { re[N - k] = h[0]; im[N - k] = -h[1]; } }
  im[N / 2] = 0;
  const [h] = dft(re, im, true), peak = Math.max(...Array.from(h, Math.abs));
  let last = N - 1; while (last > 32 * spu && Math.abs(h[last]) < 1e-5 * peak) last--;
  return { h: Array.from(h.subarray(0, Math.min(N, last + 8 * spu)), (v) => v / dt), dt };
}
/** The response to a one-UI rectangle from an impulse response (V/s): the running sum of spu samples times dt, and
 * its peak (the main cursor). */
export function pulseFromImpulse(h: ArrayLike<number>, dt: number, spu: number) {
  const p: number[] = new Array(h.length).fill(0);
  let acc = 0;
  for (let n = 0; n < h.length; n++) { acc += h[n] * dt; if (n >= spu) acc -= h[n - spu] * dt; p[n] = acc; }
  let cursor = 0; for (let n = 1; n < p.length; n++) if (p[n] > p[cursor]) cursor = n;
  return { p, cursor };
}
/** Linear convolution by FFT (zero-padded to a power of two), the first `len` samples. */
export function fftConvolve(a: ArrayLike<number>, b: ArrayLike<number>, len = a.length) {
  let N = 1; while (N < a.length + b.length) N <<= 1;
  const ar = new Array(N).fill(0), br = new Array(N).fill(0);
  for (let i = 0; i < a.length; i++) ar[i] = a[i];
  for (let i = 0; i < b.length; i++) br[i] = b[i];
  const [Ar, Ai] = dft(ar, new Array(N).fill(0)), [Br, Bi] = dft(br, new Array(N).fill(0)), re = new Array(N), im = new Array(N);
  for (let k = 0; k < N; k++) { re[k] = Ar[k] * Br[k] - Ai[k] * Bi[k]; im[k] = Ar[k] * Bi[k] + Ai[k] * Br[k]; }
  return Array.from(dft(re, im, true)[0].subarray(0, len));
}
/** Where a received waveform's symbols sit: the delay (samples, under maxDelay) whose samples correlate best with the
 * symbols, and the main cursor's level there (least squares). */
export function alignWave(z: ArrayLike<number>, a: number[], spu: number, maxDelay: number) {
  let best = 0, bestC = -Infinity;
  const n = Math.floor(z.length / spu);
  for (let d = 0; d < maxDelay; d++) {
    let c = 0; for (let k = 0; k * spu + d < z.length && k < n; k++) c += z[k * spu + d] * a[k];
    if (c > bestC) { bestC = c; best = d; }
  }
  let num = 0, den = 0; for (let k = 0; k * spu + best < z.length && k < n; k++) { num += z[k * spu + best] * a[k]; den += a[k] * a[k]; }
  return { delay: best, main: den ? num / den : 0 };
}

/** PRBS bits from the standard polynomials (7, 9, 11, 15, 23, 31), all-ones seed. */
export function prbs(order: number, count: number, seed = 0) {
  const taps: Record<number, number> = { 7: 6, 9: 5, 11: 9, 15: 14, 23: 18, 31: 28 };
  if (!taps[order]) throw new Error('PRBS orders are 7, 9, 11, 15, 23 and 31.');
  const mask = 2 ** order - 1;
  let s = mask ^ (seed % mask);
  return Array.from({ length: count }, () => { const b = ((s >>> (order - 1)) ^ (s >>> (taps[order] - 1))) & 1; s = ((s * 2) | b) & mask; return b; });
}
/** Symbols from bits: NRZ ±1, or PAM4 Gray-coded to −1, −⅓, ⅓, 1. */
export const symbols = (bits: number[], pam4: boolean) => pam4 ? Array.from({ length: bits.length >> 1 }, (_, k) => [-1, -1 / 3, 1, 1 / 3][bits[2 * k] * 2 + bits[2 * k + 1]]) : bits.map((b) => (b ? 1 : -1));
/** Zero-forcing FFE taps (pre cursors, then the main, then post): least squares making the pulse's samples at the UIs
 * a single main cursor, scaled so the taps' magnitudes add up to 1 (a transmitter's swing limit). */
export function ffeZeroForcing(p: number[], cursor: number, spu: number, pre: number, post: number) {
  const n = pre + 1 + post, span = n + 12, rows: number[][] = [], rhs: number[] = [];
  for (let m = -pre - 4; m < span; m++) {
    rows.push(Array.from({ length: n }, (_, i) => p[cursor + (m - (i - pre)) * spu] ?? 0)); rhs.push(m === 0 ? 1 : 0);
  }
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const b = Array.from({ length: n }, (_, i) => rows.reduce((s, r, k) => s + r[i] * rhs[k], 0));
  for (let i = 0; i < n; i++) { let piv = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k; [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]]; for (let k = i + 1; k < n; k++) { const q = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= q * A[i][j]; b[k] -= q * b[i]; } }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j]; c[i] = s / A[i][i]; }
  const tot = c.reduce((s, v) => s + Math.abs(v), 0);
  return c.map((v) => v / tot);
}

export interface Eye {
  rate: number; spu: number; pam4: boolean; order: number; nsym: number; swing: number; ffe: number[]; ffePre: number;
  dfe: number; rj: number; dj: number; noise: number; ber: number; xtalk: [number, number, (0 | 1 | -1)?, number?][]; xtalkPath?: (number[] | undefined)[]; mask?: [number, number]; seed: number;
}
const Qinv = (p: number) => { let lo = 0, hi = 40; for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
function erfc(x: number) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const Q = (x: number) => 0.5 * erfc(x / Math.SQRT2);
/** The eye: the channel's pulse (after transmit FFE), PRBS symbols superposed, crosstalk from near- and far-end
 * aggressors, a pair per row of `xtalk` (kNext·the pulse's derivative unattenuated and kFext·the derivative of the channel's pulse), a DFE of
 * `dfe` taps cancelling post cursors with correct decisions, jitter per symbol (RJ σ and dual-Dirac DJ in UI) as a
 * shift of each trace, Gaussian noise σ (V). Height and width at the best phase, the BER there (noise and jitter
 * included, per bit), the bathtub, the width at the target BER, and the mask's verdict. */
/** `agg`: aggressors' own pulse responses on the victim's time base (an AMI receiver's equalised ones), used in place of
 * the NEXT and FEXT built from 'Crosstalk'. */
export function eye(pulse: { p: number[]; cursor: number }, e: Eye, agg?: number[][]) {
  const { spu } = e, scale = e.swing / 2, pre = 8, post = 80;
  const shaped = (p: number[], c: number) => { const out = new Array(p.length).fill(0); e.ffe.forEach((w, i) => { const sh = (i - e.ffePre) * spu; for (let n = 0; n < p.length; n++) { const m = n - sh; if (m >= 0 && m < p.length) out[n] += w * p[m]; } }); return { p: out, c }; };
  const main = e.ffe.length ? shaped(pulse.p, pulse.cursor) : { p: pulse.p, c: pulse.cursor };
  const cut = (p: number[], c: number) => Array.from({ length: (pre + post) * spu }, (_, k) => (p[c - pre * spu + k] ?? 0) * scale);
  const P = cut(main.p, main.c), deriv = (p: number[]) => p.map((v, n) => (n ? v - p[n - 1] : 0) * spu / 4);
  const step = Array.from({ length: (pre + post) * spu }, (_, k) => (k >= pre * spu && k < (pre + 1) * spu ? scale : 0)), dP = deriv(P), dS = deriv(step);
  const bits = prbs(e.order, e.pam4 ? 2 * e.nsym : e.nsym, e.seed), a = symbols(bits, e.pam4), n = a.length;
  // a neighbour partway along: its NEXT back over that part of the line (M588, `xtalkPath`)
  const way = (r: number[], g?: number[]) => (g ? fftConvolve(r, g, r.length) : r);
  // one NEXT and one FEXT per neighbouring line, each its own PRBS (the first line's seeds as before)
  const sym = (s: number) => symbols(prbs(e.order, e.pam4 ? 2 * e.nsym : e.nsym, s), e.pam4);
  const xt = e.xtalk.flatMap(([kn, kf], i) => [...(kn ? [{ s: sym(e.seed + 77 + 1000 * i), r: way(dS.map((v) => v * kn), e.xtalkPath?.[i]) }] : []), ...(kf ? [{ s: sym(e.seed + 151 + 1000 * i), r: dP.map((v) => v * kf) }] : [])]);
  const L = n * spu, y = new Float64Array(L);
  const sup = (sym: number[], resp: number[]) => { for (let k = 0; k < sym.length; k++) { const base = (k - pre) * spu; for (let j = 0; j < resp.length; j++) { const idx = base + j; if (idx >= 0 && idx < L) y[idx] += sym[k] * resp[j]; } } };
  sup(a, P);
  if (agg) agg.forEach((ap, i) => sup(symbols(prbs(e.order, e.pam4 ? 2 * e.nsym : e.nsym, e.seed + 77 + 74 * i), e.pam4), cut(ap, main.c)));
  else xt.forEach((x) => sup(x.s, x.r));
  const taps = Array.from({ length: e.dfe }, (_, k) => P[pre * spu + (k + 1) * spu]);
  if (e.dfe) for (let k = 0; k < n; k++) { let fb = 0; for (let q = 0; q < e.dfe; q++) if (k - q - 1 >= 0) fb += taps[q] * a[k - q - 1]; for (let j = 0; j < spu; j++) { const idx = k * spu + j - (spu >> 1); if (idx >= 0 && idx < L) y[idx] -= fb; } }
  return { ...measure(y, a, P[pre * spu], e, pre + 4), dfeTaps: taps, mainCursor: P[pre * spu] };
}

/** The eye's measures from a received waveform y whose symbol k is centred at sample k·spu: the main cursor's level
 * `main`, symbols before `skip` left out (start-up, adaptation). Jitter per symbol (RJ σ and dual-Dirac DJ in UI) as a
 * shift of each trace, Gaussian noise σ (V): height and width at the best phase, the BER there (per bit), the bathtub,
 * the width at the target BER, the traces for drawing and the mask's verdict. */
export function measure(y: ArrayLike<number>, a: number[], main: number, e: Eye, skip: number) {
  const { spu } = e, n = a.length;
  // jitter per symbol, a seeded generator
  let s = (e.seed * 2654435761) >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const tau = Array.from({ length: n }, () => e.rj * gauss() + (e.dj / 2) * (rnd() < 0.5 ? -1 : 1));
  const levels = (e.pam4 ? [-1, -1 / 3, 1 / 3, 1] : [-1, 1]).map((v) => v * main), phase = (j: number) => j - (spu >> 1);
  const thr = levels.slice(1).map((v, i) => (v + levels[i]) / 2);
  const valid = (k: number) => k >= skip && k < n - 4;
  const at = (k: number, ph: number) => { const x = k * spu + ph, i0 = Math.floor(x), w = x - i0; return (y[i0] ?? 0) * (1 - w) + (y[i0 + 1] ?? 0) * w; };
  const lvl = (v: number) => (e.pam4 ? [-1, -1 / 3, 1 / 3, 1].indexOf(v) : v > 0 ? 1 : 0);
  // inner height at each phase (no jitter), and the statistical BER (jitter as the phase shift, noise as Gaussian)
  const height: number[] = [], bath: number[] = [];
  for (let j = 0; j < spu; j++) {
    const lo = new Array(levels.length).fill(Infinity), hi = new Array(levels.length).fill(-Infinity);
    let errs = 0, cnt = 0;
    for (let k = 0; k < n; k++) {
      if (!valid(k)) continue;
      const v = at(k, phase(j)), l = lvl(a[k]);
      lo[l] = Math.min(lo[l], v); hi[l] = Math.max(hi[l], v);
      const vj = at(k, phase(j) + tau[k] * spu);
      let pe = 0;
      if (l > 0) pe += e.noise > 0 ? Q((vj - thr[l - 1]) / e.noise) : vj < thr[l - 1] ? 1 : 0;
      if (l < levels.length - 1) pe += e.noise > 0 ? Q((thr[l] - vj) / e.noise) : vj > thr[l] ? 1 : 0;
      errs += Math.min(1, pe); cnt++;
    }
    let h = Infinity; for (let l = 0; l + 1 < levels.length; l++) h = Math.min(h, lo[l + 1] - hi[l]);
    height.push(h); bath.push(Math.max(1e-30, errs / cnt / (e.pam4 ? 2 : 1)));
  }
  let best = 0; for (let j = 1; j < spu; j++) if (height[j] > height[best]) best = j;
  const open = height.filter((h) => h > 0).length / spu, widthJit = Math.max(0, open - e.dj - 2 * Qinv(e.ber) * e.rj), hBer = height[best] - 2 * Qinv(e.ber) * e.noise;
  const below = bath.filter((b) => b <= e.ber).length / spu;
  // traces for drawing: two UI per trace, the eye centred at the best phase
  const traces: number[][] = [], xs: number[] = [];
  for (let k = skip; k < Math.min(n - 4, skip + 400); k++) { const tr: number[] = []; for (let j = -spu; j <= spu; j++) tr.push(at(k, phase(best) + j)); traces.push(tr); xs.push(tau[k]); }
  let maskPass = true;
  if (e.mask) {
    const [mw, mh] = e.mask;
    for (let k = 0; k < n && maskPass; k++) { if (!valid(k)) continue; for (let j = -spu / 2; j <= spu / 2; j++) { const ph = j / spu + tau[k]; if (Math.abs(ph) > mw / 2) continue; const v = at(k, phase(best) + j); for (const t of thr) if (Math.abs(v - t) < mh / 2 * (1 - Math.abs(ph) / (mw / 2))) { maskPass = false; break; } if (!maskPass) break; } }
  }
  return { height, bath, best: phase(best) / spu, heightBest: height[best], heightAtBer: hBer, width: widthJit, widthAtBer: below, ber: bath[best], traces, jitter: xs, levels, thresholds: thr, maskPass };
}

export interface PdnPart { kind: 'vrm' | 'cap' | 'plane' | 'die'; count: number; c: number; esr: number; esl: number }
/** The PDN's impedance at f: every part in parallel: the regulator R + jωL, capacitor groups (ESR + jωESL + 1/jωC)/count
 * (ESL including the mounting), the planes and the die as capacitors with their own small R and L. */
export function pdnZ(f: number, parts: PdnPart[]): C {
  let y: C = [0, 0];
  for (const p of parts) {
    const w = 2 * Math.PI * f, z: C = p.kind === 'vrm' ? [p.esr, w * p.esl] : [p.esr, w * p.esl - 1 / (w * p.c)];
    y = add(y, sc(div([1, 0], z), p.kind === 'vrm' ? 1 : p.count));
  }
  return div([1, 0], y);
}
/** The impedance over a log sweep, its peaks (anti-resonances), where it passes the target, and the droop for a load
 * step dI with rise tr (s) over `dur` s: v = IFFT(Z·I) on 2^15 points, the step a long pulse so the window wraps. */
export function pdn(parts: PdnPart[], target: number, f: number[], step?: { dI: number; tr: number; dur: number }) {
  const Z = f.map((x) => cabs(pdnZ(x, parts))), peaks: [number, number][] = [];
  for (let i = 1; i + 1 < Z.length; i++) if (Z[i] > Z[i - 1] && Z[i] >= Z[i + 1]) peaks.push([f[i], Z[i]]);
  const over = f.filter((_, i) => Z[i] > target);
  let droop: { t: number[]; v: number[]; worst: number } | undefined;
  if (step) {
    const N = 2 ** 15, dt = (2 * step.dur) / N, cur = Array.from({ length: N }, (_, n) => { const t = n * dt; return t < step.dur ? step.dI * Math.min(1, t / Math.max(step.tr, dt)) : step.dI * Math.max(0, 1 - (t - step.dur) / Math.max(step.tr, dt)); });
    const [Ir, Ii] = dft(cur, new Array(N).fill(0)), re = new Array(N).fill(0), im = new Array(N).fill(0);
    for (let k = 0; k <= N / 2; k++) { const fz = k / (N * dt), z = k === 0 ? [parts.filter((p) => p.kind === 'vrm').reduce((s, p) => s + p.esr, 0) || 0, 0] as C : pdnZ(fz, parts), v = mul([Ir[k], Ii[k]], z); re[k] = v[0]; im[k] = v[1]; if (k && k < N / 2) { re[N - k] = v[0]; im[N - k] = -v[1]; } }
    im[N / 2] = 0;
    const [v] = dft(re, im, true), n2 = N / 2, keep = Array.from({ length: n2 }, (_, n) => -v[n]);
    droop = { t: Array.from({ length: n2 }, (_, n) => n * dt), v: keep, worst: Math.min(...keep) };
  }
  return { Z, peaks, over, droop };
}

export interface Plane { W: number; H: number; nx: number; ny: number; oz: number; vrm: number[][]; loads: number[][]; voids: number[][] }
/** The DC drop on a copper plane: a grid of nx × ny cells (sheet resistance ρ/t, 1 oz = 34.8 µm), regulator areas held
 * at their voltage, loads drawing their current spread over their cells, voids removed; the node voltages by conjugate
 * gradients on the resistor mesh. The voltage map, the worst drop, the current density (A/mm²) and each load's
 * voltage. Rectangles are rows [x y w h value] in metres. */
export function irDrop(p: Plane) {
  const { nx, ny } = p, hx = p.W / nx, hy = p.H / ny, t = p.oz * 34.8e-6, g = t / RHO_CU, gx = (g * hy) / hx, gy = (g * hx) / hy;
  const inside = (r: number[], i: number, j: number) => { const x = (i + 0.5) * hx, y = (j + 0.5) * hy; return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; };
  const id = (i: number, j: number) => j * nx + i, N = nx * ny;
  const metal = new Uint8Array(N).fill(1), fixed = new Float64Array(N).fill(NaN), inj = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (p.voids.some((r) => inside(r, i, j))) metal[id(i, j)] = 0;
    const v = p.vrm.find((r) => inside(r, i, j)); if (v && metal[id(i, j)]) fixed[id(i, j)] = v[4];
  }
  for (const r of p.loads) {
    const cells: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (metal[id(i, j)] && inside(r, i, j)) cells.push(id(i, j));
    if (!cells.length) throw new Error('A load sits on no copper (inside a void, or smaller than a grid cell).');
    for (const c of cells) inj[c] -= r[4] / cells.length;
  }
  if (!fixed.some((v) => Number.isFinite(v))) throw new Error('No regulator area lands on copper.');
  const nb = (k: number) => { const i = k % nx, j = Math.floor(k / nx), out: [number, number][] = []; if (i > 0 && metal[k - 1]) out.push([k - 1, gx]); if (i < nx - 1 && metal[k + 1]) out.push([k + 1, gx]); if (j > 0 && metal[k - nx]) out.push([k - nx, gy]); if (j < ny - 1 && metal[k + nx]) out.push([k + nx, gy]); return out; };
  const V = new Float64Array(N), free: number[] = [];
  for (let k = 0; k < N; k++) { if (!metal[k]) V[k] = NaN; else if (Number.isFinite(fixed[k])) V[k] = fixed[k]; else free.push(k); }
  const vmax = Math.max(...p.vrm.map((r) => r[4]));
  for (const k of free) V[k] = vmax;
  const nbs = free.map(nb), index = new Int32Array(N).fill(-1); free.forEach((k, q) => { index[k] = q; });
  const A = (x: Float64Array) => { const out = new Float64Array(free.length); for (let q = 0; q < free.length; q++) { let s = 0, d = 0; for (const [m, w] of nbs[q]) { d += w; const r = index[m]; if (r >= 0) s -= w * x[r]; } out[q] = d * x[q] + s; } return out; };
  const b = new Float64Array(free.length);
  for (let q = 0; q < free.length; q++) { let s = inj[free[q]]; for (const [m, w] of nbs[q]) if (index[m] < 0) s += w * V[m]; b[q] = s; }
  const x = Float64Array.from(free, (k) => V[k]), r = A(x).map((v, q) => b[q] - v), d = Float64Array.from(r);
  let rr = r.reduce((s, v) => s + v * v, 0); const b2 = b.reduce((s, v) => s + v * v, 0) || 1;
  let it = 0;
  for (; it < 20000 && rr > 1e-24 * b2; it++) { const Ad = A(d), al = rr / d.reduce((s, v, q) => s + v * Ad[q], 0); for (let q = 0; q < x.length; q++) { x[q] += al * d[q]; r[q] -= al * Ad[q]; } const rn = r.reduce((s, v) => s + v * v, 0); const be = rn / rr; rr = rn; for (let q = 0; q < d.length; q++) d[q] = r[q] + be * d[q]; }
  free.forEach((k, q) => { V[k] = x[q]; });
  const J = new Float64Array(N).fill(NaN);
  for (let k = 0; k < N; k++) {
    if (!metal[k]) continue;
    const i = k % nx, j = Math.floor(k / nx), gxv = (a: number, c: number) => (Number.isFinite(c) && Number.isFinite(a) ? (c - a) : 0);
    const ex = (gxv(V[k], i < nx - 1 ? V[k + 1] : NaN) + gxv(i > 0 ? V[k - 1] : NaN, V[k])) / (2 * hx), ey = (gxv(V[k], j < ny - 1 ? V[k + nx] : NaN) + gxv(j > 0 ? V[k - nx] : NaN, V[k])) / (2 * hy);
    J[k] = Math.hypot(ex, ey) / RHO_CU / 1e6;
  }
  const loadV = p.loads.map((rct) => { let s = 0, c = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (metal[id(i, j)] && inside(rct, i, j)) { s += V[id(i, j)]; c++; } return s / c; });
  const vmin = Math.min(...[...V].filter(Number.isFinite));
  return { V, J, nx, ny, worst: vmax - vmin, vmin, vmax, loadV, iterations: it, metal };
}
