import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import * as PC from './pointcloud';

// Hyperion's point clouds in the language (M574): pointCloud, pcdownsample, pcfitplane, pcsegdist, pcfitcuboid,
// pcregistericp, pctransform, pcshow, pcmapbuild. A point cloud is a struct with Location (N × 3) and Count; a rigid
// transform is a struct with A (4 × 4), R and Translation, as MATLAB's rigidtform3d shows them.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const col = (v: number[]) => mat(v.length, 1, v);
const rowv = (v: number[]) => mat(1, v.length, v);
/** The points of a pointCloud struct or an N × 3 matrix. */
function pts(v: Value | undefined, what: string): PC.P3[] {
  const m = v?.k === 'struct' && v.f.has('Location') ? toMat(v.f.get('Location')!) : v ? toMat(v, what) : null;
  if (!m || m.c !== 3) throw new LabError(`${what}: a pointCloud or an N × 3 matrix of [x y z].`);
  return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r], m.d[i + 2 * m.r]] as PC.P3).filter((p) => p.every(Number.isFinite));
}
const cloud = (P: PC.P3[]): Struct => {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), zs = P.map((p) => p[2]), lim = (a: number[]) => rowv(a.length ? [Math.min(...a), Math.max(...a)] : [NaN, NaN]);
  return struct([['Location', mat(P.length, 3, [...xs, ...ys, ...zs])], ['Count', num(P.length)], ['XLimits', lim(xs)], ['YLimits', lim(ys)], ['ZLimits', lim(zs)]]);
};
const tform = (T: PC.Rigid): Struct => {
  const A = [...T.R.map((r, i) => [...r, T.t[i]]), [0, 0, 0, 1]];
  return struct([['A', mat(4, 4, [0, 1, 2, 3].flatMap((j) => A.map((r) => r[j])))], ['R', mat(3, 3, [0, 1, 2].flatMap((j) => T.R.map((r) => r[j])))], ['Translation', rowv([...T.t])]]);
};
function rigidOf(v: Value | undefined, what: string): PC.Rigid {
  const A = v?.k === 'struct' && v.f.has('A') ? toMat(v.f.get('A')!) : v ? toMat(v) : null;
  if (!A || A.r !== 4 || A.c !== 4) throw new LabError(`${what}: a rigid transform (from pcregistericp) or a 4 × 4 matrix.`);
  const g = (i: number, j: number) => A.d[i + 4 * j];
  return { R: [0, 1, 2].map((i) => [0, 1, 2].map((j) => g(i, j))), t: [g(0, 3), g(1, 3), g(2, 3)] };
}

def('pointCloud', (a) => [cloud(pts(a[0], 'pointCloud'))]);
def('pcdownsample', (a) => {
  const P = pts(a[0], 'pcdownsample'), how = a[1] ? textOf(a[1]).toLowerCase() : 'gridaverage', size = toMat(a[2] ?? num(NaN)).d[0];
  if (how === 'random') { const n = Math.round(Math.max(0, Math.min(1, size)) * P.length), r = PC.seeded(1); const order = P.map((_, i) => i).sort(() => r() - 0.5); return [cloud(order.slice(0, n).sort((x, y) => x - y).map((i) => P[i]))]; }
  if (how !== 'gridaverage') throw new LabError("pcdownsample(pc, 'gridAverage', size) or (pc, 'random', share).");
  return [cloud(wrap(() => PC.voxelDown(P, size)))];
});
def('pcfitplane', (a, nout) => {
  const P = pts(a[0], 'pcfitplane'), maxD = toMat(a[1] ?? num(NaN)).d[0];
  if (!(maxD > 0)) throw new LabError('pcfitplane(pc, maxDistance, referenceVector, maxAngle): the largest distance a point may be from the plane, above 0.');
  const ref = a[2] ? [...toMat(a[2]).d] : undefined;
  const r = wrap(() => PC.ransacPlane(P, maxD, { ref: ref && ref.length === 3 ? ref as PC.P3 : undefined, maxAngle: a[3] ? toMat(a[3]).d[0] : undefined }));
  const model = struct([['Normal', rowv([...r.normal])], ['Parameters', rowv([...r.normal, r.d])]]);
  return [model, col(r.inliers.map((i) => i + 1)), col(r.outliers.map((i) => i + 1))].slice(0, Math.max(1, nout));
});
def('pcsegdist', (a) => {
  const P = pts(a[0], 'pcsegdist'), d = toMat(a[1] ?? num(NaN)).d[0];
  let lo = 1, hi = Infinity;
  for (let i = 2; i + 1 < a.length; i += 2) if (textOf(a[i]).toLowerCase() === 'numclusterpoints') { const v = toMat(a[i + 1]).d; lo = v[0]; hi = v[1] ?? Infinity; }
  const r = wrap(() => PC.cluster(P, d, lo, hi));
  return [col(r.labels), num(r.count)];
});
def('pcfitcuboid', (a) => [rowv(wrap(() => PC.fitCuboid(pts(a[0], 'pcfitcuboid'))))]);
def('pcregistericp', (a, nout) => {
  const M = pts(a[0], 'pcregistericp (moving)'), F = pts(a[1], 'pcregistericp (fixed)');
  let it = 30, dist = 1, init: PC.Rigid | undefined;
  for (let i = 2; i + 1 < a.length; i += 2) { const k = textOf(a[i]).toLowerCase(); if (k === 'maxiterations') it = toMat(a[i + 1]).d[0]; else if (k === 'inlierdistance') dist = toMat(a[i + 1]).d[0]; else if (k === 'initialtransform') init = rigidOf(a[i + 1], 'pcregistericp'); else throw new LabError(`pcregistericp: no option '${textOf(a[i])}' ('MaxIterations', 'InlierDistance', 'InitialTransform').`); }
  if (!(it >= 1 && it <= 500 && dist > 0)) throw new LabError('pcregistericp: 1 to 500 iterations and an inlier distance above 0.');
  const r = wrap(() => PC.icp(M, F, { iterations: it, inlierDist: dist, init }));
  return [tform(r.T), cloud(M.map((p) => PC.apply(r.T, p))), num(r.rmse)].slice(0, Math.max(1, nout));
});
def('pctransform', (a) => { const T = rigidOf(a[1], 'pctransform'); return [cloud(pts(a[0], 'pctransform').map((p) => PC.apply(T, p)))]; });
def('pcshow', (a, _nout, lab) => {
  const P = pts(a[0], 'pcshow'), sub = P.length > 60000 ? P.filter((_, i) => i % Math.ceil(P.length / 60000) === 0) : P;
  const x = col(sub.map((p) => p[0])), y = col(sub.map((p) => p[1])), z = col(sub.map((p) => p[2]));
  call(lab, 'scatter3', x, y, z, num(4), a[1] ?? z, str('filled'));
  call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)')); call(lab, 'zlabel', str('z (m)'));
  return [];
});
def('pcmapbuild', (a, nout) => {
  const c = a[0];
  if (c?.k !== 'cell' || (c as Cell).d.length < 2) throw new LabError('pcmapbuild(clouds, …): a cell of at least two point clouds, one after another (e.g. a runScenario lidar’s PointClouds).');
  const scans = (c as Cell).d.map((v, i) => pts(v.k === 'struct' && v.f.has('Points') ? v.f.get('Points') : v, `scan ${i + 1}`));
  let voxel = 0.3, ground = 0.2, dist = 2;
  for (let i = 1; i + 1 < a.length; i += 2) { const k = textOf(a[i]).toLowerCase(); if (k === 'gridsize') voxel = toMat(a[i + 1]).d[0]; else if (k === 'groundheight') ground = toMat(a[i + 1]).d[0]; else if (k === 'inlierdistance') dist = toMat(a[i + 1]).d[0]; else throw new LabError(`pcmapbuild: no option '${textOf(a[i])}' ('GridSize', 'GroundHeight', 'InlierDistance').`); }
  const r = wrap(() => PC.lidarMap(scans, { voxel, ground, inlierDist: dist }));
  const poses: Mat = mat(r.poses.length, 4, [...r.poses.map((p) => p.t[0]), ...r.poses.map((p) => p.t[1]), ...r.poses.map((p) => p.t[2]), ...r.poses.map((p) => (Math.atan2(p.R[1][0], p.R[0][0]) * 180) / Math.PI)]);
  return [cloud(r.map), poses].slice(0, Math.max(1, nout));
});
