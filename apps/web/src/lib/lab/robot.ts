// Hyperion's robot arms (M482), pure: arms described by Denavit–Hartenberg tables (standard DH: each joint's frame is
// Rz(θ) · Tz(d) · Tx(a) · Rx(α) after the one before), forward kinematics, the geometric Jacobian ([angular; linear],
// in the base frame), inverse kinematics by damped least squares, and the dynamics by recursive Newton–Euler worked
// in the base frame (mass matrix, gravity torques, Coriolis and centrifugal torques, forward dynamics). M482b: links may
// branch (each names the link it hangs from, so a torso can carry two arms), any link can be the tool, and links are
// capsules for collision checks against each other and against spheres and boxes.
// Poses are 4 × 4 row-major arrays here (the language turns them round).

export type V3 = [number, number, number];
/** A 4 × 4 homogeneous transform, row-major. */
export type T4 = number[];
export interface Link {
  a: number; alpha: number; d: number; theta: number;
  /** 'R' turns about z (θ is the joint), 'P' slides along z (d is the joint). */
  type: 'R' | 'P';
  mass: number; com: V3; inertia: V3; limits: [number, number];
  /** The link it hangs from (M482b: arms that branch): an earlier link's index, −1 for the base; the one before if left out. */
  parent?: number;
}
export interface Arm { name: string; links: Link[]; gravity: V3 }

export const eye4 = (): T4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul4(A: T4, B: T4): T4 {
  const o = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j]; o[i * 4 + j] = s; }
  return o;
}
/** One joint's transform for its joint value q. */
export function linkT(l: Link, q: number): T4 {
  const th = l.type === 'R' ? l.theta + q : l.theta, d = l.type === 'P' ? l.d + q : l.d;
  const ct = Math.cos(th), st = Math.sin(th), ca = Math.cos(l.alpha), sa = Math.sin(l.alpha);
  return [ct, -st * ca, st * sa, l.a * ct, st, ct * ca, -ct * sa, l.a * st, 0, sa, ca, d, 0, 0, 0, 1];
}
/** The link link i hangs from (−1: the base). */
export const parentOf = (arm: Arm, i: number) => arm.links[i].parent ?? i - 1;
/** Every frame from the base: frames[0] is the base, frames[i + 1] the frame after joint i (its joint turns about the
 * z of frames[parentOf(i) + 1]). */
export function frames(arm: Arm, q: ArrayLike<number>): T4[] {
  const out: T4[] = [eye4()];
  arm.links.forEach((l, i) => out.push(mul4(out[parentOf(arm, i) + 1], linkT(l, q[i] ?? 0))));
  return out;
}
/** The tool: the last link by default (an arm that branches has a tool at each tip). */
export const fkine = (arm: Arm, q: ArrayLike<number>, tip = arm.links.length - 1): T4 => frames(arm, q)[tip + 1];
/** The links from the base out to `tip`. */
export function chain(arm: Arm, tip: number): number[] { const c: number[] = []; for (let i = tip; i >= 0; i = parentOf(arm, i)) c.unshift(i); return c; }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const origin = (T: T4): V3 => [T[3], T[7], T[11]];
const zAxis = (T: T4): V3 => [T[2], T[6], T[10]];
/** The rotation part, row-major 3 × 3. */
export const rot = (T: T4) => [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]];
const rv = (R: number[], v: V3): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const rtv = (R: number[], v: V3): V3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

/** The geometric Jacobian at the tool: 6 × n, rows [ωx ωy ωz vx vy vz], row-major. */
export function jacobian(arm: Arm, q: ArrayLike<number>, tip = arm.links.length - 1): number[][] {
  const F = frames(arm, q), n = arm.links.length, pe = origin(F[tip + 1]), J = Array.from({ length: 6 }, () => new Array<number>(n).fill(0));
  // Only the joints between the base and the tip move it.
  for (const i of chain(arm, tip)) {
    const z = zAxis(F[parentOf(arm, i) + 1]), o = origin(F[parentOf(arm, i) + 1]);
    const w: V3 = arm.links[i].type === 'R' ? z : [0, 0, 0], v = arm.links[i].type === 'R' ? cross(z, sub(pe, o)) : z;
    for (let r = 0; r < 3; r++) { J[r][i] = w[r]; J[r + 3][i] = v[r]; }
  }
  return J;
}

/** The rotation that takes R to Rd, as an axis × angle (in the base frame). */
export function rotError(R: number[], Rd: number[]): V3 {
  // E = Rd · Rᵀ
  const E = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) E[i * 3 + j] += Rd[i * 3 + k] * R[j * 3 + k];
  return axisAngle(E);
}
/** A rotation matrix as axis × angle (radians). */
export function axisAngle(E: number[]): V3 {
  const c = Math.max(-1, Math.min(1, (E[0] + E[4] + E[8] - 1) / 2)), ang = Math.acos(c);
  const s: V3 = [E[7] - E[5], E[2] - E[6], E[3] - E[1]], ns = Math.hypot(...s);
  if (ang < 1e-9) return [0, 0, 0];
  if (ns > 1e-6) return sc(s, ang / ns);
  // Near half a turn: the axis from the diagonal.
  const ax: V3 = [Math.sqrt(Math.max(0, (E[0] + 1) / 2)), Math.sqrt(Math.max(0, (E[4] + 1) / 2)), Math.sqrt(Math.max(0, (E[8] + 1) / 2))];
  if (ax[0] > 1e-6) { ax[1] *= Math.sign(E[1] || 1); ax[2] *= Math.sign(E[2] || 1); } else if (ax[1] > 1e-6) ax[2] *= Math.sign(E[5] || 1);
  return sc(ax, ang);
}

/** Solves A x = b (small, square) by Gaussian elimination with pivoting. */
export function solveN(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-300;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-300); }
  return x;
}

export interface IkResult { q: number[]; iterations: number; error: number; success: boolean }
/** Inverse kinematics by damped least squares (Levenberg–Marquardt), weights [wx wy wz px py pz] (orientation first,
 * as the Jacobian). Joints are kept inside their limits. Starts again from a few other guesses if it gets stuck. */
export function ikine(arm: Arm, Td: T4, q0: ArrayLike<number>, weights: number[] = [1, 1, 1, 1, 1, 1], o: { maxIter?: number; tol?: number; restarts?: number; tip?: number } = {}): IkResult {
  const n = arm.links.length, tip = o.tip ?? n - 1, maxIter = o.maxIter ?? 300, tol = o.tol ?? 1e-6, Rd = rot(Td), pd = origin(Td);
  const errOf = (q: number[]) => { const T = fkine(arm, q, tip), e = [...rotError(rot(T), Rd), ...sub(pd, origin(T))]; return e.map((v, i) => v * weights[i]); };
  const norm = (e: number[]) => Math.hypot(...e);
  const clamp = (q: number[]) => q.map((v, i) => Math.min(arm.links[i].limits[1], Math.max(arm.links[i].limits[0], v)));
  let best: IkResult = { q: clamp(Array.from({ length: n }, (_, i) => q0[i] ?? 0)), iterations: 0, error: Infinity, success: false };
  let seed = 12345;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  let total = 0;
  for (let attempt = 0; attempt <= (o.restarts ?? 6); attempt++) {
    let q = attempt === 0 ? best.q.slice() : arm.links.map((l) => { const lo = Math.max(l.limits[0], -Math.PI), hi = Math.min(l.limits[1], Math.PI); return lo + rand() * (hi - lo); });
    let e = errOf(q), en = norm(e), lambda = 1e-2;
    for (let it = 0; it < maxIter && en > tol; it++) {
      total++;
      const J = jacobian(arm, q, tip).map((r, i) => r.map((v) => v * weights[i]));
      // (JᵀJ + λ diag(JᵀJ) + λ I) dq = Jᵀ e
      const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let k = 0; k < 6; k++) s += J[k][i] * J[k][j]; return s; }));
      const g = Array.from({ length: n }, (_, i) => { let s = 0; for (let k = 0; k < 6; k++) s += J[k][i] * e[k]; return s; });
      const Ad = A.map((r, i) => r.map((v, j) => (i === j ? v * (1 + lambda) + lambda : v)));
      const qn = clamp(q.map((v, i) => v + solveN(Ad, g)[i])), enew = errOf(qn), nn = norm(enew);
      if (nn < en) { q = qn; e = enew; en = nn; lambda = Math.max(1e-7, lambda / 3); } else lambda = Math.min(1e7, lambda * 4);
      if (lambda >= 1e7) break;
    }
    if (en < best.error) best = { q, iterations: total, error: en, success: en <= Math.max(tol * 10, 1e-5) };
    if (best.success) break;
  }
  best.iterations = total;
  return best;
}

/** Recursive Newton–Euler in the base frame: the joint torques (or forces) for positions, speeds and accelerations.
 * `gravity` false leaves gravity out (for the mass matrix and the velocity product). Works for arms that branch: each
 * link starts from its parent's motion, and a link carries the forces of all its children. */
export function rne(arm: Arm, q: ArrayLike<number>, qd: ArrayLike<number>, qdd: ArrayLike<number>, gravity = true, gOverride?: V3): number[] {
  const F = frames(arm, q), n = arm.links.length, g = gOverride ?? arm.gravity, base: V3 = gravity ? sc(g, -1) : [0, 0, 0];
  const w: V3[] = [], al: V3[] = [], ao: V3[] = [], ac: V3[] = [], rc: V3[] = [];
  for (let i = 0; i < n; i++) {
    const l = arm.links[i], p0 = parentOf(arm, i), wPrev: V3 = p0 < 0 ? [0, 0, 0] : w[p0], aPrev: V3 = p0 < 0 ? [0, 0, 0] : al[p0], aoPrev = p0 < 0 ? base : ao[p0];
    const z = zAxis(F[p0 + 1]), oPrev = origin(F[p0 + 1]), oi = origin(F[i + 1]), p = sub(oi, oPrev), R = rot(F[i + 1]);
    let wi: V3, ali: V3, aoi: V3;
    if (l.type === 'R') {
      wi = add(wPrev, sc(z, qd[i] ?? 0));
      ali = add(add(aPrev, sc(z, qdd[i] ?? 0)), cross(wPrev, sc(z, qd[i] ?? 0)));
      aoi = add(add(aoPrev, cross(ali, p)), cross(wi, cross(wi, p)));
    } else {
      wi = wPrev; ali = aPrev;
      aoi = add(add(add(add(aoPrev, sc(z, qdd[i] ?? 0)), sc(cross(wi, z), 2 * (qd[i] ?? 0))), cross(ali, p)), cross(wi, cross(wi, p)));
    }
    const rci = add(oi, rv(R, l.com)), d = sub(rci, oi);
    w.push(wi); al.push(ali); ao.push(aoi); rc.push(rci);
    ac.push(add(add(aoi, cross(ali, d)), cross(wi, cross(wi, d))));
  }
  // Backwards: each link's own inertia plus the force and moment its children put on it (they all act at its far end).
  const tau = new Array<number>(n).fill(0), childF: V3[] = Array.from({ length: n }, () => [0, 0, 0]), childM: V3[] = Array.from({ length: n }, () => [0, 0, 0]);
  for (let i = n - 1; i >= 0; i--) {
    const l = arm.links[i], p0 = parentOf(arm, i), oPrev = origin(F[p0 + 1]), oi = origin(F[i + 1]), R = rot(F[i + 1]);
    const Iw = (v: V3) => rv(R, [l.inertia[0] * rtv(R, v)[0], l.inertia[1] * rtv(R, v)[1], l.inertia[2] * rtv(R, v)[2]]);
    const mac = sc(ac[i], l.mass), f = childF[i], m = childM[i];
    const fi = add(f, mac);
    const mi = add(add(add(add(m, cross(sub(oi, oPrev), f)), cross(sub(rc[i], oPrev), mac)), Iw(al[i])), cross(w[i], Iw(w[i])));
    tau[i] = dot(zAxis(F[p0 + 1]), l.type === 'R' ? mi : fi);
    if (p0 >= 0) { childF[p0] = add(childF[p0], fi); childM[p0] = add(childM[p0], mi); }
  }
  return tau;
}
const zeros = (n: number) => new Array<number>(n).fill(0);
export const gravityTorque = (arm: Arm, q: ArrayLike<number>) => rne(arm, q, zeros(arm.links.length), zeros(arm.links.length));
export const velocityProduct = (arm: Arm, q: ArrayLike<number>, qd: ArrayLike<number>) => rne(arm, q, qd, zeros(arm.links.length), false);
/** The joint-space mass matrix, n × n (column j: the torques for a unit acceleration of joint j, no speed or gravity). */
export function massMatrix(arm: Arm, q: ArrayLike<number>): number[][] {
  const n = arm.links.length, M = Array.from({ length: n }, () => zeros(n));
  for (let j = 0; j < n; j++) { const e = zeros(n); e[j] = 1; const t = rne(arm, q, zeros(n), e, false); for (let i = 0; i < n; i++) M[i][j] = t[i]; }
  return M;
}
/** The joint accelerations from torques: M(q) q̈ = τ − C(q, q̇) q̇ − g(q). */
export function forwardDynamics(arm: Arm, q: ArrayLike<number>, qd: ArrayLike<number>, tau: ArrayLike<number>): number[] {
  const bias = rne(arm, q, qd, zeros(arm.links.length));
  return solveN(massMatrix(arm, q), Array.from(bias, (b, i) => (tau[i] ?? 0) - b));
}

/** Yoshikawa's manipulability √det(J Jᵀ) (0 at a singular pose), from the linear rows only when `position` is set. */
export function manipulability(arm: Arm, q: ArrayLike<number>, position = false, tip = arm.links.length - 1): number {
  const J = jacobian(arm, q, tip), rows = position ? J.slice(3) : J, m = rows.length;
  const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => rows[i].reduce((s, v, k) => s + v * rows[j][k], 0)));
  // determinant by elimination
  let det = 1;
  const M = A.map((r) => r.slice());
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return 0;
    if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; det = -det; }
    det *= M[c][c];
    for (let r = c + 1; r < m; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < m; k++) M[r][k] -= f * M[c][k]; }
  }
  return Math.sqrt(Math.max(0, det));
}

// ——— Collisions (M482b): each link a capsule round the segment from its joint to the next ———
/** The shortest distance between segments PQ and RS (Ericson's closest points). */
export function segDist(P: V3, Q: V3, R: V3, S: V3): number {
  const d1 = sub(Q, P), d2 = sub(S, R), r = sub(P, R), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s1 = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) return Math.hypot(...r);
  if (a < 1e-12) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = dot(d1, r);
    if (e < 1e-12) s1 = Math.min(1, Math.max(0, -c / a));
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s1 = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s1 + f) / e;
      if (t < 0) { t = 0; s1 = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s1 = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return Math.hypot(...sub(add(P, sc(d1, s1)), add(R, sc(d2, t))));
}
/** The distance from a point to an axis-aligned box [x1 y1 z1 x2 y2 z2] (0 inside). */
export const boxDist = (p: V3, b: number[]) => Math.hypot(...[0, 1, 2].map((k) => Math.max(b[k] - p[k], 0, p[k] - b[k + 3])));
/** The shortest distance from a segment to a box, to within a fraction of the segment (it's checked at 33 points and
 * then refined around the nearest). */
function segBoxDist(P: V3, Q: V3, b: number[]) {
  const at = (u: number): V3 => add(P, sc(sub(Q, P), u));
  let best = 0, bd = Infinity;
  for (let k = 0; k <= 32; k++) { const d = boxDist(at(k / 32), b); if (d < bd) { bd = d; best = k / 32; } }
  let lo = Math.max(0, best - 1 / 32), hi = Math.min(1, best + 1 / 32);
  for (let it = 0; it < 30; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (boxDist(at(m1), b) < boxDist(at(m2), b)) hi = m2; else lo = m1; }
  return Math.min(bd, boxDist(at((lo + hi) / 2), b));
}
export interface Collision { colliding: boolean; minDistance: number; self: [number, number][]; hits: [number, number][] }
/** Checks the arm against itself (links that don't touch at a joint) and against spheres [x y z r] and boxes
 * [x1 y1 z1 x2 y2 z2]. `hits` pair a link with an obstacle: spheres first, then boxes. Distances are between the
 * capsules' surfaces (negative: they overlap). */
export function checkCollision(arm: Arm, q: ArrayLike<number>, o: { radius?: number | number[]; spheres?: number[][]; boxes?: number[][]; self?: boolean } = {}): Collision {
  const F = frames(arm, q), n = arm.links.length, reach = arm.links.reduce((t, l) => t + Math.abs(l.a) + Math.abs(l.d), 0) || 1;
  const rad = (i: number) => (Array.isArray(o.radius) ? o.radius[i] ?? 0 : o.radius ?? reach * 0.03);
  const seg = (i: number): [V3, V3] => [origin(F[parentOf(arm, i) + 1]), origin(F[i + 1])];
  const near = (a: V3, b: V3) => Math.hypot(...sub(a, b)) < 1e-9;
  const out: Collision = { colliding: false, minDistance: Infinity, self: [], hits: [] };
  const note = (d: number, pair: [number, number], list: [number, number][]) => { out.minDistance = Math.min(out.minDistance, d); if (d < 0) { list.push(pair); out.colliding = true; } };
  if (o.self !== false) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const [A, B] = seg(i), [C, D] = seg(j);
    // Links that meet at a joint always touch there: not a collision.
    if (near(A, C) || near(A, D) || near(B, C) || near(B, D)) continue;
    note(segDist(A, B, C, D) - rad(i) - rad(j), [i, j], out.self);
  }
  const spheres = o.spheres ?? [], boxes = o.boxes ?? [];
  for (let i = 0; i < n; i++) {
    const [A, B] = seg(i);
    spheres.forEach((sp, k) => note(segDist(A, B, [sp[0], sp[1], sp[2]], [sp[0], sp[1], sp[2]]) - sp[3] - rad(i), [i, k], out.hits));
    boxes.forEach((bx, k) => note(segBoxDist(A, B, bx) - rad(i), [i, spheres.length + k], out.hits));
  }
  return out;
}

// ——— Rotations (ZYX Euler angles by default, as MATLAB's eul2rotm) ———
const Rx = (a: number) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const Ry = (a: number) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const Rz = (a: number) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
export const mul3 = (A: number[], B: number[]) => { const o = zeros(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return o; };
const AXIS: Record<string, (a: number) => number[]> = { X: Rx, Y: Ry, Z: Rz };
/** Euler angles (radians) in a sequence such as 'ZYX', 'ZYZ' or 'XYZ' (rotations about the moving axes). */
export function eul2rotm(e: [number, number, number], seq = 'ZYX'): number[] {
  return mul3(mul3(AXIS[seq[0]](e[0]), AXIS[seq[1]](e[1])), AXIS[seq[2]](e[2]));
}
export function rotm2eul(R: number[], seq = 'ZYX'): [number, number, number] {
  const r = (i: number, j: number) => R[i * 3 + j];
  if (seq === 'ZYX') { const b = Math.asin(-Math.max(-1, Math.min(1, r(2, 0)))); return Math.abs(Math.cos(b)) > 1e-9 ? [Math.atan2(r(1, 0), r(0, 0)), b, Math.atan2(r(2, 1), r(2, 2))] : [Math.atan2(-r(0, 1), r(1, 1)), b, 0]; }
  if (seq === 'XYZ') { const b = Math.asin(Math.max(-1, Math.min(1, r(0, 2)))); return Math.abs(Math.cos(b)) > 1e-9 ? [Math.atan2(-r(1, 2), r(2, 2)), b, Math.atan2(-r(0, 1), r(0, 0))] : [Math.atan2(r(2, 1), r(1, 1)), b, 0]; }
  if (seq === 'ZYZ') { const b = Math.acos(Math.max(-1, Math.min(1, r(2, 2)))); return Math.abs(Math.sin(b)) > 1e-9 ? [Math.atan2(r(1, 2), r(0, 2)), b, Math.atan2(r(2, 1), -r(2, 0))] : [Math.atan2(r(1, 0), r(0, 0)), b, 0]; }
  throw new Error('seq');
}
export function axang2rotm(ax: V3, ang: number): number[] {
  const n = Math.hypot(...ax) || 1, [x, y, z] = sc(ax, 1 / n), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
export const tform = (R: number[], p: V3): T4 => [R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1];

// ——— Arms ready to use ———
const L = (a: number, alpha: number, d: number, mass: number, com: V3, inertia: V3, limits: [number, number] = [-Math.PI, Math.PI], type: 'R' | 'P' = 'R'): Link => ({ a, alpha, d, theta: 0, type, mass, com, inertia, limits });
export const ARMS: Record<string, () => Arm> = {
  // Two 1 m links, 1 kg each at its tip, moving in a vertical plane (gravity along −y): the textbook arm.
  twolink: () => ({ name: 'twolink', gravity: [0, -9.81, 0], links: [L(1, 0, 0, 1, [0, 0, 0], [0, 0, 0]), L(1, 0, 0, 1, [0, 0, 0], [0, 0, 0])] }),
  // Three links in a vertical plane, rods with their mass at the middle.
  planar3: () => ({ name: 'planar3', gravity: [0, -9.81, 0], links: [L(1, 0, 0, 2, [-0.5, 0, 0], [0, 2 / 12, 2 / 12]), L(0.8, 0, 0, 1.5, [-0.4, 0, 0], [0, 0.08, 0.08]), L(0.5, 0, 0, 0.8, [-0.25, 0, 0], [0, 0.017, 0.017])] }),
  // A six-axis arm (shoulder, elbow, spherical wrist) with the PUMA 560's published DH table and rounded masses.
  sixaxis: () => ({
    name: 'sixaxis', gravity: [0, 0, -9.81], links: [
      L(0, Math.PI / 2, 0.6718, 0, [0, 0, 0], [0, 0.35, 0], [-2.79, 2.79]),
      L(0.4318, 0, 0, 17.4, [-0.3638, 0.006, 0.2275], [0.13, 0.524, 0.539], [-3.93, 0.79]),
      L(0.0203, -Math.PI / 2, 0.15005, 4.8, [-0.0203, -0.0141, 0.07], [0.066, 0.086, 0.0125], [-0.79, 3.93]),
      L(0, Math.PI / 2, 0.4318, 0.82, [0, 0.019, 0], [1.8e-3, 1.3e-3, 1.8e-3], [-1.92, 2.97]),
      L(0, -Math.PI / 2, 0, 0.34, [0, 0, 0], [0.3e-3, 0.4e-3, 0.3e-3], [-1.75, 1.75]),
      L(0, 0, 0.0563, 0.09, [0, 0, 0.032], [0.15e-3, 0.15e-3, 0.04e-3], [-4.64, 4.64]),
    ],
  }),
  // A torso that turns at the waist, carrying two three-joint arms (M482b: an arm that branches). Links 2–4 are the
  // left arm, 5–7 the right; each arm's last link is a tool.
  dualarm: () => ({
    name: 'dualarm', gravity: [0, 0, -9.81], links: [
      L(0, 0, 0.8, 12, [0, 0, -0.4], [0.3, 0.3, 0.1], [-2.6, 2.6]),
      { ...L(0.22, Math.PI / 2, 0.15, 1.5, [-0.11, 0, 0], [0.005, 0.01, 0.01], [-2.6, 2.6]), theta: Math.PI / 2, parent: 0 },
      { ...L(0.3, 0, 0, 2, [-0.15, 0, 0], [0.004, 0.02, 0.02], [-2.6, 2.6]), parent: 1 },
      { ...L(0.25, 0, 0, 1, [-0.125, 0, 0], [0.002, 0.008, 0.008], [-2.6, 2.6]), parent: 2 },
      { ...L(0.22, -Math.PI / 2, 0.15, 1.5, [-0.11, 0, 0], [0.005, 0.01, 0.01], [-2.6, 2.6]), theta: -Math.PI / 2, parent: 0 },
      { ...L(0.3, 0, 0, 2, [-0.15, 0, 0], [0.004, 0.02, 0.02], [-2.6, 2.6]), parent: 4 },
      { ...L(0.25, 0, 0, 1, [-0.125, 0, 0], [0.002, 0.008, 0.008], [-2.6, 2.6]), parent: 5 },
    ],
  }),
  // A SCARA: two turning arms in a level plane, a sliding quill and a turning tool.
  scara: () => ({
    name: 'scara', gravity: [0, 0, -9.81], links: [
      L(0.4, 0, 0.4, 5, [-0.2, 0, 0], [0.01, 0.07, 0.07], [-2.5, 2.5]),
      L(0.3, Math.PI, 0, 3, [-0.15, 0, 0], [0.005, 0.025, 0.025], [-2.5, 2.5]),
      { ...L(0, 0, 0, 1, [0, 0, 0], [0.001, 0.001, 0.0005], [0, 0.3]), type: 'P' },
      L(0, 0, 0.05, 0.3, [0, 0, 0], [1e-4, 1e-4, 1e-4]),
    ],
  }),
};
