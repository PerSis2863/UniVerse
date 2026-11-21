import { LabError, parse } from './parse';
import { bool, empty, fmtNum, inline, isScalar, kind, mat, num, numel, render, row, scalar, sizeOf, str, toMat, truthy, type Cell, type Mat, type Struct, type Value } from './values';
import type { Lab } from './interp';
import { concat, eye, inv, map1, matmul, range, solve, textOf, transpose, zip } from './interp';

// UniVerse Lab's built-in functions (M374): written for UniVerse from the functions' documented behaviour (no code
// from MATLAB or GNU Octave). Each takes the values passed in and how many outputs were asked for (0 when the result
// isn't used, -1 for "all of them"), and gives its outputs back.

export type Builtin = (args: Value[], nout: number, lab: Lab, frame?: unknown) => Value[];
export const BUILTINS: Record<string, Builtin> = {};
const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };

const M = (v: Value, what?: string) => toMat(v, what);
const S = (v: Value | undefined, what: string, dflt?: number) => (v === undefined ? (dflt ?? (() => { throw new LabError(`${what} is missing.`); })()) : scalar(v, what));
const need = (args: Value[], n: number, name: string) => { if (args.length < n) throw new LabError(`${name} needs ${n} input${n === 1 ? '' : 's'}.`); };
/** Sizes like zeros(3), zeros(2, 3), zeros([2 3]). */
function dims(args: Value[]): [number, number] {
  const nums = args.filter((a) => a.k !== 'str');
  if (!nums.length) return [1, 1];
  if (nums.length === 1) { const m = M(nums[0]); return m.d.length >= 2 ? [m.d[0], m.d[1]] : [m.d[0], m.d[0]]; }
  return [scalar(nums[0]), scalar(nums[1])];
}
const fill = (args: Value[], fn: (i: number) => number) => { const [r, c] = dims(args); if (r < 0 || c < 0 || !Number.isInteger(r) || !Number.isInteger(c)) throw new LabError('Sizes must be whole numbers, 0 or more.'); if (r * c > 5e7) throw new LabError('That’s too big (over 50 million numbers).'); return mat(r, c, Float64Array.from({ length: r * c }, (_, i) => fn(i))); };

// ——— Making matrices ———
def('zeros', (a) => [fill(a, () => 0)]);
def('ones', (a) => [fill(a, () => 1)]);
def('eye', (a) => { const [r, c] = dims(a); return [eye(r, c)]; });
def('rand', (a) => [fill(a, () => Math.random())]);
def('randn', (a) => [fill(a, () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); })]);
def('randi', (a) => { need(a, 1, 'randi'); const lim = M(a[0]); const [lo, hi] = lim.d.length > 1 ? [lim.d[0], lim.d[1]] : [1, lim.d[0]]; return [fill(a.slice(1), () => lo + Math.floor(Math.random() * (hi - lo + 1)))]; });
def('linspace', (a) => { need(a, 2, 'linspace'); const x = S(a[0], 'The start'), y = S(a[1], 'The end'), n = S(a[2], 'n', 100); return [row(Array.from({ length: n }, (_, i) => (n === 1 ? y : x + ((y - x) * i) / (n - 1))))]; });
def('logspace', (a) => { const x = S(a[0], 'The start'), y = S(a[1], 'The end'), n = S(a[2], 'n', 50); return [row(Array.from({ length: n }, (_, i) => 10 ** (n === 1 ? y : x + ((y - x) * i) / (n - 1))))]; });
def('colon', (a) => [range(S(a[0], 'The start'), a.length > 2 ? S(a[1], 'The step') : 1, S(a[a.length - 1], 'The end'))]);
def('magic', (a) => [magic(S(a[0], 'n'))]);
def('repmat', (a) => {
  const m = a[0], [rr, cc] = dims(a.slice(1));
  return [concat(Array.from({ length: rr }, () => Array.from({ length: cc }, () => m)))];
});
def('reshape', (a) => {
  const m = M(a[0]); let [r, c] = dims(a.slice(1));
  if (a.length > 2 && numel(a[1]) === 0) r = m.d.length / c;
  if (a.length > 2 && numel(a[2]) === 0) c = m.d.length / r;
  if (r * c !== m.d.length) throw new LabError(`Can’t reshape ${m.d.length} elements into ${r}x${c}.`);
  return [{ ...mat(r, c, m.d), ...(m.logical ? { logical: true } : {}) }];
});
def('cat', (a) => [S(a[0], 'The dimension') === 1 ? concat(a.slice(1).map((x) => [x])) : concat([a.slice(1)])]);
def('horzcat', (a) => [concat([a])]);
def('vertcat', (a) => [concat(a.map((x) => [x]))]);
def('meshgrid', (a, nout) => {
  const x = M(a[0]), y = a[1] ? M(a[1]) : x, r = y.d.length, c = x.d.length;
  const X = mat(r, c), Y = mat(r, c);
  for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { X.d[i + j * r] = x.d[j]; Y.d[i + j * r] = y.d[i]; }
  return nout > 1 || nout < 0 ? [X, Y] : [X];
});
def('diag', (a) => {
  const m = M(a[0]), k = S(a[1], 'k', 0);
  if (m.r === 1 || m.c === 1) { const n = m.d.length + Math.abs(k), o = mat(n, n); m.d.forEach((x, i) => { o.d[(i + Math.max(0, -k)) + (i + Math.max(0, k)) * n] = x; }); return [o]; }
  const out: number[] = [];
  for (let i = Math.max(0, -k); i < m.r && i + k < m.c; i++) if (i + k >= 0) out.push(m.d[i + (i + k) * m.r]);
  return [mat(out.length, 1, out)];
});
BUILTINS.tril = (a) => { const m = M(a[0]), k = S(a[1], 'k', 0); return [mat(m.r, m.c, m.d.map((x, idx) => (idx / m.r | 0) - (idx % m.r) <= k ? x : 0))]; };
BUILTINS.triu = (a) => { const m = M(a[0]), k = S(a[1], 'k', 0); return [mat(m.r, m.c, m.d.map((x, idx) => (idx / m.r | 0) - (idx % m.r) >= k ? x : 0))]; };
def('fliplr', (a) => { const m = M(a[0]); const o = mat(m.r, m.c); for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r; i++) o.d[i + j * m.r] = m.d[i + (m.c - 1 - j) * m.r]; return [a[0].k === 'str' ? str([...(a[0] as { v: string }).v].reverse().join('')) : o]; });
def('flipud', (a) => { const m = M(a[0]); const o = mat(m.r, m.c); for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r; i++) o.d[i + j * m.r] = m.d[m.r - 1 - i + j * m.r]; return [o]; });
def('circshift', (a) => { const m = M(a[0]), k = S(a[1], 'The shift'); const n = m.d.length, o = mat(m.r, m.c); if (m.r === 1 || m.c === 1) { m.d.forEach((x, i) => { o.d[(((i + k) % n) + n) % n] = x; }); return [o]; } for (let j = 0; j < m.c; j++) for (let i = 0; i < m.r; i++) o.d[((((i + k) % m.r) + m.r) % m.r) + j * m.r] = m.d[i + j * m.r]; return [o]; });

// ——— Size and type ———
def('size', (a, nout) => {
  need(a, 1, 'size');
  const [r, c] = sizeOf(a[0]);
  if (a[1]) { const d = S(a[1], 'The dimension'); return [num(d === 1 ? r : d === 2 ? c : 1)]; }
  return nout > 1 ? [num(r), num(c), ...Array(Math.max(0, nout - 2)).fill(num(1))] : [row([r, c])];
});
def('numel', (a) => [num(numel(a[0]))]);
def('length', (a) => { const [r, c] = sizeOf(a[0]); return [num(r * c === 0 ? 0 : Math.max(r, c))]; });
def('ndims', () => [num(2)]);
def('isempty', (a) => [bool(numel(a[0]) === 0)]);
def('isscalar', (a) => [bool(numel(a[0]) === 1)]);
def('isvector', (a) => { const [r, c] = sizeOf(a[0]); return [bool((r === 1 || c === 1) && r * c >= 1)]; });
def('isrow', (a) => [bool(sizeOf(a[0])[0] === 1)]);
def('iscolumn', (a) => [bool(sizeOf(a[0])[1] === 1)]);
def('ismatrix', () => [bool(true)]);
def('issquare', (a) => { const [r, c] = sizeOf(a[0]); return [bool(r === c)]; });
def('class', (a) => [str(kind(a[0]))]);
def('isnumeric', (a) => [bool(a[0].k === 'mat' && !a[0].logical)]);
def('isreal', (a) => [bool(a[0].k === 'mat')]);
def('isfloat', (a) => [bool(a[0].k === 'mat' && !a[0].logical)]);
def('islogical', (a) => [bool(a[0].k === 'mat' && !!a[0].logical)]);
def('ischar', (a) => [bool(a[0].k === 'str')]);
def('iscell', (a) => [bool(a[0].k === 'cell')]);
def('isstruct', (a) => [bool(a[0].k === 'struct')]);
def('is_function_handle', (a) => [bool(a[0].k === 'fn')]);
def('isa', (a) => { const c = textOf(a[1]), k = kind(a[0]); return [bool(c === k || (c === 'numeric' && k === 'double') || (c === 'float' && k === 'double'))]; });
def('double single', (a) => [{ ...M(a[0]), logical: undefined }]);
def('logical', (a) => [{ ...map1(M(a[0]), (x) => { if (Number.isNaN(x)) throw new LabError('NaN can’t become true or false.'); return x !== 0 ? 1 : 0; }), logical: true }]);
def('true', (a) => [{ ...fill(a, () => 1), logical: true }]);
def('false', (a) => [{ ...fill(a, () => 0), logical: true }]);
def('int8 int16 int32 int64 uint8 uint16 uint32 uint64', (a) => [map1(M(a[0]), (x) => Math.round(x))]);
def('char', (a) => [a.length > 1 ? concat(a.map((x) => [str(textOf(x))])) : a[0].k === 'cell' ? concat(a[0].d.map((x) => [str(textOf(x))])) : str(textOf(a[0]))]);

// ——— Constants ———
def('pi', (a) => [fill(a, () => Math.PI)]);
def('e', (a) => [fill(a, () => Math.E)]);
def('Inf inf', (a) => [fill(a, () => Infinity)]);
def('NaN nan NA', (a) => [fill(a, () => NaN)]);
def('eps', (a) => { if (a[0] && a[0].k === 'mat' && !a[1]) { const x = Math.abs(scalar(a[0])); return [num(x === 0 ? 2 ** -1074 : 2 ** (Math.floor(Math.log2(x)) - 52))]; } return [fill(a, () => 2 ** -52)]; });
def('realmax', () => [num(Number.MAX_VALUE)]);
def('realmin', () => [num(2.2250738585072014e-308)]);
def('intmax', () => [num(2147483647)]);
def('intmin', () => [num(-2147483648)]);
def('flintmax', () => [num(2 ** 53)]);

// ——— Element-wise maths ———
const each = (names: string, fn: (x: number) => number) => def(names, (a) => { need(a, 1, names.split(' ')[0]); return [map1(M(a[0]), fn)]; });
each('abs', Math.abs); each('sqrt', (x) => { if (x < 0) throw new LabError('sqrt of a negative number needs complex numbers, which UniVerse Lab doesn’t support yet.'); return Math.sqrt(x); });
each('exp', Math.exp); each('log', (x) => { if (x < 0) throw new LabError('log of a negative number needs complex numbers, which UniVerse Lab doesn’t support yet.'); return Math.log(x); });
each('log2', Math.log2); each('log10', Math.log10); each('log1p', Math.log1p); each('expm1', Math.expm1);
each('sin', Math.sin); each('cos', Math.cos); each('tan', Math.tan); each('sec', (x) => 1 / Math.cos(x)); each('csc', (x) => 1 / Math.sin(x)); each('cot', (x) => 1 / Math.tan(x));
each('asin', Math.asin); each('acos', Math.acos); each('atan', Math.atan); each('sinh', Math.sinh); each('cosh', Math.cosh); each('tanh', Math.tanh);
each('asinh', Math.asinh); each('acosh', Math.acosh); each('atanh', Math.atanh);
each('sind', (x) => Math.sin((x * Math.PI) / 180)); each('cosd', (x) => Math.cos((x * Math.PI) / 180)); each('tand', (x) => Math.tan((x * Math.PI) / 180));
each('asind', (x) => (Math.asin(x) * 180) / Math.PI); each('acosd', (x) => (Math.acos(x) * 180) / Math.PI); each('atand', (x) => (Math.atan(x) * 180) / Math.PI);
each('deg2rad', (x) => (x * Math.PI) / 180); each('rad2deg', (x) => (x * 180) / Math.PI);
each('floor', Math.floor); each('ceil', Math.ceil); each('fix', Math.trunc); each('sign', Math.sign);
each('gamma', gamma); each('factorial', (x) => { if (x < 0 || !Number.isInteger(x)) throw new LabError('factorial needs whole numbers, 0 or more.'); return Math.round(gamma(x + 1)); });
def('round', (a) => { const m = M(a[0]); if (!a[1]) return [map1(m, (x) => Math.sign(x) * Math.round(Math.abs(x)))]; const p = 10 ** S(a[1], 'The digits'); return [map1(m, (x) => (Math.sign(x) * Math.round(Math.abs(x) * p)) / p)]; });
def('isnan', (a) => [{ ...map1(M(a[0]), (x) => +Number.isNaN(x)), logical: true }]);
def('isinf', (a) => [{ ...map1(M(a[0]), (x) => +(x === Infinity || x === -Infinity)), logical: true }]);
def('isfinite', (a) => [{ ...map1(M(a[0]), (x) => +Number.isFinite(x)), logical: true }]);
def('isprime', (a) => [{ ...map1(M(a[0]), (x) => +isPrime(x)), logical: true }]);
const two = (names: string, fn: (x: number, y: number) => number) => def(names, (a) => { need(a, 2, names.split(' ')[0]); return [zip(M(a[0]), M(a[1]), fn)]; });
two('mod', (x, y) => (y === 0 ? x : x - Math.floor(x / y) * y)); two('rem', (x, y) => (y === 0 ? x : x - Math.trunc(x / y) * y));
two('atan2', Math.atan2); two('hypot', Math.hypot); two('power', Math.pow); two('plus', (x, y) => x + y); two('minus', (x, y) => x - y); two('times', (x, y) => x * y); two('rdivide', (x, y) => x / y);
two('gcd', gcd); two('lcm', (x, y) => (x && y ? Math.abs(x * y) / gcd(x, y) : 0));
two('nchoosek', (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); });
two('idivide', (x, y) => Math.trunc(x / y));
two('bitand', (x, y) => x & y); two('bitor', (x, y) => x | y); two('bitxor', (x, y) => x ^ y);
def('primes', (a) => { const n = S(a[0], 'n'); const out: number[] = []; for (let i = 2; i <= n; i++) if (isPrime(i)) out.push(i); return [row(out)]; });
def('mtimes', (a) => [matmul(M(a[0]), M(a[1]))]);
def('mldivide', (a) => [solve(M(a[0]), M(a[1]))]);
def('not', (a) => [{ ...map1(M(a[0]), (x) => +(x === 0)), logical: true }]);
def('and', (a) => [{ ...zip(M(a[0]), M(a[1]), (x, y) => +(x !== 0 && y !== 0)), logical: true }]);
def('or', (a) => [{ ...zip(M(a[0]), M(a[1]), (x, y) => +(x !== 0 || y !== 0)), logical: true }]);
def('xor', (a) => [{ ...zip(M(a[0]), M(a[1]), (x, y) => +((x !== 0) !== (y !== 0))), logical: true }]);

// ——— Reductions: down each column of a matrix, or along a vector ———
function reduce(a: Value[], fn: (v: number[]) => number, empty = 0): Mat {
  const m = M(a[0]);
  const dim = a[1] && a[1].k !== 'str' ? S(a[1], 'The dimension') : m.r === 1 ? 2 : 1;
  if (m.d.length === 0 && !a[1]) return num(empty);
  if (dim === 1) return row(Array.from({ length: m.c }, (_, j) => fn([...m.d.subarray(j * m.r, j * m.r + m.r)])));
  if (dim === 2) return mat(m.r, 1, Array.from({ length: m.r }, (_, i) => fn(Array.from({ length: m.c }, (_, j) => m.d[i + j * m.r]))));
  return m;
}
def('sum', (a) => [reduce(a, (v) => v.reduce((s, x) => s + x, 0))]);
def('prod', (a) => [reduce(a, (v) => v.reduce((s, x) => s * x, 1), 1)]);
def('mean', (a) => [reduce(a, (v) => v.reduce((s, x) => s + x, 0) / v.length, NaN)]);
def('median', (a) => [reduce(a, (v) => { const s = [...v].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }, NaN)]);
def('mode', (a) => [reduce(a, (v) => { const c = new Map<number, number>(); for (const x of v) c.set(x, (c.get(x) ?? 0) + 1); let best = NaN, n = 0; for (const [x, k] of [...c].sort((p, q) => p[0] - q[0])) if (k > n) { best = x; n = k; } return best; }, NaN)]);
const variance = (v: number[], w = 0) => { const n = v.length, mu = v.reduce((s, x) => s + x, 0) / n; return v.reduce((s, x) => s + (x - mu) ** 2, 0) / (w === 1 || n === 1 ? n : n - 1); };
def('var', (a) => [reduce([a[0], ...(a[2] ? [a[2]] : [])], (v) => variance(v, a[1] && numel(a[1]) ? scalar(a[1]) : 0), NaN)]);
def('std', (a) => [reduce([a[0], ...(a[2] ? [a[2]] : [])], (v) => Math.sqrt(variance(v, a[1] && numel(a[1]) ? scalar(a[1]) : 0)), NaN)]);
def('any', (a) => [{ ...reduce(a, (v) => +v.some((x) => x !== 0 && !Number.isNaN(x))), logical: true }]);
def('all', (a) => [{ ...reduce(a, (v) => +v.every((x) => x !== 0), 1), logical: true }]);
def('norm', (a) => {
  const m = M(a[0]), p = a[1] ? (a[1].k === 'str' ? textOf(a[1]) : scalar(a[1])) : 2;
  if (m.r === 1 || m.c === 1) { if (p === Infinity || p === 'inf' || p === 'Inf') return [num(Math.max(...m.d.map(Math.abs)))]; if (p === 1) return [num(m.d.reduce((s, x) => s + Math.abs(x), 0))]; if (p === 'fro') return [num(Math.hypot(...m.d))]; const q = Number(p); return [num(m.d.reduce((s, x) => s + Math.abs(x) ** q, 0) ** (1 / q))]; }
  if (p === 'fro') return [num(Math.hypot(...m.d))];
  if (p === 1) return [num(Math.max(...reduce([m], (v) => v.reduce((s, x) => s + Math.abs(x), 0)).d))];
  if (p === Infinity || p === 'inf' || p === 'Inf') return [num(Math.max(...reduce([m, num(2)], (v) => v.reduce((s, x) => s + Math.abs(x), 0)).d))];
  return [num(Math.sqrt(powerIter(matmul(transpose(m) as Mat, m))))];
});
function cumulative(a: Value[], fn: (acc: number, x: number) => number): Mat {
  const m = M(a[0]), o = mat(m.r, m.c), along = a[1] ? S(a[1], 'The dimension') : m.r === 1 ? 2 : 1;
  if (along === 1) for (let j = 0; j < m.c; j++) { let s = NaN; for (let i = 0; i < m.r; i++) { const x = m.d[i + j * m.r]; s = i === 0 ? x : fn(s, x); o.d[i + j * m.r] = s; } }
  else for (let i = 0; i < m.r; i++) { let s = NaN; for (let j = 0; j < m.c; j++) { const x = m.d[i + j * m.r]; s = j === 0 ? x : fn(s, x); o.d[i + j * m.r] = s; } }
  return o;
}
def('cumsum', (a) => [cumulative(a, (s, x) => s + x)]);
def('cumprod', (a) => [cumulative(a, (s, x) => s * x)]);
def('cummax', (a) => [cumulative(a, Math.max)]);
def('cummin', (a) => [cumulative(a, Math.min)]);
def('diff', (a) => {
  let m = M(a[0]); const n = S(a[1], 'n', 1);
  for (let k = 0; k < n; k++) {
    if (m.r === 1) m = row(Array.from({ length: Math.max(0, m.c - 1) }, (_, j) => m.d[j + 1] - m.d[j]));
    else { const r = m.r - 1, o = mat(Math.max(0, r), m.c); for (let j = 0; j < m.c; j++) for (let i = 0; i < r; i++) o.d[i + j * r] = m.d[i + 1 + j * m.r] - m.d[i + j * m.r]; m = o; }
  }
  return [m];
});
function extreme(a: Value[], nout: number, better: (x: number, y: number) => boolean): Value[] {
  // max(a, b): element by element; max(A): along columns, with where the max is as a second output.
  if (a.length >= 2 && numel(a[1]) > 0) return [zip(M(a[0]), M(a[1]), (x, y) => (Number.isNaN(x) ? y : Number.isNaN(y) ? x : better(x, y) ? x : y))];
  const m = M(a[0]);
  if (!m.d.length) return [empty(), empty()];
  const dim = a[2] ? S(a[2], 'The dimension') : m.r === 1 ? 2 : 1;
  const vals: number[] = [], where: number[] = [];
  const pick = (get: (k: number) => number, n: number) => { let bi = -1; for (let k = 0; k < n; k++) { const x = get(k); if (Number.isNaN(x)) continue; if (bi < 0 || better(x, get(bi))) bi = k; } vals.push(bi < 0 ? NaN : get(bi)); where.push(bi + 1 || 1); };
  if (dim === 1) for (let j = 0; j < m.c; j++) pick((k) => m.d[k + j * m.r], m.r);
  else for (let i = 0; i < m.r; i++) pick((k) => m.d[i + k * m.r], m.c);
  const shape = (v: number[]) => (dim === 1 ? row(v) : mat(v.length, 1, v));
  return nout > 1 ? [shape(vals), shape(where)] : [shape(vals)];
}
def('max', (a, n) => extreme(a, n, (x, y) => x > y));
def('min', (a, n) => extreme(a, n, (x, y) => x < y));
def('bounds', (a) => [extreme([a[0]], 1, (x, y) => x < y)[0], extreme([a[0]], 1, (x, y) => x > y)[0]]);

// ——— Finding and sorting ———
def('find', (a, nout) => {
  const m = M(a[0]), lim = a[1] ? S(a[1], 'n') : Infinity;
  const ks: number[] = [];
  for (let k = 0; k < m.d.length && ks.length < lim; k++) if (m.d[k] !== 0) ks.push(k);
  if (nout > 1) return [mat(ks.length, 1, ks.map((k) => (k % m.r) + 1)), mat(ks.length, 1, ks.map((k) => Math.floor(k / m.r) + 1)), mat(ks.length, 1, ks.map((k) => m.d[k]))];
  const pos = ks.map((k) => k + 1);
  return [m.r === 1 ? row(pos) : mat(pos.length, 1, pos)];
});
def('sort', (a, nout) => {
  if (a[0].k === 'cell') { const items = a[0].d.map((v) => textOf(v)); const order = items.map((_, i) => i).sort((x, y) => (items[x] < items[y] ? -1 : items[x] > items[y] ? 1 : 0)); return [{ k: 'cell', r: a[0].r, c: a[0].c, d: order.map((i) => (a[0] as Cell).d[i]) }, row(order.map((i) => i + 1))]; }
  const m = M(a[0]), desc = a.some((x) => x.k === 'str' && /^desc/i.test(x.v));
  const cmp = (x: number, y: number) => (Number.isNaN(x) ? 1 : Number.isNaN(y) ? -1 : desc ? y - x : x - y);
  const sortVec = (v: number[]) => v.map((x, i) => [x, i] as const).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]);
  if (m.r === 1 || m.c === 1) {
    const s = sortVec([...m.d]);
    const out = s.map((p) => p[0]), idx = s.map((p) => p[1] + 1);
    const shape = (v: number[]) => (m.r === 1 ? row(v) : mat(v.length, 1, v));
    const vals = a[0].k === 'str' ? str(String.fromCharCode(...out)) : shape(out);
    return nout > 1 ? [vals, shape(idx)] : [vals];
  }
  const o = mat(m.r, m.c), ix = mat(m.r, m.c);
  for (let j = 0; j < m.c; j++) sortVec([...m.d.subarray(j * m.r, j * m.r + m.r)]).forEach((p, i) => { o.d[i + j * m.r] = p[0]; ix.d[i + j * m.r] = p[1] + 1; });
  return nout > 1 ? [o, ix] : [o];
});
def('sortrows', (a) => { const m = M(a[0]), col = a[1] ? S(a[1], 'The column') : 1; const c0 = Math.abs(col) - 1, sign = Math.sign(col); const rows = Array.from({ length: m.r }, (_, i) => i).sort((x, y) => sign * (m.d[x + c0 * m.r] - m.d[y + c0 * m.r]) || x - y); const o = mat(m.r, m.c); rows.forEach((src, i) => { for (let j = 0; j < m.c; j++) o.d[i + j * m.r] = m.d[src + j * m.r]; }); return [o, mat(m.r, 1, rows.map((i) => i + 1))]; });
def('unique', (a, nout) => {
  if (a[0].k === 'cell') { const items = [...new Set(a[0].d.map((v) => textOf(v)))].sort(); return [{ k: 'cell', r: 1, c: items.length, d: items.map(str) }]; }
  const m = M(a[0]);
  const vals = [...new Set([...m.d])].sort((x, y) => x - y);
  const out = m.r === 1 ? row(vals) : mat(vals.length, 1, vals);
  if (nout > 1) { const last = vals.map((v) => m.d.lastIndexOf(v) + 1), j = [...m.d].map((x) => vals.indexOf(x) + 1); return [out, mat(last.length, 1, last), mat(j.length, 1, j)]; }
  return [out];
});
def('ismember', (a) => {
  if (a[0].k === 'str' && a[1].k === 'cell') return [bool(a[1].d.some((v) => v.k === 'str' && v.v === (a[0] as { v: string }).v))];
  const set = new Set(M(a[1]).d); const m = M(a[0]);
  return [{ ...map1(m, (x) => +set.has(x)), logical: true }];
});
def('isequal', (a) => [bool(a.slice(1).every((b) => same(a[0], b)))]);
def('nnz', (a) => [num(M(a[0]).d.filter((x) => x !== 0).length)]);
def('numel', (a) => [num(numel(a[0]))]);
def('histc', (a) => { const m = M(a[0]), edges = M(a[1]); const out = new Array(edges.d.length).fill(0); for (const x of m.d) { for (let k = edges.d.length - 1; k >= 0; k--) if (x >= edges.d[k] && (k < edges.d.length - 1 || x === edges.d[k])) { out[k]++; break; } } return [row(out)]; });

// ——— Linear algebra ———
def('transpose ctranspose', (a) => [transpose(a[0])]);
def('inv', (a) => [inv(M(a[0]))]);
def('pinv', (a) => { const m = M(a[0]); const mt = transpose(m) as Mat; return [m.r >= m.c ? matmul(inv(matmul(mt, m)), mt) : matmul(mt, inv(matmul(m, mt)))]; });
def('det', (a) => [num(det(M(a[0])))]);
def('trace', (a) => { const m = M(a[0]); let s = 0; for (let i = 0; i < Math.min(m.r, m.c); i++) s += m.d[i + i * m.r]; return [num(s)]; });
def('rank', (a) => [num(rank(M(a[0])))]);
def('dot', (a) => { const x = M(a[0]), y = M(a[1]); if (x.d.length !== y.d.length) throw new LabError('dot needs two vectors of the same length.'); return [num(x.d.reduce((s, v, i) => s + v * y.d[i], 0))]; });
def('cross', (a) => { const x = M(a[0]).d, y = M(a[1]).d; if (x.length !== 3 || y.length !== 3) throw new LabError('cross needs two 3-element vectors.'); const out = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; return [M(a[0]).r === 1 ? row(out) : mat(3, 1, out)]; });
def('kron', (a) => { const A = M(a[0]), B = M(a[1]); const o = mat(A.r * B.r, A.c * B.c); for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) for (let k = 0; k < B.r; k++) for (let l = 0; l < B.c; l++) o.d[i * B.r + k + (j * B.c + l) * o.r] = A.d[i + j * A.r] * B.d[k + l * B.r]; return [o]; });
def('lu', (a, nout) => { const { L, U, P } = lu(M(a[0])); return nout > 2 ? [L, U, P] : [matmul(transpose(P) as Mat, L), U]; });
def('eig', (a, nout) => {
  const m = M(a[0]);
  if (m.r !== m.c) throw new LabError('eig needs a square matrix.');
  for (let i = 0; i < m.r; i++) for (let j = 0; j < i; j++) if (Math.abs(m.d[i + j * m.r] - m.d[j + i * m.r]) > 1e-10 * (1 + Math.abs(m.d[i + j * m.r]))) throw new LabError('eig works on symmetric matrices for now (others can have complex eigenvalues, which UniVerse Lab doesn’t support yet).');
  const { values, vectors } = jacobi(m);
  return nout > 1 ? [vectors, diagOf(values)] : [mat(values.length, 1, values)];
});

// ——— Polynomials, interpolation, calculus ———
def('polyfit', (a) => {
  const x = M(a[0]).d, y = M(a[1]).d, n = S(a[2], 'The degree');
  if (x.length !== y.length) throw new LabError('polyfit needs x and y of the same length.');
  const A = mat(x.length, n + 1);
  for (let i = 0; i < x.length; i++) for (let j = 0; j <= n; j++) A.d[i + j * x.length] = x[i] ** (n - j);
  return [transpose(solve(A, mat(y.length, 1, y)))];
});
def('polyval', (a) => { const p = M(a[0]).d; return [map1(M(a[1]), (x) => p.reduce((s, c) => s * x + c, 0))]; });
def('polyder', (a) => { const p = M(a[0]).d, n = p.length - 1; return [row(n < 1 ? [0] : Array.from({ length: n }, (_, i) => p[i] * (n - i)))]; });
def('polyint', (a) => { const p = M(a[0]).d, n = p.length, k = S(a[1], 'k', 0); return [row([...Array.from({ length: n }, (_, i) => p[i] / (n - i)), k])]; });
def('conv', (a) => { const x = M(a[0]).d, y = M(a[1]).d; const out = new Array(x.length + y.length - 1).fill(0); x.forEach((p, i) => y.forEach((q, j) => { out[i + j] += p * q; })); return [row(out)]; });
def('roots', (a, _n, lab) => {
  // Real roots only (eigenvalues of the companion matrix need complex numbers): found by Newton from many starts.
  const p = [...M(a[0]).d]; while (p.length && p[0] === 0) p.shift();
  const n = p.length - 1; if (n < 1) return [empty()];
  const f = (x: number) => p.reduce((s, c) => s * x + c, 0), df = (x: number) => p.slice(0, -1).reduce((s, c, i) => s * x + c * (n - i), 0);
  const found: number[] = [], bound = 1 + Math.max(...p.slice(1).map((c) => Math.abs(c / p[0])));
  for (let s = -bound; s <= bound; s += bound / 50) { let x = s; for (let k = 0; k < 100; k++) { const d = df(x); if (d === 0) break; const nx = x - f(x) / d; if (Math.abs(nx - x) < 1e-14) { x = nx; break; } x = nx; } if (Math.abs(f(x)) < 1e-9 * (1 + Math.abs(x) ** n) && !found.some((r) => Math.abs(r - x) < 1e-7)) found.push(x); }
  if (found.length < n) lab.host.out(`warning: roots shows only the ${found.length} real root${found.length === 1 ? '' : 's'}; the rest are complex.\n`);
  return [mat(found.length, 1, found.sort((x, y) => y - x).map((x) => +x.toPrecision(12)))];
});
def('interp1', (a) => {
  const x = M(a[0]).d, y = M(a[1]).d, q = M(a[2]), how = a[3]?.k === 'str' ? a[3].v : 'linear';
  return [map1(q, (v) => {
    if (v < x[0] || v > x[x.length - 1]) return NaN;
    let k = 0; while (k < x.length - 2 && v > x[k + 1]) k++;
    if (how === 'nearest') return Math.abs(v - x[k]) <= Math.abs(v - x[k + 1]) ? y[k] : y[k + 1];
    if (how === 'previous') return v === x[k + 1] ? y[k + 1] : y[k];
    return y[k] + ((y[k + 1] - y[k]) * (v - x[k])) / (x[k + 1] - x[k]);
  })];
});
def('trapz', (a) => { const [x, y] = a.length > 1 ? [M(a[0]).d, M(a[1]).d] : [M(a[0]).d.map((_, i) => i + 1), M(a[0]).d]; let s = 0; for (let i = 1; i < y.length; i++) s += ((x[i] - x[i - 1]) * (y[i] + y[i - 1])) / 2; return [num(s)]; });
def('cumtrapz', (a) => { const [x, y] = a.length > 1 ? [M(a[0]).d, M(a[1]).d] : [M(a[0]).d.map((_, i) => i + 1), M(a[0]).d]; const out = [0]; for (let i = 1; i < y.length; i++) out.push(out[i - 1] + ((x[i] - x[i - 1]) * (y[i] + y[i - 1])) / 2); return [M(a[a.length - 1]).r === 1 ? row(out) : mat(out.length, 1, out)]; });
def('integral quad quadgk', (a, _n, lab) => {
  const fn = a[0], lo = S(a[1], 'The lower limit'), hi = S(a[2], 'The upper limit');
  const f = (x: number) => scalar(lab.callFn(fn, [num(x)])[0], 'The function’s value');
  return [num(adaptiveSimpson(f, lo, hi, 1e-10, 50))];
});
def('fzero', (a, _n, lab) => {
  const f = (x: number) => scalar(lab.callFn(a[0], [num(x)])[0], 'The function’s value');
  const g = M(a[1]);
  let lo: number, hi: number;
  if (g.d.length >= 2) [lo, hi] = [g.d[0], g.d[1]];
  else {
    // Widen around the guess until the sign changes.
    const x0 = g.d[0]; let dx = x0 === 0 ? 0.02 : Math.abs(x0) / 50; lo = x0; hi = x0;
    for (let k = 0; k < 200 && Math.sign(f(lo)) === Math.sign(f(hi)); k++) { lo = x0 - dx; hi = x0 + dx; dx *= 1.6; }
  }
  let flo = f(lo), fhi = f(hi);
  if (Math.sign(flo) === Math.sign(fhi) && flo !== 0 && fhi !== 0) throw new LabError('fzero couldn’t find where the function changes sign: try another starting point or an interval [a b].');
  for (let k = 0; k < 200 && hi - lo > 1e-15 * (1 + Math.abs(lo)); k++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (fm === 0) { lo = hi = mid; break; }
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  return [num((lo + hi) / 2), num(f((lo + hi) / 2))];
});
def('fminbnd', (a, _n, lab) => {
  const f = (x: number) => scalar(lab.callFn(a[0], [num(x)])[0]);
  let lo = S(a[1], 'The lower limit'), hi = S(a[2], 'The upper limit');
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 200 && hi - lo > 1e-12; k++) { const c = hi - g * (hi - lo), d = lo + g * (hi - lo); if (f(c) < f(d)) hi = d; else lo = c; }
  const x = (lo + hi) / 2;
  return [num(x), num(f(x))];
});
def('ode45 ode23', (a, nout, lab) => {
  // Dormand–Prince 5(4) with adaptive steps: [t, y] = ode45(@(t, y) ..., [t0 tf], y0).
  const span = M(a[1]).d, y0 = [...M(a[2]).d];
  const f = (t: number, y: number[]) => [...M(lab.callFn(a[0], [num(t), mat(y.length, 1, y)])[0], 'The derivative').d];
  const { ts, ys } = dopri(f, span[0], span[span.length - 1], y0);
  const T = mat(ts.length, 1, ts), Y = mat(ts.length, y0.length);
  ys.forEach((y, i) => y.forEach((v, j) => { Y.d[i + j * ts.length] = v; }));
  if (nout <= 1 && nout >= 0) { const s: Struct = { k: 'struct', f: new Map<string, Value>([['x', transpose(T)], ['y', transpose(Y)]]) }; return [nout === 1 ? s : s]; }
  return [T, Y];
});

// ——— Text ———
def('num2str', (a) => {
  const v = a[0]; if (v.k === 'str') return [v];
  const m = M(v);
  if (a[1]) { const p = a[1]; return [str(p.k === 'str' ? cFormat(p.v, [...m.d]) : [...m.d].map((x) => fmtG(x, scalar(p))).join('  '))]; }
  const one = (x: number) => (Number.isInteger(x) ? String(x) : Number.isFinite(x) ? fmtG(x, Math.max(5, Math.floor(Math.log10(Math.abs(x) || 1)) + 5)) : Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf');
  if (m.r <= 1) return [str([...m.d].map(one).join('  '))];
  const rows = Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => one(m.d[i + j * m.r])));
  const w = Math.max(...rows.flat().map((s) => s.length));
  return [str(rows.map((r) => r.map((s) => s.padStart(w)).join('  ')).join('\n'))];
});
def('int2str', (a) => [str([...M(a[0]).d].map((x) => String(Math.round(x))).join('  '))]);
def('mat2str', (a) => { const m = M(a[0]); const f = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toPrecision(a[1] ? scalar(a[1]) : 15))); if (m.d.length === 1) return [str(f(m.d[0]))]; return [str(`[${Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => f(m.d[i + j * m.r])).join(' ')).join(';')}]`)]; });
def('str2num', (a, _n, lab) => { const sub = labFor(lab); sub.run(`__v = [${textOf(a[0])}];`); return [sub.vars.get('__v') ?? empty()]; });
def('str2double', (a) => { const t = a[0].k === 'cell' ? null : textOf(a[0]).trim(); if (a[0].k === 'cell') return [row(a[0].d.map((v) => { const n = Number(textOf(v).trim()); return textOf(v).trim() === '' || Number.isNaN(n) ? NaN : n; }))]; const n = Number(t); return [num(t === '' || Number.isNaN(n) ? NaN : n)]; });
def('sprintf', (a) => [str(cFormat(textOf(a[0]), a.slice(1).flatMap(flat)))]);
def('fprintf printf', (a, _n, lab) => {
  if (!a.length) return [];
  const fmt = a[0].k === 'mat' && a.length > 1 && isScalar(a[0]) && a[1].k === 'str' ? a.shift() && textOf(a[0]) : textOf(a[0]);
  lab.host.out(cFormat(fmt, a.slice(1).flatMap(flat)));
  return [];
});
def('disp display', (a, _n, lab) => { const v = a[0]; if (!v) return []; lab.host.out(`${v.k === 'mat' && v.d.length === 1 ? fmtNum(v.d[0], lab.fmt, !!v.logical || Number.isInteger(v.d[0])) : render(v, lab.fmt)}\n`); return []; });
def('strcat', (a) => { if (a.some((x) => x.k === 'cell')) { const c = a.find((x) => x.k === 'cell') as Cell; return [{ ...c, d: c.d.map((_, i) => str(a.map((x) => (x.k === 'cell' ? textOf(x.d[i]) : textOf(x))).join(''))) }]; } return [str(a.map((x) => (x.k === 'str' ? x.v.replace(/\s+$/, '') : textOf(x))).join(''))]; });
def('strcmp', (a) => [cmpText(a, (x, y) => x === y)]);
def('strcmpi', (a) => [cmpText(a, (x, y) => x.toLowerCase() === y.toLowerCase())]);
def('strncmp', (a) => { const n = S(a[2], 'n'); return [cmpText(a, (x, y) => x.length >= n && y.length >= n && x.slice(0, n) === y.slice(0, n))]; });
def('strncmpi', (a) => { const n = S(a[2], 'n'); return [cmpText(a, (x, y) => x.length >= n && y.length >= n && x.slice(0, n).toLowerCase() === y.slice(0, n).toLowerCase())]; });
def('upper toupper', (a) => [str(textOf(a[0]).toUpperCase())]);
def('lower tolower', (a) => [str(textOf(a[0]).toLowerCase())]);
def('strtrim', (a) => [a[0].k === 'cell' ? { ...a[0], d: a[0].d.map((v) => str(textOf(v).trim())) } : str(textOf(a[0]).trim())]);
def('strrep', (a) => [str(textOf(a[0]).split(textOf(a[1])).join(textOf(a[2])))]);
def('strfind', (a) => { const t = textOf(a[0]), p = textOf(a[1]); const out: number[] = []; if (p) for (let i = t.indexOf(p); i >= 0; i = t.indexOf(p, i + 1)) out.push(i + 1); return [out.length ? row(out) : mat(1, 0)]; });
def('strsplit', (a) => { const t = textOf(a[0]), by = a[1] ? textOf(a[1]) : ' '; const parts = t.split(by); return [{ k: 'cell', r: 1, c: parts.length, d: parts.map(str) }]; });
def('strjoin', (a) => { if (a[0].k !== 'cell') throw new LabError('strjoin needs a cell of texts.'); return [str(a[0].d.map((v) => textOf(v)).join(a[1] ? textOf(a[1]) : ' '))]; });
def('regexprep', (a) => [str(textOf(a[0]).replace(new RegExp(textOf(a[1]), 'g'), textOf(a[2]).replace(/\$(\d)/g, '$$$1')))]);
def('regexp', (a, nout) => { const t = textOf(a[0]), re = new RegExp(textOf(a[1]), 'g'); const ms = [...t.matchAll(re)]; const opt = a[2]?.k === 'str' ? a[2].v : ''; if (opt === 'match') return [{ k: 'cell', r: 1, c: ms.length, d: ms.map((m) => str(m[0])) }]; if (opt === 'tokens') return [{ k: 'cell', r: 1, c: ms.length, d: ms.map((m) => ({ k: 'cell', r: 1, c: m.length - 1, d: m.slice(1).map((x) => str(x ?? '')) }) as Cell) }]; return nout > 1 ? [row(ms.map((m) => (m.index ?? 0) + 1)), row(ms.map((m) => (m.index ?? 0) + m[0].length))] : [row(ms.map((m) => (m.index ?? 0) + 1))]; });
def('blanks', (a) => [str(' '.repeat(S(a[0], 'n')))]);
def('isspace', (a) => [{ ...row([...textOf(a[0])].map((ch) => +/\s/.test(ch))), logical: true }]);
def('isletter isalpha', (a) => [{ ...row([...textOf(a[0])].map((ch) => +/\p{L}/u.test(ch))), logical: true }]);
def('isdigit', (a) => [{ ...row([...textOf(a[0])].map((ch) => +/\d/.test(ch))), logical: true }]);
def('dec2bin', (a) => [str(Math.round(S(a[0], 'The number')).toString(2).padStart(a[1] ? S(a[1], 'n') : 0, '0'))]);
def('bin2dec', (a) => [num(parseInt(textOf(a[0]), 2))]);
def('dec2hex', (a) => [str(Math.round(S(a[0], 'The number')).toString(16).toUpperCase())]);
def('hex2dec', (a) => [num(parseInt(textOf(a[0]), 16))]);
def('datestr', () => [str(new Date().toLocaleString())]);
def('now', () => [num(Date.now() / 86400000 + 719529)]);
def('clock', () => { const d = new Date(); return [row([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()])]; });

// ——— Cells and structs ———
def('cell', (a) => { const [r, c] = dims(a); return [{ k: 'cell', r, c, d: Array.from({ length: r * c }, () => empty()) }]; });
def('num2cell', (a) => { const m = M(a[0]); return [{ k: 'cell', r: m.r, c: m.c, d: [...m.d].map(num) }]; });
def('cell2mat', (a) => { if (a[0].k !== 'cell') throw new LabError('cell2mat needs a cell.'); const c = a[0]; return [concat(Array.from({ length: c.r }, (_, i) => Array.from({ length: c.c }, (_, j) => c.d[i + j * c.r])))]; });
def('iscellstr', (a) => [bool(a[0].k === 'cell' && a[0].d.every((v) => v.k === 'str'))]);
def('struct', (a) => { const s: Struct = { k: 'struct', f: new Map() }; for (let i = 0; i + 1 < a.length; i += 2) { const v = a[i + 1]; s.f.set(textOf(a[i]), v.k === 'cell' && v.r * v.c === 1 ? v.d[0] : v); } return [s]; });
def('fieldnames', (a) => { if (a[0].k !== 'struct') throw new LabError('fieldnames needs a struct.'); const ks = [...a[0].f.keys()]; return [{ k: 'cell', r: ks.length, c: 1, d: ks.map(str) }]; });
def('isfield', (a) => [bool(a[0].k === 'struct' && a[0].f.has(textOf(a[1])))]);
def('rmfield', (a) => { if (a[0].k !== 'struct') throw new LabError('rmfield needs a struct.'); const f = new Map(a[0].f); f.delete(textOf(a[1])); return [{ k: 'struct', f }]; });
def('setfield', (a) => { if (a[0].k !== 'struct') throw new LabError('setfield needs a struct.'); const f = new Map(a[0].f); f.set(textOf(a[1]), a[2]); return [{ k: 'struct', f }]; });
def('getfield', (a) => { if (a[0].k !== 'struct' || !a[0].f.has(textOf(a[1]))) throw new LabError(`No field “${textOf(a[1])}”.`); return [a[0].f.get(textOf(a[1]))!]; });

// ——— Functions as values ———
def('deal', (a, nout) => (a.length === 1 ? Array.from({ length: Math.max(1, nout) }, () => a[0]) : a));
def('feval', (a, n, lab) => lab.callFn(a[0], a.slice(1), n));
def('func2str', (a) => [str(a[0].k === 'fn' ? (a[0].src ? `@${a[0].src}` : a[0].name ?? '') : textOf(a[0]))]);
def('str2func', (a, _n, lab) => { const t = textOf(a[0]).trim(); if (t.startsWith('@')) { const sub = labFor(lab); sub.run(`__f = ${t};`); return [sub.vars.get('__f')!]; } return [{ k: 'fn', name: t }]; });
def('arrayfun cellfun', (a, nout, lab) => {
  const fn = a[0], uniform = !a.some((x, i) => i > 0 && x.k === 'str' && /^uniformoutput$/i.test(x.v) && !truthy(a[i + 1]));
  const lists = a.slice(1).filter((x, i, all) => !(x.k === 'str' && /^(uniformoutput|errorhandler)$/i.test(x.v)) && !(i > 0 && all[i - 1].k === 'str' && /^(uniformoutput|errorhandler)$/i.test((all[i - 1] as { v: string }).v)));
  const [r, c] = sizeOf(lists[0]);
  const item = (v: Value, k: number): Value => (v.k === 'cell' ? v.d[k] : v.k === 'str' ? str(v.v[k]) : v.k === 'struct' ? v : num(M(v).d[k]));
  if (typeof fn === 'object' && fn.k === 'str' && lists[0].k === 'cell') {
    // cellfun('isempty', c) and friends, by name.
    const name = fn.v;
    const res = lists[0].d.map((v) => truthy(lab.call(name === 'isempty' ? 'isempty' : name, [v], 1)[0]) ? 1 : 0);
    return [{ ...mat(r, c, res), logical: name.startsWith('is') }];
  }
  const outs = Array.from({ length: r * c }, (_, k) => lab.callFn(fn, lists.map((l) => item(l, k)), Math.max(1, nout)));
  const n = Math.max(1, nout);
  return Array.from({ length: n }, (_, o) => uniform ? mat(r, c, outs.map((x) => { const v = x[o]; if (!v || numel(v) !== 1) throw new LabError('Each call must give one number; add …, \'UniformOutput\', false to collect anything else in a cell.'); return scalar(v); })) : ({ k: 'cell', r, c, d: outs.map((x) => x[o]) } as Cell));
});

// ——— The session ———
def('clc', (_a, _n, lab) => { lab.host.out('\f'); return []; });
def('clear clearvars', (a, _n, lab) => { if (!a.length || (a[0].k === 'str' && /^(all|-all|variables)$/.test(a[0].v))) lab.vars.clear(); else for (const x of a) lab.vars.delete(textOf(x)); return []; });
def('who', (_a, _n, lab) => { lab.host.out(`Your variables are:\n\n${[...lab.vars.keys()].sort().join('  ')}\n\n`); return []; });
def('whos', (_a, _n, lab) => {
  const rows = [...lab.vars].sort((x, y) => x[0].localeCompare(y[0])).map(([k, v]) => { const [r, c] = sizeOf(v); return `  ${k.padEnd(12)} ${`${r}x${c}`.padEnd(10)} ${kind(v)}`; });
  lab.host.out(`  Name         Size       Class\n${rows.join('\n')}\n\n`);
  return [];
});
def('format', (a, _n, lab) => { lab.fmt = { long: a[0]?.k === 'str' && a[0].v.toLowerCase() === 'long' }; return []; });
def('tic', (_a, nout, lab) => { lab.ticAt = lab.host.now?.() ?? Date.now(); return nout > 0 ? [num(lab.ticAt)] : []; });
def('toc', (_a, nout, lab) => { const s = ((lab.host.now?.() ?? Date.now()) - lab.ticAt) / 1000; if (nout > 0) return [num(s)]; lab.host.out(`Elapsed time is ${s.toFixed(6)} seconds.\n`); return []; });
def('error', (a) => { if (!a.length) return []; const msgs = a[0].k === 'str' && /^[\w:]+$/.test(a[0].v) && a[0].v.includes(':') && a.length > 1 ? a.slice(1) : a; throw new LabError(cFormat(textOf(msgs[0]), msgs.slice(1).flatMap(flat))); });
def('warning', (a, _n, lab) => { if (a[0]?.k === 'str' && /^(on|off)$/.test(a[0].v)) return []; const msgs = a[0]?.k === 'str' && a[0].v.includes(':') && !a[0].v.includes(' ') && a.length > 1 ? a.slice(1) : a; lab.host.out(`warning: ${cFormat(textOf(msgs[0]), msgs.slice(1).flatMap(flat))}\n`); return []; });
def('assert', (a) => { if (a.length === 1 ? !truthy(a[0]) : !same(a[0], a[1]) && !(a[2] && Math.max(...zip(M(a[0]), M(a[1]), (x, y) => Math.abs(x - y)).d) <= scalar(a[2]))) throw new LabError('assert failed.'); return []; });
def('isvarname', (a) => [bool(/^[A-Za-z]\w*$/.test(textOf(a[0])))]);
def('eval evalin', (a, _n, lab) => { try { lab.run(textOf(a[a.length > 1 && a[0].k === 'str' && /^(base|caller)$/.test(a[0].v) ? 1 : 0])); } catch (e) { if (a[1] && a[0].k === 'str' && !/^(base|caller)$/.test(a[0].v)) lab.run(textOf(a[1])); else throw e; } return []; });
def('input keyboard', () => { throw new LabError('input isn’t available yet: set the value in the script instead.'); });
def('pause drawnow beep more pkg close', () => []);
def('rng', () => []);
def('version', () => [str('UniVerse Lab 1.0')]);
def('ver', (_a, _n, lab) => { lab.host.out('UniVerse Lab 1.0: our own engine for the MATLAB and Octave language.\n'); return []; });
def('help doc', (a, _n, lab) => { const n = a[0] ? textOf(a[0]) : ''; lab.host.out(n ? (BUILTINS[n] ? `${n} is a built-in function of UniVerse Lab.\n` : `No help found for “${n}”.\n`) : 'Type code and press Enter. Try: x = linspace(0, 2*pi); plot(x, sin(x))\n'); return []; });

// ——— Helpers ———
/** A second interpreter for str2num / str2func (their own variables), sharing the output. */
function labFor(lab: Lab): Lab { const L = lab.constructor as new (h: Lab['host']) => Lab; return new L(lab.host); }
function flat(v: Value): (number | string)[] { return v.k === 'str' ? [v.v] : v.k === 'cell' ? v.d.flatMap(flat) : [...M(v).d]; }
function same(a: Value, b: Value): boolean {
  if (a.k === 'str' || b.k === 'str') return a.k === 'str' && b.k === 'str' ? a.v === b.v : same(toMat(a), toMat(b));
  if (a.k === 'cell' && b.k === 'cell') return a.r === b.r && a.c === b.c && a.d.every((x, i) => same(x, b.d[i]));
  if (a.k === 'struct' && b.k === 'struct') return a.f.size === b.f.size && [...a.f].every(([k, v]) => b.f.has(k) && same(v, b.f.get(k)!));
  if (a.k === 'mat' && b.k === 'mat') return a.r === b.r && a.c === b.c && a.d.every((x, i) => x === b.d[i]);
  return false;
}
function cmpText(a: Value[], eq: (x: string, y: string) => boolean): Mat {
  const one = (x: Value, y: Value) => +(x.k === 'str' && y.k === 'str' && eq(x.v, y.v));
  if (a[0].k === 'cell' || a[1].k === 'cell') { const c = (a[0].k === 'cell' ? a[0] : a[1]) as Cell, other = a[0].k === 'cell' ? a[1] : a[0]; return { ...mat(c.r, c.c, c.d.map((v, i) => one(v, other.k === 'cell' ? other.d[i] : other))), logical: true }; }
  return bool(!!one(a[0], a[1]));
}
/** printf-style formatting: %d %i %f %e %g %s %c %x %o %%, widths, precisions and flags; the format repeats while values remain. */
export function cFormat(fmt: string, vals: (number | string)[]): string {
  const esc = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  const spec = /%([-+ 0#]*)(\d+|\*)?(?:\.(\d+|\*))?([diufeEgGsScxXo%])/g;
  let out = '', k = 0;
  do {
    let used = false;
    out += esc.replace(spec, (_m, flags: string, w: string | undefined, p: string | undefined, conv: string) => {
      if (conv === '%') return '%';
      const width = w === '*' ? Number(vals[k++]) : w ? Number(w) : 0, prec = p === '*' ? Number(vals[k++]) : p !== undefined ? Number(p) : undefined;
      if (k >= vals.length && vals.length) return '';
      const v = vals[k++]; used = true;
      let s: string;
      if (v === undefined) s = '';
      else if (conv === 's' || conv === 'S') s = typeof v === 'string' ? v : fmtG(v, prec ?? 5);
      else if (typeof v === 'string') s = conv === 'c' ? v : v;
      else if (conv === 'c') s = String.fromCharCode(v);
      else if (conv === 'd' || conv === 'i' || conv === 'u') s = Number.isInteger(v) ? String(v) : Number.isFinite(v) ? v.toExponential(prec ?? 6).replace(/e([+-])(\d)$/, 'e$10$2') : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
      else if (conv === 'f') s = Number.isFinite(v) ? v.toFixed(prec ?? 6) : Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
      else if (conv === 'e' || conv === 'E') { s = v.toExponential(prec ?? 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (conv === 'E') s = s.toUpperCase(); }
      else if (conv === 'x' || conv === 'X') { s = Math.round(v).toString(16); if (conv === 'X') s = s.toUpperCase(); }
      else if (conv === 'o') s = Math.round(v).toString(8);
      else s = fmtG(v, prec ?? 6);
      if (typeof v === 'number' && v >= 0 && flags.includes('+') && /[dieEfgG]/.test(conv)) s = `+${s}`;
      if (s.length < width) s = flags.includes('-') ? s.padEnd(width) : flags.includes('0') && typeof v === 'number' ? (s.startsWith('-') ? `-${s.slice(1).padStart(width - 1, '0')}` : s.padStart(width, '0')) : s.padStart(width);
      return s;
    });
    if (!used) break;
  } while (k < vals.length);
  return out;
}
function fmtG(x: number, p: number) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -5 || e >= p) return x.toExponential(Math.max(0, p - 1)).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
  return String(+x.toPrecision(p));
}
function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
function isPrime(n: number) { if (n < 2 || !Number.isInteger(n)) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
function gamma(x: number): number {
  if (Number.isInteger(x) && x > 0 && x < 171) { let r = 1; for (let i = 2; i < x; i++) r *= i; return r; }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1; let a = c[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}
function magic(n: number): Mat {
  const o = mat(n, n), set = (i: number, j: number, v: number) => { o.d[i + j * n] = v; };
  if (n % 2 === 1) { let i = 0, j = (n - 1) / 2; for (let k = 1; k <= n * n; k++) { set(i, j, k); const ni = (i - 1 + n) % n, nj = (j + 1) % n; if (o.d[ni + nj * n]) i = (i + 1) % n; else { i = ni; j = nj; } } }
  else if (n % 4 === 0) { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = i * n + j + 1; set(i, j, (i % 4 === j % 4) || ((i % 4) + (j % 4) === 3) ? n * n + 1 - v : v); } }
  else {
    const h = n / 2, sub = magic(h), k = (n - 2) / 4;
    for (let i = 0; i < h; i++) for (let j = 0; j < h; j++) { const v = sub.d[i + j * h]; set(i, j, v); set(i + h, j + h, v + h * h); set(i, j + h, v + 2 * h * h); set(i + h, j, v + 3 * h * h); }
    for (let i = 0; i < h; i++) {
      const cols = [...Array.from({ length: k }, (_, j) => j), ...Array.from({ length: k - 1 }, (_, j) => n - 1 - j)];
      for (const jj of cols) { const j = i === (h - 1) / 2 && jj < k ? jj + 1 : jj; const t = o.d[i + j * n]; set(i, j, o.d[i + h + j * n]); set(i + h, j, t); }
    }
  }
  return o;
}
function lu(A: Mat) {
  const n = A.r, a = Float64Array.from(A.d), perm = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < Math.min(n, A.c); k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(a[i + k * n]) > Math.abs(a[p + k * n])) p = i;
    if (p !== k) { for (let j = 0; j < A.c; j++) [a[k + j * n], a[p + j * n]] = [a[p + j * n], a[k + j * n]]; [perm[k], perm[p]] = [perm[p], perm[k]]; }
    if (a[k + k * n] === 0) continue;
    for (let i = k + 1; i < n; i++) { a[i + k * n] /= a[k + k * n]; for (let j = k + 1; j < A.c; j++) a[i + j * n] -= a[i + k * n] * a[k + j * n]; }
  }
  const L = mat(n, Math.min(n, A.c)), U = mat(Math.min(n, A.c), A.c), P = mat(n, n);
  for (let i = 0; i < n; i++) { P.d[i + perm[i] * n] = 1; for (let j = 0; j < A.c; j++) { if (j < i && j < L.c) L.d[i + j * n] = a[i + j * n]; else if (i < U.r && j >= i) U.d[i + j * U.r] = a[i + j * n]; } if (i < L.c) L.d[i + i * n] = 1; }
  return { L, U, P };
}
function det(A: Mat): number {
  if (A.r !== A.c) throw new LabError('det needs a square matrix.');
  const n = A.r, a = Float64Array.from(A.d); let d = 1;
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(a[i + k * n]) > Math.abs(a[p + k * n])) p = i;
    if (a[p + k * n] === 0) return 0;
    if (p !== k) { d = -d; for (let j = 0; j < n; j++) [a[k + j * n], a[p + j * n]] = [a[p + j * n], a[k + j * n]]; }
    d *= a[k + k * n];
    for (let i = k + 1; i < n; i++) { const l = a[i + k * n] / a[k + k * n]; for (let j = k; j < n; j++) a[i + j * n] -= l * a[k + j * n]; }
  }
  return d;
}
function rank(A: Mat): number {
  const m = A.r, n = A.c, a = Float64Array.from(A.d); let r = 0;
  const tol = Math.max(m, n) * 2.2e-16 * Math.max(1, ...[...a].map(Math.abs));
  for (let c = 0; c < n && r < m; c++) {
    let p = r; for (let i = r + 1; i < m; i++) if (Math.abs(a[i + c * m]) > Math.abs(a[p + c * m])) p = i;
    if (Math.abs(a[p + c * m]) <= tol) continue;
    for (let j = 0; j < n; j++) [a[r + j * m], a[p + j * m]] = [a[p + j * m], a[r + j * m]];
    for (let i = r + 1; i < m; i++) { const l = a[i + c * m] / a[r + c * m]; for (let j = c; j < n; j++) a[i + j * m] -= l * a[r + j * m]; }
    r++;
  }
  return r;
}
function powerIter(S: Mat): number {
  let v = mat(S.r, 1, Array(S.r).fill(1)), lambda = 0;
  for (let k = 0; k < 500; k++) { const w = matmul(S, v); const n = Math.hypot(...w.d); if (n === 0) return 0; const next = n; v = map1(w, (x) => x / n); if (Math.abs(next - lambda) < 1e-14 * next) { lambda = next; break; } lambda = next; }
  return lambda;
}
/** Eigenvalues and vectors of a symmetric matrix (Jacobi rotations), smallest first as MATLAB lists them. */
function jacobi(S: Mat) {
  const n = S.r, a = Float64Array.from(S.d), v = eye(n).d;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i + j * n] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p + q * n]; if (Math.abs(apq) < 1e-300) continue;
      const th = (a[q + q * n] - a[p + p * n]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k + p * n], akq = a[k + q * n]; a[k + p * n] = c * akp - s * akq; a[k + q * n] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p + k * n], aqk = a[q + k * n]; a[p + k * n] = c * apk - s * aqk; a[q + k * n] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k + p * n], vkq = v[k + q * n]; v[k + p * n] = c * vkp - s * vkq; v[k + q * n] = s * vkp + c * vkq; }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x + x * n] - a[y + y * n]);
  const vectors = mat(n, n);
  order.forEach((src, j) => { let sign = 1; for (let i = 0; i < n; i++) if (Math.abs(v[i + src * n]) > 1e-12) { sign = v[i + src * n] < 0 ? -1 : 1; break; } for (let i = 0; i < n; i++) vectors.d[i + j * n] = sign * v[i + src * n]; });
  return { values: order.map((i) => a[i + i * n]), vectors };
}
const diagOf = (vs: number[]) => { const o = mat(vs.length, vs.length); vs.forEach((x, i) => { o.d[i + i * vs.length] = x; }); return o; };
function adaptiveSimpson(f: (x: number) => number, a: number, b: number, eps: number, depth: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    // Infinite limits: substitute x = t / (1 - t²).
    const g = (t: number) => { const x = t / (1 - t * t); return f(x) * (1 + t * t) / (1 - t * t) ** 2; };
    const ta = a === -Infinity ? -1 + 1e-9 : a === Infinity ? 1 - 1e-9 : (Math.sqrt(1 + 4 * a * a) - 1) / (2 * a || 1) * (a ? 1 : 0);
    const tb = b === Infinity ? 1 - 1e-9 : b === -Infinity ? -1 + 1e-9 : b === 0 ? 0 : (Math.sqrt(1 + 4 * b * b) - 1) / (2 * b);
    return adaptiveSimpson(g, ta, tb, eps, depth);
  }
  const simpson = (x: number, y: number, fx: number, fm: number, fy: number) => ((y - x) / 6) * (fx + 4 * fm + fy);
  const rec = (x: number, y: number, fx: number, fm: number, fy: number, whole: number, e: number, d: number): number => {
    const m = (x + y) / 2, lm = (x + m) / 2, rm = (m + y) / 2, flm = f(lm), frm = f(rm);
    const left = simpson(x, m, fx, flm, fm), right = simpson(m, y, fm, frm, fy);
    if (d <= 0 || Math.abs(left + right - whole) <= 15 * e) return left + right + (left + right - whole) / 15;
    return rec(x, m, fx, flm, fm, left, e / 2, d - 1) + rec(m, y, fm, frm, fy, right, e / 2, d - 1);
  };
  const fa = f(a), fb = f(b), fm = f((a + b) / 2);
  return rec(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), eps, depth);
}
function dopri(f: (t: number, y: number[]) => number[], t0: number, tf: number, y0: number[]) {
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
  const b5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0], b4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
  const dir = Math.sign(tf - t0) || 1;
  let t = t0, y = [...y0], h = dir * Math.abs(tf - t0) / 100;
  const ts = [t], ys = [[...y]];
  const rtol = 1e-3, atol = 1e-6;
  for (let steps = 0; steps < 100000 && dir * (tf - t) > 1e-12 * Math.abs(tf); steps++) {
    if (dir * (t + h - tf) > 0) h = tf - t;
    const k: number[][] = [];
    for (let s = 0; s < 7; s++) k.push(f(t + c[s] * h, y.map((yi, i) => yi + h * A[s].reduce((acc, a, j) => acc + a * k[j][i], 0))));
    const y5 = y.map((yi, i) => yi + h * b5.reduce((acc, b, j) => acc + b * k[j][i], 0));
    const y4 = y.map((yi, i) => yi + h * b4.reduce((acc, b, j) => acc + b * k[j][i], 0));
    const err = Math.sqrt(y5.reduce((s, v, i) => s + ((v - y4[i]) / (atol + rtol * Math.max(Math.abs(v), Math.abs(y[i])))) ** 2, 0) / y.length);
    if (err <= 1 || Math.abs(h) < 1e-12) {
      // Four points inside each step too (MATLAB's ode45 "Refine"), so plots look smooth.
      for (const s of [0.25, 0.5, 0.75]) { ts.push(t + s * h); ys.push(y.map((yi, i) => yi + s * (y5[i] - yi))); }
      t += h; y = y5; ts.push(t); ys.push([...y]);
    }
    h *= Math.min(5, Math.max(0.2, 0.9 * (err || 1e-10) ** -0.2));
  }
  return { ts, ys };
}

export { inline, parse };
