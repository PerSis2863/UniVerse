import { describe, expect, it } from 'vitest';
import * as R from './rosbag';
import { Lab } from './interp';
import { FileStore } from './files';
import { Graphics } from './plot';
import { toMat, type Struct, type Cell } from './values';
import './machines-lab';
import * as zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { encodeJpeg } from './jpeg';
import { png } from './colormap';

// M578: ROS 1 bags and MCAP files, built here byte by byte from the published layouts, read back.
const te = new TextEncoder(), enc = (s: string) => te.encode(s);
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const n32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const n64 = (n: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
const n16 = (n: number) => new Uint8Array([n & 255, n >> 8]);
/** A message writer: ROS 1's packing, or CDR's alignment after the 4-byte encapsulation header. */
class W {
  b: number[] = []; constructor(public cdr = false) { if (cdr) this.b.push(0, 1, 0, 0); }
  align(n: number) { if (this.cdr) while ((this.b.length - 4) % n) this.b.push(0); }
  put(n: number, f: (d: DataView) => void) { this.align(n); const x = new DataView(new ArrayBuffer(n)); f(x); this.b.push(...new Uint8Array(x.buffer)); return this; }
  u8(v: number) { return this.put(1, (d) => d.setUint8(0, v)); } i16(v: number) { return this.put(2, (d) => d.setInt16(0, v, true)); }
  u32(v: number) { return this.put(4, (d) => d.setUint32(0, v, true)); } i32(v: number) { return this.put(4, (d) => d.setInt32(0, v, true)); }
  f32(v: number) { return this.put(4, (d) => d.setFloat32(0, v, true)); } f64(v: number) { return this.put(8, (d) => d.setFloat64(0, v, true)); }
  str(s: string) { const x = enc(s); this.u32(x.length + (this.cdr ? 1 : 0)); this.b.push(...x); if (this.cdr) this.b.push(0); return this; }
  bytes(x: number[]) { this.u32(x.length); this.b.push(...x); return this; }
  get out() { return new Uint8Array(this.b); }
}

// ——— ROS 1 ———
const field = (name: string, v: Uint8Array) => { const f = cat(enc(`${name}=`), v); return cat(n32(f.length), f); };
const record = (h: [string, Uint8Array][], data: Uint8Array) => { const hd = cat(...h.map(([k, v]) => field(k, v))); return cat(n32(hd.length), hd, n32(data.length), data); };
const op = (n: number) => new Uint8Array([n]);
const conn = (id: number, topic: string, type: string, defn: string) => record([['op', op(7)], ['conn', n32(id)], ['topic', enc(topic)]], cat(field('topic', enc(topic)), field('type', enc(type)), field('md5sum', enc('*')), field('message_definition', enc(defn))));
const msg = (id: number, t: number, data: Uint8Array) => record([['op', op(2)], ['conn', n32(id)], ['time', cat(n32(Math.floor(t)), n32(Math.round((t % 1) * 1e9)))]], data);
/** An LZ4 frame holding the bytes as one literal run (enough to test the frame and the literal path). */
const lz4Literal = (x: Uint8Array) => { const L: number[] = [0xf0]; let r = x.length - 15; while (r >= 255) { L.push(255); r -= 255; } L.push(r); const blk = cat(new Uint8Array(L), x); return cat(new Uint8Array([0x04, 0x22, 0x4d, 0x18, 0x60, 0x40, 0x82]), n32(blk.length), blk, n32(0)); };
const chunk = (inner: Uint8Array, how: 'none' | 'lz4') => record([['op', op(5)], ['compression', enc(how)], ['size', n32(inner.length)]], how === 'lz4' ? lz4Literal(inner) : inner);
const HEADER1 = '================================================================================\nMSG: std_msgs/Header\nuint32 seq\ntime stamp\nstring frame_id\n';
const CAR = `Header header  # comment\nfloat64 speed\nint16[] wheels\nstring name\nWheel[2] axles\n${HEADER1}================================================================================\nMSG: demo/Wheel\nuint8 FRONT=1\nfloat32 angle\n`;
const IMAGE = `Header header\nuint32 height\nuint32 width\nstring encoding\nuint8 is_bigendian\nuint32 step\nuint8[] data\n${HEADER1}`;
const car = (seq: number, speed: number) => new W().u32(seq).u32(5).u32(0).str('base').f64(speed).u32(3).i16(-1).i16(2).i16(300).str('Ada').f32(0.5).f32(-0.25).out;
const ros1 = (how: 'none' | 'lz4') => {
  const img = new W().u32(0).u32(0).u32(0).str('cam').u32(2).u32(2).str('bgr8').u8(0).u32(6).bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).out;
  const inner = cat(conn(0, '/car', 'demo/Car', CAR), msg(0, 1.5, car(1, 12.5)), msg(0, 2.0, car(2, 13)), conn(1, '/cam', 'sensor_msgs/Image', IMAGE), msg(1, 1.75, img));
  return cat(enc('#ROSBAG V2.0\n'), record([['op', op(3)], ['index_pos', n64(0)], ['conn_count', n32(2)], ['chunk_count', n32(1)]], new Uint8Array(20)), chunk(inner, how), conn(0, '/car', 'demo/Car', CAR), conn(1, '/cam', 'sensor_msgs/Image', IMAGE));
};

// ——— MCAP (ROS 2) ———
const rec = (o: number, c: Uint8Array) => cat(op(o), n64(c.length), c);
const mstr = (s: string) => cat(n32(enc(s).length), enc(s));
const TIME = '================================================================================\nMSG: builtin_interfaces/Time\nint32 sec\nuint32 nanosec\n';
const HEADER2 = `================================================================================\nMSG: std_msgs/Header\nbuiltin_interfaces/Time stamp\nstring frame_id\n${TIME}`;
const POINT = `std_msgs/Header header\ngeometry_msgs/Point point\n${HEADER2}================================================================================\nMSG: geometry_msgs/Point\nfloat64 x\nfloat64 y\nfloat64 z\n`;
const CLOUD = `std_msgs/Header header\nuint32 height\nuint32 width\nPointField[] fields\nbool is_bigendian\nuint32 point_step\nuint32 row_step\nuint8[] data\nbool is_dense\n${HEADER2}================================================================================\nMSG: sensor_msgs/PointField\nuint8 FLOAT32 = 7\nstring name\nuint32 offset\nuint8 datatype\nuint32 count\n`;
const stamped = (x: number) => new W(true).i32(3).u32(0).str('base').f64(x).f64(2).f64(-1).out;
const cloud = () => {
  const pts = [[1, 2, 3], [NaN, 0, 0], [4, 5, 6]], d = new DataView(new ArrayBuffer(16 * 3));
  pts.forEach((p, i) => { p.forEach((v, j) => d.setFloat32(i * 16 + j * 4, v, true)); d.setFloat32(i * 16 + 12, 10 * i, true); });
  const w = new W(true).i32(3).u32(0).str('lidar').u32(1).u32(3).u32(4);
  ['x', 'y', 'z', 'intensity'].forEach((nm, j) => w.str(nm).u32(4 * j).u8(7).u32(1));
  return w.u8(0).u32(16).u32(48).bytes([...new Uint8Array(d.buffer)]).u8(1).out;
};
const mcap = (how: '' | 'lz4') => {
  const schema = (id: number, name: string, text: string) => rec(3, cat(n16(id), mstr(name), mstr('ros2msg'), mstr(text)));
  const chan = (id: number, sid: number, topic: string) => rec(4, cat(n16(id), n16(sid), mstr(topic), mstr('cdr'), n32(0)));
  const m = (ch: number, t: number, data: Uint8Array) => rec(5, cat(n16(ch), n32(0), n64(t * 1e9), n64(t * 1e9), data));
  const inner = cat(schema(1, 'geometry_msgs/msg/PointStamped', POINT), chan(1, 1, '/goal'), m(1, 3, stamped(7.5)), schema(2, 'sensor_msgs/msg/PointCloud2', CLOUD), chan(2, 2, '/points'), m(2, 3.1, cloud()), m(1, 3.2, stamped(8)));
  const body = how ? lz4Literal(inner) : inner;
  const magic = new Uint8Array([0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a]);
  return cat(magic, rec(1, cat(mstr('ros2'), mstr('test'))), rec(6, cat(n64(3e9), n64(3.2e9), n64(inner.length), n32(0), mstr(how), n64(body.length), body)), rec(0x0f, n32(0)), rec(2, cat(n64(0), n64(0), n32(0))), magic);
};

describe('Hyperion ROS bags (M578)', () => {
  it('reads a ROS 1 bag, plain and LZ4, every field from the bag’s own definitions', () => {
    for (const how of ['none', 'lz4'] as const) {
      const bag = R.readBag(ros1(how));
      expect(bag.topics.map((t) => [t.topic, t.count])).toEqual([['/car', 2], ['/cam', 1]]);
      expect(bag.messages.map((m) => m.t)).toEqual([1.5, 1.75, 2]);
      const c = R.decodeMessage(bag, bag.messages[0]) as Record<string, R.Decoded>;
      expect(c).toMatchObject({ header: { seq: 1, stamp: { sec: 5, nsec: 0 }, frame_id: 'base' }, speed: 12.5, wheels: [-1, 2, 300], name: 'Ada', axles: [{ angle: 0.5 }, { angle: -0.25 }] });
      const im = R.readImage(R.decodeMessage(bag, bag.messages[1]) as Record<string, unknown>);
      // bgr8, 2×2: the first pixel's red is its third byte; column-major rows × columns × channels
      expect([im.h, im.w, im.ch]).toEqual([2, 2, 3]); expect(im.data[0]).toBe(3); expect(im.data[1]).toBe(9); expect(im.data[2 * 2 * 2]).toBe(1);
    }
  });
  it('reads an MCAP file with CDR’s alignment, and a point cloud’s points without NaNs', () => {
    for (const how of ['', 'lz4'] as const) {
      const bag = R.readBag(mcap(how));
      expect(bag.format).toBe('mcap'); expect(bag.topics.map((t) => t.type)).toEqual(['geometry_msgs/msg/PointStamped', 'sensor_msgs/msg/PointCloud2']);
      expect(R.decodeMessage(bag, bag.messages[0])).toMatchObject({ header: { stamp: { sec: 3, nanosec: 0 }, frame_id: 'base' }, point: { x: 7.5, y: 2, z: -1 } });
      const pc = R.decodeMessage(bag, bag.messages[1]) as Record<string, unknown>;
      expect(R.readCloud(pc)).toEqual([[1, 2, 3], [4, 5, 6]]);
      expect(R.readCloud(pc, ['intensity']).map((r) => r[0])).toEqual([0, 10, 20]);
    }
  });
  it('decodes LZ4 matches, and names what it can’t read', () => {
    const blk = [0x35, 97, 98, 99, 3, 0, 0x00];
    expect(new TextDecoder().decode(R.lz4(cat(new Uint8Array([0x04, 0x22, 0x4d, 0x18, 0x60, 0x40, 0x82]), n32(blk.length), new Uint8Array(blk), n32(0))))).toBe('abcabcabcabc');
    expect(() => R.readBag(enc('SQLite format 3\0'))).toThrow(/too short/);
    expect(() => R.readBag(cat(enc('#ROSBAG V2.0\n'), record([['op', op(5)], ['compression', enc('xz')], ['size', n32(4)]], new Uint8Array(4))))).toThrow(/bz2 and LZ4/);
  });
  // M579
  const hasBz = (() => { try { execFileSync('bzip2', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();
  const zst = (zlib as { zstdCompressSync?: (b: Uint8Array) => Uint8Array }).zstdCompressSync;
  it.runIf(hasBz)('reads a ROS 1 bag packed with bz2', () => {
    const inner = cat(conn(0, '/car', 'demo/Car', CAR), msg(0, 1.5, car(1, 12.5)), msg(0, 2.0, car(2, 13)));
    const bz = new Uint8Array(execFileSync('bzip2', ['-c'], { input: inner }));
    const bag = R.readBag(cat(enc('#ROSBAG V2.0\n'), record([['op', op(5)], ['compression', enc('bz2')], ['size', n32(inner.length)]], bz)));
    expect(bag.messages.map((m) => (R.decodeMessage(bag, m) as { speed: number }).speed)).toEqual([12.5, 13]);
  });
  it.runIf(!!zst)('reads an MCAP file packed with zstd', () => {
    const plain = mcap(''), bag0 = R.readBag(plain);
    // rebuild the chunk with zstd: the same records, compressed
    const dv = new DataView(plain.buffer, plain.byteOffset), hdrEnd = 8 + 9 + Number(dv.getBigUint64(9, true)), c = plain.subarray(hdrEnd + 9);
    const cdv = new DataView(c.buffer, c.byteOffset), recLen = Number(cdv.getBigUint64(32, true)), recs = c.subarray(40, 40 + recLen), z = new Uint8Array(zst!(recs));
    const body = cat(n64(3e9), n64(3.2e9), n64(recs.length), n32(0), mstr('zstd'), n64(z.length), z);
    const bag = R.readBag(cat(plain.subarray(0, hdrEnd), rec(6, body), rec(0x0f, n32(0)), rec(2, cat(n64(0), n64(0), n32(0)))));
    expect(bag.messages.length).toBe(bag0.messages.length);
    expect(R.decodeMessage(bag, bag.messages[2])).toMatchObject({ point: { x: 8 } });
  });
  it('reads a ROS 2 .db3 bag’s tables, with and without definitions', () => {
    const bag = R.fromDb3({ topics: [{ id: 1, name: '/goal', type: 'geometry_msgs/msg/PointStamped', format: 'cdr' }, { id: 2, name: '/odom', type: 'nav_msgs/msg/Odometry', format: 'cdr' }, { id: 3, name: '/x', type: 'my_pkg/msg/Thing', format: 'cdr' }],
      messages: [{ topic: 1, ns: 5e9, data: stamped(1.25) }, { topic: 2, ns: 4e9, data: (() => { const w = new W(true).i32(4).u32(0).str('odom').str('base'); for (let i = 0; i < 7; i++) w.f64(i); for (let i = 0; i < 36; i++) w.f64(0); for (let i = 0; i < 6; i++) w.f64(10 + i); for (let i = 0; i < 36; i++) w.f64(0); return w.out; })() }, { topic: 3, ns: 6e9, data: new Uint8Array(8) }],
      definitions: [{ type: 'geometry_msgs/msg/PointStamped', encoding: 'ros2msg', text: POINT }] });
    expect(bag.format).toBe('db3'); expect(bag.messages.map((m) => m.t)).toEqual([4, 5, 6]);
    expect(R.decodeMessage(bag, bag.messages[0])).toMatchObject({ child_frame_id: 'base', pose: { pose: { position: { x: 0, y: 1, z: 2 }, orientation: { w: 6 } } }, twist: { twist: { linear: { x: 10 }, angular: { z: 15 } } } });
    expect(R.decodeMessage(bag, bag.messages[1])).toMatchObject({ point: { x: 1.25 } });
    expect(() => R.decodeMessage(bag, bag.messages[2])).toThrow(/Iron/);
  });
  it('reads a real SQLite .db3 bag (rosbag2’s tables, big rows on overflow pages, deep trees)', async () => {
    const SQL = await (await import('sql.js')).default();
    for (const withDefs of [true, false]) {
      const db = new SQL.Database();
      db.run('CREATE TABLE schema(schema_version INTEGER PRIMARY KEY,ros_distro TEXT NOT NULL);CREATE TABLE topics(id INTEGER PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,serialization_format TEXT NOT NULL,offered_qos_profiles TEXT NOT NULL);CREATE TABLE messages(id INTEGER PRIMARY KEY,topic_id INTEGER NOT NULL,timestamp INTEGER NOT NULL, data BLOB NOT NULL);CREATE INDEX timestamp_idx ON messages (timestamp ASC);');
      if (withDefs) db.run('CREATE TABLE message_definitions(id INTEGER PRIMARY KEY,topic_type TEXT NOT NULL,encoding TEXT NOT NULL,encoded_message_definition TEXT NOT NULL,type_description_hash TEXT NOT NULL)', []);
      db.run("INSERT INTO topics VALUES (1,'/goal','geometry_msgs/msg/PointStamped','cdr',''),(2,'/cam','sensor_msgs/msg/Image','cdr','')");
      if (withDefs) db.run('INSERT INTO message_definitions VALUES (1,?,?,?,?)', ['geometry_msgs/msg/PointStamped', 'ros2msg', POINT, '']);
      const img = (k: number) => { const px = Array.from({ length: 120 * 80 * 3 }, (_, i) => (i + k) & 255); return new W(true).i32(k).u32(0).str('cam').u32(80).u32(120).str('rgb8').u8(0).u32(360).bytes(px).out; };
      const ins = db.prepare('INSERT INTO messages(topic_id,timestamp,data) VALUES (?,?,?)');
      for (let i = 0; i < 3000; i++) ins.run([1, 1_700_000_000_000_000_000 + i * 1e7, stamped(i)]);
      for (let k = 0; k < 4; k++) ins.run([2, 1_700_000_000_000_000_000 + k * 1e8, img(k)]);
      ins.free();
      const bag = R.readBag(db.export()); db.close();
      expect(bag.format).toBe('db3'); expect(bag.topics.map((t) => t.count)).toEqual([3000, 4]);
      const goals = bag.messages.filter((m) => m.topic === 0);
      expect(R.decodeMessage(bag, goals[2999])).toMatchObject({ point: { x: 2999 } });
      expect(goals[1].t - goals[0].t).toBeCloseTo(0.01, 3);
      const im = R.readImage(R.decodeMessage(bag, bag.messages.filter((m) => m.topic === 1)[3]) as Record<string, unknown>);
      expect([im.h, im.w, im.data[0], im.data[1]]).toEqual([80, 120, 3, 363 & 255]);
    }
  });
  it('reads compressed pictures: JPEG and PNG', () => {
    const w = 16, h = 8, rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([200, (i % w) * 10, 40, 255], 4 * i);
    const j = R.readImage({ format: 'jpeg', data: encodeJpeg(w, h, rgba, 95) }), p = R.readImage({ format: 'png', data: Uint8Array.from(atob(png(w, h, rgba).split(',')[1]), (c) => c.charCodeAt(0)) });
    expect([j.h, j.w, j.ch, p.h, p.w, p.ch]).toEqual([8, 16, 3, 8, 16, 3]);
    expect(Math.abs(j.data[0] - 200)).toBeLessThan(8); expect(p.data[0]).toBe(200); expect(p.data[h * 5 + h * w]).toBe(50); // green at column 5
    expect(() => R.readImage({ format: 'tiff', data: new Uint8Array(4) })).toThrow(/JPEG and PNG/);
  });
  it('in the language', () => {
    const files = new FileStore(), l = new Lab({ out: () => {}, files, graphics: new Graphics() });
    files.put('drive.bag', { bytes: ros1('lz4') }); files.put('run.mcap', { bytes: mcap('') });
    l.run(`bag = rosbagreader('drive.bag');
[msgs, t] = readMessages(bag, 'Topic', '/car');
[ts, v] = rosTimeseries(bag, '/car', 'speed');
[~, w] = rosTimeseries(bag, '/car', 'wheels');
im = readMessages(bag, 'Topic', '/cam'); img = rosReadImage(im{1});
b2 = ros2bagreader('run.mcap'); pc = readMessages(b2, 'Topic', '/points'); xyz = rosReadXYZ(pc{1}); in = rosReadField(pc{1}, 'intensity');
pts = pointCloud(xyz);`);
    const bag = l.vars.get('bag') as Struct, T = bag.f.get('AvailableTopics') as Struct;
    expect(toMat(bag.f.get('NumMessages')!).d[0]).toBe(3); expect(toMat(T.f.get('NumMessages')!).d[0]).toBe(2);
    expect((l.vars.get('msgs') as Cell).d.length).toBe(2); expect([...toMat(l.vars.get('t')!).d]).toEqual([1.5, 2]);
    expect([...toMat(l.vars.get('v')!).d]).toEqual([12.5, 13]);
    expect([toMat(l.vars.get('w')!).r, toMat(l.vars.get('w')!).c]).toEqual([2, 3]);
    const img = toMat(l.vars.get('img')!); expect([img.r, img.c, img.p, img.cls]).toEqual([2, 2, 3, 'uint8']);
    expect(toMat(l.vars.get('xyz')!).r).toBe(2); expect([...toMat(l.vars.get('in')!).d]).toEqual([0, 10, 20]);
    expect(() => l.run("readMessages(bag, 'Topic', '/gps')")).toThrow(/\/car, \/cam/);
    expect(() => l.run("rosTimeseries(bag, '/car', 'name')")).toThrow(/isn't a number/);
  });
});
