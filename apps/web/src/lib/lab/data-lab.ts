import { gunzipSync, gzipSync, unzipSync, zipSync } from 'fflate';
import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { cast } from './types';
import { fileBytes, fileText, readMat, writeFileBytes, writeFileText, writeMat } from './files';
import { H5File, numbers as h5numbers, type H5Object } from './hdf5';
import { parseXml, type XmlNode } from '@/lib/xml-lite';

// Hyperion's data files (M557; the GNU Octave packages pkg-json, pkg-yaml, netcdf, ncarray, cfitsio and serialize,
// written from their documented behaviour, no Octave code): jsonencode / jsondecode, yamlencode / yamldecode,
// readstruct / writestruct (XML), ncinfo / ncread (NetCDF classic and NetCDF-4), fitsinfo / fitsread (FITS images),
// zip / unzip / gzip / gunzip, base64encode / base64decode, hash (MD5, SHA-1, SHA-256), and
// getByteStreamFromArray / getArrayFromByteStream (any value to bytes and back, through the .mat format).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const bool = (b: boolean): Mat => ({ ...mat(1, 1, [b ? 1 : 0]), logical: true });
const cellRow = (d: Value[]): Cell => ({ k: 'cell', r: 1, c: d.length, d });
const bytesOf = (v: Value) => (v.k === 'str' ? new TextEncoder().encode(v.v) : Uint8Array.from(toMat(v).d, (x) => x & 255));
const uint8 = (b: Uint8Array) => cast(mat(1, b.length, b), 'uint8');

// ——— JSON ———
/** A JSON value as the language's: objects → structs, number arrays → column vectors (equal rows → a matrix), mixed → cells. */
export function fromJs(v: unknown): Value {
  if (v === null) return mat(0, 0);
  if (typeof v === 'boolean') return bool(v);
  if (typeof v === 'number') return mat(1, 1, [v]);
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) {
    if (!v.length) return mat(0, 0);
    if (v.every((x) => typeof x === 'number' || x === null)) return mat(v.length, 1, v.map((x) => (x === null ? NaN : (x as number))));
    if (v.every((x) => typeof x === 'boolean')) return { ...mat(v.length, 1, v.map((x) => (x ? 1 : 0))), logical: true };
    if (v.every((x) => Array.isArray(x) && x.length === (v[0] as unknown[]).length && x.every((y) => typeof y === 'number'))) {
      const r = v.length, c = (v[0] as number[]).length, m = mat(r, c);
      (v as number[][]).forEach((row, i) => row.forEach((x, j) => { m.d[i + j * r] = x; }));
      return m;
    }
    return { k: 'cell', r: v.length, c: 1, d: v.map(fromJs) };
  }
  if (typeof v === 'object') return { k: 'struct', f: new Map(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=[^A-Za-z])/, 'x'), fromJs(x)])) };
  return mat(0, 0);
}
/** The language's value as JSON's: a row or column → an array, a matrix → an array of rows, NaN → null. */
export function toJs(v: Value): unknown {
  if (v.k === 'str') return v.v;
  if (v.k === 'cell') return v.d.map(toJs);
  if (v.k === 'struct') return Object.fromEntries([...v.f].map(([k, x]) => [k, toJs(x)]));
  if (v.k === 'fn') return v.src ?? v.name ?? 'function';
  if (v.k !== 'mat') return String(v);
  const m = v as Mat, num = (x: number) => (Number.isFinite(x) ? (m.logical ? x !== 0 : x) : null);
  if (m.d.length === 0) return [];
  if (m.d.length === 1) return num(m.d[0]);
  if (m.r === 1 || m.c === 1) return [...m.d].map(num);
  return Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => num(m.d[i + j * m.r])));
}
def('jsondecode', (a) => { try { return [fromJs(JSON.parse(textOf(a[0])))]; } catch (e) { throw new LabError(`That isn’t valid JSON: ${e instanceof Error ? e.message : String(e)}`); } });
def('jsonencode', (a) => {
  const pretty = a.length >= 3 && /^prettyprint$/i.test(textOf(a[1])) && toMat(a[2]).d[0] !== 0;
  return [str(JSON.stringify(toJs(a[0]), null, pretty ? 2 : undefined))];
});

// ——— YAML (the block and flow forms people write by hand: maps, lists, scalars, comments) ———
function yamlScalar(s: string): unknown {
  const t = s.trim();
  if (t === '' || t === '~' || /^null$/i.test(t)) return null;
  if (/^(true|yes|on)$/i.test(t)) return true;
  if (/^(false|no|off)$/i.test(t)) return false;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  if (/^(['"]).*\1$/.test(t)) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).split(',').filter((x) => x.trim()).map(yamlScalar);
  if (t.startsWith('{') && t.endsWith('}')) return Object.fromEntries(t.slice(1, -1).split(',').filter((x) => x.includes(':')).map((x) => { const i = x.indexOf(':'); return [x.slice(0, i).trim(), yamlScalar(x.slice(i + 1))]; }));
  return t;
}
export function parseYaml(text: string): unknown {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+#.*$/, '').replace(/^#.*$/, '')).filter((l) => l.trim() && l.trim() !== '---');
  let i = 0;
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const block = (ind: number): unknown => {
    if (i >= lines.length) return null;
    if (lines[i].trimStart().startsWith('- ') || lines[i].trim() === '-') {
      const out: unknown[] = [];
      while (i < lines.length && indentOf(lines[i]) === ind && lines[i].trimStart().startsWith('-')) {
        const rest = lines[i].trimStart().slice(1).trim();
        if (!rest) { i++; out.push(i < lines.length && indentOf(lines[i]) > ind ? block(indentOf(lines[i])) : null); continue; }
        if (/^[^'"[{][^:]*:(\s|$)/.test(rest)) {
          // "- key: value" starts a map indented at the dash's content.
          lines[i] = `${' '.repeat(ind + 2)}${rest}`;
          out.push(block(ind + 2));
        } else { out.push(yamlScalar(rest)); i++; }
      }
      return out;
    }
    const out: Record<string, unknown> = {};
    while (i < lines.length && indentOf(lines[i]) === ind) {
      const t = lines[i].trim(), at = t.indexOf(':');
      if (at < 0) throw new LabError(`YAML line ${i + 1}: expected “key: value”.`);
      const key = t.slice(0, at).trim().replace(/^(['"])(.*)\1$/, '$2'), rest = t.slice(at + 1).trim();
      i++;
      if (rest === '|' || rest === '>') { const parts: string[] = []; const base = i < lines.length ? indentOf(lines[i]) : 0; while (i < lines.length && indentOf(lines[i]) >= base && indentOf(lines[i]) > ind) parts.push(lines[i++].slice(base)); out[key] = parts.join(rest === '|' ? '\n' : ' '); }
      else if (rest) out[key] = yamlScalar(rest);
      else out[key] = i < lines.length && indentOf(lines[i]) > ind ? block(indentOf(lines[i])) : null;
    }
    return out;
  };
  return lines.length ? block(indentOf(lines[0])) : null;
}
export function toYaml(v: unknown, ind = 0): string {
  const pad = ' '.repeat(ind), scalar = (x: unknown) => (x === null ? 'null' : typeof x === 'string' ? (/^[\w .\-/]*$/.test(x) && x !== '' && !/^(true|false|null|yes|no|on|off|[-+]?\d)/i.test(x) ? x : JSON.stringify(x)) : String(x));
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === 'object' ? `${pad}-\n${toYaml(x, ind + 2)}` : `${pad}- ${scalar(x)}`)).join('\n') : `${pad}[]`;
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => (x && typeof x === 'object' && (!Array.isArray(x) || x.length) ? `${pad}${k}:\n${toYaml(x, ind + 2)}` : `${pad}${k}: ${Array.isArray(x) ? '[]' : scalar(x)}`)).join('\n');
  return `${pad}${scalar(v)}`;
}
def('yamldecode', (a) => [fromJs(parseYaml(textOf(a[0])))]);
def('yamlencode', (a) => [str(`${toYaml(toJs(a[0]))}\n`)]);
def('yamlread', (a, _n, lab) => [fromJs(parseYaml(fileText(lab, textOf(a[0]))))]);
def('yamlwrite', (a, _n, lab) => { writeFileText(lab, textOf(a[0]), `${toYaml(toJs(a[1]))}\n`); return []; });

// ——— XML as a struct (readstruct / writestruct): attributes as fields with "Attribute" added, repeated elements as cells ———
function xmlToJs(n: XmlNode): unknown {
  const kidsByName = new Map<string, XmlNode[]>();
  for (const c of n.children) kidsByName.set(c.name, [...(kidsByName.get(c.name) ?? []), c]);
  const attrs = Object.entries(n.attrs).map(([k, v]) => [`${k}Attribute`, yamlScalar(v)] as const);
  if (!kidsByName.size && !attrs.length) return yamlScalar(n.text);
  const out: Record<string, unknown> = Object.fromEntries(attrs);
  for (const [k, list] of kidsByName) out[k] = list.length === 1 ? xmlToJs(list[0]) : list.map(xmlToJs);
  if (n.text.trim() && kidsByName.size === 0) out.Text = yamlScalar(n.text);
  return out;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function jsToXml(name: string, v: unknown, ind: string): string {
  if (Array.isArray(v)) return v.map((x) => jsToXml(name, x, ind)).join('\n');
  if (v && typeof v === 'object') {
    const e = Object.entries(v as Record<string, unknown>), attrs = e.filter(([k]) => k.endsWith('Attribute')).map(([k, x]) => ` ${k.slice(0, -9)}="${esc(String(x))}"`).join('');
    const kids = e.filter(([k]) => !k.endsWith('Attribute'));
    return kids.length ? `${ind}<${name}${attrs}>\n${kids.map(([k, x]) => jsToXml(k, x, `${ind}  `)).join('\n')}\n${ind}</${name}>` : `${ind}<${name}${attrs}/>`;
  }
  return `${ind}<${name}>${esc(v === null ? '' : String(v))}</${name}>`;
}
def('readstruct', (a, _n, lab) => { const root = parseXml(fileText(lab, textOf(a[0]))); return [fromJs(xmlToJs(root))]; });
def('writestruct', (a, _n, lab) => { writeFileText(lab, textOf(a[1]), `<?xml version="1.0" encoding="UTF-8"?>\n${jsToXml('struct', toJs(a[0]), '')}\n`); return []; });

// ——— NetCDF ———
interface NcVar { name: string; dims: number[]; dimNames: string[]; type: number; begin: number; vsize: number; rec: boolean; attrs: Record<string, unknown> }
const NC_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8, 7: 1, 8: 2, 9: 4, 10: 8, 11: 8 };
/** A NetCDF classic (CDF-1, 2 or 5) file's header. */
function ncClassic(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), ver = b[3];
  let at = 4;
  const u32 = () => { const v = dv.getUint32(at); at += 4; return v; };
  const big = () => { if (ver === 5) { const v = Number(dv.getBigUint64(at)); at += 8; return v; } return u32(); };
  const off = () => (ver === 1 ? u32() : (() => { const v = Number(dv.getBigUint64(at)); at += 8; return v; })());
  const name = () => { const n = big(), s = new TextDecoder().decode(b.subarray(at, at + n)); at += Math.ceil(n / 4) * 4; return s; };
  const values = (type: number, n: number): unknown => {
    const sz = NC_SIZE[type], out: number[] = [];
    for (let i = 0; i < n; i++) { const p = at + i * sz; out.push(type === 1 ? dv.getInt8(p) : type === 2 || type === 7 ? b[p] : type === 3 ? dv.getInt16(p) : type === 4 ? dv.getInt32(p) : type === 5 ? dv.getFloat32(p) : type === 6 ? dv.getFloat64(p) : type === 8 ? dv.getUint16(p) : type === 9 ? dv.getUint32(p) : Number(dv.getBigInt64(p))); }
    const s = type === 2 ? new TextDecoder().decode(b.subarray(at, at + n)).replace(/\0+$/, '') : null;
    at += Math.ceil((n * sz) / 4) * 4;
    return s ?? (out.length === 1 ? out[0] : out);
  };
  const attrList = () => { const tag = u32(), n = big(), out: Record<string, unknown> = {}; if (tag === 0 && n === 0) return out; for (let i = 0; i < n; i++) { const k = name(), t = u32(), c = big(); out[k] = values(t, c); } return out; };
  const numrecs = big();
  const dtag = u32(), nd = big(), dims: { name: string; len: number }[] = [];
  if (dtag || nd) for (let i = 0; i < nd; i++) dims.push({ name: name(), len: big() });
  const gattrs = attrList();
  const vtag = u32(), nv = big(), vars: NcVar[] = [];
  if (vtag || nv) for (let i = 0; i < nv; i++) {
    const vn = name(), nids = big(), ids = Array.from({ length: nids }, () => big()), attrs = attrList(), type = u32(), vsize = big(), begin = off();
    vars.push({ name: vn, dims: ids.map((d) => (dims[d].len === 0 ? numrecs : dims[d].len)), dimNames: ids.map((d) => dims[d].name), type, begin, vsize, rec: ids.length > 0 && dims[ids[0]].len === 0, attrs });
  }
  const recsize = vars.filter((v) => v.rec).reduce((s, v) => s + v.vsize, 0);
  const read = (v: NcVar): number[] => {
    const sz = NC_SIZE[v.type], total = v.dims.reduce((p, d) => p * d, 1), out: number[] = new Array(total);
    const per = v.rec ? total / Math.max(1, numrecs) : total;
    for (let k = 0; k < total; k++) {
      const r = v.rec ? Math.floor(k / per) : 0, p = v.begin + r * recsize + (k - r * per) * sz;
      out[k] = v.type === 1 ? dv.getInt8(p) : v.type === 2 || v.type === 7 ? b[p] : v.type === 3 ? dv.getInt16(p) : v.type === 4 ? dv.getInt32(p) : v.type === 5 ? dv.getFloat32(p) : v.type === 6 ? dv.getFloat64(p) : v.type === 8 ? dv.getUint16(p) : v.type === 9 ? dv.getUint32(p) : Number(dv.getBigInt64(p));
    }
    return out;
  };
  return { dims, vars, gattrs, read };
}
/** C-order values with dims d0×d1×… as the language's array in MATLAB's ncread order (dimensions reversed). */
const ncArray = (vals: number[], dims: number[]) => {
  const rev = [...dims].reverse(), m = mat(rev[0] ?? 1, rev[1] ?? 1, vals);
  if (rev.length > 2) { m.p = undefined; m.nd = rev.slice(2); m.d = Float64Array.from(vals); }
  return m;
};
const isHdf5 = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x48 && b[2] === 0x44 && b[3] === 0x46;
const h5find = (f: H5File, name: string): H5Object | undefined => {
  const walk = (o: H5Object, path: string): H5Object | undefined => { if (o.kind === 'dataset') return o.name === name || path === name || path === `/${name}` ? o : undefined; for (const c of o.children()) { const r = walk(c, `${path}/${c.name}`); if (r) return r; } return undefined; };
  return walk(f.root(), '');
};
def('ncinfo', (a, _n, lab) => {
  const b = fileBytes(lab, textOf(a[0]));
  if (isHdf5(b)) {
    const f = new H5File(b), list: string[] = [];
    const walk = (o: H5Object) => { if (o.kind === 'dataset') list.push(o.name); else o.children().forEach(walk); };
    walk(f.root());
    return [{ k: 'struct', f: new Map<string, Value>([['Format', str('netcdf4')], ['Variables', cellRow(list.map(str))]]) } satisfies Struct];
  }
  if (!(b[0] === 0x43 && b[1] === 0x44 && b[2] === 0x46)) throw new LabError('That isn’t a NetCDF file.');
  const nc = ncClassic(b);
  const vars = cellRow(nc.vars.map((v) => ({ k: 'struct', f: new Map<string, Value>([['Name', str(v.name)], ['Dimensions', cellRow(v.dimNames.map(str))], ['Size', mat(1, v.dims.length, v.dims)], ['Attributes', fromJs(v.attrs)]]) }) satisfies Struct));
  return [{ k: 'struct', f: new Map<string, Value>([['Format', str(b[3] === 1 ? 'classic' : b[3] === 2 ? '64bit' : '64bitdata')], ['Dimensions', cellRow(nc.dims.map((d) => ({ k: 'struct', f: new Map<string, Value>([['Name', str(d.name)], ['Length', mat(1, 1, [d.len])]]) }) satisfies Struct))], ['Variables', vars], ['Attributes', fromJs(nc.gattrs)]]) } satisfies Struct];
});
def('ncread', (a, _n, lab) => {
  const b = fileBytes(lab, textOf(a[0])), vn = textOf(a[1]);
  if (isHdf5(b)) {
    const d = h5find(new H5File(b), vn);
    if (!d || d.kind !== 'dataset') throw new LabError(`No variable “${vn}” in that file.`);
    return [ncArray(h5numbers(d.read(), d.type), d.dims)];
  }
  const nc = ncClassic(b), v = nc.vars.find((x) => x.name === vn);
  if (!v) throw new LabError(`No variable “${vn}”: there are ${nc.vars.map((x) => x.name).join(', ')}.`);
  if (v.type === 2) return [str(String.fromCharCode(...nc.read(v)).replace(/\0+$/, ''))];
  // scale_factor and add_offset, and the fill value as NaN, as ncread does.
  const fill = typeof v.attrs._FillValue === 'number' ? v.attrs._FillValue : null, sf = typeof v.attrs.scale_factor === 'number' ? v.attrs.scale_factor : 1, ao = typeof v.attrs.add_offset === 'number' ? v.attrs.add_offset : 0;
  return [ncArray(nc.read(v).map((x) => (x === fill ? NaN : x * sf + ao)), v.dims)];
});
def('ncreadatt', (a, _n, lab) => {
  const nc = ncClassic(fileBytes(lab, textOf(a[0]))), where = textOf(a[1]), at = textOf(a[2]);
  const src = where === '/' ? nc.gattrs : nc.vars.find((x) => x.name === where)?.attrs;
  if (!src || !(at in src)) throw new LabError(`No attribute “${at}” on ${where}.`);
  return [fromJs(src[at])];
});

// ——— FITS (the primary image and its header) ———
function fits(b: Uint8Array) {
  const head: [string, string][] = [];
  let at = 0, end = false;
  while (!end && at < b.length) {
    for (let k = 0; k < 36; k++) {
      const card = new TextDecoder('latin1').decode(b.subarray(at + k * 80, at + k * 80 + 80)), key = card.slice(0, 8).trim();
      if (key === 'END') { end = true; break; }
      if (card[8] === '=') head.push([key, card.slice(10).replace(/\s*\/.*$/, '').trim().replace(/^'(.*)'$/, '$1').trim()]);
    }
    at += 2880;
  }
  const get = (k: string) => head.find(([x]) => x === k)?.[1];
  if (get('SIMPLE') !== 'T') throw new LabError('That isn’t a FITS file.');
  return { head, get, data: at };
}
def('fitsinfo', (a, _n, lab) => {
  const f = fits(fileBytes(lab, textOf(a[0])));
  const kw: Cell = { k: 'cell', r: f.head.length, c: 2, d: [...f.head.map(([k]) => str(k)), ...f.head.map(([, v]) => (/^[-+]?\d/.test(v) && !Number.isNaN(Number(v)) ? mat(1, 1, [Number(v)]) : str(v)))] };
  const n = Number(f.get('NAXIS') ?? 0);
  return [{ k: 'struct', f: new Map<string, Value>([['PrimaryData', { k: 'struct', f: new Map<string, Value>([['Size', mat(1, n, Array.from({ length: n }, (_, i) => Number(f.get(`NAXIS${i + 1}`))))], ['Keywords', kw]]) }]]) } satisfies Struct];
});
def('fitsread', (a, _n, lab) => {
  const b = fileBytes(lab, textOf(a[0])), f = fits(b), bp = Number(f.get('BITPIX')), w = Number(f.get('NAXIS1') ?? 0), h = Number(f.get('NAXIS2') ?? 1), planes = Number(f.get('NAXIS3') ?? 1);
  const bs = Number(f.get('BSCALE') ?? 1), bz = Number(f.get('BZERO') ?? 0), sz = Math.abs(bp) / 8, n = w * h * planes;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = mat(h, w);
  if (planes > 1) out.p = planes;
  out.d = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const p = f.data + k * sz, raw = bp === 8 ? b[p] : bp === 16 ? dv.getInt16(p) : bp === 32 ? dv.getInt32(p) : bp === 64 ? Number(dv.getBigInt64(p)) : bp === -32 ? dv.getFloat32(p) : dv.getFloat64(p);
    // FITS stores rows of NAXIS1 values: the picture's row y, column x → the array's (y, x).
    const plane = Math.floor(k / (w * h)), r = k % (w * h), y = Math.floor(r / w), x = r % w;
    out.d[y + x * h + plane * w * h] = raw * bs + bz;
  }
  return [out];
});

// ——— Archives, encodings and hashes ———
def('zip', (a, _n, lab) => {
  const name = textOf(a[0]), list = a[1].k === 'cell' ? a[1].d.map((v) => textOf(v)) : [textOf(a[1])];
  writeFileBytes(lab, name.endsWith('.zip') ? name : `${name}.zip`, zipSync(Object.fromEntries(list.map((n) => [n, fileBytes(lab, n)]))));
  return [];
});
def('unzip', (a, _n, lab) => { const files = unzipSync(fileBytes(lab, textOf(a[0]))), names = Object.keys(files).filter((n) => !n.endsWith('/')); for (const n of names) writeFileBytes(lab, n.split('/').pop()!, files[n]); return [cellRow(names.map((n) => str(n.split('/').pop()!)))]; });
def('gzip', (a, _n, lab) => { const n = textOf(a[0]); writeFileBytes(lab, `${n}.gz`, gzipSync(fileBytes(lab, n))); return [cellRow([str(`${n}.gz`)])]; });
def('gunzip', (a, _n, lab) => { const n = textOf(a[0]), out = n.replace(/\.gz$/i, ''); writeFileBytes(lab, out === n ? `${n}.out` : out, gunzipSync(fileBytes(lab, n))); return [cellRow([str(out)])]; });
def('base64encode', (a) => { const b = bytesOf(a[0]); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return [str(btoa(s))]; });
def('base64decode', (a) => { try { return [uint8(Uint8Array.from(atob(textOf(a[0]).replace(/\s+/g, '')), (c) => c.charCodeAt(0)))]; } catch { throw new LabError('That isn’t base64 text.'); } });

/** MD5, SHA-1 and SHA-256 (synchronous: the engine can't wait for the browser's crypto here). */
export function digest(kind: string, b: Uint8Array): string {
  const hex = (w: number[], le: boolean) => w.map((x) => (le ? [x & 255, (x >>> 8) & 255, (x >>> 16) & 255, x >>> 24] : [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]).map((y) => y.toString(16).padStart(2, '0')).join('')).join('');
  const pad = (le: boolean) => {
    const n = b.length, len = (((n + 8) >> 6) + 1) << 6, m = new Uint8Array(len);
    m.set(b); m[n] = 0x80;
    const bits = n * 8, dv = new DataView(m.buffer);
    if (le) { dv.setUint32(len - 8, bits >>> 0, true); dv.setUint32(len - 4, Math.floor(bits / 2 ** 32), true); }
    else { dv.setUint32(len - 8, Math.floor(bits / 2 ** 32)); dv.setUint32(len - 4, bits >>> 0); }
    return { m, dv };
  };
  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c)), rotr = (x: number, c: number) => (x >>> c) | (x << (32 - c));
  const k = kind.toLowerCase();
  if (k === 'md5') {
    const { m, dv } = pad(true), s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < m.length; o += 64) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F: number, g: number;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) | 0;
        A = D; D = C; C = B; B = (B + rotl(F, s[(i >> 4) * 4 + (i % 4)])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return hex([a0, b0, c0, d0], true);
  }
  if (k === 'sha1') {
    const { m, dv } = pad(false), h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0], w = new Array<number>(80);
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let [A, B, C, D, E] = h;
      for (let i = 0; i < 80; i++) {
        const f = i < 20 ? (B & C) | (~B & D) : i < 40 ? B ^ C ^ D : i < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D, kk = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
        const t = (rotl(A, 5) + f + E + kk + w[i]) | 0; E = D; D = C; C = rotl(B, 30); B = A; A = t;
      }
      h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0; h[4] = (h[4] + E) | 0;
    }
    return hex(h, false);
  }
  if (k === 'sha256') {
    const { m, dv } = pad(false), K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array<number>(64);
    for (let o = 0; o < m.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [A, B, C, D, E, F, G, H] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25), ch = (E & F) ^ (~E & G), t1 = (H + S1 + ch + K[i] + w[i]) | 0, S0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22), mj = (A & B) ^ (A & C) ^ (B & C), t2 = (S0 + mj) | 0;
        H = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
      }
      h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0; h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + H) | 0;
    }
    return hex(h, false);
  }
  throw new LabError(`hash knows 'md5', 'sha1' and 'sha256', not '${kind}'.`);
}
def('hash', (a) => [str(digest(textOf(a[0]), bytesOf(a[1])))]);

// ——— Any value to bytes and back (through the .mat format) ———
def('getByteStreamFromArray', (a) => [uint8(writeMat([['v', a[0]]]))]);
def('getArrayFromByteStream', (a) => { const vars = readMat(Uint8Array.from(toMat(a[0]).d, (x) => x & 255)); if (!vars.length) throw new LabError('Those bytes hold no value.'); return [vars[0][1]]; });
