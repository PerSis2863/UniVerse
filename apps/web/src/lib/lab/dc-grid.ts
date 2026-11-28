// Hyperion's data centres on the grid (M572, "Utility regulators and operators"): what a hyperscale load does to the
// network it joins. The voltage at the point of connection from the exact two-bus solution (with an on-load tap
// changer stepping after a delay), how much load a connection can host before the voltage sags or the power transfer
// reaches its nose, the system's frequency after the load steps or trips (inertia, damping, governors with their lag,
// and a battery's fast response if there is one: the low-order system frequency response model), the harmonics that
// rectifiers inject and the voltage distortion they cause through the source and any capacitor bank (with the
// resonance it makes), judged against IEEE 519's limits, and whether a voltage sag is one the IT equipment rides
// through (the ITIC curve). Our own code from the textbook relations; per unit unless said. Pure.

/** The receiving-end voltage (pu) when a load P + jQ (pu) is fed from Vs through R + jX: the larger root of
 * V⁴ − (Vs² − 2(PR + QX))V² + (P² + Q²)(R² + X²) = 0, NaN past the nose (voltage collapse). */
export function receivingVoltage(P: number, Q: number, Vs: number, R: number, X: number) {
  const b = Vs * Vs - 2 * (P * R + Q * X), disc = b * b - 4 * (P * P + Q * Q) * (R * R + X * X);
  return disc < 0 ? NaN : Math.sqrt((b + Math.sqrt(disc)) / 2);
}
export interface Tap { step: number; band: number; delay: number; min: number; max: number }
export const TAP: Tap = { step: 0.00625, band: 0.01, delay: 30, min: -16, max: 16 };
/** The voltage over a load series (one sample every dt s) with a tap changer holding 1 pu: it steps one tap when the
 * voltage has stayed outside the band for `delay` s, then waits again. The tap raises the voltage by `step` a tap. */
export function voltageSeries(P: number[], Q: number[], Vs: number, R: number, X: number, dt: number, tap?: Tap) {
  const V: number[] = [], taps: number[] = [];
  let n = 0, out = 0;
  for (let i = 0; i < P.length; i++) {
    const v = receivingVoltage(P[i], Q[i], Vs, R, X) * (1 + (tap ? n * tap.step : 0));
    if (tap && Number.isFinite(v) && Math.abs(v - 1) > tap.band) {
      out += dt;
      if (out >= tap.delay) { n = Math.max(tap.min, Math.min(tap.max, n + (v < 1 ? 1 : -1))); out = 0; }
    } else out = 0;
    V.push(v); taps.push(n);
  }
  return { V, taps };
}
/** The most load (pu) at power factor pf a connection hosts with V ≥ vmin and P ≤ limit, and the nose (the most it
 * could transfer at all). */
export function hostingCapacity(Vs: number, R: number, X: number, pf: number, vmin: number, limit = Infinity) {
  const tq = Math.sqrt(1 - pf * pf) / pf, V = (P: number) => receivingVoltage(P, P * tq, Vs, R, X);
  let lo = 0, hi = 1;
  while (Number.isFinite(V(hi)) && hi < 1e6) hi *= 2;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (Number.isFinite(V(m))) lo = m; else hi = m; }
  const nose = lo;
  let a = 0, b = nose;
  if (V(nose) >= vmin) a = nose; else for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (V(m) >= vmin) a = m; else b = m; }
  return { capacity: Math.min(a, limit), nose, voltageAtNose: V(nose), limitedBy: limit < a ? 'thermal' : a < nose ? 'voltage' : 'nose' };
}

export interface Sfr { H: number; D: number; R: number; Tg: number; f0: number; battery: number; tb: number; reserve: number }
export const SFR: Sfr = { H: 4, D: 1, R: 0.05, Tg: 6, f0: 50, battery: 0, tb: 0.1, reserve: Infinity };
/** The system frequency after load changes dPL(t) (pu of the system's rating, + more load): 2H dΔf/dt = ΔPm + ΔPb −
 * ΔPL − DΔf; governors Tg dΔPm/dt = −Δf/R − ΔPm (their output at most `reserve`); a battery tb dΔPb/dt = −Δf/0.01 ·
 * battery − ΔPb, held within ±battery. Δf in Hz. RK4 at dt/… steps, reported at the given times. */
export function frequencyResponse(t: number[], dPL: number[], s: Sfr) {
  const df: number[] = [], pm: number[] = [], pb: number[] = [];
  let f = 0, m = 0, b = 0;
  const der = (x: number[], load: number) => {
    const [ff, mm, bb] = x;
    return [(mm + bb - load - s.D * ff) / (2 * s.H), (Math.min(s.reserve, Math.max(-s.reserve, -ff / s.R)) - mm) / s.Tg, s.battery > 0 ? (Math.max(-s.battery, Math.min(s.battery, (-ff / 0.01) * s.battery)) - bb) / s.tb : 0];
  };
  for (let i = 0; i < t.length; i++) {
    if (i > 0) {
      const span = t[i] - t[i - 1], n = Math.max(1, Math.ceil(span / Math.min(0.01, s.tb / 4))), h = span / n, load = dPL[i - 1];
      for (let k = 0; k < n; k++) {
        const y = [f, m, b], k1 = der(y, load), k2 = der(y.map((v, j) => v + (h / 2) * k1[j]), load), k3 = der(y.map((v, j) => v + (h / 2) * k2[j]), load), k4 = der(y.map((v, j) => v + h * k3[j]), load);
        [f, m, b] = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      }
    }
    df.push(f * s.f0); pm.push(m); pb.push(b);
  }
  let nadir = 0, at = 0, rocof = 0;
  for (let i = 0; i < df.length; i++) { if (Math.abs(df[i]) > Math.abs(nadir)) { nadir = df[i]; at = t[i]; } if (i) rocof = Math.max(rocof, Math.abs((df[i] - df[i - 1]) / (t[i] - t[i - 1]))); }
  return { df, pm, pb, nadir, nadirAt: at, rocof, settled: df[df.length - 1] };
}

/** Typical current harmonics (share of the fundamental) of rectifier front ends. */
export const RECTIFIERS: Record<string, [number, number][]> = {
  '6pulse': [[5, 0.35], [7, 0.12], [11, 0.075], [13, 0.05], [17, 0.035], [19, 0.03], [23, 0.02], [25, 0.02]],
  '12pulse': [[5, 0.025], [7, 0.015], [11, 0.075], [13, 0.05], [17, 0.006], [19, 0.005], [23, 0.02], [25, 0.02]],
  afe: [[5, 0.02], [7, 0.015], [11, 0.01], [13, 0.008], [17, 0.005], [19, 0.004], [23, 0.003], [25, 0.003]],
  pfc: [[3, 0.03], [5, 0.025], [7, 0.015], [9, 0.01], [11, 0.008], [13, 0.006]],
};
/** IEEE 519-2014's current distortion limit (TDD, %) by the short-circuit ratio Isc/IL (120 V to 69 kV), and the
 * voltage limits (THD and each harmonic, %) by the bus voltage. */
export const tddLimit = (ratio: number) => (ratio < 20 ? 5 : ratio < 50 ? 8 : ratio < 100 ? 12 : ratio < 1000 ? 15 : 20);
export const voltageLimits = (kV: number): [number, number] => (kV <= 1 ? [8, 5] : kV <= 69 ? [5, 3] : kV <= 161 ? [2.5, 1.5] : [1.5, 1]);

export interface Harm { load: number; kV: number; ssc: number; xr: number; cap: number; mix: Record<string, number>; demand: number; linear: number }
/** The harmonics a rectifier mix (shares of the load, MVA) injects at a bus of short-circuit level ssc (MVA, X/R xr)
 * with a capacitor bank of `cap` MVAr: each harmonic voltage is the current through the source (R√h + jhX) in parallel
 * with the bank (−jXc/h) and the resistance of the bus's linear load (`linear`, a share of the load: it damps the
 * resonance). THDv, TDD against the demand current, the parallel resonance's order √(ssc/cap), the limits
 * and whether they pass. Every order carries the mix's currents added in phase (the worst case). */
export function harmonics(h: Harm) {
  const orders = [...new Set(Object.keys(h.mix).filter((k) => h.mix[k] > 0).flatMap((k) => (RECTIFIERS[k] ?? []).map(([n]) => n)))].sort((a, b) => a - b);
  const base = h.load, I1 = 1;
  const xs = base / h.ssc, rs = xs / h.xr, xc = h.cap > 0 ? base / h.cap : Infinity;
  const Zmag = (n: number) => {
    const zr = rs * Math.sqrt(n), zi = n * xs;
    // admittances add: the source, the bank (j n/xc) and the linear load's resistance (damping)
    const d = zr * zr + zi * zi, gr = zr / d + (h.linear > 0 ? h.linear : 0), gi = -zi / d + (Number.isFinite(xc) ? n / xc : 0);
    return 1 / Math.hypot(gr, gi);
  };
  const Ih = orders.map((n) => Object.entries(h.mix).reduce((s, [k, w]) => s + w * ((RECTIFIERS[k] ?? []).find((x) => x[0] === n)?.[1] ?? 0), 0) * I1);
  const Vh = orders.map((n, i) => Ih[i] * Zmag(n) * 100);
  const thdv = Math.sqrt(Vh.reduce((s, v) => s + v * v, 0)), thdi = 100 * Math.sqrt(Ih.reduce((s, v) => s + v * v, 0));
  const demand = h.demand > 0 ? h.demand : 1, tdd = thdi / demand, ratio = h.ssc / (base * demand);
  const [vthd, vind] = voltageLimits(h.kV), tlim = tddLimit(ratio);
  return {
    orders, Ih: Ih.map((v) => v * 100), Vh, thdv, thdi, tdd, ratio, resonance: h.cap > 0 ? Math.sqrt(h.ssc / h.cap) : NaN,
    limits: { thdv: vthd, each: vind, tdd: tlim }, pass: thdv <= vthd && Vh.every((v) => v <= vind) && tdd <= tlim,
    scan: (n: number) => Zmag(n),
  };
}

/** Whether a voltage of v pu for `dur` s sits inside the ITIC (CBEMA) curve the IT equipment is meant to ride through. */
export function itic(v: number, dur: number) {
  const low = dur <= 0.02 ? 0 : dur <= 0.5 ? 0.7 : dur <= 10 ? 0.8 : 0.9;
  const high = dur <= 0.001 ? 2 : dur <= 0.003 ? 1.4 : dur <= 0.5 ? 1.2 : 1.1;
  return v >= low && v <= high;
}
/** The ITIC curve's lower and upper edges as polylines (s, pu) for drawing. */
export const ITIC_LOW: [number, number][] = [[1e-4, 0], [0.02, 0], [0.02, 0.7], [0.5, 0.7], [0.5, 0.8], [10, 0.8], [10, 0.9], [100, 0.9]];
export const ITIC_HIGH: [number, number][] = [[1e-4, 5], [0.001, 2], [0.003, 1.4], [0.003, 1.2], [0.5, 1.2], [0.5, 1.1], [100, 1.1]];
/** The sag at a bus fed through a source impedance zs when a fault occurs through zf from it (the voltage divider). */
export const sagDivider = (zs: number, zf: number) => zf / (zs + zf);
