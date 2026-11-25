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
  /** The tail's distance behind the wing (m, M489h); about 3 chords when not given. */
  lt?: number;
  /** The fin's centre of pressure above the roll axis (m, M489k); 0.9 when not given (a light aeroplane's). */
  zf?: number;
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

// ——— Rolling and yawing (M489b) ———
// The sideways motion about level trimmed flight, by the small-disturbance equations in stability axes (sideslip, roll
// rate, yaw rate, bank) with the bank's pull of gravity kept whole (sin φ) so steep turns work; heading and the ground
// track follow from them. The height and speed stay at the trim's: the extra lift a turn needs is not modelled.

/** Roll and yaw inertias and their product (kg·m²), the side-force, rolling- and yawing-moment derivatives (per
 * radian of sideslip, per non-dimensional roll and yaw rate pb/2V and rb/2V, per radian of aileron and rudder) and
 * the controls' travel (rad). */
export interface Lateral {
  ixx: number; izz: number; ixz: number;
  cyb: number; clb: number; cnb: number; clp: number; cnp: number; clr: number; cnr: number;
  clda: number; cnda: number; cydr: number; cldr: number; cndr: number; daMax: number; drMax: number;
}
/** Textbook-typical numbers for a light high-wing aeroplane (not any one maker's data). */
export const LAT_DEFAULT: Lateral = { ixx: 1285, izz: 2667, ixz: 0, cyb: -0.31, clb: -0.089, cnb: 0.065, clp: -0.47, cnp: -0.03, clr: 0.096, cnr: -0.099, clda: 0.178, cnda: -0.053, cydr: 0.187, cldr: 0.0147, cndr: -0.0657, daMax: (20 * Math.PI) / 180, drMax: (25 * Math.PI) / 180 };

export interface LState { beta: number; p: number; r: number; phi: number }
function latDeriv(ac: Aircraft, lat: Lateral, V: number, rho: number, s: LState, da: number, dr: number): LState {
  const qS = 0.5 * rho * V * V * ac.S, ph = (s.p * ac.b) / (2 * V), rh = (s.r * ac.b) / (2 * V);
  const Y = qS * (lat.cyb * s.beta + lat.cydr * dr);
  const Lm = qS * ac.b * (lat.clb * s.beta + lat.clp * ph + lat.clr * rh + lat.clda * da + lat.cldr * dr);
  const Nm = qS * ac.b * (lat.cnb * s.beta + lat.cnp * ph + lat.cnr * rh + lat.cnda * da + lat.cndr * dr);
  // [Ixx −Ixz; −Ixz Izz]·[ṗ; ṙ] = [L; N].
  const det = lat.ixx * lat.izz - lat.ixz * lat.ixz;
  return { beta: Y / (ac.m * V) + (G0 / V) * Math.sin(s.phi) - s.r, p: (lat.izz * Lm + lat.ixz * Nm) / det, r: (lat.ixz * Lm + lat.ixx * Nm) / det, phi: s.p };
}
const latAdd = (a: LState, b: LState, k: number): LState => ({ beta: a.beta + k * b.beta, p: a.p + k * b.p, r: a.r + k * b.r, phi: a.phi + k * b.phi });

/** The sideways modes at speed V and height h: the Dutch roll (an oscillating pair), the roll (fast, real) and the
 * spiral (slow, real; unstable when its root is above 0: the aeroplane slowly tightens into a dive if left alone). */
export function lateralModes(ac: Aircraft, V: number, h: number, lat: Lateral = LAT_DEFAULT): Mode[] {
  const rho = isa(h).rho, keys: (keyof LState)[] = ['beta', 'p', 'r', 'phi'], A = new Float64Array(16), z: LState = { beta: 0, p: 0, r: 0, phi: 0 };
  keys.forEach((kj, j) => {
    const fp = latDeriv(ac, lat, V, rho, { ...z, [kj]: 1e-6 }, 0, 0), fm = latDeriv(ac, lat, V, rho, { ...z, [kj]: -1e-6 }, 0, 0);
    keys.forEach((ki, i) => { A[i + j * 4] = (fp[ki] - fm[ki]) / 2e-6; });
  });
  const { re, im } = eigvals(mat(4, 4, A));
  const all = re.map((r, i) => ({ re: r, im: Math.abs(im[i]) }));
  const osc = all.filter((p) => p.im > 1e-9).slice(0, 1), real = all.filter((p) => p.im <= 1e-9).sort((a, b) => Math.abs(b.re) - Math.abs(a.re));
  const mode = (name: string, p: { re: number; im: number }): Mode => {
    const wn = Math.hypot(p.re, p.im);
    return { name, re: p.re, im: p.im, period: p.im > 1e-9 ? (2 * Math.PI) / p.im : Infinity, damping: wn ? -p.re / wn : 0, halfTime: p.re < 0 ? Math.LN2 / -p.re : Infinity };
  };
  return [...osc.map((p) => mode('Dutch roll', p)), ...real.map((p, i) => mode(i === 0 ? 'roll' : i === real.length - 1 ? 'spiral' : 'real', p))];
}

export interface LateralRun { t: number[]; x: number[]; y: number[]; beta: number[]; p: number[]; r: number[]; phi: number[]; psi: number[]; da: number[]; dr: number[] }
/** Flies sideways from level trim at V and h for T seconds (10 ms steps): aileron and rudder (rad, functions of time;
 * + aileron rolls right, + rudder yaws left), or an autopilot holding a bank (rad) or a heading (rad, banking up to
 * `maxBank`), with a turn coordinator on the rudder; a yaw damper (washed out over 2 s so it doesn't fight turns). */
export function lateralSim(ac: Aircraft, T: number, o: { V?: number; h?: number; lat?: Lateral; aileron?: (t: number) => number; rudder?: (t: number) => number; holdBank?: (t: number) => number; holdHeading?: (t: number) => number; maxBank?: number; yawDamper?: boolean; beta0?: number; points?: number } = {}): LateralRun {
  const V = o.V ?? 50, rho = isa(o.h ?? 1000).rho, lat = o.lat ?? LAT_DEFAULT, dt = 0.01, n = Math.ceil(T / dt), every = Math.max(1, Math.floor(n / (o.points ?? 1500)));
  const maxBank = o.maxBank ?? (30 * Math.PI) / 180, clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));
  let s: LState = { beta: o.beta0 ?? 0, p: 0, r: 0, phi: 0 }, psi = 0, x = 0, y = 0, rLow = 0;
  const out: LateralRun = { t: [], x: [], y: [], beta: [], p: [], r: [], phi: [], psi: [], da: [], dr: [] };
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    let da = o.aileron ? o.aileron(t) : 0, dr = o.rudder ? o.rudder(t) : 0;
    const want = o.holdHeading ? clamp(1.2 * Math.atan2(Math.sin(o.holdHeading(t) - psi), Math.cos(o.holdHeading(t) - psi)), maxBank) : o.holdBank ? o.holdBank(t) : undefined;
    if (want !== undefined) { da += 1.5 * (want - s.phi) - 0.35 * s.p; dr += -1.5 * s.beta; }
    if (o.yawDamper) dr += 1.2 * (s.r - rLow);
    da = clamp(da, lat.daMax); dr = clamp(dr, lat.drMax);
    if (k % every === 0 || k === n) { out.t.push(t); out.x.push(x); out.y.push(y); out.beta.push(s.beta); out.p.push(s.p); out.r.push(s.r); out.phi.push(s.phi); out.psi.push(psi); out.da.push(da); out.dr.push(dr); }
    if (k === n) break;
    const f = (q: LState) => latDeriv(ac, lat, V, rho, q, da, dr);
    const k1 = f(s), k2 = f(latAdd(s, k1, dt / 2)), k3 = f(latAdd(s, k2, dt / 2)), k4 = f(latAdd(s, k3, dt));
    // The heading turns at r / cos φ (in a level turn r = ψ̇ cos φ); the ground track follows the heading plus slip.
    psi += (s.r / Math.max(0.2, Math.cos(s.phi))) * dt; x += V * Math.cos(psi - s.beta) * dt; y += V * Math.sin(psi - s.beta) * dt;
    rLow += ((s.r - rLow) * dt) / 2;
    s = { beta: s.beta + (dt / 6) * (k1.beta + 2 * k2.beta + 2 * k3.beta + k4.beta), p: s.p + (dt / 6) * (k1.p + 2 * k2.p + 2 * k3.p + k4.p), r: s.r + (dt / 6) * (k1.r + 2 * k2.r + 2 * k3.r + k4.r), phi: s.phi + (dt / 6) * (k1.phi + 2 * k2.phi + 2 * k3.phi + k4.phi) };
  }
  return out;
}

// ——— The whole aeroplane, six ways at once, and wind (M489c) ———
// A rigid body free in all six directions: body-axis velocities (u forward, v right, w down), rates (p roll, q pitch,
// r yaw), its attitude as a quaternion (no lock at a vertical climb), and where it is (north, east, height). The air's
// forces come from the velocity relative to the air, so wind, gusts and turbulence act through the angle of attack and
// sideslip they make: lift, drag and the pitching moment as in `flightSim`, the side force, rolling and yawing moments
// from the `Lateral` derivatives (written for stability axes; at a light aeroplane's small angles the body axes are
// near enough). Together they give what the separate runs leave out: a banked turn needs more lift, so it slows and
// sinks unless the pilot pulls and adds power.
export interface Wind {
  /** Steady wind, the air's velocity (m/s) north, east and down (a wind from the west blowing east is [0 5 0]). */
  steady?: [number, number, number];
  /** A '1 − cos' vertical gust: starting at `at` seconds, `length` metres long (flown through at the airspeed), up to
   * `up` m/s (+ up). */
  /** `skew` (M489g, rad): the gust's front at an angle to square across the path, + reaching the right wing first. */
  /** `tail` (M489h): the tail meets the gust lt / V after the wing, so the aeroplane pitches as it goes through. */
  gust?: { at: number; length: number; up: number; skew?: number; tail?: boolean };
  /** Dryden turbulence: its strength (m/s rms in each direction; about 1.5 light, 3 moderate, 6 severe), the length
   * scale (m, 533 at medium heights) and a seed so a run repeats. */
  /** `rotational` (M489f): the gusts turn the air too (MIL-F-8785C's p, q, r gusts over the wing and tail). */
  /** `tailLag` (M489i): the tail flies through the same vertical gusts lt / V after the wing (a real delay, not
   * MIL-F-8785C's smoothed pitch gust): the difference over lt pitches the aeroplane. */
  /** `finLag` (M489j): the fin meets the same side gusts lt / V after the wing, so the difference yaws the nose left
   * and right (in place of MIL-F-8785C's smoothed yaw gust). */
  /** `finRoll` (M489k, with `finLag`): the fin sits zf above the roll axis, so the side push that swings the nose also
   * rolls the aeroplane: L = −(zf / lt)·N from the fin. */
  turbulence?: { sigma: number; scale?: number; seed?: number; w20?: number; rotational?: boolean; tailLag?: boolean; finLag?: boolean; finRoll?: boolean };
  /** Wind shear with height (M489d): the steady wind is what blows at `ref` metres (10, where it's measured) and grows
   * as (h / ref)^exponent (1/7 over open country, about 0.25 over towns) up to 500 m, steady above. */
  shear?: { exponent?: number; ref?: number };
  /** A microburst (M489d): a column of air falling at up to `down` m/s at (n, e) metres, spreading out along the
   * ground at up to `outflow` m/s at `radius` metres from its centre. A simple shape, not Oseguera–Bowles: the outflow
   * grows with distance to the radius and dies away beyond, strongest near the ground (fading over 500 m), the
   * downdraught a bell of the same radius, slowing to nothing at the ground. */
  microburst?: { n: number; e: number; radius: number; outflow: number; down: number };
}
/** Turbulence by height (M489e, MIL-F-8785C's low-altitude model) for a wind of `w20` m/s at 6 m (20 ft): below 305 m
 * the eddies are smaller near the ground (scale h across, h/(0.177 + 0.000823·h)^1.2 along, h in feet) and the vertical
 * gusts weaker (0.1·W20; along and across 1/(0.177 + 0.000823·h)^0.4 times that); above 610 m the medium-height values
 * (533 m, all three 0.1·W20); between, a straight blend. Strength (m/s rms) and scale (m) along, across, down. */
export function turbulenceAt(h: number, w20: number) {
  const low = (hm: number) => {
    const ft = Math.max(10, hm / 0.3048), d = 0.177 + 0.000823 * ft, sw = 0.1 * w20;
    return { s: [sw / d ** 0.4, sw / d ** 0.4, sw], L: [(ft / d ** 1.2) * 0.3048, (ft / d ** 1.2) * 0.3048, ft * 0.3048] };
  };
  const med = { s: [0.1 * w20, 0.1 * w20, 0.1 * w20], L: [533, 533, 533] };
  if (h <= 305) return low(h);
  if (h >= 610) return med;
  const a = low(305), f = (h - 305) / 305;
  return { s: a.s.map((x, i) => x + (med.s[i] - x) * f), L: a.L.map((x, i) => x + (med.L[i] - x) * f) };
}
/** The air's velocity (m/s, north, east, down) from the steady wind with its shear and a microburst, at a place. */
export function windField(W: Wind, n: number, e: number, h: number): [number, number, number] {
  const st = W.steady ?? [0, 0, 0], sh = W.shear;
  const k = sh ? Math.pow(Math.max(0.5, Math.min(500, h)) / (sh.ref ?? 10), sh.exponent ?? 1 / 7) : 1;
  const out: [number, number, number] = [st[0] * k, st[1] * k, st[2]];
  const mb = W.microburst;
  if (mb) {
    const dn = n - mb.n, de = e - mb.e, r = Math.hypot(dn, de), R = mb.radius, x = r / R;
    const radial = mb.outflow * (x <= 1 ? x : Math.exp(1 - x * x) / x) * Math.exp(-Math.max(0, h) / 500);
    if (r > 1e-6) { out[0] += (radial * dn) / r; out[1] += (radial * de) / r; }
    out[2] += mb.down * Math.exp(-x * x) * Math.min(1, Math.max(0, h) / 100);
  }
  return out;
}
// Engines and propellers (M489d). One engine on the nose, or two `arm` metres either side, each giving its share of
// the thrust; one may fail at a time (its thrust gone, its windmilling propeller dragging unless feathered), which on a
// twin yaws the aeroplane towards the dead engine. A propeller turning clockwise seen from behind (`dir` 1, the usual)
// rolls the aeroplane the other way by its torque (shaft power / ω), its spiralling slipstream strikes the fin's left
// side and yaws the nose left (`slip`·T·fin arm), and at a high angle of attack the descending blade on the right
// pulls harder (the P-factor, `pf` m per radian of angle). Rough light-aeroplane figures, not any one design.
export interface Engines { count: 1 | 2; arm?: number; fail?: { at: number; which?: 0 | 1 }; feather?: boolean }
export interface Prop { dir: 1 | -1; rpm?: number; slip?: number; pf?: number; fin?: number; radius?: number; rigged?: boolean; inertia?: number }
interface Pw { working: [number, number]; count: 1 | 2; arm: number; feather: boolean; prop?: Prop; ref?: [number, number] }
/** The slowest speed (m/s) at which full rudder holds a twin's heading with one engine at full power and the other
 * windmilling (wings level; banking 5° towards the good engine, as pilots do, lowers it a little). NaN if none. */
export function vmc(ac: Aircraft, lat: Lateral = LAT_DEFAULT, arm = 1.8, h = 0, feather = false) {
  const need = (V: number) => { const q = 0.5 * isa(h).rho * V * V; return arm * (thrust(ac, V, h, 1) / 2 + (feather ? 0 : 0.1 * q * Math.PI * 0.9 ** 2)) - q * ac.S * ac.b * Math.abs(lat.cndr) * lat.drMax; };
  let lo = 5, hi = 150;
  if (need(lo) <= 0) return NaN;
  if (need(hi) > 0) return Infinity;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (need(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export interface F6State { n: number; e: number; h: number; u: number; v: number; w: number; p: number; q: number; r: number; q0: number; q1: number; q2: number; q3: number }
type Air = [number, number, number];
/** The body-to-earth rotation of a quaternion applied to a body vector, and its transpose. */
const toEarth = (s: F6State, x: Air): Air => {
  const { q0: a, q1: b, q2: c, q3: d } = s;
  return [
    (a * a + b * b - c * c - d * d) * x[0] + 2 * (b * c - a * d) * x[1] + 2 * (b * d + a * c) * x[2],
    2 * (b * c + a * d) * x[0] + (a * a - b * b + c * c - d * d) * x[1] + 2 * (c * d - a * b) * x[2],
    2 * (b * d - a * c) * x[0] + 2 * (c * d + a * b) * x[1] + (a * a - b * b - c * c + d * d) * x[2],
  ];
};
const toBody = (s: F6State, x: Air): Air => {
  const { q0: a, q1: b, q2: c, q3: d } = s;
  return [
    (a * a + b * b - c * c - d * d) * x[0] + 2 * (b * c + a * d) * x[1] + 2 * (b * d - a * c) * x[2],
    2 * (b * c - a * d) * x[0] + (a * a - b * b + c * c - d * d) * x[1] + 2 * (c * d + a * b) * x[2],
    2 * (b * d + a * c) * x[0] + 2 * (c * d - a * b) * x[1] + (a * a - b * b - c * c + d * d) * x[2],
  ];
};
/** Roll, pitch and yaw (rad) of a quaternion, and a quaternion of them. */
export const eulerOf = (s: F6State) => ({
  phi: Math.atan2(2 * (s.q0 * s.q1 + s.q2 * s.q3), 1 - 2 * (s.q1 * s.q1 + s.q2 * s.q2)),
  theta: Math.asin(Math.max(-1, Math.min(1, 2 * (s.q0 * s.q2 - s.q3 * s.q1)))),
  psi: Math.atan2(2 * (s.q0 * s.q3 + s.q1 * s.q2), 1 - 2 * (s.q2 * s.q2 + s.q3 * s.q3)),
});
export function quatOf(phi: number, theta: number, psi: number) {
  const [cf, sf, ct, st, cp, sp] = [Math.cos(phi / 2), Math.sin(phi / 2), Math.cos(theta / 2), Math.sin(theta / 2), Math.cos(psi / 2), Math.sin(psi / 2)];
  return { q0: cf * ct * cp + sf * st * sp, q1: sf * ct * cp - cf * st * sp, q2: cf * st * cp + sf * ct * sp, q3: cf * ct * sp - sf * st * cp };
}
interface Ctl { de: number; da: number; dr: number; thr: number; gust?: Air; fin?: { gr: number; ratio: number } }
const NO_PW: Pw = { working: [1, 1], count: 1, arm: 0, feather: false };
function deriv6(ac: Aircraft, lat: Lateral, s: F6State, c: Ctl, windE: Air, pw: Pw = NO_PW) {
  // The air's velocity in body axes, and the aeroplane's through it.
  const wb = toBody(s, windE), ur = s.u - wb[0], vr = s.v - wb[1], wr = s.w - wb[2], V = Math.hypot(ur, vr, wr) || 1e-6;
  const alpha = Math.atan2(wr, ur), beta = Math.asin(Math.max(-1, Math.min(1, vr / V))), rho = isa(s.h).rho, qS = 0.5 * rho * V * V * ac.S;
  // Turning gusts (M489f): the air itself rotating; the damping terms see the rates relative to it.
  const gp = c.gust?.[0] ?? 0, gq = c.gust?.[1] ?? 0, gr = c.gust?.[2] ?? 0, qa = s.q - gq;
  const cl = liftCoef(ac, alpha, c.de, (qa * ac.c) / (2 * V)), L = qS * cl, D = qS * dragCoef(ac, cl, alpha), Tall = thrust(ac, V, s.h, c.thr);
  const ph = ((s.p - gp) * ac.b) / (2 * V), rh = ((s.r - gr) * ac.b) / (2 * V);
  // Each engine's thrust (left, right on a twin), a dead one's windmilling drag, and the yaw and roll they make.
  const share = Tall / pw.count, Te = [share * pw.working[0], pw.count === 2 ? share * pw.working[1] : 0], qbar = 0.5 * rho * V * V;
  const R = pw.prop?.radius ?? (pw.count === 2 ? 0.9 : 0.95), mill = (i: number) => (pw.feather || pw.working[i] > 0 || (i === 1 && pw.count === 1) ? 0 : 0.1 * qbar * Math.PI * R * R);
  const T = Te[0] + Te[1] - mill(0) - mill(1);
  let gyM = 0, gyN = 0, Lp = 0, Np = pw.count === 2 ? pw.arm * (Te[0] - Te[1]) + pw.arm * (mill(1) - mill(0)) : 0;
  if (pw.prop) {
    const pr = pw.prop, omega = ((pr.rpm ?? 2400) * 2 * Math.PI) / 60, shaft = Math.max(0, c.thr) * powerAt(ac, s.h) / pw.count;
    for (let i = 0; i < pw.count; i++) {
      if (!pw.working[i]) continue;
      Lp += (-pr.dir * shaft) / omega;
      // Gyroscopic (M489e): the spinning propeller's angular momentum H = Ip·ω along the nose (dir 1 points it forward);
      // turning the aeroplane at (p, q, r) needs −(ω × H): pitching yaws it, yawing pitches it.
      const H = pr.dir * (pr.inertia ?? 1.6) * omega;
      gyM += -s.r * H; gyN += s.q * H;
      Np += -pr.dir * Te[i] * ((pr.slip ?? 0.015) * (pr.fin ?? 4.5) + (pr.pf ?? 0.25) * alpha);
    }
    // Rigged (the usual): the fin's offset and the wings' set cancel what the propeller does at the trimmed power, so
    // only the change from it is felt (more power, slower: a swing left).
    if (pw.ref) { Lp -= pw.ref[0]; Np -= pw.ref[1]; }
  }
  const Y = qS * (lat.cyb * beta + lat.cydr * c.dr);
  // The fin's own push from its delayed side gust (M489k): its yaw is cnr's share of the yaw gust; being zf above the
  // roll axis and lt behind, it rolls by −(zf / lt) of that yaw.
  const finL = c.fin ? -c.fin.ratio * qS * ac.b * lat.cnr * ((-c.fin.gr * ac.b) / (2 * V)) : 0;
  const Lm = qS * ac.b * (lat.clb * beta + lat.clp * ph + lat.clr * rh + lat.clda * c.da + lat.cldr * c.dr) + Lp + finL;
  const Mm = qS * ac.c * (ac.cm0 + ac.cma * alpha + ac.cmq * ((qa * ac.c) / (2 * V)) + ac.cmde * c.de) + gyM;
  const Nm = qS * ac.b * (lat.cnb * beta + lat.cnp * ph + lat.cnr * rh + lat.cnda * c.da + lat.cndr * c.dr) + Np + gyN;
  const g = toBody(s, [0, 0, G0]);
  const Fx = T + L * Math.sin(alpha) - D * Math.cos(alpha), Fz = -L * Math.cos(alpha) - D * Math.sin(alpha);
  const du = Fx / ac.m + g[0] + s.r * s.v - s.q * s.w, dv = Y / ac.m + g[1] + s.p * s.w - s.r * s.u, dw = Fz / ac.m + g[2] + s.q * s.u - s.p * s.v;
  // Euler's equations with the Ixz product: [Ixx −Ixz; −Ixz Izz]·[ṗ; ṙ] = [L + …; N + …].
  const { ixx, izz, ixz } = lat, iyy = ac.iyy;
  const l2 = Lm + ixz * s.p * s.q - (izz - iyy) * s.q * s.r, n2 = Nm - ixz * s.q * s.r - (iyy - ixx) * s.p * s.q, det = ixx * izz - ixz * ixz;
  const dp = (izz * l2 + ixz * n2) / det, dr = (ixz * l2 + ixx * n2) / det, dq = (Mm - (ixx - izz) * s.p * s.r - ixz * (s.p * s.p - s.r * s.r)) / iyy;
  const pos = toEarth(s, [s.u, s.v, s.w]);
  return {
    d: { n: pos[0], e: pos[1], h: -pos[2], u: du, v: dv, w: dw, p: dp, q: dq, r: dr, q0: -0.5 * (s.q1 * s.p + s.q2 * s.q + s.q3 * s.r), q1: 0.5 * (s.q0 * s.p + s.q2 * s.r - s.q3 * s.q), q2: 0.5 * (s.q0 * s.q + s.q3 * s.p - s.q1 * s.r), q3: 0.5 * (s.q0 * s.r + s.q1 * s.q - s.q2 * s.p) } as F6State,
    V, alpha, beta, nz: -Fz / (ac.m * G0),
  };
}
const KEYS6: (keyof F6State)[] = ['n', 'e', 'h', 'u', 'v', 'w', 'p', 'q', 'r', 'q0', 'q1', 'q2', 'q3'];
const add6 = (a: F6State, b: F6State, k: number) => Object.fromEntries(KEYS6.map((x) => [x, a[x] + k * b[x]])) as unknown as F6State;

/** A seeded random number generator (mulberry32) and normal numbers from it. */
function normals(seed: number) {
  let a = seed >>> 0 || 1;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

export interface Flight6Run {
  t: number[]; n: number[]; e: number[]; h: number[]; V: number[]; ground: number[]; alpha: number[]; beta: number[];
  phi: number[]; theta: number[]; psi: number[]; p: number[]; q: number[]; r: number[]; nz: number[]; wind: Air[];
  de: number[]; da: number[]; dr: number[]; thr: number[]; stalled: boolean; crashed: boolean;
}
/** Flies the whole aeroplane from level trim at V0 (airspeed) and h0, heading north, for T seconds (5 ms steps).
 * Controls added to the trim (elevator, aileron, rudder in rad; throttle), or the autopilots: height and speed as in
 * `flightSim`, a heading (rad, banking up to `maxBank`) with the turn coordinator as in `lateralSim`, a yaw damper. */
export function flight6(ac: Aircraft, T: number, o: {
  V0?: number; h0?: number; lat?: Lateral; wind?: Wind;
  elevator?: (t: number) => number; aileron?: (t: number) => number; rudder?: (t: number) => number; throttle?: (t: number) => number;
  holdHeight?: (t: number) => number; holdSpeed?: number; holdHeading?: (t: number) => number; maxBank?: number; yawDamper?: boolean; points?: number;
  engines?: Engines; prop?: Prop;
} = {}): Flight6Run {
  const lat = o.lat ?? LAT_DEFAULT, tr = trim(ac, o.V0 ?? 50, o.h0 ?? 1000), dt = 0.005, n = Math.ceil(T / dt), every = Math.max(1, Math.floor(n / (o.points ?? 1500)));
  const W = o.wind ?? {}, steady: Air = W.steady ?? [0, 0, 0], clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x)), maxBank = o.maxBank ?? (30 * Math.PI) / 180;
  // Starting in trim relative to the air: the ground velocity is the trim's plus the wind where it starts.
  let s: F6State = { n: 0, e: 0, h: tr.h, u: tr.state.u, v: 0, w: tr.state.w, p: 0, q: 0, r: 0, ...quatOf(0, tr.state.th, 0) };
  const wb0 = toBody(s, W.shear || W.microburst ? windField(W, 0, 0, tr.h) : steady);
  const eng = o.engines, pw: Pw = { working: [1, 1], count: eng?.count ?? 1, arm: eng?.arm ?? 1.8, feather: !!eng?.feather, prop: o.prop };
  if (o.prop && o.prop.rigged !== false) {
    const pr = o.prop, Tt = thrust(ac, tr.V, tr.h, tr.throttle), shaft = tr.throttle * powerAt(ac, tr.h);
    pw.ref = [(-pr.dir * shaft) / (((pr.rpm ?? 2400) * 2 * Math.PI) / 60), -pr.dir * Tt * ((pr.slip ?? 0.015) * (pr.fin ?? 4.5) + (pr.pf ?? 0.25) * tr.alpha)];
  }
  let betaI = 0;
  const pilotFix = !!(o.engines || o.prop);
  s = { ...s, u: s.u + wb0[0], v: s.v + wb0[1], w: s.w + wb0[2] };
  // Dryden turbulence, the MIL-F-8785C forms: each direction white noise through a first-order filter with time
  // constant L/V (the vertical one is near enough the same at this level of detail).
  const tb = W.turbulence, rnd = normals(tb?.seed ?? 1), Lt = tb?.scale ?? 533, turb: Air = [0, 0, 0];
  let iv = 0, rLow = 0, stalled = false, crashed = false, gustStart = NaN, lastT: Air = [0, 0, 0];
  const rotG: Air = [0, 0, 0];
  // The vertical gusts the wing met, kept for the tail (M489i).
  const lagN = tb?.tailLag || tb?.finLag ? Math.max(1, Math.round((ac.lt ?? 3 * ac.c) / tr.V / dt)) : 0, wHist: number[] = new Array(lagN).fill(0);
  // The side gusts the wing met, kept for the fin (M489j; the fin sits about where the tailplane does).
  const vHist: number[] = new Array(lagN).fill(0);
  let tailQ = 0, finR = 0;
  const out: Flight6Run = { t: [], n: [], e: [], h: [], V: [], ground: [], alpha: [], beta: [], phi: [], theta: [], psi: [], p: [], q: [], r: [], nz: [], wind: [], de: [], da: [], dr: [], thr: [], stalled: false, crashed: false };
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    // The wind now: steady, plus the gust (flown through at the airspeed), plus turbulence.
    // A front at an angle (M489g): each wing tip meets it (b/2)·tan(skew) earlier or later than the middle, so the air
    // rises more under one wing: the difference over the span is a roll gust (MIL-F-8785C's p_g = ∂w/∂y).
    // The tail behind (M489h): while the wing is in the rising air and the tail not yet, the air's change along the
    // aeroplane is a pitch gust q_g = (up_wing − up_tail) / lt (nose up), then the other way as the tail goes through.
    let up = 0, upRoll = 0, upPitch = 0;
    const ahead = W.gust?.skew ? (ac.b / 2) * Math.tan(W.gust.skew) : 0;
    if (W.gust && t >= W.gust.at - Math.abs(ahead) / tr.V) {
      if (Number.isNaN(gustStart)) gustStart = ahead ? W.gust.at : t;
      const into = (t - gustStart) * tr.V, gs = W.gust, at = (x: number) => (x >= 0 && x < gs.length ? (gs.up / 2) * (1 - Math.cos((2 * Math.PI * x) / gs.length)) : 0);
      const r = at(into + ahead), l = at(into - ahead);
      up = ahead ? (r + l) / 2 : at(into); upRoll = ahead ? (l - r) / ac.b : 0;
      if (gs.tail) { const lt = ac.lt ?? 3 * ac.c; upPitch = (up - at(into - lt)) / lt; }
    }
    if (tb && tb.w20) {
      // By height (M489e): each direction its own strength and scale where the aeroplane is now.
      const th2 = turbulenceAt(s.h, tb.w20);
      for (let i = 0; i < 3; i++) { const a = Math.exp((-tr.V * dt) / th2.L[i]), b = th2.s[i] * Math.sqrt(1 - a * a); turb[i] = a * turb[i] + b * rnd(); }
    } else if (tb && tb.sigma > 0) { const a = Math.exp((-tr.V * dt) / Lt), b = tb.sigma * Math.sqrt(1 - a * a); for (let i = 0; i < 3; i++) turb[i] = a * turb[i] + b * rnd(); }
    // Turning gusts (M489f, MIL-F-8785C): roll from its own noise over the span (σw·√(0.8/V)·(π/4b)^(1/6) / L^(1/3),
    // corner πV/4b), pitch and yaw from how fast the vertical and side gusts change along the aeroplane (÷ V), each
    // smoothed over the time it takes to fly its own span.
    if (tb?.rotational) {
      const Lw = tb.w20 ? turbulenceAt(s.h, tb.w20).L[2] : Lt, sw = tb.w20 ? turbulenceAt(s.h, tb.w20).s[2] : tb.sigma, b = ac.b, Vt = tr.V;
      const ap = Math.exp((-Math.PI * Vt * dt) / (4 * b)), sp = (sw * Math.sqrt(0.8 / Vt) * (Math.PI / (4 * b)) ** (1 / 6)) / Lw ** (1 / 3);
      rotG[0] = ap * rotG[0] + sp * Math.sqrt(1 - ap * ap) * rnd();
      const aq = Math.exp((-Math.PI * Vt * dt) / (4 * b)), ar = Math.exp((-Math.PI * Vt * dt) / (3 * b));
      rotG[1] = aq * rotG[1] + (1 - aq) * (-(turb[2] - lastT[2]) / dt / Vt);
      rotG[2] = ar * rotG[2] + (1 - ar) * ((turb[1] - lastT[1]) / dt / Vt);
      lastT = [turb[0], turb[1], turb[2]];
    }
    if (lagN) {
      const lt = ac.lt ?? 3 * ac.c, i = k % lagN;
      if (tb?.tailLag) {
        // The tail meets what the wing met lagN steps ago: q_g = (up_wing − up_tail) / lt with up = −w.
        tailQ = (wHist[i] - turb[2]) / lt; wHist[i] = turb[2];
        // It replaces the smoothed pitch gust (the same effect, now delayed for real).
        rotG[1] = 0;
      }
      if (tb?.finLag) {
        // The fin meets the side gust the wing met lagN steps ago: r_g = (v_wing − v_fin) / lt (the sign of M489f's
        // smoothed +v̇/V), which it replaces.
        finR = (turb[1] - vHist[i]) / lt; vHist[i] = turb[1];
        rotG[2] = 0;
      }
    }
    const base = W.shear || W.microburst ? windField(W, s.n, s.e, s.h) : steady;
    const wind: Air = [base[0] + turb[0], base[1] + turb[1], base[2] + turb[2] - up];
    if (eng?.fail && t >= eng.fail.at) pw.working = eng.count === 2 ? ((eng.fail.which ?? 1) === 0 ? [0, 1] : [1, 0]) : [0, 0];
    const e = eulerOf(s), f = deriv6(ac, lat, s, { de: 0, da: 0, dr: 0, thr: 0 }, wind, pw);
    let de = tr.de + (o.elevator ? o.elevator(t) : 0), thr = tr.throttle + (o.throttle ? o.throttle(t) : 0), da = o.aileron ? o.aileron(t) : 0, dr = o.rudder ? o.rudder(t) : 0;
    const hdot = f.d.h;
    if (o.holdHeight) {
      // As flightSim's, the pitch wanted raised by the turn's extra lift (1/cos φ − 1 of the trim's angle).
      const climb = clamp(0.12 * (o.holdHeight(t) - s.h), 5), turnLift = tr.alpha * (1 / Math.max(0.5, Math.cos(e.phi)) - 1);
      const thWant = tr.alpha + turnLift + clamp(0.03 * (climb - hdot) + climb / Math.max(f.V, 1), 0.25);
      // Pitch in the body is the pitch rate along the bank: q ≈ θ̇ / cos φ in a turn, so the error is taken in θ.
      de = tr.de + 2.0 * (e.theta - thWant) + 0.6 * s.q;
    }
    if (o.holdSpeed !== undefined) { const err = o.holdSpeed - f.V; iv += err * dt; thr = clamp(tr.throttle + 0.08 * err + 0.02 * iv, 1); }
    if (o.holdHeading) {
      const want = clamp(1.2 * Math.atan2(Math.sin(o.holdHeading(t) - e.psi), Math.cos(o.holdHeading(t) - e.psi)), maxBank); da += 1.5 * (want - e.phi) - 0.35 * s.p; dr += -1.5 * f.beta;
      // With engines or a propeller pushing it sideways the rudder must be held over: the sideslip's integral finds how
      // much (a pilot's "dead foot, dead engine").
      if (pilotFix) { betaI = clamp(betaI + f.beta * dt, 1); dr += -0.3 * betaI; }
    }
    if (o.yawDamper) dr += 1.2 * (s.r - rLow);
    de = clamp(de, ac.deMax); da = clamp(da, lat.daMax); dr = clamp(dr, lat.drMax); thr = Math.max(0, Math.min(1, thr));
    const c: Ctl = { de, da, dr, thr, gust: tb?.rotational || upRoll || upPitch || lagN ? [rotG[0] + upRoll, rotG[1] + upPitch + tailQ, rotG[2] + finR] : undefined, fin: tb?.finLag && tb.finRoll ? { gr: finR, ratio: (ac.zf ?? 0.9) / (ac.lt ?? 3 * ac.c) } : undefined }, g = deriv6(ac, lat, s, c, wind, pw);
    if (g.alpha > ac.alphaStall) stalled = true;
    if (k % every === 0 || k === n) {
      const pos = toEarth(s, [s.u, s.v, s.w]);
      out.t.push(t); out.n.push(s.n); out.e.push(s.e); out.h.push(s.h); out.V.push(g.V); out.ground.push(Math.hypot(pos[0], pos[1])); out.alpha.push(g.alpha); out.beta.push(g.beta);
      out.phi.push(e.phi); out.theta.push(e.theta); out.psi.push(e.psi); out.p.push(s.p); out.q.push(s.q); out.r.push(s.r); out.nz.push(g.nz); out.wind.push(wind);
      out.de.push(de); out.da.push(da); out.dr.push(dr); out.thr.push(thr);
    }
    if (k === n) break;
    if (s.h < 0) { crashed = true; break; }
    const k1 = g.d, k2 = deriv6(ac, lat, add6(s, k1, dt / 2), c, wind, pw).d, k3 = deriv6(ac, lat, add6(s, k2, dt / 2), c, wind, pw).d, k4 = deriv6(ac, lat, add6(s, k3, dt), c, wind, pw).d;
    s = Object.fromEntries(KEYS6.map((x) => [x, s[x] + (dt / 6) * (k1[x] + 2 * k2[x] + 2 * k3[x] + k4[x])])) as unknown as F6State;
    // Keep the quaternion a unit one.
    const qn = Math.hypot(s.q0, s.q1, s.q2, s.q3); s.q0 /= qn; s.q1 /= qn; s.q2 /= qn; s.q3 /= qn;
    rLow += ((s.r - rLow) * dt) / 2;
  }
  return { ...out, stalled, crashed };
}
