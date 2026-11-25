import { unzipSync, unzlibSync, zipSync } from 'fflate';
import { LabError } from './parse';
import { mat, numel, pages, scalar, str, toMat, type Cell, type Mat, type Struct, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { textOf, type Lab } from './interp';
import { png } from './colormap';
import { encodeBmp, encodeJpeg } from './jpeg';
import { readXls } from './xls';
import { H5File, numbers as h5numbers, type H5Object } from './hdf5';
import { cast, isNumClass, unitValues, type NumClass } from './types';
import { findAll, kid, parseXml } from '@/lib/xml-lite';
import { writeXlsx } from '@/lib/sheet/xlsx';
import { keyOf } from '@/lib/sheet/refs';
import { columnRows, heightOf, isTable, names as colNames, pick, table } from './table';
import type { CellJSON } from '@/lib/sheet/book';

// Hyperion's files (M383): a store of files kept on the person's device (the window keeps them; the engine sees
// them here), and MATLAB's file functions over it: delimited text and Excel (readmatrix, writematrix, readcell,
// readtable, writetable, csvread, dlmwrite…), MATLAB's own .mat files (save, load: level 5, compressed or not),
// pictures (imread, imwrite) and text files (fopen, fprintf, fgetl, fileread…). Tables are kept as a struct of
// columns marked as a table.

export interface Pixels { w: number; h: number; rgba: Uint8Array | Uint8ClampedArray }
export interface LabFile { bytes: Uint8Array; pixels?: Pixels }
const MAX = 50_000_000;

export class FileStore {
  files = new Map<string, LabFile>();
  /** Names written or deleted by code since the last takeChanges (the window saves or removes them). */
  private changed = new Set<string>();
  private open = new Map<number, { name: string; write: boolean; text: string; pos: number }>();
  private nextFid = 3;
  has(name: string) { try { return this.files.has(clean(name)); } catch { return false; } }
  get(name: string): LabFile {
    const f = this.files.get(clean(name));
    if (!f) throw new LabError(`There’s no file called “${name}”. Upload it in Files (or check the name).`);
    return f;
  }
  /** From the window (an upload): not reported back as a change. */
  load(name: string, f: LabFile) { this.files.set(clean(name), f); }
  put(name: string, f: LabFile) {
    if (f.bytes.length > MAX) throw new LabError('That file would be over 50 MB.');
    const n = clean(name);
    this.files.set(n, f); this.changed.add(n);
  }
  remove(name: string) { const n = clean(name); if (!this.files.delete(n)) throw new LabError(`There’s no file called “${name}”.`); this.changed.add(n); }
  takeChanges(): { name: string; file: LabFile | null }[] {
    const out = [...this.changed].map((name) => ({ name, file: this.files.get(name) ?? null }));
    this.changed.clear();
    return out;
  }
  text(name: string) { return new TextDecoder().decode(this.get(name).bytes).replace(/^﻿/, ''); }
  putText(name: string, text: string) { this.put(name, { bytes: new TextEncoder().encode(text) }); }
  fopen(name: string, mode: string): number {
    const write = /[wa]/.test(mode), n = clean(name);
    if (!write && !this.files.has(n)) return -1;
    const fid = this.nextFid++;
    this.open.set(fid, { name: n, write, text: write ? (mode.includes('a') && this.files.has(n) ? this.text(n) : '') : this.text(n), pos: 0 });
    return fid;
  }
  handle(fid: number) { const h = this.open.get(fid); if (!h) throw new LabError(`File ${fid} isn’t open (use fopen first).`); return h; }
  fclose(fid: number | 'all') {
    for (const [id, h] of [...this.open]) if (fid === 'all' || id === fid) { if (h.write) this.putText(h.name, h.text); this.open.delete(id); }
  }
}
/** A plain file name: no folders above this one, no odd characters. */
function clean(name: string) {
  const n = name.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!n || n.length > 120 || n.startsWith('/') || n.split('/').includes('..') || /[\0-\x1f<>:"|?*]/.test(n)) throw new LabError(`“${name}” isn’t a file name Hyperion can use.`);
  return n;
}
const store = (lab: Lab): FileStore => {
  const s = (lab.host as { files?: unknown }).files;
  if (!(s instanceof FileStore)) throw new LabError('Files aren’t available here.');
  return s;
};
/** A file's text, and writing one, for the toolboxes' own readers and writers (M512: FASTA, GenBank). */
export const fileText = (lab: Lab, name: string) => store(lab).text(name);
export const writeFileText = (lab: Lab, name: string, text: string) => store(lab).putText(name, text);
const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const ext = (name: string) => (/\.([^./]+)$/.exec(name)?.[1] ?? '').toLowerCase();
/** Name–value options: opt(a, 'Sheet'). */
const opt = (a: Value[], key: string): Value | undefined => { const i = a.findIndex((v) => v.k === 'str' && v.v.toLowerCase() === key.toLowerCase()); return i >= 0 ? a[i + 1] : undefined; };

// ——— Rows of text cells: from CSV / text, or from an Excel sheet ———

export function splitRows(text: string, delim?: string): string[][] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const sep = delim ?? (first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes(';') ? ';' : ' ');
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (sep === ' ') { rows.push(line.trim().split(/\s+/)); continue; }
    const row: string[] = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; continue; }
      if (ch === '"' && !cell.trim()) { quoted = true; cell = ''; } else if (ch === sep) { row.push(cell.trim()); cell = ''; } else cell += ch;
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}
/** An Excel sheet's cells as text, with formulas' saved results (not their formulas). */
function xlsxRows(bytes: Uint8Array, sheet?: Value): string[][] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes, { filter: (x) => /\.(xml|rels)$/i.test(x.name) }); } catch { throw new LabError('That Excel file couldn’t be opened.'); }
  const read = (p: string) => { const k = Object.keys(files).find((x) => x.toLowerCase() === p.toLowerCase()); return k ? new TextDecoder().decode(files[k]) : null; };
  const wb = read('xl/workbook.xml');
  if (!wb) throw new LabError('That isn’t an Excel workbook (.xlsx).');
  const sheets = findAll(parseXml(wb), 'sheet');
  const rels = new Map(findAll(parseXml(read('xl/_rels/workbook.xml.rels') ?? '<Relationships/>'), 'Relationship').map((r) => [r.attrs.Id, r.attrs.Target ?? '']));
  const want = sheet === undefined ? 0 : sheet.k === 'str' ? sheets.findIndex((s) => s.attrs.name === sheet.v) : scalar(sheet) - 1;
  const s = sheets[want];
  if (!s) throw new LabError(`There’s no sheet ${sheet && sheet.k === 'str' ? `called “${sheet.v}”` : want + 1} (the sheets: ${sheets.map((x) => x.attrs.name).join(', ')}).`);
  const target = (rels.get(s.attrs['r:id'] ?? s.attrs.id ?? '') ?? `worksheets/sheet${want + 1}.xml`).replace(/^\/?xl\//, '');
  const xml = read(`xl/${target}`);
  if (!xml) throw new LabError('That sheet is missing from the file.');
  const shared = findAll(parseXml(read('xl/sharedStrings.xml') ?? '<sst/>'), 'si').map((si) => findAll(si, 't').map((t) => t.text).join(''));
  const rows: string[][] = [];
  for (const c of findAll(parseXml(xml), 'c')) {
    const m = /^([A-Z]+)(\d+)$/.exec(c.attrs.r ?? '');
    if (!m) continue;
    const r = Number(m[2]) - 1, col = m[1].split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const v = kid(c, 'v')?.text ?? '', t = c.attrs.t ?? 'n';
    const text = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? findAll(kid(c, 'is'), 't').map((x) => x.text).join('') : t === 'b' ? (v === '1' ? 'true' : 'false') : v;
    (rows[r] ??= [])[col] = text;
  }
  return Array.from(rows, (row) => Array.from(row ?? [], (x) => x ?? ''));
}
export function rowsOf(lab: Lab, name: string, a: Value[] = []): string[][] {
  const fs = store(lab), f = fs.get(name);
  if (ext(name) === 'xlsx' || (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b)) return xlsxRows(f.bytes, opt(a, 'Sheet'));
  if (ext(name) === 'xls' || (f.bytes[0] === 0xd0 && f.bytes[1] === 0xcf)) {
    // An old Excel file (M387): the sheet by name or number, the first by default.
    const sheets = readXls(f.bytes), want = opt(a, 'Sheet');
    const s = want === undefined ? sheets[0] : want.k === 'str' ? sheets.find((x) => x.name === want.v) : sheets[scalar(want) - 1];
    if (!s) throw new LabError(`There’s no sheet ${want && want.k === 'str' ? `called “${want.v}”` : want ? scalar(want) : ''} (the sheets: ${sheets.map((x) => x.name).join(', ')}).`);
    return s.rows;
  }
  const d = opt(a, 'Delimiter');
  return splitRows(fs.text(name), d ? textOf(d).replace('\\t', '\t') : undefined);
}
const asNumber = (s: string) => { const t = s.trim(); if (!t) return NaN; if (/^(nan|na)$/i.test(t)) return NaN; if (/^[+-]?inf$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity; const n = Number(t.replace(/,(?=\d{3}\b)/g, '')); return Number.isFinite(n) ? n : null; };
/** The numbers of rows of cells, skipping header rows of text at the top (as readmatrix does). */
function numbers(rows: string[][]): Mat {
  let start = 0;
  while (start < rows.length && rows[start].some((s) => s.trim() && asNumber(s) === null) && !rows[start].some((s) => asNumber(s) !== null && s.trim())) start++;
  const body = rows.slice(start);
  const c = Math.max(0, ...body.map((r) => r.length)), r = body.length;
  const o = mat(r, c);
  body.forEach((row, i) => { for (let j = 0; j < c; j++) { const n = asNumber(row[j] ?? ''); o.d[i + j * r] = n ?? NaN; } });
  return o;
}
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const fmt = (x: number) => (Number.isNaN(x) ? 'NaN' : Number.isFinite(x) ? String(+x.toPrecision(15)) : x > 0 ? 'Inf' : '-Inf');
/** Writes rows of text cells as CSV / text, or as an Excel workbook. */
function writeRows(lab: Lab, name: string, rows: string[][], delim = ',') {
  const fs = store(lab);
  if (ext(name) === 'xlsx') {
    const cells: Record<string, CellJSON> = {};
    rows.forEach((row, i) => row.forEach((v, j) => { if (v !== '') cells[keyOf(i, j)] = { v }; }));
    const parts = writeXlsx({ sheets: [{ id: 's1', name: 'Sheet1', cells }] });
    fs.put(name, { bytes: zipSync(parts, { level: 6 }) });
    return;
  }
  fs.putText(name, `${rows.map((r) => r.map((s) => (delim === ',' ? csvCell(s) : s)).join(delim)).join('\n')}\n`);
}
const matRows = (m: Mat) => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c * pages(m) }, (_, j) => fmt(m.d[i + j * m.r])));

// ——— Numbers and cells from files ———
def('readmatrix', (a, _n, lab) => [numbers(rowsOf(lab, textOf(a[0]), a))]);
def('csvread dlmread', (a, _n, lab) => {
  // csvread(file, r0, c0) and dlmread(file, delim, r0, c0): rows and columns counted from 0.
  const delim = a[1]?.k === 'str' ? textOf(a[1]).replace('\\t', '\t') : undefined;
  const nums = a.slice(delim ? 2 : 1).filter((v) => v.k === 'mat').map((v) => scalar(v));
  const rows = splitRows(store(lab).text(textOf(a[0])), delim).slice(nums[0] ?? 0).map((r) => r.slice(nums[1] ?? 0));
  const m = numbers(rows);
  for (let k = 0; k < m.d.length; k++) if (Number.isNaN(m.d[k])) m.d[k] = 0; // these old functions read gaps as 0
  return [m];
});
def('writematrix', (a, _n, lab) => {
  const m = toMat(a[0]), name = a[1] ? textOf(a[1]) : 'matrix.txt', d = opt(a, 'Delimiter');
  writeRows(lab, name, matRows(m), d ? textOf(d).replace('\\t', '\t') : ext(name) === 'txt' ? ',' : ',');
  return [];
});
def('csvwrite', (a, _n, lab) => { writeRows(lab, textOf(a[0]), matRows(toMat(a[1]))); return []; });
def('dlmwrite', (a, _n, lab) => { const d = opt(a, 'delimiter') ?? (a[2]?.k === 'str' && !/^(delimiter|precision|-append)$/i.test(a[2].v) ? a[2] : undefined); writeRows(lab, textOf(a[0]), matRows(toMat(a[1])), d ? textOf(d).replace('\\t', '\t') : ','); return []; });
const cellOfText = (s: string): Value => { const n = asNumber(s); return n !== null && s.trim() ? mat(1, 1, [n]) : str(s); };
def('readcell', (a, _n, lab) => {
  const rows = rowsOf(lab, textOf(a[0]), a), c = Math.max(0, ...rows.map((r) => r.length)), r = rows.length;
  const d: Value[] = new Array(r * c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) d[i + j * r] = rows[i][j] === undefined || rows[i][j] === '' ? mat(0, 0) : cellOfText(rows[i][j]);
  return [{ k: 'cell', r, c, d } satisfies Cell];
});
const cellText = (v: Value) => (v.k === 'str' ? v.v : v.k === 'mat' ? (numel(v) ? fmt(v.d[0]) : '') : '');
def('writecell', (a, _n, lab) => {
  const C = a[0];
  if (C.k !== 'cell') throw new LabError('writecell needs a cell array.');
  writeRows(lab, a[1] ? textOf(a[1]) : 'cell.txt', Array.from({ length: C.r }, (_, i) => Array.from({ length: C.c }, (_, j) => cellText(C.d[i + j * C.r]))));
  return [];
});
def('fileread', (a, _n, lab) => [str(store(lab).text(textOf(a[0])))]);
def('readlines', (a, _n, lab) => { const lines = store(lab).text(textOf(a[0])).replace(/\r?\n$/, '').split(/\r?\n/); return [{ k: 'cell', r: lines.length, c: 1, d: lines.map((l) => str(l)) }]; });
def('writelines', (a, _n, lab) => { const v = a[0]; const lines = v.k === 'cell' ? v.d.map((x) => textOf(x)) : [textOf(v)]; store(lab).putText(textOf(a[1]), `${lines.join('\n')}\n`); return []; });

// ——— Tables: a struct of equal-height columns, marked as a table ———
/** A valid, unique variable name from a heading. */
function names(heads: string[]): string[] {
  const used = new Set<string>();
  return heads.map((h, j) => {
    let n = h.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || `Var${j + 1}`;
    if (!/^[A-Za-z]/.test(n)) n = `x${n}`;
    let k = n, q = 1;
    while (used.has(k)) k = `${n}_${q++}`;
    used.add(k);
    return k.slice(0, 63);
  });
}
const makeTable = table;
def('readtable', (a, _n, lab) => {
  const rows = rowsOf(lab, textOf(a[0]), a);
  const width = Math.max(0, ...rows.map((r) => r.length));
  // The first row is the headings when any of it isn't a number.
  const headed = rows.length > 0 && rows[0].some((s) => s.trim() && asNumber(s) === null) && !(opt(a, 'ReadVariableNames')?.k === 'mat' && !scalar(opt(a, 'ReadVariableNames')!));
  const heads = names(Array.from({ length: width }, (_, j) => (headed ? rows[0][j] ?? '' : '')));
  const body = rows.slice(headed ? 1 : 0), h = body.length;
  const cols: [string, Value][] = heads.map((name, j) => {
    const cells = body.map((r) => r[j] ?? '');
    const nums = cells.map(asNumber);
    if (nums.every((n) => n !== null)) return [name, mat(h, 1, nums as number[])];
    return [name, { k: 'cell', r: h, c: 1, d: cells.map((s) => str(s)) }];
  });
  return [makeTable(cols)];
});
function tableRows(T: Struct): string[][] {
  const cols = [...T.f], h = heightOf(T);
  return [cols.map(([n]) => n), ...Array.from({ length: h }, (_, i) => cols.map(([, v]) => (v.k === 'cell' ? cellText(v.d[i]) : v.k === 'mat' ? fmt(v.d[i]) : v.k === 'str' ? v.v : '')))];
}
def('writetable', (a, _n, lab) => {
  const T = a[0];
  if (T.k !== 'struct' || !T.table) throw new LabError('writetable needs a table (make one with table or readtable).');
  writeRows(lab, a[1] ? textOf(a[1]) : 'table.txt', tableRows(T));
  return [];
});
def('table', (a) => {
  const ni = a.findIndex((v) => v.k === 'str' && /^variablenames$/i.test(v.v));
  const data = ni >= 0 ? a.slice(0, ni) : a;
  const given = ni >= 0 && a[ni + 1]?.k === 'cell' ? (a[ni + 1] as Cell).d.map((v) => textOf(v)) : [];
  const cols = data.map((v): Value => (v.k === 'mat' && v.r === 1 && v.c > 1 ? mat(v.c, 1, v.d) : v.k === 'cell' && v.r === 1 && v.c > 1 ? { ...v, r: v.c, c: 1 } : v));
  const h = cols.length ? (cols[0].k === 'mat' || cols[0].k === 'cell' ? cols[0].r : 1) : 0;
  if (cols.some((v) => (v.k === 'mat' || v.k === 'cell' ? v.r : 1) !== h)) throw new LabError('Every column of a table must have the same number of rows.');
  return [makeTable(names(cols.map((_, j) => given[j] ?? `Var${j + 1}`)).map((n, j) => [n, cols[j]]))];
});
def('array2table', (a) => {
  const m = toMat(a[0]), ni = a.findIndex((v) => v.k === 'str' && /^variablenames$/i.test(v.v));
  const given = ni >= 0 && a[ni + 1]?.k === 'cell' ? (a[ni + 1] as Cell).d.map((v) => textOf(v)) : [];
  return [makeTable(names(Array.from({ length: m.c }, (_, j) => given[j] ?? `Var${j + 1}`)).map((n, j) => [n, mat(m.r, 1, m.d.subarray(j * m.r, (j + 1) * m.r))]))];
});
def('table2array', (a) => {
  const T = a[0];
  if (T.k !== 'struct' || !T.table) throw new LabError('table2array needs a table.');
  const cols = [...T.f.values()];
  if (cols.some((v) => v.k !== 'mat')) throw new LabError('table2array needs every column to be numbers.');
  const h = heightOf(T), o = mat(h, cols.reduce((s, v) => s + (v as Mat).c, 0));
  let at = 0;
  for (const v of cols as Mat[]) { o.d.set(v.d.subarray(0, h * v.c), at * h); at += v.c; }
  return [o];
});
def('height', (a) => [mat(1, 1, [a[0].k === 'struct' && a[0].table ? heightOf(a[0]) : a[0].k === 'mat' || a[0].k === 'cell' ? a[0].r : 1])]);
def('width', (a) => [mat(1, 1, [a[0].k === 'struct' && a[0].table ? a[0].f.size : a[0].k === 'mat' || a[0].k === 'cell' ? a[0].c : 1])]);

// ——— MATLAB's .mat files (level 5) ———
const MI = { INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9, INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15, UTF8: 16, UTF16: 17, UTF32: 18 };
const MX = { CELL: 1, STRUCT: 2, OBJECT: 3, CHAR: 4, SPARSE: 5, DOUBLE: 6, SINGLE: 7, INT8: 8, UINT8: 9, INT16: 10, UINT16: 11, INT32: 12, UINT32: 13, INT64: 14, UINT64: 15 };

class Writer {
  private parts: Uint8Array[] = [];
  bytes(b: Uint8Array) { this.parts.push(b); }
  done() { const n = this.parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let at = 0; for (const p of this.parts) { o.set(p, at); at += p.length; } return o; }
}
const pad8 = (n: number) => (8 - (n % 8)) % 8;
/** One data element: its tag (type, length) then the data, padded to 8 bytes. */
function element(type: number, data: Uint8Array): Uint8Array {
  const o = new Uint8Array(8 + data.length + pad8(data.length));
  const dv = new DataView(o.buffer);
  dv.setUint32(0, type, true); dv.setUint32(4, data.length, true);
  o.set(data, 8);
  return o;
}
const i32s = (v: number[]) => { const o = new Uint8Array(v.length * 4), dv = new DataView(o.buffer); v.forEach((x, i) => dv.setInt32(i * 4, x, true)); return o; };
const f64s = (v: ArrayLike<number>) => new Uint8Array(Float64Array.from(v).buffer);
function matrix(v: Value, name: string): Uint8Array {
  const w = new Writer();
  const flags = (cls: number, extra = 0) => { const o = new Uint8Array(8); new DataView(o.buffer).setUint32(0, cls | extra, true); return element(MI.UINT32, o); };
  const nameEl = element(MI.INT8, new TextEncoder().encode(name));
  if (v.k === 'mat') {
    const dims = v.nd ? [v.r, v.c, ...v.nd] : pages(v) > 1 ? [v.r, v.c, pages(v)] : [v.r, v.c];
    if (v.logical) { w.bytes(flags(MX.UINT8, 0x0200)); w.bytes(element(MI.INT32, i32s(dims))); w.bytes(nameEl); w.bytes(element(MI.UINT8, Uint8Array.from(v.d, (x) => (x ? 1 : 0)))); }
    else if (v.cls) {
      // A typed array keeps its type (MATLAB reads it back as that type).
      const [mx, mi, typed] = TYPED[v.cls];
      w.bytes(flags(mx, v.im ? 0x0800 : 0)); w.bytes(element(MI.INT32, i32s(dims))); w.bytes(nameEl);
      w.bytes(element(mi, typed(v.d)));
      if (v.im) w.bytes(element(mi, typed(v.im)));
    }
    else { w.bytes(flags(MX.DOUBLE, v.im ? 0x0800 : 0)); w.bytes(element(MI.INT32, i32s(dims))); w.bytes(nameEl); w.bytes(element(MI.DOUBLE, f64s(v.d))); if (v.im) w.bytes(element(MI.DOUBLE, f64s(v.im))); }
  } else if (v.k === 'str') {
    const rows = v.v.split('\n'), c = Math.max(0, ...rows.map((r) => r.length)), r = v.v ? rows.length : 0;
    const d = new Uint16Array(r * c);
    rows.forEach((row, i) => { for (let j = 0; j < c; j++) d[i + j * r] = row.charCodeAt(j) || 32; });
    w.bytes(flags(MX.CHAR)); w.bytes(element(MI.INT32, i32s([r, c]))); w.bytes(nameEl); w.bytes(element(MI.UINT16, new Uint8Array(d.buffer)));
  } else if (v.k === 'cell') {
    w.bytes(flags(MX.CELL)); w.bytes(element(MI.INT32, i32s([v.r, v.c]))); w.bytes(nameEl);
    for (const x of v.d) w.bytes(matrix(x, ''));
  } else if (v.k === 'struct') {
    // A table is saved as a plain struct of its columns.
    const fields = [...v.f.keys()], len = Math.max(1, ...fields.map((f) => f.length)) + 1;
    const fn = new Uint8Array(fields.length * len);
    fields.forEach((f, i) => fn.set(new TextEncoder().encode(f), i * len));
    w.bytes(flags(MX.STRUCT)); w.bytes(element(MI.INT32, i32s([1, 1]))); w.bytes(nameEl); w.bytes(element(MI.INT32, i32s([len]))); w.bytes(element(MI.INT8, fn));
    for (const f of fields) w.bytes(matrix(v.f.get(f)!, ''));
  } else throw new LabError(`“${name}” is a function handle: .mat files here keep numbers, text, cells and structs.`);
  return element(MI.MATRIX, w.done());
}
export function writeMat(vars: [string, Value][]): Uint8Array {
  const head = new Uint8Array(128);
  head.set(new TextEncoder().encode(`MATLAB 5.0 MAT-file, Platform: Hyperion, Created on: ${new Date().toUTCString()}`.padEnd(116, ' ').slice(0, 116)));
  head[124] = 0x00; head[125] = 0x01; head[126] = 0x49; head[127] = 0x4d; // version 0x0100, "IM" (little-endian)
  const w = new Writer();
  w.bytes(head);
  for (const [n, v] of vars) w.bytes(matrix(v, n));
  return w.done();
}
const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const TYPED: Record<NumClass, [number, number, (d: Float64Array) => Uint8Array]> = {
  int8: [MX.INT8, MI.INT8, (d) => bytesOf(Int8Array.from(d))], uint8: [MX.UINT8, MI.UINT8, (d) => bytesOf(Uint8Array.from(d))],
  int16: [MX.INT16, MI.INT16, (d) => bytesOf(Int16Array.from(d))], uint16: [MX.UINT16, MI.UINT16, (d) => bytesOf(Uint16Array.from(d))],
  int32: [MX.INT32, MI.INT32, (d) => bytesOf(Int32Array.from(d))], uint32: [MX.UINT32, MI.UINT32, (d) => bytesOf(Uint32Array.from(d))],
  int64: [MX.INT64, MI.INT64, (d) => bytesOf(BigInt64Array.from(d, (x) => BigInt(x)))], uint64: [MX.UINT64, MI.UINT64, (d) => bytesOf(BigUint64Array.from(d, (x) => BigInt(x)))],
  single: [MX.SINGLE, MI.SINGLE, (d) => bytesOf(Float32Array.from(d))],
};
const CLASS_OF: Record<number, NumClass> = { [MX.INT8]: 'int8', [MX.UINT8]: 'uint8', [MX.INT16]: 'int16', [MX.UINT16]: 'uint16', [MX.INT32]: 'int32', [MX.UINT32]: 'uint32', [MX.INT64]: 'int64', [MX.UINT64]: 'uint64', [MX.SINGLE]: 'single' };
function readNumbers(type: number, b: Uint8Array): number[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out: number[] = [];
  const size = { [MI.INT8]: 1, [MI.UINT8]: 1, [MI.INT16]: 2, [MI.UINT16]: 2, [MI.INT32]: 4, [MI.UINT32]: 4, [MI.SINGLE]: 4, [MI.DOUBLE]: 8, [MI.INT64]: 8, [MI.UINT64]: 8, [MI.UTF8]: 1, [MI.UTF16]: 2, [MI.UTF32]: 4 }[type];
  if (!size) throw new LabError('That .mat file holds a kind of number Hyperion can’t read.');
  for (let o = 0; o + size <= b.length; o += size) {
    out.push(type === MI.INT8 ? dv.getInt8(o) : type === MI.UINT8 || type === MI.UTF8 ? dv.getUint8(o) : type === MI.INT16 ? dv.getInt16(o, true) : type === MI.UINT16 || type === MI.UTF16 ? dv.getUint16(o, true) : type === MI.INT32 ? dv.getInt32(o, true) : type === MI.UINT32 || type === MI.UTF32 ? dv.getUint32(o, true) : type === MI.SINGLE ? dv.getFloat32(o, true) : type === MI.DOUBLE ? dv.getFloat64(o, true) : type === MI.INT64 ? Number(dv.getBigInt64(o, true)) : Number(dv.getBigUint64(o, true)));
  }
  return out;
}
/** The data elements in a byte range: [type, data] each (with the short "small element" form). */
function elements(b: Uint8Array): [number, Uint8Array][] {
  const out: [number, Uint8Array][] = [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  while (o + 8 <= b.length) {
    const first = dv.getUint32(o, true);
    if (first >>> 16) { const n = first >>> 16; out.push([first & 0xffff, b.subarray(o + 4, o + 4 + n)]); o += 8; continue; }
    const n = dv.getUint32(o + 4, true);
    if (o + 8 + n > b.length) throw new LabError('That .mat file is cut short.');
    out.push([first, b.subarray(o + 8, o + 8 + n)]);
    o += 8 + n + (first === MI.COMPRESSED ? 0 : pad8(n));
  }
  return out;
}
function readMatrix(b: Uint8Array): { name: string; value: Value } {
  const els = elements(b);
  const flags = readNumbers(MI.UINT32, els[0][1]);
  const cls = flags[0] & 0xff, complex = !!(flags[0] & 0x0800), logical = !!(flags[0] & 0x0200);
  const dims = readNumbers(els[1][0], els[1][1]);
  const name = new TextDecoder().decode(els[2][1]);
  const [r, c] = dims, p = dims.slice(2).reduce((s, x) => s * x, 1);
  if (cls === MX.CELL) return { name, value: { k: 'cell', r, c, d: els.slice(3).map(([, x]) => readMatrix(x).value) } };
  if (cls === MX.STRUCT) {
    const len = readNumbers(els[3][0], els[3][1])[0], raw = els[4][1], fields: string[] = [];
    for (let k = 0; k + len <= raw.length; k += len) fields.push(new TextDecoder().decode(raw.subarray(k, k + len)).replace(/\0+$/, ''));
    if (r * c !== 1) throw new LabError(`“${name}” is a ${r}x${c} struct array: Hyperion reads single structs.`);
    return { name, value: { k: 'struct', f: new Map(fields.map((f, i) => [f, readMatrix(els[5 + i][1]).value])) } };
  }
  if (cls === MX.CHAR) {
    const codes = readNumbers(els[3][0], els[3][1]);
    const rows = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => String.fromCharCode(codes[i + j * r])).join(''));
    return { name, value: str(rows.join('\n')) };
  }
  if (cls === MX.SPARSE || cls === MX.OBJECT) throw new LabError(`“${name}” is a ${cls === MX.SPARSE ? 'sparse matrix' : 'MATLAB object'}: Hyperion can’t read those yet.`);
  const re = readNumbers(els[3][0], els[3][1]);
  const m = mat(r, c, re, logical);
  if (p > 1 && r * c === 0) m.p = p;
  if (dims.length > 3) m.nd = dims.slice(2);
  if (complex && els[4]) m.im = Float64Array.from(readNumbers(els[4][0], els[4][1]));
  if (!logical && CLASS_OF[cls]) m.cls = CLASS_OF[cls];
  return { name, value: m };
}
// MATLAB 7.3 files (M388): HDF5 (hdf5.ts) with MATLAB's conventions: each variable a dataset (or a group for a
// struct or a sparse matrix) labelled MATLAB_class, sizes stored reversed, text as UTF-16 codes, complex numbers as
// a compound of real and imag, cells as references into the #refs# group, empty arrays as their sizes.
function fromH5(f: H5File, o: H5Object, name: string, skipped: string[]): Value | null {
  const label = o.attrs.get('MATLAB_class'), cls = typeof label === 'string' ? label : '';
  if (o.kind === 'group') {
    const kids = o.children();
    if (o.attrs.has('MATLAB_sparse')) {
      // Sparse: column starts (jc), row numbers (ir) and values; made into an ordinary matrix.
      const rows = Number((o.attrs.get('MATLAB_sparse') as number[])[0]);
      const get = (n: string) => { const d = kids.find((k) => k.name === n); return d && d.kind === 'dataset' ? h5numbers(d.read(), d.type) : []; };
      const jc = get('jc'), ir = get('ir'), data = get('data'), cols = jc.length - 1;
      if (rows * cols > 5e7) { skipped.push(`${name} (a sparse matrix too big to make full)`); return null; }
      const m = mat(rows, cols, undefined, cls === 'logical');
      for (let j = 0; j < cols; j++) for (let k = jc[j]; k < jc[j + 1]; k++) m.d[ir[k] + j * rows] = cls === 'logical' ? 1 : data[k] ?? 1;
      return m;
    }
    if (cls !== 'struct' && cls !== '') { skipped.push(`${name} (a MATLAB ${cls} object)`); return null; }
    const fields = kids.filter((k) => !k.name.startsWith('#'));
    if (fields.some((k) => k.kind === 'dataset' && k.type.cls === 7 && typeof k.attrs.get('MATLAB_class') !== 'string')) { skipped.push(`${name} (a struct array)`); return null; }
    const out = new Map<string, Value>();
    for (const k of fields) { const v = fromH5(f, k, `${name}.${k.name}`, skipped); if (v) out.set(k.name, v); }
    return { k: 'struct', f: out };
  }
  const dims = [...o.dims].reverse();
  while (dims.length < 2) dims.push(1);
  if (o.attrs.has('MATLAB_empty') && (o.attrs.get('MATLAB_empty') as number[])[0]) {
    const sizes = h5numbers(o.read(), o.type);
    if (cls === 'char') return str('');
    if (cls === 'cell') return { k: 'cell', r: sizes[0] ?? 0, c: sizes[1] ?? 0, d: [] };
    return mat(sizes[0] ?? 0, sizes[1] ?? 0);
  }
  const shape = (m: Mat) => { if (dims.length > 2) { const p = dims.slice(2).reduce((s, x) => s * x, 1); if (m.r * m.c === 0 && p > 1) m.p = p; if (dims.length > 3) m.nd = dims.slice(2); } return m; };
  const [r, c] = dims;
  if (cls === 'cell') {
    const refs = h5numbers(o.read(), o.type);
    return { k: 'cell', r, c: refs.length / (r || 1), d: refs.map((a, i) => fromH5(f, f.deref(a), `${name}{${i + 1}}`, skipped) ?? mat(0, 0)) };
  }
  if (cls === 'char') {
    const codes = h5numbers(o.read(), o.type);
    const rows = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => String.fromCharCode(codes[i + j * r])).join(''));
    return str(rows.join('\n'));
  }
  if (o.type.cls === 6) {
    const re = o.type.members?.find((m) => m.name === 'real'), im = o.type.members?.find((m) => m.name === 'imag');
    if (!re || !im) { skipped.push(`${name} (a compound Hyperion doesn't read)`); return null; }
    const raw = o.read(), n = raw.length / o.type.size, rd: number[] = [], id: number[] = [];
    for (let k = 0; k < n; k++) { rd.push(h5numbers(raw.subarray(k * o.type.size + re.offset, k * o.type.size + re.offset + re.type.size), re.type)[0]); id.push(h5numbers(raw.subarray(k * o.type.size + im.offset, k * o.type.size + im.offset + im.type.size), im.type)[0]); }
    const m = shape(mat(r, c, rd));
    m.im = Float64Array.from(id);
    if (isNumClass(cls) && cls !== 'single') return m;
    if (cls === 'single') m.cls = 'single';
    return m;
  }
  if (o.type.cls !== 0 && o.type.cls !== 1) { skipped.push(`${name} (${cls || 'a kind of data'} Hyperion doesn't read)`); return null; }
  const m = shape(mat(r, c, h5numbers(o.read(), o.type), cls === 'logical'));
  if (isNumClass(cls)) m.cls = cls;
  if (cls && cls !== 'double' && cls !== 'logical' && !isNumClass(cls)) { skipped.push(`${name} (a MATLAB ${cls})`); return null; }
  return m;
}
function readMat73(bytes: Uint8Array): { vars: [string, Value][]; skipped: string[] } {
  const f = new H5File(bytes), skipped: string[] = [], vars: [string, Value][] = [];
  for (const o of f.root().children()) {
    if (o.name.startsWith('#')) continue;
    const v = fromH5(f, o, o.name, skipped);
    if (v) vars.push([o.name, v]);
  }
  return { vars, skipped };
}
let lastSkipped: string[] = [];
export function readMat(bytes: Uint8Array): [string, Value][] {
  lastSkipped = [];
  const head = new TextDecoder().decode(bytes.subarray(0, 20));
  if (head.startsWith('MATLAB 7.3') || (bytes.length > 520 && bytes[512] === 0x89 && bytes[513] === 0x48 && bytes[514] === 0x44 && bytes[515] === 0x46) || (bytes[0] === 0x89 && bytes[1] === 0x48)) {
    const { vars, skipped } = readMat73(bytes);
    lastSkipped = skipped;
    return vars;
  }
  if (bytes.length < 128 || new TextDecoder().decode(bytes.subarray(0, 6)) !== 'MATLAB') throw new LabError('That isn’t a MATLAB .mat file.');
  if (bytes[126] !== 0x49 || bytes[127] !== 0x4d) throw new LabError('That .mat file is big-endian: Hyperion reads the usual little-endian ones.');
  const out: [string, Value][] = [];
  const walk = (b: Uint8Array) => {
    for (const [type, data] of elements(b)) {
      if (type === MI.COMPRESSED) { let inner: Uint8Array; try { inner = unzlibSync(data); } catch { throw new LabError('A compressed part of that .mat file couldn’t be opened.'); } walk(inner); }
      else if (type === MI.MATRIX) { const { name, value } = readMatrix(data); out.push([name, value]); }
    }
  };
  walk(bytes.subarray(128));
  return out;
}

// ——— save and load ———
type Vars = Map<string, Value>;
const varsOf = (lab: Lab, frame: unknown): Vars => (frame as { vars?: Vars } | undefined)?.vars ?? lab.vars;
def('save', (a, _n, lab, frame) => {
  const words = a.map((v) => textOf(v));
  const flags = words.filter((w) => w.startsWith('-')), rest = words.filter((w) => !w.startsWith('-'));
  const name = rest[0] ? (/\.\w+$/.test(rest[0]) ? rest[0] : `${rest[0]}.mat`) : 'matlab.mat';
  const vars = varsOf(lab, frame);
  const pick = rest.slice(1);
  const chosen = pick.length ? pick.map((n) => { const v = vars.get(n); if (!v) throw new LabError(`There’s no variable called “${n}” to save.`); return [n, v] as [string, Value]; }) : [...vars];
  if (flags.includes('-ascii') || ext(name) === 'txt' || ext(name) === 'csv') {
    const rows = chosen.flatMap(([, v]) => matRows(toMat(v)));
    writeRows(lab, name, rows, ext(name) === 'csv' ? ',' : ' ');
  } else store(lab).put(name, { bytes: writeMat(chosen) });
  return [];
});
def('load', (a, nout, lab, frame) => {
  const words = a.map((v) => textOf(v)).filter((w) => !w.startsWith('-'));
  const name = words[0] ? (/\.\w+$/.test(words[0]) || store(lab).has(words[0]) ? words[0] : `${words[0]}.mat`) : 'matlab.mat';
  const fs = store(lab);
  let got: [string, Value][];
  if (ext(name) === 'mat' || (fs.get(name).bytes.length >= 6 && new TextDecoder().decode(fs.get(name).bytes.subarray(0, 6)) === 'MATLAB')) {
    got = readMat(fs.get(name).bytes);
    if (lastSkipped.length) lab.host.out(`Not loaded (Hyperion can’t hold these yet): ${lastSkipped.join(', ')}\n`);
    const only = words.slice(1);
    if (only.length) got = got.filter(([n]) => only.includes(n));
  } else {
    // A text file of numbers becomes one variable named after the file.
    const base = (name.split('/').pop() ?? name).replace(/\.[^.]*$/, '').replace(/\W/g, '_').replace(/^(\d)/, 'x$1') || 'data';
    got = [[base, numbers(splitRows(fs.text(name)))]];
  }
  if (nout > 0) return [{ k: 'struct', f: new Map(got) }];
  const vars = varsOf(lab, frame);
  for (const [n, v] of got) vars.set(n, v);
  return [];
});

// ——— Pictures ———
def('imread', (a, _n, lab) => {
  const f = store(lab).get(textOf(a[0]));
  if (!f.pixels) throw new LabError('That file isn’t a picture Hyperion could open (PNG, JPEG, GIF, WebP or BMP).');
  const { w, h, rgba } = f.pixels, n = w * h, d = new Float64Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, t = y + x * h; d[t] = rgba[s]; d[t + n] = rgba[s + 1]; d[t + 2 * n] = rgba[s + 2]; }
  return [cast(mat(h, w, d), 'uint8')];
});
def('imwrite', (a, _n, lab) => {
  const I = toMat(a[0]), name = textOf(a[1]);
  const kind = ext(name);
  if (!['png', 'jpg', 'jpeg', 'bmp'].includes(kind)) throw new LabError('imwrite saves PNG, JPEG or BMP pictures: name the file something.png, .jpg or .bmp.');
  const P = pages(I), h = I.r, w = I.c, n = h * w;
  if (P !== 1 && P !== 3) throw new LabError('imwrite saves a grey picture (a matrix) or a colour one (rows × columns × 3).');
  const unit = unitValues(I);
  const rgba = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = y + x * h, o = (y * w + x) * 4, ch = (q: number) => Math.round(Math.max(0, Math.min(255, unit[s + (P === 3 ? q : 0) * n] * 255)));
    rgba[o] = ch(0); rgba[o + 1] = ch(1); rgba[o + 2] = ch(2); rgba[o + 3] = 255;
  }
  // JPEG (M387): imwrite(I, 'a.jpg', 'Quality', 90); its pixels are what a decoder would give back, near enough.
  const q = opt(a, 'Quality');
  const bytes = kind === 'png' ? Uint8Array.from(atob(png(w, h, rgba).split(',')[1]), (ch) => ch.charCodeAt(0)) : kind === 'bmp' ? encodeBmp(w, h, rgba) : encodeJpeg(w, h, rgba, q ? scalar(q) : 75);
  store(lab).put(name, { bytes, pixels: { w, h, rgba } });
  return [];
});

// ——— Text files: fopen, fprintf, fgetl… ———
def('fopen', (a, _n, lab) => [mat(1, 1, [store(lab).fopen(textOf(a[0]), a[1] ? textOf(a[1]) : 'r')])]);
def('fclose', (a, _n, lab) => { store(lab).fclose(a[0]?.k === 'str' ? 'all' : scalar(a[0])); return [mat(1, 1, [0])]; });
const plainPrint = BUILTINS.fprintf;
def('fprintf', (a, n, lab, frame) => {
  // fprintf(fid, format, …): 1 and 2 are the command window; others are files opened with fopen.
  if (a.length >= 2 && a[0].k === 'mat' && numel(a[0]) === 1 && a[1].k === 'str') {
    const fid = a[0].d[0];
    if (fid === 1 || fid === 2) return plainPrint(a.slice(1), n, lab, frame);
    const h = store(lab).handle(fid);
    if (!h.write) throw new LabError('That file was opened for reading: open it with fopen(name, \'w\') to write.');
    h.text += textOf(BUILTINS.sprintf(a.slice(1), 1, lab, frame)[0]);
    return [];
  }
  return plainPrint(a, n, lab, frame);
});
function nextLine(lab: Lab, fid: number, keep: boolean): Value {
  const h = store(lab).handle(fid);
  if (h.pos >= h.text.length) return mat(1, 1, [-1]);
  const end = h.text.indexOf('\n', h.pos), stop = end < 0 ? h.text.length : end + 1;
  const line = h.text.slice(h.pos, stop);
  h.pos = stop;
  return str(keep ? line : line.replace(/\r?\n$/, ''));
}
def('fgetl', (a, _n, lab) => [nextLine(lab, scalar(a[0]), false)]);
def('fgets', (a, _n, lab) => [nextLine(lab, scalar(a[0]), true)]);
def('feof', (a, _n, lab) => { const h = store(lab).handle(scalar(a[0])); return [{ ...mat(1, 1, [h.pos >= h.text.length ? 1 : 0]), logical: true }]; });
def('frewind', (a, _n, lab) => { store(lab).handle(scalar(a[0])).pos = 0; return []; });
def('fscanf', (a, _n, lab) => {
  // The numbers left in the file, as a column (or shaped by a size [r c]).
  const h = store(lab).handle(scalar(a[0]));
  const nums = (h.text.slice(h.pos).match(/[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|[-+]?(Inf|NaN)/g) ?? []).map(Number);
  h.pos = h.text.length;
  const size = a[2] ? [...toMat(a[2]).d] : null;
  if (size && size.length === 2 && Number.isFinite(size[1])) { const r = size[0], c = Math.ceil(nums.length / r); return [mat(r, c, [...nums, ...new Array(r * c - nums.length).fill(0)])]; }
  return [mat(nums.length, 1, nums)];
});

// ——— The folder ———
def('dir ls', (a, nout, lab) => {
  const fs = store(lab), pat = a[0] ? textOf(a[0]) : '*';
  const re = new RegExp(`^${pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  const list = [...fs.files].filter(([n]) => re.test(n)).sort(([p], [q]) => p.localeCompare(q));
  if (nout > 0) return [{ k: 'cell', r: list.length, c: 1, d: list.map(([n]) => str(n)) }];
  lab.host.out(list.length ? `${list.map(([n, f]) => `${n}  (${f.bytes.length < 1024 ? `${f.bytes.length} B` : `${(f.bytes.length / 1024).toFixed(1)} KB`})`).join('\n')}\n` : 'No files yet: upload some in Files, or save with writematrix, save or imwrite.\n');
  return [];
});
def('delete', (a, _n, lab) => { for (const v of a) store(lab).remove(textOf(v)); return []; });
def('isfile', (a, _n, lab) => [{ ...mat(1, 1, [store(lab).has(textOf(a[0])) ? 1 : 0]), logical: true }]);
def('type', (a, _n, lab) => { lab.host.out(`${store(lab).text(textOf(a[0]))}\n`); return []; });
def('copyfile movefile', (a, _n, lab) => { const fs = store(lab), from = textOf(a[0]), to = textOf(a[1]); fs.put(to, fs.get(from)); return []; });
BUILTINS.movefile = (a, n, lab) => { BUILTINS.copyfile(a, n, lab); store(lab).remove(textOf(a[0])); return []; };
def('pwd cd', (_a, nout, lab) => { if (nout > 0) return [str('/hyperion')]; lab.host.out('/hyperion (your Hyperion files)\n'); return []; });


// ——— Table tools (M385) ———
const needTable = (v: Value | undefined, what: string): Struct => { if (!isTable(v)) throw new LabError(`${what} needs a table.`); return v; };
/** Column names from a name, a cell of names, numbers (positions) or logicals. */
function pickNames(T: Struct, v: Value | undefined): string[] {
  const all = colNames(T);
  if (!v) return [];
  if (v.k === 'str') return [v.v];
  if (v.k === 'cell') return v.d.map((x) => textOf(x));
  const m = toMat(v);
  return m.logical ? all.filter((_, j) => m.d[j]) : [...m.d].map((k) => { const n = all[k - 1]; if (!n) throw new LabError(`Column ${k} is past the end.`); return n; });
}
def('istable', (a) => [{ ...mat(1, 1, [isTable(a[0]) ? 1 : 0]), logical: true }]);
const sortRowsPlain = BUILTINS.sortrows;
def('sortrows', (a, n, lab, frame) => {
  if (!isTable(a[0])) return sortRowsPlain(a, n, lab, frame);
  // sortrows(T, 'col'), sortrows(T, {'a', 'b'}, {'ascend', 'descend'}), sortrows(T, 'col', 'descend').
  const T = a[0], h = heightOf(T);
  const keys = a[1] && !(a[1].k === 'str' && /^(ascend|descend)$/i.test(a[1].v)) ? pickNames(T, a[1]) : [colNames(T)[0]];
  const dirArg = a.find((v, i) => i > 0 && ((v.k === 'str' && /^(ascend|descend)$/i.test(v.v)) || (v.k === 'cell' && v.d.every((x) => x.k === 'str' && /^(ascend|descend)$/i.test(x.v)))));
  const dirs = keys.map((_, k) => { const d = dirArg?.k === 'cell' ? textOf(dirArg.d[k] ?? dirArg.d[0]) : dirArg ? textOf(dirArg) : 'ascend'; return /^desc/i.test(d) ? -1 : 1; });
  const key = (name: string, i: number): number | string => { const col = T.f.get(name); if (!col) throw new LabError(`This table has no column “${name}”.`); return col.k === 'cell' ? textOf(col.d[i]) : col.k === 'mat' ? col.d[i] : 0; };
  const order = Array.from({ length: h }, (_, i) => i).sort((x, y) => {
    for (let k = 0; k < keys.length; k++) { const p = key(keys[k], x), q = key(keys[k], y); if (p !== q) return (p < q ? -1 : 1) * dirs[k]; }
    return x - y;
  });
  return [pick(T, order, 'all'), mat(h, 1, order.map((i) => i + 1))];
});
for (const [name, fromEnd] of [['head', false], ['tail', true]] as const) {
  def(name, (a) => {
    const v = a[0], k = a[1] ? scalar(a[1]) : 8;
    const h = v.k === 'mat' || v.k === 'cell' ? v.r : isTable(v) ? heightOf(v) : 1, n = Math.max(0, Math.min(h, k));
    const rows = Array.from({ length: n }, (_, i) => (fromEnd ? h - n + i : i));
    if (isTable(v)) return [pick(v, rows, 'all')];
    if (v.k === 'mat' || v.k === 'cell') return [columnRows(v, rows)];
    return [v];
  });
}
def('summary', (a, nout, lab) => {
  const T = needTable(a[0], 'summary'), h = heightOf(T);
  const lines = [`${h} rows, ${T.f.size} columns`, ''];
  for (const [n, col] of T.f) {
    if (col.k === 'mat') {
      const v = [...col.d].filter(Number.isFinite).sort((x, y) => x - y), miss = col.d.length - v.length;
      const med = v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : NaN;
      lines.push(`${n}: ${col.logical ? 'logical' : 'numbers'}`, `    Min ${fmt(v[0] ?? NaN)}   Median ${fmt(med)}   Max ${fmt(v[v.length - 1] ?? NaN)}   Mean ${fmt(v.reduce((s, x) => s + x, 0) / (v.length || NaN))}${miss ? `   Missing ${miss}` : ''}`);
    } else if (col.k === 'cell') {
      const counts = new Map<string, number>();
      for (const x of col.d) counts.set(cellText(x), (counts.get(cellText(x)) ?? 0) + 1);
      const top = [...counts].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([t, c]) => `${t || '(empty)'} ×${c}`).join(', ');
      lines.push(`${n}: text, ${counts.size} different`, `    Most often: ${top}`);
    }
  }
  if (nout > 0) return [str(lines.join('\n'))];
  lab.host.out(`${lines.join('\n')}\n`);
  return [];
});
def('addvars', (a) => {
  // addvars(T, v1, v2, …, 'NewVariableNames', {...}, 'Before' | 'After', name)
  const T = needTable(a[0], 'addvars'), h = heightOf(T);
  const ni = a.findIndex((v, i) => i > 0 && v.k === 'str' && /^(newvariablenames|before|after)$/i.test(v.v));
  const vals = a.slice(1, ni < 0 ? a.length : ni).map((v): Value => (v.k === 'mat' && v.r === 1 && v.c === h && h !== 1 ? mat(h, 1, v.d, v.logical) : v.k === 'cell' && v.r === 1 && v.c === h && h !== 1 ? { ...v, r: h, c: 1 } : v));
  for (const v of vals) if ((v.k === 'mat' || v.k === 'cell' ? v.r : 1) !== h) throw new LabError(`A new column must have ${h} rows, as the table does.`);
  const given = pickNames(T, opt(a, 'NewVariableNames'));
  const newNames = names([...colNames(T), ...vals.map((_, j) => given[j] ?? `Var${T.f.size + j + 1}`)]).slice(T.f.size);
  const cols = [...T.f], added = vals.map((v, j): [string, Value] => [newNames[j], v]);
  const before = opt(a, 'Before'), after = opt(a, 'After');
  const at = before ? colNames(T).indexOf(pickNames(T, before)[0]) : after ? colNames(T).indexOf(pickNames(T, after)[0]) + 1 : cols.length;
  return [table([...cols.slice(0, at), ...added, ...cols.slice(at)])];
});
def('removevars', (a) => { const T = needTable(a[0], 'removevars'), drop = new Set(pickNames(T, a[1])); return [table([...T.f].filter(([n]) => !drop.has(n)))]; });
def('renamevars', (a) => {
  const T = needTable(a[0], 'renamevars'), from = pickNames(T, a[1]), to = a[2]?.k === 'cell' ? a[2].d.map((v) => textOf(v)) : a[2] ? [textOf(a[2])] : [];
  if (from.length !== to.length) throw new LabError('renamevars needs as many new names as old ones.');
  return [table([...T.f].map(([n, v]) => [from.includes(n) ? to[from.indexOf(n)] : n, v]))];
});
def('movevars', (a) => {
  const T = needTable(a[0], 'movevars'), move = new Set(pickNames(T, a[1]));
  const rest = [...T.f].filter(([n]) => !move.has(n)), moving = [...T.f].filter(([n]) => move.has(n));
  const before = opt(a, 'Before'), after = opt(a, 'After');
  const at = before ? rest.findIndex(([n]) => n === pickNames(T, before)[0]) : after ? rest.findIndex(([n]) => n === pickNames(T, after)[0]) + 1 : rest.length;
  return [table([...rest.slice(0, at), ...moving, ...rest.slice(at)])];
});
const STATS: Record<string, (v: number[]) => number> = {
  mean: (v) => v.reduce((s, x) => s + x, 0) / v.length, sum: (v) => v.reduce((s, x) => s + x, 0), min: (v) => Math.min(...v), max: (v) => Math.max(...v),
  median: (v) => { const s = [...v].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; },
  std: (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); },
  var: (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1); },
  range: (v) => Math.max(...v) - Math.min(...v), nummissing: () => 0,
};
def('groupsummary', (a) => {
  // groupsummary(T, groupvars, method(s), datavars): one row per group, its count, and each method of each data column.
  const T = needTable(a[0], 'groupsummary'), h = heightOf(T);
  const groups = pickNames(T, a[1]);
  const methods = a[2] ? (a[2].k === 'cell' ? a[2].d.map((v) => textOf(v)) : [textOf(a[2])]).map((m) => m.toLowerCase()) : [];
  for (const m of methods) if (!STATS[m]) throw new LabError(`groupsummary's methods: ${Object.keys(STATS).join(', ')}.`);
  const data = a[3] ? pickNames(T, a[3]) : colNames(T).filter((n) => !groups.includes(n) && T.f.get(n)!.k === 'mat');
  const keyOfRow = (i: number) => JSON.stringify(groups.map((g) => { const c = T.f.get(g)!; return c.k === 'cell' ? textOf(c.d[i]) : c.k === 'mat' ? c.d[i] : ''; }));
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < h; i++) { const k = keyOfRow(i); byKey.set(k, [...(byKey.get(k) ?? []), i]); }
  const keys = [...byKey.keys()].sort();
  const first = keys.map((k) => byKey.get(k)![0]);
  const cols: [string, Value][] = groups.map((g) => [g, columnRows(T.f.get(g)!, first)]);
  cols.push(['GroupCount', mat(keys.length, 1, keys.map((k) => byKey.get(k)!.length))]);
  for (const m of methods) for (const d of data) {
    const col = T.f.get(d)!;
    if (col.k !== 'mat') throw new LabError(`The column “${d}” isn’t numbers.`);
    cols.push([`${m}_${d}`, mat(keys.length, 1, keys.map((k) => { const v = byKey.get(k)!.map((i) => col.d[i]); return m === 'nummissing' ? v.filter((x) => Number.isNaN(x)).length : STATS[m](v.filter((x) => !Number.isNaN(x))); }))]);
  }
  return [table(cols)];
});
function joinOn(a: Value[], kind: 'inner' | 'left' | 'outer'): Value[] {
  const L = needTable(a[0], 'join'), R = needTable(a[1], 'join');
  const keys = opt(a, 'Keys') ? pickNames(L, opt(a, 'Keys')) : colNames(L).filter((n) => R.f.has(n));
  if (!keys.length) throw new LabError('The tables share no column to join on: name one with \'Keys\'.');
  const keyAt = (T: Struct, i: number) => JSON.stringify(keys.map((k) => { const c = T.f.get(k); if (!c) throw new LabError(`Both tables need the key “${k}”.`); return c.k === 'cell' ? textOf(c.d[i]) : c.k === 'mat' ? c.d[i] : ''; }));
  const rIndex = new Map<string, number[]>();
  for (let i = 0; i < heightOf(R); i++) { const k = keyAt(R, i); rIndex.set(k, [...(rIndex.get(k) ?? []), i]); }
  const pairs: [number, number][] = [], usedR = new Set<number>();
  for (let i = 0; i < heightOf(L); i++) {
    const m = rIndex.get(keyAt(L, i));
    if (m) for (const j of m) { pairs.push([i, j]); usedR.add(j); }
    else if (kind !== 'inner') pairs.push([i, -1]);
  }
  if (kind === 'outer') for (let j = 0; j < heightOf(R); j++) if (!usedR.has(j)) pairs.push([-1, j]);
  const take = (col: Value, rows: number[]): Value => {
    const safe = rows.map((i) => Math.max(0, i)), got = columnRows(col, safe);
    // A missing match is NaN (numbers) or empty text.
    if (got.k === 'mat') rows.forEach((i, q) => { if (i < 0) for (let c = 0; c < got.c; c++) got.d[q + c * got.r] = NaN; });
    if (got.k === 'cell') rows.forEach((i, q) => { if (i < 0) got.d[q] = str(''); });
    return got;
  };
  const cols: [string, Value][] = [...L.f].map(([n, c]) => [n, take(c, pairs.map(([i]) => i))]);
  // Keys from the right table fill rows only it has.
  for (const k of keys) { const c = cols.find(([n]) => n === k)!, rk = take(R.f.get(k)!, pairs.map(([, j]) => j)); pairs.forEach(([i], q) => { if (i < 0) { if (c[1].k === 'mat' && rk.k === 'mat') c[1].d[q] = rk.d[q]; if (c[1].k === 'cell' && rk.k === 'cell') c[1].d[q] = rk.d[q]; } }); }
  for (const [n, c] of R.f) if (!keys.includes(n)) cols.push([L.f.has(n) ? `${n}_right` : n, take(c, pairs.map(([, j]) => j))]);
  return [table(cols)];
}
def('join', (a) => joinOn(a, 'left'));
def('innerjoin', (a) => joinOn(a, 'inner'));
def('outerjoin', (a) => joinOn(a, 'outer'));
def('cell2table', (a) => {
  const C = a[0];
  if (C.k !== 'cell') throw new LabError('cell2table needs a cell array.');
  const given = pickNamesFree(opt(a, 'VariableNames'));
  return [table(names(Array.from({ length: C.c }, (_, j) => given[j] ?? `Var${j + 1}`)).map((n, j) => {
    const items = Array.from({ length: C.r }, (_, i) => C.d[i + j * C.r]);
    return [n, items.every((x) => x.k === 'mat' && x.d.length === 1) ? mat(C.r, 1, items.map((x) => (x as Mat).d[0])) : { k: 'cell', r: C.r, c: 1, d: items } as Cell];
  }))];
});
const pickNamesFree = (v: Value | undefined) => (v?.k === 'cell' ? v.d.map((x) => textOf(x)) : v ? [textOf(v)] : []);
def('table2cell', (a) => {
  const T = needTable(a[0], 'table2cell'), h = heightOf(T), cols = [...T.f.values()];
  return [{ k: 'cell', r: h, c: cols.length, d: cols.flatMap((c) => Array.from({ length: h }, (_, i): Value => (c.k === 'cell' ? c.d[i] : c.k === 'mat' ? mat(1, 1, [c.d[i]]) : c))) }];
});
def('struct2table', (a) => {
  const S = a[0];
  if (S.k !== 'struct') throw new LabError('struct2table needs a struct of columns.');
  return [table([...S.f].map(([n, v]): [string, Value] => [n, v.k === 'mat' && v.r === 1 && v.c > 1 ? mat(v.c, 1, v.d, v.logical) : v]))];
});
def('table2struct', (a) => { const T = needTable(a[0], 'table2struct'); return [{ k: 'struct', f: new Map(T.f) }]; });
