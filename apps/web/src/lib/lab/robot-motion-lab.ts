import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as mo from './robot-motion';
import { fromRows } from './robot-lab';
import { parkingMap } from './car-path';

// Hyperion's robot motion in the language (M483): cubicpolytraj, quinticpolytraj, trapveltraj (MATLAB's names and
// shapes: waypoints one column each), robotMap, inflateMap, astarGrid, rrtPlan, shortenPath, diffdriveStep,
// purePursuit, followPath, and show(map, res) for a map. MATLAB keeps maps, planners and controllers in objects
// (binaryOccupancyMap, plannerAStarGrid, plannerRRTStar, controllerPurePursuit); here a map is a plain logical matrix
// (1 = blocked, row 1 at the top) with its resolution in cells a metre, and each planner is one function.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const pairs = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); }
  return o;
};
const numOpt = (o: Map<string, Value>, k: string, d: number) => { const v = o.get(k); return v ? toMat(v).d[0] : d; };
export const rowsOf = (m: Mat): number[][] => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
const matOf = (A: number[][]) => fromRows(A.flat(), A.length, A[0]?.length ?? 0);

// ——— Trajectories ———
function trajArgs(a: Value[], name: string) {
  if (a.length < 3) throw new LabError(`${name} needs the waypoints (one column each), their times and the times to sample: ${name}([0 1 0.5], [0 2 4], 0:0.01:4).`);
  const W = rowsOf(toMat(a[0], 'The waypoints')), tp = [...toMat(a[1], 'The times').d], tv = [...toMat(a[2], 'The sample times').d];
  if (W[0].length !== tp.length || tp.length < 2) throw new LabError('Give a time for each waypoint (column), at least two.');
  if (tp.some((t, i) => i && t <= tp[i - 1])) throw new LabError('The waypoint times must increase.');
  const o = pairs(a, 3), bc = (k: string) => { const v = o.get(k); if (!v) return undefined; const M = rowsOf(toMat(v)); if (M.length !== W.length || M[0].length !== tp.length) throw new LabError(`'${k}' must be the same size as the waypoints.`); return M; };
  return { W, tp, tv, vbc: bc('velocityboundarycondition'), abc: bc('accelerationboundarycondition') };
}
const trajOut = (r: mo.Traj, extra = false) => [matOf(r.q), matOf(r.qd), matOf(r.qdd), ...(extra ? [row(r.t)] : [])];
def('cubicpolytraj', (a) => { const { W, tp, tv, vbc } = trajArgs(a, 'cubicpolytraj'); return trajOut(mo.polyTraj(W, tp, tv, 3, vbc)); });
def('quinticpolytraj', (a) => { const { W, tp, tv, vbc, abc } = trajArgs(a, 'quinticpolytraj'); return trajOut(mo.polyTraj(W, tp, tv, 5, vbc, abc)); });
def('trapveltraj', (a) => {
  if (a.length < 2) throw new LabError('trapveltraj needs the waypoints (one column each) and how many samples: trapveltraj([0 1 0.5], 200).');
  const W = rowsOf(toMat(a[0], 'The waypoints')), n = Math.round(toMat(a[1]).d[0]), o = pairs(a, 2);
  if (W[0].length < 2 || !(n >= 2 && n <= 1e6)) throw new LabError('Give at least two waypoints and 2 or more samples.');
  const v = o.get('peakvelocity') ? numOpt(o, 'peakvelocity', 1) : undefined, ac = o.get('acceleration') ? numOpt(o, 'acceleration', 1) : undefined;
  if ((v === undefined) !== (ac === undefined) || (v !== undefined && !(v > 0 && ac! > 0))) throw new LabError("Give both 'PeakVelocity' and 'Acceleration' (positive), or neither (each segment then takes 1 s).");
  return trajOut(mo.trapTraj(W, n, v, ac), true);
});

// ——— Maps ———
/** A map from a matrix (nonzero = blocked) and its resolution. */
export function gridOf(v: Value | undefined, res = 1): mo.Grid {
  const m = toMat(v ?? mat(0, 0), 'The map');
  if (m.r < 2 || m.c < 2 || m.r * m.c > 4e6) throw new LabError('A map is a matrix of 0 (free) and 1 (blocked), at least 2 × 2 and at most 4 million cells.');
  if (!(res > 0)) throw new LabError('The resolution is cells a metre, above 0.');
  const cells = new Uint8Array(m.r * m.c);
  for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) cells[i * m.c + j] = m.d[i + j * m.r] ? 1 : 0;
  return { rows: m.r, cols: m.c, cells, res };
}
export const gridMat = (g: mo.Grid): Mat => { const m = mat(g.rows, g.cols, undefined, true); for (let i = 0; i < g.rows; i++) for (let j = 0; j < g.cols; j++) m.d[i + j * g.rows] = g.cells[i * g.cols + j]; return m; };
const point = (v: Value | undefined, what: string): [number, number] => { const d = toMat(v ?? mat(0, 0), what).d; if (d.length < 2) throw new LabError(`${what} is a point [x y] in metres.`); return [d[0], d[1]]; };
const pathMat = (p: [number, number][]) => fromRows(p.flat(), p.length, 2);
const pathOf = (v: Value | undefined): [number, number][] => { const m = toMat(v ?? mat(0, 0), 'The path'); if (m.c < 2 || m.r < 1) throw new LabError('A path is rows [x y].'); return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r]]); };

/** Draws a map: blocked cells dark, in metres, y up. */
export function drawMap(lab: Lab, g: mo.Grid) {
  const M = mat(g.rows, g.cols);
  for (let i = 0; i < g.rows; i++) for (let j = 0; j < g.cols; j++) M.d[i + j * g.rows] = g.cells[(g.rows - 1 - i) * g.cols + j] ? 0.15 : 1;
  call(lab, 'imagesc', row([0.5 / g.res, (g.cols - 0.5) / g.res]), row([0.5 / g.res, (g.rows - 0.5) / g.res]), M);
  call(lab, 'colormap', str('gray')); call(lab, 'caxis', row([0, 1]));
  call(lab, 'axis', str('xy')); call(lab, 'axis', str('equal'));
  call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
}
def('robotMap', (a) => {
  const name = a[0] ? textOf(a[0]).toLowerCase() : '';
  if (!['maze', 'warehouse', 'rooms', 'parking'].includes(name)) throw new LabError("robotMap knows 'maze', 'warehouse', 'rooms' and 'parking'.");
  const g = name === 'parking' ? parkingMap() : mo.sampleMap(name);
  return [gridMat(g), num(g.res)];
});
def('inflateMap', (a) => {
  const res = a[2] ? toMat(a[2]).d[0] : 1, r = a[1] ? toMat(a[1]).d[0] : NaN;
  if (!(r >= 0)) throw new LabError('inflateMap(map, radius, res): the radius in metres.');
  return [gridMat(mo.inflate(gridOf(a[0], res), r))];
});

function drawPlan(lab: Lab, g: mo.Grid, plan: mo.Plan, start: [number, number], goal: [number, number], name: string) {
  drawMap(lab, g);
  call(lab, 'hold', str('on'));
  if (plan.edges?.length) {
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k < plan.edges.length; k += 4) { xs.push(plan.edges[k], plan.edges[k + 2], NaN); ys.push(plan.edges[k + 1], plan.edges[k + 3], NaN); }
    call(lab, 'plot', row(xs), row(ys), str('Color'), row([0.55, 0.65, 0.85]), str('LineWidth'), num(0.5));
  }
  if (plan.path.length) call(lab, 'plot', row(plan.path.map((p) => p[0])), row(plan.path.map((p) => p[1])), str('Color'), row([0.49, 0.23, 0.93]), str('LineWidth'), num(2.5));
  call(lab, 'plot', row([start[0]]), row([start[1]]), str('go'), str('MarkerSize'), num(9), str('MarkerFaceColor'), str('g'));
  call(lab, 'plot', row([goal[0]]), row([goal[1]]), str('rs'), str('MarkerSize'), num(9), str('MarkerFaceColor'), str('r'));
  call(lab, 'hold', str('off'));
  call(lab, 'title', str(plan.path.length ? `${name}: ${plan.cost.toFixed(2)} m, ${plan.explored} ${plan.edges ? 'tree nodes' : 'cells looked at'}` : `${name}: no path found`));
}
const info = (p: mo.Plan): Struct => ({ k: 'struct', f: new Map<string, Value>([['Cost', num(p.cost)], ['Explored', num(p.explored)], ['Found', num(p.path.length ? 1 : 0)], ...(p.edges ? [['TreeData', fromRows(p.edges, p.edges.length / 4, 4)] as [string, Value]] : [])]) });
def('astarGrid', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("astarGrid needs the map, the start and the goal: astarGrid(map, [1 1], [20 20], 'Resolution', 2).");
  const o = pairs(a, 3), g = gridOf(a[0], numOpt(o, 'resolution', 1)), s = point(a[1], 'The start'), t = point(a[2], 'The goal'), conn = numOpt(o, 'connectivity', 8);
  if (conn !== 4 && conn !== 8) throw new LabError("'Connectivity' is 4 or 8.");
  const plan = mo.astar(g, s, t, conn);
  if (nout > 0) return [pathMat(plan.path), info(plan)];
  drawPlan(lab, g, plan, s, t, 'A*');
  return [];
});
def('rrtPlan', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("rrtPlan needs the map, the start and the goal: rrtPlan(map, [1 1], [20 20], 'Resolution', 2, 'Star', true).");
  const o = pairs(a, 3), g = gridOf(a[0], numOpt(o, 'resolution', 1)), s = point(a[1], 'The start'), t = point(a[2], 'The goal');
  const star = !!numOpt(o, 'star', 0), iters = Math.round(numOpt(o, 'maxiterations', star ? 3000 : 2000));
  if (!(iters >= 1 && iters <= 20000)) throw new LabError("'MaxIterations' is 1 to 20,000.");
  const plan = mo.rrt(g, s, t, { star, iterations: iters, step: o.get('maxconnectiondistance') ? numOpt(o, 'maxconnectiondistance', 1) : undefined, goalBias: numOpt(o, 'goalbias', 0.05), seed: Math.round(numOpt(o, 'seed', 3)) });
  if (nout > 0) return [pathMat(plan.path), info(plan)];
  drawPlan(lab, g, plan, s, t, star ? 'RRT*' : 'RRT');
  return [];
});
def('shortenPath', (a) => [pathMat(mo.shortcut(gridOf(a[1], a[2] ? toMat(a[2]).d[0] : 1), pathOf(a[0])))]);

// ——— A mobile robot ———
const poseOf = (v: Value | undefined): mo.Pose => { const d = toMat(v ?? mat(0, 0), 'The pose').d; if (d.length !== 3) throw new LabError('A pose is [x y heading] (metres, radians).'); return [d[0], d[1], d[2]]; };
def('diffdriveStep', (a) => {
  const p = poseOf(a[0]), v = toMat(a[1] ?? num(0)).d[0], w = toMat(a[2] ?? num(0)).d[0], dt = toMat(a[3] ?? num(0.1)).d[0];
  return [row(mo.driveStep(p, v, w, dt))];
});
def('purePursuit', (a) => {
  if (a.length < 3) throw new LabError('purePursuit needs the pose [x y heading], the path and the look-ahead distance.');
  const r = mo.purePursuit(poseOf(a[0]), pathOf(a[1]), toMat(a[2]).d[0], a[3] ? toMat(a[3]).d[0] : 0.5, a[4] ? toMat(a[4]).d[0] : Infinity);
  return [num(r.v), num(r.w), row(r.target)];
});
def('followPath', (a, nout, lab) => {
  const path = pathOf(a[0]), o = pairs(a, 1);
  const r = mo.followPath(path, { look: numOpt(o, 'lookahead', 0.8), speed: numOpt(o, 'speed', 0.6), wMax: numOpt(o, 'maxturnrate', 2), dt: numOpt(o, 'sampletime', 0.05), start: o.get('start') ? poseOf(o.get('start')) : undefined, maxTime: numOpt(o, 'maxtime', 600) });
  if (nout > 0) return [fromRows(r.poses.flat(), r.poses.length, 3), mat(r.t.length, 1, r.t)];
  if (o.get('map')) { drawMap(lab, gridOf(o.get('map'), numOpt(o, 'resolution', 1))); call(lab, 'hold', str('on')); }
  call(lab, 'plot', row(path.map((p) => p[0])), row(path.map((p) => p[1])), str('--'), str('Color'), row([0.5, 0.5, 0.55]));
  call(lab, 'hold', str('on'));
  call(lab, 'plot', row(r.poses.map((p) => p[0])), row(r.poses.map((p) => p[1])), str('Color'), row([0.49, 0.23, 0.93]), str('LineWidth'), num(2));
  const e = r.poses[r.poses.length - 1];
  call(lab, 'quiver', row([e[0]]), row([e[1]]), row([Math.cos(e[2]) * 0.6]), row([Math.sin(e[2]) * 0.6]), num(0), str('r'), str('LineWidth'), num(2));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Pure pursuit: ${r.reached ? 'reached the goal' : 'stopped'} after ${r.t[r.t.length - 1].toFixed(1)} s`));
  return [];
});

/** show(map, res): a map; anything else goes to the arm's show (M482). */
const showArm = BUILTINS.show;
def('show', (a, nout, lab) => {
  if (a[0] && a[0].k === 'mat') { drawMap(lab, gridOf(a[0], a[1] ? toMat(a[1]).d[0] : 1)); return []; }
  return showArm(a, nout, lab);
});
