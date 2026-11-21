import { LabError } from './parse';
import { cmat, imOf, mat, num, row, scalar, toMat, type Mat, type Value } from './values';
import { BUILTINS, type Builtin } from './builtins';
import { solve } from './interp';

// UniVerse Lab's signals and statistics (M378): fft / ifft of any length (radix-2, Bluestein for the rest), filter,
// conv2, xcorr, freqz, windows, movmean; cov, corrcoef, prctile / quantile, histcounts, zscore, skewness, kurtosis,
// the normal distribution and erf; cubic splines. Our own code from the documented definitions.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const R = (v: Value, what = 'This') => { const m = toMat(v, what); if (m.im) throw new LabError(`${what} must be real here.`); return m; };
const S = (v: Value | undefined, d: number) => (v === undefined || (v.k === 'mat' && !v.d.length) ? d : scalar(v));
const isVec = (m: Mat) => m.r === 1 || m.c === 1;

// ——— FFT ———
function fftPow2(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
/** The DFT of one vector, any length (Bluestein's chirp-z for lengths that aren't powers of two). */
export function dft(re: number[], im: number[], inverse = false): [Float64Array, Float64Array] {
  const n = re.length;
  if (n === 0) return [new Float64Array(0), new Float64Array(0)];
  if ((n & (n - 1)) === 0) {
    const r = Float64Array.from(re), i = Float64Array.from(im);
    fftPow2(r, i, inverse);
    if (inverse) for (let k = 0; k < n; k++) { r[k] /= n; i[k] /= n; }
    return [r, i];
  }
  let m = 1; while (m < 2 * n - 1) m <<= 1;
  const s = inverse ? 1 : -1;
  const wr = new Float64Array(n), wi = new Float64Array(n);
  for (let k = 0; k < n; k++) { const a = (s * Math.PI * ((k * k) % (2 * n))) / n; wr[k] = Math.cos(a); wi[k] = Math.sin(a); }
  const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let k = 0; k < n; k++) { ar[k] = re[k] * wr[k] - im[k] * wi[k]; ai[k] = re[k] * wi[k] + im[k] * wr[k]; }
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
  fftPow2(ar, ai, false); fftPow2(br, bi, false);
  for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
  fftPow2(ar, ai, true);
  const outR = new Float64Array(n), outI = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const r = ar[k] / m, i = ai[k] / m;
    outR[k] = r * wr[k] - i * wi[k]; outI[k] = r * wi[k] + i * wr[k];
    if (inverse) { outR[k] /= n; outI[k] /= n; }
  }
  return [outR, outI];
}
/** fft / ifft along a vector, or down each column of a matrix; padded or cut to n. */
function transform(a: Value[], inverse: boolean): Value[] {
  const m = toMat(a[0]), want = a[1] && a[1].k === 'mat' && a[1].d.length ? scalar(a[1]) : null;
  const im = imOf(m);
  const cols = isVec(m) ? [[[...m.d], [...im]]] : Array.from({ length: m.c }, (_, j) => [[...m.d.subarray(j * m.r, (j + 1) * m.r)], [...im.subarray(j * m.r, (j + 1) * m.r)]]);
  const n = want ?? (isVec(m) ? m.d.length : m.r);
  const out = cols.map(([r, i]) => { const rr = [...r.slice(0, n), ...Array(Math.max(0, n - r.length)).fill(0)], ii = [...i.slice(0, n), ...Array(Math.max(0, n - i.length)).fill(0)]; return dft(rr, ii, inverse); });
  const re = new Float64Array(n * out.length), imag = new Float64Array(n * out.length);
  out.forEach(([r, i], j) => { re.set(r, j * n); imag.set(i, j * n); });
  // ifft of a conjugate-symmetric spectrum is real up to rounding: tidy it.
  if (inverse && [...imag].every((x, k) => Math.abs(x) <= 1e-9 * (1 + Math.abs(re[k])))) imag.fill(0);
  const [r, c] = isVec(m) && m.r === 1 ? [1, n] : [n, out.length];
  return [cmat(r, c, re, imag)];
}
def('fft', (a) => transform(a, false));
def('ifft', (a) => transform(a, true));
def('fftshift', (a) => { const m = toMat(a[0]); const n = m.d.length, h = Math.floor(n / 2), k = n - h; const idx = [...Array(h).keys()].map((i) => i + k).concat([...Array(k).keys()]); return [cmat(m.r, m.c, idx.map((i) => m.d[i]), idx.map((i) => imOf(m)[i]))]; });
def('ifftshift', (a) => { const m = toMat(a[0]); const n = m.d.length, h = Math.ceil(n / 2), k = n - h; const idx = [...Array(k).keys()].map((i) => i + h).concat([...Array(h).keys()]); return [cmat(m.r, m.c, idx.map((i) => m.d[i]), idx.map((i) => imOf(m)[i]))]; });
def('nextpow2', (a) => [num(Math.ceil(Math.log2(Math.abs(scalar(a[0])) || 1)))]);

// ——— Filtering ———
def('filter', (a) => {
  // y = filter(b, a, x): direct form II transposed, a(1) normalised to 1.
  const b = [...R(a[0], 'b').d], den = [...R(a[1], 'a').d], x = R(a[2], 'x');
  if (!den[0]) throw new LabError('filter needs a(1) to be non-zero.');
  const n = Math.max(b.length, den.length), bn = [...b, ...Array(n - b.length).fill(0)].map((v) => v / den[0]), an = [...den, ...Array(n - den.length).fill(0)].map((v) => v / den[0]);
  const z = new Array(n).fill(0), y = new Float64Array(x.d.length);
  for (let k = 0; k < x.d.length; k++) {
    const xk = x.d[k], yk = bn[0] * xk + z[0];
    for (let i = 1; i < n; i++) z[i - 1] = bn[i] * xk + (z[i] ?? 0) - an[i] * yk;
    y[k] = yk;
  }
  return [mat(x.r, x.c, y)];
});
def('deconv', (a) => {
  const num_ = [...R(a[0]).d], den = [...R(a[1]).d];
  if (!den[0]) throw new LabError('deconv needs a divisor that doesn’t start with 0.');
  const q = new Array(Math.max(0, num_.length - den.length + 1)).fill(0), r = [...num_];
  for (let i = 0; i < q.length; i++) { q[i] = r[i] / den[0]; for (let j = 0; j < den.length; j++) r[i + j] -= q[i] * den[j]; }
  return [row(q), row(r.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)))];
});
def('conv2', (a) => {
  const A = R(a[0]), B = R(a[1]), shape = a[2]?.k === 'str' ? a[2].v : 'full';
  const fr = A.r + B.r - 1, fc = A.c + B.c - 1, full = new Float64Array(fr * fc);
  for (let j = 0; j < A.c; j++) for (let i = 0; i < A.r; i++) { const v = A.d[i + j * A.r]; if (!v) continue; for (let q = 0; q < B.c; q++) for (let p = 0; p < B.r; p++) full[i + p + (j + q) * fr] += v * B.d[p + q * B.r]; }
  const cut = (r0: number, c0: number, r: number, c: number) => { const o = mat(Math.max(0, r), Math.max(0, c)); for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) o.d[i + j * r] = full[r0 + i + (c0 + j) * fr]; return o; };
  if (shape === 'same') return [cut(Math.floor((B.r - 1) / 2) + ((B.r - 1) % 2), Math.floor((B.c - 1) / 2) + ((B.c - 1) % 2), A.r, A.c)];
  if (shape === 'valid') return [cut(B.r - 1, B.c - 1, A.r - B.r + 1, A.c - B.c + 1)];
  return [mat(fr, fc, full)];
});
def('xcorr', (a, nout) => {
  const x = [...R(a[0]).d], y = a[1] && a[1].k === 'mat' ? [...R(a[1]).d] : x, n = Math.max(x.length, y.length);
  const lags: number[] = [], out: number[] = [];
  for (let l = -(n - 1); l <= n - 1; l++) { let s = 0; for (let k = 0; k < n; k++) { const j = k + l; if (j >= 0 && j < x.length && k < y.length) s += x[j] * y[k]; } lags.push(l); out.push(s); }
  return nout > 1 ? [row(out), row(lags)] : [row(out)];
});
def('freqz', (a, nout) => {
  const b = [...R(a[0]).d], den = a[1] ? [...R(a[1]).d] : [1], n = S(a[2], 512);
  const w = Array.from({ length: n }, (_, k) => (Math.PI * k) / n);
  const ev = (p: number[], t: number): [number, number] => p.reduce<[number, number]>((acc, c, k) => [acc[0] + c * Math.cos(-k * t), acc[1] + c * Math.sin(-k * t)], [0, 0]);
  const re: number[] = [], im: number[] = [];
  for (const t of w) { const [nr, ni] = ev(b, t), [dr, di] = ev(den, t), d = dr * dr + di * di; re.push((nr * dr + ni * di) / d); im.push((ni * dr - nr * di) / d); }
  return nout > 1 || nout < 0 ? [cmat(n, 1, re, im), mat(n, 1, w)] : [cmat(n, 1, re, im)];
});
const win = (names: string, fn: (k: number, n: number) => number) => def(names, (a) => { const n = scalar(a[0]); return [mat(n, 1, Array.from({ length: n }, (_, k) => (n === 1 ? 1 : fn(k, n))))]; });
win('hann hanning', (k, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1)));
win('hamming', (k, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (n - 1)));
win('blackman', (k, n) => 0.42 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * k) / (n - 1)));
win('rectwin', () => 1);
// movmean(x, k) and friends: odd k centres the window; even k takes k/2 before and k/2 − 1 after; ends shrink.
for (const [name, stat] of [['movmean', (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length], ['movsum', (v: number[]) => v.reduce((s, x) => s + x, 0)], ['movmax', (v: number[]) => Math.max(...v)], ['movmin', (v: number[]) => Math.min(...v)], ['movmedian', (v: number[]) => median(v)]] as const) {
  BUILTINS[name] = (a) => {
    const x = R(a[0]), k = scalar(a[1]), d = [...x.d];
    const before = k % 2 ? (k - 1) / 2 : k / 2, after = k - 1 - before;
    return [mat(x.r, x.c, d.map((_, i) => stat(d.slice(Math.max(0, i - before), Math.min(d.length, i + after + 1)))))];
  };
}

// ——— Statistics ———
function median(v: number[]) { const s = [...v].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
const columns = (m: Mat) => (isVec(m) ? [[...m.d]] : Array.from({ length: m.c }, (_, j) => [...m.d.subarray(j * m.r, (j + 1) * m.r)]));
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
function covMatrix(cols: number[][]): Mat {
  const n = cols[0].length, mus = cols.map(mean), k = cols.length, out = mat(k, k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let t = 0; t < n; t++) s += (cols[i][t] - mus[i]) * (cols[j][t] - mus[j]); out.d[i + j * k] = s / (n - 1); }
  return out;
}
def('cov', (a) => { const x = R(a[0]); const cols = a[1] && a[1].k === 'mat' ? [[...x.d], [...R(a[1]).d]] : columns(x); const c = covMatrix(cols); return [c.d.length === 1 ? c : c]; });
def('corrcoef corr', (a) => {
  const x = R(a[0]); const cols = a[1] && a[1].k === 'mat' ? [[...x.d], [...R(a[1]).d]] : columns(x);
  const c = covMatrix(cols), k = cols.length, out = mat(k, k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) out.d[i + j * k] = c.d[i + j * k] / Math.sqrt(c.d[i + i * k] * c.d[j + j * k]);
  return [out];
});
function quant(v: number[], p: number) {
  // MATLAB's prctile: values at (k − 0.5)/n, linear between them.
  const s = [...v].filter((x) => !Number.isNaN(x)).sort((x, y) => x - y), n = s.length;
  if (!n) return NaN;
  const pos = p * n - 0.5;
  if (pos <= 0) return s[0];
  if (pos >= n - 1) return s[n - 1];
  const lo = Math.floor(pos); return s[lo] + (pos - lo) * (s[lo + 1] - s[lo]);
}
def('prctile', (a) => { const x = R(a[0]), ps = [...R(a[1]).d]; const cols = columns(x); const out = cols.map((v) => ps.map((p) => quant(v, p / 100))); return [isVec(x) ? row(out[0]) : mat(ps.length, cols.length, out.flat())]; });
def('quantile', (a) => { const x = R(a[0]), ps = [...R(a[1]).d]; const cols = columns(x); const out = cols.map((v) => ps.map((p) => quant(v, p))); return [isVec(x) ? row(out[0]) : mat(ps.length, cols.length, out.flat())]; });
def('iqr', (a) => { const v = [...R(a[0]).d]; return [num(quant(v, 0.75) - quant(v, 0.25))]; });
def('zscore', (a) => { const x = R(a[0]), v = [...x.d], mu = mean(v), sd = Math.sqrt(v.reduce((s, y) => s + (y - mu) ** 2, 0) / (v.length - 1)); return [mat(x.r, x.c, v.map((y) => (y - mu) / sd))]; });
def('skewness', (a) => { const v = [...R(a[0]).d], mu = mean(v), m2 = mean(v.map((x) => (x - mu) ** 2)), m3 = mean(v.map((x) => (x - mu) ** 3)); return [num(m3 / m2 ** 1.5)]; });
def('kurtosis', (a) => { const v = [...R(a[0]).d], mu = mean(v), m2 = mean(v.map((x) => (x - mu) ** 2)), m4 = mean(v.map((x) => (x - mu) ** 4)); return [num(m4 / m2 ** 2)]; });
def('range', (a) => { const v = [...R(a[0]).d]; return [num(Math.max(...v) - Math.min(...v))]; });
def('histcounts', (a, nout) => {
  const v = [...R(a[0]).d].filter(Number.isFinite);
  let edges: number[];
  if (a[1] && a[1].k === 'mat' && a[1].d.length > 1) edges = [...a[1].d];
  else { const n = a[1] ? scalar(a[1]) : Math.max(1, Math.ceil(Math.sqrt(v.length))), lo = Math.min(...v), hi = Math.max(...v), w = (hi - lo || 1) / n; edges = Array.from({ length: n + 1 }, (_, k) => lo + k * w); }
  const counts = new Array(edges.length - 1).fill(0);
  for (const x of v) for (let k = 0; k < counts.length; k++) if (x >= edges[k] && (x < edges[k + 1] || (k === counts.length - 1 && x === edges[k + 1]))) { counts[k]++; break; }
  return nout > 1 ? [row(counts), row(edges)] : [row(counts)];
});
const erf = (x: number) => {
  // Abramowitz–Stegun 7.1.26 refined by a series near 0 (|error| < 1e-7, then a Newton polish for small x).
  if (Math.abs(x) < 0.5) { let s = 0, t = x, n = 0; while (Math.abs(t) > 1e-17) { s += t / (2 * n + 1); n++; t *= (-x * x) / n; } return (2 / Math.sqrt(Math.PI)) * s; }
  const sign = Math.sign(x), z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const y = 1 - t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return sign * y;
};
const map = (names: string, fn: (x: number, a: Value[]) => number) => def(names, (a) => { const x = R(a[0]); return [mat(x.r, x.c, x.d.map((v) => fn(v, a)))]; });
map('erf', erf); map('erfc', (x) => 1 - erf(x));
map('normpdf', (x, a) => { const mu = S(a[1], 0), s = S(a[2], 1); return Math.exp(-(((x - mu) / s) ** 2) / 2) / (s * Math.sqrt(2 * Math.PI)); });
map('normcdf', (x, a) => { const mu = S(a[1], 0), s = S(a[2], 1); return 0.5 * (1 + erf((x - mu) / (s * Math.SQRT2))); });
map('norminv', (p, a) => {
  const mu = S(a[1], 0), s = S(a[2], 1);
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  let z = 0; for (let k = 0; k < 60; k++) { const f = 0.5 * (1 + erf(z / Math.SQRT2)) - p, d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); const step = f / d; z -= step; if (Math.abs(step) < 1e-14) break; }
  return mu + s * z;
});
map('exppdf', (x, a) => { const m = S(a[1], 1); return x < 0 ? 0 : Math.exp(-x / m) / m; });
map('unifpdf', (x, a) => { const lo = S(a[1], 0), hi = S(a[2], 1); return x >= lo && x <= hi ? 1 / (hi - lo) : 0; });

// ——— Splines ———
def('spline', (a) => {
  // A cubic spline through (x, y) with MATLAB's "not-a-knot" ends (a cubic is reproduced exactly), evaluated at xq;
  // three points give the parabola through them.
  const x = [...R(a[0]).d], y = [...R(a[1]).d], q = R(a[2]), n = x.length;
  if (n < 2 || y.length !== n) throw new LabError('spline needs x and y of the same length, 2 points or more.');
  if (n < 4) {
    const A = mat(n, n); x.forEach((v, i) => { for (let j = 0; j < n; j++) A.d[i + j * n] = v ** (n - 1 - j); });
    const p = solve(A, mat(n, 1, y)).d;
    return [mat(q.r, q.c, q.d.map((v) => p.reduce((s, c) => s * v + c, 0)))];
  }
  const h = x.slice(1).map((v, i) => v - x[i]), A = mat(n, n), rhs = mat(n, 1);
  A.d[0] = h[1]; A.d[0 + n] = -(h[0] + h[1]); A.d[0 + 2 * n] = h[0];
  for (let i = 1; i < n - 1; i++) {
    A.d[i + (i - 1) * n] = h[i - 1]; A.d[i + i * n] = 2 * (h[i - 1] + h[i]); A.d[i + (i + 1) * n] = h[i];
    rhs.d[i] = 6 * ((y[i + 1] - y[i]) / h[i] - (y[i] - y[i - 1]) / h[i - 1]);
  }
  A.d[n - 1 + (n - 3) * n] = h[n - 2]; A.d[n - 1 + (n - 2) * n] = -(h[n - 3] + h[n - 2]); A.d[n - 1 + (n - 1) * n] = h[n - 3];
  const M2 = solve(A, rhs).d;
  return [mat(q.r, q.c, q.d.map((v) => {
    let k = 0; while (k < n - 2 && v > x[k + 1]) k++;
    const hk = h[k], l = x[k + 1] - v, r = v - x[k];
    return (M2[k] * l ** 3 + M2[k + 1] * r ** 3) / (6 * hk) + (y[k] / hk - (M2[k] * hk) / 6) * l + (y[k + 1] / hk - (M2[k + 1] * hk) / 6) * r;
  }))];
});

// ——— Derivatives on a grid (M380): gradient, del2, divergence, curl ———

/** Central differences inside, one-sided at the two ends, along rows (dir 'x': across columns) or down columns. */
function diffAlong(m: Mat, h: number[] | number, dir: 'x' | 'y'): Mat {
  const o = mat(m.r, m.c);
  const n = dir === 'x' ? m.c : m.r;
  const at = (i: number, j: number) => m.d[j * m.r + i];
  const coord = (k: number) => (Array.isArray(h) ? h[k] : k * h);
  for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) {
    const k = dir === 'x' ? j : i;
    const v = (q: number) => (dir === 'x' ? at(i, q) : at(q, j));
    o.d[j * m.r + i] = n < 2 ? 0 : k === 0 ? (v(1) - v(0)) / (coord(1) - coord(0)) : k === n - 1 ? (v(n - 1) - v(n - 2)) / (coord(n - 1) - coord(n - 2)) : (v(k + 1) - v(k - 1)) / (coord(k + 1) - coord(k - 1));
  }
  return o;
}
const spacing = (v: Value | undefined): number[] | number => { if (!v) return 1; const m = toMat(v); return m.d.length === 1 ? m.d[0] : [...m.d]; };
def('gradient', (a, nout) => {
  const F = R(a[0], 'The values');
  const hx = spacing(a[1]), hy = a[2] ? spacing(a[2]) : hx;
  if (isVec(F)) return [diffAlong(F, hx, F.r === 1 ? 'x' : 'y')];
  const fx = diffAlong(F, hx, 'x');
  return nout > 1 ? [fx, diffAlong(F, hy, 'y')] : [fx];
});
def('del2', (a) => {
  // MATLAB's scaling: (d²F/dx² + d²F/dy²) / 4, second differences inside, extrapolated in a straight line at the edges.
  const F = R(a[0], 'The values'), h = S(a[1], 1);
  const o = mat(F.r, F.c);
  const add = (dir: 'x' | 'y') => {
    const n = dir === 'x' ? F.c : F.r;
    if (n < 3) return;
    for (let i = 0; i < F.r; i++) for (let j = 0; j < F.c; j++) {
      const at = (k: number) => (dir === 'x' ? F.d[k * F.r + i] : F.d[j * F.r + k]);
      const d2 = (k: number) => (at(k + 1) - 2 * at(k) + at(k - 1)) / (h * h);
      const k = dir === 'x' ? j : i;
      o.d[j * F.r + i] += (k === 0 ? 2 * d2(1) - d2(2) : k === n - 1 ? 2 * d2(n - 2) - d2(n - 3) : d2(k)) / 4;
    }
  };
  add('x'); add('y');
  return [o];
});
def('divergence', (a) => {
  // divergence(X, Y, U, V) or divergence(U, V).
  const [X, Y, U, V] = a.length >= 4 ? a.map((v) => R(v)) : [null, null, R(a[0]), R(a[1])];
  const hx = X ? [...X.d.filter((_, k) => k % X.r === 0)] : 1, hy = Y ? [...Y.d.subarray(0, Y.r)] : 1;
  const du = diffAlong(U, hx, 'x'), dv = diffAlong(V, hy, 'y');
  return [mat(U.r, U.c, du.d.map((v, k) => v + dv.d[k]))];
});
def('curl', (a, nout) => {
  // 2D: curl(X, Y, U, V) or curl(U, V): the turning dV/dx − dU/dy, and the angular speed (half of it).
  const [X, Y, U, V] = a.length >= 4 ? a.map((v) => R(v)) : [null, null, R(a[0]), R(a[1])];
  const hx = X ? [...X.d.filter((_, k) => k % X.r === 0)] : 1, hy = Y ? [...Y.d.subarray(0, Y.r)] : 1;
  const dv = diffAlong(V, hx, 'x'), du = diffAlong(U, hy, 'y');
  const z = mat(U.r, U.c, dv.d.map((v, k) => v - du.d[k]));
  return nout > 1 ? [z, mat(U.r, U.c, z.d.map((v) => v / 2))] : [z];
});
