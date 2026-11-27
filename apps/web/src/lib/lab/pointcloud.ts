// Hyperion's lidar point clouds (M574, the owner, 27 Nov: the automated-driving page's perception): thinning to a
// voxel grid, the ground plane by RANSAC, Euclidean clustering into objects, a box fitted to each (the L-shape search
// for its heading), rigid registration by ICP (Horn's closed form each step), and lidar odometry with a map built from
// a run of scans. Points are [x y z] rows. Pure, our own code from the standard methods.

import { symEigen } from './ml';

export type P3 = [number, number, number];
export type Rand = () => number;
export function seeded(seed = 1): Rand { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const key = (i: number, j: number, k: number) => `${i},${j},${k}`;

/** Each occupied voxel of side `size` replaced by the mean of its points. */
export function voxelDown(P: P3[], size: number): P3[] {
  if (!(size > 0)) throw new Error('The voxel size must be above 0.');
  const acc = new Map<string, [number, number, number, number]>();
  for (const p of P) { const k = key(Math.floor(p[0] / size), Math.floor(p[1] / size), Math.floor(p[2] / size)); const a = acc.get(k); if (a) { a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; } else acc.set(k, [p[0], p[1], p[2], 1]); }
  return [...acc.values()].map(([x, y, z, n]) => [x / n, y / n, z / n]);
}
/** A plane n·p + d = 0 (unit n) through the most points within `maxDist`, by RANSAC (then refitted to its inliers by
 *  least squares). With `ref` and `maxAngle` (degrees) only planes whose normal is that close to ref. */
export function ransacPlane(P: P3[], maxDist: number, o: { ref?: P3; maxAngle?: number; iterations?: number; seed?: number } = {}) {
  if (P.length < 3) throw new Error('A plane needs at least three points.');
  const r = seeded(o.seed ?? 1), it = o.iterations ?? 300, cosMax = o.ref ? Math.cos(((o.maxAngle ?? 5) * Math.PI) / 180) : -1;
  const refN = o.ref ? norm(o.ref) : null;
  let best: { n: P3; d: number; count: number } | null = null;
  for (let k = 0; k < it; k++) {
    const a = P[Math.floor(r() * P.length)], b = P[Math.floor(r() * P.length)], c = P[Math.floor(r() * P.length)];
    let n = cross(sub(b, a), sub(c, a)); const L = Math.hypot(...n); if (L < 1e-12) continue; n = n.map((v) => v / L) as P3;
    if (refN) { const cs = dot(n, refN); if (Math.abs(cs) < cosMax) continue; if (cs < 0) n = n.map((v) => -v) as P3; }
    const d = -dot(n, a); let count = 0;
    for (const p of P) if (Math.abs(dot(n, p) + d) <= maxDist) count++;
    if (!best || count > best.count) best = { n, d, count };
  }
  if (!best) throw new Error('No plane found (with that normal).');
  // refine: the inliers' centroid and their smallest principal direction
  const inl = P.map((p, i) => (Math.abs(dot(best!.n, p) + best!.d) <= maxDist ? i : -1)).filter((i) => i >= 0);
  const m = inl.reduce((s, i) => [s[0] + P[i][0], s[1] + P[i][1], s[2] + P[i][2]] as P3, [0, 0, 0] as P3).map((v) => v / inl.length) as P3;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of inl) { const q = sub(P[i], m); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += q[a] * q[b]; }
  const e = symEigen(C); let n = [e.vectors[0][2], e.vectors[1][2], e.vectors[2][2]] as P3;
  if (dot(n, best.n) < 0) n = n.map((v) => -v) as P3;
  const d = -dot(n, m), inliers: number[] = [], outliers: number[] = [];
  P.forEach((p, i) => (Math.abs(dot(n, p) + d) <= maxDist ? inliers : outliers).push(i));
  return { normal: n, d, inliers, outliers };
}
/** Euclidean clusters: points closer than `minDist` (through others) share a label 1, 2, …; clusters outside
 *  [minPts, maxPts] get 0. */
export function cluster(P: P3[], minDist: number, minPts = 1, maxPts = Infinity) {
  if (!(minDist > 0)) throw new Error('The distance must be above 0.');
  const grid = new Map<string, number[]>(), cell = (p: P3) => [Math.floor(p[0] / minDist), Math.floor(p[1] / minDist), Math.floor(p[2] / minDist)];
  P.forEach((p, i) => { const [a, b, c] = cell(p), k = key(a, b, c); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  const label = new Int32Array(P.length).fill(-1), d2 = minDist * minDist;
  let next = 0; const sizes: number[] = [];
  for (let s = 0; s < P.length; s++) {
    if (label[s] >= 0) continue;
    const id = next++, stack = [s]; label[s] = id; let size = 0;
    while (stack.length) {
      const i = stack.pop()!; size++;
      const [a, b, c] = cell(P[i]);
      for (let x = a - 1; x <= a + 1; x++) for (let y = b - 1; y <= b + 1; y++) for (let z = c - 1; z <= c + 1; z++) for (const j of grid.get(key(x, y, z)) ?? []) {
        if (label[j] >= 0) continue;
        const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], dz = P[i][2] - P[j][2];
        if (dx * dx + dy * dy + dz * dz <= d2) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  // number the kept clusters 1, 2, … biggest first
  const keep = sizes.map((n, i) => ({ n, i })).filter((c) => c.n >= minPts && c.n <= maxPts).sort((a, b) => b.n - a.n), map = new Map(keep.map((c, k) => [c.i, k + 1]));
  return { labels: Array.from(label, (l) => map.get(l) ?? 0), count: keep.length };
}
/** A box around points: its heading by the L-shape search (Zhang et al., 2017: every degree from 0 to 89, the
 *  rectangle whose nearer edges hug the points best, "closeness", which holds when a lidar sees only two sides), the
 *  z range: [cx cy cz L W H yaw] (yaw in degrees, along the longer side). */
export function fitCuboid(P: P3[]) {
  if (!P.length) throw new Error('No points to fit.');
  let best = { score: -Infinity, th: 0, u0: 0, u1: 0, v0: 0, v1: 0 };
  for (let deg = 0; deg < 90; deg++) {
    const th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), U = P.map((p) => p[0] * c + p[1] * s), V = P.map((p) => -p[0] * s + p[1] * c);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < P.length; i++) { u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); v0 = Math.min(v0, V[i]); v1 = Math.max(v1, V[i]); }
    // each point's distance to the nearer of its two closest edges; small distances score high
    let score = 0;
    for (let i = 0; i < P.length; i++) { const du = Math.min(U[i] - u0, u1 - U[i]), dv = Math.min(V[i] - v0, v1 - V[i]); score += 1 / Math.max(Math.min(du, dv), 0.01); }
    if (score > best.score + 1e-9) best = { score, th, u0, u1, v0, v1 };
  }
  const { th, u0, u1, v0, v1 } = best, uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, c = Math.cos(th), s = Math.sin(th);
  let z0 = Infinity, z1 = -Infinity; for (const p of P) { z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  let L = u1 - u0, W = v1 - v0, yaw = th;
  if (W > L) { [L, W] = [W, L]; yaw += Math.PI / 2; }
  return [uc * c - vc * s, uc * s + vc * c, (z0 + z1) / 2, L, W, z1 - z0, ((Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 180) / Math.PI)];
}
// ——— rigid transforms: R (3×3, rows) and t ———
export interface Rigid { R: number[][]; t: P3 }
export const apply = (T: Rigid, p: P3): P3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.t[i]) as P3;
export const compose = (A: Rigid, B: Rigid): Rigid => ({ R: [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.R[i][0] * B.R[0][j] + A.R[i][1] * B.R[1][j] + A.R[i][2] * B.R[2][j])), t: apply(A, B.t) });
export const identity = (): Rigid => ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] });
/** The rotation and translation taking points A onto B (paired), least squares: Horn's quaternion method. */
export function horn(A: P3[], B: P3[]): Rigid {
  const n = A.length, ca = [0, 0, 0] as P3, cb = [0, 0, 0] as P3;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { ca[k] += A[i][k] / n; cb[k] += B[i][k] / n; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) { const a = sub(A[i], ca), b = sub(B[i], cb); for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) S[x][y] += a[x] * b[y]; }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  const e = symEigen(N), [w, x, y, z] = [0, 1, 2, 3].map((i) => e.vectors[i][0]);
  const R = [[w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]];
  const Rca = [0, 1, 2].map((i) => R[i][0] * ca[0] + R[i][1] * ca[1] + R[i][2] * ca[2]);
  return { R, t: [cb[0] - Rca[0], cb[1] - Rca[1], cb[2] - Rca[2]] };
}
/** Nearest neighbours in `fixed` by a hash grid of cell `h` (searching outwards until found). */
function nearest(fixed: P3[], h: number) {
  const grid = new Map<string, number[]>();
  fixed.forEach((p, i) => { const k = key(Math.floor(p[0] / h), Math.floor(p[1] / h), Math.floor(p[2] / h)); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
  return (p: P3) => {
    const [a, b, c] = [Math.floor(p[0] / h), Math.floor(p[1] / h), Math.floor(p[2] / h)];
    let best = -1, bd = Infinity;
    for (let ring = 1; ring <= 3; ring++) {
      for (let x = a - ring; x <= a + ring; x++) for (let y = b - ring; y <= b + ring; y++) for (let z = c - ring; z <= c + ring; z++) for (const j of grid.get(key(x, y, z)) ?? []) { const d = (p[0] - fixed[j][0]) ** 2 + (p[1] - fixed[j][1]) ** 2 + (p[2] - fixed[j][2]) ** 2; if (d < bd) { bd = d; best = j; } }
      if (best >= 0 && Math.sqrt(bd) <= ring * h) break;
    }
    return { j: best, d: Math.sqrt(bd) };
  };
}
/** Iterative closest point (point to point): the rigid transform taking `moving` onto `fixed`, pairs farther than
 *  `inlierDist` left out, until it moves less than `tol`. */
export function icp(moving: P3[], fixed: P3[], o: { iterations?: number; inlierDist?: number; tol?: number; init?: Rigid } = {}) {
  if (moving.length < 3 || fixed.length < 3) throw new Error('ICP needs at least three points in each cloud.');
  const maxD = o.inlierDist ?? 1, nn = nearest(fixed, Math.max(maxD / 2, 0.05));
  let T = o.init ?? identity(), rmse = Infinity, iters = 0;
  for (; iters < (o.iterations ?? 30); iters++) {
    const A: P3[] = [], B: P3[] = []; let se = 0;
    for (const p of moving) { const q = apply(T, p), m = nn(q); if (m.j >= 0 && m.d <= maxD) { A.push(q); B.push(fixed[m.j]); se += m.d * m.d; } }
    if (A.length < 3) break;
    rmse = Math.sqrt(se / A.length);
    const D = horn(A, B); T = compose(D, T);
    const moved = Math.hypot(...D.t) + Math.abs(Math.acos(Math.max(-1, Math.min(1, (D.R[0][0] + D.R[1][1] + D.R[2][2] - 1) / 2))));
    if (moved < (o.tol ?? 1e-6)) { iters++; break; }
  }
  return { T, rmse, iterations: iters };
}
/** Lidar odometry and a map: each scan (ground removed, thinned) registered to the one before, the poses chained, and
 *  every scan's points put in the first scan's frame (thinned again). */
export function lidarMap(scans: P3[][], o: { voxel?: number; ground?: number; inlierDist?: number } = {}) {
  const prep = (S: P3[]) => voxelDown(S.filter((p) => p[2] > (o.ground ?? 0.2)), o.voxel ?? 0.3);
  const poses: Rigid[] = [identity()], map: P3[] = [...prep(scans[0])];
  let prev = prep(scans[0]), guess = identity();
  for (let k = 1; k < scans.length; k++) {
    const cur = prep(scans[k]);
    // this scan in the previous one's frame; starting from the last step's motion
    const r = icp(cur, prev, { inlierDist: o.inlierDist ?? 2, iterations: 40, init: guess });
    guess = r.T;
    const pose = compose(poses[k - 1], r.T); poses.push(pose);
    for (const p of cur) map.push(apply(pose, p));
    prev = cur;
  }
  return { poses, map: voxelDown(map, o.voxel ?? 0.3) };
}
// ——— small vector helpers ———
function sub(a: P3, b: P3): P3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a: P3, b: P3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: P3, b: P3): P3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: P3): P3 { const L = Math.hypot(...a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }
