import { DEFAULT_MODULE, pvCurrent, type Module } from './energy';
import { averaged, pidtune } from './power';

// Hyperion's power electronics, part 3 (M565): controlling converters. Plain maths (power-lab.ts puts it in the
// language). Written from the textbook schemes:
//  • a buck switched cycle by cycle under voltage-mode control (a PI on the output's error sets the duty, a ramp
//    comparator makes the PWM) or peak-current-mode control (the outer PI sets a current, each cycle's switch opens when
//    the inductor current, less a compensating ramp, reaches it);
//  • a boost PFC stage under average-current control, averaged over each switching cycle, with its power factor and
//    current THD; MPPT by perturb-and-observe or incremental conductance on the single-diode panel model (energy.ts);
//  • space vector PWM; a grid-tied inverter's dq current control behind a synchronous-frame PLL; droop sharing.

export interface BuckCtl {
  mode: 'voltage' | 'current'; vin: number; vref: number; L: number; C: number; R: number; fsw: number;
  /** Load steps: at time t (s) the load becomes R (Ω). */
  steps: { t: number; R: number }[]; cycles: number; esr: number;
}
export const BUCK_CTL: BuckCtl = { mode: 'voltage', vin: 12, vref: 3.3, L: 4.7e-6, C: 100e-6, R: 1, fsw: 200e3, steps: [{ t: 1e-3, R: 0.5 }], cycles: 400, esr: 5e-3 };

/** A buck switched cycle by cycle (60 steps a cycle) under voltage- or peak-current-mode control. The gains come from
 *  pidtune on the converter's own averaged model: voltage mode, a PID at fsw/10 with 50° on the duty-to-output response;
 *  current mode, a PI at fsw/20 on the current-to-output response R/(1 + sRC). Slope compensation is half the
 *  inductor's falling slope, which keeps peak-current mode stable above 50 % duty. */
export function buckControl(p: BuckCtl) {
  const Ts = 1 / p.fsw, n = 60, dt = Ts / n, steps = [...p.steps].sort((a, b) => a.t - b.t);
  const wc = (2 * Math.PI * p.fsw) / (p.mode === 'voltage' ? 10 : 20);
  let g: { Kp: number; Ki: number; Kd: number };
  if (p.mode === 'voltage') {
    const m = averaged('buck', p.vin, p.vref, NaN, p.L, p.C, p.R, p.fsw, p.esr);
    g = pidtune(m.num, m.den, 'PID', wc, 50);
  } else g = pidtune([p.R * p.C * p.esr, p.R], [p.R * p.C, 1], 'PI', wc, 60);
  const se = (0.5 * p.vref) / p.L; // half the falling slope (A/s)
  let iL = 0, v = 0, R = p.R, integ = 0, prevErr = 0, dState = 0, k = 0;
  const N = p.cycles, t = new Float64Array(N), vo = new Float64Array(N), il = new Float64Array(N), duty = new Float64Array(N), ipk = new Float64Array(N);
  for (let c = 0; c < N; c++) {
    while (k < steps.length && steps[k].t <= c * Ts) R = steps[k++].R;
    // The controller samples once a cycle (a digital loop), at the cycle's start.
    const err = p.vref - v;
    integ += g.Ki * err * Ts;
    // The derivative through a first-order filter at 5·wc.
    const tf = 1 / (5 * wc);
    dState += ((err - prevErr) / Ts - dState) * (Ts / (tf + Ts));
    prevErr = err;
    let u = g.Kp * err + integ + g.Kd * dState;
    let d = 0, iref = 0;
    if (p.mode === 'voltage') {
      d = Math.min(0.95, Math.max(0, u));
      if (u !== d) integ -= g.Ki * err * Ts; // anti-windup: hold the integral while saturated
    } else {
      iref = Math.min(4 * (p.vref / Math.min(p.R, ...steps.map((s) => s.R))), Math.max(0, u));
      if (u !== iref) integ -= g.Ki * err * Ts;
      u = iref;
    }
    let on = true, peak = 0, tOn = 0;
    for (let s = 0; s < n; s++) {
      const ts = s * dt;
      if (p.mode === 'voltage') on = ts < d * Ts;
      else if (on && (iL >= iref - se * ts || ts >= 0.9 * Ts)) on = false;
      if (on) tOn += dt;
      const vl = (on ? p.vin : 0) - v;
      iL = Math.max(0, iL + (vl / p.L) * dt); // the diode (or the low switch emulating it) stops the current at zero
      const ic = iL - v / R;
      v += (ic / p.C) * dt;
      peak = Math.max(peak, iL);
    }
    t[c] = (c + 1) * Ts; vo[c] = v + p.esr * (iL - v / R); il[c] = iL; duty[c] = p.mode === 'voltage' ? d : tOn / Ts; ipk[c] = peak;
  }
  return { t, vout: vo, iL: il, duty, peak: ipk, gains: g };
}

/** Settling of a response to within ±band of its final value after time t0: the time from t0 and the largest dip. */
export function settle(t: ArrayLike<number>, y: ArrayLike<number>, t0: number, band: number) {
  const fin = y[y.length - 1];
  let last = t0, worst = 0;
  for (let i = 0; i < t.length; i++) if (t[i] >= t0) { if (Math.abs(y[i] - fin) > band) last = t[i]; worst = Math.max(worst, Math.abs(y[i] - fin)); }
  return { time: last - t0, deviation: worst };
}

// ——— PFC ———
export interface Pfc { vrms: number; fline: number; vout: number; L: number; C: number; P: number; fsw: number; cycles: number }
export const PFC: Pfc = { vrms: 230, fline: 50, vout: 400, L: 1e-3, C: 470e-6, P: 500, fsw: 65e3, cycles: 10 };
/** A boost PFC under average-current control, averaged over each switching period: the inner loop makes the inductor
 *  current follow the rectified line voltage scaled by the outer (slow, 10 Hz) voltage loop. The input current's power
 *  factor and THD over the last line cycle. */
export function pfcBoost(p: Pfc) {
  const R = (p.vout * p.vout) / p.P, dt = 1 / p.fsw, steps = Math.round((p.cycles / p.fline) * p.fsw);
  const vpk = Math.SQRT2 * p.vrms, wl = 2 * Math.PI * p.fline;
  // Inner current loop at fsw/10; outer voltage loop at 10 Hz (well under 2·fline so the 100 Hz ripple stays out).
  // Inner: the inductor seen as 1/(sL), crossing over at fsw/10 (volts per amp). Outer: the conductance asked moves the
  // input power, Pin = G·Vpk²/2, and C·V·dV/dt = Pin − Pout makes the plant Vpk²/(2·C·V·s), crossing over at 10 Hz.
  const wci = 2 * Math.PI * (p.fsw / 10), kpi = p.L * wci, kii = (kpi * wci) / 4;
  const wcv = 2 * Math.PI * 10, kpv = (wcv * 2 * p.C * p.vout) / (vpk * vpk), kiv = (kpv * wcv) / 4;
  let iL = 0, v = vpk, ii = 0, iv = (2 * p.P) / (vpk * vpk); // iv: the conductance the outer loop asks for
  const keep = Math.round(p.fsw / p.fline), vin: number[] = [], iin: number[] = [], vo: number[] = [];
  const out = { t: new Float64Array(steps), vout: new Float64Array(steps), iin: new Float64Array(steps), vac: new Float64Array(steps) };
  for (let k = 0; k < steps; k++) {
    const t = k * dt, vac = vpk * Math.sin(wl * t), vr = Math.abs(vac);
    // Outer loop: the conductance demand, updated each switching period but slow by its gains.
    const ev = p.vout - v;
    iv += kiv * ev * dt;
    const gdem = Math.max(0, iv + kpv * ev);
    const iref = gdem * vr;
    const ei = iref - iL;
    ii += kii * ei * dt;
    // The duty that makes the inductor's voltage what the PI asks, around the boost's own steady state.
    const d = Math.min(0.98, Math.max(0, 1 - (vr - (kpi * ei + ii)) / Math.max(v, 1)));
    iL = Math.max(0, iL + ((vr - (1 - d) * v) / p.L) * dt);
    v += (((1 - d) * iL - v / R) / p.C) * dt;
    out.t[k] = t; out.vout[k] = v; out.iin[k] = iL * Math.sign(vac); out.vac[k] = vac;
    if (k >= steps - keep) { vin.push(vac); iin.push(iL * Math.sign(vac)); vo.push(v); }
  }
  // Power factor = real power / (Vrms·Irms); THD from the line current's harmonics (2–40).
  const n = iin.length, prms = Math.sqrt(iin.reduce((s, x) => s + x * x, 0) / n), vrms = Math.sqrt(vin.reduce((s, x) => s + x * x, 0) / n);
  const preal = vin.reduce((s, x, i) => s + x * iin[i], 0) / n;
  const harm = (h: number) => { let a = 0, b = 0; iin.forEach((x, i) => { const ph = (2 * Math.PI * h * i) / n; a += x * Math.cos(ph); b += x * Math.sin(ph); }); return (2 / n) * Math.hypot(a, b); };
  const i1 = harm(1); let s2 = 0; for (let h = 2; h <= 40; h++) s2 += harm(h) ** 2;
  return { ...out, pf: preal / (vrms * prms), thd: Math.sqrt(s2) / i1, ripple: Math.max(...vo) - Math.min(...vo), vmean: vo.reduce((s, x) => s + x, 0) / vo.length };
}

// ——— MPPT ———
/** Maximum power point tracking on a panel (or string of `series` panels) as irradiance changes: each step the
 *  tracker moves its voltage by dv, perturb-and-observe ('po') or incremental conductance ('inccond'). The tracking
 *  efficiency is the energy taken over the energy available at the true maximum. */
export function mppt(method: 'po' | 'inccond', G: ArrayLike<number>, T: number, dv: number, m: Module = DEFAULT_MODULE, series = 1) {
  const N = G.length, v = new Float64Array(N), p = new Float64Array(N), pmax = new Float64Array(N);
  const pAt = (V: number, g: number) => { const I = Math.max(0, pvCurrent(m, V / series, g, T)); return { I, P: V * I }; };
  let V = 0.7 * m.voc * series, prevV = V - dv, prevP = pAt(prevV, G[0]).P, prevI = pAt(prevV, G[0]).I;
  for (let k = 0; k < N; k++) {
    const { I, P } = pAt(V, G[k]);
    v[k] = V; p[k] = P;
    // The true maximum, by golden-section search over the curve.
    let a = 0, b = m.voc * series * 1.1;
    for (let it = 0; it < 60; it++) { const c = b - (b - a) / 1.618, d = a + (b - a) / 1.618; if (pAt(c, G[k]).P > pAt(d, G[k]).P) b = d; else a = c; }
    pmax[k] = pAt((a + b) / 2, G[k]).P;
    const dV = V - prevV, dP = P - prevP, dI = I - prevI;
    let next = V;
    if (method === 'po') next = V + (dP === 0 ? dv : Math.sign(dP) * Math.sign(dV || 1) * dv);
    else {
      // dP/dV = I + V·dI/dV = 0 at the maximum: climb while it is above 0.
      if (Math.abs(dV) < 1e-12) next = V + (dI > 0 ? dv : dI < 0 ? -dv : 0);
      else { const slope = I + V * (dI / dV); next = V + (Math.abs(slope) < 1e-3 ? 0 : Math.sign(slope) * dv); }
    }
    prevV = V; prevP = P; prevI = I; V = Math.max(0, next);
  }
  const efficiency = p.reduce((s, x) => s + x, 0) / pmax.reduce((s, x) => s + x, 0);
  return { v, p, pmax, efficiency };
}

// ——— Space vector PWM ———
/** Phase duties (0…1) for a reference vector (vα, vβ) on a DC link Vdc by space vector modulation, by the equal
 *  min–max zero-sequence injection; the sector (1–6) too. Over-modulation is clipped. */
export function svpwm(va: number, vb: number, vdc: number) {
  const a = va, b = -0.5 * va + (Math.sqrt(3) / 2) * vb, c = -0.5 * va - (Math.sqrt(3) / 2) * vb;
  const off = -(Math.max(a, b, c) + Math.min(a, b, c)) / 2;
  const d = [a, b, c].map((x) => Math.min(1, Math.max(0, 0.5 + (x + off) / vdc)));
  const ang = Math.atan2(vb, va), sector = (((Math.floor(ang / (Math.PI / 3)) % 6) + 6) % 6) + 1;
  return { da: d[0], db: d[1], dc: d[2], sector };
}

// ——— A grid-tied inverter ———
export interface GridInv { vgrid: number; f: number; vdc: number; L: number; R: number; fsw: number; tEnd: number; steps: { t: number; P: number; Q: number }[] }
export const GRID_INV: GridInv = { vgrid: 400, f: 50, vdc: 700, L: 5e-3, R: 0.1, fsw: 10e3, tEnd: 0.2, steps: [{ t: 0, P: 5e3, Q: 0 }, { t: 0.1, P: 10e3, Q: 3e3 }] };
/** A three-phase inverter feeding the grid through an L filter, averaged over each switching period: a synchronous-
 *  frame PLL finds the grid's angle, dq current PIs with cross-coupling cancelled follow the P and Q asked (the d axis
 *  on the grid voltage), space vector PWM limits the voltage to the DC link. */
export function gridInverter(p: GridInv) {
  const dt = 1 / p.fsw, N = Math.round(p.tEnd / dt), w = 2 * Math.PI * p.f, vpk = (p.vgrid * Math.SQRT2) / Math.sqrt(3);
  const wcI = 2 * Math.PI * (p.fsw / 20), kp = p.L * wcI, ki = p.R * wcI;
  const wnP = 2 * Math.PI * 30, kpP = (2 * 0.707 * wnP) / vpk, kiP = (wnP * wnP) / vpk;
  let ia = 0, ib = 0, th = 0.3, wP = w, ipll = 0, xd = 0, xq = 0, k = 0;
  const steps = [...p.steps].sort((a, b) => a.t - b.t);
  let Pref = 0, Qref = 0;
  const out = { t: new Float64Array(N), P: new Float64Array(N), Q: new Float64Array(N), id: new Float64Array(N), iq: new Float64Array(N), ia: new Float64Array(N), angleErr: new Float64Array(N) };
  for (let n = 0; n < N; n++) {
    const t = n * dt;
    while (k < steps.length && steps[k].t <= t) { Pref = steps[k].P; Qref = steps[k].Q; k++; }
    const tg = w * t, ga = vpk * Math.cos(tg), gb = vpk * Math.sin(tg);
    // PLL: vq (in the estimated frame) driven to zero.
    const c = Math.cos(th), s = Math.sin(th), vd = c * ga + s * gb, vq = -s * ga + c * gb;
    ipll += kiP * vq * dt; wP = w + kpP * vq + ipll; th += wP * dt;
    // Currents in the frame; P = 1.5·vd·id, Q = −1.5·vd·iq.
    const id = c * ia + s * ib, iq = -s * ia + c * ib;
    const idRef = Pref / (1.5 * Math.max(vd, 1)), iqRef = -Qref / (1.5 * Math.max(vd, 1));
    const ed = idRef - id, eq = iqRef - iq;
    xd += ki * ed * dt; xq += ki * eq * dt;
    let ud = vd + kp * ed + xd - wP * p.L * iq, uq = vq + kp * eq + xq + wP * p.L * id;
    // The DC link limits the vector (SVPWM's linear range: Vdc/√3).
    const lim = p.vdc / Math.sqrt(3), mag = Math.hypot(ud, uq);
    if (mag > lim) { ud *= lim / mag; uq *= lim / mag; }
    const ua = c * ud - s * uq, ub = s * ud + c * uq;
    // Power at this instant (the currents and voltages of the same moment), then the filter's next step.
    out.t[n] = t; out.id[n] = id; out.iq[n] = iq; out.ia[n] = ia;
    out.P[n] = 1.5 * (ga * ia + gb * ib); out.Q[n] = 1.5 * (gb * ia - ga * ib);
    ia += ((ua - ga - p.R * ia) / p.L) * dt; ib += ((ub - gb - p.R * ib) / p.L) * dt;
    const tNext = tg + w * dt; // th is already the next step's angle
    out.angleErr[n] = Math.atan2(Math.sin(th - tNext), Math.cos(th - tNext));
  }
  return out;
}

// ——— Droop ———
/** Inverters sharing a load by frequency–power droop: each runs at f = f0 − mᵢ·Pᵢ, so in steady state all share one
 *  frequency and the load splits in inverse proportion to the droops; a unit at its limit holds there and the others
 *  take the rest. */
export function droopShare(load: number, m: number[], pmax: number[], f0 = 50) {
  const n = m.length, fixed = new Array(n).fill(false), P = new Array(n).fill(0);
  let f = f0;
  for (let it = 0; it <= n; it++) {
    const free = m.map((_, i) => i).filter((i) => !fixed[i]), rest = load - P.reduce((s, x, i) => s + (fixed[i] ? x : 0), 0);
    if (!free.length) { f = NaN; break; }
    f = f0 - rest / free.reduce((s, i) => s + 1 / m[i], 0);
    let clipped = false;
    for (const i of free) { P[i] = (f0 - f) / m[i]; if (P[i] > pmax[i]) { P[i] = pmax[i]; fixed[i] = true; clipped = true; } }
    if (!clipped) break;
  }
  return { f, P, overloaded: P.reduce((s, x) => s + x, 0) < load - 1e-9 };
}
