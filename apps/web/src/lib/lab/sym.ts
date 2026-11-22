import { LabError } from './parse';

// Hyperion's symbolic maths (M396, the owner, 22 Nov: "big features which are unique and different… combine 2
// features into one"): our own small computer algebra system. Expressions are trees kept in one tidy form as they are
// built (sums and products flattened, like terms and like powers gathered, exact fractions, known values of sin, cos,
// exp and log worked out), printed the way MATLAB's Symbolic Math Toolbox prints them, and as LaTeX for the command
// window's typeset maths. Calculus, solving and simplifying build on this (sym-calc.ts).

export type N =
  | { t: 'n'; n: number; d: number } // an exact fraction n/d (d > 0, lowest terms)
  | { t: 'f'; v: number } // a decimal (vpa, or a number with no exact form)
  | { t: 's'; name: string }
  | { t: 'c'; name: 'pi' | 'i' | 'inf' | 'nan' }
  | { t: '+'; a: N[] }
  | { t: '*'; a: N[] }
  | { t: '^'; b: N; e: N }
  | { t: 'fn'; name: string; a: N[] }
  | { t: '='; l: N; r: N };

const gcdInt = (a: number, b: number) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

export const INF: N = { t: 'c', name: 'inf' };
export const NAN: N = { t: 'c', name: 'nan' };
export const PI: N = { t: 'c', name: 'pi' };
export const I: N = { t: 'c', name: 'i' };

/** An exact fraction (a decimal when it outgrows whole numbers JavaScript keeps exactly). */
export function rat(n: number, d = 1): N {
  if (!Number.isFinite(n) || !Number.isFinite(d)) return flt(n / d);
  if (d === 0) return n > 0 ? INF : n < 0 ? neg(INF) : NAN;
  if (!Number.isInteger(n) || !Number.isInteger(d) || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return flt(n / d);
  if (d < 0) { n = -n; d = -d; }
  const g = gcdInt(n, d) || 1;
  return { t: 'n', n: n / g || 0, d: d / g };
}
export const flt = (v: number): N => (Number.isNaN(v) ? NAN : !Number.isFinite(v) ? (v > 0 ? INF : neg(INF)) : { t: 'f', v });
export const ZERO = rat(0), ONE = rat(1), MINUS = rat(-1), HALF = rat(1, 2);
export const sym = (name: string): N => ({ t: 's', name });

export const isNum = (x: N): x is Extract<N, { t: 'n' | 'f' }> => x.t === 'n' || x.t === 'f';
export const val = (x: N) => (x.t === 'n' ? x.n / x.d : x.t === 'f' ? x.v : NaN);
export const isInt = (x: N) => x.t === 'n' && x.d === 1;
export const isZero = (x: N) => isNum(x) && val(x) === 0;
export const isOne = (x: N) => isNum(x) && val(x) === 1;
const isNeg = (x: N) => isNum(x) && val(x) < 0;

function numAdd(a: N, b: N): N {
  if (a.t === 'n' && b.t === 'n') {
    const g = gcdInt(a.d, b.d), d = (a.d / g) * b.d, n = a.n * (d / a.d) + b.n * (d / b.d);
    return Number.isSafeInteger(n) && Number.isSafeInteger(d) ? rat(n, d) : flt(val(a) + val(b));
  }
  return flt(val(a) + val(b));
}
function numMul(a: N, b: N): N {
  if (a.t === 'n' && b.t === 'n') {
    const g1 = gcdInt(a.n, b.d) || 1, g2 = gcdInt(b.n, a.d) || 1;
    const n = (a.n / g1) * (b.n / g2), d = (a.d / g2) * (b.d / g1);
    return Number.isSafeInteger(n) && Number.isSafeInteger(d) ? rat(n, d) : flt(val(a) * val(b));
  }
  return flt(val(a) * val(b));
}

// ——— A steady text for each expression (to find like terms) ———

const SER = new WeakMap<N, string>();
export function ser(x: N): string {
  const k = SER.get(x);
  if (k !== undefined) return k;
  let s: string;
  switch (x.t) {
    case 'n': s = `${x.n}/${x.d}`; break;
    case 'f': s = `f${x.v}`; break;
    case 's': s = `s:${x.name}`; break;
    case 'c': s = `c:${x.name}`; break;
    case '+': case '*': s = `${x.t}(${x.a.map(ser).join(',')})`; break;
    case '^': s = `^(${ser(x.b)},${ser(x.e)})`; break;
    case 'fn': s = `${x.name}(${x.a.map(ser).join(',')})`; break;
    case '=': s = `=(${ser(x.l)},${ser(x.r)})`; break;
  }
  SER.set(x, s);
  return s;
}
export const same = (a: N, b: N) => a === b || ser(a) === ser(b);

// ——— Order: terms by degree (highest first, x before y), factors with symbols first ———

/** A term's powers of each symbol (other factors ignored) and whether it has anything but a number. */
function monomial(x: N): Map<string, number> {
  const m = new Map<string, number>();
  const one = (f: N) => {
    if (f.t === 's') m.set(f.name, (m.get(f.name) ?? 0) + 1);
    else if (f.t === '^' && f.b.t === 's' && isNum(f.e)) m.set(f.b.name, (m.get(f.b.name) ?? 0) + val(f.e));
  };
  if (x.t === '*') x.a.forEach(one); else one(x);
  return m;
}
function termCmp(a: N, b: N): number {
  const ca = isNum(a) ? 1 : 0, cb = isNum(b) ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const ma = monomial(a), mb = monomial(b);
  const da = [...ma.values()].reduce((s, v) => s + v, 0), db = [...mb.values()].reduce((s, v) => s + v, 0);
  if (da !== db) return db - da;
  const names = [...new Set([...ma.keys(), ...mb.keys()])].sort();
  for (const n of names) { const d = (mb.get(n) ?? 0) - (ma.get(n) ?? 0); if (d) return d > 0 ? 1 : -1; }
  const sa = ser(rest(a)), sb = ser(rest(b));
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
function factorRank(x: N): number {
  const b = x.t === '^' ? x.b : x;
  return b.t === 'c' ? 0 : b.t === 's' ? 1 : b.t === 'fn' ? 3 : 2;
}
function factorCmp(a: N, b: N): number {
  const ra = factorRank(a), rb = factorRank(b);
  if (ra !== rb) return ra - rb;
  const ba = a.t === '^' ? a.b : a, bb = b.t === '^' ? b.b : b;
  const sa = ba.t === 's' ? ba.name : ser(ba), sb = bb.t === 's' ? bb.name : ser(bb);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ——— Building expressions (each constructor returns the tidy form) ———

/** A term's number in front, and the rest. */
export function coefOf(x: N): [N, N] {
  if (isNum(x)) return [x, ONE];
  if (x.t === '*' && isNum(x.a[0])) return [x.a[0], x.a.length === 2 ? x.a[1] : { t: '*', a: x.a.slice(1) }];
  return [ONE, x];
}
const rest = (x: N) => coefOf(x)[1];
function withCoef(c: N, r: N): N {
  if (isOne(r)) return c;
  if (isOne(c)) return r;
  return r.t === '*' ? { t: '*', a: [c, ...r.a] } : { t: '*', a: [c, r] };
}

export function add(...xs: N[]): N {
  let c: N = ZERO, inf = 0, nan = false;
  const terms = new Map<string, { k: N; r: N }>();
  const take = (x: N) => {
    if (x.t === '+') { x.a.forEach(take); return; }
    if (isNum(x)) { c = numAdd(c, x); return; }
    const [k, r] = coefOf(x);
    if (r.t === 'c' && (r.name === 'nan')) { nan = true; return; }
    if (r.t === 'c' && r.name === 'inf') { inf |= val(k) > 0 ? 1 : 2; return; }
    const s = ser(r), had = terms.get(s);
    if (had) had.k = numAdd(had.k, k); else terms.set(s, { k, r });
  };
  xs.forEach(take);
  if (nan || inf === 3) return NAN;
  if (inf) return inf === 1 ? INF : neg(INF);
  const out: N[] = [];
  for (const { k, r } of terms.values()) if (!isZero(k)) out.push(withCoef(k, r));
  if (!isZero(c) || !out.length) out.push(c);
  if (out.length === 1) return out[0];
  return { t: '+', a: out.sort(termCmp) };
}

export function mul(...xs: N[]): N {
  let c: N = ONE, nan = false, inf = 0;
  // Factors by base; one factor alone is kept as it came (already tidy), several have their powers added.
  const bases = new Map<string, { b: N; e: N[]; x: N }>();
  const take = (x: N) => {
    if (x.t === '*') { x.a.forEach(take); return; }
    if (isNum(x)) { c = numMul(c, x); return; }
    if (x.t === 'c' && x.name === 'nan') { nan = true; return; }
    if (x.t === 'c' && x.name === 'inf') { inf++; return; }
    const [b, e] = x.t === '^' ? [x.b, x.e] : [x, ONE];
    const s = ser(b), had = bases.get(s);
    if (had) had.e.push(e); else bases.set(s, { b, e: [e], x });
  };
  xs.forEach(take);
  if (nan || (inf && isZero(c))) return NAN;
  if (inf) return val(c) < 0 ? neg(INF) : INF;
  if (isZero(c)) return ZERO;
  const out: N[] = [];
  for (const { b, e, x } of bases.values()) {
    const p = e.length === 1 ? x : pow(b, add(...e));
    if (isNum(p)) c = numMul(c, p);
    else if (p.t === '*') for (const f of p.a) { if (isNum(f)) c = numMul(c, f); else out.push(f); }
    else if (!isOne(p)) out.push(p);
  }
  if (!out.length) return c;
  out.sort(factorCmp);
  return isOne(c) ? (out.length === 1 ? out[0] : { t: '*', a: out }) : { t: '*', a: [c, ...out] };
}

export const neg = (x: N): N => (x.t === 'c' && x.name === 'inf' ? { t: '*', a: [MINUS, INF] } : mul(MINUS, x));
export const sub = (a: N, b: N) => add(a, neg(b));
export const div = (a: N, b: N) => mul(a, pow(b, MINUS));

/** The largest a with a^q dividing m (trial division; m stays below 2^53). */
function perfect(m: number, q: number): number {
  let a = 1, s = m;
  for (let p = 2; p * p <= s && p < 1e6; p++) {
    let k = 0;
    while (s % p === 0) { s /= p; k++; }
    a *= p ** Math.floor(k / q);
  }
  return a;
}

function numPow(b: Extract<N, { t: 'n' | 'f' }>, e: Extract<N, { t: 'n' | 'f' }>): N {
  if (b.t === 'f' || e.t === 'f') {
    const v = Math.pow(val(b), val(e));
    return Number.isNaN(v) ? { t: '^', b, e } : flt(v);
  }
  if (e.d === 1) {
    const k = Math.abs(e.n), n = b.n ** k, d = b.d ** k;
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return flt(Math.pow(val(b), val(e)));
    return e.n > 0 ? rat(n, d) : rat(d, n);
  }
  // A root: b^(p/q) = b^k · b^(r/q), and b^(r/q) = (n^r · d^(q−r))^(1/q) / d, with perfect powers taken out.
  const p = e.n, q = e.d;
  if (b.n < 0) {
    if (q !== 2) return { t: '^', b, e };
    return mul(pow(I, rat(p)), numPow(rat(-b.n, b.d) as Extract<N, { t: 'n' }>, e as Extract<N, { t: 'n' }>));
  }
  const k = Math.floor(p / q), r = p - k * q;
  const m = b.n ** r * b.d ** (q - r);
  if (!Number.isSafeInteger(m)) return flt(Math.pow(val(b), val(e)));
  const a = perfect(m, q), s = m / a ** q;
  const front = numMul(numPow(b, rat(k) as Extract<N, { t: 'n' }>), rat(a, b.d));
  return s === 1 ? front : mul(front, { t: '^', b: rat(s), e: rat(1, q) });
}

export function pow(b: N, e: N): N {
  if (isNum(e) && val(e) === 0) return ONE;
  if (isOne(e)) return b;
  if (b.t === 'c' && b.name === 'nan') return NAN;
  if (isNum(b)) {
    if (val(b) === 1) return ONE;
    if (val(b) === 0) return isNum(e) ? (val(e) < 0 ? INF : ZERO) : { t: '^', b, e };
    if (isNum(e)) return numPow(b, e);
  }
  if (b.t === 'c' && b.name === 'inf' && isNum(e)) return val(e) > 0 ? INF : ZERO;
  if (b.t === 'c' && b.name === 'i' && isInt(e)) return [ONE, I, MINUS, neg(I)][(((val(e) % 4) + 4) % 4)];
  if (b.t === '^' && isInt(e)) return pow(b.b, mul(b.e, e));
  if (b.t === '*' && isInt(e)) return mul(...b.a.map((f) => pow(f, e)));
  return { t: '^', b, e };
}
export const sqrt = (x: N) => pow(x, HALF);

// Exact values of sin and cos at multiples of pi/12 we know by heart: [k (of pi/12)] → value.
const S3 = () => sqrt(rat(3)), S2 = () => sqrt(rat(2));
function sinTable(k: number): N | null {
  const t = ((k % 24) + 24) % 24, sgn = t >= 12 ? -1 : 1, u = t % 12, v = u > 6 ? 12 - u : u;
  const base = [ZERO, null, HALF, mul(HALF, S2()), mul(HALF, S3()), null, ONE][v];
  return base ? mul(rat(sgn), base) : null;
}
/** q·pi with q a fraction, or null. */
function piMultiple(x: N): N | null {
  if (x.t === 'c' && x.name === 'pi') return ONE;
  if (x.t === '*' && x.a.length === 2 && x.a[0].t === 'n' && x.a[1].t === 'c' && x.a[1].name === 'pi') return x.a[0];
  if (isZero(x)) return ZERO;
  return null;
}
/** Whether an argument reads as negative (a negative number in front). */
const looksNeg = (x: N) => isNeg(x) || (x.t === '*' && isNeg(x.a[0]));

export const FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'log', 'log2', 'log10', 'abs', 'sign', 'heaviside', 'erf', 'gamma', 'floor', 'ceil', 'round', 'real', 'imag', 'conj'] as const;
const NUMERIC: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10, abs: Math.abs, sign: Math.sign, heaviside: (x) => (x > 0 ? 1 : x < 0 ? 0 : 0.5),
  floor: Math.floor, ceil: Math.ceil, round: Math.round, real: (x) => x, imag: () => 0, conj: (x) => x,
  erf: (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; },
  gamma: (x) => { if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * NUMERIC.gamma(1 - x)); const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i); return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a; },
};

export function fn(name: string, ...a: N[]): N {
  if (name === 'sqrt') return sqrt(a[0]);
  const x = a[0];
  if (a.length === 1 && x.t === 'c' && x.name === 'nan') return NAN;
  if (a.length === 1 && x.t === 'f' && NUMERIC[name]) return flt(NUMERIC[name](x.v));
  const q = a.length === 1 ? piMultiple(x) : null;
  switch (name) {
    case 'sin': case 'cos': {
      if (q && q.t === 'n' && 12 % q.d === 0) { const k = (q.n * 12) / q.d + (name === 'cos' ? 6 : 0), v = sinTable(k); if (v) return v; }
      if (looksNeg(x)) return name === 'sin' ? neg(fn('sin', neg(x))) : fn('cos', neg(x));
      break;
    }
    case 'tan': {
      if (q && q.t === 'n' && 12 % q.d === 0) { const s = fn('sin', x), c = fn('cos', x); if (!isZero(c) && s.t !== 'fn' && c.t !== 'fn') return div(s, c); }
      if (looksNeg(x)) return neg(fn('tan', neg(x)));
      break;
    }
    case 'sinh': case 'tanh': case 'asin': case 'atan': case 'asinh': case 'atanh': case 'erf':
      if (isZero(x)) return ZERO;
      if (looksNeg(x)) return neg(fn(name, neg(x)));
      if (name === 'atan' && isOne(x)) return mul(rat(1, 4), PI);
      if (name === 'asin' && isOne(x)) return mul(HALF, PI);
      if (name === 'asin' && x.t === 'n' && x.n === 1 && x.d === 2) return mul(rat(1, 6), PI);
      break;
    case 'cosh': if (isZero(x)) return ONE; if (looksNeg(x)) return fn('cosh', neg(x)); break;
    case 'acos':
      if (isOne(x)) return ZERO;
      if (isZero(x)) return mul(HALF, PI);
      if (isNum(x) && val(x) === -1) return PI;
      if (x.t === 'n' && x.n === 1 && x.d === 2) return mul(rat(1, 3), PI);
      break;
    case 'exp':
      if (isZero(x)) return ONE;
      if (x.t === 'fn' && x.name === 'log') return x.a[0];
      if (x.t === '*' && x.a.length === 2 && x.a[1].t === 'fn' && x.a[1].name === 'log' && isNum(x.a[0])) return pow(x.a[1].a[0], x.a[0]);
      if (x.t === 'c' && x.name === 'inf') return INF;
      break;
    case 'log':
      if (isOne(x)) return ZERO;
      if (isZero(x)) return neg(INF);
      if (x.t === 'fn' && x.name === 'exp') return x.a[0];
      if (x.t === 'c' && x.name === 'inf') return INF;
      break;
    case 'abs':
      if (isNum(x)) return isNeg(x) ? neg(x) : x;
      if (x.t === 'c' && (x.name === 'pi' || x.name === 'inf')) return x;
      if (looksNeg(x)) return fn('abs', neg(x));
      if (x.t === 'fn' && x.name === 'abs') return x;
      break;
    case 'sign': if (isNum(x)) return rat(Math.sign(val(x))); break;
    case 'heaviside': if (isNum(x)) return val(x) > 0 ? ONE : val(x) < 0 ? ZERO : HALF; break;
    case 'floor': case 'ceil': case 'round': if (isNum(x)) return rat(NUMERIC[name](val(x))); break;
    case 'gamma': if (isInt(x) && val(x) > 0 && val(x) < 20) { let g = 1; for (let k = 2; k < val(x); k++) g *= k; return rat(g); } break;
    case 'real': case 'conj': if (isNum(x)) return x; break;
    case 'imag': if (isNum(x)) return ZERO; break;
  }
  return { t: 'fn', name, a };
}
export const eq = (l: N, r: N): N => ({ t: '=', l, r });

// ——— Questions about an expression ———

/** Whether x appears in e. */
export function has(e: N, x: string): boolean {
  switch (e.t) {
    case 's': return e.name === x;
    case '+': case '*': case 'fn': return e.a.some((a) => has(a, x));
    case '^': return has(e.b, x) || has(e.e, x);
    case '=': return has(e.l, x) || has(e.r, x);
    default: return false;
  }
}
/** Every symbol in e, sorted as MATLAB's symvar sorts them (closest to x first for one, otherwise alphabetically). */
export function symbols(e: N, out = new Set<string>()): Set<string> {
  switch (e.t) {
    case 's': out.add(e.name); break;
    case '+': case '*': case 'fn': e.a.forEach((a) => symbols(a, out)); break;
    case '^': symbols(e.b, out); symbols(e.e, out); break;
    case '=': symbols(e.l, out); symbols(e.r, out); break;
  }
  return out;
}
/** The variable MATLAB would pick: x first, then the letter closest to x, then the first in the alphabet. */
export function mainVar(e: N): string | null {
  const all = [...symbols(e)];
  if (!all.length) return null;
  const dist = (s: string) => (s.length === 1 ? Math.abs(s.charCodeAt(0) - 120) : 100 + s.length);
  return all.sort((a, b) => dist(a) - dist(b) || (a < b ? -1 : 1))[0];
}
/** Replace every `from` with `to`. */
export function subst(e: N, from: N, to: N): N {
  if (same(e, from)) return to;
  switch (e.t) {
    case '+': return add(...e.a.map((a) => subst(a, from, to)));
    case '*': return mul(...e.a.map((a) => subst(a, from, to)));
    case '^': return pow(subst(e.b, from, to), subst(e.e, from, to));
    case 'fn': return fn(e.name, ...e.a.map((a) => subst(a, from, to)));
    case '=': return eq(subst(e.l, from, to), subst(e.r, from, to));
    default: return e;
  }
}
/** A measure of how big an expression is (simplify keeps the smallest). */
export function size(e: N): number {
  switch (e.t) {
    case 'n': return e.d === 1 ? 1 : 2;
    case '+': case '*': return 1 + e.a.reduce((s, a) => s + size(a), 0);
    case '^': return 1 + size(e.b) + size(e.e);
    case 'fn': return 2 + e.a.reduce((s, a) => s + size(a), 0);
    case '=': return 1 + size(e.l) + size(e.r);
    default: return 1;
  }
}

// ——— Numbers: an expression worked out (complex: [re, im]) ———

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cexp = (a: C): C => { const m = Math.exp(a[0]); return [m * Math.cos(a[1]), m * Math.sin(a[1])]; };
const clog = (a: C): C => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
function cpow(a: C, b: C): C {
  if (a[1] === 0 && b[1] === 0 && (a[0] >= 0 || Number.isInteger(b[0]))) return [Math.pow(a[0], b[0]), 0];
  if (a[0] === 0 && a[1] === 0) return [b[0] === 0 ? 1 : 0, 0];
  return cexp(cmul(b, clog(a)));
}
export function evalC(e: N, env: Map<string, C> = new Map()): C {
  switch (e.t) {
    case 'n': case 'f': return [val(e), 0];
    case 'c': return e.name === 'pi' ? [Math.PI, 0] : e.name === 'i' ? [0, 1] : e.name === 'inf' ? [Infinity, 0] : [NaN, 0];
    case 's': { const v = env.get(e.name); if (!v) throw new LabError(`“${e.name}” has no value: give one with subs, or keep it symbolic.`); return v; }
    case '+': return e.a.reduce<C>((s, a) => { const v = evalC(a, env); return [s[0] + v[0], s[1] + v[1]]; }, [0, 0]);
    case '*': return e.a.reduce<C>((s, a) => cmul(s, evalC(a, env)), [1, 0]);
    case '^': return cpow(evalC(e.b, env), evalC(e.e, env));
    case '=': throw new LabError('An equation has no value: solve it, or use lhs and rhs.');
    case 'fn': {
      const v = e.a.map((a) => evalC(a, env));
      const [x] = v;
      if (x[1] === 0) {
        const r = NUMERIC[e.name]?.(x[0]);
        if (r !== undefined && !Number.isNaN(r)) return [r, 0];
      }
      switch (e.name) {
        case 'exp': return cexp(x);
        case 'log': return clog(x);
        case 'log10': { const l = clog(x); return [l[0] / Math.LN10, l[1] / Math.LN10]; }
        case 'log2': { const l = clog(x); return [l[0] / Math.LN2, l[1] / Math.LN2]; }
        case 'sqrt': return cpow(x, [0.5, 0]);
        case 'abs': return [Math.hypot(x[0], x[1]), 0];
        case 'real': return [x[0], 0];
        case 'imag': return [x[1], 0];
        case 'conj': return [x[0], -x[1]];
        case 'sin': return [Math.sin(x[0]) * Math.cosh(x[1]), Math.cos(x[0]) * Math.sinh(x[1])];
        case 'cos': return [Math.cos(x[0]) * Math.cosh(x[1]), -Math.sin(x[0]) * Math.sinh(x[1])];
        case 'asin': case 'acos': {
          // asin z = −i·log(iz + √(1 − z²)); acos z = π/2 − asin z.
          const s = cpow([1 - (x[0] * x[0] - x[1] * x[1]), -2 * x[0] * x[1]], [0.5, 0]), l = clog([s[0] - x[1], s[1] + x[0]]), as: C = [l[1], -l[0]];
          return e.name === 'asin' ? as : [Math.PI / 2 - as[0], -as[1]];
        }
      }
      return [NaN, 0];
    }
  }
}

// ——— Printing as MATLAB does (and as LaTeX) ———

/** Numbers as decimals: up to `digits` significant figures (vpa's 32), trailing zeros dropped. */
export function decimal(v: number, digits = 32): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf';
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return String(v);
  const p = Math.max(1, Math.min(digits, 17));
  const s = v.toPrecision(p);
  if (s.includes('e')) { const [m, ex] = s.split('e'); return `${m.replace(/\.?0+$/, '')}e${ex}`; }
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

const PREC = (x: N): number => {
  if (x.t === '+' || x.t === '=') return 1;
  if (x.t === '*') return 2;
  if (x.t === 'n') return x.n < 0 ? 1.5 : x.d !== 1 ? 2 : 4;
  if (x.t === 'f') return x.v < 0 ? 1.5 : 4;
  if (x.t === '^') return 3;
  return 4;
};

/** A product's parts above and below the line, and its sign. */
function fraction(x: N): { minus: boolean; up: N[]; down: N[] } {
  const fs = x.t === '*' ? x.a : [x];
  let minus = false;
  const up: N[] = [], down: N[] = [];
  for (const f of fs) {
    if (f.t === 'n') {
      if (f.n < 0) minus = !minus;
      if (Math.abs(f.n) !== 1) up.push(rat(Math.abs(f.n)));
      if (f.d !== 1) down.push(rat(f.d));
    } else if (f.t === 'f') {
      if (f.v < 0) minus = !minus;
      if (Math.abs(f.v) !== 1) up.push(flt(Math.abs(f.v)));
    } else if (f.t === '^' && (isNeg(f.e) || (f.e.t === '*' && isNeg(f.e.a[0])))) down.push(pow(f.b, neg(f.e)));
    else up.push(f);
  }
  return { minus, up, down };
}

export function print(x: N, digits = 32): string {
  const wrap = (y: N, above: number) => (PREC(y) <= above ? `(${print(y, digits)})` : print(y, digits));
  switch (x.t) {
    case 'n': return x.d === 1 ? String(x.n) : `${x.n}/${x.d}`;
    case 'f': return decimal(x.v, digits);
    case 's': return x.name;
    case 'c': return x.name === 'pi' ? 'pi' : x.name === 'i' ? '1i' : x.name === 'inf' ? 'Inf' : 'NaN';
    case '=': return `${print(x.l, digits)} == ${print(x.r, digits)}`;
    case 'fn': return `${x.name}(${x.a.map((a) => print(a, digits)).join(', ')})`;
    case '+': {
      let s = print(x.a[0], digits);
      for (const t of x.a.slice(1)) {
        if (looksNeg(t)) s += ` - ${wrap(neg(t), 1)}`;
        else s += ` + ${wrap(t, 1)}`;
      }
      return s;
    }
    case '^': {
      if (isNeg(x.e)) return `1/${wrap(pow(x.b, neg(x.e)), 2)}`;
      const e = (x.e.t === 'n' && x.e.d === 1 && x.e.n > 0) || x.e.t === 's' || x.e.t === 'c' ? print(x.e, digits) : `(${print(x.e, digits)})`;
      return `${wrap(x.b, 3)}^${e}`;
    }
    case '*': {
      // A multiple of i is written as MATLAB writes it: 2i, -3i.
      if (x.a.length === 2 && x.a[0].t === 'n' && x.a[0].d === 1 && x.a[1].t === 'c' && x.a[1].name === 'i') return `${x.a[0].n}i`;
      const { minus, up, down } = fraction(x);
      const top = up.length ? up.map((f) => wrap(f, 1)).join('*') : '1';
      let s = top;
      if (down.length) {
        const bottom = down.length === 1 ? wrap(down[0], 2) : `(${down.map((f) => wrap(f, 1)).join('*')})`;
        s = `${top}/${bottom}`;
      }
      return minus ? `-${s}` : s;
    }
  }
}

const TEXFN: Record<string, string> = { sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan', exp: '\\mathrm{e}^', log: '\\ln' };
export function latex(x: N, digits = 32): string {
  const wrap = (y: N, above: number) => (PREC(y) <= above ? `\\left(${latex(y, digits)}\\right)` : latex(y, digits));
  switch (x.t) {
    case 'n': return x.d === 1 ? String(x.n) : `${x.n < 0 ? '-' : ''}\\frac{${Math.abs(x.n)}}{${x.d}}`;
    case 'f': return decimal(x.v, digits).replace(/e([+-]?\d+)$/, '\\times 10^{$1}');
    case 's': return x.name.length > 1 && !/^[a-z]+\d*$/i.test(x.name) ? `\\mathrm{${x.name}}` : greek(x.name);
    case 'c': return x.name === 'pi' ? '\\pi' : x.name === 'i' ? '\\mathrm{i}' : x.name === 'inf' ? '\\infty' : '\\mathrm{NaN}';
    case '=': return `${latex(x.l, digits)} = ${latex(x.r, digits)}`;
    case 'fn': {
      if (x.name === 'exp') return `\\mathrm{e}^{${latex(x.a[0], digits)}}`;
      if (x.name === 'abs') return `\\left|${latex(x.a[0], digits)}\\right|`;
      const name = TEXFN[x.name] ?? `\\operatorname{${x.name}}`;
      return `${name}\\left(${x.a.map((a) => latex(a, digits)).join(', ')}\\right)`;
    }
    case '+': {
      let s = latex(x.a[0], digits);
      for (const t of x.a.slice(1)) s += looksNeg(t) ? ` - ${wrap(neg(t), 1)}` : ` + ${wrap(t, 1)}`;
      return s;
    }
    case '^': {
      if (isNeg(x.e)) return `\\frac{1}{${latex(pow(x.b, neg(x.e)), digits)}}`;
      if (x.e.t === 'n' && x.e.n === 1 && x.e.d > 1) return x.e.d === 2 ? `\\sqrt{${latex(x.b, digits)}}` : `\\sqrt[${x.e.d}]{${latex(x.b, digits)}}`;
      const base = x.b.t === 'fn' && x.b.name !== 'exp' && x.b.name !== 'abs' ? `{${latex(x.b, digits)}}` : wrap(x.b, 3);
      return `${base}^{${latex(x.e, digits)}}`;
    }
    case '*': {
      const { minus, up, down } = fraction(x);
      // A thin space between factors; a dot between two numbers.
      const join = (fs: N[]) => fs.map((f) => wrap(f, 1)).reduce((s, f, k) => (k === 0 ? f : /\d$/.test(s) && /^\d/.test(f) ? `${s} \\cdot ${f}` : `${s}\\,${f}`), '');
      const inner = (fs: N[]) => (fs.length === 1 ? latex(fs[0], digits) : join(fs));
      const s = down.length ? `\\frac{${up.length ? inner(up) : '1'}}{${inner(down)}}` : up.length ? join(up) : '1';
      return minus ? `-${s}` : s;
    }
  }
}
const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Sigma', 'Phi', 'Psi', 'Omega']);
function greek(name: string): string {
  const m = /^([A-Za-z]+?)(\d*)$/.exec(name);
  if (!m) return name;
  const [, letters, digits] = m;
  const head = GREEK.has(letters) ? `\\${letters}` : letters.length > 1 ? `\\mathrm{${letters}}` : letters;
  return digits ? `${head}_{${digits}}` : head;
}

// ——— Calculus and algebra that every other part uses ———

/** The derivative of e with respect to x. */
export function diff(e: N, x: string): N {
  if (!has(e, x)) return ZERO;
  switch (e.t) {
    case 's': return ONE;
    case '+': return add(...e.a.map((a) => diff(a, x)));
    case '*': return add(...e.a.map((a, i) => mul(diff(a, x), ...e.a.filter((_, j) => j !== i))));
    case '=': return eq(diff(e.l, x), diff(e.r, x));
    case '^': {
      const { b, e: p } = e;
      if (!has(p, x)) return mul(p, pow(b, sub(p, ONE)), diff(b, x));
      if (!has(b, x)) return mul(e, fn('log', b), diff(p, x));
      return mul(e, add(mul(diff(p, x), fn('log', b)), div(mul(p, diff(b, x)), b)));
    }
    case 'fn': {
      const u = e.a[0], du = diff(u, x);
      const d = DERIV[e.name];
      if (!d) throw new LabError(`I can’t differentiate ${e.name} yet.`);
      return mul(d(u), du);
    }
    default: return ZERO;
  }
}
const DERIV: Record<string, (u: N) => N> = {
  sin: (u) => fn('cos', u), cos: (u) => neg(fn('sin', u)), tan: (u) => add(pow(fn('tan', u), rat(2)), ONE),
  cot: (u) => neg(add(pow(fn('cot', u), rat(2)), ONE)), sec: (u) => mul(fn('sec', u), fn('tan', u)), csc: (u) => neg(mul(fn('cot', u), fn('csc', u))),
  asin: (u) => pow(sub(ONE, pow(u, rat(2))), rat(-1, 2)), acos: (u) => neg(pow(sub(ONE, pow(u, rat(2))), rat(-1, 2))), atan: (u) => pow(add(pow(u, rat(2)), ONE), MINUS),
  sinh: (u) => fn('cosh', u), cosh: (u) => fn('sinh', u), tanh: (u) => sub(ONE, pow(fn('tanh', u), rat(2))),
  asinh: (u) => pow(add(pow(u, rat(2)), ONE), rat(-1, 2)), acosh: (u) => pow(sub(pow(u, rat(2)), ONE), rat(-1, 2)), atanh: (u) => pow(sub(ONE, pow(u, rat(2))), MINUS),
  exp: (u) => fn('exp', u), log: (u) => pow(u, MINUS), log2: (u) => pow(mul(u, fn('log', rat(2))), MINUS), log10: (u) => pow(mul(u, fn('log', rat(10))), MINUS),
  abs: (u) => fn('sign', u), sign: () => ZERO, heaviside: (u) => fn('dirac', u), erf: (u) => mul(rat(2), pow(PI, rat(-1, 2)), fn('exp', neg(pow(u, rat(2))))),
  floor: () => ZERO, ceil: () => ZERO, round: () => ZERO,
};

/** Products of sums multiplied out, whole powers of sums opened (MATLAB's expand). */
export function expand(e: N): N {
  switch (e.t) {
    case '+': return add(...e.a.map(expand));
    case '*': return e.a.map(expand).reduce((acc, f) => distribute(acc, f), ONE as N);
    case '^': {
      const b = expand(e.b);
      if (b.t === '+' && isInt(e.e) && val(e.e) > 1 && val(e.e) <= 60) {
        let out: N = ONE;
        for (let k = 0; k < val(e.e); k++) out = distribute(out, b);
        return out;
      }
      if (b.t === '+' && isInt(e.e) && val(e.e) < 0 && val(e.e) >= -60) return pow(expand(pow(b, neg(e.e))), MINUS);
      return pow(b, expand(e.e));
    }
    case 'fn': {
      const a = e.a.map(expand);
      if (e.name === 'exp' && a[0].t === '+') return mul(...a[0].a.map((t) => fn('exp', t)));
      return fn(e.name, ...a);
    }
    case '=': return eq(expand(e.l), expand(e.r));
    default: return e;
  }
}
function distribute(a: N, b: N): N {
  const as = a.t === '+' ? a.a : [a], bs = b.t === '+' ? b.a : [b];
  if (as.length * bs.length > 20000) throw new LabError('That expansion is too big.');
  const out: N[] = [];
  for (const x of as) for (const y of bs) out.push(mul(x, y));
  return add(...out);
}

/** The coefficients of e as a polynomial in x, lowest power first (null when it isn't one). */
export function polyOf(e: N, x: string): N[] | null {
  const ex = expand(e), terms = ex.t === '+' ? ex.a : [ex], out: N[] = [];
  for (const t of terms) {
    let k = 0;
    const others: N[] = [];
    for (const f of t.t === '*' ? t.a : [t]) {
      if (f.t === 's' && f.name === x) k += 1;
      else if (f.t === '^' && f.b.t === 's' && f.b.name === x && isInt(f.e) && val(f.e) > 0) k += val(f.e);
      else if (has(f, x)) return null;
      else others.push(f);
    }
    if (k > 1000) return null;
    while (out.length <= k) out.push(ZERO);
    out[k] = add(out[k], mul(...others));
  }
  while (out.length > 1 && isZero(out[out.length - 1])) out.pop();
  return out.length ? out : [ZERO];
}
/** A polynomial in x from coefficients (lowest power first). */
export const fromPoly = (cs: N[], x: string): N => add(...cs.map((c, k) => mul(c, pow(sym(x), rat(k)))));

/** e split into its numerator and denominator (MATLAB's numden), with fractions brought to one line. */
export function numden(e: N): [N, N] {
  switch (e.t) {
    case 'n': return [rat(e.n), rat(e.d)];
    case '+': {
      let num: N = ZERO, den: N = ONE;
      for (const t of e.a) {
        const [n, d] = numden(t);
        if (same(d, den)) num = add(num, n);
        else { num = add(mul(num, d), mul(n, den)); den = mul(den, d); }
      }
      return [expand(num), den];
    }
    case '*': {
      const parts = e.a.map(numden);
      return [mul(...parts.map((p) => p[0])), mul(...parts.map((p) => p[1]))];
    }
    case '^': {
      if (isNeg(e.e) || (e.e.t === '*' && isNeg(e.e.a[0]))) { const [n, d] = numden(pow(e.b, neg(e.e))); return [d, n]; }
      if (isInt(e.e)) { const [n, d] = numden(e.b); return [pow(n, e.e), pow(d, e.e)]; }
      return [e, ONE];
    }
    default: return [e, ONE];
  }
}
