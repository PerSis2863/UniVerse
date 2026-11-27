// Hyperion's driving scenarios (M573, the owner, 27 Nov: MathWorks' automated-driving page, "build this"): roads
// through centre points (smoothed, lanes and markings), actors (cars, trucks, people, bikes) as cuboids following
// waypoints at their speeds, sensors on the ego vehicle that see that world the way the cuboid simulation of the
// Driving Scenario Designer does (a camera's object and lane detections, a radar's, a lidar's point cloud: noise,
// misses, false alarms, things hidden behind others), collisions, and OpenDRIVE (.xodr) out and in. Pure, our own code.

export type Rand = () => number;
export function seeded(seed = 1): Rand { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r: Rand) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const poisson = (r: Rand, lam: number) => { let k = 0, p = Math.exp(-lam), s = p; const u = r(); while (u > s && k < 50) { k++; p *= lam / k; s += p; } return k; };

export interface RoadSpec { centers: [number, number][]; lanes: number; laneWidth: number; name?: string }
export interface Road extends RoadSpec { x: number[]; y: number[]; h: number[]; s: number[] }
export type ActorClass = 'car' | 'truck' | 'pedestrian' | 'bicycle';
export const CLASS_ID: Record<ActorClass, number> = { car: 1, truck: 2, pedestrian: 3, bicycle: 4 };
const SIZE: Record<ActorClass, [number, number, number]> = { car: [4.7, 1.8, 1.4], truck: [8.2, 2.5, 3.5], pedestrian: [0.24, 0.45, 1.7], bicycle: [1.7, 0.45, 1.7] };
const RCS: Record<ActorClass, number> = { car: 10, truck: 20, pedestrian: -5, bicycle: 0 };
export interface ActorSpec { cls: ActorClass; position: [number, number]; yaw?: number; length?: number; width?: number; height?: number; waypoints?: [number, number][]; speeds?: number[]; wait?: number; name?: string }
export type SensorKind = 'vision' | 'radar' | 'lidar';
export interface SensorSpec { kind: SensorKind; mount?: [number, number, number]; yaw?: number; fov?: number; range?: number; pd?: number; falseAlarms?: number; noise?: number; channels?: number; azRes?: number; vfov?: [number, number] }
export interface ScenarioSpec { dt: number; stop: number; roads: RoadSpec[]; actors: ActorSpec[]; sensors: SensorSpec[]; seed?: number; ego?: number }

/** Points every `step` m along a centripetal-free (uniform) Catmull-Rom curve through the points: x, y, heading, distance. */
export function smooth(pts: [number, number][], step = 0.5) {
  if (pts.length < 2) throw new Error('A path needs at least two points.');
  const P = [pts[0].map((v, i) => 2 * v - pts[1][i]) as [number, number], ...pts, pts[pts.length - 1].map((v, i) => 2 * v - pts[pts.length - 2][i]) as [number, number]];
  const fine: [number, number][] = [];
  for (let i = 1; i + 2 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]], seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(seg / (step / 4)));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      fine.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)) as [number, number]);
    }
  }
  fine.push(pts[pts.length - 1]);
  // resample by distance
  const x: number[] = [fine[0][0]], y: number[] = [fine[0][1]], s: number[] = [0];
  let acc = 0, next = step;
  for (let i = 1; i < fine.length; i++) {
    const d = Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
    while (acc + d >= next && d > 0) { const w = (next - acc) / d; x.push(fine[i - 1][0] + w * (fine[i][0] - fine[i - 1][0])); y.push(fine[i - 1][1] + w * (fine[i][1] - fine[i - 1][1])); s.push(next); next += step; }
    acc += d;
  }
  if (acc - s[s.length - 1] > 1e-6) { x.push(fine[fine.length - 1][0]); y.push(fine[fine.length - 1][1]); s.push(acc); }
  const h = x.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(x.length - 1, i + 1); return Math.atan2(y[b] - y[a], x[b] - x[a]); });
  return { x, y, h, s };
}
export const makeRoad = (r: RoadSpec): Road => ({ ...r, ...smooth(r.centers) });
/** A road's lane boundaries as polylines: index 0 is the right edge (looking along the road), the last the left edge. */
export function laneBoundaries(r: Road) {
  const n = r.lanes, W = n * r.laneWidth;
  return Array.from({ length: n + 1 }, (_, i) => { const off = -W / 2 + i * r.laneWidth; return { solid: i === 0 || i === n, x: r.x.map((x, k) => x - off * Math.sin(r.h[k])), y: r.y.map((y, k) => y + off * Math.cos(r.h[k])) }; });
}

export interface Pose { x: number; y: number; yaw: number; v: number }
interface Actor extends ActorSpec { L: number; W: number; H: number; path?: ReturnType<typeof smooth>; spd?: number[] }
function prepActor(a: ActorSpec): Actor {
  const [L, W, H] = SIZE[a.cls];
  const out: Actor = { ...a, L: a.length ?? L, W: a.width ?? W, H: a.height ?? H };
  if (a.waypoints && a.waypoints.length >= 2) {
    out.path = smooth(a.waypoints, 0.25);
    // the speed at each waypoint spread along the path by distance
    const sp = a.speeds && a.speeds.length ? a.speeds : [10];
    const wpS = a.waypoints.map((w) => { let best = 0, bd = Infinity; out.path!.x.forEach((x, i) => { const d = Math.hypot(x - w[0], out.path!.y[i] - w[1]); if (d < bd) { bd = d; best = i; } }); return out.path!.s[best]; });
    out.spd = out.path.s.map((s) => { if (sp.length === 1) return sp[0]; let k = 0; while (k + 1 < wpS.length && wpS[k + 1] < s) k++; const k2 = Math.min(wpS.length - 1, k + 1), w = wpS[k2] > wpS[k] ? (s - wpS[k]) / (wpS[k2] - wpS[k]) : 0; return (sp[Math.min(k, sp.length - 1)] ?? sp[sp.length - 1]) * (1 - w) + (sp[Math.min(k2, sp.length - 1)] ?? sp[sp.length - 1]) * w; });
  }
  return out;
}
/** Every actor's pose at every step: travelling its path by its speed (a speed of 0 at a waypoint holds there). */
function motion(actors: Actor[], dt: number, steps: number): Pose[][] {
  return actors.map((a) => {
    const out: Pose[] = [];
    if (!a.path) { for (let k = 0; k < steps; k++) out.push({ x: a.position[0], y: a.position[1], yaw: a.yaw ?? 0, v: 0 }); return out; }
    const p = a.path, sp = a.spd!, end = p.s[p.s.length - 1];
    let s = 0, i = 0;
    for (let k = 0; k < steps; k++) {
      while (i + 1 < p.s.length && p.s[i + 1] <= s) i++;
      const w = i + 1 < p.s.length ? (s - p.s[i]) / (p.s[i + 1] - p.s[i] || 1) : 0, j = Math.min(p.s.length - 1, i + 1);
      const v = k * dt < (a.wait ?? 0) || s >= end ? 0 : Math.max(0, sp[i] + w * (sp[j] - sp[i]));
      out.push({ x: p.x[i] + w * (p.x[j] - p.x[i]), y: p.y[i] + w * (p.y[j] - p.y[i]), yaw: p.h[i], v });
      s = Math.min(end, s + Math.max(0.05, v) * dt * (v > 0 ? 1 : 0));
    }
    return out;
  });
}
/** The cuboid's four ground corners (counter-clockwise), its reference point at the centre of its footprint. */
export const corners = (a: { L: number; W: number }, p: Pose): [number, number][] => [[a.L / 2, a.W / 2], [-a.L / 2, a.W / 2], [-a.L / 2, -a.W / 2], [a.L / 2, -a.W / 2]].map(([u, v]) => [p.x + u * Math.cos(p.yaw) - v * Math.sin(p.yaw), p.y + u * Math.sin(p.yaw) + v * Math.cos(p.yaw)]);
/** Do two convex polygons overlap (separating axis)? */
export function overlap(A: [number, number][], B: [number, number][]) {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length], nx = y2 - y1, ny = x1 - x2;
    const pa = A.map(([x, y]) => x * nx + y * ny), pb = B.map(([x, y]) => x * nx + y * ny);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
/** Where a ray from (ox, oy) along (dx, dy) first meets a convex polygon (distance), or Infinity. */
function rayPoly(ox: number, oy: number, dx: number, dy: number, P: [number, number][]) {
  let best = Infinity;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
    if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}
/** A ray (in 3D, from o along unit d) against an actor's cuboid: the distance, or Infinity (slab method in its frame). */
function rayBox(o: [number, number, number], d: [number, number, number], a: Actor, p: Pose) {
  const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw), rx = o[0] - p.x, ry = o[1] - p.y;
  const O = [rx * c - ry * s, rx * s + ry * c, o[2]], D = [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]];
  const lo = [-a.L / 2, -a.W / 2, 0], hi = [a.L / 2, a.W / 2, a.H];
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(D[k]) < 1e-12) { if (O[k] < lo[k] || O[k] > hi[k]) return Infinity; continue; }
    let ta = (lo[k] - O[k]) / D[k], tb = (hi[k] - O[k]) / D[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0 > 1e-6 ? t0 : Infinity;
}

export interface Detection { t: number; sensor: number; x: number; y: number; vx: number; vy: number; cls: number; truth: number; range?: number; az?: number; rate?: number }
export interface Lanes { t: number; sensor: number; left: number[] | null; right: number[] | null }
export interface Run {
  t: number[]; poses: Pose[][]; actors: { cls: ActorClass; L: number; W: number; H: number; name: string }[]; roads: Road[];
  detections: Detection[]; lanes: Lanes[]; clouds: { t: number; sensor: number; pts: number[][] }[]; collisions: { t: number; a: number; b: number }[];
}
const toSensor = (ego: Pose, s: SensorSpec, x: number, y: number) => {
  const c = Math.cos(-ego.yaw), sn = Math.sin(-ego.yaw), dx = x - ego.x, dy = y - ego.y;
  const ex = dx * c - dy * sn - (s.mount?.[0] ?? 0), ey = dx * sn + dy * c - (s.mount?.[1] ?? 0), m = -(s.yaw ?? 0) * Math.PI / 180;
  return [ex * Math.cos(m) - ey * Math.sin(m), ex * Math.sin(m) + ey * Math.cos(m)];
};
/** Fits y = c0 + c1 x + c2 x² + c3 x³ (least squares) to points; null with fewer than 6. */
function cubic(px: number[], py: number[]): number[] | null {
  if (px.length < 6) return null;
  const A = Array.from({ length: 4 }, () => new Array(5).fill(0));
  px.forEach((x, i) => { const r = [1, x, x * x, x * x * x]; for (let a = 0; a < 4; a++) { for (let b = 0; b < 4; b++) A[a][b] += r[a] * r[b]; A[a][4] += r[a] * py[i]; } });
  for (let c = 0; c < 4; c++) { let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-12) return null; for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
  return A.map((row, i) => row[4] / A[i][i]);
}

/** Runs the scenario: every actor's pose each step, each sensor's detections (and the camera's lanes, the lidar's
 *  points every `cloudEvery` steps), and collisions between actors. Actor `ego` (0 by default) carries the sensors. */
export function runScenario(spec: ScenarioSpec, o: { cloudEvery?: number } = {}): Run {
  if (!(spec.dt > 0 && spec.stop > 0 && spec.stop / spec.dt <= 20000)) throw new Error('A sample time above 0 and at most 20,000 steps.');
  if (!spec.actors.length) throw new Error('The scenario needs at least one actor (the ego vehicle).');
  const r = seeded(spec.seed ?? 1), steps = Math.floor(spec.stop / spec.dt + 1e-9) + 1, egoI = spec.ego ?? 0;
  const actors = spec.actors.map(prepActor), roads = spec.roads.map(makeRoad), poses = motion(actors, spec.dt, steps), t = Array.from({ length: steps }, (_, k) => k * spec.dt);
  const det: Detection[] = [], lanes: Lanes[] = [], clouds: Run['clouds'] = [], hits: Run['collisions'] = [], touching = new Set<string>();
  const bounds = roads.map(laneBoundaries);
  for (let k = 0; k < steps; k++) {
    const ego = poses[egoI][k], foot = actors.map((a, i) => corners(a, poses[i][k]));
    // collisions (once each time two start touching)
    for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) { const key = `${i},${j}`, now = overlap(foot[i], foot[j]); if (now && !touching.has(key)) hits.push({ t: t[k], a: i, b: j }); if (now) touching.add(key); else touching.delete(key); }
    spec.sensors.forEach((s, si) => {
      const fov = (s.fov ?? (s.kind === 'radar' ? 20 : s.kind === 'vision' ? 40 : 360)) * Math.PI / 180, R = s.range ?? (s.kind === 'radar' ? 174 : s.kind === 'vision' ? 150 : 120);
      const [mx, my] = [s.mount?.[0] ?? 0, s.mount?.[1] ?? 0], oxw = ego.x + mx * Math.cos(ego.yaw) - my * Math.sin(ego.yaw), oyw = ego.y + mx * Math.sin(ego.yaw) + my * Math.cos(ego.yaw);
      if (s.kind === 'lidar') {
        if (k % (o.cloudEvery ?? 10)) return;
        const ch = s.channels ?? 16, [v0, v1] = s.vfov ?? [-15, 15], az = (s.azRes ?? 0.4) * Math.PI / 180, z0 = s.mount?.[2] ?? 1.8, pts: number[][] = [];
        for (let c = 0; c < ch; c++) {
          const el = ((v0 + (ch > 1 ? (v1 - v0) * c / (ch - 1) : 0)) * Math.PI) / 180;
          for (let a = -fov / 2; a < fov / 2 - 1e-9; a += az) {
            const yawW = ego.yaw + (s.yaw ?? 0) * Math.PI / 180 + a, d: [number, number, number] = [Math.cos(el) * Math.cos(yawW), Math.cos(el) * Math.sin(yawW), Math.sin(el)];
            let best = d[2] < 0 ? -z0 / d[2] : Infinity;
            actors.forEach((ac, i) => { if (i !== egoI) best = Math.min(best, rayBox([oxw, oyw, z0], d, ac, poses[i][k])); });
            if (best > R) continue;
            const dist = best + gauss(r) * (s.noise ?? 0.02), [sx, sy] = toSensor(ego, s, oxw + d[0] * dist, oyw + d[1] * dist);
            pts.push([sx, sy, z0 + d[2] * dist]);
          }
        }
        clouds.push({ t: t[k], sensor: si, pts });
        return;
      }
      actors.forEach((ac, i) => {
        if (i === egoI) return;
        const P = poses[i][k], C = foot[i];
        // the point of its footprint closest to the sensor, and whether the sensor can see it (not hidden behind others)
        let cx = P.x, cy = P.y, bd = Infinity;
        for (let e = 0; e < 4; e++) { const [ax, ay] = C[e], [bx, by] = C[(e + 1) % 4], ex = bx - ax, ey = by - ay, u = Math.max(0, Math.min(1, ((oxw - ax) * ex + (oyw - ay) * ey) / (ex * ex + ey * ey))), px = ax + u * ex, py = ay + u * ey, dd = Math.hypot(px - oxw, py - oyw); if (dd < bd) { bd = dd; cx = px; cy = py; } }
        const [sx, sy] = toSensor(ego, s, cx, cy), rng = Math.hypot(sx, sy), az = Math.atan2(sy, sx);
        if (rng > R || Math.abs(az) > fov / 2) return;
        let seen = 0;
        for (const f of [0.1, 0.5, 0.9]) {
          const tx = C[0][0] + f * (C[2][0] - C[0][0]), ty = C[0][1] + f * (C[2][1] - C[0][1]), dx = tx - oxw, dy = ty - oyw, dist = Math.hypot(dx, dy);
          if (!actors.some((_, j) => j !== i && j !== egoI && rayPoly(oxw, oyw, dx / dist, dy / dist, foot[j]) < dist - 0.5)) seen++;
        }
        if (seen < 2) return; // mostly hidden
        const rel = toSensor(ego, s, P.x + Math.cos(P.yaw) * P.v, P.y + Math.sin(P.yaw) * P.v), base = toSensor(ego, s, P.x, P.y);
        const vx0 = rel[0] - base[0] - ego.v * Math.cos(-(s.yaw ?? 0) * Math.PI / 180), vy0 = rel[1] - base[1] - ego.v * Math.sin(-(s.yaw ?? 0) * Math.PI / 180);
        if (s.kind === 'vision') {
          if (r() > (s.pd ?? 0.9)) return;
          const n = s.noise ?? 1;
          det.push({ t: t[k], sensor: si, x: sx + gauss(r) * n * (0.1 + 0.01 * rng), y: sy + gauss(r) * n * 0.1, vx: vx0 + gauss(r) * n * 0.5, vy: vy0 + gauss(r) * n * 0.5, cls: CLASS_ID[ac.cls], truth: i });
        } else {
          // radar: the chance of detection from the target's echo strength (its radar cross-section) and range
          const snr = 30 + RCS[ac.cls] - 40 * Math.log10(Math.max(1, rng) / 30), pd = Math.min(s.pd ?? 0.99, 1 / (1 + Math.exp(-(snr - 10) / 2)));
          if (r() > pd) return;
          const n = s.noise ?? 1, rr = rng + gauss(r) * 0.5 * n, aa = az + gauss(r) * n * Math.PI / 180, rate = (sx * vx0 + sy * vy0) / Math.max(rng, 1e-6) + gauss(r) * 0.5 * n;
          det.push({ t: t[k], sensor: si, x: rr * Math.cos(aa), y: rr * Math.sin(aa), vx: vx0, vy: vy0, cls: 0, truth: i, range: rr, az: aa * 180 / Math.PI, rate });
        }
      });
      // false alarms, scattered in the field of view
      for (let f = poisson(r, s.falseAlarms ?? (s.kind === 'radar' ? 0.2 : 0.05)); f > 0; f--) { const rr = r() * R, aa = (r() - 0.5) * fov; det.push({ t: t[k], sensor: si, x: rr * Math.cos(aa), y: rr * Math.sin(aa), vx: 0, vy: 0, cls: 0, truth: -1, ...(s.kind === 'radar' ? { range: rr, az: aa * 180 / Math.PI, rate: -ego.v * Math.cos(aa) } : {}) }); }
      // the camera's lanes: the ego lane's two boundaries as cubics in the sensor's frame, up to 60 m ahead
      if (s.kind === 'vision' && bounds.length) {
        // which boundaries enclose the ego: on the first road it is on
        const road = roads.findIndex((rd) => rd.x.some((x, q) => Math.hypot(x - ego.x, rd.y[q] - ego.y) < rd.lanes * rd.laneWidth / 2 + 0.5));
        if (road >= 0) {
          const rd = roads[road]; let q0 = 0, bd = Infinity; rd.x.forEach((x, q) => { const d = Math.hypot(x - ego.x, rd.y[q] - ego.y); if (d < bd) { bd = d; q0 = q; } });
          const lat = -(ego.x - rd.x[q0]) * Math.sin(rd.h[q0]) + (ego.y - rd.y[q0]) * Math.cos(rd.h[q0]), lane = Math.max(0, Math.min(rd.lanes - 1, Math.floor((lat + rd.lanes * rd.laneWidth / 2) / rd.laneWidth)));
          const only = (bi: number) => { const pxs: number[] = [], pys: number[] = [], b = bounds[road][bi]; b.x.forEach((x, q) => { const [u, v] = toSensor(ego, s, x, b.y[q]); if (u > 1 && u < Math.min(60, R)) { pxs.push(u); pys.push(v + gauss(r) * 0.02); } }); return cubic(pxs, pys); };
          lanes.push({ t: t[k], sensor: si, left: only(lane + 1), right: only(lane) });
        }
      }
    });
  }
  return { t, poses, actors: actors.map((a, i) => ({ cls: a.cls, L: a.L, W: a.W, H: a.H, name: a.name ?? (i === egoI ? 'Ego' : `${a.cls} ${i}`) })), roads, detections: det, lanes, clouds, collisions: hits };
}

// ——— OpenDRIVE ———
const f6 = (x: number) => +x.toFixed(6);
/** Roads as OpenDRIVE 1.6: each road's centre points joined by cubic segments (paramPoly3, the same curve Hyperion
 *  draws), its lanes driving lanes of laneWidth, half each side of the reference line (an odd count shifted by a
 *  lane offset). */
export function writeOpenDRIVE(roads: RoadSpec[], name = 'Hyperion'): string {
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<OpenDRIVE>`, `  <header revMajor="1" revMinor="6" name="${name.replace(/[<&"]/g, '')}" version="1.00" vendor="Hyperion"/>`];
  roads.forEach((rs, id) => {
    const P = rs.centers, Q = [P[0].map((v, i) => 2 * v - P[1][i]), ...P, P[P.length - 1].map((v, i) => 2 * v - P[P.length - 2][i])];
    const geos: string[] = []; let s0 = 0;
    for (let i = 1; i + 2 < Q.length; i++) {
      const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
      // Catmull-Rom as a cubic in p ∈ [0, 1]: a + b p + c p² + d p³, then into the segment's own frame (u along hdg)
      const co = [0, 1].map((k) => [p1[k], 0.5 * (-p0[k] + p2[k]), 0.5 * (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]), 0.5 * (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k])]);
      const hdg = Math.atan2(co[1][1], co[0][1]), c = Math.cos(hdg), sn = Math.sin(hdg);
      const u = [0, 1, 2, 3].map((j) => (j === 0 ? 0 : co[0][j] * c + co[1][j] * sn)), v = [0, 1, 2, 3].map((j) => (j === 0 ? 0 : -co[0][j] * sn + co[1][j] * c));
      let len = 0, px = p1[0], py = p1[1];
      for (let q = 1; q <= 200; q++) { const t = q / 200, x = co[0][0] + co[0][1] * t + co[0][2] * t * t + co[0][3] * t * t * t, y = co[1][0] + co[1][1] * t + co[1][2] * t * t + co[1][3] * t * t * t; len += Math.hypot(x - px, y - py); px = x; py = y; }
      geos.push(`      <geometry s="${f6(s0)}" x="${f6(p1[0])}" y="${f6(p1[1])}" hdg="${f6(hdg)}" length="${f6(len)}">\n        <paramPoly3 aU="0" bU="${f6(u[1])}" cU="${f6(u[2])}" dU="${f6(u[3])}" aV="0" bV="${f6(v[1])}" cV="${f6(v[2])}" dV="${f6(v[3])}" pRange="normalized"/>\n      </geometry>`);
      s0 += len;
    }
    const nl = Math.floor(rs.lanes / 2), nr = rs.lanes - nl, off = (nr - nl) * rs.laneWidth / 2, lane = (i: number) => `          <lane id="${i}" type="driving" level="false">\n            <width sOffset="0" a="${f6(rs.laneWidth)}" b="0" c="0" d="0"/>\n            <roadMark sOffset="0" type="${Math.abs(i) === (i > 0 ? nl : nr) ? 'solid' : 'broken'}" color="standard" width="0.15"/>\n          </lane>`;
    out.push(`  <road name="${(rs.name ?? `Road ${id + 1}`).replace(/[<&"]/g, '')}" length="${f6(s0)}" id="${id + 1}" junction="-1">`, `    <planView>`, ...geos, `    </planView>`, `    <lanes>`, `      <laneOffset s="0" a="${f6(off)}" b="0" c="0" d="0"/>`, `      <laneSection s="0">`,
      ...(nl ? [`        <left>`, ...Array.from({ length: nl }, (_, i) => lane(nl - i)), `        </left>`] : []),
      `        <center>\n          <lane id="0" type="none" level="false">\n            <roadMark sOffset="0" type="${nl ? 'broken' : 'solid'}" color="standard" width="0.15"/>\n          </lane>\n        </center>`,
      `        <right>`, ...Array.from({ length: nr }, (_, i) => lane(-(i + 1))), `        </right>`, `      </laneSection>`, `    </lanes>`, `  </road>`);
  });
  out.push(`</OpenDRIVE>`, '');
  return out.join('\n');
}
const attr = (tag: string, name: string) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? m[1] : undefined; };
/** Roads from an OpenDRIVE file: each road's reference line sampled every `step` m (lines, arcs, spirals, poly3 and
 *  paramPoly3), the lane offset applied, and its driving lanes counted with the first lane section's width. */
export function readOpenDRIVE(xml: string, step = 2): RoadSpec[] {
  const roads: RoadSpec[] = [];
  for (const m of xml.matchAll(/<road\b([^>]*)>([\s\S]*?)<\/road>/g)) {
    const head = m[1], body = m[2], pts: [number, number][] = [];
    let last: [number, number] | null = null; // where the last geometry ends
    for (const g of body.matchAll(/<geometry\b([^>]*)>([\s\S]*?)<\/geometry>/g)) {
      const x0 = +attr(g[1], 'x')!, y0 = +attr(g[1], 'y')!, h0 = +attr(g[1], 'hdg')!, L = +attr(g[1], 'length')!, kind = /<(\w+)/.exec(g[2])?.[1] ?? 'line', tag = /<\w+[^>]*>/.exec(g[2])?.[0] ?? '';
      if (![x0, y0, h0, L].every(Number.isFinite) || L <= 0) continue;
      const n = Math.max(2, Math.ceil(L / step));
      if (kind === 'paramPoly3') {
        const c = ['aU', 'bU', 'cU', 'dU', 'aV', 'bV', 'cV', 'dV'].map((k) => +(attr(tag, k) ?? 0)), norm = attr(tag, 'pRange') !== 'arcLength';
        for (let q = 0; q <= n; q++) { const p = (q / n) * (norm ? 1 : L), u = c[0] + c[1] * p + c[2] * p * p + c[3] * p ** 3, v = c[4] + c[5] * p + c[6] * p * p + c[7] * p ** 3, pt: [number, number] = [x0 + u * Math.cos(h0) - v * Math.sin(h0), y0 + u * Math.sin(h0) + v * Math.cos(h0)]; if (q < n) pts.push(pt); else last = pt; }
      } else {
        // line, arc and spiral (curvature linear along it), and poly3 as a line: integrate the heading
        const k0 = kind === 'arc' ? +(attr(tag, 'curvature') ?? 0) : kind === 'spiral' ? +(attr(tag, 'curvStart') ?? 0) : 0, k1 = kind === 'spiral' ? +(attr(tag, 'curvEnd') ?? 0) : k0;
        let x = x0, y = y0, h = h0; const sub = 8, ds = L / n / sub;
        for (let q = 0; q < n; q++) { pts.push([x, y]); for (let e = 0; e < sub; e++) { const s = (q * sub + e + 0.5) * ds, k = k0 + (k1 - k0) * s / L; x += Math.cos(h + k * ds / 2) * ds; y += Math.sin(h + k * ds / 2) * ds; h += k * ds; } }
        last = [x, y];
      }
    }
    if (last) pts.push(last);
    if (pts.length < 2) continue;
    const off = +(attr(/<laneOffset\b[^>]*>/.exec(body)?.[0] ?? '', 'a') ?? 0);
    const sec = /<laneSection\b[\s\S]*?<\/laneSection>/.exec(body)?.[0] ?? '';
    const driving = [...sec.matchAll(/<lane\b([^>]*)>([\s\S]*?)<\/lane>/g)].filter((l) => attr(l[1], 'type') === 'driving' && attr(l[1], 'id') !== '0');
    const width = driving.length ? +(attr(/<width\b[^>]*>/.exec(driving[0][2])?.[0] ?? '', 'a') ?? 3.5) : 3.5;
    const nl = driving.filter((l) => +attr(l[1], 'id')! > 0).length, nr = driving.length - nl;
    // our centreline is the middle of the driving lanes: the reference line moved by the offset and the sides' difference
    const shift = off + (nl - nr) * width / 2;
    const hd = pts.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1); return Math.atan2(pts[b][1] - pts[a][1], pts[b][0] - pts[a][0]); });
    roads.push({ name: attr(head, 'name') || `Road ${attr(head, 'id') ?? roads.length + 1}`, lanes: Math.max(1, driving.length), laneWidth: width > 0 ? width : 3.5, centers: pts.map(([x, y], i) => [x - shift * Math.sin(hd[i]), y + shift * Math.cos(hd[i])]) });
  }
  if (!roads.length) throw new Error('No roads in this OpenDRIVE file.');
  return roads;
}
