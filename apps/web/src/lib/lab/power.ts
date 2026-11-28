// Hyperion's power electronics, part 1 (M563): what a converter loses and how hot its parts get. Plain maths, no
// Hyperion values (power-lab.ts puts it in the language). Written from the textbook models:
//  • conduction: a MOSFET as a resistance that grows with temperature, an IGBT or diode as a knee voltage plus a slope;
//  • switching: the energies a datasheet gives at one test voltage, read off its table at the current and scaled
//    with the voltage, times the switching frequency;
//  • heat: a Foster network (the datasheet's Zth curve, a sum of R(1 − e^(−t/τ)) terms) or its equal Cauer ladder
//    (each layer's own R and C), stepped over a power profile for the junction's temperature.

export interface Device {
  kind: 'mosfet' | 'igbt';
  /** MOSFET: on-resistance at 25 °C (Ω) and how much it grows per °C (1/°C). */
  rds: number; alpha: number;
  /** IGBT: knee voltage (V) and slope (Ω). Diode (or body diode): forward voltage and slope. */
  vce0: number; rce: number; vf: number; rd: number;
  /** Switching energies (J) at the test voltage, against current (A): turn-on, turn-off, the diode's reverse recovery. */
  iTab: number[]; eon: number[]; eoff: number[]; err: number[]; vTest: number;
}
/** A 100 V, 6 mΩ silicon MOSFET with its body diode, roughly; the energies at 48 V. */
export const MOSFET: Device = { kind: 'mosfet', rds: 6e-3, alpha: 0.006, vce0: 0, rce: 0, vf: 0.8, rd: 4e-3, iTab: [0, 10, 20, 40], eon: [0, 8e-6, 18e-6, 42e-6], eoff: [0, 5e-6, 11e-6, 26e-6], err: [0, 2e-6, 3.5e-6, 6e-6], vTest: 48 };
/** A 1200 V, 50 A IGBT with its diode, roughly; the energies at 600 V. */
export const IGBT: Device = { kind: 'igbt', rds: 0, alpha: 0, vce0: 0.9, rce: 0.018, vf: 1.1, rd: 0.012, iTab: [0, 10, 25, 50], eon: [0, 0.6e-3, 1.5e-3, 3.4e-3], eoff: [0, 0.5e-3, 1.2e-3, 2.6e-3], err: [0, 0.3e-3, 0.6e-3, 1.0e-3], vTest: 600 };

/** Straight-line reading of a table, held flat past its ends. */
export function interp(x: number[], y: number[], at: number): number {
  if (!x.length) return 0;
  if (at <= x[0]) return y[0];
  for (let i = 1; i < x.length; i++) if (at <= x[i]) return y[i - 1] + ((at - x[i - 1]) / (x[i] - x[i - 1])) * (y[i] - y[i - 1]);
  return y[y.length - 1];
}
/** A switch's conduction loss (W) carrying `iAvg` on average and `iRms` (A) at junction temperature `tj` (°C). */
export function conduction(d: Device, iAvg: number, iRms: number, tj = 25): number {
  return d.kind === 'mosfet' ? iRms * iRms * d.rds * (1 + d.alpha * (tj - 25)) : d.vce0 * iAvg + d.rce * iRms * iRms;
}
/** The diode's conduction loss (W). */
export const diodeConduction = (d: Device, iAvg: number, iRms: number) => d.vf * iAvg + d.rd * iRms * iRms;
/** Switching losses (W) at current `i` (A), blocking voltage `v` (V) and `fsw` (Hz). */
export function switching(d: Device, i: number, v: number, fsw: number) {
  const k = v / d.vTest;
  return { on: interp(d.iTab, d.eon, i) * k * fsw, off: interp(d.iTab, d.eoff, i) * k * fsw, rr: interp(d.iTab, d.err, i) * k * fsw };
}

export interface BuckLoss {
  duty: number; ripple: number; mode: 'CCM' | 'DCM';
  high: { conduction: number; on: number; off: number }; low: { conduction: number; rr: number };
  inductor: number; total: number; out: number; efficiency: number;
}
/** A synchronous (or, `sync` false, diode) buck's losses at one working point. */
export function buckLoss(vin: number, vout: number, iout: number, fsw: number, L: number, dcr: number, d: Device, tj = 25, sync = true): BuckLoss {
  if (!(vin > vout && vout > 0)) throw new Error('A buck needs Vin above Vout, both above 0.');
  const D = vout / vin, ripple = (vin - vout) * D / (L * fsw);
  const dcm = ripple / 2 > iout;
  // Currents in each switch: the triangle around Iout (CCM), or triangles from zero (DCM, the switch's share of the peak).
  let hiAvg: number, hiRms: number, loAvg: number, loRms: number, iOn: number, iOff: number, Lrms: number, Dhi = D;
  if (!dcm) {
    const r2 = (ripple * ripple) / 12;
    hiAvg = iout * D; hiRms = Math.sqrt(D * (iout * iout + r2));
    loAvg = iout * (1 - D); loRms = Math.sqrt((1 - D) * (iout * iout + r2));
    iOn = iout - ripple / 2; iOff = iout + ripple / 2; Lrms = Math.sqrt(iout * iout + r2);
  } else {
    // DCM: the switch's on-time grows so that the average current is Iout: D1 from 2·L·Iout·fsw = D1²·Vin·(Vin−Vout)/Vout.
    const D1 = Math.sqrt((2 * L * iout * fsw * vout) / (vin * (vin - vout))), ipk = ((vin - vout) * D1) / (L * fsw), D2 = (D1 * (vin - vout)) / vout;
    Dhi = D1;
    hiAvg = (ipk * D1) / 2; hiRms = ipk * Math.sqrt(D1 / 3); loAvg = (ipk * D2) / 2; loRms = ipk * Math.sqrt(D2 / 3);
    iOn = 0; iOff = ipk; Lrms = ipk * Math.sqrt((D1 + D2) / 3);
  }
  const on = interp(d.iTab, d.eon, iOn) * (vin / d.vTest) * fsw, off = interp(d.iTab, d.eoff, iOff) * (vin / d.vTest) * fsw;
  const loCond = sync ? conduction(d, loAvg, loRms, tj) : diodeConduction(d, loAvg, loRms);
  // A synchronous switch's body diode recovers only in CCM (in DCM the current reaches zero first).
  const rr = dcm ? 0 : interp(d.iTab, d.err, iOn) * (vin / d.vTest) * fsw;
  const high = { conduction: conduction(d, hiAvg, hiRms, tj), on, off }, low = { conduction: loCond, rr };
  const inductor = Lrms * Lrms * dcr, total = high.conduction + on + off + loCond + rr + inductor, out = vout * iout;
  return { duty: Dhi, ripple, mode: dcm ? 'DCM' : 'CCM', high, low, inductor, total, out, efficiency: out / (out + total) };
}

// ——— Heat ———
/** A Foster network: the junction-to-case impedance Zth(t) = Σ Rᵢ (1 − e^(−t/τᵢ)) of a datasheet. */
export interface Foster { r: number[]; tau: number[] }
export const zth = (f: Foster, t: number) => f.r.reduce((s, r, i) => s + r * (1 - Math.exp(-t / f.tau[i])), 0);

/** Polynomials, coefficients from the highest power down. */
const padd = (a: number[], b: number[]) => { const n = Math.max(a.length, b.length), out = new Array(n).fill(0); a.forEach((v, i) => { out[n - a.length + i] += v; }); b.forEach((v, i) => { out[n - b.length + i] += v; }); return out; };
const pmul = (a: number[], b: number[]) => { const out = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; })); return out; };
const scale = (a: number[], k: number) => a.map((x) => x * k);

/** Foster to Cauer: the same impedance as a ladder of layers (Rᵢ in series, Cᵢ to ambient), as a datasheet's
 *  network is turned into one that can be stacked onto a heatsink's. By continued fraction of Y(s) = 1/Z(s):
 *  Y = sC₁ + 1/(R₁ + 1/(sC₂ + … + 1/Rₙ)). */
export function fosterToCauer(f: Foster): { r: number[]; c: number[] } {
  // Z(s) = N(s)/D(s), adding each term R/(1 + sτ).
  let N = [0], D = [1];
  f.r.forEach((r, i) => { const term = [f.tau[i], 1]; N = padd(pmul(N, term), scale(D, r)); D = pmul(D, term); });
  N = N.slice(N.length - f.r.length); // degree n − 1
  const r: number[] = [], c: number[] = [];
  let num = D, den = N; // the admittance's numerator (degree k) and denominator (degree k − 1)
  for (let k = 0; k < f.r.length && den.length; k++) {
    const C = num[0] / den[0];
    c.push(C);
    num = padd(num, scale([...den, 0], -C)).slice(1); // its leading term is taken off exactly
    const R = den[0] / num[0];
    r.push(R);
    den = padd(den, scale(num, -R)).slice(1);
  }
  return { r, c };
}
/** The Cauer ladder's impedance at complex frequency s = jω, for checks. */
export function cauerZ(cn: { r: number[]; c: number[] }, w: number): [number, number] {
  // From the far end: the last layer's R, then each C in parallel and R in series, back to the junction.
  let zr = Infinity, zi = 0; // open far end (heat leaves only through the network's own resistances)
  for (let k = cn.r.length - 1; k >= 0; k--) {
    // Series R with what's beyond.
    const sr = isFinite(zr) ? zr + cn.r[k] : cn.r[k], si = isFinite(zr) ? zi : 0;
    // Parallel with C: Y = 1/(sr + j si) + jωC.
    const den = sr * sr + si * si, yr = sr / den, yi = -si / den + w * cn.c[k];
    const d2 = yr * yr + yi * yi;
    zr = yr / d2; zi = -yi / d2;
  }
  return [zr, zi];
}
export function fosterZ(f: Foster, w: number): [number, number] {
  let zr = 0, zi = 0;
  f.r.forEach((r, i) => { const a = w * f.tau[i], d = 1 + a * a; zr += r / d; zi -= (r * a) / d; });
  return [zr, zi];
}

/** The junction's temperature over a power profile p(t) (W, sampled every dt s) through a Foster network on a case
 *  held at `tCase`, or through a case-to-ambient stage `sink` (R, τ) to `tAmb`. Exact stepping of each stage. */
export function junctionTemp(f: Foster, p: ArrayLike<number>, dt: number, tAmb = 25, sink?: { r: number; tau: number }) {
  const stages = sink ? { r: [...f.r, sink.r], tau: [...f.tau, sink.tau] } : f;
  const decay = stages.tau.map((t) => Math.exp(-dt / t)), rise = new Array(stages.r.length).fill(0);
  const tj = new Float64Array(p.length);
  for (let k = 0; k < p.length; k++) {
    let sum = 0;
    for (let i = 0; i < rise.length; i++) { rise[i] = rise[i] * decay[i] + p[k] * stages.r[i] * (1 - decay[i]); sum += rise[i]; }
    tj[k] = tAmb + sum;
  }
  return tj;
}

// ——— M564: converter design ———
export type Topology = 'buck' | 'boost' | 'buckboost';
export interface Averaged {
  topology: Topology; duty: number; ratio: number; mode: 'CCM' | 'DCM'; k: number; kCrit: number;
  ripple: number; vout: number; iL: number;
  /** The control-to-output transfer function (duty → output voltage), coefficients from the highest power down. */
  num: number[]; den: number[];
}
/** The textbook averaged model of a converter at the duty that gives `vout` (or at `duty` when vout is NaN):
 *  which conduction mode it runs in (K = 2L/(R·Ts) against its critical value), the duty, the ripple, and its small-
 *  signal control-to-output response. CCM: the classical second-order forms with the boost's and buck-boost's right-
 *  half-plane zero; DCM: the single-pole forms that remain when the inductor current returns to zero each cycle. */
export function averaged(top: Topology, vin: number, vout: number, duty: number, L: number, C: number, R: number, fsw: number, esr = 0): Averaged {
  if (!(vin > 0 && L > 0 && C > 0 && R > 0 && fsw > 0)) throw new Error('Vin, L, C, R and fsw must all be above 0.');
  const K = (2 * L * fsw) / R;
  const kCrit = (D: number) => (top === 'buck' ? 1 - D : top === 'boost' ? D * (1 - D) ** 2 : (1 - D) ** 2);
  const ccmRatio = (D: number) => (top === 'buck' ? D : top === 'boost' ? 1 / (1 - D) : D / (1 - D));
  const dcmRatio = (D: number) => (top === 'buck' ? 2 / (1 + Math.sqrt(1 + (4 * K) / (D * D))) : top === 'boost' ? (1 + Math.sqrt(1 + (4 * D * D) / K)) / 2 : D / Math.sqrt(K));
  let D = duty, M: number;
  if (Number.isFinite(vout)) {
    M = vout / vin;
    if (top === 'buck' && !(M > 0 && M < 1)) throw new Error('A buck makes less than its input: Vout between 0 and Vin.');
    if (top === 'boost' && !(M > 1)) throw new Error('A boost makes more than its input: Vout above Vin.');
    if (top === 'buckboost' && !(M > 0)) throw new Error('Give the buck-boost\'s output as a size (above 0).');
    D = top === 'buck' ? M : top === 'boost' ? 1 - 1 / M : M / (1 + M);
    if (K < kCrit(D)) D = top === 'buck' ? Math.sqrt((4 * K) / ((2 / M - 1) ** 2 - 1)) : top === 'boost' ? Math.sqrt((K * ((2 * M - 1) ** 2 - 1)) / 4) : M * Math.sqrt(K);
  } else {
    if (!(D > 0 && D < 1)) throw new Error('The duty is between 0 and 1.');
    M = K < kCrit(D) ? dcmRatio(D) : ccmRatio(D);
  }
  const dcm = K < kCrit(D), Vo = M * vin, Ts = 1 / fsw;
  // Inductor ripple: from the on-time's volt-seconds.
  const vOn = top === 'buck' ? vin - Vo : vin, ripple = (vOn * D * Ts) / L;
  const iL = top === 'buck' ? Vo / R : (Vo / R) * (top === 'boost' ? M : (1 + M) / M);
  let num: number[], den: number[];
  const z = [C * esr, 1];
  if (!dcm) {
    const Dp = 1 - D;
    if (top === 'buck') { num = [vin]; den = [L * C, L / R, 1]; }
    else if (top === 'boost') { num = [(-vin / (Dp * Dp)) * (L / (R * Dp * Dp)), vin / (Dp * Dp)]; den = [(L * C) / (Dp * Dp), L / (R * Dp * Dp), 1]; }
    else { const g = vin / (Dp * Dp); num = [-g * ((D * L) / (R * Dp * Dp)), g]; den = [(L * C) / (Dp * Dp), L / (R * Dp * Dp), 1]; }
  } else {
    let g: number, wp: number;
    if (top === 'buck') { g = ((2 * Vo) / D) * ((1 - M) / (2 - M)); wp = (2 - M) / ((1 - M) * R * C); }
    else if (top === 'boost') { g = ((2 * Vo) / D) * ((M - 1) / (2 * M - 1)); wp = (2 * M - 1) / ((M - 1) * R * C); }
    else { g = Vo / D; wp = 2 / (R * C); }
    num = [g]; den = [1 / wp, 1];
  }
  if (esr > 0) { const out = new Array(num.length + 1).fill(0); num.forEach((x, i) => { out[i] += x * z[0]; out[i + 1] += x * z[1]; }); num = out; }
  return { topology: top, duty: D, ratio: M, mode: dcm ? 'DCM' : 'CCM', k: K, kCrit: kCrit(D), ripple, vout: Vo, iL, num, den };
}

/** An LLC converter's voltage gain by first-harmonic approximation, at normalised frequency fn = f/fr, inductance
 *  ratio Ln = Lm/Lr and quality factor Q = √(Lr/Cr)/Rac. */
export function llcGain(fn: number, Ln: number, Q: number): number {
  const f2 = fn * fn, re = (Ln + 1) * f2 - 1, im = (f2 - 1) * fn * Q * Ln;
  return (Ln * f2) / Math.hypot(re, im);
}
/** A dual active bridge's power with single phase shift φ (rad, −π…π): V1·V2'·φ(π − |φ|)/(2π²·fsw·L), V2' = n·V2. */
export const dabPower = (v1: number, v2: number, n: number, phi: number, fsw: number, L: number) => (v1 * n * v2 * phi * (Math.PI - Math.abs(phi))) / (2 * Math.PI ** 2 * fsw * L);

// ——— Identification and tuning ———
const TAPS: Record<number, number[]> = { 2: [2, 1], 3: [3, 2], 4: [4, 3], 5: [5, 3], 6: [6, 5], 7: [7, 6], 8: [8, 6, 5, 4], 9: [9, 5], 10: [10, 7], 11: [11, 9], 12: [12, 11, 10, 4], 13: [13, 12, 11, 8], 14: [14, 13, 12, 2], 15: [15, 14], 16: [16, 15, 13, 4] };
/** A maximal-length pseudo-random binary sequence (±1) from an n-bit shift register: period 2ⁿ − 1. */
export function prbs(n: number, len: number): Float64Array {
  const taps = TAPS[n];
  if (!taps) throw new Error('prbs takes a register of 2 to 16 bits.');
  let reg = (1 << n) - 1;
  const out = new Float64Array(len);
  for (let k = 0; k < len; k++) {
    out[k] = reg & 1 ? 1 : -1;
    let bit = 0;
    for (const t of taps) bit ^= (reg >> (n - t)) & 1;
    reg = (reg >> 1) | (bit << (n - 1));
  }
  return out;
}
/** A frequency response estimated from input u and output y sampled every Ts, at frequencies w (rad/s): the cross
 *  spectrum over the input's, averaged over half-overlapping Hann-windowed segments. */
export function frestimate(u: ArrayLike<number>, y: ArrayLike<number>, Ts: number, w: number[], segs = 8) {
  const N = Math.min(u.length, y.length), L = Math.max(16, Math.floor((2 * N) / (segs + 1))), hop = Math.floor(L / 2);
  const win = Array.from({ length: L }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (L - 1)));
  const re = new Float64Array(w.length), im = new Float64Array(w.length);
  w.forEach((wi, j) => {
    let syuR = 0, syuI = 0, suu = 0;
    for (let s = 0; s + L <= N; s += hop) {
      let ur = 0, ui = 0, yr = 0, yi = 0;
      for (let k = 0; k < L; k++) {
        const a = -wi * k * Ts, c = Math.cos(a), sn = Math.sin(a), wk = win[k];
        ur += wk * u[s + k] * c; ui += wk * u[s + k] * sn; yr += wk * y[s + k] * c; yi += wk * y[s + k] * sn;
      }
      syuR += yr * ur + yi * ui; syuI += yi * ur - yr * ui; suu += ur * ur + ui * ui;
    }
    re[j] = syuR / suu; im[j] = syuI / suu;
  });
  return { re, im };
}
const cpoly = (p: number[], w: number): [number, number] => { let r = 0, i = 0; for (const c of p) { const nr = r * 0 - i * w + c, ni = r * w + i * 0; r = nr; i = ni; } return [r, i]; };
/** G(jω) for a transfer function's coefficients. */
export function resp(num: number[], den: number[], w: number): [number, number] {
  const [a, b] = cpoly(num, w), [c, d] = cpoly(den, w), m = c * c + d * d;
  return [(a * c + b * d) / m, (b * c - a * d) / m];
}
/** PI, PID or P gains that put the loop's crossover at wc with the phase margin pm (degrees), from the plant's
 *  response there: the controller's phase makes up what the plant lacks, its gain makes |C·G| = 1. With no wc, the
 *  frequency where the plant's phase allows it (or ten times its bandwidth, for plants that never lag that far). */
export function pidtune(num: number[], den: number[], type: 'P' | 'PI' | 'PID', wc?: number, pm = 60) {
  const phase = (w: number) => { const [r, i] = resp(num, den, w); return Math.atan2(i, r); };
  const mag = (w: number) => Math.hypot(...resp(num, den, w));
  if (!wc) {
    // Unwrapped phase over a wide sweep; the target is where a PI's lag (or a PID's lead) closes the gap.
    const want = ((-180 + pm + (type === 'PI' ? 20 : type === 'PID' ? -30 : 0)) * Math.PI) / 180;
    let prev = phase(1e-6), un = prev;
    for (let e = -6; e <= 9; e += 0.01) {
      const w = 10 ** e, p = phase(w);
      let d = p - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      un += d; prev = p;
      if (un <= want) { wc = w; break; }
    }
    if (!wc) {
      const g0 = mag(1e-6);
      for (let e = -6; e <= 9; e += 0.01) if (mag(10 ** e) <= g0 / Math.SQRT2) { wc = 10 * 10 ** e; break; }
      wc ??= 1;
    }
  }
  const g = mag(wc), phiC = -Math.PI + (pm * Math.PI) / 180 - phase(wc);
  // The controller's phase is wrapped to (−π, π].
  const need = Math.atan2(Math.sin(phiC), Math.cos(phiC));
  let Kp = 0, Ki = 0, Kd = 0;
  // A plant that lags little there leaves more margin than asked: the integral's corner then sits a decade below wc.
  const lagOnly = need <= -Math.PI / 2 + 0.1;
  if (type === 'P') Kp = 1 / g;
  else if (type === 'PI' || lagOnly) {
    if (!(need < 0)) throw new Error(`A PI controller can't give ${pm}° of phase margin at ${wc.toPrecision(3)} rad/s (it needs ${(need * 180 / Math.PI).toFixed(0)}° of lead from the controller): try a lower crossover or 'PID'.`);
    const Ti = lagOnly ? 10 / wc : 1 / (wc * Math.tan(-need));
    Kp = 1 / (g * Math.hypot(1, 1 / (wc * Ti))); Ki = Kp / Ti;
  } else {
    if (!(need < Math.PI / 2)) throw new Error(`A PID controller can't give ${pm}° of phase margin at ${wc.toPrecision(3)} rad/s.`);
    // Ti = 4·Td; x = ωc·Td from x − 1/(4x) = tan φ.
    const t = Math.tan(need), x = (t + Math.sqrt(t * t + 1)) / 2, Td = x / wc, Ti = 4 * Td;
    Kp = 1 / (g * Math.hypot(1, x - 1 / (4 * x))); Ki = Kp / Ti; Kd = Kp * Td;
  }
  // The margin the loop really has at wc.
  const [gr, gi] = resp(num, den, wc), cr = Kp, ci = Kd * wc - Ki / wc;
  const got = 180 + (Math.atan2(gr * ci + gi * cr, gr * cr - gi * ci) * 180) / Math.PI;
  return { Kp, Ki, Kd, wc, pm: got };
}
