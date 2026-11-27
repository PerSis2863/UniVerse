import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import * as C from './can';
import { readOSM } from './osm';
import * as S from './scenario';
import { isScenario } from './scenario-lab';

// Hyperion's recorded driving data in the language (M576): canDatabase (DBC), readCANLog and writeCANLog (Vector
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
