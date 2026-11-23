// Hyperion's car-style route planning (M483b), pure. A car can't turn on the spot: it moves along arcs no tighter than
// its turning radius. Dubins paths are the shortest forward-only ways between two poses (three pieces: left, straight,
// right arcs, six kinds); Hybrid A* searches poses (x, y, heading) by driving short arcs forwards and, if allowed,
// backwards, keeping one pose per cell and heading, guided by the distance round the walls and finished by a Dubins
// shot when one fits. The car is checked as three discs along its length. Maps as robot-motion.ts.

import { blocked, cellOf, freeAt, type Grid } from './robot-motion';
import { distanceField } from './robot-sense';

export type Pose = [number, number, number];
const TAU = 2 * Math.PI;
const mod = (a: number) => ((a % TAU) + TAU) % TAU;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ——— Dubins ———
export type Word = 'LSL' | 'RSR' | 'LSR' | 'RSL' | 'RLR' | 'LRL';
export interface Dubins { word: Word; lengths: [number, number, number]; length: number }
/** The shortest of the six Dubins paths from a to b for turning radius R (lengths in metres per piece). */
export function dubins(a: Pose, b: Pose, R: number): Dubins | null {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) / R, phi = Math.atan2(dy, dx);
  const al = mod(a[2] - phi), be = mod(b[2] - phi), sa = Math.sin(al), sb = Math.sin(be), ca = Math.cos(al), cb = Math.cos(be), cab = Math.cos(al - be);
  const out: Dubins[] = [];
  const add = (word: Word, t: number, p: number, q: number) => { if ([t, p, q].every(Number.isFinite)) out.push({ word, lengths: [t * R, p * R, q * R], length: (t + p + q) * R }); };
  { const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb); if (p2 >= 0) { const th = Math.atan2(cb - ca, d + sa - sb); add('LSL', mod(-al + th), Math.sqrt(p2), mod(be - th)); } }
  { const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa); if (p2 >= 0) { const th = Math.atan2(ca - cb, d - sa + sb); add('RSR', mod(al - th), Math.sqrt(p2), mod(-be + th)); } }
  { const p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb); if (p2 >= 0) { const p = Math.sqrt(p2), th = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p); add('LSR', mod(-al + th), p, mod(-mod(be) + th)); } }
  { const p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb); if (p2 >= 0) { const p = Math.sqrt(p2), th = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p); add('RSL', mod(al - th), p, mod(be - th)); } }
  { const c = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8; if (Math.abs(c) <= 1) { const p = mod(TAU - Math.acos(c)), t = mod(al - Math.atan2(ca - cb, d - sa + sb) + p / 2); add('RLR', t, p, mod(al - be - t + p)); } }
  { const c = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8; if (Math.abs(c) <= 1) { const p = mod(TAU - Math.acos(c)), t = mod(-al - Math.atan2(ca - cb, d + sa - sb) + p / 2); add('LRL', t, p, mod(mod(be) - al - t + p)); } }
  // Each candidate is driven out and kept only if it really ends at b (guards the formulas' branches).
  const ok = out.filter((c) => { const e = drive(a, c, R, Math.max(R / 50, 1e-3)).at(-1)!; return Math.hypot(e[0] - b[0], e[1] - b[1]) < 1e-6 * Math.max(1, R) + 1e-6 && Math.abs(wrap(e[2] - b[2])) < 1e-6; });
  return ok.length ? ok.reduce((x, y) => (y.length < x.length ? y : x)) : null;
}
/** Moves along an arc of curvature k (0: straight) for s metres, exactly. */
export function arc([x, y, th]: Pose, k: number, s: number): Pose {
  if (Math.abs(k) < 1e-12) return [x + s * Math.cos(th), y + s * Math.sin(th), th];
  const th2 = th + k * s;
  return [x + (Math.sin(th2) - Math.sin(th)) / k, y - (Math.cos(th2) - Math.cos(th)) / k, wrap(th2)];
}
/** The poses along a Dubins path, every `step` metres. */
export function drive(a: Pose, p: Dubins, R: number, step: number): Pose[] {
  const out: Pose[] = [a];
  let pose = a;
  p.word.split('').forEach((ch, i) => {
    const k = ch === 'L' ? 1 / R : ch === 'R' ? -1 / R : 0, L = p.lengths[i], n = Math.max(1, Math.ceil(L / step));
    for (let j = 1; j <= n; j++) out.push(arc(pose, k, (L * j) / n));
    pose = arc(pose, k, L);
  });
  return out;
}

// ——— The car's footprint ———
export interface Car { length: number; width: number; radius: number }
export const CAR: Car = { length: 4.5, width: 1.8, radius: 5 };
/** Where the car fits: the distance from each cell to the nearest wall (the map's edge counts as a wall), worked out
 * once a map so each check is a few look-ups. */
export function clearance(g: Grid): Float32Array {
  // A border of blocked cells round the map, so its edge is a wall too.
  const rows = g.rows + 2, cols = g.cols + 2, cells = new Uint8Array(rows * cols).fill(1);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) cells[(r + 1) * cols + c + 1] = g.cells[r * g.cols + c];
  const D = distanceField({ rows, cols, cells, res: g.res }), out = new Float32Array(g.rows * g.cols);
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out[r * g.cols + c] = D[(r + 1) * cols + c + 1];
  return out;
}
/** Three discs of the car's half-width (and 10 cm) along its length, from the rear axle (the pose) forwards. */
export function carFree(g: Grid, [x, y, th]: Pose, car: Car, clear: Float32Array = clearance(g)): boolean {
  const r = car.width / 2 + 0.1, c = Math.cos(th), s = Math.sin(th), back = -0.6, front = car.length - 0.6 - r;
  for (const u of [back + r * 0.6, (back + front) / 2, front]) {
    const [r0, c0] = cellOf(g, x + u * c, y + u * s);
    if (r0 < 0 || c0 < 0 || r0 >= g.rows || c0 >= g.cols || blocked(g, r0, c0)) return false;
    // The cell's centre may be up to half a diagonal from the disc's centre.
    if (clear[r0 * g.cols + c0] < r + 0.71 / g.res) return false;
  }
  return true;
}

// ——— Hybrid A* ———
export interface HybridOptions { car?: Car; reverse?: boolean; reversePenalty?: number; switchPenalty?: number; maxExpansions?: number; headings?: number }
export interface HybridPlan { poses: Pose[]; reverse: boolean[]; length: number; expansions: number; found: boolean; tree: number[] }
/** The distance from each cell to the goal round the walls (8 neighbours), for the guide. */
function distanceToGoal(g: Grid, goal: [number, number], margin: number): Float64Array {
  const N = g.rows * g.cols, D = new Float64Array(N).fill(Infinity), [gr, gc] = cellOf(g, ...goal), k = Math.ceil(margin * g.res);
  const near = (r: number, c: number) => { for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (dr * dr + dc * dc <= k * k && blocked(g, r + dr, c + dc)) return true; return false; };
  const open = new Uint8Array(N); for (let i = 0; i < N; i++) open[i] = near(Math.floor(i / g.cols), i % g.cols) ? 0 : 1;
  if (gr < 0 || gc < 0 || gr >= g.rows || gc >= g.cols) return D;
  const heap: [number, number][] = [];
  const push = (d: number, i: number) => { heap.push([d, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
  const pop = () => { const t = heap[0], l = heap.pop()!; if (heap.length) { heap[0] = l; let j = 0; for (;;) { const a = 2 * j + 1, b = a + 1; let m = j; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return t; };
  const s = gr * g.cols + gc; D[s] = 0; push(0, s);
  while (heap.length) {
    const [d, i] = pop();
    if (d > D[i]) continue;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dr, dc, w] of [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]) {
      const rr = r + dr, cc = c + dc, j = rr * g.cols + cc;
      if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols || !open[j]) continue;
      const nd = d + w / g.res;
      if (nd < D[j]) { D[j] = nd; push(nd, j); }
    }
  }
  return D;
}
export function hybridAstar(g: Grid, start: Pose, goal: Pose, o: HybridOptions = {}): HybridPlan {
  const car = o.car ?? CAR, R = car.radius, rev = o.reverse ?? true, H = o.headings ?? 36, maxN = o.maxExpansions ?? 30000, clear = clearance(g);
  const fits = (p: Pose) => carFree(g, p, car, clear);
  const revPen = o.reversePenalty ?? 2, swPen = o.switchPenalty ?? 3;
  const none: HybridPlan = { poses: [], reverse: [], length: Infinity, expansions: 0, found: false, tree: [] };
  if (!fits(start) || !fits(goal)) return none;
  // Poses are told apart on a grid of at least half a metre; each move drives a metre.
  const cell = 1 / g.res, keyCell = Math.max(cell, 0.5), step = Math.max(cell * 1.6, 1), D = distanceToGoal(g, [goal[0], goal[1]], car.width / 2);
  const hOf = (p: Pose) => {
    const [r, c] = cellOf(g, p[0], p[1]), holo = r >= 0 && c >= 0 && r < g.rows && c < g.cols ? D[r * g.cols + c] : Infinity;
    // Without reversing, the Dubins length (no walls) is a second, often tighter, guide.
    const db = rev ? 0 : dubins(p, goal, R)?.length ?? 0;
    return Math.max(Number.isFinite(holo) ? holo : Math.hypot(p[0] - goal[0], p[1] - goal[1]) * 3, db);
  };
  const KC = Math.ceil((g.cols / g.res) / keyCell) + 1;
  const key = (p: Pose) => (Math.floor(p[1] / keyCell) * KC + Math.floor(p[0] / keyCell)) * H + (Math.floor(mod(p[2] + Math.PI / H) / (TAU / H)) % H);
  interface Node { p: Pose; g: number; parent: number; rev: boolean; path: Pose[] }
  const nodes: Node[] = [{ p: start, g: 0, parent: -1, rev: false, path: [start] }], best = new Map<number, number>([[key(start), 0]]), closed = new Set<number>();
  const heap: [number, number][] = [[hOf(start), 0]];
  const push = (f: number, i: number) => { heap.push([f, i]); let j = heap.length - 1; while (j > 0) { const q = (j - 1) >> 1; if (heap[q][0] <= heap[j][0]) break; [heap[q], heap[j]] = [heap[j], heap[q]]; j = q; } };
  const pop = () => { const t = heap[0], l = heap.pop()!; if (heap.length) { heap[0] = l; let j = 0; for (;;) { const a = 2 * j + 1, b = a + 1; let m = j; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return t; };
  const steers = [-1 / R, -0.5 / R, 0, 0.5 / R, 1 / R];
  const tree: number[] = [];
  let expansions = 0;
  const finish = (i: number, tail: Pose[]) => {
    const poses: Pose[] = [], dirs: boolean[] = [];
    for (let j = i; j > 0; j = nodes[j].parent) { const n = nodes[j]; for (let k = n.path.length - 1; k >= 1; k--) { poses.push(n.path[k]); dirs.push(n.rev); } }
    poses.push(start); dirs.push(false);
    poses.reverse(); dirs.reverse();
    if (dirs.length > 1) dirs[0] = dirs[1];
    tail.slice(1).forEach((p) => { poses.push(p); dirs.push(false); });
    let L = 0; for (let k = 1; k < poses.length; k++) L += Math.hypot(poses[k][0] - poses[k - 1][0], poses[k][1] - poses[k - 1][1]);
    return { poses, reverse: dirs, length: L, expansions, found: true, tree };
  };
  while (heap.length && expansions < maxN) {
    const [, i] = pop(), n = nodes[i], k = key(n.p);
    if (closed.has(k)) continue;
    closed.add(k); expansions++;
    // Close enough to the goal: within a cell and a few degrees.
    if (Math.hypot(n.p[0] - goal[0], n.p[1] - goal[1]) < keyCell && Math.abs(wrap(n.p[2] - goal[2])) < TAU / H) return finish(i, [goal]);
    // Every few nodes (and always near the goal) try the Dubins shot straight in.
    if (expansions % 8 === 0 || Math.hypot(n.p[0] - goal[0], n.p[1] - goal[1]) < 4 * R) {
      const db = dubins(n.p, goal, R);
      if (db && db.length < 6 * R + Math.hypot(n.p[0] - goal[0], n.p[1] - goal[1])) { const shot = drive(n.p, db, R, cell); if (shot.every(fits)) return finish(i, shot); }
    }
    for (const back of rev ? [false, true] : [false]) for (const k2 of steers) {
      const path: Pose[] = [n.p];
      let ok = true, p = n.p;
      const sub = Math.ceil(step / cell);
      for (let j = 1; j <= sub; j++) { p = arc(n.p, k2, ((back ? -1 : 1) * step * j) / sub); if (!fits(p)) { ok = false; break; } path.push(p); }
      if (!ok || !freeAt(g, p[0], p[1])) continue;
      const kk = key(p);
      if (closed.has(kk)) continue;
      const cost = n.g + step * (back ? revPen : 1) + (i > 0 && back !== n.rev ? swPen : 0) + Math.abs(k2) * R * 0.1 * step;
      const prev = best.get(kk);
      if (prev !== undefined && nodes[prev].g <= cost) continue;
      nodes.push({ p, g: cost, parent: i, rev: back, path });
      best.set(kk, nodes.length - 1);
      tree.push(n.p[0], n.p[1], p[0], p[1]);
      push(cost + hOf(p), nodes.length - 1);
    }
  }
  return { ...none, expansions, tree };
}

/** A car park: two rows of parked cars with one empty bay, a lane between (cells of 0.25 m). */
export function parkingMap(): Grid {
  const res = 4, cols = 120, rows = 80, cells = new Uint8Array(rows * cols);
  const box = (x1: number, y1: number, x2: number, y2: number) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = (c + 0.5) / res, y = (rows - r - 0.5) / res; if (x >= x1 && x <= x2 && y >= y1 && y <= y2) cells[r * cols + c] = 1; } };
  box(0, 0, 30, 0.3); box(0, 19.7, 30, 20); box(0, 0, 0.3, 20); box(29.7, 0, 30, 20);
  // Bays 2.6 m wide, 5 m deep, along the bottom and the top; bay 6 at the bottom is empty.
  for (let k = 0; k < 10; k++) {
    const x = 2 + k * 2.6;
    if (k !== 6) box(x + 0.35, 0.6, x + 2.25, 5.1);
    box(x + 0.35, 14.9, x + 2.25, 19.4);
  }
  return { rows, cols, cells, res };
}
