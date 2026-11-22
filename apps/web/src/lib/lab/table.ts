import { LabError } from './parse';
import { mat, str, type Cell, type Mat, type Struct, type Value } from './values';

// Hyperion's tables (M383, rows and columns M385): a struct whose fields are columns of one height, marked as a
// table. A column is numbers (a column vector, or a matrix with several columns), a cell column of text, or logical.
// These helpers are pure so the interpreter can index tables (T(rows, cols), T{rows, cols}) without importing builtins.

export const isTable = (v: Value | undefined): v is Struct => v?.k === 'struct' && !!v.table;
export const table = (cols: [string, Value][]): Struct => ({ k: 'struct', f: new Map(cols), table: true });
const rowsIn = (v: Value) => (v.k === 'mat' || v.k === 'cell' ? v.r : v.k === 'str' ? 1 : 1);
export const heightOf = (t: Struct) => { const v = [...t.f.values()][0]; return v ? rowsIn(v) : 0; };
export const names = (t: Struct) => [...t.f.keys()];

/** Column positions from a ':'-free index value: numbers, logicals, a name, or a cell of names. */
export function colPositions(t: Struct, v: Value): number[] | null {
  const all = names(t);
  const find = (n: string) => { const k = all.indexOf(n); if (k < 0) throw new LabError(`This table has no column “${n}” (its columns: ${all.join(', ')}).`); return k; };
  if (v.k === 'str') return v.v === ':' ? null : [find(v.v)];
  if (v.k === 'cell') return v.d.map((x) => { if (x.k !== 'str') throw new LabError('Column names in { } must be text.'); return find(x.v); });
  return null;
}

/** Rows `rows` (0-based) of one column. */
export function columnRows(v: Value, rows: number[]): Value {
  if (v.k === 'cell') return { k: 'cell', r: rows.length, c: v.c, d: Array.from({ length: rows.length * v.c }, (_, k) => v.d[rows[k % rows.length] + Math.floor(k / rows.length) * v.r]) } satisfies Cell;
  if (v.k === 'mat') {
    const o = mat(rows.length, v.c, undefined, v.logical);
    for (let j = 0; j < v.c; j++) rows.forEach((i, q) => { o.d[q + j * rows.length] = v.d[i + j * v.r]; });
    return o;
  }
  return v;
}
function checkRows(t: Struct, rows: number[]) {
  const h = heightOf(t);
  for (const i of rows) if (i >= h) throw new LabError(`Row ${i + 1} is past the end: this table has ${h} rows.`);
}
/** T(rows, cols): a smaller table. */
export function pick(t: Struct, rows: number[] | 'all', cols: number[] | 'all'): Struct {
  const all = [...t.f], h = heightOf(t);
  const rs = rows === 'all' ? Array.from({ length: h }, (_, i) => i) : rows;
  checkRows(t, rs);
  const cs = cols === 'all' ? all.map((_, j) => j) : cols;
  for (const j of cs) if (j >= all.length) throw new LabError(`Column ${j + 1} is past the end: this table has ${all.length}.`);
  return table(cs.map((j) => [all[j][0], columnRows(all[j][1], rs)]));
}
/** T{rows, cols}: the values themselves (columns of numbers joined side by side). */
export function contents(t: Struct, rows: number[] | 'all', cols: number[] | 'all'): Value {
  const sub = [...pick(t, rows, cols).f.values()];
  if (sub.length === 1) return sub[0];
  if (sub.every((v) => v.k === 'mat')) {
    const h = (sub[0] as Mat).r, o = mat(h, sub.reduce((s, v) => s + (v as Mat).c, 0));
    let at = 0;
    for (const v of sub as Mat[]) { o.d.set(v.d.subarray(0, h * v.c), at * h); at += v.c; }
    return o;
  }
  if (sub.every((v) => v.k === 'cell')) { const h = (sub[0] as Cell).r; return { k: 'cell', r: h, c: sub.length, d: sub.flatMap((v) => (v as Cell).d) }; }
  throw new LabError('Those columns mix numbers and text: take them one at a time, or with ( ) as a table.');
}
/** T(rows, :) = [] and T(:, cols) = []. */
export function remove(t: Struct, rows: number[] | 'all', cols: number[] | 'all'): Struct {
  const all = [...t.f], h = heightOf(t);
  if (rows !== 'all' && cols === 'all') { checkRows(t, rows); const drop = new Set(rows); return pick(t, Array.from({ length: h }, (_, i) => i).filter((i) => !drop.has(i)), 'all'); }
  if (rows === 'all' && cols !== 'all') { const drop = new Set(cols); return table(all.filter((_, j) => !drop.has(j))); }
  throw new LabError('To delete from a table, delete whole rows, T(rows, :) = [], or whole columns, T(:, cols) = [].');
}
/** T{rows, col} = v: changes those values of one column. */
export function setValues(t: Struct, rows: number[] | 'all', cols: number[] | 'all', v: Value): Struct {
  const all = [...t.f], h = heightOf(t);
  const cs = cols === 'all' ? all.map((_, j) => j) : cols;
  if (cs.length !== 1) throw new LabError('Change one column at a time: T{rows, \'name\'} = values.');
  const rs = rows === 'all' ? Array.from({ length: h }, (_, i) => i) : rows;
  checkRows(t, rs);
  const [name, col] = all[cs[0]];
  let next: Value;
  if (col.k === 'cell') {
    const vals = v.k === 'cell' ? v.d : [v];
    const d = [...col.d];
    rs.forEach((i, q) => { d[i] = vals.length === 1 ? vals[0] : vals[q]; });
    next = { ...col, d };
  } else if (col.k === 'mat' && v.k === 'mat') {
    if (v.d.length !== 1 && v.d.length !== rs.length) throw new LabError(`Sizes don’t match: ${rs.length} rows to fill but ${v.d.length} values given.`);
    const d = Float64Array.from(col.d);
    rs.forEach((i, q) => { d[i] = v.d.length === 1 ? v.d[0] : v.d[q]; });
    next = { ...col, d };
  } else throw new LabError(`The column “${name}” holds ${col.k === 'mat' ? 'numbers' : 'text'}.`);
  return table(all.map(([n, c], j) => [n, j === cs[0] ? next : c]));
}
/** [T1; T2] (rows under rows, same columns) and [T1, T2] (columns side by side, same height). */
export function joinTables(rows: Struct[][]): Struct {
  const side = rows.map((r) => r.reduce((a, b) => {
    if (heightOf(a) !== heightOf(b)) throw new LabError('Tables put side by side must have the same number of rows.');
    for (const n of names(b)) if (a.f.has(n)) throw new LabError(`Both tables have a column “${n}”.`);
    return table([...a.f, ...b.f]);
  }));
  return side.reduce((a, b) => {
    const na = names(a), nb = names(b);
    if (na.length !== nb.length || na.some((n) => !b.f.has(n))) throw new LabError('Tables stacked with ; must have the same columns.');
    return table(na.map((n) => [n, stackColumn(a.f.get(n)!, b.f.get(n)!)]));
  });
}
function stackColumn(a: Value, b: Value): Value {
  if (a.k === 'cell' && b.k === 'cell') return { k: 'cell', r: a.r + b.r, c: a.c, d: Array.from({ length: (a.r + b.r) * a.c }, (_, k) => { const i = k % (a.r + b.r), j = Math.floor(k / (a.r + b.r)); return i < a.r ? a.d[i + j * a.r] : b.d[i - a.r + j * b.r]; }) };
  if (a.k === 'mat' && b.k === 'mat' && a.c === b.c) {
    const r = a.r + b.r, o = mat(r, a.c, undefined, a.logical && b.logical);
    for (let j = 0; j < a.c; j++) { for (let i = 0; i < a.r; i++) o.d[i + j * r] = a.d[i + j * a.r]; for (let i = 0; i < b.r; i++) o.d[a.r + i + j * r] = b.d[i + j * b.r]; }
    return o;
  }
  throw new LabError('A column of numbers can’t be stacked on a column of text.');
}
/** T.Properties: the column names (and the empty row names), as MATLAB shows them. */
export function properties(t: Struct): Struct {
  return { k: 'struct', f: new Map<string, Value>([['VariableNames', { k: 'cell', r: 1, c: t.f.size, d: names(t).map((n) => str(n)) }], ['RowNames', { k: 'cell', r: 0, c: 0, d: [] }]]) };
}
/** T.Properties.VariableNames = {...}: the same columns under new names. */
export function renamed(t: Struct, props: Value): Struct {
  if (props.k !== 'struct') throw new LabError('T.Properties holds VariableNames.');
  const v = props.f.get('VariableNames');
  if (!v || v.k !== 'cell' || v.d.length !== t.f.size) throw new LabError(`VariableNames needs ${t.f.size} names in a cell, like {'a', 'b'}.`);
  const ns = v.d.map((x) => { if (x.k !== 'str' || !/^[A-Za-z]\w*$/.test(x.v)) throw new LabError('Column names start with a letter and use letters, digits and _.'); return x.v; });
  if (new Set(ns).size !== ns.length) throw new LabError('Column names must differ.');
  return table([...t.f.values()].map((c, j) => [ns[j], c]));
}
