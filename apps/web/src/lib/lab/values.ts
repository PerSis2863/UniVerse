import { LabError } from './parse';
import type { Expr } from './parse';

// UniVerse Lab's values (M374): numeric and logical matrices stored column by column (as MATLAB and Octave do, so
// linear indexing and reshape behave the same), text, cell arrays, structs and function handles.

/** `im`: the imaginary parts of a complex matrix (M377), the same length as `d`; absent for real ones. `p`: the
 * pages of a 3D array (M382; r × c × p, page after page in `d`); absent for a plain matrix. */
export interface Mat { k: 'mat'; r: number; c: number; p?: number; d: Float64Array; logical?: boolean; im?: Float64Array }
export interface Str { k: 'str'; v: string }
export interface Cell { k: 'cell'; r: number; c: number; d: Value[] }
/** `table`: a table (M383): a struct whose fields are equal-height columns, shown as rows. */
export interface Struct { k: 'struct'; f: Map<string, Value>; table?: boolean }
export interface Fn { k: 'fn'; name?: string; params?: string[]; body?: Expr; src?: string; closure?: Map<string, Value> }
export type Value = Mat | Str | Cell | Struct | Fn;

/** A matrix; numbers for more than r × c (a whole number of times) make a 3D array with that many pages, so any
 * code that maps over `d` keeps the pages. */
export const mat = (r: number, c: number, d?: ArrayLike<number>, logical?: boolean): Mat => {
  const n = r * c, len = d ? d.length : n, p = n > 0 && len > n && len % n === 0 ? len / n : 1;
  return { k: 'mat', r, c, ...(p > 1 ? { p } : {}), d: d ? Float64Array.from(d) : new Float64Array(n), ...(logical ? { logical } : {}) };
};
/** The number of pages (1 for a plain matrix). */
export const pages = (v: Value) => (v.k === 'mat' ? v.p ?? 1 : 1);
/** Page k (from 0) of a 3D array, as a matrix. */
export const page = (m: Mat, k: number): Mat => {
  const n = m.r * m.c, out = mat(m.r, m.c, m.d.subarray(k * n, (k + 1) * n), m.logical);
  if (m.im) out.im = Float64Array.from(m.im.subarray(k * n, (k + 1) * n));
  return out;
};
/** Matrices of one size, as the pages of a 3D array. */
export function stack(list: Mat[]): Mat {
  if (list.length === 1) return list[0];
  const { r, c } = list[0];
  if (list.some((m) => m.r !== r || m.c !== c)) throw new LabError('Every page must be the same size.');
  const d = new Float64Array(r * c * list.length), im = list.some((m) => m.im) ? new Float64Array(d.length) : null;
  list.forEach((m, k) => { d.set(m.d.subarray(0, r * c), k * r * c); if (im && m.im) im.set(m.im.subarray(0, r * c), k * r * c); });
  const out = mat(r, c, d, list.every((m) => m.logical));
  if (im) out.im = im;
  return out;
}
export const num = (v: number): Mat => mat(1, 1, [v]);
/** A complex matrix; back to a real one when every imaginary part is 0 (as MATLAB shows it). */
export const cmat = (r: number, c: number, re: ArrayLike<number>, im: ArrayLike<number>): Mat => {
  const m = mat(r, c, re);
  for (let k = 0; k < m.d.length; k++) if (im[k] !== 0) { m.im = Float64Array.from(im); break; }
  return m;
};
export const isComplex = (v: Value): boolean => v.k === 'mat' && !!v.im;
/** The imaginary parts (zeros for a real matrix). */
export const imOf = (m: Mat) => m.im ?? new Float64Array(m.d.length);
export const bool = (v: boolean): Mat => mat(1, 1, [v ? 1 : 0], true);
export const str = (v: string): Str => ({ k: 'str', v });
export const empty = (): Mat => mat(0, 0);
export const row = (vs: number[]): Mat => mat(1, vs.length, vs);
export const col = (vs: number[]): Mat => mat(vs.length, 1, vs);

/** The value as numbers (text becomes its character codes, as in MATLAB). */
export function toMat(v: Value, what = 'This'): Mat {
  if (v.k === 'mat') return v;
  if (v.k === 'str') return mat(v.v.length ? 1 : 0, v.v.length, [...v.v].map((ch) => ch.charCodeAt(0)));
  throw new LabError(`${what} must be a number or a matrix, not ${kind(v)}.`);
}
export const isScalar = (m: Mat) => m.r === 1 && m.c === 1;
export const numel = (v: Value) => (v.k === 'mat' ? v.r * v.c * (v.p ?? 1) : v.k === 'cell' ? v.r * v.c : v.k === 'str' ? v.v.length : 1);
export function scalar(v: Value, what = 'This'): number {
  const m = toMat(v, what);
  if (m.r * m.c < 1) throw new LabError(`${what} is empty: it needs one number.`);
  return m.d[0];
}
export const truthy = (v: Value): boolean => {
  if (v.k === 'mat' && v.im) { const im = v.im; return v.d.length > 0 && v.d.every((x, k) => x !== 0 || im[k] !== 0); }
  if (v.k === 'str') return v.v.length > 0 && [...v.v].every((ch) => ch.charCodeAt(0) !== 0);
  const m = toMat(v);
  return m.d.length > 0 && m.d.every((x) => x !== 0 && !Number.isNaN(x));
};
export const at = (m: Mat, i: number, j: number) => m.d[i + j * m.r];
export const sizeOf = (v: Value): [number, number] => (v.k === 'mat' || v.k === 'cell' ? [v.r, v.c] : v.k === 'str' ? [v.v.length ? 1 : 0, v.v.length] : [1, 1]);

export function kind(v: Value): string {
  switch (v.k) {
    case 'mat': return v.logical ? 'logical' : 'double';
    case 'str': return 'char';
    case 'cell': return 'cell';
    case 'struct': return v.table ? 'table' : 'struct';
    case 'fn': return 'function_handle';
  }
}

// ——— Printing, as MATLAB's "format short" (or "format long") ———

export interface Fmt { long: boolean }

/** A complex number as "3 + 4i" (whole parts) or "0.5000 - 1.2500i". */
export const fmtC = (re: number, im: number, f: Fmt) => {
  const whole = Number.isInteger(re) && Number.isInteger(im);
  return `${fmtNum(re, f, whole)} ${im < 0 || Object.is(im, -0) ? '-' : '+'} ${fmtNum(Math.abs(im), f, whole)}i`;
};
export const fmtNum = (x: number, f: Fmt, int: boolean) => {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
  if (int) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 1e-4)) return x.toExponential(f.long ? 15 : 4).replace(/e([+-])(\d)$/, 'e$10$2');
  return x.toFixed(f.long ? 15 : 4);
};

/** How a value is shown after "x = …". */
export function show(name: string, v: Value, f: Fmt): string {
  if (v.k === 'mat' && (v.p ?? 1) > 1) return Array.from({ length: v.p! }, (_, k) => `${name}(:,:,${k + 1}) =\n\n${render(page(v, k), f)}\n\n`).join('');
  if (v.k === 'mat' && v.r * v.c === 1) return `${name} = ${v.im ? fmtC(v.d[0], v.im[0], f) : fmtNum(v.d[0], f, !!v.logical || Number.isInteger(v.d[0]))}\n`;
  const body = render(v, f);
  if (v.k === 'str' && !v.v.includes('\n')) return `${name} = ${v.v}\n`;
  if (v.k === 'fn') return `${name} =\n\n${body}\n\n`;
  return `${name} =\n\n${body}\n\n`;
}

export function render(v: Value, f: Fmt): string {
  if (v.k === 'mat' && (v.p ?? 1) > 1) return Array.from({ length: v.p! }, (_, k) => `(:,:,${k + 1}) =\n\n${render(page(v, k), f)}`).join('\n\n');
  switch (v.k) {
    case 'str': return v.v;
    case 'fn': return v.src ? `@${v.src}` : `@${v.name}`;
    case 'struct': return v.table ? tableText(v, f) : [...v.f].map(([k, x]) => `    ${k}: ${inline(x, f)}`).join('\n') || '    (no fields)';
    case 'cell': {
      if (!v.d.length) return `{}(${v.r}x${v.c})`;
      const cells = Array.from({ length: v.r }, (_, i) => Array.from({ length: v.c }, (_, j) => `[${inline(v.d[i + j * v.r], f)}]`));
      const w = Math.max(...cells.flat().map((s) => s.length));
      return cells.map((r) => `  ${r.map((s) => s.padStart(w)).join('  ')}`).join('\n');
    }
    case 'mat': {
      if (!v.d.length) return `[](${v.r}x${v.c})`;
      if (v.im) {
        const cells = [...v.d].map((x, k) => fmtC(x, v.im![k], f));
        const w = Math.max(...cells.map((s) => s.length));
        return Array.from({ length: v.r }, (_, i) => `  ${Array.from({ length: v.c }, (_, j) => cells[i + j * v.r].padStart(w)).join('   ')}`).join('\n');
      }
      if (v.logical || v.d.every((x) => Number.isInteger(x) || !Number.isFinite(x))) {
        const cells = [...v.d].map((x) => fmtNum(x, f, true));
        const w = Math.max(...cells.map((s) => s.length));
        return Array.from({ length: v.r }, (_, i) => `  ${Array.from({ length: v.c }, (_, j) => cells[i + j * v.r].padStart(w)).join('  ')}`).join('\n');
      }
      // Several columns of decimals share one scale, as MATLAB prints them.
      const finite = [...v.d].filter(Number.isFinite), big = Math.max(...finite.map(Math.abs), 0);
      const scale = big >= 1e5 || (big < 1e-3 && big > 0) ? 10 ** Math.floor(Math.log10(big)) : 1;
      const digits = f.long ? 15 : 4;
      const cells = [...v.d].map((x) => (Number.isFinite(x) ? (x / scale).toFixed(digits) : fmtNum(x, f, true)));
      const w = Math.max(...cells.map((s) => s.length));
      const head = scale !== 1 ? `  ${scale.toExponential(0).replace(/e([+-])(\d)$/, 'e$10$2').replace(/^1e/, '1.0e')} *\n\n` : '';
      return head + Array.from({ length: v.r }, (_, i) => `  ${Array.from({ length: v.c }, (_, j) => cells[i + j * v.r].padStart(w)).join('   ')}`).join('\n');
    }
  }
}

/** One short line for a value inside a cell or struct, or in the workspace list. */
export function inline(v: Value, f: Fmt = { long: false }): string {
  switch (v.k) {
    case 'str': return `'${v.v}'`;
    case 'fn': return render(v, f);
    case 'struct': return v.table ? `${tableHeight(v)}x${v.f.size} table` : `1x1 struct`;
    case 'cell': return `${v.r}x${v.c} cell`;
    case 'mat':
      if ((v.p ?? 1) > 1) return `${v.r}x${v.c}x${v.p} ${v.im ? 'complex double' : kind(v)}`;
      if (v.im) return v.r * v.c === 1 ? fmtC(v.d[0], v.im[0], f) : `${v.r}x${v.c} complex double`;
      if (v.r * v.c === 1) return fmtNum(v.d[0], f, v.logical || Number.isInteger(v.d[0]));
      if (v.r * v.c <= 10 && v.r <= 1) return `[${[...v.d].map((x) => fmtNum(x, f, v.logical || Number.isInteger(x))).join(' ')}]`;
      return `${v.r}x${v.c} ${kind(v)}`;
  }
}

const tableHeight = (t: Struct) => { const v = [...t.f.values()][0]; return v ? (v.k === 'mat' || v.k === 'cell' ? v.r : 1) : 0; };
/** A table as rows under its column names (the first 20 rows, then how many more). */
function tableText(t: Struct, f: Fmt): string {
  const cols = [...t.f], h = tableHeight(t), show = Math.min(h, 20);
  const cell = (v: Value, i: number) => (v.k === 'cell' ? inline(v.d[i] ?? mat(0, 0), f).replace(/^'|'$/g, '') : v.k === 'mat' ? (v.c > 1 ? `[${Array.from({ length: v.c }, (_, j) => fmtNum(v.d[i + j * v.r], f, Number.isInteger(v.d[i + j * v.r]))).join(' ')}]` : fmtNum(v.d[i], f, !!v.logical || Number.isInteger(v.d[i]))) : inline(v, f));
  const grid = [cols.map(([n]) => n), ...Array.from({ length: show }, (_, i) => cols.map(([, v]) => cell(v, i)))];
  const w = cols.map((_, j) => Math.max(...grid.map((r) => r[j].length)));
  const line = (r: string[]) => `    ${r.map((x, j) => x.padStart(w[j])).join('    ')}`;
  return [line(grid[0]), `    ${w.map((n) => '_'.repeat(n)).join('    ')}`, '', ...grid.slice(1).map(line), ...(h > show ? [`    … ${h - show} more rows`] : [])].join('\n');
}
