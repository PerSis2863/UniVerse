// Hyperion's filter design (M472): analog prototypes (Butterworth, Chebyshev I and II, elliptic), their
// frequency transformations and the bilinear transform; windowed (fir1), frequency-sampled (fir2) and equiripple
// (Parks–McClellan's Remez exchange) FIR filters; responses, group delay, zero-phase filtering, Welch's PSD and the
// short-time Fourier transform. Our own code from the textbook definitions (Oppenheim & Schafer; Parks & McClellan
// 1972; Orfanidis' notes on elliptic filters for the Landen-transform route to Jacobi's functions). Frequencies are
// normalised: 1 = half the sample rate (Nyquist), as MATLAB's filter functions take them.

/** A complex number as [re, im]. */
export type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const scale = (a: C, s: number): C => [a[0] * s, a[1] * s];
const csqrt = (a: C): C => { const r = Math.hypot(a[0], a[1]), re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };
const ccos = (a: C): C => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])];
const csin = (a: C): C => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])];
const cacos = (z: C): C => {
  // acos z = −i log(z + i √(1 − z²))
  const s = csqrt(sub([1, 0], mul(z, z))), w = add(z, [-s[1], s[0]]);
  return [Math.atan2(w[1], w[0]), -Math.log(Math.hypot(w[0], w[1]))];
};

/** Zeros, poles and gain. */
export interface Zpk { z: C[]; p: C[]; k: number }
export type Band = 'low' | 'high' | 'bandpass' | 'stop';
export type Kind = 'butter' | 'cheby1' | 'cheby2' | 'ellip';

// ——— Jacobi elliptic functions by Landen's transformation ———
/** The descending Landen moduli of k (until they vanish). */
function landen(k: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < 12 && k > 1e-15; i++) { k = (k / (1 + Math.sqrt(1 - k * k))) ** 2; v.push(k); }
  return v;
}
/** K(k) and K'(k) = K(√(1 − k²)), the complete elliptic integrals of the first kind. */
export function ellipK(k: number): [number, number] {
  const K = landen(k).reduce((s, x) => s * (1 + x), Math.PI / 2);
  const Kp = landen(Math.sqrt(1 - k * k)).reduce((s, x) => s * (1 + x), Math.PI / 2);
  return [K, Kp];
}
/** cd(uK, k) and sn(uK, k) for complex u (u in units of the quarter period K). */
function cde(u: C, k: number, sn = false): C {
  const v = landen(k);
  let w = sn ? csin(scale(u, Math.PI / 2)) : ccos(scale(u, Math.PI / 2));
  for (let i = v.length - 1; i >= 0; i--) w = div(scale(w, 1 + v[i]), add([1, 0], scale(mul(w, w), v[i])));
  return w;
}
/** The inverse of sn: u with sn(uK, k) = w (u in units of K). */
function asne(w: C, k: number): C {
  const v = landen(k);
  for (let i = 0; i < v.length; i++) {
    const v1 = i === 0 ? k : v[i - 1];
    w = scale(div(w, add([1, 0], csqrt(sub([1, 0], scale(mul(w, w), v1 * v1))))), 2 / (1 + v[i]));
  }
  const u = scale(cacos(w), 2 / Math.PI);
  return [1 - u[0], -u[1]];
}
/** The elliptic degree equation: the modulus k for order n and discrimination k1 = ε_p / ε_s. */
function ellipdeg(n: number, k1: number): number {
  const kc = Math.sqrt(1 - k1 * k1);
  let kp = kc ** n;
  for (let i = 1; i <= Math.floor(n / 2); i++) kp *= cde([(2 * i - 1) / n, 0], kc, true)[0] ** 4;
  return Math.sqrt(1 - kp * kp);
}

// ——— Analog low-pass prototypes (edge at 1 rad/s) ———
export function prototype(kind: Kind, n: number, rp = 1, rs = 40): Zpk {
  if (!(n >= 1 && Number.isInteger(n))) throw new Error('The order must be a whole number of 1 or more.');
  const p: C[] = [], z: C[] = [];
  if (kind === 'butter') {
    for (let i = 1; i <= n; i++) { const t = (Math.PI * (2 * i + n - 1)) / (2 * n); p.push([Math.cos(t), Math.sin(t)]); }
    return { z, p, k: 1 };
  }
  if (kind === 'cheby1') {
    if (!(rp > 0)) throw new Error('The passband ripple must be above 0 dB.');
    const ep = Math.sqrt(10 ** (rp / 10) - 1), mu = Math.asinh(1 / ep) / n;
    for (let i = 1; i <= n; i++) { const t = ((2 * i - 1) * Math.PI) / (2 * n); p.push([-Math.sinh(mu) * Math.sin(t), Math.cosh(mu) * Math.cos(t)]); }
    let k = p.reduce<C>((s, x) => mul(s, scale(x, -1)), [1, 0])[0];
    if (n % 2 === 0) k /= Math.sqrt(1 + ep * ep);
    return { z, p, k };
  }
  if (kind === 'cheby2') {
    if (!(rs > 0)) throw new Error('The stopband attenuation must be above 0 dB.');
    const de = 1 / Math.sqrt(10 ** (rs / 10) - 1), mu = Math.asinh(1 / de) / n;
    for (let i = 1; i <= n; i++) {
      const t = ((2 * i - 1) * Math.PI) / (2 * n);
      p.push(div([1, 0], [-Math.sinh(mu) * Math.sin(t), Math.cosh(mu) * Math.cos(t)]));
      if (Math.abs(Math.cos(t)) > 1e-12) z.push([0, 1 / Math.cos(t)]);
    }
    const k = div(p.reduce<C>((s, x) => mul(s, scale(x, -1)), [1, 0]), z.reduce<C>((s, x) => mul(s, scale(x, -1)), [1, 0]))[0];
    return { z, p, k };
  }
  if (!(rp > 0 && rs > rp)) throw new Error('An elliptic filter needs 0 < passband ripple < stopband attenuation.');
  const ep = Math.sqrt(10 ** (rp / 10) - 1), es = Math.sqrt(10 ** (rs / 10) - 1), k1 = ep / es, k = ellipdeg(n, k1);
  // Orfanidis writes v0 = −j·asne(j/ε, k1)/N and the poles j·cd((u − j·v0)K); here v0 = asne(j/ε, k1)/N, so u − v0.
  const v0 = scale(asne([0, 1 / ep], k1), 1 / n);
  for (let i = 1; i <= Math.floor(n / 2); i++) {
    const u = (2 * i - 1) / n, zeta = cde([u, 0], k)[0];
    z.push([0, 1 / (k * zeta)], [0, -1 / (k * zeta)]);
    const pc = mul([0, 1], cde(sub([u, 0], v0), k));
    p.push(pc, [pc[0], -pc[1]]);
  }
  if (n % 2) { const s = mul([0, 1], cde(v0, k, true)); p.push([s[0], 0]); }
  let g = div(p.reduce<C>((s, x) => mul(s, scale(x, -1)), [1, 0]), z.reduce<C>((s, x) => mul(s, scale(x, -1)), [1, 0]))[0];
  if (n % 2 === 0) g /= Math.sqrt(1 + ep * ep);
  return { z, p, k: g };
}

// ——— Frequency transformations of an analog low-pass (edge 1) ———
const prod = (v: C[]): C => v.reduce<C>((s, x) => mul(s, x), [1, 0]);
function transform(f: Zpk, band: Band, w: number[]): Zpk {
  const { z, p } = f, extra = p.length - z.length;
  if (band === 'low') return { z: z.map((x) => scale(x, w[0])), p: p.map((x) => scale(x, w[0])), k: f.k * w[0] ** extra };
  if (band === 'high') {
    const k = f.k * div(prod(z.map((x) => scale(x, -1))), prod(p.map((x) => scale(x, -1))))[0];
    return { z: [...z.map((x) => div([w[0], 0], x)), ...Array.from({ length: extra }, (): C => [0, 0])], p: p.map((x) => div([w[0], 0], x)), k };
  }
  const bw = w[1] - w[0], w0 = Math.sqrt(w[0] * w[1]);
  const split = (r: C[], inv: boolean) => r.flatMap((x) => {
    const h = inv ? div([bw / 2, 0], x) : scale(x, bw / 2), s = csqrt(sub(mul(h, h), [w0 * w0, 0]));
    return [add(h, s), sub(h, s)];
  });
  if (band === 'bandpass') return { z: [...split(z, false), ...Array.from({ length: extra }, (): C => [0, 0])], p: split(p, false), k: f.k * bw ** extra };
  const k = f.k * div(prod(z.map((x) => scale(x, -1))), prod(p.map((x) => scale(x, -1))))[0];
  const zs = split(z, true);
  for (let i = 0; i < extra; i++) zs.push([0, w0], [0, -w0]);
  return { z: zs, p: split(p, true), k };
}
/** The bilinear transform s = 2·fs·(z − 1)/(z + 1), here with fs = 2 (normalised frequencies, as MATLAB). */
function bilinear(f: Zpk, fs = 2): Zpk {
  const c = 2 * fs, map = (x: C) => div(add([c, 0], x), sub([c, 0], x));
  const k = f.k * div(prod(f.z.map((x) => sub([c, 0], x))), prod(f.p.map((x) => sub([c, 0], x))))[0];
  return { z: [...f.z.map(map), ...Array.from({ length: f.p.length - f.z.length }, (): C => [-1, 0])], p: f.p.map(map), k };
}
/** The polynomial with these roots (real parts; conjugate pairs make it real). */
export function poly(r: C[]): number[] {
  let c: C[] = [[1, 0]];
  for (const x of r) { const next: C[] = [...c, [0, 0]]; for (let i = 1; i < next.length; i++) next[i] = sub(next[i], mul(x, c[i - 1])); c = next; }
  return c.map((x) => x[0]);
}

/** An IIR filter: wn normalised (one edge, or two for band-pass and band-stop). `analog` designs in rad/s. */
export function iir(kind: Kind, n: number, wn: number[], band: Band, rp = 1, rs = 40, analog = false): Zpk {
  const two = band === 'bandpass' || band === 'stop';
  if (wn.length !== (two ? 2 : 1)) throw new Error(two ? 'A band filter needs two edges [w1 w2].' : 'This filter needs one edge.');
  if (!analog && wn.some((x) => !(x > 0 && x < 1))) throw new Error('Edges are between 0 and 1 (1 = half the sample rate).');
  if (two && !(wn[0] < wn[1])) throw new Error('The band edges go from low to high.');
  const proto = prototype(kind, n, rp, rs);
  const warped = analog ? wn : wn.map((x) => 4 * Math.tan((Math.PI * x) / 2));
  const a = transform(proto, band, warped);
  return analog ? a : bilinear(a);
}
export function zpk2tf(f: Zpk): { b: number[]; a: number[] } {
  const a = poly(f.p), b = poly(f.z).map((x) => x * f.k);
  return { b: [...Array(a.length - b.length).fill(0), ...b], a };
}

// ——— Order estimates (the smallest order that meets the passband and stopband) ———
/** wp, ws normalised edges (one each, or two each for bands); rp ripple, rs attenuation (dB). */
export function order(kind: Kind, wp: number[], ws: number[], rp: number, rs: number): { n: number; wn: number[]; band: Band } {
  if (wp.length !== ws.length || !(wp.length === 1 || wp.length === 2)) throw new Error('Give one or two passband edges and as many stopband edges.');
  if ([...wp, ...ws].some((x) => !(x > 0 && x < 1))) throw new Error('Edges are between 0 and 1 (1 = half the sample rate).');
  if (!(rp > 0 && rs > rp)) throw new Error('Need 0 < passband ripple < stopband attenuation.');
  const W = (x: number) => Math.tan((Math.PI * x) / 2), P = wp.map(W), S = ws.map(W);
  let band: Band, sel: number;
  if (wp.length === 1) { band = wp[0] < ws[0] ? 'low' : 'high'; sel = band === 'low' ? S[0] / P[0] : P[0] / S[0]; }
  else {
    band = ws[0] < wp[0] ? 'bandpass' : 'stop';
    const bw = P[1] - P[0], w0 = P[0] * P[1];
    sel = Math.min(...S.map((s) => (band === 'bandpass' ? Math.abs((s * s - w0) / (s * bw)) : Math.abs((s * bw) / (s * s - w0)))));
  }
  if (!(sel > 1)) throw new Error('The stopband must lie beyond the passband.');
  const e = (10 ** (rs / 10) - 1) / (10 ** (rp / 10) - 1);
  let n: number;
  if (kind === 'butter') n = Math.ceil(Math.log10(e) / (2 * Math.log10(sel)));
  else if (kind === 'cheby1' || kind === 'cheby2') n = Math.ceil(Math.acosh(Math.sqrt(e)) / Math.acosh(sel));
  else { const [K, Kp] = ellipK(1 / sel), [K1, K1p] = ellipK(1 / Math.sqrt(e)); n = Math.ceil((K * K1p) / (Kp * K1) - 1e-9); }
  n = Math.max(1, n);
  let wn = wp;
  if (kind === 'butter' && band === 'low') wn = [(2 / Math.PI) * Math.atan(P[0] / (10 ** (rp / 10) - 1) ** (1 / (2 * n)))];
  else if (kind === 'butter' && band === 'high') wn = [(2 / Math.PI) * Math.atan(P[0] * (10 ** (rp / 10) - 1) ** (1 / (2 * n)))];
  else if (kind === 'cheby2') wn = ws;
  return { n, wn, band };
}

// ——— FIR ———
const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
export const hammingW = (L: number) => Array.from({ length: L }, (_, k) => (L === 1 ? 1 : 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (L - 1))));
/** Windowed-sinc FIR of order n (n + 1 taps). Scaled to gain 1 at the middle of its first passband. */
export function fir1(n: number, wn: number[], band: Band = wn.length === 2 ? 'bandpass' : 'low', win?: number[]): number[] {
  if (!(n >= 1 && Number.isInteger(n))) throw new Error('The order must be a whole number of 1 or more.');
  if ((band === 'high' || band === 'stop') && n % 2) throw new Error('A high-pass or band-stop FIR needs an even order (an odd number of taps can’t pass Nyquist).');
  if (wn.some((x) => !(x > 0 && x < 1))) throw new Error('Edges are between 0 and 1 (1 = half the sample rate).');
  const L = n + 1, m = n / 2, w = win ?? hammingW(L);
  if (w.length !== L) throw new Error(`The window must have ${L} points (the order + 1).`);
  const lp = (fc: number, k: number) => fc * sinc(fc * (k - m));
  const h = Array.from({ length: L }, (_, k) => {
    const d = band === 'low' ? lp(wn[0], k) : band === 'high' ? sinc(k - m) - lp(wn[0], k) : band === 'bandpass' ? lp(wn[1], k) - lp(wn[0], k) : sinc(k - m) - lp(wn[1], k) + lp(wn[0], k);
    return d * w[k];
  });
  const f0 = band === 'low' || band === 'stop' ? 0 : band === 'high' ? 1 : (wn[0] + wn[1]) / 2;
  const [re, im] = h.reduce<C>((s, x, k) => [s[0] + x * Math.cos(Math.PI * f0 * k), s[1] - x * Math.sin(Math.PI * f0 * k)], [0, 0]);
  const g = Math.hypot(re, im);
  return h.map((x) => x / g);
}
/** Frequency-sampling FIR of order n: the gain m(i) at frequency f(i) (0 … 1, increasing, ends at 0 and 1). */
export function fir2(n: number, f: number[], m: number[], npt = 512, win?: number[]): number[] {
  if (f.length !== m.length || f.length < 2) throw new Error('f and m are the same length (2 or more).');
  if (f[0] !== 0 || f[f.length - 1] !== 1 || f.some((x, i) => i && x < f[i - 1])) throw new Error('f rises from 0 to 1.');
  if (n % 2 && m[m.length - 1] !== 0) throw new Error('An odd order needs a gain of 0 at 1 (Nyquist).');
  const L = n + 1, w = win ?? hammingW(L), grid = Math.max(npt, 2 ** Math.ceil(Math.log2(L)));
  // The desired gain on grid + 1 points, linear between the given points (a repeated f is a jump).
  const H = Array.from({ length: grid + 1 }, (_, i) => {
    const x = i / grid;
    let j = 0;
    while (j < f.length - 2 && f[j + 1] < x) j++;
    if (f[j + 1] === f[j]) return m[j + 1];
    return m[j] + ((m[j + 1] - m[j]) * (x - f[j])) / (f[j + 1] - f[j]);
  });
  // Linear phase, then the inverse transform of the full (Hermitian) spectrum of 2·grid points.
  const N = 2 * grid, h = new Array(L).fill(0);
  for (let k = 0; k < L; k++) {
    let s = 0;
    for (let i = 0; i <= grid; i++) { const wk = (Math.PI * i) / grid, c = H[i] * Math.cos(wk * (k - n / 2)); s += i === 0 || i === grid ? c : 2 * c; }
    h[k] = (s / N) * w[k];
  }
  return h;
}

/** Parks–McClellan equiripple FIR of order n: bands f (pairs, 0 … 1), gains a at each edge, weights per band. */
export function firpm(n: number, f: number[], a: number[], wt?: number[]): { h: number[]; err: number } {
  if (!(n >= 2 && Number.isInteger(n))) throw new Error('The order must be a whole number of 2 or more.');
  if (f.length % 2 || f.length !== a.length || f.some((x, i) => x < 0 || x > 1 || (i && x < f[i - 1]))) throw new Error('f holds band edges in pairs, rising from 0 to 1; a has a gain for each.');
  const nb = f.length / 2, W = wt ?? Array(nb).fill(1);
  if (W.length !== nb) throw new Error('Give one weight per band.');
  const odd = n % 2 === 1, r = odd ? (n + 1) / 2 : n / 2 + 1;
  if (odd && a[a.length - 1] !== 0 && f[f.length - 1] === 1) throw new Error('An odd order can’t pass Nyquist: end at gain 0 or use an even order.');
  // The dense grid (16 points per extremum), each point's wanted gain and weight; Q = cos(ω/2) for odd orders.
  const gw: number[] = [], gd: number[] = [], gW: number[] = [];
  const step = 1 / (16 * r);
  for (let b = 0; b < nb; b++) {
    const lo = f[2 * b], hi = odd ? Math.min(f[2 * b + 1], 1 - step) : f[2 * b + 1], pts = Math.max(2, Math.ceil((hi - lo) / step) + 1);
    for (let i = 0; i < pts; i++) {
      const x = lo + ((hi - lo) * i) / (pts - 1), d = a[2 * b] + ((a[2 * b + 1] - a[2 * b]) * (hi === lo ? 0 : (x - lo) / (f[2 * b + 1] - lo)));
      const q = odd ? Math.cos((Math.PI * x) / 2) : 1;
      gw.push(Math.PI * x); gd.push(d / q); gW.push(W[b] * q);
    }
  }
  const G = gw.length;
  if (G < r + 1) throw new Error('The bands are too narrow for this order.');
  let ext = Array.from({ length: r + 1 }, (_, i) => Math.round((i * (G - 1)) / r));
  let x: number[] = [], y: number[] = [], bw: number[] = [], delta = 0;
  const interp = (xv: number) => {
    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) { const t = xv - x[i]; if (Math.abs(t) < 1e-14) return y[i]; num += (bw[i] / t) * y[i]; den += bw[i] / t; }
    return num / den;
  };
  for (let it = 0; it < 60; it++) {
    const xs = ext.map((i) => Math.cos(gw[i]));
    // Barycentric weights over all r + 1 points (scaled to keep them in range).
    const bAll = xs.map((xk, k) => { let p = 1; for (let i = 0; i < xs.length; i++) if (i !== k) p *= 2 * (xk - xs[i]); return 1 / p; });
    let nu = 0, de = 0;
    bAll.forEach((b, k) => { nu += b * gd[ext[k]]; de += (b * (k % 2 ? -1 : 1)) / gW[ext[k]]; });
    delta = nu / de;
    x = xs.slice(0, r); y = ext.slice(0, r).map((i, k) => gd[i] - ((k % 2 ? -1 : 1) * delta) / gW[i]);
    bw = x.map((xk, k) => { let p = 1; for (let i = 0; i < r; i++) if (i !== k) p *= 2 * (xk - x[i]); return 1 / p; });
    const E = gw.map((w, i) => gW[i] * (gd[i] - interp(Math.cos(w))));
    // New extremal set: local extrema with |E| ≥ |δ|, alternating, the r + 1 largest kept.
    let cand: number[] = [];
    for (let i = 0; i < G; i++) {
      const l = i > 0 ? E[i - 1] : -Infinity * Math.sign(E[i]), rr = i < G - 1 ? E[i + 1] : -Infinity * Math.sign(E[i]);
      if (Math.abs(E[i]) >= Math.abs(delta) * (1 - 1e-9) && ((E[i] >= l && E[i] >= rr) || (E[i] <= l && E[i] <= rr))) cand.push(i);
    }
    // Keep alternation: of neighbours with one sign, the larger.
    const alt: number[] = [];
    for (const i of cand) {
      const last = alt[alt.length - 1];
      if (last !== undefined && Math.sign(E[i]) === Math.sign(E[last])) { if (Math.abs(E[i]) > Math.abs(E[last])) alt[alt.length - 1] = i; }
      else alt.push(i);
    }
    cand = alt;
    while (cand.length > r + 1) {
      // Drop the smaller end, as Parks and McClellan's program does.
      if (Math.abs(E[cand[0]]) < Math.abs(E[cand[cand.length - 1]])) cand.shift(); else cand.pop();
    }
    if (cand.length < r + 1) break;
    const same = cand.every((v, i) => v === ext[i]);
    ext = cand;
    if (same) break;
  }
  // The amplitude A(ω) = Q(ω)·P(cos ω) sampled at N = n + 1 points, back to taps by the inverse DFT.
  const N = n + 1, A = Array.from({ length: N }, (_, m) => { const w = (2 * Math.PI * m) / N; return (odd ? Math.cos(w / 2) : 1) * interp(Math.cos(w)); });
  const h = Array.from({ length: N }, (_, k) => A.reduce((s, v, m) => s + v * Math.cos(((2 * Math.PI * m) / N) * (k - n / 2)), 0) / N);
  return { h, err: Math.abs(delta) };
}

// ——— Responses ———
/** H(e^{jω}) of b/a at each ω (radians per sample). */
export function response(b: number[], a: number[], w: number[]): C[] {
  return w.map((t) => {
    const ev = (p: number[]): C => p.reduce<C>((s, c, k) => [s[0] + c * Math.cos(k * t), s[1] - c * Math.sin(k * t)], [0, 0]);
    return div(ev(b), ev(a));
  });
}
/** Group delay (samples) of b/a at each ω: −dφ/dω = Re(Σ k b_k e^{−jkω} / B) − Re(Σ k a_k e^{−jkω} / A). */
export function groupDelay(b: number[], a: number[], w: number[]): number[] {
  const part = (p: number[], t: number) => {
    const ev = (q: number[]): C => q.reduce<C>((s, c, k) => [s[0] + c * Math.cos(k * t), s[1] - c * Math.sin(k * t)], [0, 0]);
    const d = ev(p), nd = ev(p.map((c, k) => c * k)), r = d[0] * d[0] + d[1] * d[1];
    return r < 1e-30 ? 0 : (nd[0] * d[0] + nd[1] * d[1]) / r;
  };
  return w.map((t) => part(b, t) - part(a, t));
}

/** Direct form II transposed, from state zi (zeros when absent). */
export function lfilter(b: number[], a: number[], x: ArrayLike<number>, zi?: number[]): { y: Float64Array; zf: number[] } {
  if (!a[0]) throw new Error('a(1) must be non-zero.');
  const n = Math.max(b.length, a.length), bn = Array.from({ length: n }, (_, i) => (b[i] ?? 0) / a[0]), an = Array.from({ length: n }, (_, i) => (a[i] ?? 0) / a[0]);
  const z = zi ? [...zi, 0] : new Array(n).fill(0), y = new Float64Array(x.length);
  for (let k = 0; k < x.length; k++) {
    const xk = x[k], yk = bn[0] * xk + z[0];
    for (let i = 1; i < n; i++) z[i - 1] = bn[i] * xk + (z[i] ?? 0) - an[i] * yk;
    y[k] = yk;
  }
  return { y, zf: z.slice(0, n - 1) };
}
/** The initial state that makes a step input start in its steady state (Gustafsson's method). */
function steadyState(b: number[], a: number[]): number[] {
  const n = Math.max(b.length, a.length), B = Array.from({ length: n }, (_, i) => (b[i] ?? 0) / a[0]), A = Array.from({ length: n }, (_, i) => (a[i] ?? 0) / a[0]);
  const m = n - 1;
  if (!m) return [];
  // (I − Cᵀ) zi = B[1:] − A[1:]·B[0], C the companion matrix of A.
  const M = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0) - (j === 0 ? -A[i + 1] : 0) - (i === j - 1 ? 1 : 0)));
  const rhs = Array.from({ length: m }, (_, i) => B[i + 1] - A[i + 1] * B[0]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < m; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < m; k++) M[r][k] -= f * M[c][k]; rhs[r] -= f * rhs[c]; }
  }
  const zi = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let s = rhs[r]; for (let k = r + 1; k < m; k++) s -= M[r][k] * zi[k]; zi[r] = s / M[r][r]; }
  return zi;
}
/** Zero-phase filtering: forwards, then backwards, the ends padded by odd reflection (3·(order) samples). */
export function filtfilt(b: number[], a: number[], x: ArrayLike<number>): Float64Array {
  const len = x.length, nf = 3 * (Math.max(b.length, a.length) - 1);
  if (len <= nf) throw new Error(`filtfilt needs more than ${nf} samples for this filter.`);
  const ext = new Float64Array(len + 2 * nf);
  for (let i = 0; i < nf; i++) ext[i] = 2 * x[0] - x[nf - i];
  for (let i = 0; i < len; i++) ext[nf + i] = x[i];
  for (let i = 0; i < nf; i++) ext[nf + len + i] = 2 * x[len - 1] - x[len - 2 - i];
  const zi = steadyState(b, a);
  const f = lfilter(b, a, ext, zi.map((z) => z * ext[0])).y.reverse();
  const g = lfilter(b, a, f, zi.map((z) => z * f[0])).y.reverse();
  return g.slice(nf, nf + len);
}

// ——— Spectra ———
/** The DFT of a real frame at bins 0 … nfft − 1 (direct for small sizes, radix-2 otherwise). */
export function rfft(x: ArrayLike<number>, nfft: number): [Float64Array, Float64Array] {
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let i = 0; i < Math.min(nfft, x.length); i++) re[i] = x[i];
  if ((nfft & (nfft - 1)) === 0) {
    for (let i = 1, j = 0; i < nfft; i++) { let bit = nfft >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= nfft; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < nfft; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    return [re, im];
  }
  const or = new Float64Array(nfft), oi = new Float64Array(nfft);
  for (let k = 0; k < nfft; k++) for (let i = 0; i < nfft; i++) { const t = (-2 * Math.PI * k * i) / nfft; or[k] += re[i] * Math.cos(t); oi[k] += re[i] * Math.sin(t); }
  return [or, oi];
}
/** Welch's power spectral density, one-sided: segments of the window's length, overlapping by `overlap` samples. */
export function welch(x: ArrayLike<number>, win: number[], overlap: number, nfft: number, fs: number): { pxx: number[]; f: number[] } {
  const L = win.length, stepN = L - overlap;
  if (!(stepN >= 1)) throw new Error('The overlap must be smaller than the window.');
  if (x.length < L) throw new Error('The signal is shorter than one window.');
  const segs = Math.floor((x.length - overlap) / stepN), U = win.reduce((s, w) => s + w * w, 0), half = Math.floor(nfft / 2) + 1;
  const acc = new Float64Array(half), frame = new Float64Array(L);
  for (let s = 0; s < segs; s++) {
    for (let i = 0; i < L; i++) frame[i] = x[s * stepN + i] * win[i];
    const [re, im] = rfft(frame, nfft);
    for (let k = 0; k < half; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
  }
  const pxx = Array.from(acc, (v, k) => (v / (segs * fs * U)) * (k === 0 || (nfft % 2 === 0 && k === half - 1) ? 1 : 2));
  return { pxx, f: Array.from({ length: half }, (_, k) => (k * fs) / nfft) };
}
/** The short-time Fourier transform, one-sided: s (bins × frames, complex), f, t (the frames' middles). */
export function stft(x: ArrayLike<number>, win: number[], overlap: number, nfft: number, fs: number) {
  const L = win.length, stepN = L - overlap;
  if (!(stepN >= 1)) throw new Error('The overlap must be smaller than the window.');
  if (x.length < L) throw new Error('The signal is shorter than one window.');
  const frames = Math.floor((x.length - overlap) / stepN), half = Math.floor(nfft / 2) + 1;
  const re = new Float64Array(half * frames), im = new Float64Array(half * frames), frame = new Float64Array(L);
  for (let s = 0; s < frames; s++) {
    for (let i = 0; i < L; i++) frame[i] = x[s * stepN + i] * win[i];
    const [r, q] = rfft(frame, nfft);
    re.set(r.subarray(0, half), s * half); im.set(q.subarray(0, half), s * half);
  }
  return { re, im, bins: half, frames, f: Array.from({ length: half }, (_, k) => (k * fs) / nfft), t: Array.from({ length: frames }, (_, s) => (s * stepN + L / 2) / fs), U: win.reduce((s, w) => s + w * w, 0) };
}
