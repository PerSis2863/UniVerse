import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Cell, type Struct, type Value } from './values';
import * as R from './rosbag';

// ROS bags in the language (M578): rosbagreader (ROS 1 .bag, MCAP), readMessages, rosTimeseries, rosReadImage,
// rosReadXYZ, rosReadField. A message is a struct with the field names its definition gives.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const col = (v: number[]) => mat(v.length, 1, v);
const colCell = (d: Value[]): Cell => ({ k: 'cell', r: d.length, c: 1, d });
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };
const cache = new WeakMap<Uint8Array, R.Bag>();
const USE = "bag = rosbagreader('drive.bag') (or an .mcap file in Hyperion's files)";
function bagOf(lab: Lab, v: Value | undefined, what: string): [R.Bag, string] {
  const name = v?.k === 'struct' && v.f.has('FilePath') ? textOf(v.f.get('FilePath')!) : v?.k === 'str' ? v.v : '';
  if (!name) throw new LabError(`${what}: ${USE}.`);
  const fs = (lab.host as { files?: unknown }).files;
  if (!(fs instanceof FileStore)) throw new LabError(`${what}: Hyperion’s files aren’t here.`);
  const bytes = fs.get(name).bytes;
  let bag = cache.get(bytes);
  if (!bag) { bag = wrap(() => R.readBag(bytes)); cache.set(bytes, bag); }
  return [bag, name];
}
const toValue = (v: R.Decoded): Value => {
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return str(v);
  if (v instanceof Uint8Array) return { ...mat(1, v.length, v), cls: 'uint8' };
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'number')) return mat(v.length ? 1 : 0, v.length, v as number[]);
    return { k: 'cell', r: 1, c: v.length, d: (v as R.Decoded[]).map(toValue) };
  }
  return { k: 'struct', f: new Map(Object.entries(v).map(([k, x]) => [k, toValue(x)])) };
};
const jsOf = (v: Value): unknown => {
  if (v.k === 'mat') return v.r * v.c === 1 && (v.p ?? 1) === 1 ? v.d[0] : v.d;
  if (v.k === 'str') return v.v;
  if (v.k === 'cell') return v.d.map(jsOf);
  if (v.k === 'struct') return Object.fromEntries([...v.f].map(([k, x]) => [k, jsOf(x)]));
  return undefined;
};
const opts = (a: Value[], from: number, what: string, allowed: string[]) => {
  const o = new Map<string, Value>();
  for (let i = from; i < a.length; i += 2) {
    const k = textOf(a[i]).toLowerCase();
    if (!allowed.includes(k) || i + 1 >= a.length) throw new LabError(`${what}: options are ${allowed.map((x) => `'${x[0].toUpperCase()}${x.slice(1)}'`).join(', ')}.`);
    o.set(k, a[i + 1]);
  }
  return o;
};
/** The messages chosen by topic and time range, at most `max`. */
function pick(bag: R.Bag, o: Map<string, Value>, what: string, topic?: string) {
  const want = topic ?? (o.has('topic') ? textOf(o.get('topic')!) : undefined), tr = o.has('time') ? [...toMat(o.get('time')!).d] : undefined, max = o.has('max') ? toMat(o.get('max')!).d[0] : 20000;
  const k = want === undefined ? -1 : bag.topics.findIndex((t) => t.topic === want);
  if (want !== undefined && k < 0) throw new LabError(`${what}: no topic '${want}' (the bag has ${bag.topics.map((t) => t.topic).join(', ')}).`);
  const sel = bag.messages.filter((m) => (k < 0 || m.topic === k) && (!tr || (m.t >= tr[0] && m.t <= (tr[1] ?? Infinity))));
  if (sel.length > max) throw new LabError(`${what}: ${sel.length.toLocaleString()} messages; choose a topic or a 'Time' range (at most ${max.toLocaleString()}, or set 'Max').`);
  return sel;
}

def('rosbagreader ros2bagreader', (a, _n, lab) => {
  const [bag, name] = bagOf(lab, a[0], 'rosbagreader');
  const T: Struct = { k: 'struct', table: true, f: new Map<string, Value>([['Topic', colCell(bag.topics.map((t) => str(t.topic)))], ['MessageType', colCell(bag.topics.map((t) => str(t.type)))], ['NumMessages', col(bag.topics.map((t) => t.count))]]) };
  return [{ k: 'struct', f: new Map<string, Value>([['FilePath', str(name)], ['Format', str(bag.format === 'ros1' ? 'ROS 1 bag' : 'MCAP')], ['StartTime', num(bag.start)], ['EndTime', num(bag.end)], ['NumMessages', num(bag.messages.length)], ['AvailableTopics', T]]) }];
});
def('readMessages', (a, nout, lab) => {
  const [bag] = bagOf(lab, a[0], 'readMessages'), sel = pick(bag, opts(a, 1, 'readMessages', ['topic', 'time', 'max']), 'readMessages');
  const msgs = colCell(sel.map((m) => toValue(wrap(() => R.decodeMessage(bag, m)))));
  return nout > 1 ? [msgs, col(sel.map((m) => m.t))] : [msgs];
});
def('rosTimeseries', (a, _n, lab) => {
  const [bag] = bagOf(lab, a[0], 'rosTimeseries');
  if (a.length < 3) throw new LabError("[t, v] = rosTimeseries(bag, '/imu', 'linear_acceleration.x', 'Time', [t0 t1]): a numeric field over time.");
  const path = textOf(a[2]).split('.'), sel = pick(bag, opts(a, 3, 'rosTimeseries', ['time', 'max']), 'rosTimeseries', textOf(a[1]));
  const rows = sel.map((m) => {
    let v: unknown = wrap(() => R.decodeMessage(bag, m));
    for (const p of path) { if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && p in v) v = (v as Record<string, unknown>)[p]; else throw new LabError(`rosTimeseries: the messages have no field '${path.join('.')}'.`); }
    if (typeof v === 'number') return [v];
    if (ArrayBuffer.isView(v) || (Array.isArray(v) && v.every((x) => typeof x === 'number'))) return Array.from(v as ArrayLike<number>);
    throw new LabError(`rosTimeseries: '${path.join('.')}' isn't a number or a list of numbers.`);
  });
  const w = Math.max(0, ...rows.map((r) => r.length));
  const d = new Float64Array(rows.length * w).fill(NaN);
  rows.forEach((r, i) => r.forEach((x, j) => { d[i + j * rows.length] = x; }));
  return [col(sel.map((m) => m.t)), { k: 'mat', r: rows.length, c: w, d }];
});
const msgArg = (v: Value | undefined, what: string) => { if (v?.k !== 'struct') throw new LabError(`${what}: a message from readMessages (msgs{1}).`); return jsOf(v) as Record<string, unknown>; };
def('rosReadImage', (a) => {
  const im = wrap(() => R.readImage(msgArg(a[0], 'rosReadImage')));
  return [{ k: 'mat', r: im.h, c: im.w, ...(im.ch > 1 ? { p: im.ch } : {}), d: im.data, cls: im.sixteen ? 'uint16' : 'uint8' }];
});
def('rosReadXYZ', (a) => { const rows = wrap(() => R.readCloud(msgArg(a[0], 'rosReadXYZ'))); return [mat(rows.length, 3, [0, 1, 2].flatMap((j) => rows.map((r) => r[j])))]; });
def('rosReadField', (a) => {
  if (!a[1]) throw new LabError("v = rosReadField(msg, 'intensity'): one field of a PointCloud2 message.");
  return [col(wrap(() => R.readCloud(msgArg(a[0], 'rosReadField'), [textOf(a[1])])).map((r) => r[0]))];
});
