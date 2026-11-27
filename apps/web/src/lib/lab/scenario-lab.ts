import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import * as S from './scenario';

// Hyperion's driving scenarios in the language (M573): drivingScenario, road, vehicle(scenario, …) and actor (people,
// bikes), trajectory, addSensor (vision, radar, lidar on the ego vehicle), runScenario (poses, detections, lanes, point
// clouds, collisions), plotScenario (the bird's-eye view), writeOpenDRIVE and readOpenDRIVE. A scenario is a value:
// s = road(s, …) and [s, id] = vehicle(s, …) give it back changed, as Hyperion's structs do.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const call = (lab: Lab, name: string, ...args: Value[]) => BUILTINS[name](args, 0, lab);
const row = (v: number[]) => mat(1, v.length, v);
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const cell = (d: Value[]): Cell => ({ k: 'cell', r: 1, c: d.length, d });
const files = (lab: Lab) => { const s = (lab.host as { files?: unknown }).files; return s instanceof FileStore ? s : null; };
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const rowsOf = (v: Value, what: string, cols = 2): [number, number][] => {
  const m = toMat(v, what);
  if (m.c < cols || m.r < 1) throw new LabError(`${what}: rows of [x y]${cols > 2 ? ' z' : ''}.`);
  return Array.from({ length: m.r }, (_, i) => [m.d[i], m.d[i + m.r]] as [number, number]);
};
const mx = (pts: [number, number][]) => mat(pts.length, 2, [...pts.map((p) => p[0]), ...pts.map((p) => p[1])]);
/** 'Name', value pairs from `from` on, by lower-cased name; unknown names refused. */
function opts(a: Value[], from: number, names: string[], what: string) {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) {
    if (a[i].k !== 'str') throw new LabError(`${what}: options come as 'Name', value pairs.`);
    const k = textOf(a[i]).toLowerCase();
    if (!names.includes(k)) throw new LabError(`${what}: no option '${textOf(a[i])}' (it takes ${names.map((n) => `'${n}'`).join(', ')}).`);
    if (i + 1 >= a.length) throw new LabError(`${what}: '${textOf(a[i])}' needs a value.`);
    o.set(k, a[i + 1]);
  }
  return { n: (k: string) => (o.has(k) ? toMat(o.get(k)!).d[0] : undefined), v: (k: string) => (o.has(k) ? [...toMat(o.get(k)!).d] : undefined), t: (k: string) => (o.has(k) ? textOf(o.get(k)!) : undefined), raw: (k: string) => o.get(k) };
}

// ——— the scenario as a struct ———
export const isScenario = (v: Value | undefined): v is Struct => v?.k === 'struct' && v.f.has('DrivingScenario');
const listOf = (s: Struct, k: string) => { const c = s.f.get(k); return c?.k === 'cell' ? c.d : []; };
const withList = (s: Struct, k: string, items: Value[]): Struct => ({ ...s, f: new Map([...s.f, [k, cell(items)]]) });
function specOf(s: Struct): S.ScenarioSpec {
  const g = (x: Struct, k: string) => x.f.get(k), n = (x: Struct, k: string, d?: number) => { const v = g(x, k); return v ? toMat(v).d[0] : d; };
  const pts = (x: Struct, k: string) => { const v = g(x, k); return v && toMat(v).d.length ? rowsOf(v, k) : undefined; };
  return {
    dt: n(s, 'SampleTime', 0.1)!, stop: n(s, 'StopTime', 10)!, seed: n(s, 'Seed', 1), ego: (n(s, 'EgoVehicle', 1)! - 1),
    roads: listOf(s, 'Roads').map((r) => ({ centers: pts(r as Struct, 'Centers')!, lanes: n(r as Struct, 'Lanes', 2)!, laneWidth: n(r as Struct, 'LaneWidth', 3.6)!, name: textOf(g(r as Struct, 'Name') ?? str('')) })),
    actors: listOf(s, 'Actors').map((v) => { const a = v as Struct; const p = toMat(g(a, 'Position')!).d; return { cls: textOf(g(a, 'Class')!) as S.ActorClass, position: [p[0], p[1]] as [number, number], yaw: (n(a, 'Yaw', 0)! * Math.PI) / 180, length: n(a, 'Length'), width: n(a, 'Width'), height: n(a, 'Height'), waypoints: pts(a, 'Waypoints'), speeds: g(a, 'Speeds') ? [...toMat(g(a, 'Speeds')!).d] : undefined, wait: n(a, 'Wait', 0), name: textOf(g(a, 'Name') ?? str('')) || undefined }; }),
    sensors: listOf(s, 'Sensors').map((v) => { const x = v as Struct; const m = g(x, 'Mount') ? [...toMat(g(x, 'Mount')!).d] : undefined, vf = g(x, 'VerticalFOV') ? [...toMat(g(x, 'VerticalFOV')!).d] : undefined; return { kind: textOf(g(x, 'Type')!) as S.SensorKind, mount: m ? [m[0] ?? 0, m[1] ?? 0, m[2] ?? 1.8] as [number, number, number] : undefined, yaw: n(x, 'Yaw'), fov: n(x, 'FieldOfView'), range: n(x, 'MaxRange'), pd: n(x, 'DetectionProbability'), falseAlarms: n(x, 'FalseAlarmRate'), noise: n(x, 'Noise'), channels: n(x, 'Channels'), azRes: n(x, 'AzimuthResolution'), vfov: vf ? [vf[0], vf[1]] as [number, number] : undefined }; }),
  };
}
def('drivingScenario', (a) => {
  const o = opts(a, 0, ['sampletime', 'stoptime', 'seed', 'egovehicle'], 'drivingScenario');
  const dt = o.n('sampletime') ?? 0.1, stop = o.n('stoptime') ?? 10;
  if (!(dt > 0 && stop > 0 && stop / dt <= 20000)) throw new LabError('drivingScenario: a sample time above 0 and at most 20,000 steps to the stop time.');
  return [struct([['DrivingScenario', { ...num(1), logical: true }], ['SampleTime', num(dt)], ['StopTime', num(stop)], ['Seed', num(o.n('seed') ?? 1)], ['EgoVehicle', num(o.n('egovehicle') ?? 1)], ['Roads', cell([])], ['Actors', cell([])], ['Sensors', cell([])]])];
});
def('road', (a) => {
  if (!isScenario(a[0])) throw new LabError("road(s, centers, 'Lanes', 2, 'LaneWidth', 3.6, 'Name', 'Main'): add a road to a drivingScenario.");
  const c = rowsOf(a[1] ?? num(NaN), 'The road centres');
  if (c.length < 2) throw new LabError('road: at least two centre points.');
  const o = opts(a, 2, ['lanes', 'lanewidth', 'name'], 'road'), lanes = Math.round(o.n('lanes') ?? 2), w = o.n('lanewidth') ?? 3.6;
  if (!(lanes >= 1 && lanes <= 12 && w > 1 && w < 10)) throw new LabError('road: 1 to 12 lanes, each 1 to 10 m wide.');
  return [withList(a[0], 'Roads', [...listOf(a[0], 'Roads'), struct([['Centers', mx(c)], ['Lanes', num(lanes)], ['LaneWidth', num(w)], ['Name', str(o.t('name') ?? `Road ${listOf(a[0], 'Roads').length + 1}`)]])])];
});
/** vehicle(scenario, …) and actor(scenario, …): add a cuboid actor; [s, id]. */
export function scenarioActor(a: Value[], cls0: S.ActorClass, what: string): Value[] {
  const s = a[0] as Struct, o = opts(a, 1, ['class', 'classid', 'position', 'yaw', 'length', 'width', 'height', 'name'], what);
  const cls = (o.t('class') ?? (o.n('classid') ? ['', 'car', 'truck', 'pedestrian', 'bicycle'][o.n('classid')!] : cls0)) as S.ActorClass;
  if (!['car', 'truck', 'pedestrian', 'bicycle'].includes(cls)) throw new LabError(`${what}: 'Class' is 'car', 'truck', 'pedestrian' or 'bicycle'.`);
  const p = o.v('position') ?? [0, 0];
  const list = listOf(s, 'Actors'), id = list.length + 1;
  const f: [string, Value][] = [['Class', str(cls)], ['Position', row([p[0] ?? 0, p[1] ?? 0])], ['Yaw', num(o.n('yaw') ?? 0)], ['Name', str(o.t('name') ?? '')]];
  for (const k of ['length', 'width', 'height'] as const) { const x = o.n(k); if (x !== undefined) { if (!(x > 0 && x < 50)) throw new LabError(`${what}: sizes in metres, above 0.`); f.push([k[0].toUpperCase() + k.slice(1), num(x)]); } }
  return [withList(s, 'Actors', [...list, struct(f)]), num(id)];
}
def('actor', (a) => { if (!isScenario(a[0])) throw new LabError("actor(s, 'Class', 'pedestrian', 'Position', [x y]): add a person, bike or anything else to a drivingScenario."); return scenarioActor(a, 'pedestrian', 'actor'); });
def('trajectory', (a) => {
  if (!isScenario(a[0])) throw new LabError("trajectory(s, id, waypoints, speed, 'Wait', 0): an actor's path.");
  const list = listOf(a[0], 'Actors'), id = Math.round(toMat(a[1] ?? num(NaN)).d[0]);
  if (!(id >= 1 && id <= list.length)) throw new LabError(`trajectory: actors are numbered 1 to ${list.length}.`);
  const w = rowsOf(a[2] ?? num(NaN), 'The waypoints'), sp = a[3] ? [...toMat(a[3]).d] : [10];
  if (w.length < 2) throw new LabError('trajectory: at least two waypoints.');
  if (sp.some((v) => !(v >= 0 && v <= 100)) || (sp.length !== 1 && sp.length !== w.length)) throw new LabError('trajectory: one speed (m/s, 0 to 100), or one for each waypoint.');
  const o = opts(a, 4, ['wait'], 'trajectory'), act = list[id - 1] as Struct;
  const changed = struct([...act.f.entries()].filter(([k]) => !['Waypoints', 'Speeds', 'Wait'].includes(k)).concat([['Waypoints', mx(w)], ['Speeds', row(sp)], ['Wait', num(o.n('wait') ?? 0)], ['Position', row(w[0])]]));
  return [withList(a[0], 'Actors', list.map((x, i) => (i === id - 1 ? changed : x)))];
});
def('addSensor', (a) => {
  if (!isScenario(a[0])) throw new LabError("addSensor(s, 'radar', 'Mount', [3.7 0 0.2], 'Yaw', 0, 'FieldOfView', 20, 'MaxRange', 174): a sensor on the ego vehicle ('vision', 'radar' or 'lidar').");
  const type = a[1] ? textOf(a[1]).toLowerCase() : '';
  if (!['vision', 'radar', 'lidar'].includes(type)) throw new LabError("addSensor: the type is 'vision' (a camera), 'radar' or 'lidar'.");
  const o = opts(a, 2, ['mount', 'yaw', 'fieldofview', 'maxrange', 'detectionprobability', 'falsealarmrate', 'noise', 'channels', 'azimuthresolution', 'verticalfov'], 'addSensor');
  const f: [string, Value][] = [['Type', str(type)]];
  const map: Record<string, string> = { mount: 'Mount', yaw: 'Yaw', fieldofview: 'FieldOfView', maxrange: 'MaxRange', detectionprobability: 'DetectionProbability', falsealarmrate: 'FalseAlarmRate', noise: 'Noise', channels: 'Channels', azimuthresolution: 'AzimuthResolution', verticalfov: 'VerticalFOV' };
  for (const [k, name] of Object.entries(map)) { const v = o.raw(k); if (v) f.push([name, toMat(v)]); }
  const fov = o.n('fieldofview'), rng = o.n('maxrange'), ch = o.n('channels');
  if ((fov !== undefined && !(fov > 0 && fov <= 360)) || (rng !== undefined && !(rng > 0 && rng <= 1000)) || (ch !== undefined && !(ch >= 1 && ch <= 128))) throw new LabError('addSensor: a field of view of 0 to 360°, a range up to 1000 m, 1 to 128 lidar channels.');
  return [withList(a[0], 'Sensors', [...listOf(a[0], 'Sensors'), struct(f)])];
});
const table = (cols: number[][]) => { const r = cols[0]?.length ?? 0; return mat(r, cols.length, cols.flat()); };
def('runScenario', (a, nout, lab) => {
  if (!isScenario(a[0])) throw new LabError("r = runScenario(s, 'CloudEvery', 10): run a drivingScenario.");
  const o = opts(a, 1, ['cloudevery'], 'runScenario');
  const r = wrap(() => S.runScenario(specOf(a[0] as Struct), { cloudEvery: Math.max(1, Math.round(o.n('cloudevery') ?? 10)) }));
  const D = r.detections, L = r.lanes;
  const out = struct([
    ['Time', mat(r.t.length, 1, r.t)],
    ['Poses', cell(r.poses.map((p) => table([p.map((q) => q.x), p.map((q) => q.y), p.map((q) => (q.yaw * 180) / Math.PI), p.map((q) => q.v)])))],
    ['Actors', cell(r.actors.map((x) => struct([['Class', str(x.cls)], ['Name', str(x.name)], ['Size', row([x.L, x.W, x.H])]])))],
    // one detection a row: time, sensor, x, y (m, the sensor's frame: x ahead, y left), vx, vy, class (0 none), truth (actor, 0 a false alarm), range, azimuth (°), range rate
    ['Detections', table([D.map((d) => d.t), D.map((d) => d.sensor + 1), D.map((d) => d.x), D.map((d) => d.y), D.map((d) => d.vx), D.map((d) => d.vy), D.map((d) => d.cls), D.map((d) => d.truth + 1), D.map((d) => d.range ?? NaN), D.map((d) => d.az ?? NaN), D.map((d) => d.rate ?? NaN)])],
    ['Lanes', table([L.map((l) => l.t), L.map((l) => l.sensor + 1), ...[0, 1, 2, 3].map((k) => L.map((l) => l.left?.[k] ?? NaN)), ...[0, 1, 2, 3].map((k) => L.map((l) => l.right?.[k] ?? NaN))])],
    ['PointClouds', cell(r.clouds.map((c) => struct([['Time', num(c.t)], ['Sensor', num(c.sensor + 1)], ['Points', table([c.pts.map((p) => p[0]), c.pts.map((p) => p[1]), c.pts.map((p) => p[2])])]])))],
    ['Collisions', table([r.collisions.map((c) => c.t), r.collisions.map((c) => c.a + 1), r.collisions.map((c) => c.b + 1)])],
  ]);
  if (nout > 0) return [out];
  lab.host.out(`${r.t.length} steps: ${D.length} detections, ${r.clouds.length} point clouds, ${r.collisions.length ? `collisions at ${r.collisions.map((c) => `${c.t.toFixed(1)} s (actors ${c.a + 1} and ${c.b + 1})`).join(', ')}` : 'no collisions'}.\n`);
  return [];
});
def('plotScenario', (a, _nout, lab) => {
  if (!isScenario(a[0])) throw new LabError("plotScenario(s, t): the bird's-eye view at time t (seconds; 0 by default), with what the sensors see.");
  const spec = specOf(a[0] as Struct), r = wrap(() => S.runScenario({ ...spec, sensors: spec.sensors.filter((x) => x.kind !== 'lidar') }));
  const tAsk = a[1] ? toMat(a[1]).d[0] : 0, k = Math.max(0, Math.min(r.t.length - 1, Math.round(tAsk / spec.dt)));
  call(lab, 'hold', str('on'));
  for (const rd of r.roads) {
    const W = rd.lanes * rd.laneWidth / 2, L = rd.x.map((x, i) => [x - W * Math.sin(rd.h[i]), rd.y[i] + W * Math.cos(rd.h[i])]), R = rd.x.map((x, i) => [x + W * Math.sin(rd.h[i]), rd.y[i] - W * Math.cos(rd.h[i])]);
    const poly = [...L, ...R.reverse()];
    call(lab, 'fill', row(poly.map((p) => p[0])), row(poly.map((p) => p[1])), row([0.82, 0.83, 0.86]), str('EdgeColor'), str('none'));
    for (const b of S.laneBoundaries(rd)) call(lab, 'plot', row(b.x), row(b.y), str(b.solid ? 'k-' : 'w--'));
  }
  r.poses.forEach((p, i) => {
    const C = S.corners(r.actors[i], p[k]), col = i === spec.ego ? [0.15, 0.39, 0.92] : r.actors[i].cls === 'pedestrian' ? [0.9, 0.4, 0.1] : [0.45, 0.45, 0.5];
    call(lab, 'fill', row([...C.map((c) => c[0]), C[0][0]]), row([...C.map((c) => c[1]), C[0][1]]), row(col));
  });
  // detections of step k, from each sensor's frame back to the world
  const ego = r.poses[spec.ego ?? 0][k];
  r.detections.filter((d) => Math.abs(d.t - r.t[k]) < 1e-9).forEach((d) => {
    const s = spec.sensors[d.sensor], m = s.mount ?? [0, 0, 0], sy = ((s.yaw ?? 0) * Math.PI) / 180, ex = m[0] + d.x * Math.cos(sy) - d.y * Math.sin(sy), ey = m[1] + d.x * Math.sin(sy) + d.y * Math.cos(sy);
    call(lab, 'plot', num(ego.x + ex * Math.cos(ego.yaw) - ey * Math.sin(ego.yaw)), num(ego.y + ex * Math.sin(ego.yaw) + ey * Math.cos(ego.yaw)), str(s.kind === 'radar' ? 'ro' : 'g^'));
  });
  call(lab, 'hold', str('off')); call(lab, 'axis', str('equal')); call(lab, 'xlabel', str('x (m)')); call(lab, 'ylabel', str('y (m)'));
  call(lab, 'title', str(`t = ${r.t[k].toFixed(1)} s · camera ▲ radar ○`));
  return [];
});
def('writeOpenDRIVE', (a, _nout, lab) => {
  if (!isScenario(a[0])) throw new LabError("writeOpenDRIVE(s, 'roads.xodr'): a drivingScenario's roads as OpenDRIVE.");
  const name = a[1] ? textOf(a[1]) : '';
  if (!/^[\w.-]+\.xodr$/i.test(name)) throw new LabError('writeOpenDRIVE: a file name ending in .xodr.');
  const roads = specOf(a[0] as Struct).roads;
  if (!roads.length) throw new LabError('writeOpenDRIVE: the scenario has no roads.');
  const fs = files(lab);
  if (!fs) throw new LabError('writeOpenDRIVE: Hyperion’s files aren’t here.');
  fs.putText(name, S.writeOpenDRIVE(roads, name.replace(/\.xodr$/i, '')));
  return [];
});
def('readOpenDRIVE', (a, _nout, lab) => {
  const name = a[0] ? textOf(a[0]) : '';
  if (!name) throw new LabError("s = readOpenDRIVE('roads.xodr', s): the roads of an OpenDRIVE file into a drivingScenario (a new one by default).");
  const fs = files(lab);
  if (!fs) throw new LabError('readOpenDRIVE: Hyperion’s files aren’t here.');
  const roads = wrap(() => S.readOpenDRIVE(new TextDecoder().decode(fs.get(name).bytes)));
  let s = isScenario(a[1]) ? a[1] : (BUILTINS.drivingScenario([], 1, lab)[0] as Struct);
  for (const r of roads) s = BUILTINS.road([s, mx(r.centers), str('Lanes'), num(r.lanes), str('LaneWidth'), num(r.laneWidth), str('Name'), str(r.name ?? '')], 1, lab)[0] as Struct;
  return [s];
});
