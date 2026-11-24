import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as cp from './car-path';
import { fromRows } from './robot-lab';
import { drawMap, gridOf } from './robot-motion-lab';

// Car-style route planning in the language (M483b): dubinsPath and hybridAstar; reedsSheppPath (M483c). MATLAB keeps these in objects
// (dubinsConnection, plannerHybridAStar with a validatorVehicleCostmap); here they are functions on the same plain maps
// as astarGrid (a logical matrix and its resolution). Poses are [x y heading] with x, y at the rear axle.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: ArrayLike<number>) => mat(1, v.length, v);
const pairs = (a: Value[], from: number) => {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) { if (a[i]?.k !== 'str') throw new LabError('Options come as name, value pairs.'); o.set((a[i] as { v: string }).v.toLowerCase(), a[i + 1] ?? num(NaN)); }
  return o;
};
const numOpt = (o: Map<string, Value>, k: string, d: number) => { const v = o.get(k); return v ? toMat(v).d[0] : d; };
const poseOf = (v: Value | undefined, what: string): cp.Pose => { const d = toMat(v ?? mat(0, 0), what).d; if (d.length !== 3) throw new LabError(`${what} is a pose [x y heading] (metres, radians).`); return [d[0], d[1], d[2]]; };

/** The car's outline at a pose, as a closed polygon. */
const outline = ([x, y, th]: cp.Pose, car: cp.Car) => {
  const c = Math.cos(th), s = Math.sin(th), w = car.width / 2, b = -0.9, f = car.length - 0.9;
  return [[b, -w], [f, -w], [f, w], [b, w], [b, -w]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
};
function drawCarPath(lab: Lab, P: cp.Pose[], back: boolean[], car: cp.Car, outlines = true) {
  // Forwards in violet, backwards in orange.
  for (const rev of [false, true]) {
    const xs: number[] = [], ys: number[] = [];
    for (let k = 1; k < P.length; k++) { if (back[k] !== rev) { xs.push(NaN); ys.push(NaN); continue; } xs.push(P[k - 1][0], P[k][0]); ys.push(P[k - 1][1], P[k][1]); }
    if (xs.some(Number.isFinite)) call(lab, 'plot', row(xs), row(ys), str('Color'), row(rev ? [0.96, 0.62, 0.04] : [0.49, 0.23, 0.93]), str('LineWidth'), num(2.5));
  }
  if (!outlines) return;
  let since = Infinity;
  P.forEach((p, k) => {
    since += k ? Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) : 0;
    if (since < 3 && k !== P.length - 1) return;
    since = 0;
    const o = outline(p, car);
    call(lab, 'plot', row(o.map((q) => q[0])), row(o.map((q) => q[1])), str('Color'), row([0.45, 0.45, 0.5]), str('LineWidth'), num(1));
  });
}
def('dubinsPath', (a, nout, lab) => {
  if (a.length < 3) throw new LabError('dubinsPath needs the start and goal poses [x y heading] and the turning radius.');
  const s = poseOf(a[0], 'The start'), g = poseOf(a[1], 'The goal'), R = toMat(a[2]).d[0];
  if (!(R > 0)) throw new LabError('The turning radius must be above 0.');
  const d = cp.dubins(s, g, R);
  if (!d) throw new LabError('No Dubins path joins those poses.');
  const P = cp.drive(s, d, R, Math.max(R / 20, Math.hypot(g[0] - s[0], g[1] - s[1]) / 400));
  if (nout > 0) return [fromRows(P.flat(), P.length, 3), num(d.length), str(d.word), row(d.lengths)];
  call(lab, 'plot', row(P.map((p) => p[0])), row(P.map((p) => p[1])), str('Color'), row([0.49, 0.23, 0.93]), str('LineWidth'), num(2.5));
  call(lab, 'hold', str('on'));
  for (const p of [s, g]) call(lab, 'quiver', row([p[0]]), row([p[1]]), row([Math.cos(p[2]) * R * 0.6]), row([Math.sin(p[2]) * R * 0.6]), num(0), str('k'), str('LineWidth'), num(2));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Dubins ${d.word}: ${d.length.toFixed(2)} m (turning radius ${R} m)`));
  return [];
});
def('reedsSheppPath', (a, nout, lab) => {
  if (a.length < 3) throw new LabError('reedsSheppPath needs the start and goal poses [x y heading] and the turning radius.');
  const s = poseOf(a[0], 'The start'), g = poseOf(a[1], 'The goal'), R = toMat(a[2]).d[0];
  if (!(R > 0)) throw new LabError('The turning radius must be above 0.');
  const rs = cp.reedsShepp(s, g, R);
  if (!rs) throw new LabError('No Reeds–Shepp path joins those poses.');
  const { poses: P, reverse } = cp.driveRS(s, rs, R, Math.max(R / 20, Math.hypot(g[0] - s[0], g[1] - s[1]) / 400));
  const word = rs.segs.map((q) => q.ch).join('');
  if (nout > 0) return [fromRows(P.flatMap((p, k) => [...p, reverse[k] ? -1 : 1]), P.length, 4), num(rs.length), str(word), row(rs.segs.map((q) => q.len))];
  call(lab, 'hold', str('on'));
  drawCarPath(lab, P, reverse, { ...cp.CAR, radius: R }, false);
  for (const p of [s, g]) call(lab, 'quiver', row([p[0]]), row([p[1]]), row([Math.cos(p[2]) * R * 0.6]), row([Math.sin(p[2]) * R * 0.6]), num(0), str('k'), str('LineWidth'), num(2));
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'grid', str('on'));
  call(lab, 'title', str(`Reeds–Shepp ${word}: ${rs.length.toFixed(2)} m (violet forwards, orange backwards)`));
  return [];
});
def('hybridAstar', (a, nout, lab) => {
  if (a.length < 3) throw new LabError("hybridAstar needs the map, the start and goal poses: hybridAstar(map, [3 10 0], [19 3 pi/2], 'Resolution', res).");
  const o = pairs(a, 3), g = gridOf(a[0], numOpt(o, 'resolution', 1)), s = poseOf(a[1], 'The start'), t = poseOf(a[2], 'The goal');
  const car: cp.Car = { length: numOpt(o, 'carlength', cp.CAR.length), width: numOpt(o, 'carwidth', cp.CAR.width), radius: numOpt(o, 'minturningradius', cp.CAR.radius) };
  if (!(car.length > 0 && car.width > 0 && car.radius > 0)) throw new LabError("'CarLength', 'CarWidth' and 'MinTurningRadius' must be above 0.");
  const r = cp.hybridAstar(g, s, t, { car, reverse: o.get('reverse') ? !!toMat(o.get('reverse')!).d[0] : true, maxExpansions: Math.round(numOpt(o, 'maxexpansions', 30000)) });
  const info: Struct = { k: 'struct', f: new Map<string, Value>([['Found', num(r.found ? 1 : 0)], ['Length', num(r.length)], ['Expansions', num(r.expansions)], ['Reversing', num(r.reverse.filter(Boolean).length)]]) };
  if (nout > 0) return [fromRows(r.poses.flatMap((p, k) => [...p, r.reverse[k] ? -1 : 1]), r.poses.length, 4), info];
  drawMap(lab, g); call(lab, 'hold', str('on'));
  if (r.found) drawCarPath(lab, r.poses, r.reverse, car);
  for (const p of [s, t]) { const ol = outline(p, car); call(lab, 'plot', row(ol.map((q) => q[0])), row(ol.map((q) => q[1])), str('Color'), row(p === s ? [0.09, 0.64, 0.29] : [0.86, 0.15, 0.15]), str('LineWidth'), num(2)); }
  call(lab, 'hold', str('off'));
  call(lab, 'title', str(r.found ? `Hybrid A*: ${r.length.toFixed(1)} m (violet forwards, orange backwards)` : 'Hybrid A*: no way found'));
  return [];
});
