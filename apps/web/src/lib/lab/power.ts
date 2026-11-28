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
