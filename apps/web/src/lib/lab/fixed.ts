import { LabError } from './parse';

// Hyperion's fixed-point numbers (M480): a value kept as a whole number of steps of 2^-fractionLength in a word of
// wordLength bits, signed or not, as an embedded processor or an FPGA holds it. Rounding to the nearest step (halves
// up, MATLAB's 'Nearest') and holding the range ('saturate'). Sums and products grow their words so nothing is lost,
// as MATLAB's full precision does. Our own code.

// M530: a type may carry MATLAB's fimath: how a value is rounded to a step (rm) and what happens past the range (om).
// Left out, they are Nearest and Saturate (as before). Sums and products stay full precision, so these matter where a
// value is put into a type: fi(…), x(:) = …, x(i) = …, division and −x.
export type Rm = 'Nearest' | 'Floor' | 'Ceiling' | 'Zero' | 'Round' | 'Convergent';
export type Om = 'Saturate' | 'Wrap';
export const RMS: Rm[] = ['Nearest', 'Floor', 'Ceiling', 'Zero', 'Round', 'Convergent'];
/** M532: fimath's ProductMode and SumMode with their lengths (MATLAB's defaults: 32-bit words, 30 fraction bits, cast
 * before summing). Kept on a type only when set; left out, sums and products are full precision. */
export type Mode = 'FullPrecision' | 'KeepLSB' | 'KeepMSB' | 'SpecifyPrecision';
export const MODES: Mode[] = ['FullPrecision', 'KeepLSB', 'KeepMSB', 'SpecifyPrecision'];
export interface PS { pm: Mode; pwl: number; pfl: number; pmax: number; sm: Mode; swl: number; sfl: number; smax: number; cbs: boolean }
export const PS0: PS = { pm: 'FullPrecision', pwl: 32, pfl: 30, pmax: 128, sm: 'FullPrecision', swl: 32, sfl: 30, smax: 128, cbs: true };
export interface Nt { signed: boolean; wl: number; fl: number; rm?: Rm; om?: Om; ps?: PS }
export const limits = (t: Nt): [number, number] => (t.signed ? [-(2 ** (t.wl - 1)), 2 ** (t.wl - 1) - 1] : [0, 2 ** t.wl - 1]);
/** M530: a number of steps rounded to a whole one by the type's method (the same arithmetic as the C's fx_from_double). */
export function roundBy(y: number, rm: Rm = 'Nearest'): number {
  if (rm === 'Floor') return Math.floor(y);
  if (rm === 'Ceiling') return Math.ceil(y);
  if (rm === 'Zero') return Math.trunc(y);
  if (rm === 'Round') return y < 0 ? -Math.floor(-y + 0.5) : Math.floor(y + 0.5);
  if (rm === 'Convergent') { const r = Math.floor(y), d = y - r; return d > 0.5 || (d === 0.5 && r % 2 !== 0) ? r + 1 : r; }
  return Math.floor(y + 0.5);
}
/** M530: a whole number past the range wrapped round it (two's complement), worked exactly in BigInt. */
export function wrapInt(q: number, t: Nt): number {
  const one = BigInt(1), w = one << BigInt(t.wl), lo = t.signed ? -(one << BigInt(t.wl - 1)) : BigInt(0);
  let r = (BigInt(q) - lo) % w;
  if (r < BigInt(0)) r += w;
  return Number(r + lo);
}
/** The stored whole number for a value (rounded to a step by the type's method, held in range or wrapped). */
export function stored(v: number, t: Nt): number {
  if (Number.isNaN(v)) return 0;
  const [lo, hi] = limits(t), q = roundBy(v * 2 ** t.fl, t.rm);
  if (t.om === 'Wrap' && Number.isFinite(q) && (q < lo || q > hi)) return wrapInt(q, t);
  return Math.min(hi, Math.max(lo, q));
}
/** M530: the fimath a result keeps: the first operand's, else the second's. */
export const fmOf = (a: Nt, b: Nt): Pick<Nt, 'rm' | 'om' | 'ps'> => {
  const rm = a.rm ?? b.rm, om = a.om ?? b.om, ps = a.ps ?? b.ps;
  return { ...(rm ? { rm } : {}), ...(om ? { om } : {}), ...(ps ? { ps } : {}) };
};
/** M532: a full-precision result type narrowed by a mode: KeepLSB keeps its fraction (the top may overflow), KeepMSB its
 * integer bits (the bottom is rounded), SpecifyPrecision takes both lengths. */
function byMode(full: Nt, mode: Mode, wl: number, fl: number, max: number, what: string): Nt {
  if (mode === 'FullPrecision') { if (full.wl > max) throw new LabError(`A full-precision ${what} needs ${full.wl} bits, more than Max${what === 'sum' ? 'Sum' : 'Product'}WordLength (${max}).`); return full; }
  if (mode === 'KeepLSB') return { ...full, wl };
  if (mode === 'KeepMSB') return { ...full, wl, fl: full.fl - (full.wl - wl) };
  return { ...full, wl, fl };
}
const sumBy = (full: Nt): Nt => (full.ps ? byMode(full, full.ps.sm, full.ps.swl, full.ps.sfl, full.ps.smax, 'sum') : full);
/** M532: a running sum's type: the element type grown by ⌈log2 n⌉ bits, then the SumMode (sum of a vector, matrix products). */
export const accType = (t: Nt, n: number): Nt => sumBy({ ...t, wl: Math.min(128, t.wl + Math.ceil(Math.log2(Math.max(2, n)))) });
/** M532: one step of a running sum in doubles (as the C): the term cast to the sum type first (CastBeforeSum), then the
 * sum put into the type; full precision needs neither. */
export function accStep(acc: number, x: number, t: Nt): number {
  if (!t.ps || t.ps.sm === 'FullPrecision') return acc + x;
  return quantize(acc + (t.ps.cbs ? quantize(x, t) : x), t);
}
export const quantize = (v: number, t: Nt) => stored(v, t) / 2 ** t.fl;
/** The most fraction bits that still hold the largest value (MATLAB's best precision). */
export function bestFl(values: ArrayLike<number>, signed: boolean, wl: number): number {
  let big = 0;
  for (let i = 0; i < values.length; i++) big = Math.max(big, Math.abs(values[i]));
  if (big === 0) return wl - (signed ? 1 : 0);
  // Integer bits needed: the largest value must fit below 2^(wl − sign − fl).
  let fl = wl - (signed ? 1 : 0) - Math.ceil(Math.log2(big + 1e-300));
  const [, hi] = limits({ signed, wl, fl });
  while (Math.floor(big * 2 ** fl + 0.5) > hi) fl--;
  return fl;
}
/** Full-precision result types (MATLAB): a sum keeps the larger fraction and one more integer bit; a product adds both. */
export function sumType(a: Nt, b: Nt): Nt {
  const fl = Math.max(a.fl, b.fl), signed = a.signed || b.signed, ib = Math.max(a.wl - a.fl - (a.signed ? 1 : 0), b.wl - b.fl - (b.signed ? 1 : 0)) + 1;
  return sumBy({ signed, fl, wl: Math.min(128, ib + fl + (signed ? 1 : 0)), ...fmOf(a, b) });
}
export function productType(a: Nt, b: Nt): Nt {
  const full: Nt = { signed: a.signed || b.signed, wl: Math.min(128, a.wl + b.wl), fl: a.fl + b.fl, ...fmOf(a, b) };
  return full.ps ? byMode(full, full.ps.pm, full.ps.pwl, full.ps.pfl, full.ps.pmax, 'product') : full;
}
/** M532: the same types without fimath's modes (the full-precision result before it is narrowed). */
export const plain = (t: Nt): Nt => { const { ps: _ps, ...r } = t; void _ps; return r; };
/** The stored integer's bits, most significant first (two's complement for negatives). */
export function bits(v: number, t: Nt): string {
  const one = BigInt(1), zero = BigInt(0), s = BigInt(stored(v, t)), w = BigInt(t.wl), m = (one << w) - one;
  return ((s < zero ? (one << w) + s : s) & m).toString(2).padStart(t.wl, '0');
}
export const hex = (v: number, t: Nt) => BigInt(`0b${bits(v, t)}`).toString(16).padStart(Math.ceil(t.wl / 4), '0');
/** M530: t / m (m > 0) rounded to a whole number by the method, exactly (BigInt), as the C's fx_rdiv. */
export function rdivBig(t: bigint, m: bigint, rm: Rm = 'Nearest'): bigint {
  const zero = BigInt(0), one = BigInt(1);
  let q = t / m, r = t % m;
  if (r < zero) { q -= one; r += m; }
  if (r === zero) return q;
  const c = r - (m - r); // the sign of 2r − m: past, at or before the half
  if (rm === 'Floor') return q;
  if (rm === 'Ceiling') return q + one;
  if (rm === 'Zero') return q < zero ? q + one : q;
  if (rm === 'Round') return c > zero || (c === zero && q >= zero) ? q + one : q;
  if (rm === 'Convergent') return c > zero || (c === zero && q % BigInt(2) !== zero) ? q + one : q;
  return c >= zero ? q + one : q;
}
/** M530: a whole number put into a type's range: held (Saturate) or wrapped (Wrap). */
export function fitBig(r: bigint, t: Nt): bigint {
  const one = BigInt(1), w = BigInt(t.wl), lo = t.signed ? -(one << (w - one)) : BigInt(0), hi = t.signed ? (one << (w - one)) - one : (one << w) - one;
  if (r >= lo && r <= hi) return r;
  if (t.om !== 'Wrap') return r < lo ? lo : hi;
  const span = one << w;
  let k = (r - lo) % span;
  if (k < BigInt(0)) k += span;
  return k + lo;
}
