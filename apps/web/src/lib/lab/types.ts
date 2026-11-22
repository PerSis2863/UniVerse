import { LabError } from './parse';
import type { Mat } from './values';

// Hyperion's number types (M386): MATLAB's whole-number types (int8 … uint64) and single. A Mat with `cls` keeps
// its numbers as doubles that are always whole and inside the type's range: anything put in is rounded (halves away
// from zero) and held at the ends (saturation), NaN becomes 0, as MATLAB does. single rounds to 32-bit floats.

export type NumClass = 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'single';
type IntClass = Exclude<NumClass, 'single'>;
export const RANGE: Record<IntClass, [number, number]> = {
  int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
  int32: [-2147483648, 2147483647], uint32: [0, 4294967295], int64: [-9223372036854775808, 9223372036854775807], uint64: [0, 18446744073709551615],
};
export const CLASSES = [...Object.keys(RANGE), 'single'] as NumClass[];
export const isNumClass = (s: string): s is NumClass => (CLASSES as string[]).includes(s);
export const isInt = (c: NumClass | undefined): c is IntClass => !!c && c !== 'single';

export function castOne(x: number, cls: NumClass): number {
  if (cls === 'single') return Math.fround(x);
  if (Number.isNaN(x)) return 0;
  const [lo, hi] = RANGE[cls];
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  return Math.min(hi, Math.max(lo, r));
}
/** The matrix as that type (undefined: back to double). */
export function cast(m: Mat, cls: NumClass | undefined): Mat {
  const rest: Mat = { ...m, cls: undefined };
  if (!cls) return { ...rest, logical: undefined };
  if (cls !== 'single' && m.im) throw new LabError(`Complex numbers can’t be ${cls} here.`);
  const out: Mat = { ...rest, d: m.d.map((x) => castOne(x, cls)), cls, logical: undefined };
  if (m.im) out.im = m.im.map((x) => castOne(x, cls));
  return out;
}
/** The type an arithmetic result takes: a whole-number type wins over double and single; two different ones refuse. */
export function resultClass(a: Mat, b: Mat): NumClass | undefined {
  const x = a.cls, y = b.cls;
  if (x && y && x !== y) {
    if (x === 'single') return y;
    if (y === 'single') return x;
    throw new LabError(`${x} and ${y} can’t be combined: convert one first, like ${x}(b).`);
  }
  return x ?? y;
}
/** Picture values from 0 to 1: uint8 / uint16 by their range, other numbers over 1 taken as 0–255. */
export function unitValues(m: Mat): number[] {
  const v = [...m.d];
  if (m.cls === 'uint8') return v.map((t) => t / 255);
  if (m.cls === 'uint16') return v.map((t) => t / 65535);
  if (isInt(m.cls)) { const [lo, hi] = RANGE[m.cls]; return v.map((t) => (t - lo) / (hi - lo)); }
  const top = Math.max(...v.filter(Number.isFinite), 0);
  return top > 1 ? v.map((t) => t / 255) : v;
}
