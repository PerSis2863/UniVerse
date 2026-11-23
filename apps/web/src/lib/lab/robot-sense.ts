// Hyperion's robot sensing (M484), pure: a lidar simulated on an occupancy grid (exact cell-by-cell ray casting),
// Monte Carlo localisation (a particle filter: the odometry motion model, a likelihood field for the scans,
// low-variance resampling, a few random particles to recover when lost), occupancy-grid mapping with log-odds, and a
// simple SLAM: each scan matched against the map built so far (a correlative search around the odometry's guess)
// before it is added. Maps and positions as robot-motion.ts (metres, origin bottom-left, row 0 at the top).

import { blocked, cellOf, followPath, freeAt, type Grid, type Pose } from './robot-motion';

export type Rand = () => number;
export const lcg = (seed = 1): Rand => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32); };
/** A standard normal number (Box–Muller). */
export const gauss = (rand: Rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The distance along a ray to the first blocked cell (Amanatides–Woo stepping), or `max` if none is that close. */
export function castRay(g: Grid, x: number, y: number, ang: number, max: number): number {
  const dx = Math.cos(ang), dy = Math.sin(ang), gx = x * g.res, gy = y * g.res;
  let cx = Math.floor(gx), cy = Math.floor(gy);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tx = dx !== 0 ? (dx > 0 ? cx + 1 - gx : gx - cx) * tdx : Infinity, ty = dy !== 0 ? (dy > 0 ? cy + 1 - gy : gy - cy) * tdy : Infinity;
  const maxT = max * g.res;
  let t = 0;
  // y grows upwards; the grid's row index grows downwards.
  const hit = () => blocked(g, g.rows - 1 - cy, cx);
  if (hit()) return 0;
  while (t <= maxT) {
    if (tx < ty) { t = tx; tx += tdx; cx += sx; } else { t = ty; ty += tdy; cy += sy; }
    if (t > maxT) break;
    if (hit()) return t / g.res;
  }
  return max;
}
export function scan(g: Grid, pose: Pose, angles: number[], max: number, noise = 0, rand: Rand = Math.random): number[] {
  return angles.map((a) => { const r = castRay(g, pose[0], pose[1], pose[2] + a, max); return r >= max ? max : Math.max(0, r + noise * gauss(rand)); });
}
export const beams = (n: number, fov = 2 * Math.PI) => Array.from({ length: n }, (_, k) => (fov >= 2 * Math.PI - 1e-9 ? -Math.PI + (2 * Math.PI * k) / n : -fov / 2 + (fov * k) / Math.max(1, n - 1)));

/** The distance (metres) from every cell to the nearest blocked one: a two-pass chamfer transform (3–4 weights). */
export function distanceField(g: Grid): Float32Array {
  const { rows, cols } = g, D = new Float32Array(rows * cols);
  for (let i = 0; i < D.length; i++) D[i] = g.cells[i] ? 0 : 1e9;
  const relax = (i: number, j: number, w: number) => { if (D[j] + w < D[i]) D[i] = D[j] + w; };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    if (c > 0) relax(i, i - 1, 3);
    if (r > 0) { relax(i, i - cols, 3); if (c > 0) relax(i, i - cols - 1, 4); if (c < cols - 1) relax(i, i - cols + 1, 4); }
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c;
    if (c < cols - 1) relax(i, i + 1, 3);
    if (r < rows - 1) { relax(i, i + cols, 3); if (c < cols - 1) relax(i, i + cols + 1, 4); if (c > 0) relax(i, i + cols - 1, 4); }
  }
  for (let i = 0; i < D.length; i++) D[i] = D[i] / 3 / g.res;
  return D;
}

/** The move between two odometry poses as turn, drive, turn (a turn on the spot is all second turn). */
const motion = (a: Pose, b: Pose) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), r1 = d < 0.01 ? 0 : wrap(Math.atan2(b[1] - a[1], b[0] - a[0]) - a[2]); return { r1, d, r2: wrap(b[2] - a[2] - r1) }; };
/** A robot driven along a path: the true poses, the odometry (its increments with drift and noise) and the scans. */
export function simulateRun(g: Grid, path: [number, number][], o: { beams?: number; maxRange?: number; rangeNoise?: number; odomNoise?: number; every?: number; speed?: number; seed?: number } = {}) {
  const rand = lcg(o.seed ?? 4), every = o.every ?? 4, maxR = o.maxRange ?? 8, nb = o.beams ?? 90, an = beams(nb), on = o.odomNoise ?? 0.05;
  // A short look-ahead, so the robot cuts corners little; it never drives into a wall (it waits instead).
  const driven = followPath(path, { speed: o.speed ?? 0.8, dt: 0.05, look: 0.5 }).poses;
  for (let k = 1; k < driven.length; k++) if (!freeAt(g, driven[k][0], driven[k][1])) driven[k] = driven[k - 1];
  const truth = driven.filter((_, k, a) => k % every === 0 || k === a.length - 1);
  const odom: Pose[] = [truth[0]];
  for (let k = 1; k < truth.length; k++) {
    const { r1, d, r2 } = motion(truth[k - 1], truth[k]);
    // The wheels slip a little: each part of the move off by a few percent, and a steady drift in heading.
    const dn = d * (1 + on * gauss(rand)), r1n = r1 + on * 0.5 * gauss(rand) * (Math.abs(r1) + d), r2n = r2 + on * 0.5 * gauss(rand) * (Math.abs(r2) + d) + on * 0.05 * d;
    const p = odom[k - 1];
    odom.push([p[0] + dn * Math.cos(p[2] + r1n), p[1] + dn * Math.sin(p[2] + r1n), wrap(p[2] + r1n + r2n)]);
  }
  const scans = truth.map((p) => scan(g, p, an, maxR, o.rangeNoise ?? 0.03, rand));
  return { truth, odom, scans, angles: an, maxRange: maxR };
}


export interface MclStep { pose: Pose; particles: Float32Array; spread: number }
/** Monte Carlo localisation over a whole run. `start` given: particles round it (tracking); otherwise spread over the
 * free space (global localisation: the robot doesn't know where it is). */
export function mcl(g: Grid, odom: Pose[], scans: number[][], angles: number[], o: { particles?: number; start?: Pose; maxRange?: number; sigma?: number; seed?: number; alpha?: number; beamStep?: number; temper?: number } = {}): MclStep[] {
  const N = o.particles ?? (o.start ? 500 : 5000), rand = lcg(o.seed ?? 9), D = distanceField(g), maxR = o.maxRange ?? 8, sigma = o.sigma ?? 0.3, a = o.alpha ?? 0.1, step = o.beamStep ?? 3, temper = o.temper ?? 2;
  const X = new Float64Array(N), Y = new Float64Array(N), T = new Float64Array(N), W = new Float64Array(N), keep = new Float64Array(N).fill(1);
  const W_ = (g.cols / g.res), H_ = (g.rows / g.res);
  const randomFree = (i: number) => { for (let k = 0; k < 1000; k++) { const x = rand() * W_, y = rand() * H_; if (freeAt(g, x, y)) { X[i] = x; Y[i] = y; T[i] = (rand() * 2 - 1) * Math.PI; return; } } };
  for (let i = 0; i < N; i++) {
    if (o.start) { X[i] = o.start[0] + 0.2 * gauss(rand); Y[i] = o.start[1] + 0.2 * gauss(rand); T[i] = o.start[2] + 0.1 * gauss(rand); } else randomFree(i);
  }
  const out: MclStep[] = [];
  let wSlow: number | null = null, wFast: number | null = null;
  const likelihood = (i: number, z: number[]) => {
    let logp = 0, used = 0;
    for (let k = 0; k < angles.length; k += step) {
      if (z[k] >= maxR - 1e-9) continue;
      const ex = X[i] + z[k] * Math.cos(T[i] + angles[k]), ey = Y[i] + z[k] * Math.sin(T[i] + angles[k]);
      const [r, c] = cellOf(g, ex, ey), dist = r < 0 || c < 0 || r >= g.rows || c >= g.cols ? 2 : D[r * g.cols + c];
      // A mixture: mostly a Gaussian round the wall, a little for anything (a person walking by).
      logp += Math.log(0.9 * Math.exp((-dist * dist) / (2 * sigma * sigma)) + 0.1 / maxR);
      used++;
    }
    // Tempered: the beams of one scan aren't independent, so together they count as about `temper` beams (else one
    // scan makes the filter certain at once, often wrongly).
    return used ? (logp * temper) / used : 0;
  };
  for (let k = 0; k < odom.length; k++) {
    if (k > 0) {
      const m = motion(odom[k - 1], odom[k]);
      for (let i = 0; i < N; i++) {
        const r1 = m.r1 + a * gauss(rand) * (Math.abs(m.r1) + m.d * 0.5), d = m.d + a * gauss(rand) * (m.d + 0.2 * (Math.abs(m.r1) + Math.abs(m.r2))), r2 = m.r2 + a * gauss(rand) * (Math.abs(m.r2) + m.d * 0.5);
        X[i] += d * Math.cos(T[i] + r1); Y[i] += d * Math.sin(T[i] + r1); T[i] = wrap(T[i] + r1 + r2);
      }
    }
    let best = -Infinity;
    for (let i = 0; i < N; i++) { W[i] = (freeAt(g, X[i], Y[i]) ? likelihood(i, scans[k]) : -Infinity) + Math.log(Math.max(1e-300, keep[i])); best = Math.max(best, W[i]); }
    let sum = 0;
    for (let i = 0; i < N; i++) { W[i] = Number.isFinite(W[i]) ? Math.exp(W[i] - best) : 0; sum += W[i]; }
    if (!(sum > 0)) { for (let i = 0; i < N; i++) W[i] = 1; sum = N; }
    // Augmented MCL: when scans fit worse than they have lately (a short average falling below a long one), the
    // filter may be lost, so more particles are thrown anywhere free.
    const avg = best + Math.log(sum / N);
    if (Number.isFinite(avg)) { wSlow = wSlow === null ? avg : wSlow + 0.05 * (avg - wSlow); wFast = wFast === null ? avg : wFast + 0.3 * (avg - wFast); }
    // The weighted mean pose (heading by its sine and cosine).
    let mx = 0, my = 0, sx = 0, cx = 0;
    for (let i = 0; i < N; i++) { const w = W[i] / sum; mx += w * X[i]; my += w * Y[i]; sx += w * Math.sin(T[i]); cx += w * Math.cos(T[i]); }
    let spread = 0;
    for (let i = 0; i < N; i++) spread += (W[i] / sum) * ((X[i] - mx) ** 2 + (Y[i] - my) ** 2);
    const parts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { parts[i * 3] = X[i]; parts[i * 3 + 1] = Y[i]; parts[i * 3 + 2] = T[i]; }
    out.push({ pose: [mx, my, Math.atan2(sx, cx)], particles: parts, spread: Math.sqrt(spread) });
    // Resample only when the weights have piled onto few particles (effective number under half).
    let ess = 0;
    for (let i = 0; i < N; i++) ess += (W[i] / sum) ** 2;
    if (1 / ess > N / 2) { for (let i = 0; i < N; i++) keep[i] = W[i] / sum; continue; }
    keep.fill(1);
    // Low-variance resampling.
    const nx = new Float64Array(N), ny = new Float64Array(N), nt = new Float64Array(N), stepW = sum / N;
    let u = rand() * stepW, c = W[0], j = 0;
    for (let i = 0; i < N; i++) { while (u > c && j < N - 1) { j++; c += W[j]; } nx[i] = X[j]; ny[i] = Y[j]; nt[i] = T[j]; u += stepW; }
    X.set(nx); Y.set(ny); T.set(nt);
    const inject = o.start ? 0 : Math.min(0.25, Math.max(0.01, 1 - Math.exp((wFast ?? 0) - (wSlow ?? 0))));
    for (let i = 0; i < Math.floor(N * inject); i++) randomFree(Math.floor(rand() * N));
  }
  return out;
}

// ——— Mapping ———
export interface LogMap { rows: number; cols: number; res: number; x0: number; y0: number; L: Float32Array }
const L_OCC = 0.85, L_FREE = -0.4, L_MAX = 6;
export function emptyMap(w: number, h: number, res: number, x0 = 0, y0 = 0): LogMap { const rows = Math.ceil(h * res), cols = Math.ceil(w * res); return { rows, cols, res, x0, y0, L: new Float32Array(rows * cols) }; }
const cellIn = (m: LogMap, x: number, y: number) => { const c = Math.floor((x - m.x0) * m.res), r = m.rows - 1 - Math.floor((y - m.y0) * m.res); return r >= 0 && c >= 0 && r < m.rows && c < m.cols ? r * m.cols + c : -1; };
/** Adds one scan: the cells each beam crosses get freer, the cell it ends in more blocked (log-odds). */
export function addScan(m: LogMap, pose: Pose, ranges: number[], angles: number[], maxR: number) {
  for (let k = 0; k < angles.length; k++) {
    const r = Math.min(ranges[k], maxR), a = pose[2] + angles[k], free = Math.max(0, r - (ranges[k] < maxR - 1e-9 ? 0.5 / m.res : 0)), n = Math.ceil(free * m.res * 2);
    let last = -1;
    for (let s = 0; s < n; s++) { const t = (s / n) * free, i = cellIn(m, pose[0] + t * Math.cos(a), pose[1] + t * Math.sin(a)); if (i >= 0 && i !== last) { m.L[i] = Math.max(-L_MAX, m.L[i] + L_FREE); last = i; } }
    // The wall is just past the beam's end (half a cell on, so a beam meeting a wall from either side marks the wall's cell).
    if (ranges[k] < maxR - 1e-9) { const e = r + 0.5 / m.res, i = cellIn(m, pose[0] + e * Math.cos(a), pose[1] + e * Math.sin(a)); if (i >= 0) m.L[i] = Math.min(L_MAX, m.L[i] + L_OCC - L_FREE); }
  }
}
export const probability = (m: LogMap) => Float32Array.from(m.L, (l) => 1 - 1 / (1 + Math.exp(l)));
/** How well a scan from a pose fits the map: each beam's end scored by how near it lands to a wall seen so far
 * (a Gaussian of the distance, from `D`, the distance to the nearest blocked cell of the map). */
function fit(m: LogMap, D: Float32Array, pose: Pose, ranges: number[], angles: number[], maxR: number, step: number) {
  let s = 0;
  for (let k = 0; k < angles.length; k += step) {
    if (ranges[k] >= maxR - 1e-9) continue;
    const a = pose[2] + angles[k], e = ranges[k] + 0.5 / m.res, i = cellIn(m, pose[0] + e * Math.cos(a), pose[1] + e * Math.sin(a));
    // Near a mapped wall scores; landing in space already seen to be empty costs (a wall can't be there).
    if (i >= 0) s += m.L[i] < -1 ? -0.5 : Math.exp(-(D[i] * D[i]) / (2 * 0.12 * 0.12));
  }
  return s;
}
/** The distance from each cell to the nearest one the map holds as blocked. */
const wallDistance = (m: LogMap) => distanceField({ rows: m.rows, cols: m.cols, res: m.res, cells: Uint8Array.from(m.L, (l) => (l > 0.5 ? 1 : 0)) });
/** The map from scans at known poses (the extent from the poses and the range). */
export function buildMap(scans: number[][], poses: Pose[], angles: number[], res: number, maxR: number): LogMap {
  const xs = poses.map((p) => p[0]), ys = poses.map((p) => p[1]);
  const x0 = Math.min(...xs) - maxR, y0 = Math.min(...ys) - maxR, m = emptyMap(Math.max(...xs) - x0 + maxR, Math.max(...ys) - y0 + maxR, res, x0, y0);
  scans.forEach((z, k) => addScan(m, poses[k], z, angles, maxR));
  return m;
}
/** SLAM: each new pose is the odometry's step from the last corrected pose, refined by matching the scan to the map so
 * far (coarse then fine search in x, y and heading), then the scan is added. Returns the map and the poses; maps of
 * the snapshots along the way when asked. */
export function slam(scans: number[][], odom: Pose[], angles: number[], res: number, maxR: number, o: { window?: number; snapshots?: number } = {}) {
  const xs = odom.map((p) => p[0]), ys = odom.map((p) => p[1]), pad = maxR + 2;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, m = emptyMap(Math.max(...xs) - x0 + pad, Math.max(...ys) - y0 + pad, res, x0, y0);
  const poses: Pose[] = [odom[0]], snaps: { k: number; p: Float32Array }[] = [], win = o.window ?? 0.2;
  addScan(m, odom[0], scans[0], angles, maxR);
  for (let k = 1; k < odom.length; k++) {
    const mv = motion(odom[k - 1], odom[k]), p = poses[k - 1];
    let guess: Pose = [p[0] + mv.d * Math.cos(p[2] + mv.r1), p[1] + mv.d * Math.sin(p[2] + mv.r1), wrap(p[2] + mv.r1 + mv.r2)];
    const D = wallDistance(m), odo = guess;
    // A small price for straying from the odometry's guess, so an empty view doesn't pull the pose anywhere.
    const score = (c: Pose) => fit(m, D, c, scans[k], angles, maxR, 1) - 8 * (((c[0] - odo[0]) ** 2 + (c[1] - odo[1]) ** 2) / (win * win) + wrap(c[2] - odo[2]) ** 2 / 0.0025);
    // Match only when enough of the scan lands on walls already mapped (else it's a new room: trust the odometry).
    let valid = 0, seen = 0;
    for (let b = 0; b < angles.length; b++) {
      if (scans[k][b] >= maxR - 1e-9) continue;
      valid++;
      const a = odo[2] + angles[b], e = scans[k][b] + 0.5 / m.res, i = cellIn(m, odo[0] + e * Math.cos(a), odo[1] + e * Math.sin(a));
      if (i >= 0 && D[i] < 0.3) seen++;
    }
    if (seen >= 0.6 * valid) for (const [span, n, turn] of [[win, 5, 0.05], [win / 4, 3, 0.012], [win / 12, 2, 0.003]] as const) {
      let best = guess, bs = score(guess);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let t = -3; t <= 3; t++) {
        const c: Pose = [guess[0] + (i / n) * span, guess[1] + (j / n) * span, wrap(guess[2] + (t / 3) * turn)], sc = score(c);
        if (sc > bs + 1e-9) { bs = sc; best = c; }
      }
      guess = best;
    }
    poses.push(guess);
    addScan(m, guess, scans[k], angles, maxR);
    if (o.snapshots && (k % Math.max(1, Math.floor(odom.length / o.snapshots)) === 0 || k === odom.length - 1)) snaps.push({ k, p: probability(m) });
  }
  return { map: m, poses, snaps };
}
