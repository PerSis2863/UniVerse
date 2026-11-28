// Hyperion's ROS bags (M578, the owner, 27 Nov: the automated-driving page's "access live and recorded driving data…
// ROS"): ROS 1 bags (format 2.0, chunks stored plainly or with LZ4) and MCAP files (ROS 2's bag format since Iron;
// plain or LZ4 chunks), every message decoded from the message definitions the bag carries (ROS 1's serialisation,
// ROS 2's CDR, JSON), plus a camera image and a point cloud read from their messages. Our own code from the published
// formats (the rosbag 2.0 format page, the MCAP specification, the ROS message and CDR rules). M579: bz2 (ROS 1) and
// zstd (MCAP) chunks, ROS 2's SQLite bags (.db3, read by the page and handed over as tables), common message types
// known without their definitions, and compressed camera pictures (JPEG, PNG).

import { unzlibSync } from 'fflate';
import { bunzip2 } from './bzip2';
import { zstd } from './zstd';
import { decodeJpeg } from './dicom-codecs';
import { SqliteFile } from './sqlite-read';

export interface Field { type: string; name: string; array?: number } // array: n fixed, -1 variable
export type Defs = Map<string, Field[]>;
export interface Topic { topic: string; type: string; encoding: string; defs?: Defs; top?: string; count: number }
export interface BagMessage { topic: number; t: number; data: Uint8Array }
export interface Bag { format: 'ros1' | 'mcap' | 'db3'; topics: Topic[]; messages: BagMessage[]; start: number; end: number }
export type Decoded = number | string | Uint8Array | number[] | Decoded[] | { [k: string]: Decoded };

const SIZE: Record<string, number> = { bool: 1, int8: 1, uint8: 1, byte: 1, char: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, int64: 8, uint64: 8, float32: 4, float64: 8 };
const isPrim = (t: string) => t in SIZE || t === 'string' || t === 'wstring' || t === 'time' || t === 'duration';
const ascii = (b: Uint8Array) => new TextDecoder().decode(b);
/** "pkg/msg/Type" and "pkg/Type" are the same type. */
const norm = (t: string) => { const p = t.split('/'); return p.length > 1 ? `${p[0]}/${p[p.length - 1]}` : t; };
const BUILT: Record<string, string> = {
  'builtin_interfaces/Time': 'int32 sec\nuint32 nanosec', 'builtin_interfaces/Duration': 'int32 sec\nuint32 nanosec',
  'std_msgs/Header#1': 'uint32 seq\ntime stamp\nstring frame_id', 'std_msgs/Header#2': 'builtin_interfaces/Time stamp\nstring frame_id',
};
/** Common ROS 2 types, for bags that name a type without its definition (.db3 bags before Iron). */
const KNOWN: Record<string, string> = {
  'std_msgs/String': 'string data', 'std_msgs/Bool': 'bool data', 'std_msgs/Int32': 'int32 data', 'std_msgs/Int64': 'int64 data', 'std_msgs/Float32': 'float32 data', 'std_msgs/Float64': 'float64 data',
  'geometry_msgs/Vector3': 'float64 x\nfloat64 y\nfloat64 z', 'geometry_msgs/Point': 'float64 x\nfloat64 y\nfloat64 z', 'geometry_msgs/Quaternion': 'float64 x\nfloat64 y\nfloat64 z\nfloat64 w',
  'geometry_msgs/Pose': 'Point position\nQuaternion orientation', 'geometry_msgs/PoseStamped': 'std_msgs/Header header\nPose pose', 'geometry_msgs/PointStamped': 'std_msgs/Header header\nPoint point',
  'geometry_msgs/Twist': 'Vector3 linear\nVector3 angular', 'geometry_msgs/TwistStamped': 'std_msgs/Header header\nTwist twist', 'geometry_msgs/Transform': 'Vector3 translation\nQuaternion rotation',
  'geometry_msgs/TransformStamped': 'std_msgs/Header header\nstring child_frame_id\nTransform transform', 'tf2_msgs/TFMessage': 'geometry_msgs/TransformStamped[] transforms',
  'geometry_msgs/PoseWithCovariance': 'Pose pose\nfloat64[36] covariance', 'geometry_msgs/TwistWithCovariance': 'Twist twist\nfloat64[36] covariance',
  'nav_msgs/Odometry': 'std_msgs/Header header\nstring child_frame_id\ngeometry_msgs/PoseWithCovariance pose\ngeometry_msgs/TwistWithCovariance twist',
  'sensor_msgs/Imu': 'std_msgs/Header header\ngeometry_msgs/Quaternion orientation\nfloat64[9] orientation_covariance\ngeometry_msgs/Vector3 angular_velocity\nfloat64[9] angular_velocity_covariance\ngeometry_msgs/Vector3 linear_acceleration\nfloat64[9] linear_acceleration_covariance',
  'sensor_msgs/NavSatStatus': 'int8 status\nuint16 service', 'sensor_msgs/NavSatFix': 'std_msgs/Header header\nNavSatStatus status\nfloat64 latitude\nfloat64 longitude\nfloat64 altitude\nfloat64[9] position_covariance\nuint8 position_covariance_type',
  'sensor_msgs/Image': 'std_msgs/Header header\nuint32 height\nuint32 width\nstring encoding\nuint8 is_bigendian\nuint32 step\nuint8[] data',
  'sensor_msgs/CompressedImage': 'std_msgs/Header header\nstring format\nuint8[] data',
  'sensor_msgs/PointField': 'string name\nuint32 offset\nuint8 datatype\nuint32 count',
  'sensor_msgs/PointCloud2': 'std_msgs/Header header\nuint32 height\nuint32 width\nPointField[] fields\nbool is_bigendian\nuint32 point_step\nuint32 row_step\nuint8[] data\nbool is_dense',
  'sensor_msgs/LaserScan': 'std_msgs/Header header\nfloat32 angle_min\nfloat32 angle_max\nfloat32 angle_increment\nfloat32 time_increment\nfloat32 scan_time\nfloat32 range_min\nfloat32 range_max\nfloat32[] ranges\nfloat32[] intensities',
};
/** The definitions of a known type and everything it uses, from KNOWN (ROS 2 layout). */
export function knownDefs(type: string): Defs | undefined {
  if (!KNOWN[norm(type)]) return undefined;
  const defs: Defs = new Map(), todo = [norm(type)];
  while (todo.length) { const t = todo.pop()!; if (defs.has(t)) continue; const text = KNOWN[t] ?? BUILT[t] ?? (t === 'std_msgs/Header' ? BUILT['std_msgs/Header#2'] : undefined); if (!text) return undefined; const fs = fields(text, t.split('/')[0]); defs.set(t, fs); for (const f of fs) if (!isPrim(f.type)) todo.push(f.type); }
  return defs;
}

function fields(text: string, pkg: string): Field[] {
  const out: Field[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || /^\S+\s+[A-Za-z_]\w*\s*=/.test(line)) continue; // a constant
    const m = /^([\w/]+)(?:<=\d+)?(?:\[(<=)?(\d*)\])?\s+(\w+)/.exec(line);
    if (!m) throw new Error(`A message definition line I can't read: "${line}".`);
    let type = m[1];
    if (!isPrim(type)) type = type === 'Header' ? 'std_msgs/Header' : type.includes('/') ? norm(type) : `${pkg}/${type}`;
    out.push({ type, name: m[4], ...(m[3] !== undefined ? { array: m[3] && !m[2] ? +m[3] : -1 } : {}) });
  }
  return out;
}
/** The definitions in a connection's or schema's text: the top type first, then "MSG: pkg/Type" sections. */
export function parseDefinition(top: string, text: string, ros2: boolean): Defs {
  const defs: Defs = new Map(), parts = text.split(/^=+\s*$/m);
  const add = (name: string, body: string) => defs.set(norm(name), fields(body, norm(name).split('/')[0]));
  add(top, parts[0]);
  for (const p of parts.slice(1)) { const m = /^\s*MSG:\s*(\S+)\s*\n([\s\S]*)$/.exec(p); if (m) add(m[1], m[2]); }
  for (const [k, v] of Object.entries(BUILT)) { const [n, ver] = k.split('#'); if (!defs.has(n) && (!ver || +ver === (ros2 ? 2 : 1))) defs.set(n, fields(v, n.split('/')[0])); }
  return defs;
}

class Reader {
  dv: DataView; o: number;
  constructor(public u: Uint8Array, start: number, public cdr: boolean, public base = start, public little = true) { this.dv = new DataView(u.buffer, u.byteOffset, u.byteLength); this.o = start; }
  align(n: number) { if (this.cdr && n > 1) { const r = (this.o - this.base) % n; if (r) this.o += n - r; } }
  need(n: number) { if (this.o + n > this.u.length) throw new Error('The message is shorter than its definition says (a different message version?).'); }
  prim(t: string): number {
    const n = SIZE[t]; this.align(n); this.need(n); const d = this.dv, o = this.o, L = this.little; this.o += n;
    switch (t) {
      case 'bool': case 'uint8': case 'char': return d.getUint8(o);
      case 'byte': return this.cdr ? d.getUint8(o) : d.getInt8(o);
      case 'int8': return d.getInt8(o);
      case 'int16': return d.getInt16(o, L); case 'uint16': return d.getUint16(o, L);
      case 'int32': return d.getInt32(o, L); case 'uint32': return d.getUint32(o, L);
      case 'int64': return Number(d.getBigInt64(o, L)); case 'uint64': return Number(d.getBigUint64(o, L));
      case 'float32': return d.getFloat32(o, L); default: return d.getFloat64(o, L);
    }
  }
  str(): string { const n = this.prim('uint32'); this.need(n); const s = this.u.subarray(this.o, this.o + n); this.o += n; return ascii(this.cdr && n && s[n - 1] === 0 ? s.subarray(0, n - 1) : s); }
}
function value(r: Reader, defs: Defs, type: string): Decoded {
  if (type === 'string') return r.str();
  if (type === 'wstring') throw new Error('wstring fields aren’t read yet.');
  if (type === 'time' || type === 'duration') return { sec: r.prim(type === 'time' ? 'uint32' : 'int32'), nsec: r.prim('uint32') };
  if (type in SIZE) return r.prim(type);
  const fs = defs.get(type);
  if (!fs) throw new Error(`The bag doesn't define the message type ${type}.`);
  const o: { [k: string]: Decoded } = {};
  for (const f of fs) {
    if (f.array === undefined) { o[f.name] = value(r, defs, f.type); continue; }
    const n = f.array >= 0 ? f.array : r.prim('uint32');
    if (f.type === 'uint8' || f.type === 'char' || (f.type === 'byte' && r.cdr)) { r.need(n); o[f.name] = r.u.slice(r.o, r.o + n); r.o += n; }
    else if (f.type in SIZE) { const a = new Array<number>(n); for (let i = 0; i < n; i++) a[i] = r.prim(f.type); o[f.name] = a; }
    else { const a: Decoded[] = new Array(n); for (let i = 0; i < n; i++) a[i] = value(r, defs, f.type); o[f.name] = a; }
  }
  return o;
}

/** LZ4 frames (both block modes), into one buffer so linked blocks can look back. */
export function lz4(src: Uint8Array, hint = 0): Uint8Array {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  if (dv.getUint32(0, true) !== 0x184d2204) throw new Error('Not an LZ4 frame.');
  const flg = src[4]; let i = 6 + (flg & 8 ? 8 : 0) + (flg & 1 ? 4 : 0) + 1;
  let out = new Uint8Array(Math.max(hint, 1024)), p = 0;
  const room = (n: number) => { if (p + n > out.length) { const b = new Uint8Array(Math.max(out.length * 2, p + n)); b.set(out.subarray(0, p)); out = b; } };
  for (;;) {
    const size = dv.getUint32(i, true); i += 4;
    if (size === 0) break;
    const n = size & 0x7fffffff, end = i + n;
    if (size & 0x80000000) { room(n); out.set(src.subarray(i, end), p); p += n; }
    else while (i < end) {
      const tok = src[i++]; let lit = tok >> 4;
      if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
      room(lit); out.set(src.subarray(i, i + lit), p); p += lit; i += lit;
      if (i >= end) break;
      const off = src[i] | (src[i + 1] << 8); i += 2;
      let ml = tok & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); }
      ml += 4; if (!off || off > p) throw new Error('A broken LZ4 block.');
      room(ml); for (let k = 0; k < ml; k++, p++) out[p] = out[p - off];
    }
    i = end + (flg & 16 ? 4 : 0);
  }
  return out.subarray(0, p);
}

function readRos1(u: Uint8Array): Bag {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const conns = new Map<number, number>(), topics: Topic[] = [], messages: BagMessage[] = [];
  const scan = (b: Uint8Array, start: number) => {
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let o = start; o + 8 <= b.length;) {
      const hl = d.getUint32(o, true), h = new Map<string, Uint8Array>();
      for (let q = o + 4; q < o + 4 + hl;) { const fl = d.getUint32(q, true), f = b.subarray(q + 4, q + 4 + fl), eq = f.indexOf(61); h.set(ascii(f.subarray(0, eq)), f.subarray(eq + 1)); q += 4 + fl; }
      const dl = d.getUint32(o + 4 + hl, true), data = b.subarray(o + 8 + hl, o + 8 + hl + dl), op = h.get('op')?.[0];
      o += 8 + hl + dl;
      const u32 = (k: string) => { const v = h.get(k)!; return new DataView(v.buffer, v.byteOffset, 4).getUint32(0, true); };
      if (op === 0x05) {
        const how = ascii(h.get('compression') ?? new Uint8Array());
        if (how === 'none') scan(data, 0);
        else if (how === 'lz4') scan(lz4(data, u32('size')), 0);
        else if (how === 'bz2') scan(bunzip2(data, u32('size')), 0);
        else throw new Error(`This bag's chunks are compressed with ${how}; Hyperion reads plain, bz2 and LZ4 bags.`);
      } else if (op === 0x07) {
        const id = u32('conn');
        if (conns.has(id)) continue;
        const c = new Map<string, string>();
        const cd = new DataView(data.buffer, data.byteOffset, data.byteLength);
        for (let q = 0; q < data.length;) { const fl = cd.getUint32(q, true), f = data.subarray(q + 4, q + 4 + fl), eq = f.indexOf(61); c.set(ascii(f.subarray(0, eq)), ascii(f.subarray(eq + 1))); q += 4 + fl; }
        const type = c.get('type') ?? '?', topic = ascii(h.get('topic') ?? new Uint8Array());
        let k = topics.findIndex((t) => t.topic === topic && t.type === type);
        if (k < 0) { k = topics.length; topics.push({ topic, type, encoding: 'ros1', top: norm(type), defs: parseDefinition(type, c.get('message_definition') ?? '', false), count: 0 }); }
        conns.set(id, k);
      } else if (op === 0x02) {
        const tv = h.get('time')!, td = new DataView(tv.buffer, tv.byteOffset, 8);
        messages.push({ topic: u32('conn'), t: td.getUint32(0, true) + td.getUint32(4, true) / 1e9, data });
      }
    }
  };
  const nl = u.indexOf(10);
  if (dv.byteLength < 13 || nl < 0) throw new Error('Not a ROS bag.');
  scan(u, nl + 1);
  // a message's connection may be read after it (connections are also stored at the end)
  for (const m of messages) { const k = conns.get(m.topic); if (k === undefined) throw new Error('A message with no connection record (a cut-off bag? run rosbag reindex).'); m.topic = k; topics[k].count++; }
  return finish('ros1', topics, messages);
}

function readMcap(u: Uint8Array): Bag {
  const schemas = new Map<number, { name: string; encoding: string; data: string }>(), chans = new Map<number, number>(), topics: Topic[] = [], messages: BagMessage[] = [], pending: [number, number, Uint8Array][] = [];
  const str = (d: DataView, b: Uint8Array, o: number): [string, number] => { const n = d.getUint32(o, true); return [ascii(b.subarray(o + 4, o + 4 + n)), o + 4 + n]; };
  const scan = (b: Uint8Array, start: number) => {
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let o = start; o + 9 <= b.length;) {
      const op = b[o], L = Number(d.getBigUint64(o + 1, true)), c = b.subarray(o + 9, o + 9 + L), cd = new DataView(c.buffer, c.byteOffset, c.byteLength);
      o += 9 + L;
      if (op === 0x02) return; // the footer
      if (op === 0x03) { const id = cd.getUint16(0, true); const [name, a] = str(cd, c, 2), [encoding, b2] = str(cd, c, a), n = cd.getUint32(b2, true); schemas.set(id, { name, encoding, data: ascii(c.subarray(b2 + 4, b2 + 4 + n)) }); }
      else if (op === 0x04) {
        const id = cd.getUint16(0, true), sid = cd.getUint16(2, true); const [topic, a] = str(cd, c, 4), [enc] = str(cd, c, a);
        if (chans.has(id)) continue;
        const s = schemas.get(sid), type = s?.name ?? '(no schema)';
        const defs = s && (s.encoding === 'ros2msg' || s.encoding === 'ros1msg') && s.data.trim() ? parseDefinition(type, s.data, s.encoding === 'ros2msg') : enc === 'cdr' ? knownDefs(type) : undefined;
        chans.set(id, topics.length); topics.push({ topic, type, encoding: enc, defs, top: norm(type), count: 0 });
      } else if (op === 0x05) pending.push([cd.getUint16(0, true), Number(cd.getBigUint64(6, true)) / 1e9, c.subarray(22)]);
      else if (op === 0x06) {
        const size = Number(cd.getBigUint64(16, true)); const [how, a] = str(cd, c, 28), n = Number(cd.getBigUint64(a, true)), recs = c.subarray(a + 8, a + 8 + n);
        if (!how) scan(recs, 0);
        else if (how === 'lz4') scan(lz4(recs, size), 0);
        else if (how === 'zstd') scan(zstd(recs, size), 0);
        else throw new Error(`This MCAP file's chunks are compressed with ${how}; Hyperion reads plain, LZ4 and zstd chunks.`);
      }
    }
  };
  scan(u, 8);
  for (const [ch, t, data] of pending) { const k = chans.get(ch); if (k === undefined) continue; topics[k].count++; messages.push({ topic: k, t, data }); }
  return finish('mcap', topics, messages);
}
function finish(format: Bag['format'], topics: Topic[], messages: BagMessage[]): Bag {
  messages.sort((a, b) => a.t - b.t);
  return { format, topics, messages, start: messages[0]?.t ?? 0, end: messages.at(-1)?.t ?? 0 };
}
/** A ROS 1 bag or an MCAP file, by its first bytes. */
export function readBag(u: Uint8Array): Bag {
  const head = ascii(u.subarray(0, 13));
  if (head.startsWith('#ROSBAG V2.0')) return readRos1(u);
  if (u[0] === 0x89 && head.slice(1, 5) === 'MCAP') return readMcap(u);
  if (head.startsWith('#ROSBAG')) throw new Error('Only ROS bag format 2.0 is read (bags from ROS 1 since 2010).');
  if (head.startsWith('SQLite')) return readDb3(u);
  throw new Error('Not a ROS bag (.bag) or an MCAP file (.mcap).');
}
/** A ROS 2 SQLite bag's tables (topics, messages and, since Iron, message_definitions), as the page reads them. */
export interface Db3Tables { topics: { id: number; name: string; type: string; format: string }[]; messages: { topic: number; ns: number; data: Uint8Array }[]; definitions: { type: string; encoding: string; text: string }[] }
export function fromDb3(t: Db3Tables): Bag {
  const at = new Map<number, number>(), topics: Topic[] = t.topics.map((tp, i) => {
    at.set(tp.id, i);
    const d = t.definitions.find((x) => norm(x.type) === norm(tp.type) && x.encoding === 'ros2msg' && x.text.trim());
    return { topic: tp.name, type: tp.type, encoding: tp.format, defs: tp.format === 'cdr' ? (d ? parseDefinition(tp.type, d.text, true) : knownDefs(tp.type)) : undefined, top: norm(tp.type), count: 0 };
  });
  const messages: BagMessage[] = [];
  for (const m of t.messages) { const k = at.get(m.topic); if (k === undefined) continue; topics[k].count++; messages.push({ topic: k, t: m.ns / 1e9, data: m.data }); }
  return finish('db3', topics, messages);
}
/** A ROS 2 SQLite bag (.db3), read with our own SQLite reader. */
function readDb3(u: Uint8Array): Bag {
  const db = new SqliteFile(u), has = db.tables();
  if (!has.has('topics') || !has.has('messages')) throw new Error('This SQLite file isn’t a ROS 2 bag (no topics and messages tables).');
  const N = (v: unknown) => Number(v ?? 0), T = (v: unknown) => (typeof v === 'string' ? v : '');
  return fromDb3({
    topics: db.read('topics').map((r) => ({ id: N(r.id), name: T(r.name), type: T(r.type), format: T(r.serialization_format) || 'cdr' })),
    messages: db.read('messages').map((r) => ({ topic: N(r.topic_id), ns: N(r.timestamp), data: r.data instanceof Uint8Array ? r.data : new Uint8Array() })),
    definitions: has.has('message_definitions') ? db.read('message_definitions').map((r) => ({ type: T(r.topic_type), encoding: T(r.encoding), text: T(r.encoded_message_definition) })) : [],
  });
}
/** One message as plain values from its topic's definitions. */
export function decodeMessage(bag: Bag, m: BagMessage): Decoded {
  const tp = bag.topics[m.topic];
  if (tp.encoding === 'json') return JSON.parse(ascii(m.data)) as Decoded;
  if (!tp.defs) throw new Error(tp.encoding === 'cdr' ? `The bag doesn't carry the definition of ${tp.type} (record with ROS 2 Iron or newer, or as MCAP).` : `The topic ${tp.topic} is ${tp.encoding}; Hyperion decodes ROS 1, ROS 2 (CDR) and JSON messages.`);
  if (tp.encoding === 'cdr') {
    if (m.data[1] > 1) throw new Error('XCDR2 messages aren’t read yet (classic CDR only).');
    return value(new Reader(m.data, 4, true, 4, m.data[1] === 1), tp.defs, tp.top!);
  }
  return value(new Reader(m.data, 0, false), tp.defs, tp.top!);
}

type Rec = { [k: string]: unknown };
const bytesOf = (v: unknown): ArrayLike<number> => (v instanceof Uint8Array || Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<number>) : []);
/** A sensor_msgs/Image's pixels as rows × columns × channels (0–255; mono16 and 16-bit channels as they are). */
export function readImage(msg: Rec) {
  if (typeof msg.format === 'string' && msg.height === undefined) return readCompressed(msg);
  const h = Number(msg.height), w = Number(msg.width), enc = String(msg.encoding ?? ''), step = Number(msg.step), data = bytesOf(msg.data), big = Number(msg.is_bigendian) === 1;
  const lay: Record<string, [number, number[], number]> = { rgb8: [3, [0, 1, 2], 1], bgr8: [3, [2, 1, 0], 1], rgba8: [3, [0, 1, 2], 1], bgra8: [3, [2, 1, 0], 1], mono8: [1, [0], 1], '8uc1': [1, [0], 1], '8uc3': [3, [0, 1, 2], 1], mono16: [1, [0], 2], '16uc1': [1, [0], 2] };
  const L = lay[enc.toLowerCase()];
  if (!L) throw new Error(`Image encoding '${enc}' isn't read yet (rgb8, bgr8, rgba8, bgra8, mono8, mono16).`);
  const [ch, order, bytes] = L, px = (/a8$/.test(enc) ? 4 : ch) * bytes;
  if (!(h > 0 && w > 0) || data.length < (h - 1) * step + w * px) throw new Error('The image message is smaller than its height × step.');
  const out = new Float64Array(h * w * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    const o = y * step + x * px + order[c] * bytes;
    out[y + x * h + c * h * w] = bytes === 1 ? data[o] : big ? (data[o] << 8) | data[o + 1] : data[o] | (data[o + 1] << 8);
  }
  return { h, w, ch, data: out, sixteen: bytes === 2 };
}
/** A sensor_msgs/CompressedImage (JPEG or PNG; the format field says which, or the first bytes do). */
function readCompressed(msg: Rec) {
  const raw = bytesOf(msg.data), u = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  if (u[0] === 0xff && u[1] === 0xd8) {
    const j = decodeJpeg(u), h = j.height, w = j.width, ch = j.planes.length >= 3 ? 3 : 1, out = new Float64Array(h * w * ch);
    for (let c = 0; c < ch; c++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + x * h + c * h * w] = Math.max(0, Math.min(255, Math.round(j.planes[c][y * w + x])));
    return { h, w, ch, data: out, sixteen: false };
  }
  if (u[0] === 0x89 && u[1] === 0x50) return decodePng(u);
  throw new Error(`A compressed image in '${String(msg.format)}': Hyperion reads JPEG and PNG.`);
}
/** A PNG (not interlaced; 8 or 16 bits; grey, RGB, palette, with or without alpha) as rows × columns × channels. */
export function decodePng(u: Uint8Array) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), idat: Uint8Array[] = [];
  let w = 0, h = 0, depth = 8, type = 0, pal: Uint8Array | null = null;
  for (let o = 8; o + 8 <= u.length;) {
    const n = dv.getUint32(o), kind = String.fromCharCode(...u.subarray(o + 4, o + 8)), d = u.subarray(o + 8, o + 8 + n);
    if (kind === 'IHDR') { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); depth = d[8]; type = d[9]; if (d[12]) throw new Error('Interlaced PNGs aren’t read.'); }
    else if (kind === 'PLTE') pal = d; else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break;
    o += 12 + n;
  }
  if (depth < 8 && type !== 3) throw new Error('PNGs under 8 bits a channel (other than palettes) aren’t read.');
  const comps = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type], bpp = Math.max(1, (comps * depth) >> 3), stride = Math.ceil((w * comps * depth) / 8);
  const z = new Uint8Array(idat.reduce((s, x) => s + x.length, 0)); let q = 0; for (const x of idat) { z.set(x, q); q += x.length; }
  const raw = unzlibSync(z), img = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? img[row + i - bpp] : 0, b = y ? img[row - stride + i] : 0, c = i >= bpp && y ? img[row - stride + i - bpp] : 0, x = raw[src + i];
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      img[row + i] = (x + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
    }
  }
  const ch = type === 0 || type === 4 ? 1 : 3, out = new Float64Array(h * w * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
    let v: number;
    if (type === 3) { const bit = x * depth, idx = (img[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1); v = pal ? pal[3 * idx + c] : 0; }
    else v = img[y * stride + (x * comps + c) * (depth >> 3)];
    out[y + x * h + c * h * w] = v;
  }
  return { h, w, ch, data: out, sixteen: false };
}
/** A sensor_msgs/PointCloud2's named fields as columns (NaN points left out), e.g. ['x','y','z']. */
export function readCloud(msg: Rec, names: string[] = ['x', 'y', 'z']) {
  const fs = (Array.isArray(msg.fields) ? msg.fields : []) as Rec[], step = Number(msg.point_step), n = Number(msg.width) * Number(msg.height), raw = bytesOf(msg.data), big = Number(msg.is_bigendian) === 1;
  const u = raw instanceof Uint8Array ? raw : Uint8Array.from(raw), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const get: ((o: number) => number)[] = names.map((nm) => {
    const f = fs.find((x) => x.name === nm);
    if (!f) throw new Error(`The point cloud has no field '${nm}' (it has ${fs.map((x) => x.name).join(', ')}).`);
    const off = Number(f.offset), L = !big;
    return ({ 1: (o: number) => dv.getInt8(o + off), 2: (o: number) => dv.getUint8(o + off), 3: (o: number) => dv.getInt16(o + off, L), 4: (o: number) => dv.getUint16(o + off, L), 5: (o: number) => dv.getInt32(o + off, L), 6: (o: number) => dv.getUint32(o + off, L), 7: (o: number) => dv.getFloat32(o + off, L), 8: (o: number) => dv.getFloat64(o + off, L) } as Record<number, (o: number) => number>)[Number(f.datatype)] ?? (() => { throw new Error(`Field '${nm}' has an unknown datatype.`); })();
  });
  if (u.length < n * step) throw new Error('The point cloud is smaller than width × height × point_step.');
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) { const r = get.map((g) => g(i * step)); if (r.every(Number.isFinite)) rows.push(r); }
  return rows;
}
