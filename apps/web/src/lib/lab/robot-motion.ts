// Hyperion's robot motion (M483), pure: trajectories through waypoints (trapezoidal speed, cubic and quintic
// polynomials), path planning on occupancy grids (A* and RRT / RRT*, with inflation and shortcutting), and a
// differential-drive robot following a path by pure pursuit.
// Maps: a grid of cells, row 0 at the top, 1 = blocked; positions are metres [x y] with the origin at the bottom-left
// corner and `res` cells a metre (as MATLAB's occupancy maps).

// ——— Trajectories ———
export interface Traj { q: number[][]; qd: number[][]; qdd: number[][]; t: number[] }
/** One polynomial piece a segment: cubic (positions and speeds at both ends) or quintic (and accelerations). */
export function polyTraj(wpts: number[][], tpts: number[], tvec: number[], order: 3 | 5, vbc?: number[][], abc?: number[][]): Traj {
  const n = wpts.length, p = wpts[0].length;
  const v = vbc ?? wpts.map((r) => r.map(() => 0)), a = abc ?? wpts.map((r) => r.map(() => 0));
  const q = wpts.map(() => [] as number[]), qd = wpts.map(() => [] as number[]), qdd = wpts.map(() => [] as number[]);
  for (const t of tvec) {
    let s = 0;
    while (s < p - 2 && t > tpts[s + 1]) s++;
    const T = tpts[s + 1] - tpts[s], tau = Math.max(0, Math.min(T, t - tpts[s]));
    for (let i = 0; i < n; i++) {
      const q0 = wpts[i][s], q1 = wpts[i][s + 1], v0 = v[i][s], v1 = v[i][s + 1];
      let c: number[];
      if (order === 3) c = [q0, v0, (3 * (q1 - q0)) / T ** 2 - (2 * v0 + v1) / T, (-2 * (q1 - q0)) / T ** 3 + (v0 + v1) / T ** 2];
      else {
        const a0 = a[i][s], a1 = a[i][s + 1], h = q1 - q0;
        c = [q0, v0, a0 / 2,
          (20 * h - (8 * v1 + 12 * v0) * T - (3 * a0 - a1) * T ** 2) / (2 * T ** 3),
          (-30 * h + (14 * v1 + 16 * v0) * T + (3 * a0 - 2 * a1) * T ** 2) / (2 * T ** 4),
          (12 * h - 6 * (v1 + v0) * T + (a1 - a0) * T ** 2) / (2 * T ** 5)];
      }
      let pos = 0, vel = 0, acc = 0;
      for (let k = c.length - 1; k >= 0; k--) pos = pos * tau + c[k];
      for (let k = c.length - 1; k >= 1; k--) vel = vel * tau + k * c[k];
      for (let k = c.length - 1; k >= 2; k--) acc = acc * tau + k * (k - 1) * c[k];
      q[i].push(pos); qd[i].push(vel); qdd[i].push(acc);
    }
  }
  return { q, qd, qdd, t: tvec };
}
/** Trapezoidal speed through the waypoints, stopping at each: every axis of a segment starts and ends together.
 * With `vmax` and `amax` each segment is as quick as they allow (the axis that moves most decides); otherwise each
 * takes 1 s with a third of it speeding up and a third slowing down. */
export function trapTraj(wpts: number[][], samples: number, vmax?: number, amax?: number): Traj {
  const n = wpts.length, p = wpts[0].length, seg: { T: number; ta: number }[] = [];
  for (let s = 0; s < p - 1; s++) {
    const d = Math.max(...wpts.map((r) => Math.abs(r[s + 1] - r[s])));
    if (vmax && amax && d > 0) {
      // Reaches vmax only if d > vmax²/amax; otherwise a triangle.
      if (d > (vmax * vmax) / amax) seg.push({ T: d / vmax + vmax / amax, ta: vmax / amax });
      else { const ta = Math.sqrt(d / amax); seg.push({ T: 2 * ta, ta }); }
    } else seg.push({ T: 1, ta: 1 / 3 });
  }
  const start = [0];
  seg.forEach((g) => start.push(start[start.length - 1] + g.T));
  const total = start[p - 1], t = Array.from({ length: samples }, (_, k) => (samples > 1 ? (total * k) / (samples - 1) : 0));
  const q = wpts.map(() => [] as number[]), qd = wpts.map(() => [] as number[]), qdd = wpts.map(() => [] as number[]);
  for (const tt of t) {
    let s = 0;
    while (s < p - 2 && tt > start[s + 1]) s++;
    const { T, ta } = seg[s], tau = Math.min(T, tt - start[s]);
    // The shape of distance 0 → 1 over T: speed rises for ta, holds, falls for ta.
    const vp = 1 / (T - ta), ac = vp / ta;
    let f: number, fd: number, fdd: number;
    if (tau < ta) { f = 0.5 * ac * tau * tau; fd = ac * tau; fdd = ac; }
    else if (tau <= T - ta) { f = 0.5 * ac * ta * ta + vp * (tau - ta); fd = vp; fdd = 0; }
    else { const r = T - tau; f = 1 - 0.5 * ac * r * r; fd = ac * r; fdd = -ac; }
    for (let i = 0; i < n; i++) { const h = wpts[i][s + 1] - wpts[i][s]; q[i].push(wpts[i][s] + h * f); qd[i].push(h * fd); qdd[i].push(h * fdd); }
  }
  return { q, qd, qdd, t };
}

// ——— Maps ———
export interface Grid { rows: number; cols: number; cells: Uint8Array; res: number }
export const blocked = (g: Grid, r: number, c: number) => r < 0 || c < 0 || r >= g.rows || c >= g.cols || g.cells[r * g.cols + c] !== 0;
/** The cell [row col] holding a point in metres. */
export const cellOf = (g: Grid, x: number, y: number): [number, number] => [g.rows - 1 - Math.floor(y * g.res), Math.floor(x * g.res)];
/** The middle of a cell, in metres. */
export const centreOf = (g: Grid, r: number, c: number): [number, number] => [(c + 0.5) / g.res, (g.rows - r - 0.5) / g.res];
export const freeAt = (g: Grid, x: number, y: number) => { const [r, c] = cellOf(g, x, y); return !blocked(g, r, c); };
/** Grows every wall by `radius` metres (a robot that size can then be planned as a point). */
export function inflate(g: Grid, radius: number): Grid {
  const k = Math.ceil(radius * g.res - 1e-9), out = new Uint8Array(g.cells);
  if (k <= 0) return { ...g, cells: out };
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (g.cells[r * g.cols + c])
    for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) {
      if (dr * dr + dc * dc > k * k) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < g.rows && cc < g.cols) out[rr * g.cols + cc] = 1;
    }
  return { ...g, cells: out };
}
/** True when the straight line between two points stays in free cells (checked every quarter of a cell). */
export function lineFree(g: Grid, a: [number, number], b: [number, number]) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d * g.res * 4));
  for (let i = 0; i <= n; i++) if (!freeAt(g, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n)) return false;
  return true;
}

/** Maps to try planners on: a maze, a warehouse of shelves, rooms with doors (cells a metre: `res`). */
export function sampleMap(name: string): Grid {
  const res = 2;
  if (name === 'maze') {
    const n = 12, size = 2 * n + 1, cellsize = 2, rows = size * cellsize, cols = rows, cells = new Uint8Array(rows * cols).fill(1);
    const open = (r: number, c: number) => { for (let i = 0; i < cellsize; i++) for (let j = 0; j < cellsize; j++) cells[(r * cellsize + i) * cols + c * cellsize + j] = 0; };
    let seed = 11;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const seen = new Uint8Array(n * n), stack: [number, number][] = [[0, 0]];
    seen[0] = 1; open(1, 1);
    while (stack.length) {
      const [r, c] = stack[stack.length - 1], nb = ([[0, 1], [1, 0], [0, -1], [-1, 0]] as const).map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(([rr, cc]) => rr >= 0 && cc >= 0 && rr < n && cc < n && !seen[rr * n + cc]);
      if (!nb.length) { stack.pop(); continue; }
      const [rr, cc] = nb[Math.floor(rnd() * nb.length)];
      seen[rr * n + cc] = 1; open(2 * rr + 1, 2 * cc + 1); open(r + rr + 1, c + cc + 1); stack.push([rr, cc]);
    }
    return { rows, cols, cells, res };
  }
  const rows = 50, cols = 50, cells = new Uint8Array(rows * cols);
  const wall = (r0: number, c0: number, r1: number, c1: number) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c] = 1; };
  wall(0, 0, 0, cols - 1); wall(rows - 1, 0, rows - 1, cols - 1); wall(0, 0, rows - 1, 0); wall(0, cols - 1, rows - 1, cols - 1);
  if (name === 'warehouse') {
    for (let k = 0; k < 5; k++) { const c = 7 + k * 8; wall(8, c, 22, c + 2); wall(28, c, 42, c + 2); }
  } else if (name === 'rooms') {
    wall(0, 17, 49, 17); wall(0, 33, 49, 33); wall(24, 0, 24, 49);
    for (const [r0, r1, c0, c1] of [[7, 13, 17, 17], [35, 41, 17, 17], [29, 35, 33, 33], [24, 24, 4, 10], [24, 24, 39, 45], [24, 24, 22, 28]]) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c] = 0;
    // Furniture, different in each room (a table, a pillar, a cupboard…), so no two rooms look alike.
    for (const [r0, c0, r1, c1] of [[6, 5, 9, 10], [14, 24, 15, 25], [14, 41, 16, 45], [33, 4, 35, 5], [41, 25, 44, 26], [40, 38, 41, 42], [30, 44, 31, 45]]) wall(r0, c0, r1, c1);
  } else throw new Error('map');
  return { rows, cols, cells, res };
}

// ——— A* ———
export interface Plan { path: [number, number][]; cost: number; explored: number; visited?: Uint8Array; edges?: number[] }
/** A* over the cells (8 neighbours by default, no cutting a blocked corner), with the octile distance as its guess. */
export function astar(g: Grid, start: [number, number], goal: [number, number], connect: 4 | 8 = 8): Plan {
  const [sr, sc] = cellOf(g, ...start), [gr, gc] = cellOf(g, ...goal);
  const none: Plan = { path: [], cost: Infinity, explored: 0 };
  if (blocked(g, sr, sc) || blocked(g, gr, gc)) return none;
  const N = g.rows * g.cols, G = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const h = (r: number, c: number) => { const dr = Math.abs(r - gr), dc = Math.abs(c - gc); return connect === 8 ? Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc) : dr + dc; };
  // A binary heap of [f, cell].
  const heap: number[][] = [];
  const push = (f: number, i: number) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const s = sr * g.cols + sc, t = gr * g.cols + gc;
  G[s] = 0; push(h(sr, sc), s);
  const moves = connect === 8 ? [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]] : [[0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1]];
  let explored = 0;
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1; explored++;
    if (i === t) break;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dr, dc, w] of moves) {
      const rr = r + dr, cc = c + dc;
      if (blocked(g, rr, cc) || (dr && dc && (blocked(g, r + dr, c) || blocked(g, r, c + dc)))) continue;
      const j = rr * g.cols + cc, ng = G[i] + w;
      if (ng < G[j]) { G[j] = ng; from[j] = i; push(ng + h(rr, cc), j); }
    }
  }
  if (!Number.isFinite(G[t])) return { ...none, explored, visited: closed };
  const path: [number, number][] = [];
  for (let i = t; i !== -1; i = from[i]) path.push(centreOf(g, Math.floor(i / g.cols), i % g.cols));
  path.reverse();
  path[0] = [...start]; path[path.length - 1] = [...goal];
  return { path, cost: G[t] / g.res, explored, visited: closed };
}

// ——— RRT and RRT* ———
export interface RrtOptions { step?: number; iterations?: number; star?: boolean; goalBias?: number; seed?: number; radius?: number }
/** Rapidly-exploring random trees in the free space: each new point steps towards a random one from the nearest in
 * the tree. RRT* also picks the cheapest parent within a radius and rewires its neighbours through the new point, so
 * the path keeps getting shorter. Stops at the first path (RRT) or after all the iterations (RRT*). */
export function rrt(g: Grid, start: [number, number], goal: [number, number], o: RrtOptions = {}): Plan {
  const W = g.cols / g.res, H = g.rows / g.res, step = o.step ?? Math.max(W, H) / 15, iters = o.iterations ?? (o.star ? 3000 : 2000), bias = o.goalBias ?? 0.05;
  const radius = o.radius ?? step * 2;
  let seed = o.seed ?? 3;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  if (!freeAt(g, ...start) || !freeAt(g, ...goal)) return { path: [], cost: Infinity, explored: 0 };
  const X = [start[0]], Y = [start[1]], parent = [-1], cost = [0];
  let reached = -1;
  const d = (i: number, x: number, y: number) => Math.hypot(X[i] - x, Y[i] - y);
  for (let it = 0; it < iters; it++) {
    const [rx, ry] = rnd() < bias ? goal : [rnd() * W, rnd() * H];
    let near = 0, best = Infinity;
    for (let i = 0; i < X.length; i++) { const dd = d(i, rx, ry); if (dd < best) { best = dd; near = i; } }
    if (best < 1e-9) continue;
    const k = Math.min(1, step / best), nx = X[near] + (rx - X[near]) * k, ny = Y[near] + (ry - Y[near]) * k;
    if (!lineFree(g, [X[near], Y[near]], [nx, ny])) continue;
    let par = near, c = cost[near] + d(near, nx, ny);
    const hood: number[] = [];
    if (o.star) {
      for (let i = 0; i < X.length; i++) if (d(i, nx, ny) <= radius) hood.push(i);
      for (const i of hood) { const ci = cost[i] + d(i, nx, ny); if (ci < c - 1e-12 && lineFree(g, [X[i], Y[i]], [nx, ny])) { c = ci; par = i; } }
    }
    const id = X.length;
    X.push(nx); Y.push(ny); parent.push(par); cost.push(c);
    if (o.star) for (const i of hood) {
      const ci = c + d(i, nx, ny);
      if (ci < cost[i] - 1e-12 && lineFree(g, [nx, ny], [X[i], Y[i]])) {
        const delta = cost[i] - ci;
        parent[i] = id; cost[i] = ci;
        // The rewired node's descendants get cheaper by the same amount.
        const stack = [i];
        while (stack.length) { const u = stack.pop()!; for (let v = 0; v < X.length; v++) if (parent[v] === u) { cost[v] -= delta; stack.push(v); } }
      }
    }
    if (d(id, ...goal) <= step && lineFree(g, [nx, ny], goal)) {
      const cg = cost[id] + d(id, ...goal);
      if (reached < 0 || cg < cost[reached]) {
        if (reached < 0) { X.push(goal[0]); Y.push(goal[1]); parent.push(id); cost.push(cg); reached = X.length - 1; } else { parent[reached] = id; cost[reached] = cg; }
      }
      if (!o.star) break;
    }
  }
  const edges: number[] = [];
  for (let i = 1; i < X.length; i++) edges.push(X[parent[i]], Y[parent[i]], X[i], Y[i]);
  if (reached < 0) return { path: [], cost: Infinity, explored: X.length, edges };
  const path: [number, number][] = [];
  for (let i = reached; i !== -1; i = parent[i]) path.push([X[i], Y[i]]);
  path.reverse();
  return { path, cost: cost[reached], explored: X.length, edges };
}
/** Takes out the corners a straight line can cut (greedy: from each point, the farthest point it can see). */
export function shortcut(g: Grid, path: [number, number][]): [number, number][] {
  if (path.length < 3) return path.slice();
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineFree(g, path[i], path[j])) j--;
    out.push(path[j]); i = j;
  }
  return out;
}
export const pathLength = (p: [number, number][]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);

// ——— A differential-drive robot following a path ———
export type Pose = [number, number, number];
/** Moves a differential-drive robot for dt at speed v and turn rate w (exactly along the arc). */
export function driveStep([x, y, th]: Pose, v: number, w: number, dt: number): Pose {
  if (Math.abs(w) < 1e-9) return [x + v * dt * Math.cos(th), y + v * dt * Math.sin(th), th];
  const r = v / w, th2 = th + w * dt;
  return [x + r * (Math.sin(th2) - Math.sin(th)), y - r * (Math.cos(th2) - Math.cos(th)), Math.atan2(Math.sin(th2), Math.cos(th2))];
}
/** Pure pursuit: the point on the path `look` metres ahead, and the turn that curves the robot onto it. */
export function purePursuit(pose: Pose, path: [number, number][], look: number, v: number, wMax = Infinity): { v: number; w: number; target: [number, number] } {
  const [x, y, th] = pose;
  // The closest point of the path, then the first point at least `look` from the robot after it.
  let best = 0, bd = Infinity;
  for (let i = 0; i < path.length; i++) { const dd = Math.hypot(path[i][0] - x, path[i][1] - y); if (dd < bd) { bd = dd; best = i; } }
  let target = path[path.length - 1];
  for (let i = best; i < path.length - 1; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1], dx = bx - ax, dy = by - ay, fx = ax - x, fy = ay - y;
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - look * look, disc = B * B - 4 * A * C;
    if (A > 0 && disc >= 0) { const t = (-B + Math.sqrt(disc)) / (2 * A); if (t >= 0 && t <= 1) { target = [ax + t * dx, ay + t * dy]; break; } }
  }
  const alpha = Math.atan2(target[1] - y, target[0] - x) - th, a = Math.atan2(Math.sin(alpha), Math.cos(alpha));
  const L = Math.max(1e-9, Math.hypot(target[0] - x, target[1] - y));
  // Turn on the spot first when the target is behind.
  const w = Math.abs(a) > Math.PI / 2 ? Math.sign(a) * Math.min(wMax, 2) : Math.max(-wMax, Math.min(wMax, (2 * v * Math.sin(a)) / L));
  return { v: Math.abs(a) > Math.PI / 2 ? 0 : v, w, target };
}
/** Drives along the path by pure pursuit until within `goalRadius` of its end (or `maxTime`). */
export function followPath(path: [number, number][], o: { look?: number; speed?: number; wMax?: number; dt?: number; start?: Pose; goalRadius?: number; maxTime?: number } = {}) {
  const look = o.look ?? 0.8, v = o.speed ?? 0.6, dt = o.dt ?? 0.05, wMax = o.wMax ?? 2, goalR = o.goalRadius ?? 0.1, maxT = o.maxTime ?? 600;
  const p0 = path[0], p1 = path[1] ?? path[0];
  let pose: Pose = o.start ?? [p0[0], p0[1], Math.atan2(p1[1] - p0[1], p1[0] - p0[0])];
  const poses: Pose[] = [pose], t = [0], cmd: [number, number][] = [];
  const end = path[path.length - 1];
  for (let k = 1; k * dt <= maxT; k++) {
    if (Math.hypot(pose[0] - end[0], pose[1] - end[1]) < goalR) break;
    const c = purePursuit(pose, path, look, v, wMax);
    pose = driveStep(pose, c.v, c.w, dt);
    poses.push(pose); t.push(k * dt); cmd.push([c.v, c.w]);
  }
  return { poses, t, cmd, reached: Math.hypot(pose[0] - end[0], pose[1] - end[1]) < goalR };
}
