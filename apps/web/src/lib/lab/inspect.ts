import { LabError } from './parse';
import { fmtC, fmtNum, inline, kind, pages, sizeOf, type Fmt, type Value, symPlain } from './values';

// Hyperion's variable viewer (M390): a value seen as a grid of its numbers (a window of a big one, one page of a
// 3D one), the fields of a struct, the items of a cell or the columns of a table, each one opened by a path.

/** A step into a value: a field (s.a, T.col) or a cell item (c{i, j}). */
export type Step = { field: string } | { item: [number, number] };
export type View =
  | { kind: 'grid'; r: number; c: number; pages: number; page: number; from: [number, number]; cells: string[][]; cls: string; editable: boolean; stats: [string, string][] }
  | { kind: 'fields'; items: { name: string; summary: string; open: boolean }[] }
  | { kind: 'cells'; r: number; c: number; items: { at: [number, number]; summary: string; open: boolean }[] }
  | { kind: 'table'; names: string[]; rows: string[][]; height: number; from: number }
  | { kind: 'text'; text: string };

export const ROWS = 200, COLS = 40;
const F: Fmt = { long: false };

/** The value at a path (and the MATLAB expression for it, to write edits back). */
export function resolve(root: Value, name: string, steps: Step[]): { value: Value; expr: string } {
  let v = root, expr = name;
  for (const s of steps) {
    if ('field' in s) {
      if (v.k !== 'struct' || !v.f.has(s.field)) throw new LabError(`${expr} has no ${s.field}.`);
      v = v.f.get(s.field)!; expr += `.${s.field}`;
    } else {
      if (v.k !== 'cell') throw new LabError(`${expr} isn’t a cell.`);
      const [i, j] = s.item;
      if (i >= v.r || j >= v.c) throw new LabError(`${expr} has no item {${i + 1}, ${j + 1}}.`);
      v = v.d[i + j * v.r]; expr += `{${i + 1},${j + 1}}`;
    }
  }
  return { value: v, expr };
}
const openable = (v: Value) => v.k === 'struct' || v.k === 'cell' || (v.k === 'mat' && v.r * v.c > 1);

export function view(v: Value, page = 0, from: [number, number] = [0, 0]): View {
  if (v.k === 'struct' && v.table) {
    const cols = [...v.f], h = sizeOf(v)[0], r0 = Math.max(0, Math.min(from[0], Math.max(0, h - 1)));
    const rows = Array.from({ length: Math.min(ROWS, h - r0) }, (_, q) => cols.map(([, c]) => {
      const i = r0 + q;
      if (c.k === 'cell') return inline(c.d[i] ?? { k: 'mat', r: 0, c: 0, d: new Float64Array() }, F).replace(/^'|'$/g, '');
      if (c.k === 'mat') return c.c > 1 ? Array.from({ length: c.c }, (_, j) => fmtNum(c.d[i + j * c.r], F, Number.isInteger(c.d[i + j * c.r]))).join(' ') : c.im ? fmtC(c.d[i], c.im[i], F) : fmtNum(c.d[i], F, !!c.logical || Number.isInteger(c.d[i]));
      return inline(c, F);
    }));
    return { kind: 'table', names: cols.map(([n]) => n), rows, height: h, from: r0 };
  }
  if (v.k === 'struct') return { kind: 'fields', items: [...v.f].map(([name, x]) => ({ name, summary: inline(x, F), open: openable(x) })) };
  if (v.k === 'cell') return { kind: 'cells', r: v.r, c: v.c, items: v.d.map((x, k) => ({ at: [k % v.r, Math.floor(k / v.r)] as [number, number], summary: inline(x, F), open: openable(x) })) };
  if (v.k === 'str') return { kind: 'text', text: v.v };
  if (v.k === 'fn') return { kind: 'text', text: inline(v, F) };
  if (v.k === 'sym') return { kind: 'text', text: symPlain(v) };
  const P = pages(v), pg = Math.max(0, Math.min(P - 1, page)), n = v.r * v.c;
  const r0 = Math.max(0, Math.min(from[0], Math.max(0, v.r - 1))), c0 = Math.max(0, Math.min(from[1], Math.max(0, v.c - 1)));
  const cells = Array.from({ length: Math.min(ROWS, v.r - r0) }, (_, i) => Array.from({ length: Math.min(COLS, v.c - c0) }, (_, j) => {
    const k = r0 + i + (c0 + j) * v.r + pg * n, x = v.d[k];
    return v.im ? fmtC(x, v.im[k], F) : fmtNum(x, F, !!v.logical || Number.isInteger(x));
  }));
  // A few figures about the numbers (all pages), as MATLAB's workspace shows them.
  const fin = [...v.d].filter(Number.isFinite);
  const stats: [string, string][] = fin.length && !v.im ? [
    ['Min', fmtNum(Math.min(...fin), F, Number.isInteger(Math.min(...fin)))], ['Max', fmtNum(Math.max(...fin), F, Number.isInteger(Math.max(...fin)))],
    ['Mean', fmtNum(fin.reduce((s, x) => s + x, 0) / fin.length, F, false)], ...(fin.length < v.d.length ? [['Not numbers', String(v.d.length - fin.length)] as [string, string]] : []),
  ] : [];
  return { kind: 'grid', r: v.r, c: v.c, pages: P, page: pg, from: [r0, c0], cells, cls: kind(v), editable: !v.im, stats };
}
