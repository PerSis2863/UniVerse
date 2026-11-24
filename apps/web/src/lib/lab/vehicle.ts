// Hyperion's vehicle dynamics (M486), pure. A car as the single-track ("bicycle") model with three degrees of freedom
// in the plane (forward and sideways speed, yaw rate) plus where it is: each axle's tyres as one, their side force from
// the slip angle by a linear law or Pacejka's Magic Formula with the grip shared with driving and braking (a friction
// ellipse), the axle loads shifting with acceleration, air drag, rolling resistance and the road's slope. Also the
// steady-state handling numbers (understeer gradient, yaw gain, characteristic or critical speed), straight-line
// acceleration limited by power and grip, top speed, and the standard steering tests (step, ramp, sine with dwell).

export interface Vehicle {
  /** Mass (kg), yaw inertia (kg·m²), centre of mass to front and rear axle (m), its height (m). */
  m: number; iz: number; lf: number; lr: number; h: number;
  /** Each axle's cornering stiffness (N/rad, both tyres together) at its static load. */
  cf: number; cr: number;
  /** Road grip, drag coefficient, frontal area (m²), rolling resistance, peak power (W), driven axle. */
  mu: number; cd: number; area: number; crr: number; power: number; drive: 'front' | 'rear' | 'all';
  /** The tyres' law and the most the front wheels turn (rad). */
  tyre: 'linear' | 'magic'; maxSteer: number;
  /** Body roll and the load moving across each axle (M486b); without it each axle is one tyre and nothing rolls. */
  roll?: Roll;
}
/** The body rolling on its springs: track (m), each axle's roll stiffness (N·m/rad, springs and anti-roll bar), the
 * roll damping (N·m·s/rad), the body's roll inertia (kg·m²), the roll axis' height (m), and how much a tyre's grip per
 * newton of load falls as the load grows (0–0.4; 0.15 is typical): what makes load transfer cost grip. */
export interface Roll {
  track: number; kf: number; kr: number; c: number; ix: number; hr: number; sens: number;
  /** Suspension geometry (M486c), all optional and 0 by default: how far each axle's wheels lean with the body against
   * the road per radian of roll (0 a beam axle keeping them upright, ~0.8 a MacPherson strut), the tyres' camber
   * stiffness as a share of their cornering stiffness (~0.1), and how far each axle steers per radian of roll (positive
   * adds understeer: the front turning out of the corner, the rear into it). */
  camber?: [number, number]; camberStiff?: number; rollSteer?: [number, number];
}
export const ROLL_DEFAULT: Roll = { track: 1.55, kf: 60000, kr: 40000, c: 5000, ix: 550, hr: 0.1, sens: 0.15 };
/** A mid-size saloon, rear-driven, slightly understeering. */
export const CAR_DEFAULT: Vehicle = { m: 1500, iz: 2500, lf: 1.2, lr: 1.5, h: 0.55, cf: 80000, cr: 95000, mu: 1, cd: 0.3, area: 2.2, crr: 0.012, power: 110e3, drive: 'rear', tyre: 'magic', maxSteer: 0.6 };
export const G = 9.81, RHO = 1.2;
const L = (v: Vehicle) => v.lf + v.lr;
/** Static axle loads (N). */
export const staticLoads = (v: Vehicle): [number, number] => [(v.m * G * v.lr) / L(v), (v.m * G * v.lf) / L(v)];

/** Pacejka's Magic Formula: F = D sin(C atan(Bx − E(Bx − atan Bx))). */
export const magic = (x: number, B: number, C: number, D: number, E: number) => D * Math.sin(C * Math.atan(B * x - E * (B * x - Math.atan(B * x))));
const MF_C = 1.3, MF_E = -0.6;
/** An axle's side force (N) at slip angle α with load fz and a driving or braking force fx already using some grip.
 * `share` 0.5 makes it one of the axle's two tyres. With a roll model the grip per newton falls as the load grows. */
export function sideForce(v: Vehicle, axle: 0 | 1, alpha: number, fz: number, fx = 0, share = 1) {
  const fz0 = staticLoads(v)[axle] * share, sens = Math.max(0.3, 1 - (v.roll?.sens ?? 0) * (fz / fz0 - 1));
  const c = (axle === 0 ? v.cf : v.cr) * share * (fz / fz0) * sens, peak = v.mu * fz * sens, room = Math.sqrt(Math.max(0, peak * peak - fx * fx));
  if (v.tyre === 'linear') return Math.max(-room, Math.min(room, c * alpha)) * (room > 0 ? 1 : 0) || 0;
  if (room <= 0) return 0;
  // B chosen so the slope at zero slip is the cornering stiffness (scaled by the grip left).
  const D = room, B = c / (MF_C * peak || 1);
  return magic(alpha, B, MF_C, D, MF_E);
}

/** phi (rad, leaning towards the right, so outwards in a left turn) and p (its rate) only move with a roll model. */
export interface VState { x: number; y: number; psi: number; vx: number; vy: number; r: number; phi?: number; p?: number }
export interface VInput { steer: number; force: number; grade?: number }
/** The forces on the car now: longitudinal force split to the axles (driving limited by power and grip, braking by
 * the loads), loads shifted by the last accelerations `ax` and (with roll) `ay`. */
function forces(v: Vehicle, s: VState, u: VInput, ax: number, ay = 0, tip = false) {
  const vx = Math.max(s.vx, 0.5), Lw = L(v), fzf = Math.max(0, (v.m * (G * v.lr - ax * v.h)) / Lw), fzr = Math.max(0, (v.m * (G * v.lf + ax * v.h)) / Lw);
  const d = Math.max(-v.maxSteer, Math.min(v.maxSteer, u.steer));
  let fxf = 0, fxr = 0;
  if (u.force >= 0) {
    const want = Math.min(u.force, v.power / vx);
    if (v.drive === 'front') fxf = Math.min(want, v.mu * fzf);
    else if (v.drive === 'rear') fxr = Math.min(want, v.mu * fzr);
    else { const k = fzf / (fzf + fzr || 1); fxf = Math.min(want * k, v.mu * fzf); fxr = Math.min(want * (1 - k), v.mu * fzr); }
  } else {
    // Braking shared by load (an ideal brake balance), never past the grip (as with ABS).
    const k = fzf / (fzf + fzr || 1);
    fxf = Math.max(u.force * k, -v.mu * fzf); fxr = Math.max(u.force * (1 - k), -v.mu * fzr);
  }
  const R = v.roll, phi0 = s.phi ?? 0;
  // Roll steer (M486c): each axle steers a little as the body rolls; camber turns into a slip angle's worth of thrust
  // (a wheel leaning out of the corner pushes outwards).
  const sF = -(R?.rollSteer?.[0] ?? 0) * phi0, sR = (R?.rollSteer?.[1] ?? 0) * phi0, cs = R?.camberStiff ?? 0;
  const af = d + sF - Math.atan2(s.vy + v.lf * s.r, vx) - cs * (R?.camber?.[0] ?? 0) * phi0, ar = sR - Math.atan2(s.vy - v.lr * s.r, vx) - cs * (R?.camber?.[1] ?? 0) * phi0;
  let fyf: number, fyr: number, dF = 0, dR = 0;
  if (R) {
    // Load across each axle (outer tyres gain dF, inner lose it): through the roll springs and damper as the body
    // leans, and straight through the roll centres. Each tyre then gives its own side force.
    const phi = s.phi ?? 0, p = s.p ?? 0, kk = R.kf + R.kr;
    dF = (R.kf * phi + (R.c * R.kf * p) / kk + (v.m * v.lr * ay * R.hr) / Lw) / R.track;
    dR = (R.kr * phi + (R.c * R.kr * p) / kk + (v.m * v.lf * ay * R.hr) / Lw) / R.track;
    // Tipped onto its outer wheels (M486c): they carry everything.
    if (tip) { dF = fzf / 2; dR = fzr / 2; }
    const two = (axle: 0 | 1, a: number, fz: number, fx: number, d: number) => sideForce(v, axle, a, Math.max(0, fz / 2 + d), fx / 2, 0.5) + sideForce(v, axle, a, Math.max(0, fz / 2 - d), fx / 2, 0.5);
    fyf = two(0, af, fzf, fxf, dF); fyr = two(1, ar, fzr, fxr, dR);
  } else { fyf = sideForce(v, 0, af, fzf, fxf); fyr = sideForce(v, 1, ar, fzr, fxr); }
  const drag = 0.5 * RHO * v.cd * v.area * s.vx * Math.abs(s.vx), roll = s.vx > 0.05 ? v.crr * v.m * G : 0, slope = v.m * G * Math.sin(u.grade ?? 0);
  const FX = fxf * Math.cos(d) - fyf * Math.sin(d) + fxr - drag - roll - slope, FY = fxf * Math.sin(d) + fyf * Math.cos(d) + fyr, MZ = v.lf * (fxf * Math.sin(d) + fyf * Math.cos(d)) - v.lr * fyr;
  // A wheel lifts when its share of the load is used up (the model then holds it at zero: it doesn't roll over).
  const lift = !!R && (fzf / 2 - Math.abs(dF) <= 0 || fzr / 2 - Math.abs(dR) <= 0);
  return { FX, FY, MZ, af, ar, fzf, fzr, fyf, fyr, d, lift };
}
function deriv(v: Vehicle, s: VState, u: VInput, ax: number, ay: number, tip = false): VState {
  const f = forces(v, s, u, ax, ay, tip), R = v.roll;
  // The body's roll: the side force acting at the centre of mass above the roll axis, gravity once it leans, against
  // the springs and the damper.
  const hs = v.h - (R?.hr ?? 0), phi = s.phi ?? 0, p = s.p ?? 0;
  const pd = R ? (v.m * (f.FY / v.m) * hs + v.m * G * hs * Math.sin(phi) - (R.kf + R.kr) * phi - R.c * p) / R.ix : 0;
  return {
    x: s.vx * Math.cos(s.psi) - s.vy * Math.sin(s.psi), y: s.vx * Math.sin(s.psi) + s.vy * Math.cos(s.psi), psi: s.r,
    vx: f.FX / v.m + s.vy * s.r, vy: f.FY / v.m - s.vx * s.r, r: f.MZ / v.iz, phi: R ? p : 0, p: pd,
  };
}
const addS = (a: VState, b: VState, k: number): VState => ({ x: a.x + k * b.x, y: a.y + k * b.y, psi: a.psi + k * b.psi, vx: a.vx + k * b.vx, vy: a.vy + k * b.vy, r: a.r + k * b.r, phi: (a.phi ?? 0) + k * (b.phi ?? 0), p: (a.p ?? 0) + k * (b.p ?? 0) });
/** One Runge–Kutta step; `ax` and `ay` the accelerations felt last step (for the load shifts). */
export function vehicleStep(v: Vehicle, s: VState, u: VInput, dt: number, ax = 0, ay = 0, tip = false): VState {
  const k1 = deriv(v, s, u, ax, ay, tip), k2 = deriv(v, addS(s, k1, dt / 2), u, ax, ay, tip), k3 = deriv(v, addS(s, k2, dt / 2), u, ax, ay, tip), k4 = deriv(v, addS(s, k3, dt), u, ax, ay, tip);
  const sum = (key: keyof VState) => (k1[key] ?? 0) + 2 * (k2[key] ?? 0) + 2 * (k3[key] ?? 0) + (k4[key] ?? 0);
  const n = addS(s, { x: sum('x'), y: sum('y'), psi: sum('psi'), vx: sum('vx'), vy: sum('vy'), r: sum('r'), phi: sum('phi'), p: sum('p') }, dt / 6);
  // It doesn't roll backwards on its own (braking to a stop stops).
  if (n.vx < 0 && s.vx >= 0 && u.force <= 0) { n.vx = 0; n.vy = 0; n.r = 0; }
  return n;
}

export interface VRun { t: number[]; x: number[]; y: number[]; psi: number[]; vx: number[]; vy: number[]; r: number[]; ay: number[]; ax: number[]; beta: number[]; steer: number[]; af: number[]; ar: number[]; roll: number[]; spun: boolean; lift: boolean; tip: number[]; rolled: number }
/** Drives the car: steering δ(t) at the wheels (rad), and either a speed to hold (a controller on the force) or a
 * force (N, negative brakes). 1 ms steps. A car whose body slip passes 15° or whose yaw turns past 1.5 rad/s past
 * what the steering asks is reported as spun. */
export function vehicleSim(v: Vehicle, steer: (t: number) => number, T: number, o: { speed?: number | ((t: number) => number); force?: (t: number) => number; v0?: number; grade?: (t: number) => number; points?: number } = {}): VRun {
  const dt = 1e-3, n = Math.ceil(T / dt), every = Math.max(1, Math.floor(n / (o.points ?? 1200)));
  const target = typeof o.speed === 'number' ? (() => o.speed as number) : o.speed;
  let s: VState = { x: 0, y: 0, psi: 0, vx: o.v0 ?? (typeof o.speed === 'number' ? o.speed : 0), vy: 0, r: 0, phi: 0, p: 0 }, ax = 0, ay = 0, spun = false, lift = false;
  const out: VRun = { t: [], x: [], y: [], psi: [], vx: [], vy: [], r: [], ay: [], ax: [], beta: [], steer: [], af: [], ar: [], roll: [], spun: false, lift: false, tip: [], rolled: NaN };
  // Tipping onto the outer wheels (M486c): the whole car turning about their contact line by θ, towards `side`.
  let th = 0, thd = 0, side = 0;
  const rec = (t: number, u: VInput, f: ReturnType<typeof forces>) => {
    out.t.push(t); out.x.push(s.x); out.y.push(s.y); out.psi.push(s.psi); out.vx.push(s.vx); out.vy.push(s.vy); out.r.push(s.r);
    out.ay.push(f.FY / v.m); out.ax.push(f.FX / v.m); out.beta.push(Math.atan2(s.vy, Math.max(s.vx, 0.1))); out.steer.push(u.steer); out.af.push(f.af); out.ar.push(f.ar); out.roll.push(s.phi ?? 0); out.tip.push(side * th);
  };
  for (let k = 0; k <= n; k++) {
    const t = k * dt, grade = o.grade ? o.grade(t) : 0;
    // Holding a speed: a firm P controller on the force (a driver keeping the pedal right), limited later by power and grip.
    const force = target ? v.m * 2 * (target(t) - s.vx) + 0.5 * RHO * v.cd * v.area * s.vx * s.vx + v.crr * v.m * G + v.m * G * Math.sin(grade) : o.force ? o.force(t) : 0;
    const u: VInput = { steer: steer(t), force, grade };
    const f = forces(v, s, u, ax, ay, th > 0);
    if (f.lift) lift = true;
    if (k % every === 0 || k === n) rec(t, u, f);
    if (Math.abs(Math.atan2(s.vy, Math.max(s.vx, 0.1))) > (15 * Math.PI) / 180) spun = true;
    if (k === n) break;
    ax = f.FX / v.m; ay = f.FY / v.m;
    s = vehicleStep(v, s, u, dt, ax, ay, th > 0);
    const R = v.roll;
    if (R) {
      // The moment about the outer wheels' contact line: the side force's (felt at the centre of mass, height H above
      // the line) against gravity's (D inwards of it). The body's own lean on its springs moves the centre outwards.
      if (th === 0) side = Math.sign(ay);
      const hs = v.h - R.hr, lean = Math.max(0, side * (s.phi ?? 0)), D = (R.track / 2) * Math.cos(th) - v.h * Math.sin(th) - hs * Math.sin(lean), H = (R.track / 2) * Math.sin(th) + v.h * Math.cos(th);
      const M = v.m * Math.max(0, side * ay) * H - v.m * G * D, io = R.ix + v.m * ((R.track / 2) ** 2 + v.h ** 2);
      if (th > 0 || M > 0) { thd += (M / io) * dt; th += thd * dt; if (th <= 0) { th = 0; thd = 0; } }
      // Past the point where the centre of mass is over the wheels, nothing brings it back: it rolls over.
      if (D < 0 && thd > 0) { out.rolled = t; rec(t + dt, u, f); break; }
    }
  }
  return { ...out, spun, lift };
}

// ——— Steady state ———
/** The understeer gradient K (rad per m/s² of side acceleration; above 0 understeers), the yaw-rate gain at a speed
 * (r/δ = u / (L + K u²)), and the characteristic speed (the most yaw gain, understeer) or critical speed (unstable past
 * it, oversteer). */
export function handling(v: Vehicle) {
  const [fzf, fzr] = staticLoads(v), K = (fzf / G) / v.cf - (fzr / G) / v.cr, Lw = L(v);
  return { K, characteristic: K > 0 ? Math.sqrt(Lw / K) : NaN, critical: K < 0 ? Math.sqrt(-Lw / K) : NaN, yawGain: (u: number) => u / (Lw + K * u * u), wheelbase: Lw };
}
/** The steady lean in a turn (rad per m/s² of side acceleration): m (h − hr) / (Kf + Kr − m g (h − hr)); NaN without
 * a roll model. Also the side acceleration at which an inner wheel would lift on a rigid body (t / 2h, in m/s²). */
export function rollGradient(v: Vehicle) {
  const R = v.roll;
  if (!R) return { gradient: NaN, liftAt: NaN };
  const hs = v.h - R.hr;
  return { gradient: (v.m * hs) / (R.kf + R.kr - v.m * G * hs), liftAt: (G * R.track) / (2 * v.h) };
}
/** The steady circle: steering needed for radius R at speed u (rad), by the linear model: δ = L/R + K u²/R. */
export const steerForCircle = (v: Vehicle, R: number, u: number) => L(v) / R + (handling(v).K * u * u) / R;

// ——— Straight-line performance ———
/** Full power from rest on a level road: time, speed and distance, limited by power, the driven axle's grip (with the
 * load moving back) and the drag. Also the top speed, where power meets the drag and rolling. */
export function accelRun(v: Vehicle, upTo = 100 / 3.6, T = 60) {
  const dt = 0.01, out = { t: [0], v: [0], d: [0] };
  let u = 0, d = 0, ax = 0, t = 0, reach = NaN;
  while (t < T) {
    const Lw = L(v), fzf = (v.m * (G * v.lr - ax * v.h)) / Lw, fzr = (v.m * (G * v.lf + ax * v.h)) / Lw;
    const grip = v.drive === 'front' ? v.mu * fzf : v.drive === 'rear' ? v.mu * fzr : v.mu * (fzf + fzr);
    const F = Math.min(v.power / Math.max(u, 1), grip) - 0.5 * RHO * v.cd * v.area * u * u - v.crr * v.m * G;
    ax = F / v.m; u = Math.max(0, u + ax * dt); d += u * dt; t += dt;
    out.t.push(t); out.v.push(u); out.d.push(d);
    if (Number.isNaN(reach) && u >= upTo) reach = t;
    if (!Number.isNaN(reach) && t > reach + 0.5 && u >= upTo) break;
  }
  // Top speed: P = (½ρCdA u² + Crr m g) u, solved by bisection.
  let lo = 0, hi = 200;
  for (let i = 0; i < 80; i++) { const m2 = (lo + hi) / 2; if ((0.5 * RHO * v.cd * v.area * m2 * m2 + v.crr * v.m * G) * m2 < v.power) lo = m2; else hi = m2; }
  return { ...out, time: reach, top: lo };
}
/** The shortest stop from speed u on a level road (all wheels at the grip limit, drag helping): distance and time. */
export function brakingDistance(v: Vehicle, u: number) {
  let s = 0, t = 0, w = u;
  const dt = 0.001;
  while (w > 0) { const a = v.mu * G + (0.5 * RHO * v.cd * v.area * w * w) / v.m + v.crr * G; w -= a * dt; s += Math.max(w, 0) * dt; t += dt; }
  return { distance: s, time: t };
}

// ——— The standard steering tests (at the wheels, rad) ———
/** A step of `amp` after `at` seconds, ramped over 0.15 s as a driver can. */
export const stepSteer = (amp: number, at = 0.5) => (t: number) => (t < at ? 0 : t < at + 0.15 ? (amp * (t - at)) / 0.15 : amp);
/** A slow ramp, `rate` rad/s, from `at` seconds (for the understeer curve). */
export const rampSteer = (rate: number, at = 0.5) => (t: number) => Math.max(0, (t - at) * rate);
/** The sine with dwell of the electronic-stability test (FMVSS 126 / UN R140): 0.7 Hz, a 0.5 s hold at the second
 * peak, starting at `at`. */
export function sineWithDwell(amp: number, at = 0.5, f = 0.7) {
  const w = 2 * Math.PI * f, t1 = 0.75 / f, dwell = 0.5;
  return (t: number) => {
    const s = t - at;
    if (s < 0) return 0;
    if (s < t1) return amp * Math.sin(w * s);
    if (s < t1 + dwell) return -amp;
    if (s < 1 / f + dwell) return amp * Math.sin(w * (s - dwell));
    return 0;
  };
}
/** The fishhook rollover test (NHTSA): to `amp` at `rate` rad/s (720°/s at the steering wheel is about 0.8 at the
 * wheels), held 0.25 s, then over to −amp at the same rate, held 3 s, then straight. */
export function fishhook(amp: number, at = 0.5, rate = 0.8) {
  const t1 = amp / rate, t2 = t1 + 0.25, t3 = t2 + (2 * amp) / rate, t4 = t3 + 3;
  return (t: number) => {
    const s = t - at;
    if (s < 0) return 0;
    if (s < t1) return rate * s;
    if (s < t2) return amp;
    if (s < t3) return amp - rate * (s - t2);
    return s < t4 ? -amp : 0;
  };
}
