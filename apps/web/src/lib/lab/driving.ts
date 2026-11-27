// Hyperion's automated driving (M487), pure, on M486's car: roads as centrelines (points every 0.5 m with heading and
// curvature), where the car is against the road (how far along, how far off the centre, how far turned), three lane
// keepers (Stanley; pure pursuit; LQR on the lateral error model with the road's curvature fed forward), adaptive
// cruise control (a time gap to the car ahead, with automatic emergency braking when a crash is near) and lane-departure
// warning by the time to cross the line.

import { G, RHO, handling, vehicleStep, type VState, type Vehicle } from './vehicle';

export interface Road { s: number[]; x: number[]; y: number[]; h: number[]; k: number[]; width: number; name: string }
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** A road from its curvature along the way (1/m as a function of distance), every 0.5 m. */
export function roadFrom(curv: (s: number) => number, length: number, name: string, width = 3.5): Road {
  const r: Road = { s: [], x: [], y: [], h: [], k: [], width, name }, ds = 0.5;
  let x = 0, y = 0, h = 0;
  for (let s = 0; s <= length; s += ds) {
    const k = curv(s);
    r.s.push(s); r.x.push(x); r.y.push(y); r.h.push(h); r.k.push(k);
    // Exact arc for the half metre.
    const h2 = h + k * ds;
    if (Math.abs(k) < 1e-9) { x += ds * Math.cos(h); y += ds * Math.sin(h); } else { x += (Math.sin(h2) - Math.sin(h)) / k; y -= (Math.cos(h2) - Math.cos(h)) / k; }
    h = h2;
  }
  return r;
}
/** Curvature that eases in and out over `ease` metres (a clothoid-like blend, so the steering needn't jump). */
const smoothStep = (s: number, a: number, b: number) => (s <= a ? 0 : s >= b ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * (s - a)) / (b - a)));
export const ROADS: Record<string, () => Road> = {
  straight: () => roadFrom(() => 0, 600, 'straight'),
  // A sweeping bend of 150 m radius, then straight.
  curve: () => roadFrom((s) => (1 / 150) * (smoothStep(s, 50, 90) - smoothStep(s, 250, 290)), 450, 'curve'),
  // Left then right, 100 m radius each.
  scurve: () => roadFrom((s) => (1 / 100) * (smoothStep(s, 40, 70) - smoothStep(s, 130, 160)) - (1 / 100) * (smoothStep(s, 160, 190) - smoothStep(s, 250, 280)), 380, 'scurve'),
  // A country road: bends one after another.
  country: () => roadFrom((s) => (1 / 120) * Math.sin(s / 45) * smoothStep(s, 20, 60), 800, 'country'),
  // The ISO 3888-1 double lane change, as a centreline: 3.5 m across and back.
  lanechange: () => {
    const shift = (s: number) => 3.5 * (smoothStep(s, 15, 45) - smoothStep(s, 70, 100));
    // From the lateral shift y(s) build the road by its heading (small enough that s ≈ x).
    const r: Road = { s: [], x: [], y: [], h: [], k: [], width: 3.5, name: 'lanechange' };
    for (let x = 0; x <= 160; x += 0.5) { r.x.push(x); r.y.push(shift(x)); }
    let s = 0;
    for (let i = 0; i < r.x.length; i++) {
      if (i) s += Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1]);
      r.s.push(s);
      const j = Math.min(r.x.length - 1, i + 1), p = Math.max(0, i - 1);
      r.h.push(Math.atan2(r.y[j] - r.y[p], r.x[j] - r.x[p]));
    }
    for (let i = 0; i < r.x.length; i++) { const j = Math.min(r.x.length - 1, i + 1), p = Math.max(0, i - 1); r.k.push(wrap(r.h[j] - r.h[p]) / (r.s[j] - r.s[p] || 1)); }
    return r;
  },
};

export interface Where { i: number; s: number; e: number; he: number; k: number; end: boolean }
/** Where a pose is against the road: the nearest centreline point (searched near the last one when given), the signed
 * offset (left of the road positive), the heading error (car minus road) and the road's curvature there. */
export function locate(r: Road, x: number, y: number, psi: number, near = -1): Where {
  const lo = near < 0 ? 0 : Math.max(0, near - 20), hi = near < 0 ? r.x.length - 1 : Math.min(r.x.length - 1, near + 60);
  let i = lo, bd = Infinity;
  for (let j = lo; j <= hi; j++) { const d = (r.x[j] - x) ** 2 + (r.y[j] - y) ** 2; if (d < bd) { bd = d; i = j; } }
  // Between the nearest point and the next one along (or the one before), heading and curvature interpolated, so the
  // keepers don't see them jump every half metre.
  const fwd = Math.cos(r.h[i]) * (x - r.x[i]) + Math.sin(r.h[i]) * (y - r.y[i]), j = fwd >= 0 ? Math.min(r.x.length - 1, i + 1) : Math.max(0, i - 1);
  const segL = Math.abs(r.s[j] - r.s[i]) || 1, f = j === i ? 0 : Math.min(1, Math.abs(fwd) / segL);
  const h = r.h[i] + f * wrap(r.h[j] - r.h[i]), kk = r.k[i] + f * (r.k[j] - r.k[i]);
  const px = r.x[i] + f * (r.x[j] - r.x[i]), py = r.y[i] + f * (r.y[j] - r.y[i]), dx = x - px, dy = y - py;
  const e = -Math.sin(h) * dx + Math.cos(h) * dy;
  return { i, s: r.s[i] + (fwd >= 0 ? 1 : -1) * f * segL, e, he: wrap(psi - h), k: kk, end: i >= r.x.length - 2 };
}
/** The road's point `ahead` metres on from index i. */
const ahead = (r: Road, i: number, d: number) => { let j = i; while (j < r.s.length - 1 && r.s[j] - r.s[i] < d) j++; return j; };

// ——— Lane keepers: the steering at the wheels (rad) ———
export type Keeper = 'stanley' | 'purepursuit' | 'lqr';
/** Stanley (Stanford's DARPA car): δ = −heading error − atan(k·e / v), from the front axle. */
export function stanley(v: Vehicle, r: Road, s: VState, near: number, k = 1.5) {
  const fx = s.x + v.lf * Math.cos(s.psi), fy = s.y + v.lf * Math.sin(s.psi), w = locate(r, fx, fy, s.psi, near);
  return { steer: -w.he - Math.atan2(k * w.e, Math.max(s.vx, 1)), w };
}
/** Pure pursuit: a point on the road a look-ahead on (growing with speed), steered to on a circle through it. */
export function purePursuitSteer(v: Vehicle, r: Road, s: VState, near: number, kv = 0.5, min = 5) {
  const L = v.lf + v.lr, rx = s.x - v.lr * Math.cos(s.psi), ry = s.y - v.lr * Math.sin(s.psi), w = locate(r, s.x, s.y, s.psi, near);
  const ld = Math.max(min, kv * s.vx), j = ahead(r, w.i, ld), tx = r.x[j] - rx, ty = r.y[j] - ry, alpha = wrap(Math.atan2(ty, tx) - s.psi);
  return { steer: Math.atan2(2 * L * Math.sin(alpha), Math.hypot(tx, ty)), w };
}
/** LQR on the lateral error model (Rajamani's: states e, ė, heading error, its rate) at this speed, the gains worked out
 * by iterating the discrete Riccati equation, with the road's curvature fed forward so a steady bend needs no error. */
export function lqrGains(v: Vehicle, u: number, dt = 0.01, q = [1, 0, 1, 0], rw = 10) {
  const cf = v.cf, cr = v.cr, m = v.m, iz = v.iz, lf = v.lf, lr = v.lr, U = Math.max(u, 1);
  const A = [
    [0, 1, 0, 0],
    [0, -(cf + cr) / (m * U), (cf + cr) / m, (-cf * lf + cr * lr) / (m * U)],
    [0, 0, 0, 1],
    [0, (-cf * lf + cr * lr) / (iz * U), (cf * lf - cr * lr) / iz, -(cf * lf * lf + cr * lr * lr) / (iz * U)],
  ], B = [0, cf / m, 0, (cf * lf) / iz];
  // Discrete by Euler (dt small against these dynamics).
  const Ad = A.map((row, i) => row.map((a, j) => (i === j ? 1 : 0) + a * dt)), Bd = B.map((b) => b * dt);
  let P = q.map((qi, i) => q.map((_, j) => (i === j ? qi : 0)));
  let K = [0, 0, 0, 0];
  for (let it = 0; it < 4000; it++) {
    const PB = P.map((row) => row.reduce((s, p, k) => s + p * Bd[k], 0)), BPB = Bd.reduce((s, b, k) => s + b * PB[k], 0);
    const BPA = Ad[0].map((_, j) => Bd.reduce((s, b, k) => s + b * P[k].reduce((t, p, l) => t + p * Ad[l][j], 0), 0));
    const Kn = BPA.map((x) => x / (rw + BPB));
    const AtPA = Ad[0].map((_, i) => Ad[0].map((__, j) => Ad.reduce((s, row, k) => s + row[i] * P[k].reduce((t, p, l) => t + p * Ad[l][j], 0), 0)));
    const Pn = AtPA.map((row, i) => row.map((x, j) => x - BPA[i] * Kn[j] + (i === j ? q[i] : 0)));
    const diff = Math.max(...Kn.map((x, k) => Math.abs(x - K[k])));
    P = Pn; K = Kn;
    if (it > 50 && diff < 1e-9) break;
  }
  return K;
}
export function lqrSteer(v: Vehicle, r: Road, s: VState, near: number, K: number[]) {
  const w = locate(r, s.x, s.y, s.psi, near), vy = s.vy, U = Math.max(s.vx, 1);
  // e and its rate, the heading error and its rate (the road turning at U·k).
  const x = [w.e, vy + U * w.he, w.he, s.r - U * w.k];
  const h = handling(v), ff = (v.lf + v.lr) * w.k + h.K * U * U * w.k;
  return { steer: -K.reduce((t, kk, i) => t + kk * x[i], 0) + ff, w };
}

export interface DriveRun { t: number[]; x: number[]; y: number[]; psi: number[]; vx: number[]; e: number[]; he: number[]; steer: number[]; ttlc: number[]; gap: number[]; lead: number[]; leadX: number[]; accel: number[]; aeb: boolean[]; maxE: number; left: boolean; crashed: boolean }
/** Lane keeping along a road at a held speed (1 ms steps, the controller every 10 ms as a real one would run). */
export function laneKeep(v: Vehicle, r: Road, keeper: Keeper, speed: number, o: { e0?: number; T?: number; gain?: number } = {}): DriveRun {
  const dt = 1e-3, ctrlEvery = 10, K = keeper === 'lqr' ? lqrGains(v, speed) : [];
  let s: VState = { x: r.x[0] - Math.sin(r.h[0]) * (o.e0 ?? 0), y: r.y[0] + Math.cos(r.h[0]) * (o.e0 ?? 0), psi: r.h[0], vx: speed, vy: 0, r: 0 }, ax = 0, near = 0, steer = 0, maxE = 0, left = false;
  const out: DriveRun = { t: [], x: [], y: [], psi: [], vx: [], e: [], he: [], steer: [], ttlc: [], gap: [], lead: [], leadX: [], accel: [], aeb: [], maxE: 0, left: false, crashed: false };
  const T = o.T ?? (r.s[r.s.length - 1] / Math.max(speed, 1)) * 1.05, n = Math.ceil(T / dt);
  for (let k = 0; k <= n; k++) {
    if (k % ctrlEvery === 0) {
      const c = keeper === 'stanley' ? stanley(v, r, s, near, o.gain) : keeper === 'purepursuit' ? purePursuitSteer(v, r, s, near, o.gain) : lqrSteer(v, r, s, near, K);
      steer = Math.max(-v.maxSteer, Math.min(v.maxSteer, c.steer));
      const w = locate(r, s.x, s.y, s.psi, near);
      near = w.i;
      maxE = Math.max(maxE, Math.abs(w.e));
      // Lane departure: the car's side (0.9 m off its middle) past the lane's edge.
      if (Math.abs(w.e) + 0.9 > r.width / 2) left = true;
      // Time to line crossing: the room to the edge over the speed towards it.
      const lat = s.vx * Math.sin(w.he) + s.vy * Math.cos(w.he), room = r.width / 2 - 0.9 - Math.sign(lat || 1) * w.e;
      if (k % 50 === 0) {
        out.t.push(k * dt); out.x.push(s.x); out.y.push(s.y); out.psi.push(s.psi); out.vx.push(s.vx); out.e.push(w.e); out.he.push(w.he); out.steer.push(steer);
        out.ttlc.push(Math.abs(lat) > 0.01 ? Math.max(0, room) / Math.abs(lat) : Infinity);
      }
      if (w.end) break;
    }
    const force = v.m * 2 * (speed - s.vx) + 0.5 * RHO * v.cd * v.area * s.vx * s.vx + v.crr * v.m * G;
    const before = s.vx;
    s = vehicleStep(v, s, { steer, force }, dt, ax);
    ax = (s.vx - before) / dt;
  }
  return { ...out, maxE, left };
}

// ——— Following: adaptive cruise control and emergency braking ———
/** A car following another on a straight road. The ACC keeps a gap of `standstill + timeGap·v`, never faster than the
 * set speed, its acceleration between −3.5 and +2 m/s² (comfortable limits); automatic emergency braking takes over
 * with full brakes when the time to collision falls under `aebTtc` seconds. The lead car's speed is a function of time. */
export function followSim(v: Vehicle, lead: (t: number) => number, T: number, o: { set?: number; timeGap?: number; standstill?: number; gap0?: number; v0?: number; aeb?: boolean; aebTtc?: number; acc?: boolean } = {}): DriveRun {
  const dt = 0.01, set = o.set ?? 30, th = o.timeGap ?? 1.8, d0 = o.standstill ?? 5, aebTtc = o.aebTtc ?? 1.6;
  let x = 0, u = o.v0 ?? set, lx = o.gap0 ?? 60, lv = lead(0), braking = false, crashed = false;
  const out: DriveRun = { t: [], x: [], y: [], psi: [], vx: [], e: [], he: [], steer: [], ttlc: [], gap: [], lead: [], leadX: [], accel: [], aeb: [], maxE: 0, left: false, crashed: false };
  const n = Math.ceil(T / dt);
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    lv = Math.max(0, lead(t));
    const gap = lx - x - 4.6, closing = u - lv, ttc = closing > 0.1 ? gap / closing : Infinity;
    let a: number;
    if (o.acc === false) a = 0; // a driver who doesn't react: only the emergency brake can help
    else {
      const want = d0 + th * u;
      // Gap control near the car ahead, speed control when it is far; the lower wins.
      const aGap = 0.23 * (gap - want) + 0.74 * (lv - u), aSpeed = 0.4 * (set - u);
      a = Math.max(-3.5, Math.min(2, Math.min(aSpeed, gap < 2.5 * want + 20 ? aGap : aSpeed)));
    }
    if ((o.aeb ?? true) && ttc < aebTtc) braking = true;
    if (braking && closing <= 0) braking = false;
    if (braking) a = -v.mu * G;
    // Power and grip limit the speeding up.
    a = Math.min(a, Math.min(v.power / Math.max(u, 1), v.mu * v.m * G * 0.55) / v.m);
    if (gap <= 0 && !crashed) crashed = true;
    if (k % 5 === 0) { out.t.push(t); out.x.push(x); out.vx.push(u); out.gap.push(gap); out.lead.push(lv); out.leadX.push(lx); out.accel.push(a); out.aeb.push(braking); out.y.push(0); out.psi.push(0); out.e.push(0); out.he.push(0); out.steer.push(0); out.ttlc.push(ttc); }
    if (crashed) break;
    u = Math.max(0, u + a * dt); x += u * dt; lx += lv * dt;
  }
  return { ...out, crashed };
}
