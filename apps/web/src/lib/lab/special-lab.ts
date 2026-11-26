import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import type { Lab } from './interp';
import { mat, str, toMat, type Mat, type Value } from './values';
import { integrate } from './calc-lab';
import { gammaln, norminv } from './stats';

// Hyperion's special maths (M558; what GNU Octave's core and packages offer here: pkg-funm-schur-parlett, chebfun's
// basics, octave-miscellaneous), our own code from the definitions: expm (scaling and squaring with a Padé
// approximant), sqrtm (Denman–Beavers), logm (inverse scaling and squaring), funm (through the eigenvectors of a
// matrix with real eigenvalues); Bessel J, Y, I, K of any real order and the Airy functions (their integral forms,
// integrated adaptively), lambertw, erfinv / erfcinv, ellipke (the arithmetic–geometric mean), expint (E₁), legendre
// (associated, with MATLAB's sign), perms, rat / rats (continued fractions), and Chebyshev approximations
// (chebcoeffs / chebval / chebroots). gammainc and betainc are in stats-lab.ts; vpa in sym-lab.ts.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const each = (name: string, f: (x: number, ...p: number[]) => number, argAt = 0) => def(name, (a) => {
  // MATLAB's order varies (besselj(nu, x)): `argAt` is the elementwise argument, the others scalars.
  const x = toMat(a[argAt], 'The argument'), p = a.filter((_, i) => i !== argAt).map((v) => toMat(v).d[0]), out = mat(x.r, x.c);
  out.d = Float64Array.from(x.d, (v) => f(v, ...p));
  return [out];
});

// ——— Matrices as rows (small dense helpers) ———
type M2 = number[][];
const rowsOf = (m: Mat): M2 => Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]));
const toLab = (A: M2) => { const r = A.length, c = A[0]?.length ?? 0, m = mat(r, c); A.forEach((row, i) => row.forEach((v, j) => { m.d[i + j * r] = v; })); return m; };
const eye = (n: number): M2 => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const mul = (A: M2, B: M2): M2 => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
const add = (A: M2, B: M2, b = 1): M2 => A.map((row, i) => row.map((v, j) => v + b * B[i][j]));
const scale = (A: M2, s: number): M2 => A.map((row) => row.map((v) => v * s));
const norm1 = (A: M2) => Math.max(...A[0].map((_, j) => A.reduce((s, row) => s + Math.abs(row[j]), 0)));
function inv(A: M2): M2 {
  const n = A.length, M = A.map((row, i) => [...row, ...eye(n)[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) throw new LabError('The matrix is singular.');
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((row) => row.slice(n));
}
const square = (v: Value, what: string) => { const m = toMat(v, what); if (m.r !== m.c) throw new LabError(`${what} must be square.`); if (m.im) throw new LabError(`${what}: complex matrices aren’t supported here yet.`); return rowsOf(m); };

/** e^A by scaling and squaring with the [6/6] Padé approximant. */
export function expm(A: M2): M2 {
  const n = A.length, s = Math.max(0, Math.ceil(Math.log2(norm1(A) / 0.5)) + 1), X = scale(A, 2 ** -s);
  const c = [1, 1 / 2, 5 / 44, 1 / 66, 1 / 792, 1 / 15840, 1 / 665280];
  let P = eye(n), Q = eye(n), Xk = eye(n);
  for (let k = 1; k <= 6; k++) { Xk = mul(Xk, X); P = add(P, scale(Xk, c[k])); Q = add(Q, scale(Xk, (k % 2 ? -1 : 1) * c[k])); }
  let E = mul(inv(Q), P);
  for (let k = 0; k < s; k++) E = mul(E, E);
  return E;
}
/** The principal square root by Denman–Beavers (no eigenvalues on the negative real axis). */
export function sqrtm(A: M2): M2 {
  let Y = A, Z = eye(A.length);
  for (let k = 0; k < 100; k++) {
    const Yi = inv(Y), Zi = inv(Z), Y2 = scale(add(Y, Zi), 0.5), Z2 = scale(add(Z, Yi), 0.5), d = norm1(add(Y2, Y, -1));
    Y = Y2; Z = Z2;
    if (d <= 1e-14 * norm1(Y)) break;
  }
  return Y;
}
/** The principal logarithm: square roots until near I, the series of log(I + X), times 2^k. */
export function logm(A: M2): M2 {
  const n = A.length;
  let B = A, k = 0;
  while (norm1(add(B, eye(n), -1)) > 0.25 && k < 50) { B = sqrtm(B); k++; }
  const X = add(B, eye(n), -1);
  let L = scale(X, 0), P = eye(n);
  for (let j = 1; j <= 40; j++) { P = mul(P, X); L = add(L, scale(P, (j % 2 ? 1 : -1) / j)); if (norm1(P) / j < 1e-17) break; }
  return scale(L, 2 ** k);
}
def('expm', (a) => [toLab(expm(square(a[0], 'expm’s matrix')))]);
def('sqrtm', (a) => [toLab(sqrtm(square(a[0], 'sqrtm’s matrix')))]);
def('logm', (a) => [toLab(logm(square(a[0], 'logm’s matrix')))]);
def('funm', (a, _n, lab: Lab) => {
  // V·f(D)·V⁻¹ for a diagonalisable matrix with real eigenvalues.
  const A = square(a[0], 'funm’s matrix'), fn = a[1];
  if (!fn || fn.k !== 'fn') throw new LabError('funm(A, @fun): fun is a function such as @exp or @(x) x.^2.');
  const [V, D] = BUILTINS.eig([toLab(A)], 2, lab) as Mat[];
  if (V.im?.some((v) => Math.abs(v) > 1e-12) || D.im?.some((v) => Math.abs(v) > 1e-12)) throw new LabError('funm here needs a matrix with real eigenvalues (use expm, logm or sqrtm otherwise).');
  const n = A.length, d = Array.from({ length: n }, (_, i) => D.d[i + i * n]);
  const fd = [...toMat(lab.callFn(fn, [mat(n, 1, d)])[0], 'The function’s values').d], Vr = rowsOf(V);
  const F = Vr.map((row, i) => row.map((_, j) => (i === j ? fd[i] : 0)));
  return [toLab(mul(mul(Vr, F), inv(Vr)))];
});

// ——— Bessel and Airy (integral forms) ———
/** The upper end where e^(νt − x·g(t)) has fallen below e^−40. */
const tEnd = (x: number, nu: number, g: (t: number) => number) => { let t = 1; while (x * g(t) - Math.abs(nu) * t < 45 && t < 700) t *= 1.5; return t; };
export function besselj(nu: number, x: number): number {
  if (x === 0) return nu === 0 ? 1 : 0;
  if (x < 0) { if (Number.isInteger(nu)) return (nu % 2 ? -1 : 1) * besselj(nu, -x); return NaN; }
  const a = integrate((th) => Math.cos(nu * th - x * Math.sin(th)), 0, Math.PI, 1e-13) / Math.PI;
  if (Number.isInteger(nu)) return a;
  return a - (Math.sin(nu * Math.PI) / Math.PI) * integrate((t) => Math.exp(-x * Math.sinh(t) - nu * t), 0, tEnd(x, -nu, Math.sinh), 1e-13);
}
export function bessely(nu: number, x: number): number {
  if (x <= 0) return x === 0 ? -Infinity : NaN;
  const a = integrate((th) => Math.sin(x * Math.sin(th) - nu * th), 0, Math.PI, 1e-13) / Math.PI;
  return a - integrate((t) => (Math.exp(nu * t) + Math.exp(-nu * t) * Math.cos(nu * Math.PI)) * Math.exp(-x * Math.sinh(t)), 0, tEnd(x, nu, Math.sinh), 1e-13) / Math.PI;
}
export function besseli(nu: number, x: number): number {
  if (x === 0) return nu === 0 ? 1 : 0;
  if (x < 0) { if (Number.isInteger(nu)) return (nu % 2 ? -1 : 1) * besseli(nu, -x); return NaN; }
  // Scaled by e^−x inside, so large x doesn't overflow the integrand.
  const a = (Math.exp(x) / Math.PI) * integrate((th) => Math.exp(x * (Math.cos(th) - 1)) * Math.cos(nu * th), 0, Math.PI, 1e-13);
  if (Number.isInteger(nu)) return a;
  return a - (Math.sin(nu * Math.PI) / Math.PI) * integrate((t) => Math.exp(-x * Math.cosh(t) - nu * t), 0, tEnd(x, -nu, Math.cosh), 1e-13);
}
export function besselk(nu: number, x: number): number {
  if (x <= 0) return x === 0 ? Infinity : NaN;
  return integrate((t) => Math.exp(-x * Math.cosh(t)) * Math.cosh(nu * t), 0, tEnd(x, nu, Math.cosh), 1e-13);
}
/** Airy Ai (k = 0) and Bi (k = 2) from the Bessel functions of order 1/3. */
export function airy(k: number, x: number): number {
  const z = (2 / 3) * Math.abs(x) ** 1.5, r = Math.sqrt(Math.abs(x));
  if (x === 0) return k === 0 ? 1 / (3 ** (2 / 3) * Math.exp(gammaln(2 / 3))) : 1 / (3 ** (1 / 6) * Math.exp(gammaln(2 / 3)));
  if (k === 0) return x > 0 ? (r / Math.PI) * Math.sqrt(1 / 3) * besselk(1 / 3, z) : (r / 2) * (besselj(1 / 3, z) - bessely(1 / 3, z) / Math.sqrt(3));
  if (k === 2) return x > 0 ? (r / Math.sqrt(3)) * (besseli(-1 / 3, z) + besseli(1 / 3, z)) : -(r / 2) * (besselj(1 / 3, z) / Math.sqrt(3) + bessely(1 / 3, z));
  throw new LabError('airy(k, x): k is 0 (Ai) or 2 (Bi).');
}
each('besselj', (x, nu) => besselj(nu, x), 1);
each('bessely', (x, nu) => bessely(nu, x), 1);
each('besseli', (x, nu) => besseli(nu, x), 1);
each('besselk', (x, nu) => besselk(nu, x), 1);
def('airy', (a) => { const k = a.length > 1 ? toMat(a[0]).d[0] : 0, x = toMat(a[a.length - 1]), out = mat(x.r, x.c); out.d = Float64Array.from(x.d, (v) => airy(k, v)); return [out]; });

// ——— Other special functions ———
/** Lambert W: w·e^w = x (branch 0, or −1 for −1/e ≤ x < 0), by Halley's iterations. */
export function lambertw(x: number, branch = 0): number {
  if (x < -1 / Math.E) return NaN;
  if (x === 0) return branch === 0 ? 0 : -Infinity;
  let w = branch === -1 ? (x > -0.25 ? Math.log(-x) - Math.log(-Math.log(-x)) : -1 - Math.sqrt(2 * (1 + Math.E * x))) : x < 1 ? (x > -0.3 ? x * (1 - x) : -1 + Math.sqrt(2 * (1 + Math.E * x))) : Math.log(x) - Math.log(Math.log(x) || 1);
  for (let i = 0; i < 100; i++) { const e = Math.exp(w), f = w * e - x, d = e * (w + 1) - ((w + 2) * f) / (2 * w + 2); const step = f / d; w -= step; if (Math.abs(step) <= 1e-15 * (1 + Math.abs(w))) break; }
  return w;
}
def('lambertw', (a) => { const two = a.length > 1, k = two ? toMat(a[0]).d[0] : 0, x = toMat(a[two ? 1 : 0]), out = mat(x.r, x.c); out.d = Float64Array.from(x.d, (v) => lambertw(v, k)); return [out]; });
each('erfinv', (y) => (y <= -1 ? (y === -1 ? -Infinity : NaN) : y >= 1 ? (y === 1 ? Infinity : NaN) : norminv((y + 1) / 2) / Math.SQRT2));
each('erfcinv', (y) => (y <= 0 ? (y === 0 ? Infinity : NaN) : y >= 2 ? (y === 2 ? -Infinity : NaN) : -norminv(y / 2) / Math.SQRT2));
/** Complete elliptic integrals K(m) and E(m) by the arithmetic–geometric mean. */
export function ellipke(m: number): [number, number] {
  if (m === 1) return [Infinity, 1];
  let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m), sum = (c * c) / 2, p = 1;
  for (let i = 0; i < 60 && Math.abs(c) > 1e-16; i++) { const a2 = (a + b) / 2, b2 = Math.sqrt(a * b); c = (a - b) / 2; a = a2; b = b2; p *= 2; sum += (p * c * c) / 2; }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}
def('ellipke', (a) => { const m = toMat(a[0]), K = mat(m.r, m.c), E = mat(m.r, m.c); [...m.d].forEach((v, i) => { const [k, e] = ellipke(v); K.d[i] = k; E.d[i] = e; }); return [K, E]; });
/** The exponential integral E₁(x) for x > 0: its series below 1, a continued fraction above. */
export function expint(x: number): number {
  if (x <= 0) return x === 0 ? Infinity : NaN;
  if (x < 1) { let s = -0.5772156649015329 - Math.log(x), t = 1; for (let k = 1; k < 100; k++) { t *= -x / k; const d = -t / k; s += d; if (Math.abs(d) < 1e-17) break; } return s; }
  let b = x + 1, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * i; b += 2; d = 1 / (an * d + b); c = b + an / c; const del = c * d; h *= del; if (Math.abs(del - 1) < 1e-16) break; }
  return h * Math.exp(-x);
}
each('expint', (x) => expint(x));
def('legendre', (a) => {
  // P_n^m(x) for m = 0..n, with the Condon–Shortley sign (−1)^m as MATLAB: rows m, columns the points.
  const n = toMat(a[0]).d[0], x = [...toMat(a[1]).d], out = mat(n + 1, x.length);
  x.forEach((v, j) => {
    for (let m = 0; m <= n; m++) {
      let pmm = 1;
      const s = Math.sqrt((1 - v) * (1 + v));
      for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s;
      let val = pmm;
      if (n > m) { let p1 = v * (2 * m + 1) * pmm, p0 = pmm; for (let l = m + 2; l <= n; l++) { const p2 = ((2 * l - 1) * v * p1 - (l + m - 1) * p0) / (l - m); p0 = p1; p1 = p2; } val = n === m ? pmm : p1; }
      out.d[m + j * (n + 1)] = val;
    }
  });
  return [out];
});

// ——— Counting and fractions ———
def('perms', (a) => {
  // All orders, reverse lexicographic by position (MATLAB's order).
  const v = [...toMat(a[0]).d], n = v.length;
  if (n > 10) throw new LabError('perms of more than 10 items would be over 3 million rows.');
  const rows: number[][] = [], idx = v.map((_, i) => i);
  const go = (pre: number[], rest: number[]) => { if (!rest.length) { rows.push(pre); return; } for (let i = rest.length - 1; i >= 0; i--) go([...pre, rest[i]], rest.filter((_, k) => k !== i)); };
  go([], idx);
  const out = mat(rows.length, n);
  rows.forEach((r, i) => r.forEach((k, j) => { out.d[i + j * rows.length] = v[k]; }));
  return [out];
});
/** The continued-fraction approximation p/q of x within tol. */
export function rat(x: number, tol: number): [number, number] {
  if (!Number.isFinite(x)) return [Math.sign(x), 0];
  let [p0, q0, p1, q1] = [1, 0, Math.round(x), 1], r = x - Math.round(x);
  for (let i = 0; i < 64 && Math.abs(x - p1 / q1) > tol && r !== 0; i++) { const y = 1 / r, a = Math.round(y); r = y - a; [p0, q0, p1, q1] = [p1, q1, a * p1 + p0, a * q1 + q0]; }
  return q1 < 0 ? [-p1, -q1] : [p1, q1];
}
def('rat', (a) => {
  const x = toMat(a[0]), tol = a[1] ? toMat(a[1]).d[0] : 1e-6 * Math.max(...[...x.d].map(Math.abs)), N = mat(x.r, x.c), D = mat(x.r, x.c);
  [...x.d].forEach((v, i) => { const [p, q] = rat(v, tol); N.d[i] = p; D.d[i] = q; });
  return [N, D];
});
def('rats', (a) => { const x = [...toMat(a[0]).d]; return [str(x.map((v) => { const [p, q] = rat(v, Math.max(1e-10, Math.abs(v) * 1e-10)); return q === 1 ? String(p) : `${p}/${q}`; }).join('  '))]; });

// ——— Chebyshev approximations (the basics of chebfun) ———
/** Coefficients of the degree-n Chebyshev interpolant of f on [a, b] (at the Chebyshev points of the first kind). */
export function chebcoeffs(f: (x: number) => number, n: number, a = -1, b = 1): number[] {
  const N = n + 1, fx = Array.from({ length: N }, (_, k) => f(((b - a) / 2) * Math.cos((Math.PI * (k + 0.5)) / N) + (a + b) / 2));
  return Array.from({ length: N }, (_, j) => ((j ? 2 : 1) / N) * fx.reduce((s, v, k) => s + v * Math.cos((Math.PI * j * (k + 0.5)) / N), 0));
}
/** Clenshaw's sum of a Chebyshev series at x on [a, b]. */
export function chebval(c: number[], x: number, a = -1, b = 1): number {
  const t = (2 * x - a - b) / (b - a);
  let b1 = 0, b2 = 0;
  for (let j = c.length - 1; j >= 1; j--) { const b0 = 2 * t * b1 - b2 + c[j]; b2 = b1; b1 = b0; }
  return t * b1 - b2 + c[0];
}
const range = (v: Value | undefined): [number, number] => { if (!v) return [-1, 1]; const d = toMat(v).d; return [d[0], d[1]]; };
def('chebcoeffs', (a, _n, lab) => {
  const fn = a[0];
  if (!fn || fn.k !== 'fn') throw new LabError('chebcoeffs(@f, n, [a b]): a function, a degree, an interval.');
  const n = a[1] ? toMat(a[1]).d[0] : 32, [lo, hi] = range(a[2]), c = chebcoeffs((x) => toMat(lab.callFn(fn, [mat(1, 1, [x])])[0]).d[0], n, lo, hi);
  return [mat(1, c.length, c)];
});
def('chebval', (a) => { const c = [...toMat(a[0]).d], x = toMat(a[1]), [lo, hi] = range(a[2]), out = mat(x.r, x.c); out.d = Float64Array.from(x.d, (v) => chebval(c, v, lo, hi)); return [out]; });
def('chebroots', (a, _n, lab) => {
  // The real roots in [a, b]: the eigenvalues of the colleague matrix of the (trimmed) Chebyshev series.
  const c = [...toMat(a[0]).d], [lo, hi] = range(a[1]);
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-13 * Math.max(...c.map(Math.abs))) c.pop();
  const n = c.length - 1;
  if (n < 1) return [mat(0, 1)];
  const C = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n - 1; i++) { C[i][i + 1] = 0.5; C[i + 1][i] = 0.5; }
  C[0][1] = 1;
  for (let j = 0; j < n; j++) C[n - 1][j] -= c[j] / (2 * c[n]);
  const [D] = BUILTINS.eig([toLab(C)], 1, lab) as Mat[];
  const roots = [...D.d].map((re, i) => ({ re, im: D.im?.[i] ?? 0 })).filter((z) => Math.abs(z.im) < 1e-8 && Math.abs(z.re) <= 1 + 1e-8).map((z) => {
    // A few Newton steps on the series itself polish each root to full precision.
    let t = Math.max(-1, Math.min(1, z.re));
    for (let k = 0; k < 8; k++) { const f = chebval(c, t), h = 1e-7, d = (chebval(c, t + h) - chebval(c, t - h)) / (2 * h); if (!d) break; const step = f / d; t -= step; if (Math.abs(step) < 1e-15) break; }
    return ((hi - lo) / 2) * t + (lo + hi) / 2;
  }).sort((x, y) => x - y);
  return [mat(roots.length, 1, roots)];
});
