// Hyperion's flight dynamics (M489): the International Standard Atmosphere, and a light aeroplane's flight in its
// plane of symmetry (forward and vertical speed, pitch rate, pitch, distance and height) from its aerodynamic
// coefficients: lift with a stall, drag as a polar, the pitching moment with the elevator; the propeller's thrust from
// the engine's power. Trimmed level flight, the natural modes (short period and phugoid) from the linearised equations,
// an autopilot holding height and speed, and the performance numbers (stall speed, best glide, climb, ceiling, turns).

import { mat } from './values';
import { eigvals } from './complex';

// ——— The atmosphere ———
export const G0 = 9.80665, R_AIR = 287.05287, GAMMA = 1.4;
/** The International Standard Atmosphere up to 32 km (as MATLAB's atmosisa): temperature K, speed of sound m/s,
 * pressure Pa, density kg/m³. */
export function isa(h: number) {
  const hh = Math.max(0, Math.min(32000, h));
  let T: number, P: number;
  if (hh <= 11000) { T = 288.15 - 0.0065 * hh; P = 101325 * (T / 288.15) ** (G0 / (0.0065 * R_AIR)); }
  else if (hh <= 20000) { T = 216.65; P = 22632.06 * Math.exp((-G0 * (hh - 11000)) / (R_AIR * T)); }
  else { T = 216.65 + 0.001 * (hh - 20000); P = 5474.889 * (T / 216.65) ** (-G0 / (0.001 * R_AIR)); }
  return { T, a: Math.sqrt(GAMMA * R_AIR * T), P, rho: P / (R_AIR * T) };
}

// ——— The aeroplane ———
export interface Aircraft {
  /** Mass (kg), wing area (m²), mean chord (m), span (m), pitch inertia (kg·m²). */
  m: number; S: number; c: number; b: number; iyy: number;
  /** Lift: at zero angle, per radian of angle, per elevator radian, per pitch rate; the stall's angle (rad). */
  cl0: number; cla: number; clde: number; clq: number; alphaStall: number;
  /** Drag polar CD = CD0 + k·CL². Pitching moment: Cm0, per angle, per pitch rate, per elevator. */
  cd0: number; k: number; cm0: number; cma: number; cmq: number; cmde: number;
  /** Engine power at sea level (W), the propeller's efficiency, the most static thrust (N), the elevator's travel (rad). */
  power: number; eta: number; t0: number; deMax: number;
}
/** A light four-seat aeroplane with textbook-typical coefficients (not any one maker's data). */
export const PLANE_DEFAULT: Aircraft = { m: 1100, S: 16.2, c: 1.49, b: 11, iyy: 1825, cl0: 0.31, cla: 5.14, clde: 0.43, clq: 3.9, alphaStall: (16 * Math.PI) / 180, cd0: 0.031, k: 0.054, cm0: -0.015, cma: -0.89, cmq: -12.4, cmde: -1.28, power: 120e3, eta: 0.8, t0: 3000, deMax: (25 * Math.PI) / 180 };

/** The lift coefficient, falling away past the stall. */
export function liftCoef(ac: Aircraft, alpha: number, de = 0, qhat = 0) {
  const lin = ac.cl0 + ac.cla * alpha + ac.clde * de + ac.clq * qhat;
  if (alpha <= ac.alphaStall) return lin;
  const peak = ac.cl0 + ac.cla * ac.alphaStall + ac.clde * de + ac.clq * qhat, past = alpha - ac.alphaStall;
  return Math.max(0.55 * peak, peak - 3 * past);
}
const dragCoef = (ac: Aircraft, cl: number, alpha: number) => ac.cd0 + ac.k * cl * cl + (alpha > ac.alphaStall ? 1.8 * (alpha - ac.alphaStall) ** 2 + 0.4 * (alpha - ac.alphaStall) : 0);
/** Power falls with the air's density (Gagg and Ferrar): P/P₀ = 1.132σ − 0.132. */
const powerAt = (ac: Aircraft, h: number) => ac.power * Math.max(0, 1.132 * (isa(h).rho / 1.225) - 0.132);
/** Thrust at speed V and throttle 0–1: the propeller's power over speed, never above the static thrust. */
export const thrust = (ac: Aircraft, V: number, h: number, throttle: number) => throttle * Math.min(ac.t0, (ac.eta * powerAt(ac, h)) / Math.max(V, 1));

export interface FState { x: number; h: number; u: number; w: number; q: number; th: number }
function deriv(ac: Aircraft, s: FState, de: number, thr: number): FState & { alpha: number; V: number; cl: number } {
  const V = Math.hypot(s.u, s.w) || 1e-6, alpha = Math.atan2(s.w, s.u), rho = isa(s.h).rho, qbar = 0.5 * rho * V * V, qhat = (s.q * ac.c) / (2 * V);
  const cl = liftCoef(ac, alpha, de, qhat), L = qbar * ac.S * cl, D = qbar * ac.S * dragCoef(ac, cl, alpha), T = thrust(ac, V, s.h, thr);
  const Wt = ac.m * G0, M = qbar * ac.S * ac.c * (ac.cm0 + ac.cma * alpha + ac.cmq * qhat + ac.cmde * de);
  const Fx = T + L * Math.sin(alpha) - D * Math.cos(alpha) - Wt * Math.sin(s.th), Fz = -L * Math.cos(alpha) - D * Math.sin(alpha) + Wt * Math.cos(s.th);
  return { x: s.u * Math.cos(s.th) + s.w * Math.sin(s.th), h: s.u * Math.sin(s.th) - s.w * Math.cos(s.th), u: Fx / ac.m - s.q * s.w, w: Fz / ac.m + s.q * s.u, q: M / ac.iyy, th: s.q, alpha, V, cl };
}
const add = (a: FState, b: FState, k: number): FState => ({ x: a.x + k * b.x, h: a.h + k * b.h, u: a.u + k * b.u, w: a.w + k * b.w, q: a.q + k * b.q, th: a.th + k * b.th });
function rk4(ac: Aircraft, s: FState, de: number, thr: number, dt: number): FState {
  const k1 = deriv(ac, s, de, thr), k2 = deriv(ac, add(s, k1, dt / 2), de, thr), k3 = deriv(ac, add(s, k2, dt / 2), de, thr), k4 = deriv(ac, add(s, k3, dt), de, thr);
  const sum = (f: keyof FState) => k1[f] + 2 * k2[f] + 2 * k3[f] + k4[f];
  return { x: s.x + (dt / 6) * sum('x'), h: s.h + (dt / 6) * sum('h'), u: s.u + (dt / 6) * sum('u'), w: s.w + (dt / 6) * sum('w'), q: s.q + (dt / 6) * sum('q'), th: s.th + (dt / 6) * sum('th') };
}

export interface Trim { alpha: number; de: number; throttle: number; V: number; h: number; ok: boolean; state: FState }
/** Steady level flight at speed V and height h: the angle of attack, elevator and throttle (fails past the stall or
 * the engine's power). Pitch moment zero sets the elevator; lift and thrust balance the weight and drag. */
export function trim(ac: Aircraft, V: number, h: number): Trim {
  const rho = isa(h).rho, qbar = 0.5 * rho * V * V, W = ac.m * G0;
  let alpha = 0.05, de = 0, T = 0;
  for (let it = 0; it < 50; it++) {
    const cl = liftCoef(ac, alpha, de), D = qbar * ac.S * dragCoef(ac, cl, alpha);
    // With θ = α (level): Z: L cos α + D sin α = W cos α; X: T = D cos α − L sin α + W sin α.
    const Lneed = (W * Math.cos(alpha) - D * Math.sin(alpha)) / Math.cos(alpha), clNeed = Lneed / (qbar * ac.S);
    // Moment: Cm0 + Cmα α + Cmδe δe = 0; lift: CL0 + CLα α + CLδe δe = CL needed. Two equations, α and δe.
    const det = ac.cla * ac.cmde - ac.clde * ac.cma;
    alpha = ((clNeed - ac.cl0) * ac.cmde + ac.clde * ac.cm0) / det;
    de = (-ac.cm0 - ac.cma * alpha) / ac.cmde;
    T = D * Math.cos(alpha) - Lneed * Math.sin(alpha) + W * Math.sin(alpha);
  }
  const avail = thrust(ac, V, h, 1), throttle = T / (avail || 1);
  const ok = alpha < ac.alphaStall && throttle <= 1 && Math.abs(de) <= ac.deMax;
  return { alpha, de, throttle, V, h, ok, state: { x: 0, h, u: V * Math.cos(alpha), w: V * Math.sin(alpha), q: 0, th: alpha } };
}

export interface Mode { name: string; re: number; im: number; period: number; damping: number; halfTime: number }
/** The natural modes about a trim: the linearised [u w q θ] equations by central differences, their eigenvalues; the
 * faster pair is the short period, the slower the phugoid. */
export function modes(ac: Aircraft, tr: Trim): Mode[] {
  const keys: (keyof FState)[] = ['u', 'w', 'q', 'th'], A = new Float64Array(16), base = tr.state;
  keys.forEach((kj, j) => {
    const d = kj === 'u' || kj === 'w' ? 1e-3 : 1e-5, p = { ...base, [kj]: base[kj] + d }, m = { ...base, [kj]: base[kj] - d };
    const fp = deriv(ac, p, tr.de, tr.throttle), fm = deriv(ac, m, tr.de, tr.throttle);
    keys.forEach((ki, i) => { A[i + j * 4] = (fp[ki] - fm[ki]) / (2 * d); });
  });
  const { re, im } = eigvals(mat(4, 4, A));
  const pairs = re.map((r, i) => ({ re: r, im: Math.abs(im[i]) })).filter((p, i, all) => all.findIndex((q) => Math.abs(q.re - p.re) < 1e-9 && Math.abs(q.im - p.im) < 1e-9) === i);
  return pairs.sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im)).map((p, i) => {
    const wn = Math.hypot(p.re, p.im);
    return { name: p.im > 1e-9 ? (i === 0 ? 'short period' : 'phugoid') : 'real', re: p.re, im: p.im, period: p.im > 1e-9 ? (2 * Math.PI) / p.im : Infinity, damping: wn ? -p.re / wn : 0, halfTime: p.re < 0 ? Math.LN2 / -p.re : Infinity };
  });
}

export interface FlightRun { t: number[]; x: number[]; h: number[]; V: number[]; alpha: number[]; th: number[]; q: number[]; de: number[]; thr: number[]; stalled: boolean }
/** Flies from trim at V0 and h0 for T seconds (10 ms steps). Inputs added to the trim: elevator (rad, + pitches the nose
 * down) and throttle; or an autopilot holding a height (m, a function of time) and a speed (m/s). */
export function flightSim(ac: Aircraft, T: number, o: { V0?: number; h0?: number; elevator?: (t: number) => number; throttle?: (t: number) => number; holdHeight?: (t: number) => number; holdSpeed?: number; points?: number } = {}): FlightRun {
  const tr = trim(ac, o.V0 ?? 50, o.h0 ?? 1000), dt = 0.01, n = Math.ceil(T / dt), every = Math.max(1, Math.floor(n / (o.points ?? 1500)));
  let s = { ...tr.state }, iv = 0, stalled = false;
  const out: FlightRun = { t: [], x: [], h: [], V: [], alpha: [], th: [], q: [], de: [], thr: [], stalled: false };
  for (let k = 0; k <= n; k++) {
    const t = k * dt, V = Math.hypot(s.u, s.w), alpha = Math.atan2(s.w, s.u), hdot = s.u * Math.sin(s.th) - s.w * Math.cos(s.th);
    let de = tr.de + (o.elevator ? o.elevator(t) : 0), thr = tr.throttle + (o.throttle ? o.throttle(t) : 0);
    if (o.holdHeight) {
      // Height → a climb rate wanted → a pitch wanted → the elevator (pitch and its rate).
      const climb = Math.max(-5, Math.min(5, 0.12 * (o.holdHeight(t) - s.h))), thWant = tr.alpha + Math.max(-0.25, Math.min(0.25, 0.03 * (climb - hdot) + climb / Math.max(V, 1)));
      de = tr.de + 2.0 * (s.th - thWant) + 0.6 * s.q;
    }
    if (o.holdSpeed !== undefined) { const e = o.holdSpeed - V; iv += e * dt; thr = Math.max(0, Math.min(1, tr.throttle + 0.08 * e + 0.02 * iv)); }
    de = Math.max(-ac.deMax, Math.min(ac.deMax, de)); thr = Math.max(0, Math.min(1, thr));
    if (alpha > ac.alphaStall) stalled = true;
    if (k % every === 0 || k === n) { out.t.push(t); out.x.push(s.x); out.h.push(s.h); out.V.push(V); out.alpha.push(alpha); out.th.push(s.th); out.q.push(s.q); out.de.push(de); out.thr.push(thr); }
    if (k === n || s.h < 0) break;
    s = rk4(ac, s, de, thr, dt);
  }
  return { ...out, stalled };
}

// ——— Performance ———
const clMax = (ac: Aircraft) => ac.cl0 + ac.cla * ac.alphaStall;
/** Stall speed at a height (and load factor n). */
export const stallSpeed = (ac: Aircraft, h = 0, n = 1) => Math.sqrt((2 * n * ac.m * G0) / (isa(h).rho * ac.S * clMax(ac)));
/** The rate of climb at full power and speed V: (power available − power needed) / weight. */
export function climbRate(ac: Aircraft, V: number, h: number) {
  const rho = isa(h).rho, W = ac.m * G0, cl = (2 * W) / (rho * V * V * ac.S), D = 0.5 * rho * V * V * ac.S * (ac.cd0 + ac.k * cl * cl);
  return (thrust(ac, V, h, 1) * V - D * V) / W;
}
export function performance(ac: Aircraft, h = 0) {
  const W = ac.m * G0, rho = isa(h).rho, Vs = stallSpeed(ac, h), ldMax = 1 / (2 * Math.sqrt(ac.cd0 * ac.k)), Vglide = Math.sqrt(((2 * W) / (rho * ac.S)) * Math.sqrt(ac.k / ac.cd0));
  let Vy = Vs, best = -Infinity;
  for (let V = Vs * 1.05; V < 100; V += 0.25) { const rc = climbRate(ac, V, h); if (rc > best) { best = rc; Vy = V; } }
  // Top speed: where full thrust meets drag; service ceiling: where the best climb falls to 0.5 m/s.
  let Vmax = Vy;
  for (let V = Vy; V < 150; V += 0.1) { if (climbRate(ac, V, h) < 0) break; Vmax = V; }
  let ceiling = 0;
  for (let hh = 0; hh <= 12000; hh += 100) { let b = -Infinity; for (let V = stallSpeed(ac, hh) * 1.05; V < 120; V += 0.5) b = Math.max(b, climbRate(ac, V, hh)); if (b < 0.5) break; ceiling = hh; }
  return { stall: Vs, bestGlide: Vglide, glideRatio: ldMax, bestClimbSpeed: Vy, bestClimb: best, topSpeed: Vmax, ceiling };
}
/** A level turn at bank φ and speed V: load factor, radius and time round. */
export const turn = (V: number, bank: number) => ({ n: 1 / Math.cos(bank), radius: (V * V) / (G0 * Math.tan(bank)), time: (2 * Math.PI * V) / (G0 * Math.tan(bank)) });
