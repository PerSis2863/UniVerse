import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as se from './robot-sense';
import type { Pose } from './robot-motion';
import { fromRows } from './robot-lab';
import { drawMap, gridOf, rowsOf } from './robot-motion-lab';

// Hyperion's robot sensing in the language (M484): lidarSim, robotRun, mclLocalize, slamGrid, buildMap. MATLAB uses
// objects for these (rangeSensor, monteCarloLocalization, lidarSLAM, lidarScan); here they are functions on plain
// matrices: scans are rows of ranges (one a time step) with one row of beam angles, poses rows [x y heading].

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const pairs = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); }
  return o;
};
const numOpt = (o: Map<string, Value>, k: string, d: number) => { const v = o.get(k); return v ? toMat(v).d[0] : d; };
const posesOf = (v: Value | undefined, what = 'The poses'): Pose[] => { const m = toMat(v ?? mat(0, 0), what); if (m.c !== 3) throw new LabError(`${what} are rows [x y heading].`); return rowsOf(m) as Pose[]; };
const posesMat = (P: Pose[]) => fromRows(P.flat(), P.length, 3);
/** A run's odometry, scans, angles and range: from a robotRun struct, or given one by one. */
function runOf(a: Value[], at: number): { odom: Pose[]; scans: number[][]; angles: number[]; maxR?: number; next: number } {
  const v = a[at];
  if (v && v.k === 'struct') {
    const f = (k: string) => { const x = v.f.get(k); if (!x) throw new LabError(`The run has no ${k}: make it with robotRun.`); return x; };
    return { odom: posesOf(f('Odometry'), 'The odometry'), scans: rowsOf(toMat(f('Scans'))), angles: [...toMat(f('Angles')).d], maxR: toMat(f('MaxRange')).d[0], next: at + 1 };
  }
  if (a.length < at + 3) throw new LabError('Give the odometry (rows [x y heading]), the scans (a row of ranges each) and the beam angles, or a run from robotRun.');
  const odom = posesOf(a[at], 'The odometry'), scans = rowsOf(toMat(a[at + 1], 'The scans')), angles = [...toMat(a[at + 2], 'The angles').d];
  if (scans.length !== odom.length || scans[0]?.length !== angles.length) throw new LabError('One scan a pose, one range an angle.');
  return { odom, scans, angles, next: at + 3 };
}
/** Draws an occupancy probability map (blocked dark, unknown grey, free white). */
function drawProb(lab: Lab, m: se.LogMap, p: Float32Array) {
  const M = mat(m.rows, m.cols);
  for (let i = 0; i < m.rows; i++) for (let j = 0; j < m.cols; j++) M.d[i + j * m.rows] = 1 - p[(m.rows - 1 - i) * m.cols + j];
  call(lab, 'imagesc', row([m.x0 + 0.5 / m.res, m.x0 + (m.cols - 0.5) / m.res]), row([m.y0 + 0.5 / m.res, m.y0 + (m.rows - 0.5) / m.res]), M);
  call(lab, 'colormap', str('gray')); call(lab, 'caxis', row([0, 1])); call(lab, 'axis', str('xy')); call(lab, 'axis', str('equal'));
  call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
}
const probMat = (m: se.LogMap): Mat => { const p = se.probability(m); return fromRows(p, m.rows, m.cols); };
const line = (lab: Lab, P: Pose[], spec: string, colour: number[], w = 1.5) => call(lab, 'plot', row(P.map((p) => p[0])), row(P.map((p) => p[1])), str(spec), str('Color'), row(colour), str('LineWidth'), num(w));

def('lidarSim', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("lidarSim needs the map and the pose [x y heading]: lidarSim(map, [5 5 0], 'Resolution', res).");
  const o = pairs(a, 2), g = gridOf(a[0], numOpt(o, 'resolution', 1)), p = posesOf(mat(1, 3, toMat(a[1]).d), 'The pose')[0];
  const n = Math.round(numOpt(o, 'beams', 180)), maxR = numOpt(o, 'maxrange', 8), fov = numOpt(o, 'fieldofview', 2 * Math.PI);
  if (!(n >= 1 && n <= 4096 && maxR > 0 && fov > 0)) throw new LabError("'Beams' is 1 to 4096; 'MaxRange' and 'FieldOfView' above 0.");
  const ang = se.beams(n, Math.min(fov, 2 * Math.PI)), r = se.scan(g, p, ang, maxR, numOpt(o, 'noise', 0), se.lcg(Math.round(numOpt(o, 'seed', 1))));
  if (nout > 0) return [row(r), row(ang)];
  drawMap(lab, g); call(lab, 'hold', str('on'));
  const xs: number[] = [], ys: number[] = [];
  r.forEach((d, k) => { xs.push(p[0], p[0] + d * Math.cos(p[2] + ang[k]), NaN); ys.push(p[1], p[1] + d * Math.sin(p[2] + ang[k]), NaN); });
  call(lab, 'plot', row(xs), row(ys), str('Color'), row([0.96, 0.62, 0.04]), str('LineWidth'), num(0.5));
  const hits = r.map((d, k) => (d < maxR ? k : -1)).filter((k) => k >= 0);
  call(lab, 'plot', row(hits.map((k) => p[0] + r[k] * Math.cos(p[2] + ang[k]))), row(hits.map((k) => p[1] + r[k] * Math.sin(p[2] + ang[k]))), str('r.'));
  call(lab, 'hold', str('off')); call(lab, 'title', str(`Lidar: ${n} beams, ${hits.length} hits within ${maxR} m`));
  return [];
});
def('robotRun', (a) => {
  if (a.length < 2) throw new LabError("robotRun needs the map and a path to drive: robotRun(map, path, 'Resolution', res).");
  const o = pairs(a, 2), g = gridOf(a[0], numOpt(o, 'resolution', 1)), path = rowsOf(toMat(a[1], 'The path')) as [number, number][];
  if (path.length < 2 || path[0].length < 2) throw new LabError('The path is rows [x y], at least two.');
  const r = se.simulateRun(g, path, { beams: Math.round(numOpt(o, 'beams', 90)), maxRange: numOpt(o, 'maxrange', 8), rangeNoise: numOpt(o, 'rangenoise', 0.03), odomNoise: numOpt(o, 'odometrynoise', 0.05), speed: numOpt(o, 'speed', 0.8), seed: Math.round(numOpt(o, 'seed', 4)) });
  const s: Struct = { k: 'struct', f: new Map<string, Value>([['True', posesMat(r.truth)], ['Odometry', posesMat(r.odom)], ['Scans', fromRows(r.scans.flat(), r.scans.length, r.angles.length)], ['Angles', row(r.angles)], ['MaxRange', num(r.maxRange)], ['SampleTime', num(0.2)]]) };
  return [s];
});
def('mclLocalize', (a, nout, lab) => {
  if (a.length < 2) throw new LabError("mclLocalize needs the map and a run (robotRun), or the odometry, scans and angles: mclLocalize(map, run, 'Resolution', res).");
  const run = runOf(a, 1), o = pairs(a, run.next), g = gridOf(a[0], numOpt(o, 'resolution', 1));
  const start = o.get('start') ? posesOf(mat(1, 3, toMat(o.get('start')!).d), 'The start')[0] : undefined, N = Math.round(numOpt(o, 'particles', start ? 500 : 5000));
  if (!(N >= 10 && N <= 50000)) throw new LabError("'Particles' is 10 to 50,000.");
  if (N * run.odom.length > 6e6) throw new LabError('That is a lot of work (particles × steps over 6 million): fewer particles or a shorter run.');
  const r = se.mcl(g, run.odom, run.scans, run.angles, { particles: N, start, maxRange: numOpt(o, 'maxrange', run.maxR ?? 8), seed: Math.round(numOpt(o, 'seed', 9)) });
  const est = r.map((s) => s.pose), last = r[r.length - 1].particles;
  if (nout > 0) return [posesMat(est), { k: 'struct', f: new Map<string, Value>([['Spread', mat(r.length, 1, r.map((s) => s.spread))], ['Particles', fromRows(last, N, 3)]]) } satisfies Struct];
  drawMap(lab, g); call(lab, 'hold', str('on'));
  call(lab, 'plot', row(Array.from({ length: N }, (_, i) => last[i * 3])), row(Array.from({ length: N }, (_, i) => last[i * 3 + 1])), str('.'), str('Color'), row([0.37, 0.65, 0.98]), str('MarkerSize'), num(2));
  line(lab, run.odom, '--', [0.6, 0.6, 0.62]);
  line(lab, est, '-', [0.49, 0.23, 0.93], 2);
  call(lab, 'hold', str('off')); call(lab, 'legend', str('particles (last)'), str('odometry'), str('estimate'));
  call(lab, 'title', str(`Monte Carlo localisation: ${N} particles, final spread ${r[r.length - 1].spread.toFixed(2)} m`));
  return [];
});
def('slamGrid', (a, nout, lab) => {
  const run = runOf(a, 0), o = pairs(a, run.next), res = numOpt(o, 'resolution', 4), maxR = numOpt(o, 'maxrange', run.maxR ?? 8);
  if (!(res > 0 && res <= 20)) throw new LabError("'Resolution' is 0 to 20 cells a metre.");
  const s = se.slam(run.scans, run.odom, run.angles, res, maxR);
  if (nout > 0) return [probMat(s.map), posesMat(s.poses), row([s.map.x0, s.map.y0])];
  drawProb(lab, s.map, se.probability(s.map)); call(lab, 'hold', str('on'));
  line(lab, run.odom, '--', [0.85, 0.3, 0.3]); line(lab, s.poses, '-', [0.49, 0.23, 0.93], 2);
  call(lab, 'hold', str('off')); call(lab, 'legend', str('odometry'), str('SLAM'));
  call(lab, 'title', str('SLAM: the map and the path, built together'));
  return [];
});
def('buildMap', (a, nout, lab) => {
  if (a.length < 3) throw new LabError('buildMap needs the scans, the poses and the beam angles (then the resolution and the range).');
  const scans = rowsOf(toMat(a[0], 'The scans')), poses = posesOf(a[1]), angles = [...toMat(a[2], 'The angles').d], res = a[3] ? toMat(a[3]).d[0] : 4, maxR = a[4] ? toMat(a[4]).d[0] : 8;
  if (scans.length !== poses.length || scans[0]?.length !== angles.length) throw new LabError('One scan a pose, one range an angle.');
  if (!(res > 0 && res <= 20)) throw new LabError('The resolution is 0 to 20 cells a metre.');
  const m = se.buildMap(scans, poses, angles, res, maxR);
  if (nout > 0) return [probMat(m), row([m.x0, m.y0])];
  drawProb(lab, m, se.probability(m)); call(lab, 'title', str('Occupancy map from known poses'));
  return [];
});
