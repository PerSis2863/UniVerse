import { LabError } from './parse';
import type { Expr } from './parse';

// UniVerse Lab's values (M374): numeric and logical matrices stored column by column (as MATLAB and Octave do, so
// linear indexing and reshape behave the same), text, cell arrays, structs and function handles.

export interface Mat { k: 'mat'; r: number; c: number; d: Float64Array; logical?: boolean }
export interface Str { k: 'str'; v: string }
export interface Cell { k: 'cell'; r: number; c: number; d: Value[] }
export interface Struct { k: 'struct'; f: Map<string, Value> }
export interface Fn { k: 'fn'; name?: string; params?: string[]; body?: Expr; src?: string; closure?: Map<string, Value> }
export type Value = Mat | Str | Cell | Struct | Fn;

export const mat = (r: number, c: number, d?: ArrayLike<number>, logical?: boolean): Mat => ({ k: 'mat', r, c, d: d ? Float64Array.from(d) : new Float64Array(r * c), ...(logical ? { logical } : {}) });
export const num = (v: number): Mat => mat(1, 1, [v]);
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
export const numel = (v: Value) => (v.k === 'mat' || v.k === 'cell' ? v.r * v.c : v.k === 'str' ? v.v.length : 1);
export function scalar(v: Value, what = 'This'): number {
  const m = toMat(v, what);
  if (m.r * m.c < 1) throw new LabError(`${what} is empty: it needs one number.`);
  return m.d[0];
}
export const truthy = (v: Value): boolean => {
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
    case 'struct': return 'struct';
    case 'fn': return 'function_handle';
  }
}

// ——— Printing, as MATLAB's "format short" (or "format long") ———

export interface Fmt { long: boolean }

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
  if (v.k === 'mat' && v.r * v.c === 1) return `${name} = ${fmtNum(v.d[0], f, !!v.logical || Number.isInteger(v.d[0]))}\n`;
  const body = render(v, f);
  if (v.k === 'str' && !v.v.includes('\n')) return `${name} = ${v.v}\n`;
  if (v.k === 'fn') return `${name} =\n\n${body}\n\n`;
  return `${name} =\n\n${body}\n\n`;
}

export function render(v: Value, f: Fmt): string {
  switch (v.k) {
    case 'str': return v.v;
    case 'fn': return v.src ? `@${v.src}` : `@${v.name}`;
    case 'struct': return [...v.f].map(([k, x]) => `    ${k}: ${inline(x, f)}`).join('\n') || '    (no fields)';
    case 'cell': {
      if (!v.d.length) return `{}(${v.r}x${v.c})`;
      const cells = Array.from({ length: v.r }, (_, i) => Array.from({ length: v.c }, (_, j) => `[${inline(v.d[i + j * v.r], f)}]`));
      const w = Math.max(...cells.flat().map((s) => s.length));
      return cells.map((r) => `  ${r.map((s) => s.padStart(w)).join('  ')}`).join('\n');
    }
    case 'mat': {
      if (!v.d.length) return `[](${v.r}x${v.c})`;
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
    case 'struct': return `1x1 struct`;
    case 'cell': return `${v.r}x${v.c} cell`;
    case 'mat':
      if (v.r * v.c === 1) return fmtNum(v.d[0], f, v.logical || Number.isInteger(v.d[0]));
      if (v.r * v.c <= 10 && v.r <= 1) return `[${[...v.d].map((x) => fmtNum(x, f, v.logical || Number.isInteger(x))).join(' ')}]`;
      return `${v.r}x${v.c} ${kind(v)}`;
  }
}
