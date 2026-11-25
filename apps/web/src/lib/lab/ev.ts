// Hyperion's electric vehicles (M488), pure: an electric car driven along a speed profile (backward-facing, as range
// is worked out): the force at the wheels, the motor's speed and torque through one gear, its losses (copper, iron,
// friction and windage, the inverter's), the battery pack as its cells' open-circuit voltage against charge with an
// internal resistance, regenerative braking (as much as the motor can take, the friction brakes the rest), the
// accessories (heating, air conditioning). Also the motor's efficiency map, the most torque and power it can give, and
// a fast charge in constant current then constant voltage. The drive profiles are made-up city, suburban and motorway
// profiles in the manner of the standard test cycles, not the official tables.

export interface Ev {
  /** The car: mass (kg, with a driver), drag coefficient, frontal area (m²), rolling resistance, wheel radius (m). */
  m: number; cd: number; area: number; crr: number; rw: number;
  /** One gear's ratio; the motor's most torque (N·m), most power (W) and top speed (rad/s). */
  gear: number; tmax: number; pmax: number; wmax: number;
  /** Motor losses: copper (W per (N·m)²), iron (W per rad/s), friction and windage (W per (rad/s)³), standing (W). */
  kc: number; ki: number; kw: number; k0: number;
  /** The pack: cells in series and parallel, each cell's capacity (Ah) and resistance (Ω). */
  series: number; parallel: number; cellAh: number; cellR: number;
  /** Regenerative braking (the share of braking the motor may take, 0–1) and its most power (W); the gearbox's
   * efficiency; accessories (W). */
  regen: number; regenMax: number; gearEff: number; aux: number;
}
/** A compact five-seater: 1,800 kg, 96 s × 46 p NMC cells of 4.8 Ah (about 77 kWh), a 150 kW motor through 9:1. */
export const EV_DEFAULT: Ev = { m: 1800, cd: 0.27, area: 2.3, crr: 0.009, rw: 0.33, gear: 9, tmax: 310, pmax: 150e3, wmax: 1650, kc: 0.1, ki: 1.5, kw: 2e-7, k0: 300, series: 96, parallel: 46, cellAh: 4.8, cellR: 0.03, regen: 1, regenMax: 60e3, gearEff: 0.97, aux: 400 };
export const G = 9.81, RHO = 1.2;

/** An NMC cell's open-circuit voltage against state of charge (a typical curve, 3.0 V empty to 4.2 V full). */
const OCV_SOC = [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const OCV_V = [3.0, 3.35, 3.46, 3.57, 3.63, 3.68, 3.74, 3.82, 3.91, 4.0, 4.09, 4.2];
export function ocv(soc: number) {
  const s = Math.max(0, Math.min(1, soc));
  let i = 0;
  while (i < OCV_SOC.length - 2 && s > OCV_SOC[i + 1]) i++;
  return OCV_V[i] + ((OCV_V[i + 1] - OCV_V[i]) * (s - OCV_SOC[i])) / (OCV_SOC[i + 1] - OCV_SOC[i]);
}
export const packKwh = (e: Ev) => (e.series * e.parallel * e.cellAh * 3.7) / 1000;
const packR = (e: Ev) => (e.cellR * e.series) / e.parallel;

/** The most torque the motor gives at speed w (rad/s): its limit, then power over speed. */
export const torqueLimit = (e: Ev, w: number) => (w > e.wmax ? 0 : Math.min(e.tmax, e.pmax / Math.max(Math.abs(w), 1)));
/** The motor and inverter's losses (W) at torque T and speed w. */
export const motorLoss = (e: Ev, T: number, w: number) => e.kc * T * T + e.ki * Math.abs(w) + e.kw * Math.abs(w) ** 3 + e.k0;
/** Efficiency at a working point: mechanical over electrical when driving, electrical over mechanical when braking. */
export function efficiency(e: Ev, T: number, w: number) {
  const pm = T * w, loss = motorLoss(e, T, w);
  if (Math.abs(pm) < 1) return 0;
  return pm > 0 ? pm / (pm + loss) : Math.max(0, (-pm - loss) / -pm);
}

/** Battery current for a power drawn at the terminals (P = (Voc − I R) I; above the most it can give, the most). */
export function packCurrent(e: Ev, p: number, soc: number) {
  const v = ocv(soc) * e.series, R = packR(e), disc = v * v - 4 * R * p;
  return disc >= 0 ? (v - Math.sqrt(disc)) / (2 * R) : v / (2 * R);
}

export interface Cycle { name: string; t: number[]; v: number[] }
/** A made-up speed profile from (seconds, km/h) corners, every second, straight lines between. */
export function cycleFrom(name: string, pts: [number, number][]): Cycle {
  const t: number[] = [], v: number[] = [];
  for (let s = 0; s <= pts[pts.length - 1][0]; s++) {
    let i = 0;
    while (i < pts.length - 2 && s > pts[i + 1][0]) i++;
    const [t0, v0] = pts[i], [t1, v1] = pts[i + 1];
    t.push(s); v.push(((v0 + ((v1 - v0) * (s - t0)) / (t1 - t0 || 1)) / 3.6));
  }
  return { name, t, v };
}
/** A run of stops and starts: `n` hops to `top` km/h, each accelerating, cruising and stopping, with waits between. */
const hops = (start: number, n: number, top: number, up: number, cruise: number, down: number, wait: number): [number, number][] => {
  const out: [number, number][] = [];
  let t = start;
  for (let k = 0; k < n; k++) { const peak = top * (0.7 + 0.3 * ((k * 7) % 5) / 4); out.push([t, 0], [t + up, peak], [t + up + cruise, peak], [t + up + cruise + down, 0]); t += up + cruise + down + wait; }
  out.push([t, 0]);
  return out;
};
export const CYCLES: Record<string, () => Cycle> = {
  city: () => cycleFrom('city', hops(0, 10, 50, 10, 25, 8, 12)),
  suburban: () => cycleFrom('suburban', hops(0, 6, 80, 15, 60, 12, 10)),
  motorway: () => cycleFrom('motorway', [[0, 0], [30, 100], [300, 120], [330, 90], [500, 110], [700, 130], [760, 80], [790, 0], [800, 0]]),
  mixed: () => { const a = cycleFrom('', hops(0, 6, 50, 10, 25, 8, 12)), b = CYCLES.suburban(), c = CYCLES.motorway(); const t: number[] = [], v: number[] = []; for (const cy of [a, b, c]) { const off = t.length; cy.v.forEach((x, i) => { if (i || !off) { t.push(t.length); v.push(x); } }); } return { name: 'mixed', t, v }; },
};

export interface EvRun { t: number[]; v: number[]; soc: number[]; pbat: number[]; tm: number[]; wm: number[]; eff: number[]; whPerKm: number; km: number; regenWh: number; driveWh: number; frictionWh: number; range: number; missed: number }
/** Drives a profile (1 s steps, its speed between the samples) from `soc0`, `repeat` times. */
export function evSim(e: Ev, c: Cycle, o: { soc0?: number; repeat?: number; grade?: number } = {}): EvRun {
  const out: EvRun = { t: [], v: [], soc: [], pbat: [], tm: [], wm: [], eff: [], whPerKm: 0, km: 0, regenWh: 0, driveWh: 0, frictionWh: 0, range: 0, missed: 0 };
  let soc = o.soc0 ?? 0.9, dist = 0, used = 0, tt = 0;
  const cap = e.cellAh * e.parallel * 3600, grade = o.grade ?? 0;
  for (let r = 0; r < (o.repeat ?? 1); r++) for (let i = 0; i < c.t.length - 1; i++) {
    const dt = c.t[i + 1] - c.t[i], u = (c.v[i] + c.v[i + 1]) / 2, a = (c.v[i + 1] - c.v[i]) / dt;
    // Force at the wheels: speeding up, air, rolling, the slope.
    const F = e.m * a * 1.05 + 0.5 * RHO * e.cd * e.area * u * u + (u > 0.1 ? e.crr * e.m * G : 0) + e.m * G * Math.sin(grade);
    // Through the gearbox: driving needs more torque than reaches the wheels, braking returns less.
    const w = (u / e.rw) * e.gear, atWheel = (F * e.rw) / e.gear, want = atWheel >= 0 ? atWheel / e.gearEff : atWheel * e.gearEff, lim = torqueLimit(e, w);
    let T = Math.max(-lim, Math.min(lim, want));
    if (want > lim) out.missed++;
    let friction = 0;
    if (T < 0) {
      // Regeneration fades out below about 7 km/h and is capped in power; the friction brakes take the rest.
      const fade = Math.min(1, Math.max(0, (u - 1) / 1)), cap = w > 1 ? e.regenMax / w : 0;
      const take = Math.max(T * e.regen * fade, -cap);
      friction = (take - T) * w; T = take;
    }
    const pm = T * w, loss = u > 0.05 || T !== 0 ? motorLoss(e, T, w) : 0, pel = pm + loss + e.aux;
    const I = packCurrent(e, pel, soc), pbat = I * ocv(soc) * e.series;
    soc -= (I * dt) / cap;
    dist += u * dt; used += (pbat * dt) / 3600; tt += dt;
    if (pm < 0) out.regenWh += (-pm - loss > 0 ? -pm - loss : 0) * dt / 3600; else out.driveWh += (pm * dt) / 3600;
    out.frictionWh += (friction * dt) / 3600;
    out.t.push(tt); out.v.push(u); out.soc.push(soc); out.pbat.push(pbat); out.tm.push(T); out.wm.push(w); out.eff.push(efficiency(e, T, w));
  }
  out.km = dist / 1000; out.whPerKm = used / Math.max(out.km, 1e-6);
  out.range = (packKwh(e) * 1000 * 0.95) / Math.max(out.whPerKm, 1);
  return out;
}

/** A fast charge from `soc0`: constant current (the charger's power at the pack's voltage, at most `cRate`) until a cell
 * reaches 4.2 V, then that voltage held while the current falls; until `socEnd` or the current under C/20. */
export function evCharge(e: Ev, powerW: number, o: { soc0?: number; socEnd?: number; cRate?: number } = {}) {
  const dt = 5, cap = e.cellAh * e.parallel * 3600, R = packR(e), vmax = 4.2 * e.series, imax = (o.cRate ?? 2) * e.cellAh * e.parallel;
  let soc = o.soc0 ?? 0.1, t = 0, at80 = NaN;
  const out = { t: [0], soc: [soc], p: [0], i: [0] };
  while (soc < (o.socEnd ?? 1) && t < 6 * 3600) {
    const voc = ocv(soc) * e.series;
    // Constant current: limited by the charger's power and the C-rate; constant voltage once the terminal hits 4.2 V a cell.
    // The charger's power at the terminals: P = I (Voc + I R).
    let I = Math.min(imax, (-voc + Math.sqrt(voc * voc + 4 * R * powerW)) / (2 * R));
    if (voc + I * R > vmax) I = Math.max(0, (vmax - voc) / R);
    if (I < (e.cellAh * e.parallel) / 20) break;
    soc += (I * dt) / cap; t += dt;
    if (Number.isNaN(at80) && soc >= 0.8) at80 = t;
    out.t.push(t); out.soc.push(soc); out.p.push(I * (voc + I * R)); out.i.push(I);
  }
  return { ...out, to80: at80, end: t };
}
