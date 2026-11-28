import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import * as C from './can';
import { readOSM } from './osm';
import * as S from './scenario';
import { isScenario, specOf } from './scenario-lab';
import * as RN from './render';

// Hyperion's recorded driving data in the language (M576; M577: cameraImage and scenarioGroundTruth, a scenario's
// camera pictures and their true labels): canDatabase (DBC), readCANLog and writeCANLog (Vector
// .asc, candump), canSignalTimetable (every message's signals over time), canFrame (signals into a frame's bytes), and
// roadNetwork (OpenStreetMap or OpenDRIVE roads into a drivingScenario).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const struct = (f: [string, Value][]): Struct => ({ k: 'struct', f: new Map(f) });
const cell = (d: Value[]): Cell => ({ k: 'cell', r: 1, c: d.length, d });
const col = (v: number[]) => mat(v.length, 1, v);
const files = (lab: Lab) => { const s = (lab.host as { files?: unknown }).files; return s instanceof FileStore ? s : null; };
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const readText = (lab: Lab, v: Value | undefined, what: string) => {
  const name = v ? textOf(v) : '';
  if (!name) throw new LabError(`${what}: a file in Hyperion's files.`);
  const fs = files(lab);
  if (!fs) throw new LabError(`${what}: Hyperion’s files aren’t here.`);
  return new TextDecoder().decode(fs.get(name).bytes);
};
// the database kept as a struct, its messages' JSON beside it so it reads back exactly
const dbStruct = (msgs: C.Message[]): Struct => struct([
  ['Messages', cell(msgs.map((m) => struct([['Name', str(m.name)], ['ID', num(m.id)], ['Extended', { ...num(m.extended ? 1 : 0), logical: true }], ['Length', num(m.dlc)], ['Sender', str(m.sender)],
    ['Signals', cell(m.signals.map((s) => struct([['Name', str(s.name)], ['StartBit', num(s.start)], ['Length', num(s.length)], ['ByteOrder', str(s.intel ? 'LittleEndian' : 'BigEndian')], ['Signed', { ...num(s.signed ? 1 : 0), logical: true }], ['Factor', num(s.factor)], ['Offset', num(s.offset)], ['Minimum', num(s.min)], ['Maximum', num(s.max)], ['Units', str(s.unit)]])))]])))],
  ['MessageNames', cell(msgs.map((m) => str(m.name)))], ['Raw', str(JSON.stringify(msgs))],
]);
const dbOf = (v: Value | undefined, what: string): C.Message[] => {
  if (v?.k !== 'struct' || !v.f.has('Raw')) throw new LabError(`${what}: a database from canDatabase.`);
  return JSON.parse(textOf(v.f.get('Raw')!)) as C.Message[];
};
const framesStruct = (fr: C.Frame[]): Struct => {
  const w = Math.max(8, ...fr.map((f) => f.data.length));
  return struct([['Time', col(fr.map((f) => f.t))], ['ID', col(fr.map((f) => f.id))], ['Extended', { ...col(fr.map((f) => (f.extended ? 1 : 0))), logical: true }], ['Channel', col(fr.map((f) => f.channel))], ['Length', col(fr.map((f) => f.data.length))], ['Data', mat(fr.length, w, Array.from({ length: w }, (_, j) => fr.map((f) => f.data[j] ?? 0)).flat())]]);
};
const framesOf = (v: Value | undefined, what: string): C.Frame[] => {
  if (v?.k !== 'struct' || !v.f.has('ID') || !v.f.has('Data')) throw new LabError(`${what}: frames from readCANLog.`);
  const t = toMat(v.f.get('Time')!).d, id = toMat(v.f.get('ID')!).d, ext = toMat(v.f.get('Extended')!).d, ch = toMat(v.f.get('Channel')!).d, len = toMat(v.f.get('Length')!).d, D = toMat(v.f.get('Data')!);
  return Array.from(id, (x, i) => ({ t: t[i], id: x, extended: !!ext[i], channel: ch[i], data: Array.from({ length: len[i] }, (_, j) => D.d[i + j * D.r]) }));
};

def('canDatabase', (a, _nout, lab) => [dbStruct(wrap(() => C.readDBC(readText(lab, a[0], 'canDatabase'))))]);
def('readCANLog', (a, _nout, lab) => [framesStruct(wrap(() => C.readCANLog(readText(lab, a[0], 'readCANLog'))))]);
def('writeCANLog', (a, _nout, lab) => {
  const fr = framesOf(a[0], 'writeCANLog'), name = a[1] ? textOf(a[1]) : '';
  if (!/^[\w.-]+\.asc$/i.test(name)) throw new LabError("writeCANLog(frames, 'log.asc'): a Vector ASCII file name.");
  const fs = files(lab);
  if (!fs) throw new LabError('writeCANLog: Hyperion’s files aren’t here.');
  fs.putText(name, C.writeASC(fr));
  return [];
});
def('canSignalTimetable', (a) => {
  const fr = framesOf(a[0], 'canSignalTimetable'), db = dbOf(a[1], 'canSignalTimetable'), tt = C.signalTimetables(fr, db);
  const only = a[2] ? textOf(a[2]) : '';
  const one = (name: string) => { const x = tt[name]; if (!x) throw new LabError(`canSignalTimetable: no frames of ${name} in the log.`); return struct([['Time', col(x.t)], ...Object.entries(x.signals).map(([k, v]) => [k, col(v)] as [string, Value])]); };
  if (only) return [one(only)];
  return [struct(Object.keys(tt).map((k) => [k, one(k)]))];
});
def('canFrame', (a) => {
  const db = dbOf(a[0], 'canFrame'), name = a[1] ? textOf(a[1]) : '', m = db.find((x) => x.name === name);
  if (!m) throw new LabError(`canFrame(db, 'Message', values): no message called “${name}” (it has ${db.map((x) => x.name).join(', ')}).`);
  const v = a[2];
  if (v?.k !== 'struct') throw new LabError('canFrame: the signals as a struct, e.g. struct(\'EngineSpeed\', 1500).');
  const values: Record<string, number> = {};
  for (const [k, x] of v.f) { if (!m.signals.some((s) => s.name === k)) throw new LabError(`canFrame: ${name} has no signal ${k}.`); values[k] = toMat(x).d[0]; }
  return [mat(1, m.dlc, C.encodeFrame(m, values))];
});
def('roadNetwork', (a, _nout, lab) => {
  if (!isScenario(a[0])) throw new LabError("s = roadNetwork(s, 'OpenStreetMap', 'map.osm') or roadNetwork(s, 'OpenDRIVE', 'roads.xodr'): roads from a map file into a drivingScenario.");
  const kind = a[1] ? textOf(a[1]).toLowerCase() : '', text = readText(lab, a[2], 'roadNetwork');
  const roads: S.RoadSpec[] = kind === 'openstreetmap' ? wrap(() => readOSM(text).roads) : kind === 'opendrive' ? wrap(() => S.readOpenDRIVE(text)) : (() => { throw new LabError("roadNetwork: 'OpenStreetMap' or 'OpenDRIVE'."); })();
  let s: Value = a[0];
  for (const r of roads) s = BUILTINS.road([s, mat(r.centers.length, 2, [...r.centers.map((p) => p[0]), ...r.centers.map((p) => p[1])]), str('Lanes'), num(r.lanes), str('LaneWidth'), num(r.laneWidth), str('Name'), str(r.name ?? '')], 1, lab)[0];
  return [s];
});

// ——— Camera pictures and their true labels (M577) ———
const camOf = (a: Value[], from: number, what: string) => {
  const o = new Map<string, Value>(); for (let i = from; i + 1 < a.length; i += 2) o.set(textOf(a[i]).toLowerCase(), a[i + 1]);
  for (const k of o.keys()) if (!['mount', 'yaw', 'pitch', 'fieldofview', 'size', 'times', 'minvisible'].includes(k)) throw new LabError(`${what}: no option '${k}' ('Mount', 'Yaw', 'Pitch', 'FieldOfView', 'Size'${what === 'scenarioGroundTruth' ? ", 'Times', 'MinVisible'" : ''}).`);
  const v = (k: string) => (o.has(k) ? [...toMat(o.get(k)!).d] : undefined), size = v('size') ?? [360, 640], m = v('mount');
  if (!(size[0] >= 16 && size[1] >= 16 && size[0] * size[1] <= 4_000_000)) throw new LabError(`${what}: 'Size' is [rows columns], 16 to about 2000 each.`);
  return { cam: { mount: m ? [m[0] ?? 1.9, m[1] ?? 0, m[2] ?? 1.3] as [number, number, number] : undefined, yaw: v('yaw')?.[0], pitch: v('pitch')?.[0], fov: v('fieldofview')?.[0], height: Math.round(size[0]), width: Math.round(size[1]) }, times: v('times'), minVisible: v('minvisible')?.[0] ?? 0.2 };
};
const labelsStruct = (L: RN.Label[]): Struct => struct([['Boxes', mat(L.length, 4, [0, 1, 2, 3].flatMap((j) => L.map((l) => l.box[j])))], ['Classes', cell(L.map((l) => str(l.cls)))], ['Truth', col(L.map((l) => l.truth + 1))], ['Visible', col(L.map((l) => l.visible))]]);
def('cameraImage', (a, nout) => {
  if (!isScenario(a[0])) throw new LabError("[img, labels] = cameraImage(s, t, 'Mount', [1.9 0 1.3], 'FieldOfView', 70, 'Size', [360 640]): what the ego vehicle's camera sees at time t.");
  const spec = specOf(a[0] as Struct), t = a[1] ? toMat(a[1]).d[0] : 0, { cam } = camOf(a, 2, 'cameraImage');
  const run = wrap(() => S.runScenario({ ...spec, sensors: [] })), k = Math.max(0, Math.min(run.t.length - 1, Math.round(t / spec.dt)));
  const im = RN.cameraImage(run, k, spec.ego ?? 0, cam), H = im.height, W = im.width, d = new Float64Array(H * W * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) d[y + x * H + c * H * W] = im.rgb[3 * (y * W + x) + c];
  return [{ k: 'mat', r: H, c: W, p: 3, d, cls: 'uint8' } as Value, labelsStruct(im.labels)].slice(0, Math.max(1, nout));
});
def('scenarioGroundTruth', (a) => {
  if (!isScenario(a[0])) throw new LabError("gt = scenarioGroundTruth(s, 'Times', 0:0.5:5, 'MinVisible', 0.2): the true boxes in the ego camera's picture at those times (automatic labels).");
  const spec = specOf(a[0] as Struct), { cam, times, minVisible } = camOf(a, 1, 'scenarioGroundTruth');
  const run = wrap(() => S.runScenario({ ...spec, sensors: [] })), T = times ?? run.t.filter((_, i) => i % Math.max(1, Math.round(0.5 / spec.dt)) === 0);
  if (T.length > 2000) throw new LabError('scenarioGroundTruth: at most 2,000 frames.');
  const frames = T.map((t) => { const k = Math.max(0, Math.min(run.t.length - 1, Math.round(t / spec.dt))); return labelsStruct(RN.cameraImage(run, k, spec.ego ?? 0, cam).labels.filter((l) => l.visible >= minVisible)); });
  return [struct([['Times', col(T)], ['LabelDefinitions', cell(['car', 'truck', 'pedestrian', 'bicycle'].map((x) => str(x)))], ['Labels', { k: 'cell', r: T.length, c: 1, d: frames }]])];
});
