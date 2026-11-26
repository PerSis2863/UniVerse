import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { keyHooks, methodHook, textOf } from './interp';
import { mat, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { cast, isNumClass } from './types';

// Hyperion's text, dates and maps (M559; GNU Octave's strings, miscellaneous and general packages and core functions,
// our own code from their documented behaviour): strjust, validatestring, dec2base / base2dec, typecast, num2hex /
// hex2num, textscan and strread; datenum, weekday, eomday, calendar, addtodate; and maps: containers.Map (a handle:
// copies share it, as in MATLAB) and dictionary (a value), with m(key), m(key) = v, keys, values, isKey, remove,
// m.Count / numEntries.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const num = (x: number) => mat(1, 1, [x]);
const cellOf = (d: Value[], col = false): Cell => ({ k: 'cell', r: col ? d.length : 1, c: col ? 1 : d.length, d });
const strs = (v: Value): string[] => (v.k === 'cell' ? v.d.map((x) => textOf(x)) : v.k === 'str' ? v.v.split('\n') : [textOf(v)]);

// ——— Text ———
def('strjust', (a) => {
  const how = a[1] ? textOf(a[1]).toLowerCase() : 'right', lines = strs(a[0]), w = Math.max(...lines.map((l) => l.length));
  const one = (l: string) => { const t = l.trim(); const pad = w - t.length; return how === 'left' ? t.padEnd(w) : how === 'center' ? ' '.repeat(Math.floor(pad / 2)) + t + ' '.repeat(Math.ceil(pad / 2)) : t.padStart(w); };
  return [str(lines.map(one).join('\n'))];
});
def('validatestring', (a) => {
  const s = textOf(a[0]).toLowerCase(), opts = strs(a[1]), hits = opts.filter((o) => o.toLowerCase().startsWith(s));
  const exact = opts.find((o) => o.toLowerCase() === s);
  if (exact) return [str(exact)];
  if (hits.length === 1 || (hits.length > 1 && hits.every((h) => h.toLowerCase().startsWith(hits.reduce((x, y) => (x.length < y.length ? x : y)).toLowerCase())))) return [str(hits.reduce((x, y) => (x.length < y.length ? x : y)))];
  throw new LabError(hits.length ? `“${textOf(a[0])}” matches several: ${hits.join(', ')}.` : `“${textOf(a[0])}” isn’t one of: ${opts.join(', ')}.`);
});
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
def('dec2base', (a) => {
  const base = toMat(a[1]).d[0], len = a[2] ? toMat(a[2]).d[0] : 0;
  if (!(base >= 2 && base <= 36 && Number.isInteger(base))) throw new LabError('The base is a whole number from 2 to 36.');
  const out = [...toMat(a[0]).d].map((v) => { if (v < 0 || !Number.isInteger(v)) throw new LabError('dec2base takes whole numbers 0 or more.'); let s = ''; do { s = DIGITS[v % base] + s; v = Math.floor(v / base); } while (v > 0); return s; });
  const w = Math.max(len, ...out.map((s) => s.length));
  return [str(out.map((s) => s.padStart(w, '0')).join('\n'))];
});
def('base2dec', (a) => {
  const base = toMat(a[1]).d[0], lines = strs(a[0]), out = lines.map((l) => { let v = 0; for (const ch of l.trim().toUpperCase()) { const d = DIGITS.indexOf(ch); if (d < 0 || d >= base) return NaN; v = v * base + d; } return v; });
  return [mat(out.length, 1, out)];
});
const VIEW: Record<string, [number, (dv: DataView, o: number) => number, (dv: DataView, o: number, v: number) => void]> = {
  int8: [1, (d, o) => d.getInt8(o), (d, o, v) => d.setInt8(o, v)], uint8: [1, (d, o) => d.getUint8(o), (d, o, v) => d.setUint8(o, v)],
  int16: [2, (d, o) => d.getInt16(o, true), (d, o, v) => d.setInt16(o, v, true)], uint16: [2, (d, o) => d.getUint16(o, true), (d, o, v) => d.setUint16(o, v, true)],
  int32: [4, (d, o) => d.getInt32(o, true), (d, o, v) => d.setInt32(o, v, true)], uint32: [4, (d, o) => d.getUint32(o, true), (d, o, v) => d.setUint32(o, v, true)],
  single: [4, (d, o) => d.getFloat32(o, true), (d, o, v) => d.setFloat32(o, v, true)], double: [8, (d, o) => d.getFloat64(o, true), (d, o, v) => d.setFloat64(o, v, true)],
  int64: [8, (d, o) => Number(d.getBigInt64(o, true)), (d, o, v) => d.setBigInt64(o, BigInt(Math.trunc(v)), true)], uint64: [8, (d, o) => Number(d.getBigUint64(o, true)), (d, o, v) => d.setBigUint64(o, BigInt(Math.trunc(v)), true)],
};
def('typecast', (a) => {
  // The same bytes read as another type (little-endian, like the machines MATLAB runs on).
  const x = toMat(a[0]), from = x.cls ?? 'double', to = textOf(a[1]).toLowerCase();
  if (!VIEW[from] || !VIEW[to]) throw new LabError('typecast works between the number types (int8 … uint64, single, double).');
  const [fs, , fset] = VIEW[from], [ts, tget] = VIEW[to], buf = new DataView(new ArrayBuffer(x.d.length * fs));
  x.d.forEach((v, i) => fset(buf, i * fs, v));
  if (buf.byteLength % ts) throw new LabError(`${x.d.length} ${from} values don’t make whole ${to} values.`);
  const n = buf.byteLength / ts, out = Array.from({ length: n }, (_, i) => tget(buf, i * ts));
  const m = x.c === 1 && x.r > 1 ? mat(n, 1, out) : mat(1, n, out);
  return [isNumClass(to) ? cast(m, to) : m];
});
def('num2hex', (a) => { const x = [...toMat(a[0]).d], dv = new DataView(new ArrayBuffer(8)); return [str(x.map((v) => { dv.setFloat64(0, v); return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(''); }).join('\n'))]; });
def('hex2num', (a) => {
  const out = strs(a[0]).map((h) => { const t = h.trim().padEnd(16, '0'), dv = new DataView(new ArrayBuffer(8)); for (let i = 0; i < 8; i++) dv.setUint8(i, parseInt(t.slice(i * 2, i * 2 + 2), 16) || 0); return dv.getFloat64(0); });
  return [mat(out.length, 1, out)];
});

/** Reads delimited text with a format like '%s %f %d' (%*… skips a field): one array or cell per field. */
function scanText(text: string, format: string, delim: string | null): Value[] {
  const specs = [...format.matchAll(/%(\*?)(\d*)([fdsqnu]|\[[^\]]*\])/g)].map((m) => ({ skip: m[1] === '*', kind: m[3] }));
  if (!specs.length) throw new LabError('The format needs fields such as %f, %d or %s.');
  const tokens = text.split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => (delim ? l.split(delim) : l.trim().split(/\s+/)).map((t) => t.trim()));
  const cols = specs.map(() => [] as string[]);
  tokens.forEach((t, i) => cols[i % specs.length].push(t));
  return specs.flatMap((s, i) => {
    if (s.skip) return [];
    const c = cols[i];
    return [s.kind === 's' || s.kind === 'q' || s.kind.startsWith('[') ? cellOf(c.map((x) => str(x.replace(/^"(.*)"$/, '$1'))), true) : mat(c.length, 1, c.map((x) => (s.kind === 'd' || s.kind === 'u' ? Math.trunc(Number(x)) : Number(x))))];
  });
}
const delimOf = (a: Value[], from: number) => { for (let i = from; i + 1 < a.length; i += 2) if (/^delimiter$/i.test(textOf(a[i]))) return textOf(a[i + 1]).replace(/\\t/g, '\t'); return null; };
def('textscan', (a) => [cellOf(scanText(textOf(a[0]), textOf(a[1]), delimOf(a, 2)))]);
def('strread', (a) => scanText(textOf(a[0]), a[1] ? textOf(a[1]) : '%f', delimOf(a, 2)));

// ——— Dates (serial day numbers: 1 = 1 January year 0, MATLAB's) ———
const EPOCH = 719529; // datenum(1970, 1, 1)
const serial = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => {
  // setUTCFullYear: Date.UTC alone reads years 0–99 as 1900–1999.
  const t = new Date(Date.UTC(2000, 0, 1));
  t.setUTCFullYear(y, mo - 1, d);
  return t.getTime() / 86_400_000 + EPOCH + h / 24 + mi / 1440 + s / 86_400;
};
const dateOf = (n: number) => new Date((n - EPOCH) * 86_400_000);
def('datenum', (a) => {
  if (a[0]?.k === 'str') { const t = Date.parse(a[0].v.includes('T') || /\d:\d/.test(a[0].v) ? `${a[0].v.replace(' ', 'T')}Z` : `${a[0].v}T00:00:00Z`); if (Number.isNaN(t)) throw new LabError(`“${a[0].v}” isn’t a date Hyperion reads (try 2026-11-26 or 2026-11-26 14:30).`); return [num(t / 86_400_000 + EPOCH)]; }
  const v = a.map((x) => toMat(x).d);
  if (v.length === 1 && v[0].length >= 3) { const r = toMat(a[0]); const rows = r.c >= 3 ? r.r : 1; return [mat(rows, 1, Array.from({ length: rows }, (_, i) => serial(...([0, 1, 2, 3, 4, 5].map((k) => (k < r.c ? r.d[i + k * r.r] : 0)) as [number, number, number, number, number, number]))))]; }
  const n = Math.max(...v.map((x) => x.length)), at = (k: number, i: number, d: number) => (v[k] ? v[k][v[k].length === 1 ? 0 : i] : d);
  return [mat(1, n, Array.from({ length: n }, (_, i) => serial(at(0, i, 0), at(1, i, 1), at(2, i, 1), at(3, i, 0), at(4, i, 0), at(5, i, 0))))];
});
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
def('weekday', (a) => { const d = [...toMat(a[0]).d].map((n) => dateOf(n).getUTCDay() + 1); return [mat(1, d.length, d), str(d.map((k) => NAMES[k - 1]).join('\n'))]; });
const days = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
def('eomday', (a) => { const y = toMat(a[0]).d, m = toMat(a[1]).d, n = Math.max(y.length, m.length); return [mat(1, n, Array.from({ length: n }, (_, i) => days(y[y.length === 1 ? 0 : i], m[m.length === 1 ? 0 : i])))]; });
def('calendar', (a) => {
  const now = new Date(), y = a[0] ? toMat(a[0]).d[0] : now.getUTCFullYear(), m = a[1] ? toMat(a[1]).d[0] : now.getUTCMonth() + 1;
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), out = mat(6, 7);
  for (let d = 1; d <= days(y, m); d++) { const k = first + d - 1; out.d[Math.floor(k / 7) + (k % 7) * 6] = d; }
  return [out];
});
def('addtodate', (a) => {
  const n = toMat(a[0]).d[0], q = toMat(a[1]).d[0], f = textOf(a[2]).toLowerCase(), d = dateOf(n);
  if (f === 'year' || f === 'month') {
    const months = f === 'year' ? 12 * q : q, y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = Math.min(d.getUTCDate(), days(y + Math.floor(m / 12), (((m % 12) + 12) % 12) + 1));
    const t = Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
    return [num(t / 86_400_000 + EPOCH)];
  }
  const per: Record<string, number> = { week: 7, day: 1, hour: 1 / 24, minute: 1 / 1440, second: 1 / 86_400, millisecond: 1 / 86_400_000 };
  if (!(f in per)) throw new LabError('addtodate adds a year, month, week, day, hour, minute, second or millisecond.');
  return [num(n + q * per[f])];
});

// ——— Maps ———
const keyOf = (m: NonNullable<Struct['keyed']>, v: Value): string | number => {
  if (m.type === 'char') { if (v.k !== 'str') throw new LabError('This map’s keys are text.'); return v.v; }
  const x = toMat(v).d; if (x.length !== 1) throw new LabError('This map’s keys are single numbers.'); return x[0];
};
const refresh = (s: Struct) => { s.f.set('Count', num(s.keyed!.keys.length)); s.f.set('KeyType', str(s.keyed!.type)); return s; };
function newMap(keys: Value | null, vals: Value | null, type: 'char' | 'double' | null, handle: boolean): Struct {
  const ks = keys ? (keys.k === 'cell' ? keys.d : keys.k === 'str' ? [keys] : [...toMat(keys).d].map((x) => num(x))) : [];
  const t = type ?? (ks.length && ks[0].k !== 'str' ? 'double' : 'char');
  const vs = vals ? (vals.k === 'cell' ? vals.d : ks.length === 1 ? [vals] : [...toMat(vals).d].map((x) => num(x))) : [];
  if (vs.length !== ks.length) throw new LabError('The map needs as many values as keys.');
  const s: Struct = { k: 'struct', f: new Map(), keyed: { keys: [], vals: [], type: t, handle } };
  ks.forEach((k, i) => put(s, k, vs[i]));
  return refresh(s);
}
function put(s: Struct, k: Value, v: Value) {
  const m = s.keyed!, key = keyOf(m, k), at = m.keys.indexOf(key);
  if (at >= 0) m.vals[at] = v; else { m.keys.push(key); m.vals.push(v); }
}
const sorted = (m: NonNullable<Struct['keyed']>) => m.keys.map((k, i) => [k, m.vals[i]] as const).sort((x, y) => (typeof x[0] === 'number' ? (x[0] as number) - (y[0] as number) : String(x[0]) < String(y[0]) ? -1 : 1));
const keyValue = (k: string | number): Value => (typeof k === 'number' ? num(k) : str(k));
const mapArg = (v: Value | undefined, fn: string): Struct => { if (!v || v.k !== 'struct' || !v.keyed) throw new LabError(`${fn} needs a map (containers.Map or dictionary).`); return v; };

def('containers', () => [{ k: 'struct', f: new Map<string, Value>([['Map', { k: 'fn', name: 'containers.Map' }]]) }]);
def('containers.Map', (a) => {
  let type: 'char' | 'double' | null = null, keys: Value | null = null, vals: Value | null = null, i = 0;
  if (a[0] && !(a[0].k === 'str' && /^(keytype|valuetype|uniformvalues)$/i.test(a[0].v))) { keys = a[0]; vals = a[1] ?? null; i = 2; }
  for (; i + 1 < a.length; i += 2) if (/^keytype$/i.test(textOf(a[i]))) type = /^char$/i.test(textOf(a[i + 1])) ? 'char' : 'double';
  return [newMap(keys, vals, type, true)];
});
def('dictionary', (a) => [newMap(a[0] ?? null, a[1] ?? null, null, false)]);
keyHooks.get = (m, keys) => {
  const k = m.keyed!, key = keyOf(k, keys[0]), at = k.keys.indexOf(key);
  if (at < 0) throw new LabError(`The map has no key ${typeof key === 'number' ? key : `“${key}”`}.`);
  return k.vals[at];
};
keyHooks.set = (m, keys, v) => {
  // containers.Map is a handle: the same map changes (every copy sees it); a dictionary is copied first.
  const target: Struct = m.keyed!.handle ? m : { k: 'struct', f: new Map(m.f), keyed: { ...m.keyed!, keys: [...m.keyed!.keys], vals: [...m.keyed!.vals] } };
  put(target, keys[0], v);
  return refresh(target);
};
// The map functions, and m.keys() / m.values() style calls.
const keysOf = (m: Struct) => { const s = sorted(m.keyed!); return cellOf(s.map(([k]) => keyValue(k))); };
const valuesOf = (m: Struct, want?: Value) => {
  if (want) return cellOf((want.k === 'cell' ? want.d : [want]).map((k) => keyHooks.get!(m, [k])));
  return cellOf(sorted(m.keyed!).map(([, v]) => v));
};
const prevKeys = BUILTINS.keys, prevValues = BUILTINS.values;
def('keys', (a, n, lab) => (a[0]?.k === 'struct' && a[0].keyed ? [keysOf(a[0])] : prevKeys ? prevKeys(a, n, lab) : (() => { throw new LabError('keys needs a map.'); })()));
def('values', (a, n, lab) => (a[0]?.k === 'struct' && a[0].keyed ? [valuesOf(a[0], a[1])] : prevValues ? prevValues(a, n, lab) : (() => { throw new LabError('values needs a map.'); })()));
def('isKey', (a) => { const m = mapArg(a[0], 'isKey'), ks = a[1].k === 'cell' ? a[1].d : [a[1]], out = ks.map((k) => (m.keyed!.keys.includes(keyOf(m.keyed!, k)) ? 1 : 0)); return [{ ...mat(1, out.length, out), logical: true } satisfies Mat]; });
def('remove', (a) => {
  const m = mapArg(a[0], 'remove'), target: Struct = m.keyed!.handle ? m : { k: 'struct', f: new Map(m.f), keyed: { ...m.keyed!, keys: [...m.keyed!.keys], vals: [...m.keyed!.vals] } };
  for (const k of a[1].k === 'cell' ? a[1].d : [a[1]]) { const key = keyOf(target.keyed!, k), at = target.keyed!.keys.indexOf(key); if (at < 0) throw new LabError(`The map has no key ${String(key)}.`); target.keyed!.keys.splice(at, 1); target.keyed!.vals.splice(at, 1); }
  return [refresh(target)];
});
def('numEntries', (a) => [num(mapArg(a[0], 'numEntries').keyed!.keys.length)]);
const prevMethod = methodHook.call;
methodHook.call = (lab, obj, name, args, nout) => {
  if (obj.keyed) {
    if (name === 'keys') return [keysOf(obj)];
    if (name === 'values') return [valuesOf(obj, args[0])];
    if (name === 'isKey' || name === 'remove' || name === 'numEntries') return BUILTINS[name]([obj, ...args], nout, lab);
  }
  return prevMethod ? prevMethod(lab, obj, name, args, nout) : null;
};
