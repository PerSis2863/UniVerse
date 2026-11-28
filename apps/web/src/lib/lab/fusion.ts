// Hyperion's sensor fusion and tracking (M575, the owner, 27 Nov: the automated-driving page's perception): a
// multi-object tracker that fuses the camera's positions and the radar's range, azimuth and range rate (an extended
// Kalman filter, constant velocity), assigns detections to tracks by the Hungarian method inside a gate, confirms after
// 2 of 3 hits, drops after 5 misses and merges two tracks of one object; GOSPA and OSPA to score tracks against the truth; orientation from an IMU
// (Madgwick's filter, 6-axis and with a magnetometer) and readings made from an orientation's history; and the scores
// for an object detector (box overlap, average precision). Pure, our own code from the published methods.

// ——— assignment ———
/** The cheapest one-to-one assignment of rows to columns (Hungarian method, Kuhn–Munkres with potentials) of a cost
 *  matrix, rectangular allowed; costs of Infinity are never chosen. Returns for each row its column, or −1. */
export function hungarian(C: number[][]): number[] {
  const n = C.length, m = n ? C[0].length : 0;
  if (!n || !m) return new Array(n).fill(-1);
  const N = Math.max(n, m), BIG = 1e12, a = (i: number, j: number) => (i < n && j < m && Number.isFinite(C[i][j]) ? C[i][j] : BIG);
  const u = new Array(N + 1).fill(0), v = new Array(N + 1).fill(0), p = new Array(N + 1).fill(0), way = new Array(N + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(N + 1).fill(Infinity), used = new Array(N + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= N; j++) if (!used[j]) { const cur = a(i0 - 1, j - 1) - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= N; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= N; j++) if (p[j] && p[j] - 1 < n && j - 1 < m && Number.isFinite(C[p[j] - 1][j - 1])) out[p[j] - 1] = j - 1;
  return out;
}

// ——— small matrices ———
type M = number[][];
const mm = (A: M, B: M): M => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
const tr = (A: M): M => A[0].map((_, j) => A.map((r) => r[j]));
const add = (A: M, B: M): M => A.map((r, i) => r.map((x, j) => x + B[i][j]));
const subm = (A: M, B: M): M => A.map((r, i) => r.map((x, j) => x - B[i][j]));
function inv(A: M): M {
  const n = A.length, X = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(X[r][c]) > Math.abs(X[p][c])) p = r; [X[c], X[p]] = [X[p], X[c]]; const d = X[c][c] || 1e-12; for (let k = 0; k < 2 * n; k++) X[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = X[r][c]; for (let k = 0; k < 2 * n; k++) X[r][k] -= f * X[c][k]; } }
  return X.map((r) => r.slice(n));
}

// ——— the tracker ———
/** A detection in the world: a camera's position (x, y, with its covariance), or a radar's polar measurement from a
 *  sensor at (sx, sy) looking along `look`, the ego vehicle moving at (evx, evy). */
export type Meas =
  | { t: number; kind: 'pos'; z: [number, number]; R: M }
  | { t: number; kind: 'radar'; z: [number, number, number]; R: M; sx: number; sy: number; look: number; evx: number; evy: number };
export interface Track { id: number; x: number[]; P: M; hits: number; misses: number; age: number; confirmed: boolean; history: boolean[] }
export interface TrackStep { t: number; tracks: { id: number; x: number; y: number; vx: number; vy: number; confirmed: boolean }[] }
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function predict(T: Track, dt: number, q: number) {
  const F = [[1, dt, 0, 0], [0, 1, 0, 0], [0, 0, 1, dt], [0, 0, 0, 1]], g = [[dt * dt / 2, dt, 0, 0], [0, 0, dt * dt / 2, dt]];
  const Q = mm(tr(g), g).map((r) => r.map((v) => v * q * q)); // white acceleration of spread q
  T.x = mm(F, T.x.map((v) => [v])).map((r) => r[0]);
  T.P = add(mm(mm(F, T.P), tr(F)), Q);
}
/** The predicted measurement, its Jacobian and the residual for a measurement against a track. */
function model(T: Track, z: Meas) {
  const [x, vx, y, vy] = T.x;
  if (z.kind === 'pos') return { H: [[1, 0, 0, 0], [0, 0, 1, 0]], r: [z.z[0] - x, z.z[1] - y] };
  const dx = x - z.sx, dy = y - z.sy, rng = Math.max(1e-3, Math.hypot(dx, dy)), rvx = vx - z.evx, rvy = vy - z.evy, rate = (dx * rvx + dy * rvy) / rng;
  const H = [
    [dx / rng, 0, dy / rng, 0],
    [-dy / (rng * rng), 0, dx / (rng * rng), 0],
    [(rvx * rng - dx * rate) / (rng * rng), dx / rng, (rvy * rng - dy * rate) / (rng * rng), dy / rng],
  ];
  return { H, r: [z.z[0] - rng, wrapA(z.z[1] - (Math.atan2(dy, dx) - z.look)), z.z[2] - rate] };
}
function newTrack(id: number, z: Meas, P0v: number): Track | null {
  let px: number, py: number;
  if (z.kind === 'pos') [px, py] = z.z; else { const a = z.z[1] + z.look; px = z.sx + z.z[0] * Math.cos(a); py = z.sy + z.z[0] * Math.sin(a); }
  // a radar knows the speed along its line of sight: start the track moving with the ego vehicle plus that
  let vx = 0, vy = 0;
  if (z.kind === 'radar') { const a = z.z[1] + z.look; vx = z.evx + z.z[2] * Math.cos(a); vy = z.evy + z.z[2] * Math.sin(a); }
  return { id, x: [px, vx, py, vy], P: [[4, 0, 0, 0], [0, P0v, 0, 0], [0, 0, 4, 0], [0, 0, 0, P0v]], hits: 0, misses: 0, age: 0, confirmed: false, history: [] };
}
/** Tracks from detections at their times (several sensors, one after another each step): the gate is the χ² 99%
 *  value for the measurement's size, `confirm` [M N] hits of the last N, dropped after `drop` misses in a row (a
 *  tentative track after one). */
export function track(steps: { t: number; meas: Meas[] }[], o: { q?: number; confirm?: [number, number]; drop?: number; initVel?: number } = {}): TrackStep[] {
  const q = o.q ?? 2, [cm, cn] = o.confirm ?? [2, 3], drop = o.drop ?? 5, gates: Record<number, number> = { 2: 9.21, 3: 11.34 };
  let tracks: Track[] = [], nextId = 1, tPrev = steps[0]?.t ?? 0;
  const out: TrackStep[] = [];
  for (const step of steps) {
    const dt = step.t - tPrev; tPrev = step.t;
    for (const T of tracks) if (dt > 0) predict(T, dt, q);
    const hit = new Set<number>();
    // each sensor's batch in turn (camera then radar), so one track may take one detection from each
    const batches = [step.meas.filter((m) => m.kind === 'pos'), step.meas.filter((m) => m.kind === 'radar')];
    for (const batch of batches) {
      if (!batch.length) continue;
      const cost = tracks.map((T) => batch.map((z) => { const { H, r } = model(T, z), S = add(mm(mm(H, T.P), tr(H)), z.R), Si = inv(S), d2 = r.reduce((s, ri, i) => s + ri * r.reduce((s2, rj, j) => s2 + Si[i][j] * rj, 0), 0); return d2 <= gates[r.length] ? d2 : Infinity; }));
      const asg = hungarian(cost), used = new Set<number>();
      asg.forEach((j, i) => {
        if (j < 0) return;
        const T = tracks[i], z = batch[j], { H, r } = model(T, z), S = add(mm(mm(H, T.P), tr(H)), z.R), K = mm(mm(T.P, tr(H)), inv(S));
        T.x = T.x.map((v, k) => v + K[k].reduce((s, kk, c) => s + kk * r[c], 0));
        T.P = mm(subm([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], mm(K, H)), T.P);
        hit.add(T.id); used.add(j);
      });
      // detections no track took start tentative tracks, unless one falls inside an existing track's gate (then it is
      // that object seen again, not a new one: a second track would duplicate it)
      batch.forEach((z, j) => { if (!used.has(j) && cost.every((row) => !Number.isFinite(row[j]))) { const T = newTrack(nextId, z, o.initVel ?? 100); if (T) { nextId++; tracks.push(T); hit.add(T.id); } } });
    }
    for (const T of tracks) {
      const h = hit.has(T.id);
      T.history.push(h); if (h) { T.hits++; T.misses = 0; } else T.misses++;
      T.history = T.history.slice(-cn); T.age++;
      if (!T.confirmed && T.history.filter(Boolean).length >= cm) T.confirmed = true;
    }
    // two tracks of one object (within the 99% gate of their joint uncertainty, moving alike) merge into the older
    for (let i = 0; i < tracks.length; i++) for (let j = i + 1; j < tracks.length; j++) {
      const A = tracks[i], B = tracks[j];
      if (A.misses < 0 || B.misses < 0) continue;
      const dx = A.x[0] - B.x[0], dy = A.x[2] - B.x[2], Sxx = A.P[0][0] + B.P[0][0], Sxy = A.P[0][2] + B.P[0][2], Syy = A.P[2][2] + B.P[2][2], det = Sxx * Syy - Sxy * Sxy;
      const d2 = det > 0 ? (Syy * dx * dx - 2 * Sxy * dx * dy + Sxx * dy * dy) / det : Infinity;
      if (d2 < gates[2] && Math.hypot(A.x[1] - B.x[1], A.x[3] - B.x[3]) < 3) { const young = A.id > B.id ? A : B, old = young === A ? B : A; old.confirmed ||= young.confirmed; young.misses = -1; }
    }
    tracks = tracks.filter((T) => T.misses >= 0);
    // a confirmed track coasts through `drop` misses; a tentative one goes once it can't reach M of its first N
    tracks = tracks.filter((T) => (T.confirmed ? T.misses < drop : T.history.filter(Boolean).length + Math.max(0, cn - T.age) >= cm));
    out.push({ t: step.t, tracks: tracks.map((T) => ({ id: T.id, x: T.x[0], y: T.x[2], vx: T.x[1], vy: T.x[3], confirmed: T.confirmed })) });
  }
  return out;
}

// ——— scores ———
/** GOSPA (Rahmathullah, García-Fernández, Svensson 2017) with α = 2: localisation (assigned pairs within c), missed
 *  and false targets each costing c^p / 2; and its parts. */
export function gospa(est: [number, number][], truth: [number, number][], c = 5, p = 2) {
  const cost = est.map((e) => truth.map((g) => Math.min(Math.hypot(e[0] - g[0], e[1] - g[1]), c) ** p));
  const asg = hungarian(cost);
  let loc = 0, pairs = 0;
  asg.forEach((j, i) => { if (j >= 0 && cost[i][j] < c ** p) { loc += cost[i][j]; pairs++; } });
  const missed = truth.length - pairs, falseT = est.length - pairs;
  return { gospa: (loc + (c ** p / 2) * (missed + falseT)) ** (1 / p), localization: loc ** (1 / p), missed, false: falseT };
}
/** OSPA (Schuhmacher et al. 2008): the mean per target, with cardinality penalty c. */
export function ospa(est: [number, number][], truth: [number, number][], c = 5, p = 2) {
  const m = est.length, n = truth.length;
  if (!m && !n) return 0;
  if (!m || !n) return c;
  const [A, B] = m <= n ? [est, truth] : [truth, est], cost = A.map((e) => B.map((g) => Math.min(Math.hypot(e[0] - g[0], e[1] - g[1]), c) ** p)), asg = hungarian(cost);
  const sum = asg.reduce((s, j, i) => s + (j >= 0 ? cost[i][j] : c ** p), 0);
  return ((sum + c ** p * Math.abs(n - m)) / Math.max(m, n)) ** (1 / p);
}
/** Intersection over union of boxes [x y w h] (rows of A against rows of B). */
export const iou = (a: number[], b: number[]) => { const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]), i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0), u = a[2] * a[3] + b[2] * b[3] - i; return u > 0 ? i / u : 0; };
/** Average precision of detections (boxes with scores, per image) against ground truth at an IoU threshold (each
 *  truth matched once, highest scores first; the area under the precision–recall curve made monotone). */
export function averagePrecision(det: { img: number; box: number[]; score: number }[], gt: { img: number; box: number[] }[], thr = 0.5) {
  const order = [...det].sort((a, b) => b.score - a.score), taken = new Set<number>();
  const tp: number[] = [], fp: number[] = [];
  for (const d of order) {
    let best = -1, bi = -1;
    gt.forEach((g, i) => { if (g.img !== d.img || taken.has(i)) return; const o = iou(d.box, g.box); if (o > best) { best = o; bi = i; } });
    if (best >= thr) { taken.add(bi); tp.push(1); fp.push(0); } else { tp.push(0); fp.push(1); }
  }
  let ctp = 0, cfp = 0; const rec: number[] = [], prec: number[] = [];
  tp.forEach((t, i) => { ctp += t; cfp += fp[i]; rec.push(gt.length ? ctp / gt.length : 0); prec.push(ctp / (ctp + cfp)); });
  const mrec = [0, ...rec, 1], mpre = [1, ...prec, 0];
  for (let i = mpre.length - 2; i >= 0; i--) mpre[i] = Math.max(mpre[i], mpre[i + 1]);
  let ap = 0; for (let i = 1; i < mrec.length; i++) ap += (mrec[i] - mrec[i - 1]) * mpre[i];
  return { ap, recall: rec, precision: prec };
}

// ——— IMU orientation ———
export type Quat = [number, number, number, number];
const qmul = (a: Quat, b: Quat): Quat => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qnorm = (q: Quat): Quat => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n) as Quat; };
/** Euler angles [yaw pitch roll] (Z-Y-X, radians) of a quaternion [w x y z] (body to world). */
export const quatToEuler = ([w, x, y, z]: Quat): [number, number, number] => [Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)), Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))), Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))];
export const eulerToQuat = (yaw: number, pitch: number, roll: number): Quat => { const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(roll / 2), sr = Math.sin(roll / 2); return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy]; };
/** Rotate a world vector into the body frame by q (body to world). */
const toBody = (q: Quat, v: [number, number, number]) => { const c: Quat = [q[0], -q[1], -q[2], -q[3]]; const r = qmul(qmul(c, [0, ...v]), q); return [r[1], r[2], r[3]] as [number, number, number]; };
/** Madgwick's orientation filter (2010): gyroscope (rad/s) integrated, pulled towards where the accelerometer's
 *  gravity (and the magnetometer's field, when given) say it should be, by `beta`. World: x east, y north, z up; an
 *  accelerometer at rest reads +g along the body's up. */
export function madgwick(acc: number[][], gyr: number[][], fs: number, o: { mag?: number[][]; beta?: number; q0?: Quat } = {}) {
  const beta = o.beta ?? 0.1, dt = 1 / fs; let q: Quat = o.q0 ?? [1, 0, 0, 0];
  const out: Quat[] = [];
  for (let k = 0; k < gyr.length; k++) {
    const [gx, gy, gz] = gyr[k];
    let qd = qmul(q, [0, gx, gy, gz]).map((v) => v / 2) as Quat;
    const a = acc[k], an = Math.hypot(...a);
    if (an > 0) {
      const [ax, ay, az] = a.map((v) => v / an), [w, x, y, z] = q;
      // f = (expected gravity in the body) − measured; its gradient's steepest descent direction
      let f = [2 * (x * z - w * y) - ax, 2 * (w * x + y * z) - ay, 2 * (0.5 - x * x - y * y) - az];
      let J = [[-2 * y, 2 * z, -2 * w, 2 * x], [2 * x, 2 * w, 2 * z, 2 * y], [0, -4 * x, -4 * y, 0]];
      const m = o.mag?.[k], mn = m ? Math.hypot(...m) : 0;
      if (m && mn > 0) {
        const [mx, my, mz] = m.map((v) => v / mn);
        // the field in the world, its horizontal part along north (y) and its vertical part (b = [0, bn, bu])
        const hq = qmul(qmul(q, [0, mx, my, mz]), [w, -x, -y, -z]), bn = Math.hypot(hq[1], hq[2]), bu = hq[3];
        const e = toBody(q, [0, bn, bu]);
        f = [...f, e[0] - mx, e[1] - my, e[2] - mz];
        // numerical Jacobian of the field part (four parameters), simple and exact enough
        const rows: number[][] = [[], [], []];
        for (let pi = 0; pi < 4; pi++) { const qq = [...q] as Quat; qq[pi] += 1e-6; const e2 = toBody(qq, [0, bn, bu]); for (let r = 0; r < 3; r++) rows[r].push((e2[r] - e[r]) / 1e-6); }
        J = [...J, ...rows];
      }
      const grad = [0, 1, 2, 3].map((c) => J.reduce((s, row, r) => s + row[c] * f[r], 0)), gn = Math.hypot(...grad);
      if (gn > 0) qd = qd.map((v, i) => v - (beta * grad[i]) / gn) as Quat;
    }
    q = qnorm(q.map((v, i) => v + qd[i] * dt) as Quat);
    out.push(q);
  }
  return out;
}
/** What an IMU would read along an orientation history (Euler angles [yaw pitch roll] in radians each sample at fs):
 *  the accelerometer (gravity in the body, m/s²), the gyroscope (the body rates, rad/s, with `bias`) and a
 *  magnetometer (a field of 50 µT, 60° down, towards north), each with white noise. */
export function imuReadings(euler: number[][], fs: number, o: { accNoise?: number; gyroNoise?: number; magNoise?: number; bias?: [number, number, number]; seed?: number } = {}) {
  let s = (o.seed ?? 1) >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }, g = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const Q = euler.map((e) => eulerToQuat(e[0], e[1], e[2])), field: [number, number, number] = [0, 50 * Math.cos(Math.PI / 3), -50 * Math.sin(Math.PI / 3)];
  const acc = Q.map((q) => toBody(q, [0, 0, 9.81]).map((v) => v + g() * (o.accNoise ?? 0.02)));
  const mag = Q.map((q) => toBody(q, field).map((v) => v + g() * (o.magNoise ?? 0.3)));
  const gyr = Q.map((q, k) => {
    const q2 = Q[Math.min(Q.length - 1, k + 1)], q1 = Q[Math.max(0, k - 1)], span = (Math.min(Q.length - 1, k + 1) - Math.max(0, k - 1)) / fs || 1;
    // body rate from the change of orientation: 2 q⁻¹ dq/dt
    const dq = q2.map((v, i) => (v - q1[i]) / span) as Quat, w = qmul([q[0], -q[1], -q[2], -q[3]], dq).map((v) => 2 * v);
    return [1, 2, 3].map((i, j) => w[i] + (o.bias?.[j] ?? 0) + g() * (o.gyroNoise ?? 0.005));
  });
  return { acc, gyr, mag };
}
