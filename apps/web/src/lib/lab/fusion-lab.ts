import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { mat, num, str, toMat, type Struct, type Value } from './values';
import * as F from './fusion';
import * as S from './scenario';
import { scenarioTracks } from './scenario-track';
import { isScenario, specOf } from './scenario-lab';

// Hyperion's sensor fusion and tracking in the language (M575): trackScenario (a scenario's camera and radar fused
// into tracks and scored), gospa and ospa, imufilter and ahrsfilter (orientation from an IMU), imuReadings (an IMU's
// readings along an orientation), bboxOverlapRatio and evaluateDetectionPrecision (an object detector's scores).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const table = (cols: number[][]) => mat(cols[0]?.length ?? 0, cols.length, cols.flat());
const rowsOf = (v: Value | undefined, cols: number, what: string) => {
  const m = v ? toMat(v, what) : null;
  if (!m || (m.d.length && m.c !== cols)) throw new LabError(`${what}: rows of ${cols} numbers.`);
  return Array.from({ length: m.r }, (_, i) => Array.from({ length: cols }, (_, j) => m.d[i + j * m.r]));
};
const named = (a: Value[], from: number) => { const o = new Map<string, Value>(); for (let i = from; i + 1 < a.length; i += 2) o.set(textOf(a[i]).toLowerCase(), a[i + 1]); return o; };

def('trackScenario', (a, nout, lab) => {
  if (!isScenario(a[0])) throw new LabError("r = trackScenario(s, 'ProcessNoise', 2, 'Confirm', [2 3], 'Drop', 5, 'Cutoff', 5): a drivingScenario's camera and radar fused into tracks.");
  const o = named(a, 1), n = (k: string) => (o.has(k) ? toMat(o.get(k)!).d : undefined);
  for (const k of o.keys()) if (!['processnoise', 'confirm', 'drop', 'cutoff'].includes(k)) throw new LabError(`trackScenario: no option '${k}' ('ProcessNoise', 'Confirm', 'Drop', 'Cutoff').`);
  const spec = specOf(a[0] as Struct), conf = n('confirm');
  if (conf && !(conf.length === 2 && conf[0] >= 1 && conf[0] <= conf[1] && conf[1] <= 10)) throw new LabError("trackScenario: 'Confirm' is [M N], M hits of the last N (N up to 10).");
  const r = wrap(() => S.runScenario({ ...spec, sensors: spec.sensors.filter((x) => x.kind !== 'lidar') }));
  const tr = wrap(() => scenarioTracks(spec, r, { q: n('processnoise')?.[0], confirm: conf ? [conf[0], conf[1]] : undefined, drop: n('drop')?.[0], cutoff: n('cutoff')?.[0] }));
  const rows = tr.steps.flatMap((st) => st.tracks.map((x) => [st.t, x.id, x.x, x.y, x.vx, x.vy, x.confirmed ? 1 : 0]));
  const out = struct([
    ['Tracks', table([0, 1, 2, 3, 4, 5, 6].map((j) => rows.map((rw) => rw[j])))],
    ['GOSPA', table([tr.gospa.map((g) => g.t), tr.gospa.map((g) => g.gospa), tr.gospa.map((g) => g.loc), tr.gospa.map((g) => g.missed), tr.gospa.map((g) => g.false)])],
    ['MeanGOSPA', num(tr.mean)],
  ]);
  if (nout > 0) return [out];
  // the confirmed tracks' paths, and the actors' paths
  call(lab, 'hold', str('on'));
  r.poses.forEach((p) => call(lab, 'plot', mat(1, p.length, p.map((q) => q.x)), mat(1, p.length, p.map((q) => q.y)), str(':')));
  const ids = [...new Set(rows.filter((rw) => rw[6]).map((rw) => rw[1]))];
  for (const id of ids) { const pts = rows.filter((rw) => rw[1] === id && rw[6]); call(lab, 'plot', mat(1, pts.length, pts.map((rw) => rw[2])), mat(1, pts.length, pts.map((rw) => rw[3])), str('-')); }
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
  call(lab, 'title', str(`${ids.length} confirmed tracks · mean GOSPA ${tr.mean.toFixed(2)} m (dotted: the actors)`));
  return [];
});
const scoreArgs = (a: Value[], what: string) => {
  const e = rowsOf(a[0], 2, `${what}: the estimates [x y]`) as [number, number][], g = rowsOf(a[1], 2, `${what}: the truth [x y]`) as [number, number][];
  const c = a[2] ? toMat(a[2]).d[0] : 5, p = a[3] ? toMat(a[3]).d[0] : 2;
  if (!(c > 0 && p >= 1)) throw new LabError(`${what}: a cutoff above 0 and an order of at least 1.`);
  return { e, g, c, p };
};
def('gospa', (a, nout) => { const { e, g, c, p } = scoreArgs(a, 'gospa'), r = F.gospa(e, g, c, p); return [num(r.gospa), num(r.localization), num(r.missed), num(r.false)].slice(0, Math.max(1, nout)); });
def('ospa', (a) => { const { e, g, c, p } = scoreArgs(a, 'ospa'); return [num(F.ospa(e, g, c, p))]; });
function orientation(acc: number[][], gyr: number[][], mag: number[][] | undefined, fs: number, o: Map<string, Value>) {
  if (acc.length !== gyr.length || (mag && mag.length !== gyr.length)) throw new LabError('The readings need the same number of rows.');
  if (!(fs > 0)) throw new LabError('The sample rate must be above 0.');
  const beta = o.has('beta') ? toMat(o.get('beta')!).d[0] : 0.1, q0v = o.has('initialorientation') ? [...toMat(o.get('initialorientation')!).d] : undefined;
  const q0 = q0v && q0v.length === 3 ? F.eulerToQuat(...(q0v.map((v) => (v * Math.PI) / 180) as [number, number, number])) : undefined;
  const Q = F.madgwick(acc, gyr, fs, { mag, beta, q0 });
  return [table([0, 1, 2, 3].map((j) => Q.map((q) => q[j]))), table([0, 1, 2].map((j) => Q.map((q) => (F.quatToEuler(q)[j] * 180) / Math.PI)))];
}
def('imufilter', (a, nout) => {
  if (a.length < 3) throw new LabError("[q, euler] = imufilter(accel, gyro, fs, 'Beta', 0.1, 'InitialOrientation', [yaw pitch roll]): orientation from an accelerometer (m/s²) and gyroscope (rad/s).");
  return orientation(rowsOf(a[0], 3, 'imufilter: the accelerometer'), rowsOf(a[1], 3, 'imufilter: the gyroscope'), undefined, toMat(a[2]).d[0], named(a, 3)).slice(0, Math.max(1, nout));
});
def('ahrsfilter', (a, nout) => {
  if (a.length < 4) throw new LabError("[q, euler] = ahrsfilter(accel, gyro, mag, fs, 'Beta', 0.1): orientation from an accelerometer, gyroscope and magnetometer (µT).");
  return orientation(rowsOf(a[0], 3, 'ahrsfilter: the accelerometer'), rowsOf(a[1], 3, 'ahrsfilter: the gyroscope'), rowsOf(a[2], 3, 'ahrsfilter: the magnetometer'), toMat(a[3]).d[0], named(a, 4)).slice(0, Math.max(1, nout));
});
def('imuReadings', (a, nout) => {
  if (a.length < 2) throw new LabError("[accel, gyro, mag] = imuReadings(euler, fs, 'Bias', [0 0 0], 'Seed', 1): an IMU's readings along an orientation history [yaw pitch roll] (degrees, a row a sample).");
  const e = rowsOf(a[0], 3, 'imuReadings: the orientation').map((r) => r.map((v) => (v * Math.PI) / 180)), fs = toMat(a[1]).d[0], o = named(a, 2);
  if (!(fs > 0)) throw new LabError('imuReadings: the sample rate must be above 0.');
  const b = o.has('bias') ? [...toMat(o.get('bias')!).d] : undefined, r = F.imuReadings(e, fs, { bias: b ? [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0] : undefined, seed: o.has('seed') ? toMat(o.get('seed')!).d[0] : 1 });
  const m3 = (rows: number[][]) => table([0, 1, 2].map((j) => rows.map((x) => x[j])));
  return [m3(r.acc), m3(r.gyr), m3(r.mag)].slice(0, Math.max(1, nout));
});
def('bboxOverlapRatio', (a) => {
  const A = rowsOf(a[0], 4, 'bboxOverlapRatio: boxes [x y width height]'), B = rowsOf(a[1], 4, 'bboxOverlapRatio: boxes [x y width height]');
  return [mat(A.length, B.length, B.flatMap((b) => A.map((x) => F.iou(x, b))))];
});
def('evaluateDetectionPrecision', (a, nout) => {
  const D = rowsOf(a[0], 6, 'evaluateDetectionPrecision: detections [image x y w h score]'), G = rowsOf(a[1], 5, 'evaluateDetectionPrecision: ground truth [image x y w h]');
  const thr = a[2] ? toMat(a[2]).d[0] : 0.5;
  if (!(thr > 0 && thr < 1)) throw new LabError('evaluateDetectionPrecision: an overlap threshold between 0 and 1.');
  const r = F.averagePrecision(D.map((d) => ({ img: d[0], box: d.slice(1, 5), score: d[5] })), G.map((g) => ({ img: g[0], box: g.slice(1, 5) })), thr);
  return [num(r.ap), mat(r.recall.length, 1, r.recall), mat(r.precision.length, 1, r.precision)].slice(0, Math.max(1, nout));
});
