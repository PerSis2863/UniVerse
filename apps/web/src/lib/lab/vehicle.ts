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
  /** The body's outline for tumbling (M486d): its roof's height (m, about 2.6 × the centre of mass's, at most it + 1.3)
   * and width (m, about 0.8 of the track). */
  roof?: number; roofWidth?: number;
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

export interface VRun { t: number[]; x: number[]; y: number[]; psi: number[]; vx: number[]; vy: number[]; r: number[]; ay: number[]; ax: number[]; beta: number[]; steer: number[]; af: number[]; ar: number[]; roll: number[]; spun: boolean; lift: boolean; tip: number[]; rolled: number; tumble?: Tumble }
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
      if (D < 0 && thd > 0) {
        out.rolled = t; rec(t + dt, u, f);
        // M486d: it goes on tumbling, sideways across the road, until it comes to rest. The tumble's +y is the way it
        // tips (away from the turn's centre, −side in the car's own y), starting on its outer wheels' contact line.
        const sh = shape(v), out2 = -side;
        out.tumble = tumble(v, { th, w: thd, vy: out2 * s.vy, vf: s.vx, r: out2 * s.r, pivot: [sh.t / 2, -v.h] });
        break;
      }
    }
  }
  return { ...out, spun, lift };
}

// ——— Tumbling and kerb trips (M486d) ———
// After it rolls over, the car is a rigid outline in the plane across it (its outer and inner wheels, its roof's two
// edges) falling, bouncing and sliding on the ground, while it slides on forwards: each corner below the ground pushes
// back by a stiff spring and damper (a crushed body and a bounce of about a fifth), and drags by friction against the
// way that corner slides (wheels and body each their own grip). It counts the quarter turns until it rests on its
// wheels, a side or its roof. A kerb trip: a car sliding sideways whose leading wheels hit a kerb stops there at once,
// pivoting on the kerb's edge: its angular momentum about that edge is kept, m·v·(h − kerb) = I_edge·ω, and if that
// lifts its centre of mass over the edge (½·I_edge·ω² ≥ m·g·rise) it goes over. Soft soil trips it the same way by
// the wheels' furrowing grip (`ground` grip 1.5). Not modelled: the roof crushing, the car's yaw while it tumbles.
export interface Ground { wheel: number; body: number; name: string }
export const GROUNDS: Record<string, Ground> = {
  tarmac: { wheel: 0.9, body: 0.45, name: 'tarmac' },
  grass: { wheel: 0.5, body: 0.35, name: 'grass' },
  soil: { wheel: 1.5, body: 0.6, name: 'soft soil' },
};
/** M486f: the roof's crush on each side over time (outer, inner), when each side's windows broke (NaN if not), the
 * most g the people inside felt, and the headroom left above their heads (m; below 0 the roof reached them). */
export interface Tumble { t: number[]; y: number[]; z: number[]; th: number[]; w: number[]; psi: number[]; crush: number; spin: number; crushes: [number, number][]; windows: [number, number]; peakG: number; headroom: number; frontG: number; frontAt: number; quarters: number; rests: 'wheels' | 'side' | 'roof'; slid: number; time: number; peakRate: number; tripped: boolean }
/** The outline across the car: track, roof height and width (m). */
export function shape(v: Vehicle) {
  const R = v.roll ?? ROLL_DEFAULT;
  return { t: R.track, roof: R.roof ?? Math.min(2.6 * v.h, v.h + 1.3), roofW: R.roofWidth ?? 0.8 * R.track, ix: R.ix + 0.1 * v.m * R.track * R.track / 4 };
}
/** Tumbles from a start: angle θ (rad, + towards +y), its rate, sideways and forward speed (m/s), and the point it's
 * pivoting on (body coordinates: across, up from the centre of mass), which is on the ground (at height `kerb` past
 * `kerbAt`). */
// M486e: the roof crushes, and the car turns as it tumbles. A roof edge pushed harder than the roof's strength (`swr`,
// its strength-to-weight ratio: FMVSS 216 asks 3 times the car's weight per side) gives way: the edge moves in as far
// as it is pushed past that, for good (the energy is spent), stiffening as it folds. The car's yaw rate goes on, slowed by the ground's
// friction across its length (about a quarter of it as the arm), and turning the car's own axes: sliding forwards
// becomes sliding sideways (more rolls) and back.
// M486f: a side's windows break when that side's roof edge takes more than 15 kN at once or the roof there folds more
// than 4 cm (the frame twists); the people inside sit with about 10 cm over their heads, and feel the body's
// acceleration from the ground's push (in g, without gravity's own 1 g).
export const HEADROOM = 0.1, GLASS_N = 15000, GLASS_CRUSH = 0.04;
/** M486h: front airbags fire on a blow along the car of about 20 km/h within 50 ms (~11 g). */
export const FRONT_G = 11;
export function tumble(v: Vehicle, st: { th: number; w: number; vy: number; vf: number; pivot: [number, number]; vz?: number; r?: number }, o: { ground?: Ground; kerb?: number; T?: number; swr?: number } = {}): Tumble {
  const sh = shape(v), gr = o.ground ?? GROUNDS.tarmac, kerb = o.kerb ?? 0, m = v.m, I = sh.ix, dt = 1e-4, T = o.T ?? 12;
  const Fy0 = (o.swr ?? 3) * m * G, arm = (v.lf + v.lr + 1.8) / 4, crushed = [0, 0];
  // The corners (across, up from the centre of mass): the outer and inner wheels, the roof's outer and inner edges
  // (the roof's last field: which side's crush moves it).
  const pts: [number, number, boolean, number][] = [[sh.t / 2, -v.h, true, -1], [-sh.t / 2, -v.h, true, -1], [sh.roofW / 2, sh.roof - v.h, false, 0], [-sh.roofW / 2, sh.roof - v.h, false, 1]];
  let r = st.r ?? 0, psi = 0;
  const rot = (a: number, b: number, th: number): [number, number] => [a * Math.cos(th) + b * Math.sin(th), -a * Math.sin(th) + b * Math.cos(th)];
  const pv = rot(st.pivot[0], st.pivot[1], st.th);
  // The centre of mass above the pivot on the ground; a kerb's ground is `kerb` high from the pivot on.
  // Its velocity: the slide given plus turning about the pivot.
  let y = -pv[0], z = kerb - pv[1], th = st.th, w = st.w, vy = st.vy + w * -pv[1], vz = (st.vz ?? 0) - w * -pv[0], vf = st.vf, still = 0;
  const kerbAt = kerb ? -0.05 : -Infinity, groundAt = (py: number) => (py >= kerbAt ? kerb : 0);
  const K = 4e6, C = 2 * 0.45 * Math.sqrt(K * m / 4);
  const out: Tumble = { t: [], y: [], z: [], th: [], w: [], psi: [], crush: 0, spin: 0, crushes: [], windows: [NaN, NaN], peakG: 0, headroom: HEADROOM, frontG: 0, frontAt: NaN, quarters: 0, rests: 'wheels', slid: 0, time: 0, peakRate: 0, tripped: false };
  const y0 = y;
  let fwd = 0;
  for (let k = 0; k * dt <= T; k++) {
    let Fy = 0, Fz = -m * G, tq = 0, Ff = 0, Ntot = 0;
    for (const [a, b0, wheel, side] of pts) {
      const b = side >= 0 ? b0 - crushed[side] : b0;
      const [ry, rz] = rot(a, b, th), py = y + ry, pz = z + rz, pen = groundAt(py) - pz;
      if (pen <= 0) continue;
      const vpy = vy + w * rz, vpz = vz - w * ry, mu = wheel ? gr.wheel : gr.body;
      let N = Math.max(0, K * pen - C * vpz);
      // The roof gives way past its strength: the edge sinks in until its spring holds just that (and no more is felt).
      // It stiffens as it folds (pillars and sills join in): the strength doubles every 10 cm of crush.
      const Fr = Fy0 * (1 + (side >= 0 ? crushed[side] : 0) / 0.1);
      if (side >= 0 && K * pen > Fr) { crushed[side] = Math.min(0.6 * sh.roof, crushed[side] + pen - Fr / K); N = Math.min(N, Fr); }
      else if (side >= 0) N = Math.min(N, Fr);
      // Side 0 is the outer side (the way it tips): wheel corners count for their side's glass too.
      const glassSide = side >= 0 ? side : a > 0 ? 0 : 1;
      if (Number.isNaN(out.windows[glassSide]) && ((side >= 0 && N > GLASS_N) || crushed[glassSide] > GLASS_CRUSH)) out.windows[glassSide] = k * dt;
      Ntot += N;
      // Friction against the corner's slide (forward and across), smoothed near a standstill.
      const sp = Math.hypot(vf, vpy), f = (mu * N) / Math.max(sp, 0.05);
      const fy = -f * vpy, ff = -f * vf;
      Fy += fy; Fz += N; Ff += ff; tq += fy * rz - N * ry;
    }
    if (k % 100 === 0) { out.t.push(k * dt); out.y.push(y - y0); out.z.push(z); out.th.push(th); out.w.push(w); out.psi.push(psi); out.crushes.push([crushed[0], crushed[1]]); }
    out.peakG = Math.max(out.peakG, Math.hypot(Fy, Fz + m * G, Ff) / (m * G));
    // M486h: the blow along the car (friction slowing its forward slide), smoothed over 30 ms as a crash sensor
    // sees it; front airbags fire past FRONT_G.
    fwd += ((-(Ff * Math.sign(vf)) / (m * G) - fwd) * dt) / 0.03;
    if (fwd > out.frontG) out.frontG = fwd;
    if (Number.isNaN(out.frontAt) && fwd > FRONT_G) out.frontAt = k * dt;
    out.peakRate = Math.max(out.peakRate, Math.abs(w));
    // Yaw: friction across the car's length slows it; the axes turning swap forward and sideways speed.
    const tz = (-gr.body * Ntot * arm * r) / Math.max(Math.abs(r), 0.05);
    vy += (Fy / m - r * vf) * dt; vz += (Fz / m) * dt; w += (tq / I) * dt; vf += (Ff / m + r * vy) * dt; r += (tz / v.iz) * dt;
    y += vy * dt; z += vz * dt; th += w * dt; psi += r * dt;
    still = Math.abs(w) < 0.05 && Math.hypot(vy, vz) < 0.1 && Math.abs(vf) < 0.2 && Math.abs(r) < 0.05 ? still + dt : 0;
    if (still > 0.5) break;
  }
  // Where it ended: the nearest quarter turn, and what it lies on.
  const q = Math.round(th / (Math.PI / 2)), qr = ((q % 4) + 4) % 4;
  out.quarters = Math.abs(q); out.rests = qr === 0 ? 'wheels' : qr === 2 ? 'roof' : 'side';
  out.slid = y - y0; out.time = out.t[out.t.length - 1]; out.tripped = out.quarters > 0; out.crush = Math.max(...crushed); out.spin = psi; out.headroom = HEADROOM - out.crush;
  return out;
}
/** The car sliding sideways at `vlat` (m/s) into a kerb `kerb` metres high (its leading wheels stop at the kerb's
 * edge), or across soft ground at no kerb: the tumble that follows. */
export function kerbTrip(v: Vehicle, vlat: number, kerb = 0.15, ground: Ground = GROUNDS.tarmac, o: { swr?: number; r?: number; vf?: number } = {}): Tumble {
  const sh = shape(v), hh = v.h - kerb;
  if (kerb <= 0) return tumble(v, { th: 0, w: 0, vy: vlat, vf: o.vf ?? 0, r: o.r, pivot: [sh.t / 2, -v.h] }, { ground, swr: o.swr });
  // The impact: angular momentum about the kerb's edge kept. Then it turns about the edge (gravity's moment m·g·(its
  // centre's offset across from the edge)) until it falls back or its centre passes over the edge.
  const Ie = sh.ix + v.m * ((sh.t / 2) ** 2 + hh * hh), dt = 1e-4;
  let phi = 0, w = (v.m * vlat * hh) / Ie, t = 0;
  // The blow at the kerb: the centre's speed changes from (v, 0) to ω·(h − kerb, track/2), over about 50 ms.
  const hitG = Math.hypot(vlat - w * hh, w * (sh.t / 2)) / 0.05 / G;
  const out: Tumble = { t: [], y: [], z: [], th: [], w: [], psi: [], crush: 0, spin: 0, crushes: [], windows: [NaN, NaN], peakG: 0, headroom: HEADROOM, frontG: 0, frontAt: NaN, quarters: 0, rests: 'wheels', slid: 0, time: 0, peakRate: Math.abs(w), tripped: false };
  for (let k = 0; t < 10; k++, t += dt) {
    const ry = -(sh.t / 2) * Math.cos(phi) + hh * Math.sin(phi), rz = (sh.t / 2) * Math.sin(phi) + hh * Math.cos(phi);
    if (k % 100 === 0) { out.t.push(t); out.y.push(ry); out.z.push(kerb + rz); out.th.push(phi); out.w.push(w); out.psi.push(0); out.crushes.push([0, 0]); }
    if (ry > 0) {
      // Over the edge: it tumbles on, from the kerb.
      const rest = tumble(v, { th: phi, w, vy: 0, vf: o.vf ?? 0, r: o.r, pivot: [sh.t / 2, -v.h] }, { ground, kerb, swr: o.swr });
      // y is the centre's place across, the kerb's edge at 0 (it started at −track/2).
      return { ...rest, t: [...out.t, ...rest.t.map((x) => x + t)], y: [...out.y, ...rest.y.map((x) => x + ry)], z: [...out.z, ...rest.z], th: [...out.th, ...rest.th], w: [...out.w, ...rest.w], psi: [...out.psi, ...rest.psi], crushes: [...out.crushes, ...rest.crushes], windows: [rest.windows[0] + t, rest.windows[1] + t], frontAt: rest.frontAt + t, peakG: Math.max(rest.peakG, hitG), time: rest.time + t, slid: rest.slid + ry + sh.t / 2, peakRate: Math.max(out.peakRate, rest.peakRate), tripped: true };
    }
    if (phi < 0) break;
    w += ((v.m * G * ry) / Ie) * dt; phi += w * dt;
  }
  // It fell back onto its wheels.
  out.time = t; out.peakG = hitG;
  return out;
}
/** The slowest sideways speed (m/s) at which a kerb `kerb` m high trips the car over: ½·I_edge·ω² = m·g·rise. */
export function tripSpeed(v: Vehicle, kerb = 0.15) {
  const sh = shape(v), hh = v.h - kerb, Ie = sh.ix + v.m * ((sh.t / 2) ** 2 + hh * hh), rise = Math.hypot(sh.t / 2, hh) - hh;
  return Math.sqrt((2 * G * rise * Ie) / v.m) / hh;
}

// M486g: the people inside, belted or not, with or without side curtain airbags (rough figures). Their heads sit about
// `HEADROOM` under the roof, `r` from the roll axis; each landing changes the roll rate at once, and the head keeps its
// speed for a moment: |Δω|·r into the side (a belt holds the body, so its head swings 0.6 of that). Upside down, an
// unbelted person falls through the headroom (and the seat's give) onto the roof; a belted one only if the crushing roof
// comes down to them. Stopped by glass or a pillar in 2 cm, the roof's lining 3 cm, a curtain airbag 10 cm: g = v²/2s.
// Thrown out: unbelted, through a broken side window (no curtain over it: curtains stay up 6 s, FMVSS 226) or a
// windscreen pulled from its frame, while still rolling fast enough (ω²·r over 1 g) to fling them; belted, only head and
// arms. The windscreen is laminated: it cracks as the pillars bend (3 cm of roof crush) and comes out of its frame past
// 15 cm; rolling flings people sideways, so it lets them out only when the car also turned over 90° as it tumbled. The
// roof's crush is taken as spread over its 0.1 s on the ground (the model's own crush is at once). Front airbags: see M486h below.
export const CURTAIN_HOLD = 6, SCREEN_CRACK = 0.03, SCREEN_OUT = 0.15;
export interface Inside { headSide: number; headRoof: number; headG: number; thrownOut: number; partly: boolean; screenCracked: number; screenOut: number; frontBags: number; headroom: number; risk: 'low' | 'serious' | 'severe' }
// M486h: a person's size (a small adult has ~6 cm more over their head and sits a little nearer the roll axis, a tall
// one ~6 cm less) and their seat: 'near', the side the car tips towards (its roof edge and windows take the first
// blows), or 'far' (the head swings across the car before anything stops it); no seat given takes the worse of the two
// sides. Front airbags fire if the blow along the car passes FRONT_G (rare in a rollover; the tumble records it).
export const SIZES = { small: 0.06, average: 0, tall: -0.06 } as const;
export function inside(v: Vehicle, tb: Tumble, o: { belt?: boolean; curtains?: boolean; size?: keyof typeof SIZES; seat?: 'near' | 'far' } = {}): Inside {
  const belt = o.belt ?? true, curt = o.curtains ?? false, sh = shape(v), room = HEADROOM + SIZES[o.size ?? 'average'];
  const side = o.seat === 'near' ? 0 : o.seat === 'far' ? 1 : -1, crushAt = (c: [number, number] | undefined) => (c ? (side >= 0 ? c[side as 0 | 1] : Math.max(...c)) : 0);
  const r = Math.max(0.3, sh.roof - v.h - room - 0.1);
  let dw = 0, crushRate = 0, inverted = false, screenCracked = NaN, screenOut = NaN;
  for (let i = 0; i < tb.t.length; i++) {
    const c = Math.max(...(tb.crushes[i] ?? [0, 0])), own = crushAt(tb.crushes[i]), dt = i ? tb.t[i] - tb.t[i - 1] : 0;
    // A landing's change in roll rate over 50 ms; the roof's crush spread over its 0.1 s on the ground.
    let j = i; while (j > 0 && tb.t[i] - tb.t[j - 1] <= 0.05) j--;
    dw = Math.max(dw, Math.abs(tb.w[i] - tb.w[j]));
    if (i && dt > 0) crushRate = Math.max(crushRate, (own - crushAt(tb.crushes[i - 1])) / Math.max(dt, 0.1));
    if (Math.cos(tb.th[i]) < -0.5) inverted = true;
    if (Number.isNaN(screenCracked) && c > SCREEN_CRACK) screenCracked = tb.t[i];
    if (Number.isNaN(screenOut) && c > SCREEN_OUT) screenOut = tb.t[i];
  }
  const crush = side >= 0 ? (tb.crushes.at(-1)?.[side as 0 | 1] ?? 0) : tb.crush, headroom = room - crush;
  // The far side's head swings across the car first: more speed when it's stopped.
  const headSide = dw * r * (belt ? 0.6 : 1) * (side === 1 ? 1.3 : 1);
  const reached = headroom < (belt ? 0.05 : room);
  const headRoof = !inverted ? 0 : belt ? (reached ? crushRate : 0) : Math.sqrt(2 * G * (Math.max(0, room - crush) + 0.15)) + crushRate;
  const g = (sp: number, stop: number) => (sp * sp) / (2 * stop) / G;
  const headG = Math.max(g(headSide, curt ? 0.1 : 0.02), g(headRoof, 0.03));
  // An opening that is open at time t: a broken side window not covered by a curtain (or after it has gone down), or the
  // windscreen out of its frame; flung if the car still rolls fast enough then. Unbelted, either side's window; belted,
  // only their own side's (head and arms).
  const glass = (t: number, own: boolean) => tb.windows.some((x, k) => (!own || side < 0 || k === side) && !Number.isNaN(x) && x <= t && (!curt || t > CURTAIN_HOLD));
  const screen = (t: number) => !Number.isNaN(screenOut) && screenOut <= t && Math.abs(tb.spin) > Math.PI / 2;
  const fling = Math.sqrt(G / r);
  let out = NaN;
  for (let i = 0; i < tb.t.length && Number.isNaN(out); i++) if ((glass(tb.t[i], belt) || screen(tb.t[i])) && Math.abs(tb.w[i]) > fling) out = tb.t[i];
  const thrownOut = belt ? NaN : out, partly = belt && !Number.isNaN(out);
  // Rough bands: thrown out, a head over 150 g, or upside down with the roof 5 cm into their heads is severe.
  const risk = !Number.isNaN(thrownOut) || headG > 150 || (inverted && headroom < -0.05) ? 'severe' : headG > 80 || partly || headroom < 0 ? 'serious' : 'low';
  return { headSide, headRoof, headG, thrownOut, partly, screenCracked, screenOut, frontBags: tb.frontAt, headroom, risk };
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
