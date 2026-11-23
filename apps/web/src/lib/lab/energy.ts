// Hyperion's energy toolbox (M425, the owner's list: "Batteries", "Energy production"): a lithium-ion cell as an
// equivalent circuit (open-circuit voltage by state of charge, a series resistance and one RC pair), its state of
// charge tracked by an extended Kalman filter, packs of cells, a solar module by the single-diode model (its I–V
// curve and maximum power point), and a wind turbine's power curve with its yearly energy over a Weibull wind.

/** A typical NMC lithium-ion cell's open-circuit voltage at state of charge 0, 0.1, …, 1. */
const OCV = [3.0, 3.45, 3.55, 3.62, 3.67, 3.72, 3.78, 3.85, 3.93, 4.03, 4.2];
export const ocv = (z: number) => { const s = Math.max(0, Math.min(1, z)) * 10, i = Math.min(9, Math.floor(s)); return OCV[i] + (OCV[i + 1] - OCV[i]) * (s - i); };
export const dOcv = (z: number) => (ocv(Math.min(1, z + 1e-4)) - ocv(Math.max(0, z - 1e-4))) / (Math.min(1, z + 1e-4) - Math.max(0, z - 1e-4));

export interface Cell { capacity: number; r0: number; r1: number; c1: number }
export const DEFAULT_CELL: Cell = { capacity: 5, r0: 0.012, r1: 0.008, c1: 2500 };
/** The cell under a current (amps, + discharging) sampled every dt seconds: terminal voltage, state of charge. */
export function simulateCell(cell: Cell, current: number[], dt: number, soc0 = 1) {
  let z = soc0, v1 = 0;
  const a = Math.exp(-dt / (cell.r1 * cell.c1)), v: number[] = [], soc: number[] = [];
  for (const I of current) {
    v.push(ocv(z) - I * cell.r0 - v1); soc.push(z);
    z = Math.max(0, Math.min(1, z - (I * dt) / (3600 * cell.capacity)));
    v1 = a * v1 + cell.r1 * (1 - a) * I;
  }
  return { v, soc };
}
/** State of charge from currents and measured voltages by an extended Kalman filter on [soc, v1]. */
export function socEkf(cell: Cell, current: number[], voltage: number[], dt: number, soc0 = 0.5, o: { q?: number; r?: number; p0?: number } = {}) {
  const a = Math.exp(-dt / (cell.r1 * cell.c1)), Q = o.q ?? 1e-7, R = o.r ?? 1e-4;
  let z = soc0, v1 = 0, P = [[o.p0 ?? 0.1, 0], [0, 1e-4]];
  const out: number[] = [];
  current.forEach((I, k) => {
    // Correct with the measured voltage, then predict the next step.
    const H = [dOcv(z), -1], y = voltage[k] - (ocv(z) - I * cell.r0 - v1);
    const PH = [P[0][0] * H[0] + P[0][1] * H[1], P[1][0] * H[0] + P[1][1] * H[1]], S = H[0] * PH[0] + H[1] * PH[1] + R, K = [PH[0] / S, PH[1] / S];
    z += K[0] * y; v1 += K[1] * y;
    P = [[P[0][0] - K[0] * PH[0], P[0][1] - K[0] * PH[1]], [P[1][0] - K[1] * PH[0], P[1][1] - K[1] * PH[1]]];
    z = Math.max(0, Math.min(1, z));
    out.push(z);
    z -= (I * dt) / (3600 * cell.capacity); v1 = a * v1 + cell.r1 * (1 - a) * I;
    P = [[P[0][0] + Q, a * P[0][1]], [a * P[1][0], a * a * P[1][1] + Q]];
  });
  return out;
}
/** s cells in series, p strings in parallel: as one big cell (voltages × s; capacity × p; resistances × s/p). */
export const pack = (cell: Cell, s: number, p: number) => ({ cell: { capacity: cell.capacity * p, r0: (cell.r0 * s) / p, r1: (cell.r1 * s) / p, c1: (cell.c1 * p) / s }, series: s, parallel: p });

// ——— Solar ———
export interface Module { isc: number; voc: number; ns: number; n: number; rs: number; rsh: number; alpha: number; beta: number }
export const DEFAULT_MODULE: Module = { isc: 9.0, voc: 37.5, ns: 60, n: 1.3, rs: 0.25, rsh: 300, alpha: 0.0005, beta: -0.0032 };
const K = 1.380649e-23, Q_E = 1.602176634e-19;
/** The current at voltage V (single-diode model, solved by Newton), at irradiance G (W/m²) and cell temperature T (°C). */
export function pvCurrent(m: Module, V: number, G = 1000, T = 25) {
  const vt = (m.n * m.ns * K * (T + 273.15)) / Q_E, iph = m.isc * (G / 1000) * (1 + m.alpha * (T - 25)), voc = m.voc * (1 + m.beta * (T - 25)) + vt * Math.log(Math.max(G, 1e-6) / 1000);
  const i0 = iph / (Math.exp(voc / vt) - 1);
  let I = iph;
  for (let k = 0; k < 60; k++) {
    const e = Math.exp((V + I * m.rs) / vt), f = iph - i0 * (e - 1) - (V + I * m.rs) / m.rsh - I, df = -i0 * e * (m.rs / vt) - m.rs / m.rsh - 1, step = f / df;
    I -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return I;
}
/** The I–V and P–V curves from 0 to open circuit, and the maximum power point (golden-section search). */
export function pvCurve(m: Module, G = 1000, T = 25, points = 200) {
  let hi = m.voc * (1 + m.beta * (T - 25)) * 1.05;
  while (pvCurrent(m, hi, G, T) > 0) hi *= 1.02;
  // Open circuit by bisection.
  let lo = 0;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (pvCurrent(m, mid, G, T) > 0) lo = mid; else hi = mid; }
  const voc = lo, V = Array.from({ length: points }, (_, i) => (voc * i) / (points - 1)), I = V.map((v) => Math.max(0, pvCurrent(m, v, G, T)));
  let a = 0, b = voc;
  const g = (Math.sqrt(5) - 1) / 2, p = (v: number) => v * pvCurrent(m, v, G, T);
  for (let k = 0; k < 100; k++) { const c = b - g * (b - a), d = a + g * (b - a); if (p(c) > p(d)) b = d; else a = c; }
  const vmp = (a + b) / 2, imp = pvCurrent(m, vmp, G, T);
  return { V, I, P: V.map((v, i) => v * I[i]), voc, isc: pvCurrent(m, 0, G, T), vmp, imp, pmax: vmp * imp };
}

// ——— Wind ———
export interface Turbine { diameter: number; rated: number; cutIn: number; cutOut: number; cp: number; rho: number }
export const DEFAULT_TURBINE: Turbine = { diameter: 100, rated: 2.5e6, cutIn: 3, cutOut: 25, cp: 0.45, rho: 1.225 };
/** Power (W) at wind speed v: ½ρAC_p v³ from cut-in, held at rated, nothing past cut-out. */
export const windPower = (t: Turbine, v: number) => (v < t.cutIn || v >= t.cutOut ? 0 : Math.min(t.rated, 0.5 * t.rho * Math.PI * (t.diameter / 2) ** 2 * t.cp * v ** 3));
/** ln Γ (Lanczos), for the Weibull mean. */
const gammaln = (x: number) => { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, s = 1.000000000190015; const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5); for (const c of g) s += c / ++y; return -t + Math.log((2.5066282746310005 * s) / x); };
/** A year's energy (MWh) and capacity factor over Weibull winds of shape k and scale c (m/s); the mean wind too. */
export function windYear(t: Turbine, k: number, c: number) {
  const pdf = (v: number) => (k / c) * (v / c) ** (k - 1) * Math.exp(-((v / c) ** k));
  let mean = 0;
  const dv = 0.01;
  for (let v = dv / 2; v < 40; v += dv) mean += windPower(t, v) * pdf(v) * dv;
  return { aepMWh: (mean * 8760) / 1e6, capacityFactor: mean / t.rated, meanWind: c * Math.exp(gammaln(1 + 1 / k)) };
}
