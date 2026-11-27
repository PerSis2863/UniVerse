// Hyperion's mixed-signal design (M568, the owner, 27 Nov: "can you please build this in hyperion", MathWorks' mixed-signal
// page: top-down design, verification, PLLs, data converters, SerDes and high-speed links). Pure and our own code from
// the textbook methods: a charge-pump PLL (its loop filter designed for a bandwidth and phase margin, simulated edge by
// edge with a tri-state phase-frequency detector, integer or fractional-N with a MASH sigma-delta, its phase noise and
// jitter), converter architectures (flash, SAR, pipeline ADCs and binary, thermometer and segmented DACs, each with
// its own mismatch), and a serial link (PRBS data, a lossy channel, TX FFE, RX CTLE and DFE, a bang-bang CDR, the eye
// and the bathtub). The existing measures (adcmetrics, inldnl in convert.ts) are the converters' testbench.

import { dft } from './fft';
import { erfc } from './comms';

export type Rand = () => number;
/** A repeatable source of random numbers (mulberry32). */
export function seeded(seed = 1): Rand {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const gauss = (r: Rand) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const TAU = 2 * Math.PI;

// ——— Phase-locked loops ———
export interface PllSpec { fref: number; fout: number; bandwidth: number; phaseMargin?: number; kvco: number; icp: number }
export interface PllDesign extends Required<PllSpec> { n: number; c1: number; c2: number; r2: number; crossover: number; margin: number }
/** A charge-pump PLL's second-order passive loop filter (C1 ∥ (R2 + C2)) for an open-loop crossover `bandwidth` (Hz)
 *  and a phase margin (degrees, 55 by default): τp = (sec φ − tan φ)/ωc, τz = 1/(ωc² τp), the capacitors from the loop
 *  gain at ωc. kvco in Hz/V, icp in A, N = fout/fref (fractional allowed). */
export function pllDesign(s: PllSpec): PllDesign {
  const pm = (s.phaseMargin ?? 55) * Math.PI / 180, wc = TAU * s.bandwidth, n = s.fout / s.fref, kv = TAU * s.kvco;
  if (!(pm > 0 && pm < Math.PI / 2)) throw new Error('The phase margin is between 0 and 90 degrees.');
  if (!(s.bandwidth > 0 && s.bandwidth < s.fref / 4)) throw new Error('The loop bandwidth is above 0 and below a quarter of the reference (a tenth to a twentieth is usual).');
  if (!(n >= 1)) throw new Error('The output frequency must be at least the reference.');
  const tp = (1 / Math.cos(pm) - Math.tan(pm)) / wc, tz = 1 / (wc * wc * tp);
  const ctot = (s.icp * kv) / (TAU * n * wc * wc) * Math.sqrt((1 + (wc * tz) ** 2) / (1 + (wc * tp) ** 2));
  const c1 = ctot * tp / tz, c2 = ctot - c1, r2 = tz / c2;
  const d: PllDesign = { ...s, phaseMargin: s.phaseMargin ?? 55, n, c1, c2, r2, crossover: 0, margin: 0 };
  const b = pllBode(d, [s.bandwidth]);
  return { ...d, crossover: s.bandwidth, margin: 180 + b.phase[0] };
}
/** The loop filter's impedance Z(jω) = (1 + jωτz) / (jω Ctot (1 + jωτp)). */
function zf(d: PllDesign, w: number): [number, number] {
  const ctot = d.c1 + d.c2, tz = d.r2 * d.c2, tp = d.r2 * d.c1 * d.c2 / ctot;
  // (1 + j w tz) / (j w ctot (1 + j w tp))
  const nr = 1, ni = w * tz, dr = -w * w * ctot * tp, di = w * ctot, m = dr * dr + di * di;
  return [(nr * dr + ni * di) / m, (ni * dr - nr * di) / m];
}
/** The open-loop gain G = Icp/2π · Z · 2πKvco/(jω N) at each frequency (Hz): magnitude (dB) and phase (degrees), and the
 *  closed loop H = N G/(1 + G) from the reference to the output (dB, its DC gain N). */
export function pllBode(d: PllDesign, f: number[]) {
  const mag: number[] = [], phase: number[] = [], closed: number[] = [], hRe: number[] = [], hIm: number[] = [];
  for (const fi of f) {
    const w = TAU * fi, [zr, zi] = zf(d, w), k = d.icp / TAU * TAU * d.kvco / (w * d.n);
    // G = k Z / j = k (zi − j zr)
    const gr = k * zi, gi = -k * zr;
    mag.push(20 * Math.log10(Math.hypot(gr, gi))); phase.push(Math.atan2(gi, gr) * 180 / Math.PI);
    const dr = 1 + gr, di = gi, m = dr * dr + di * di, hr = (gr * dr + gi * di) / m, hi = (gi * dr - gr * di) / m;
    hRe.push(hr); hIm.push(hi); closed.push(20 * Math.log10(d.n * Math.hypot(hr, hi)));
  }
  return { mag, phase, closed, hRe, hIm };
}

export interface PllRun { t: number[]; vc: number[]; fout: number[]; phaseErr: number[]; lockTime: number; locked: boolean; nUsed: number[] }
/** The PLL in time, edge by edge: a tri-state phase-frequency detector driving the charge pump into the loop filter,
 *  the VCO (f = f0 + Kvco·Vc) and its divider. A non-whole N divides by a MASH 1-1-1 sigma-delta's moduli (fractional-N).
 *  `f0` is the VCO's frequency at 0 V (by default 3% below the target, so it must pull in), `cycles` reference periods,
 *  `steps` sub-steps a period. Samples once a reference period: the time, control voltage, the output frequency (averaged over the period), the phase
 *  error (seconds, reference edge minus divider edge) and the divider modulus used. Lock: the frequency (averaged over 16
 *  periods) within `tol` (1e-4 by default) of the target from then on. */
export function pllSim(d: PllDesign, o: { f0?: number; cycles?: number; steps?: number; tol?: number; mash?: 0 | 1 | 2 | 3; leak?: number } = {}): PllRun {
  const tref = 1 / d.fref, steps = o.steps ?? 120, dt = tref / steps, cycles = o.cycles ?? 400, tol = o.tol ?? 1e-4;
  const target = d.fout, f0 = o.f0 ?? target * 0.97;
  const nInt = Math.floor(d.n), frac = d.n - nInt, order = o.mash ?? (frac > 1e-12 ? 3 : 0);
  if (frac > 1e-12 && order === 0) throw new Error('A non-whole N needs the sigma-delta (MASH order 1 to 3).');
  // MASH 1-1-1 accumulators
  const acc = [0, 0, 0]; let y2p = 0, y3p = 0, y3pp = 0;
  const mashNext = () => {
    if (!order) return 0;
    let c1 = 0, c2 = 0, c3 = 0;
    acc[0] += frac; if (acc[0] >= 1) { acc[0] -= 1; c1 = 1; }
    if (order >= 2) { acc[1] += acc[0]; if (acc[1] >= 1) { acc[1] -= 1; c2 = 1; } }
    if (order >= 3) { acc[2] += acc[1]; if (acc[2] >= 1) { acc[2] -= 1; c3 = 1; } }
    // y = c1 + (1 − z⁻¹) c2 + (1 − z⁻¹)² c3
    const out = c1 + (order >= 2 ? c2 - y2p : 0) + (order >= 3 ? c3 - 2 * y3p + y3pp : 0);
    y2p = c2; y3pp = y3p; y3p = c3;
    return out;
  };
  let vc = 0, vz = 0, phase = 0 /* VCO cycles since its last divider edge */, mod = nInt + mashNext();
  let up = false, dn = false, lastRef = 0, lastDiv = 0, cyc = 0;
  const T: number[] = [], V: number[] = [], F: number[] = [], E: number[] = [], NU: number[] = [];
  let lockAt = -1;
  for (let k = 0; k < cycles; k++) {
    // reference edge at the start of each period
    const tr = k * tref;
    up = true; lastRef = tr;
    if (up && dn) { up = false; dn = false; }
    for (let s = 0; s < steps; s++) {
      const t0 = tr + s * dt;
      const f = Math.max(0, f0 + d.kvco * vc);
      cyc += f * dt;
      // does the divider's edge fall in this step?
      let tEdge = Infinity;
      if (phase + f * dt >= mod) tEdge = t0 + (mod - phase) / f;
      const seg = (a: number, b: number) => {
        const i = d.icp * ((up ? 1 : 0) - (dn ? 1 : 0)) - (o.leak ?? 0);
        // C1 ∥ (R2 + C2): C1 dVc/dt = i − (Vc − Vz)/R2, C2 dVz/dt = (Vc − Vz)/R2 (sub-stepped)
        const h = b - a, m = Math.max(1, Math.ceil(h / (d.r2 * Math.min(d.c1, d.c2) * 0.2)));
        for (let j = 0; j < m; j++) { const ir = (vc - vz) / d.r2; vc += (i - ir) * (h / m) / d.c1; vz += ir * (h / m) / d.c2; }
      };
      if (tEdge < t0 + dt) {
        seg(t0, tEdge);
        phase = phase + f * dt - mod; mod = nInt + mashNext();
        dn = true; lastDiv = tEdge;
        if (up && dn) { up = false; dn = false; }
        seg(tEdge, t0 + dt);
      } else { phase += f * dt; seg(t0, t0 + dt); }
    }
    const fNow = cyc / tref; cyc = 0;
    T.push((k + 1) * tref); V.push(vc); F.push(fNow); E.push(lastRef - lastDiv); NU.push(mod);
    // locked: the average over the last 16 periods (a fractional-N divider moves the frequency each period) on target
    const w = F.slice(-16), avg = w.reduce((a, b) => a + b, 0) / w.length;
    if (k >= 15 && Math.abs(avg - target) / target < tol) { if (lockAt < 0) lockAt = (k + 1) * tref; } else lockAt = -1;
  }
  return { t: T, vc: V, fout: F, phaseErr: E, lockTime: lockAt, locked: lockAt >= 0, nUsed: NU };
}

export interface NoiseSpec { refNoise?: number; vcoNoise?: number; vcoAt?: number; vcoCorner?: number; floor?: number; mash?: number }
/** The output's phase noise (dBc/Hz) at offsets f: the reference's (flat, `refNoise` dBc/Hz) times |N H|², the VCO's
 *  (`vcoNoise` dBc/Hz at `vcoAt` Hz, falling 20 dB a decade, 30 below `vcoCorner`) times |1 − H|², the sigma-delta's
 *  shaped quantisation in a fractional-N loop, and a flat floor. The RMS jitter (s) from integrating it between the
 *  first and last offset. */
export function pllNoise(d: PllDesign, f: number[], s: NoiseSpec = {}) {
  const ref = s.refNoise ?? -150, vco = s.vcoNoise ?? -110, at = s.vcoAt ?? 1e6, corner = s.vcoCorner ?? 0, floor = s.floor ?? -165;
  const order = s.mash ?? (Math.abs(d.n - Math.round(d.n)) > 1e-12 ? 3 : 0);
  const b = pllBode(d, f);
  const L = (x: number) => 10 * Math.log10(Math.max(1e-300, x));
  const refOut: number[] = [], vcoOut: number[] = [], sdOut: number[] = [], total: number[] = [];
  f.forEach((fi, i) => {
    const h2 = b.hRe[i] ** 2 + b.hIm[i] ** 2, e2 = (1 - b.hRe[i]) ** 2 + b.hIm[i] ** 2;
    const r = 10 ** (ref / 10) * d.n * d.n * h2;
    let v = 10 ** (vco / 10) * (at / fi) ** 2; if (corner > 0 && fi < corner) v *= corner / fi;
    v *= e2;
    // sigma-delta: S_φ = (2π)²/(12 fref) (2 sin(π f/fref))^(2(m−1)) rad²/Hz at the output, single-sided L = S/2
    const sd = order ? ((TAU ** 2) / (12 * d.fref)) * (2 * Math.sin(Math.PI * Math.min(fi, d.fref / 2) / d.fref)) ** (2 * (order - 1)) * h2 / 2 : 0;
    refOut.push(L(r)); vcoOut.push(L(v)); sdOut.push(order ? L(sd) : -Infinity);
    total.push(L(r + v + sd + 10 ** (floor / 10)));
  });
  // RMS phase (rad) = sqrt(2 ∫ L(f) df), trapezoids on the given grid
  let area = 0; for (let i = 1; i < f.length; i++) area += 0.5 * (10 ** (total[i] / 10) + 10 ** (total[i - 1] / 10)) * (f[i] - f[i - 1]);
  const jitter = Math.sqrt(2 * area) / (TAU * d.fout);
  return { ref: refOut, vco: vcoOut, sd: sdOut, total, jitter };
}

// ——— Data converters ———
export type AdcArch = 'flash' | 'sar' | 'pipeline';
export interface ArchFlaws { offset?: number; mismatch?: number; noise?: number; gain?: number; seed?: number }
/** An N-bit ADC of a given architecture over [lo, hi], its flaws drawn once (repeatable by `seed`):
 *  flash: each comparator's threshold off by `offset` LSB (σ); SAR: a binary-weighted capacitor DAC whose unit
 *  capacitors spread by `mismatch` (σ, a share) and a comparator offset; pipeline: 1.5-bit stages whose gain of 2 is
 *  off by `gain` (a share, σ) with comparator offsets (`offset`, σ as a share of the stage's range: the redundancy
 *  forgives up to 0.125 each way), and a final flash. `noise` LSB of comparator noise each decision. Returns codes 0 … 2ᴺ − 1. */
export function archAdc(x: number[], arch: AdcArch, bits: number, lo = -1, hi = 1, fl: ArchFlaws = {}) {
  const r = seeded(fl.seed ?? 1), full = 2 ** bits, nz = fl.noise ?? 0;
  const norm = (v: number) => (v - lo) / (hi - lo); // 0 … 1
  if (arch === 'flash') {
    if (bits > 12) throw new Error('A flash converter above 12 bits needs 4096 comparators: choose SAR or pipeline.');
    const th = Array.from({ length: full - 1 }, (_, k) => (k + 1) / full + gauss(r) * (fl.offset ?? 0) / full);
    return x.map((v) => { const u = norm(v); let c = 0; for (const t of th) if (u + gauss(r) * nz / full > t) c++; return c; });
  }
  if (arch === 'sar') {
    // capacitor for bit k: 2^k unit capacitors, each 1 + σ·N(0,1); weights as a share of the total
    const caps = Array.from({ length: bits }, (_, k) => { let c = 0; for (let j = 0; j < 2 ** k; j++) c += 1 + (fl.mismatch ?? 0) * gauss(r); return c; });
    const total = caps.reduce((s, c) => s + c, 0) + 1 + (fl.mismatch ?? 0) * gauss(r); // the dummy unit
    const off = (fl.offset ?? 0) * gauss(r) / full;
    return x.map((v) => {
      const u = Math.min(1, Math.max(0, norm(v)));
      let code = 0, dacv = 0;
      for (let k = bits - 1; k >= 0; k--) {
        const trial = dacv + caps[k] / total;
        if (u + off + gauss(r) * nz / full >= trial) { dacv = trial; code |= 1 << k; }
      }
      return code;
    });
  }
  // pipeline of 1.5-bit stages: each resolves d ∈ {−1, 0, 1} with thresholds ±¼, residue 2v − d (v in −1…1), then a
  // 2-bit flash; digital correction adds the stages' outputs with one bit's overlap.
  const stages = Math.max(1, bits - 2);
  const gains = Array.from({ length: stages }, () => 2 * (1 + (fl.gain ?? 0) * gauss(r)));
  const offs = Array.from({ length: stages }, () => [gauss(r), gauss(r)].map((g) => g * (fl.offset ?? 0) * 2));
  return x.map((v) => {
    let u = Math.min(1, Math.max(-1, 2 * norm(v) - 1)), sum = 0;
    for (let s = 0; s < stages; s++) {
      const nzs = gauss(r) * nz / 8;
      const d = u + nzs > 0.25 + offs[s][1] ? 1 : u + nzs < -0.25 + offs[s][0] ? -1 : 0;
      sum = 2 * sum + d; // weights 2^(stages−1−s) after the loop
      u = gains[s] * u - d;
    }
    // u₀ = (sum + u_S)/2^S, so code = (u₀ + 1)/2 · 2ᴺ = 2·sum + 2(u_S + 1) + 2ᴺ/2 − 2, the last term a 2-bit flash
    const last = Math.min(3, Math.max(0, Math.floor((u + 1) * 2)));
    return Math.min(full - 1, Math.max(0, 2 * sum + last + full / 2 - 2));
  });
}
export type DacArch = 'binary' | 'thermometer' | 'segmented';
/** An N-bit current-steering DAC's output for every code (in LSB): binary-weighted (bit k from 2^k unit sources),
 *  thermometer (one unit source per step) or segmented (`msb` top bits thermometer, the rest binary), each unit source
 *  off by `mismatch` (σ, a share; repeatable by `seed`). With the static INL and DNL (LSB, end-point fit). */
export function archDac(arch: DacArch, bits: number, mismatch: number, o: { msb?: number; seed?: number } = {}) {
  const r = seeded(o.seed ?? 1), full = 2 ** bits, unit = () => 1 + mismatch * gauss(r);
  const units = (n: number) => { let s = 0; for (let j = 0; j < n; j++) s += unit(); return s; };
  let out: number[];
  if (arch === 'binary') { const w = Array.from({ length: bits }, (_, k) => units(2 ** k)); out = Array.from({ length: full }, (_, c) => w.reduce((s, wk, k) => s + ((c >> k) & 1 ? wk : 0), 0)); }
  else if (arch === 'thermometer') { if (bits > 14) throw new Error('A thermometer DAC above 14 bits needs too many sources: choose segmented.'); const u = Array.from({ length: full - 1 }, unit); const cum = [0]; for (const x of u) cum.push(cum[cum.length - 1] + x); out = cum; }
  else {
    const m = Math.min(bits, Math.max(1, o.msb ?? Math.ceil(bits / 2))), l = bits - m;
    const w = Array.from({ length: l }, (_, k) => units(2 ** k)), seg = Array.from({ length: 2 ** m - 1 }, () => units(2 ** l));
    const cum = [0]; for (const x of seg) cum.push(cum[cum.length - 1] + x);
    out = Array.from({ length: full }, (_, c) => cum[c >> l] + w.reduce((s, wk, k) => s + ((c >> k) & 1 ? wk : 0), 0));
  }
  const step = (out[full - 1] - out[0]) / (full - 1);
  const inl = out.map((v, c) => (v - out[0]) / step - c), dnl = out.map((v, c) => (c ? (v - out[c - 1]) / step - 1 : 0));
  return { out, inl, dnl };
}

// ——— SerDes and high-speed links ———
const PRBS_TAPS: Record<number, [number, number]> = { 7: [7, 6], 9: [9, 5], 11: [11, 9], 15: [15, 14], 23: [23, 18], 31: [31, 28] };
/** A pseudo-random bit sequence PRBS-k (k = 7, 9, 11, 15, 23, 31: x^k + x^m + 1, ITU-T O.150's polynomials), n bits. */
export function prbs(order: number, n: number, seed = 1) {
  const t = PRBS_TAPS[order]; if (!t) throw new Error('PRBS orders: 7, 9, 11, 15, 23 or 31.');
  let s = (seed >>> 0) || 1; const mask = order === 31 ? 0x7fffffff : (1 << order) - 1; s &= mask; if (!s) s = 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const b = ((s >>> (t[0] - 1)) ^ (s >>> (t[1] - 1))) & 1; out.push(b); s = ((s << 1) | b) & mask; }
  return out;
}
export interface LinkSpec {
  rate: number; loss: number; sps?: number; skin?: number; pam4?: boolean;
  ffe?: number[]; ctle?: number; ctleAt?: number; dfe?: number; noise?: number; jitter?: number;
}
/** A lossy channel as a minimum-phase filter: loss (dB at Nyquist, rate/2 for NRZ, rate/4 a symbol rate for PAM4)
 *  shared between skin effect (∝ √f, share `skin`, 0.5 by default) and dielectric loss (∝ f), its phase from the
 *  magnitude (the real-cepstrum method), with a CTLE (`ctle` dB of peaking at `ctleAt`, the Nyquist frequency by
 *  default: a zero, a pole there and one at 4× it, DC gain 1/peaking). The pulse response of one symbol (`sps`
 *  samples a symbol), with TX FFE taps [pre main post…] (main the largest) applied. */
export function linkPulse(s: LinkSpec) {
  const sps = s.sps ?? 32, nui = 128, n = sps * nui, baud = s.pam4 ? s.rate / 2 : s.rate, fs = baud * sps, fN = baud / 2;
  if (!(s.loss >= 0 && s.loss <= 60)) throw new Error('The channel loss at Nyquist is 0 to 60 dB.');
  const skin = s.skin ?? 0.5, aNyq = s.loss / 20 * Math.LN10; // nepers at Nyquist
  const logMag = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    const fk = (k <= n / 2 ? k : n - k) * fs / n, x = fk / fN;
    let a = aNyq * (skin * Math.sqrt(x) + (1 - skin) * x);
    if (s.ctle) {
      const pk = 10 ** (s.ctle / 20), fp = s.ctleAt ?? fN, fz = fp / pk, fp2 = 4 * fp;
      const g = Math.hypot(1, fk / fz) / (Math.hypot(1, fk / fp) * Math.hypot(1, fk / fp2)) / pk;
      a -= Math.log(g);
    }
    logMag[k] = -a;
  }
  // minimum phase: cepstrum of log|H|, folded, exponentiated
  const [cr, ci] = dft(logMag, new Array(n).fill(0), true);
  const fr = new Array(n).fill(0), fi = new Array(n).fill(0);
  fr[0] = cr[0]; fi[0] = ci[0]; fr[n / 2] = cr[n / 2]; fi[n / 2] = ci[n / 2];
  for (let k = 1; k < n / 2; k++) { fr[k] = 2 * cr[k]; fi[k] = 2 * ci[k]; }
  const [lr, li] = dft(fr, fi, false);
  const hr = new Array(n), hi = new Array(n);
  for (let k = 0; k < n; k++) { const m = Math.exp(lr[k]); hr[k] = m * Math.cos(li[k]); hi[k] = m * Math.sin(li[k]); }
  // times a one-symbol rectangle: its DFT, then back to time
  const rect = new Array(n).fill(0); for (let i = 0; i < sps; i++) rect[i] = 1;
  const [rr, ri] = dft(rect, new Array(n).fill(0), false);
  const pr = new Array(n), pi = new Array(n);
  for (let k = 0; k < n; k++) { pr[k] = hr[k] * rr[k] - hi[k] * ri[k]; pi[k] = hr[k] * ri[k] + hi[k] * rr[k]; }
  let p = Array.from(dft(pr, pi, true)[0]);
  if (s.ffe && s.ffe.length) {
    const main = s.ffe.reduce((b, v, i) => (Math.abs(v) > Math.abs(s.ffe![b]) ? i : b), 0);
    const q = new Array(n).fill(0);
    s.ffe.forEach((c, j) => { const sh = (j - main) * sps; for (let i = 0; i < n; i++) { const src = i - sh; if (src >= 0 && src < n) q[i] += c * p[src]; } });
    p = q;
  }
  const peak = p.reduce((b, v, i) => (v > p[b] ? i : b), 0);
  const cursors = (k: number) => p[peak + k * sps] ?? 0;
  return { p, sps, peak, baud, fs, main: p[peak], pre: [cursors(-2), cursors(-1)], post: Array.from({ length: 8 }, (_, k) => cursors(k + 1)) };
}
export interface LinkRun {
  pulse: ReturnType<typeof linkPulse>; symbols: number[]; wave: number[]; dfeTaps: number[];
  eyeHeight: number; eyeWidth: number; bestPhase: number; levels: number[];
  bathtub: { phase: number[]; ber: number[] }; widthAt: number; cdr: number[];
}
/** A serial link end to end: `bits` PRBS bits (NRZ, or PAM4 two bits a symbol, Gray coded), through the pulse response,
 *  plus noise (σ, in the same units as a symbol of ±1) and random jitter (σ, a share of a symbol), with a DFE of `dfe`
 *  taps set to the post-cursors (zero-forcing). Its received waveform (after the DFE's feedback), the eye's height and
 *  width at the best sampling phase, a bang-bang CDR's phase over time (samples), and the statistical bathtub (BER at
 *  each phase across one symbol) with the width open at BER 1e-12. */
export function linkRun(s: LinkSpec & { bits?: number; order?: number; seed?: number }): LinkRun {
  const pulse = linkPulse(s), { p, sps, peak } = pulse, r = seeded(s.seed ?? 7);
  const bits = prbs(s.order ?? 7, s.bits ?? 2000, s.seed ?? 1);
  const levels = s.pam4 ? [-1, -1 / 3, 1 / 3, 1] : [-1, 1];
  const gray = [0, 1, 3, 2];
  const symbols: number[] = [];
  if (s.pam4) for (let i = 0; i + 1 < bits.length; i += 2) symbols.push(levels[gray[bits[i] * 2 + bits[i + 1]]]);
  else for (const b of bits) symbols.push(b ? 1 : -1);
  const ns = symbols.length, len = ns * sps, nt = Math.min(s.dfe ?? 0, 8);
  const dfeTaps = pulse.post.slice(0, nt);
  const span = Math.min(p.length, peak + 12 * sps);
  const wave = new Array(len).fill(0), jit = s.jitter ?? 0;
  for (let k = 0; k < ns; k++) {
    const sh = jit ? gauss(r) * jit * sps : 0, a = symbols[k];
    for (let i = 0; i < span; i++) {
      const t = k * sps + i - (peak - Math.floor(sps / 2)); // the main cursor in the middle of symbol k
      if (t < 0 || t >= len) continue;
      const src = i - sh, i0 = Math.floor(src), w = src - i0;
      const v = i0 >= 0 && i0 + 1 < p.length ? p[i0] * (1 - w) + p[i0 + 1] * w : 0;
      wave[t] += a * v;
    }
  }
  const sigma = s.noise ?? 0;
  if (sigma) for (let i = 0; i < len; i++) wave[i] += gauss(r) * sigma * Math.abs(pulse.main);
  // DFE: subtract the post-cursors of the symbols already decided (ideal decisions: the bits sent)
  if (nt) for (let k = 0; k < ns; k++) for (let j = 1; j <= nt; j++) { if (k - j < 0) continue; const c = symbols[k - j] * dfeTaps[j - 1]; for (let i = 0; i < sps; i++) wave[k * sps + i] -= c; }
  // the eye: for each phase in a symbol, the smallest gap between neighbouring levels' clouds
  const skip = 16, main = pulse.main;
  const eyeAt = (ph: number) => {
    let worst = Infinity;
    for (let L = 0; L + 1 < levels.length; L++) {
      let top = Infinity, bot = -Infinity;
      for (let k = skip; k < ns; k++) { const y = wave[k * sps + ph] / main; if (symbols[k] === levels[L + 1]) top = Math.min(top, y); else if (symbols[k] === levels[L]) bot = Math.max(bot, y); }
      worst = Math.min(worst, top - bot);
    }
    return worst;
  };
  const heights = Array.from({ length: sps }, (_, ph) => eyeAt(ph));
  const bestPhase = heights.reduce((b, v, i) => (v > heights[b] ? i : b), 0);
  const eyeHeight = Math.max(0, heights[bestPhase]) * main;
  const eyeWidth = heights.filter((h) => h > 0).length / sps;
  // statistical bathtub with the given noise (or a small floor) around each sample: BER(phase)
  const sg = Math.max(sigma, 0.01) * Math.abs(main), ber: number[] = [];
  for (let ph = 0; ph < sps; ph++) {
    let e = 0, cnt = 0;
    for (let k = skip; k < ns; k++) {
      const y = wave[k * sps + ph], a = symbols[k], li = levels.indexOf(a);
      // distance to the decision thresholds either side (midway between levels, scaled by the main cursor)
      const up = li + 1 < levels.length ? ((levels[li] + levels[li + 1]) / 2) * main - y : Infinity;
      const dn = li > 0 ? y - ((levels[li] + levels[li - 1]) / 2) * main : Infinity;
      e += (up < Infinity ? 0.5 * erfc(up / (sg * Math.SQRT2)) : 0) + (dn < Infinity ? 0.5 * erfc(dn / (sg * Math.SQRT2)) : 0); cnt++;
    }
    ber.push(Math.max(1e-30, Math.min(0.5, e / cnt)));
  }
  const widthAt = ber.filter((b) => b < 1e-12).length / sps;
  // bang-bang CDR (Alexander): data at φ, edge at φ + sps/2; a transition with the edge equal to the earlier bit → late
  const cdr: number[] = []; let ph = 0;
  for (let k = skip; k + 1 < ns; k++) {
    const at = (t: number) => wave[Math.min(len - 1, Math.max(0, Math.round(t)))];
    const d0 = Math.sign(at(k * sps + ph)), e0 = Math.sign(at(k * sps + ph + sps / 2)), d1 = Math.sign(at((k + 1) * sps + ph));
    if (d0 !== d1) ph += e0 === d0 ? 1 : -1;
    ph = ((ph % sps) + sps) % sps; cdr.push(ph);
  }
  return { pulse, symbols, wave, dfeTaps, eyeHeight, eyeWidth, bestPhase, levels, bathtub: { phase: Array.from({ length: sps }, (_, i) => i / sps), ber }, widthAt, cdr };
}
