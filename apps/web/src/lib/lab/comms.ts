// Hyperion's wireless communications (M427, the owner's list: "Wireless communications"): PSK and square QAM with Gray
// labels (neighbouring points differ by one bit), additive white Gaussian noise, bit and symbol error counts, and the
// textbook bit-error rates to compare against. Our own code from the standard formulas.

export type Rand = () => number;
const gray = (n: number) => n ^ (n >> 1);
const ungray = (g: number) => { let n = g; for (let s = g >> 1; s; s >>= 1) n ^= s; return n; };

/** M-PSK: symbol s at angle 2π·p/M + phase, where p is the point whose Gray label is s. */
export function pskmod(sym: number[], M: number, phase = 0): [number[], number[]] {
  const re: number[] = [], im: number[] = [];
  for (const s of sym) { const a = (2 * Math.PI * ungray(s)) / M + phase; re.push(Math.cos(a)); im.push(Math.sin(a)); }
  return [re, im];
}
export const pskdemod = (re: number[], im: number[], M: number, phase = 0) => re.map((x, i) => { let p = Math.round(((Math.atan2(im[i], x) - phase) * M) / (2 * Math.PI)); p = ((p % M) + M) % M; return gray(p); });

/** Square M-QAM: the symbol's high bits pick the in-phase level, the low bits the quadrature level, each Gray coded
 * over −(L−1) … L−1 in steps of 2; unit average power when asked. */
export function qammod(sym: number[], M: number, unit = false): [number[], number[]] {
  const L = Math.round(Math.sqrt(M)), k = Math.log2(L), sc = unit ? Math.sqrt(3 / (2 * (M - 1))) : 1;
  if (L * L !== M || !Number.isInteger(k)) throw new Error('QAM here is square: M = 4, 16, 64, 256, 1024.');
  const re: number[] = [], im: number[] = [];
  for (const s of sym) { re.push((2 * ungray(s >> k) - (L - 1)) * sc); im.push((2 * ungray(s & (L - 1)) - (L - 1)) * sc); }
  return [re, im];
}
export function qamdemod(re: number[], im: number[], M: number, unit = false) {
  const L = Math.round(Math.sqrt(M)), k = Math.log2(L), sc = unit ? Math.sqrt(3 / (2 * (M - 1))) : 1;
  const level = (v: number) => Math.max(0, Math.min(L - 1, Math.round((v / sc + L - 1) / 2)));
  return re.map((x, i) => (gray(level(x)) << k) | gray(level(im[i])));
}

/** Gaussian noise at an SNR (dB) against the signal's power (measured) or 1. */
export function awgn(re: number[], im: number[] | null, snrDb: number, rand: Rand, measured = true): [number[], number[] | null] {
  const n = re.length, ps = measured ? re.reduce((s, v, i) => s + v * v + (im ? im[i] ** 2 : 0), 0) / n : 1, pn = ps / 10 ** (snrDb / 10);
  const g = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const sd = Math.sqrt(im ? pn / 2 : pn);
  return [re.map((v) => v + sd * g()), im ? im.map((v) => v + sd * g()) : null];
}
/** Bits that differ between two lists of k-bit symbols, and the share. */
export function biterr(a: number[], b: number[], k: number) {
  let n = 0;
  a.forEach((x, i) => { let d = x ^ b[i]; while (d) { n += d & 1; d >>= 1; } });
  return { count: n, ratio: n / (a.length * k) };
}
/** Q(x), the standard normal's upper tail. */
export const qfunc = (x: number) => 0.5 * erfc(x / Math.SQRT2);
export function erfc(x: number) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** The textbook bit-error rate over AWGN with Gray labels, at Eb/N0 (dB): BPSK and QPSK exact, M-PSK and M-QAM the
 * usual nearest-neighbour approximations. */
export function berTheory(ebnoDb: number, kind: 'psk' | 'qam', M: number) {
  const g = 10 ** (ebnoDb / 10), k = Math.log2(M);
  if (kind === 'psk') return M <= 4 ? qfunc(Math.sqrt(2 * g)) : (2 / k) * qfunc(Math.sqrt(2 * k * g) * Math.sin(Math.PI / M));
  return M === 4 ? qfunc(Math.sqrt(2 * g)) : ((4 / k) * (1 - 1 / Math.sqrt(M))) * qfunc(Math.sqrt((3 * k * g) / (M - 1)));
}
