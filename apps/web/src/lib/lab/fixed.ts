// Hyperion's fixed-point numbers (M480): a value kept as a whole number of steps of 2^-fractionLength in a word of
// wordLength bits, signed or not, as an embedded processor or an FPGA holds it. Rounding to the nearest step (halves
// up, MATLAB's 'Nearest') and holding the range ('saturate'). Sums and products grow their words so nothing is lost,
// as MATLAB's full precision does. Our own code.

export interface Nt { signed: boolean; wl: number; fl: number }
export const limits = (t: Nt): [number, number] => (t.signed ? [-(2 ** (t.wl - 1)), 2 ** (t.wl - 1) - 1] : [0, 2 ** t.wl - 1]);
/** The stored whole number for a value (rounded to the nearest step, held in range). */
export function stored(v: number, t: Nt): number {
  if (Number.isNaN(v)) return 0;
  const [lo, hi] = limits(t), q = Math.floor(v * 2 ** t.fl + 0.5);
  return Math.min(hi, Math.max(lo, q));
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
  return { signed, fl, wl: Math.min(128, ib + fl + (signed ? 1 : 0)) };
}
export const productType = (a: Nt, b: Nt): Nt => ({ signed: a.signed || b.signed, wl: Math.min(128, a.wl + b.wl), fl: a.fl + b.fl });
/** The stored integer's bits, most significant first (two's complement for negatives). */
export function bits(v: number, t: Nt): string {
  const one = BigInt(1), zero = BigInt(0), s = BigInt(stored(v, t)), w = BigInt(t.wl), m = (one << w) - one;
  return ((s < zero ? (one << w) + s : s) & m).toString(2).padStart(t.wl, '0');
}
export const hex = (v: number, t: Nt) => BigInt(`0b${bits(v, t)}`).toString(16).padStart(Math.ceil(t.wl / 4), '0');
