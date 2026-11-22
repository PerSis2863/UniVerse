import { LabError } from './parse';
import { cmat, imOf, mat, type Mat } from './values';

// Hyperion's complex numbers (M377): a complex matrix keeps its imaginary parts beside the real ones (`im`).
// Here: element-wise operators with implicit expansion, matrix product and solve, powers, and the maths functions
// that need them (sqrt and log of negatives give complex answers, as in MATLAB). Our own code.

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  if (d === 0) return [a[0] === 0 && a[1] === 0 ? NaN : a[0] / 0, a[1] === 0 ? (a[0] === 0 ? NaN : 0) : a[1] / 0];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
export const cexp = (a: C): C => { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; };
export const clog = (a: C): C => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
export const csqrt = (a: C): C => { const r = Math.hypot(a[0], a[1]); const re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };
const cpow = (a: C, b: C): C => {
  if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {
    let r: C = [1, 0], base: C = b[0] < 0 ? cdiv([1, 0], a) : a, n = Math.abs(b[0]);
    while (n > 0) { if (n & 1) r = cmul(r, base); base = cmul(base, base); n >>= 1; }
    return r;
  }
  if (a[0] === 0 && a[1] === 0) return b[0] === 0 && b[1] === 0 ? [1, 0] : [0, 0];
  return cexp(cmul(b, clog(a)));
};

/** Element by element on two complex (or real) matrices, with implicit expansion. */
export function czip(A: Mat, B: Mat, fn: (a: C, b: C) => C): Mat {
  const r = A.r === B.r ? A.r : A.r === 1 ? B.r : B.r === 1 ? A.r : -1;
  const c = A.c === B.c ? A.c : A.c === 1 ? B.c : B.c === 1 ? A.c : -1;
  if (r < 0 || c < 0) throw new LabError(`Sizes don’t match: ${A.r}x${A.c} and ${B.r}x${B.c}.`);
  const ai = imOf(A), bi = imOf(B), re = new Float64Array(r * c), im = new Float64Array(r * c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) {
    const ka = (A.r === 1 ? 0 : i) + (A.c === 1 ? 0 : j) * A.r, kb = (B.r === 1 ? 0 : i) + (B.c === 1 ? 0 : j) * B.r;
    const v = fn([A.d[ka], ai[ka]], [B.d[kb], bi[kb]]);
    re[i + j * r] = v[0]; im[i + j * r] = v[1];
  }
  return cmat(r, c, re, im);
}
/** A function of one complex number over a matrix. */
export const cmap = (A: Mat, fn: (a: C) => C): Mat => {
  const ai = imOf(A), re = new Float64Array(A.d.length), im = new Float64Array(A.d.length);
  for (let k = 0; k < A.d.length; k++) { const v = fn([A.d[k], ai[k]]); re[k] = v[0]; im[k] = v[1]; }
  return cmat(A.r, A.c, re, im);
};

const real = (m: Mat) => mat(m.r, m.c, m.d);
const imag = (m: Mat) => mat(m.r, m.c, imOf(m));
function mm(a: Mat, b: Mat): Mat {
  if (a.c !== b.r) throw new LabError(`Can’t multiply a ${a.r}x${a.c} by a ${b.r}x${b.c} matrix: the inner sizes must match.`);
  const d = new Float64Array(a.r * b.c);
  for (let j = 0; j < b.c; j++) for (let k = 0; k < a.c; k++) { const bk = b.d[k + j * b.r]; if (bk) for (let i = 0; i < a.r; i++) d[i + j * a.r] += a.d[i + k * a.r] * bk; }
  return mat(a.r, b.c, d);
}
/** (Ar + i Ai)(Br + i Bi) = (Ar Br − Ai Bi) + i (Ar Bi + Ai Br). */
export function cmatmul(A: Mat, B: Mat): Mat {
  const ar = real(A), ai = imag(A), br = real(B), bi = imag(B);
  const p = mm(ar, br), q = mm(ai, bi), s = mm(ar, bi), t = mm(ai, br);
  return cmat(p.r, p.c, p.d.map((x, k) => x - q.d[k]), s.d.map((x, k) => x + t.d[k]));
}
/** A \ B for complex matrices, as the real system [Ar −Ai; Ai Ar] [xr; xi] = [br; bi]. */
export function csolve(A: Mat, B: Mat, solve: (a: Mat, b: Mat) => Mat): Mat {
  const n = A.r, m = A.c, ar = real(A), ai = imag(A);
  const big = mat(2 * n, 2 * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
    const re = ar.d[i + j * n], im = ai.d[i + j * n];
    big.d[i + j * 2 * n] = re; big.d[i + (j + m) * 2 * n] = -im;
    big.d[i + n + j * 2 * n] = im; big.d[i + n + (j + m) * 2 * n] = re;
  }
  const rhs = mat(2 * n, B.c), bi = imOf(B);
  for (let j = 0; j < B.c; j++) for (let i = 0; i < n; i++) { rhs.d[i + j * 2 * n] = B.d[i + j * n]; rhs.d[i + n + j * 2 * n] = bi[i + j * n]; }
  const x = solve(big, rhs);
  const re = new Float64Array(m * B.c), im = new Float64Array(m * B.c);
  for (let j = 0; j < B.c; j++) for (let i = 0; i < m; i++) { re[i + j * m] = x.d[i + j * 2 * m]; im[i + j * m] = x.d[i + m + j * 2 * m]; }
  return cmat(m, B.c, re, im);
}

/** The operators for complex matrices (the interpreter calls this when either side is complex). */
export function cbinop(op: string, A: Mat, B: Mat, solve: (a: Mat, b: Mat) => Mat): Mat {
  const scalar = (m: Mat) => m.r === 1 && m.c === 1;
  const logic = (fn: (a: C, b: C) => boolean) => ({ ...czip(A, B, (a, b) => [+fn(a, b), 0]), logical: true });
  switch (op) {
    case '+': return czip(A, B, (a, b) => [a[0] + b[0], a[1] + b[1]]);
    case '-': return czip(A, B, (a, b) => [a[0] - b[0], a[1] - b[1]]);
    case '.*': return czip(A, B, cmul);
    case './': return czip(A, B, cdiv);
    case '.\\': return czip(A, B, (a, b) => cdiv(b, a));
    case '.^': return czip(A, B, cpow);
    case '*': return scalar(A) || scalar(B) ? czip(A, B, cmul) : cmatmul(A, B);
    case '/': if (scalar(B)) return czip(A, B, cdiv); break;
    case '\\': if (scalar(A)) return czip(A, B, (a, b) => cdiv(b, a)); return csolve(A, B, solve);
    case '^': if (scalar(A) && scalar(B)) return czip(A, B, cpow); break;
    case '==': return logic((a, b) => a[0] === b[0] && a[1] === b[1]);
    case '~=': return logic((a, b) => a[0] !== b[0] || a[1] !== b[1]);
    // MATLAB compares the real parts.
    case '<': return logic((a, b) => a[0] < b[0]);
    case '<=': return logic((a, b) => a[0] <= b[0]);
    case '>': return logic((a, b) => a[0] > b[0]);
    case '>=': return logic((a, b) => a[0] >= b[0]);
    case '&': return logic((a, b) => (a[0] !== 0 || a[1] !== 0) && (b[0] !== 0 || b[1] !== 0));
    case '|': return logic((a, b) => a[0] !== 0 || a[1] !== 0 || b[0] !== 0 || b[1] !== 0);
  }
  throw new LabError(`“${op}” with complex matrices isn’t supported yet (it works on single complex numbers).`);
}

/** Eigenvalues of any real square matrix (Hessenberg form, then shifted QR): complex pairs where they occur. */
export function eigvals(A: Mat): { re: number[]; im: number[] } {
  const n = A.r;
  const a = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => A.d[i + j * n]));
  // Reduce to upper Hessenberg form by Householder reflections.
  for (let k = 0; k < n - 2; k++) {
    let alpha = 0; for (let i = k + 1; i < n; i++) alpha += a[i][k] ** 2;
    alpha = Math.sqrt(alpha); if (alpha === 0) continue;
    if (a[k + 1][k] > 0) alpha = -alpha;
    const v = new Array(n).fill(0); v[k + 1] = a[k + 1][k] - alpha; for (let i = k + 2; i < n; i++) v[i] = a[i][k];
    const vv = v.reduce((s, x) => s + x * x, 0); if (vv === 0) continue;
    for (let j = 0; j < n; j++) { let s = 0; for (let i = k + 1; i < n; i++) s += v[i] * a[i][j]; s = (2 * s) / vv; for (let i = k + 1; i < n; i++) a[i][j] -= s * v[i]; }
    for (let i = 0; i < n; i++) { let s = 0; for (let j = k + 1; j < n; j++) s += a[i][j] * v[j]; s = (2 * s) / vv; for (let j = k + 1; j < n; j++) a[i][j] -= s * v[j]; }
  }
  const re: number[] = new Array(n).fill(0), im: number[] = new Array(n).fill(0);
  let hi = n - 1, iter = 0;
  while (hi >= 0) {
    if (hi === 0) { re[0] = a[0][0]; hi--; continue; }
    // A small subdiagonal splits the matrix.
    let l = hi;
    while (l > 0 && Math.abs(a[l][l - 1]) > 1e-14 * (Math.abs(a[l][l]) + Math.abs(a[l - 1][l - 1]))) l--;
    if (l === hi) { re[hi] = a[hi][hi]; hi--; iter = 0; continue; }
    if (l === hi - 1) {
      // A 2×2 block: its two eigenvalues (a complex pair when the discriminant is negative).
      const p = a[hi - 1][hi - 1], q = a[hi - 1][hi], r = a[hi][hi - 1], s = a[hi][hi];
      const tr = p + s, det = p * s - q * r, disc = (tr * tr) / 4 - det;
      if (disc >= 0) { const sq = Math.sqrt(disc); re[hi - 1] = tr / 2 + sq; re[hi] = tr / 2 - sq; }
      else { const sq = Math.sqrt(-disc); re[hi - 1] = re[hi] = tr / 2; im[hi - 1] = sq; im[hi] = -sq; }
      hi -= 2; iter = 0; continue;
    }
    if (++iter > 500) throw new LabError('eig didn’t settle for this matrix.');
    // One shifted QR step on rows/columns l..hi (Wilkinson shift; an exceptional shift now and then).
    const mu = iter % 11 === 0 ? a[hi][hi] + Math.abs(a[hi][hi - 1]) : wilkinson(a[hi - 1][hi - 1], a[hi - 1][hi], a[hi][hi - 1], a[hi][hi]);
    for (let i = l; i <= hi; i++) a[i][i] -= mu;
    const rot: [number, number][] = [];
    for (let k = l; k < hi; k++) {
      const x = a[k][k], y = a[k + 1][k], h = Math.hypot(x, y) || 1, c = x / h, s = y / h;
      rot.push([c, s]);
      for (let j = k; j < n; j++) { const t1 = a[k][j], t2 = a[k + 1][j]; a[k][j] = c * t1 + s * t2; a[k + 1][j] = -s * t1 + c * t2; }
    }
    rot.forEach(([c, s], idx) => { const k = l + idx; for (let i = 0; i <= Math.min(hi, k + 2); i++) { const t1 = a[i][k], t2 = a[i][k + 1]; a[i][k] = c * t1 + s * t2; a[i][k + 1] = -s * t1 + c * t2; } });
    for (let i = l; i <= hi; i++) a[i][i] += mu;
  }
  return { re, im };
}
function wilkinson(p: number, q: number, r: number, s: number) {
  const tr = p + s, det = p * s - q * r, disc = (tr * tr) / 4 - det;
  if (disc < 0) return tr / 2;
  const a = tr / 2 + Math.sqrt(disc), b = tr / 2 - Math.sqrt(disc);
  return Math.abs(a - s) < Math.abs(b - s) ? a : b;
}
