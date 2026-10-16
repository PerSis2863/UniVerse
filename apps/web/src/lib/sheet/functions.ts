import type { Ast, ErrCode } from './formula';
import { MAX_COLS, MAX_ROWS, addr, type Area } from './refs';
import { compare, dateFrom, dateOf, err, isErr, isM, numberFrom, serial, serialOf, timeFrom, toBool, toNum, toText, type Err, type M, type V } from './values';
import { formatCode, roundTo } from './format';

// Spreadsheet functions (Stage 5 · Office suite): Excel's everyday ones, with Excel's rules for
// what counts (SUM skips text in a range but reads "3" typed straight in), errors (#DIV/0!, #N/A…)
// and criteria (">5", "<>done", "a*"). Import-free; tested in calc.test.ts.

export interface Ctx {
  /** A cell's value (the sheet as written in the formula, or null for the formula's own). */
  cell(sheet: string | null, r: number, c: number): V;
  /** An area's values; whole columns stop at the sheet's last used row. */
  area(sheet: string | null, a: Area): M;
  /** The cell being worked out. */
  here: { r: number; c: number };
  /** Now (ms), for TODAY() and NOW(). */
  now: number;
  rand: () => number;
}
export type Ev = (a: Ast) => V | M;
type Fn = (a: Ast[], ev: Ev, ctx: Ctx) => V | M;

/** Thrown inside a function to give an error as its result. */
export class Fail { constructor(public v: Err) {} }
const fail = (e: ErrCode): never => { throw new Fail(err(e)); };
const ok = <T,>(x: T | Err): T => { if (isErr(x)) throw new Fail(x); return x; };

const scalar = (x: V | M): V => (isM(x) ? (x[0]?.[0] ?? null) : x);
const flat = (x: V | M): V[] => (isM(x) ? x.flat() : [x]);
const isRef = (a: Ast) => a.k === 'ref' || a.k === 'area';
const argc = (a: Ast[], min: number, max = min) => { if (a.length < min || a.length > max) fail('#VALUE!'); };
/** An empty argument (IF(A1,,2)) reads as "". */
const given = (a: Ast | undefined) => !!a && !(a.k === 'str' && a.v === '');

const num = (x: V | M) => ok(toNum(scalar(x)));
const text = (x: V | M) => ok(toText(scalar(x)));
const bool = (x: V | M) => ok(toBool(scalar(x)));
const int = (x: V | M) => Math.trunc(num(x));

/** The numbers in a function's arguments: in areas and references only real numbers count (text,
 *  TRUE/FALSE and blanks are skipped); typed straight in, text that reads as a number counts. */
function numbers(args: Ast[], ev: Ev): number[] {
  const out: number[] = [];
  for (const a of args) {
    const v = ev(a);
    if (isRef(a) || isM(v)) {
      for (const x of flat(v)) { if (isErr(x)) throw new Fail(x); if (typeof x === 'number') out.push(x); }
    } else if (v !== null && v !== '') out.push(ok(toNum(v)));
  }
  return out;
}
const values = (args: Ast[], ev: Ev) => args.flatMap((a) => flat(ev(a)));

/** A criteria test as COUNTIF reads it: 5, ">5", "<>x", "=", "a*b?" (wildcards), "~*" for a star. */
export function criteria(c: V): (v: V) => boolean {
  if (typeof c === 'boolean') return (v) => v === c;
  if (typeof c === 'number') return (v) => v === c || (typeof v === 'string' && numberFrom(v) === c);
  if (isErr(c)) return (v) => isErr(v) && v.e === c.e;
  const s = c ?? '';
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s)!;
  const op = m[1] ?? '=';
  const rhs = m[2];
  const n = numberFrom(rhs) ?? dateFrom(rhs);
  if (op === '=' || op === '<>') {
    let test: (v: V) => boolean;
    if (rhs === '') test = (v) => v === null || v === '';
    else if (n != null) test = (v) => (typeof v === 'number' ? v === n : typeof v === 'string' && numberFrom(v) === n);
    else if (/^(TRUE|FALSE)$/i.test(rhs)) test = (v) => typeof v === 'boolean' && v === /^TRUE$/i.test(rhs);
    else {
      const re = new RegExp(`^${rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\\\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?')}$`, 'i');
      test = (v) => typeof v === 'string' && re.test(v);
    }
    return op === '=' ? test : (v) => !test(v);
  }
  if (n != null) return (v) => typeof v === 'number' && (op === '<' ? v < n : op === '>' ? v > n : op === '<=' ? v <= n : v >= n);
  return (v) => typeof v === 'string' && (op === '<' ? compare(v, rhs) < 0 : op === '>' ? compare(v, rhs) > 0 : op === '<=' ? compare(v, rhs) <= 0 : compare(v, rhs) >= 0);
}

/** The cells of several (area, criteria) pairs that meet them all, as positions in the first. */
function matching(a: Ast[], ev: Ev, from: number): { size: [number, number]; hits: [number, number][] } {
  if ((a.length - from) % 2 !== 0 || a.length - from < 2) fail('#VALUE!');
  let size: [number, number] | null = null;
  const tests: { m: M; t: (v: V) => boolean }[] = [];
  for (let i = from; i < a.length; i += 2) {
    const m = ev(a[i]);
    const block = isM(m) ? m : [[m]];
    const sz: [number, number] = [block.length, block[0]?.length ?? 0];
    if (size && (size[0] !== sz[0] || size[1] !== sz[1])) fail('#VALUE!');
    size = sz;
    tests.push({ m: block, t: criteria(scalar(ev(a[i + 1]))) });
  }
  const hits: [number, number][] = [];
  for (let r = 0; r < size![0]; r++) for (let c = 0; c < size![1]; c++) if (tests.every((x) => x.t(x.m[r]?.[c] ?? null))) hits.push([r, c]);
  return { size: size!, hits };
}
const block = (x: V | M): M => (isM(x) ? x : [[x]]);
const at = (m: M, r: number, c: number): V => m[r]?.[c] ?? null;

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : fail('#DIV/0!'));
function variance(xs: number[], sample: boolean) {
  if (xs.length < (sample ? 2 : 1)) fail('#DIV/0!');
  const m = sum(xs) / xs.length;
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - (sample ? 1 : 0));
}
function percentile(xs: number[], p: number) {
  if (!xs.length || p < 0 || p > 1) fail('#NUM!');
  const s = [...xs].sort((a, b) => a - b), k = (s.length - 1) * p, lo = Math.floor(k);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (k - lo);
}
const finite = (x: number) => (Number.isFinite(x) ? x : fail('#NUM!'));
const nonzero = (x: number) => (x === 0 ? fail('#DIV/0!') : x);

// Dates
const ymd = (n: number) => { const d = dateOf(Math.floor(n)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }; };
const dateArg = (x: V | M) => {
  const v = scalar(x);
  if (typeof v === 'string') { const d = dateFrom(v) ?? timeFrom(v); return d != null ? d : fail('#VALUE!'); }
  const n = num(v);
  return n < 0 ? fail('#NUM!') : n;
};
const addMonths = (n: number, months: number) => { const { y, m, d } = ymd(n); const t = serial(y, m + months, 1); const last = ymd(serial(y, m + months + 1, 0)).d; return t + Math.min(d, last) - 1; };
const isWorkday = (n: number, holidays: Set<number>) => { const wd = ymd(n).wd; return wd !== 0 && wd !== 6 && !holidays.has(Math.floor(n)); };

/** Finds a value in a list as MATCH / XLOOKUP do: exact (with wildcards for text), or the largest
 *  not above it in a sorted list (approx 1), or the smallest not below it (-1). */
function find(list: V[], want: V, mode: number): number {
  if (mode === 0) {
    const t = typeof want === 'string' ? criteria(`=${want}`) : (v: V) => compare(v, want) === 0 && v !== null;
    return list.findIndex((v) => t(v));
  }
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === null || typeof v !== typeof want) continue;
    const c = compare(v, want);
    if (c === 0) return i;
    if (mode === 1 ? c < 0 : c > 0) best = i; else if (mode === 1) break;
  }
  return best;
}

const F: Record<string, Fn> = {
  // ── Maths and statistics
  SUM: (a, ev) => sum(numbers(a, ev)),
  AVERAGE: (a, ev) => mean(numbers(a, ev)),
  MIN: (a, ev) => { const x = numbers(a, ev); return x.length ? Math.min(...x) : 0; },
  MAX: (a, ev) => { const x = numbers(a, ev); return x.length ? Math.max(...x) : 0; },
  COUNT: (a, ev) => a.reduce((t, x) => { const v = ev(x); return t + flat(v).filter((y) => typeof y === 'number' || (!isRef(x) && !isM(v) && typeof y === 'string' && numberFrom(y) != null)).length; }, 0),
  COUNTA: (a, ev) => values(a, ev).filter((v) => v !== null && v !== '').length,
  COUNTBLANK: (a, ev) => values(a, ev).filter((v) => v === null || v === '').length,
  PRODUCT: (a, ev) => numbers(a, ev).reduce((t, x) => t * x, 1),
  SUMSQ: (a, ev) => sum(numbers(a, ev).map((x) => x * x)),
  SUMPRODUCT: (a, ev) => {
    const ms = a.map((x) => block(ev(x)));
    if (!ms.length) fail('#VALUE!');
    const [h, w] = [ms[0].length, ms[0][0]?.length ?? 0];
    if (ms.some((m) => m.length !== h || (m[0]?.length ?? 0) !== w)) fail('#VALUE!');
    let t = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) t += ms.reduce((p, m) => { const v = at(m, r, c); if (isErr(v)) throw new Fail(v); return p * (typeof v === 'number' ? v : 0); }, 1);
    return t;
  },
  MEDIAN: (a, ev) => { const x = numbers(a, ev); return x.length ? percentile(x, 0.5) : fail('#NUM!'); },
  MODE: (a, ev) => {
    const x = numbers(a, ev), n = new Map<number, number>();
    let best: number | null = null, top = 1;
    for (const v of x) { const k = (n.get(v) ?? 0) + 1; n.set(v, k); if (k > top) { top = k; best = v; } }
    return best ?? fail('#N/A');
  },
  STDEV: (a, ev) => Math.sqrt(variance(numbers(a, ev), true)),
  STDEVP: (a, ev) => Math.sqrt(variance(numbers(a, ev), false)),
  VAR: (a, ev) => variance(numbers(a, ev), true),
  VARP: (a, ev) => variance(numbers(a, ev), false),
  LARGE: (a, ev) => { argc(a, 2); const x = numbers([a[0]], ev).sort((p, q) => q - p), k = int(ev(a[1])); return k >= 1 && k <= x.length ? x[k - 1] : fail('#NUM!'); },
  SMALL: (a, ev) => { argc(a, 2); const x = numbers([a[0]], ev).sort((p, q) => p - q), k = int(ev(a[1])); return k >= 1 && k <= x.length ? x[k - 1] : fail('#NUM!'); },
  RANK: (a, ev) => {
    argc(a, 2, 3);
    const v = num(ev(a[0])), x = numbers([a[1]], ev), asc = given(a[2]) && num(ev(a[2])) !== 0;
    if (!x.includes(v)) fail('#N/A');
    return 1 + x.filter((y) => (asc ? y < v : y > v)).length;
  },
  PERCENTILE: (a, ev) => { argc(a, 2); return percentile(numbers([a[0]], ev), num(ev(a[1]))); },
  QUARTILE: (a, ev) => { argc(a, 2); const q = int(ev(a[1])); return q < 0 || q > 4 ? fail('#NUM!') : percentile(numbers([a[0]], ev), q / 4); },
  SUMIF: (a, ev) => {
    argc(a, 2, 3);
    const { hits } = matching(a.slice(0, 2), ev, 0);
    const vals = block(ev(a[2] ?? a[0]));
    return sum(hits.map(([r, c]) => at(vals, r, c)).map((v) => { if (isErr(v)) throw new Fail(v); return typeof v === 'number' ? v : 0; }));
  },
  SUMIFS: (a, ev) => { const vals = block(ev(a[0])); return sum(matching(a, ev, 1).hits.map(([r, c]) => at(vals, r, c)).filter((v): v is number => typeof v === 'number')); },
  COUNTIF: (a, ev) => { argc(a, 2); return matching(a, ev, 0).hits.length; },
  COUNTIFS: (a, ev) => matching(a, ev, 0).hits.length,
  AVERAGEIF: (a, ev) => { argc(a, 2, 3); const { hits } = matching(a.slice(0, 2), ev, 0); const vals = block(ev(a[2] ?? a[0])); return mean(hits.map(([r, c]) => at(vals, r, c)).filter((v): v is number => typeof v === 'number')); },
  AVERAGEIFS: (a, ev) => { const vals = block(ev(a[0])); return mean(matching(a, ev, 1).hits.map(([r, c]) => at(vals, r, c)).filter((v): v is number => typeof v === 'number')); },
  MAXIFS: (a, ev) => { const vals = block(ev(a[0])); const x = matching(a, ev, 1).hits.map(([r, c]) => at(vals, r, c)).filter((v): v is number => typeof v === 'number'); return x.length ? Math.max(...x) : 0; },
  MINIFS: (a, ev) => { const vals = block(ev(a[0])); const x = matching(a, ev, 1).hits.map(([r, c]) => at(vals, r, c)).filter((v): v is number => typeof v === 'number'); return x.length ? Math.min(...x) : 0; },
  ROUND: (a, ev) => { argc(a, 1, 2); return roundTo(num(ev(a[0])), given(a[1]) ? int(ev(a[1])) : 0); },
  ROUNDUP: (a, ev) => { argc(a, 1, 2); const x = num(ev(a[0])), p = 10 ** (given(a[1]) ? int(ev(a[1])) : 0); return Math.sign(x) * Math.ceil(Number((Math.abs(x) * p).toPrecision(15))) / p; },
  ROUNDDOWN: (a, ev) => { argc(a, 1, 2); const x = num(ev(a[0])), p = 10 ** (given(a[1]) ? int(ev(a[1])) : 0); return Math.sign(x) * Math.floor(Number((Math.abs(x) * p).toPrecision(15))) / p; },
  MROUND: (a, ev) => { argc(a, 2); const x = num(ev(a[0])), m = num(ev(a[1])); if (m === 0) return 0; if (Math.sign(x) * Math.sign(m) < 0) fail('#NUM!'); return roundTo(Math.round(x / m) * m, 10); },
  INT: (a, ev) => { argc(a, 1); return Math.floor(num(ev(a[0]))); },
  TRUNC: (a, ev) => { argc(a, 1, 2); const p = 10 ** (given(a[1]) ? int(ev(a[1])) : 0); return Math.trunc(num(ev(a[0])) * p) / p; },
  ABS: (a, ev) => { argc(a, 1); return Math.abs(num(ev(a[0]))); },
  SIGN: (a, ev) => { argc(a, 1); return Math.sign(num(ev(a[0]))); },
  SQRT: (a, ev) => { argc(a, 1); const x = num(ev(a[0])); return x < 0 ? fail('#NUM!') : Math.sqrt(x); },
  POWER: (a, ev) => { argc(a, 2); return finite(num(ev(a[0])) ** num(ev(a[1]))); },
  MOD: (a, ev) => { argc(a, 2); const x = num(ev(a[0])), d = nonzero(num(ev(a[1]))); return x - d * Math.floor(x / d); },
  QUOTIENT: (a, ev) => { argc(a, 2); return Math.trunc(num(ev(a[0])) / nonzero(num(ev(a[1])))); },
  EXP: (a, ev) => { argc(a, 1); return finite(Math.exp(num(ev(a[0])))); },
  LN: (a, ev) => { argc(a, 1); const x = num(ev(a[0])); return x <= 0 ? fail('#NUM!') : Math.log(x); },
  LOG: (a, ev) => { argc(a, 1, 2); const x = num(ev(a[0])), b = given(a[1]) ? num(ev(a[1])) : 10; return x <= 0 || b <= 0 || b === 1 ? fail('#NUM!') : Math.log(x) / Math.log(b); },
  LOG10: (a, ev) => { argc(a, 1); const x = num(ev(a[0])); return x <= 0 ? fail('#NUM!') : Math.log10(x); },
  PI: (a) => { argc(a, 0); return Math.PI; },
  CEILING: (a, ev) => { argc(a, 1, 2); const x = num(ev(a[0])), s = given(a[1]) ? Math.abs(num(ev(a[1]))) : 1; return s === 0 ? 0 : Math.ceil(Number((x / s).toPrecision(15))) * s; },
  FLOOR: (a, ev) => { argc(a, 1, 2); const x = num(ev(a[0])), s = given(a[1]) ? Math.abs(num(ev(a[1]))) : 1; return s === 0 ? 0 : Math.floor(Number((x / s).toPrecision(15))) * s; },
  EVEN: (a, ev) => { argc(a, 1); const x = num(ev(a[0])), r = Math.ceil(Math.abs(x) / 2) * 2; return Math.sign(x) * r; },
  ODD: (a, ev) => { argc(a, 1); const x = num(ev(a[0])); let r = Math.ceil(Math.abs(x)); if (r % 2 === 0) r++; return (x < 0 ? -1 : 1) * r; },
  FACT: (a, ev) => { argc(a, 1); const n = int(ev(a[0])); if (n < 0 || n > 170) fail('#NUM!'); let t = 1; for (let i = 2; i <= n; i++) t *= i; return t; },
  GCD: (a, ev) => { const x = numbers(a, ev).map(Math.trunc); if (x.some((v) => v < 0)) fail('#NUM!'); const g = (p: number, q: number): number => (q ? g(q, p % q) : p); return x.reduce(g, 0); },
  LCM: (a, ev) => { const x = numbers(a, ev).map(Math.trunc); if (x.some((v) => v < 0)) fail('#NUM!'); const g = (p: number, q: number): number => (q ? g(q, p % q) : p); return x.reduce((t, v) => (t === 0 || v === 0 ? 0 : (t * v) / g(t, v)), 1); },
  COMBIN: (a, ev) => { argc(a, 2); const n = int(ev(a[0])), k = int(ev(a[1])); if (n < 0 || k < 0 || k > n) fail('#NUM!'); let t = 1; for (let i = 1; i <= k; i++) t = (t * (n - k + i)) / i; return Math.round(t); },
  PERMUT: (a, ev) => { argc(a, 2); const n = int(ev(a[0])), k = int(ev(a[1])); if (n < 0 || k < 0 || k > n) fail('#NUM!'); let t = 1; for (let i = 0; i < k; i++) t *= n - i; return t; },
  RAND: (a, _ev, ctx) => { argc(a, 0); return ctx.rand(); },
  RANDBETWEEN: (a, ev, ctx) => { argc(a, 2); const lo = Math.ceil(num(ev(a[0]))), hi = Math.floor(num(ev(a[1]))); return hi < lo ? fail('#NUM!') : lo + Math.floor(ctx.rand() * (hi - lo + 1)); },
  SIN: (a, ev) => Math.sin(num(ev(a[0]))), COS: (a, ev) => Math.cos(num(ev(a[0]))), TAN: (a, ev) => finite(Math.tan(num(ev(a[0])))),
  ASIN: (a, ev) => { const x = num(ev(a[0])); return Math.abs(x) > 1 ? fail('#NUM!') : Math.asin(x); },
  ACOS: (a, ev) => { const x = num(ev(a[0])); return Math.abs(x) > 1 ? fail('#NUM!') : Math.acos(x); },
  ATAN: (a, ev) => Math.atan(num(ev(a[0]))),
  ATAN2: (a, ev) => { argc(a, 2); const x = num(ev(a[0])), y = num(ev(a[1])); return x === 0 && y === 0 ? fail('#DIV/0!') : Math.atan2(y, x); },
  DEGREES: (a, ev) => (num(ev(a[0])) * 180) / Math.PI,
  RADIANS: (a, ev) => (num(ev(a[0])) * Math.PI) / 180,

  // ── Logic
  IF: (a, ev) => { argc(a, 1, 3); return bool(ev(a[0])) ? (given(a[1]) ? ev(a[1]) : a.length > 1 ? 0 : true) : given(a[2]) ? ev(a[2]) : a.length > 2 ? 0 : false; },
  IFS: (a, ev) => { if (a.length < 2 || a.length % 2) fail('#VALUE!'); for (let i = 0; i < a.length; i += 2) if (bool(ev(a[i]))) return ev(a[i + 1]); return fail('#N/A'); },
  AND: (a, ev) => { const x = values(a, ev).filter((v) => v !== null && typeof v !== 'string'); if (!x.length) fail('#VALUE!'); return x.every((v) => ok(toBool(v))); },
  OR: (a, ev) => { const x = values(a, ev).filter((v) => v !== null && typeof v !== 'string'); if (!x.length) fail('#VALUE!'); return x.some((v) => ok(toBool(v))); },
  XOR: (a, ev) => values(a, ev).filter((v) => v !== null && typeof v !== 'string').filter((v) => ok(toBool(v))).length % 2 === 1,
  NOT: (a, ev) => { argc(a, 1); return !bool(ev(a[0])); },
  TRUE: () => true, FALSE: () => false,
  NA: () => fail('#N/A'),
  IFERROR: (a, ev) => { argc(a, 2); const v = scalarOrM(ev, a[0]); return isErr(v) ? ev(a[1]) : v; },
  IFNA: (a, ev) => { argc(a, 2); const v = scalarOrM(ev, a[0]); return isErr(v) && v.e === '#N/A' ? ev(a[1]) : v; },
  SWITCH: (a, ev) => {
    if (a.length < 3) fail('#VALUE!');
    const v = scalar(ev(a[0]));
    if (isErr(v)) throw new Fail(v);
    for (let i = 1; i + 1 < a.length; i += 2) if (compare(v, scalar(ev(a[i]))) === 0) return ev(a[i + 1]);
    return a.length % 2 === 0 ? ev(a[a.length - 1]) : fail('#N/A');
  },
  CHOOSE: (a, ev) => { const k = int(ev(a[0])); return k >= 1 && k < a.length ? ev(a[k]) : fail('#VALUE!'); },
  ISBLANK: (a, ev) => scalar(ev(a[0])) === null,
  ISNUMBER: (a, ev) => typeof scalar(ev(a[0])) === 'number',
  ISTEXT: (a, ev) => typeof scalar(ev(a[0])) === 'string',
  ISNONTEXT: (a, ev) => typeof scalar(ev(a[0])) !== 'string',
  ISLOGICAL: (a, ev) => typeof scalar(ev(a[0])) === 'boolean',
  ISERROR: (a, ev) => isErr(scalarOrM(ev, a[0])),
  ISERR: (a, ev) => { const v = scalarOrM(ev, a[0]); return isErr(v) && v.e !== '#N/A'; },
  ISNA: (a, ev) => { const v = scalarOrM(ev, a[0]); return isErr(v) && v.e === '#N/A'; },
  ISEVEN: (a, ev) => Math.trunc(num(ev(a[0]))) % 2 === 0,
  ISODD: (a, ev) => Math.abs(Math.trunc(num(ev(a[0])))) % 2 === 1,
  N: (a, ev) => { const v = scalar(ev(a[0])); return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : isErr(v) ? v : 0; },
  T: (a, ev) => { const v = scalar(ev(a[0])); return typeof v === 'string' ? v : isErr(v) ? v : ''; },

  // ── Text
  LEN: (a, ev) => { argc(a, 1); return [...text(ev(a[0]))].length; },
  LEFT: (a, ev) => { argc(a, 1, 2); const n = given(a[1]) ? int(ev(a[1])) : 1; return n < 0 ? fail('#VALUE!') : [...text(ev(a[0]))].slice(0, n).join(''); },
  RIGHT: (a, ev) => { argc(a, 1, 2); const n = given(a[1]) ? int(ev(a[1])) : 1; const s = [...text(ev(a[0]))]; return n < 0 ? fail('#VALUE!') : n === 0 ? '' : s.slice(-n).join(''); },
  MID: (a, ev) => { argc(a, 3); const s = [...text(ev(a[0]))], st = int(ev(a[1])), n = int(ev(a[2])); return st < 1 || n < 0 ? fail('#VALUE!') : s.slice(st - 1, st - 1 + n).join(''); },
  UPPER: (a, ev) => text(ev(a[0])).toUpperCase(),
  LOWER: (a, ev) => text(ev(a[0])).toLowerCase(),
  PROPER: (a, ev) => text(ev(a[0])).toLowerCase().replace(/(^|[^\p{L}'])(\p{L})/gu, (_, p: string, ch: string) => p + ch.toUpperCase()),
  TRIM: (a, ev) => text(ev(a[0])).replace(/ +/g, ' ').trim(),
  CLEAN: (a, ev) => text(ev(a[0])).replace(/[\x00-\x1f]/g, ''),
  CONCAT: (a, ev) => values(a, ev).map((v) => ok(toText(v))).join(''),
  CONCATENATE: (a, ev) => a.map((x) => text(ev(x))).join(''),
  TEXTJOIN: (a, ev) => {
    if (a.length < 3) fail('#VALUE!');
    const sep = text(ev(a[0])), skip = bool(ev(a[1]));
    return values(a.slice(2), ev).map((v) => ok(toText(v))).filter((s) => !skip || s !== '').join(sep);
  },
  SUBSTITUTE: (a, ev) => {
    argc(a, 3, 4);
    const s = text(ev(a[0])), from = text(ev(a[1])), to = text(ev(a[2]));
    if (!from) return s;
    if (!given(a[3])) return s.split(from).join(to);
    const n = int(ev(a[3]));
    if (n < 1) fail('#VALUE!');
    let i = -1;
    for (let k = 0; k < n; k++) { i = s.indexOf(from, i + 1); if (i < 0) return s; }
    return s.slice(0, i) + to + s.slice(i + from.length);
  },
  REPLACE: (a, ev) => { argc(a, 4); const s = text(ev(a[0])), st = int(ev(a[1])), n = int(ev(a[2])); return st < 1 || n < 0 ? fail('#VALUE!') : s.slice(0, st - 1) + text(ev(a[3])) + s.slice(st - 1 + n); },
  FIND: (a, ev) => { argc(a, 2, 3); const w = text(ev(a[0])), s = text(ev(a[1])), st = given(a[2]) ? int(ev(a[2])) : 1; const i = s.indexOf(w, st - 1); return st < 1 || i < 0 ? fail('#VALUE!') : i + 1; },
  SEARCH: (a, ev) => {
    argc(a, 2, 3);
    const w = text(ev(a[0])), s = text(ev(a[1])), st = given(a[2]) ? int(ev(a[2])) : 1;
    const re = new RegExp(w.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]'), 'i');
    const m = re.exec(s.slice(st - 1));
    return st < 1 || !m ? fail('#VALUE!') : m.index + st;
  },
  REPT: (a, ev) => { argc(a, 2); const n = int(ev(a[1])), s = text(ev(a[0])); return n < 0 || s.length * n > 32767 ? fail('#VALUE!') : s.repeat(n); },
  TEXT: (a, ev) => { argc(a, 2); const v = scalar(ev(a[0])); const code = text(ev(a[1])); if (typeof v === 'string' && numberFrom(v) == null && dateFrom(v) == null) return v; return formatCode(num(v), code); },
  VALUE: (a, ev) => { argc(a, 1); const v = scalar(ev(a[0])); if (typeof v === 'number') return v; const s = text(v); return numberFrom(s) ?? dateFrom(s) ?? timeFrom(s) ?? fail('#VALUE!'); },
  EXACT: (a, ev) => { argc(a, 2); return text(ev(a[0])) === text(ev(a[1])); },
  CHAR: (a, ev) => { const n = int(ev(a[0])); return n < 1 || n > 255 ? fail('#VALUE!') : String.fromCharCode(n); },
  CODE: (a, ev) => { const s = text(ev(a[0])); return s ? s.charCodeAt(0) : fail('#VALUE!'); },
  UNICHAR: (a, ev) => { const n = int(ev(a[0])); return n < 1 || n > 0x10ffff ? fail('#VALUE!') : String.fromCodePoint(n); },
  UNICODE: (a, ev) => { const s = text(ev(a[0])); return s ? s.codePointAt(0)! : fail('#VALUE!'); },
  FIXED: (a, ev) => { argc(a, 1, 3); const dp = given(a[1]) ? int(ev(a[1])) : 2, plain = given(a[2]) && bool(ev(a[2])); return formatCode(num(ev(a[0])), `${plain ? '0' : '#,##0'}${dp > 0 ? `.${'0'.repeat(Math.min(dp, 30))}` : ''}`); },

  // ── Looking things up
  VLOOKUP: (a, ev) => lookup(a, ev, false),
  HLOOKUP: (a, ev) => lookup(a, ev, true),
  XLOOKUP: (a, ev) => {
    if (a.length < 3 || a.length > 6) fail('#VALUE!');
    const want = scalar(ev(a[0])), look = block(ev(a[1])), ret = block(ev(a[2]));
    const vertical = look.length > 1 || (look[0]?.length ?? 0) === 1;
    const list = vertical ? look.map((r) => r[0] ?? null) : look[0];
    const mode = given(a[4]) ? int(ev(a[4])) : 0;
    let i = mode === 0 ? find(list, want, 0) : mode === -1 ? findSorted(list, want, -1) : mode === 1 ? findSorted(list, want, 1) : find(list, want, 0);
    if (given(a[5]) && int(ev(a[5])) === -1 && mode === 0) { i = -1; for (let k = list.length - 1; k >= 0; k--) if (compare(list[k], want) === 0) { i = k; break; } }
    if (i < 0) return given(a[3]) ? ev(a[3]) : fail('#N/A');
    return vertical ? at(ret, i, 0) : at(ret, 0, i);
  },
  MATCH: (a, ev) => {
    argc(a, 2, 3);
    const want = scalar(ev(a[0])), m = block(ev(a[1]));
    const list = m.length > 1 ? m.map((r) => r[0] ?? null) : m[0] ?? [];
    const i = find(list, want, given(a[2]) ? Math.sign(int(ev(a[2]))) : 1);
    return i < 0 ? fail('#N/A') : i + 1;
  },
  XMATCH: (a, ev) => {
    argc(a, 2, 4);
    const want = scalar(ev(a[0])), m = block(ev(a[1]));
    const list = m.length > 1 ? m.map((r) => r[0] ?? null) : m[0] ?? [];
    const mode = given(a[2]) ? int(ev(a[2])) : 0;
    const i = mode === 0 ? find(list, want, 0) : findSorted(list, want, mode < 0 ? -1 : 1);
    return i < 0 ? fail('#N/A') : i + 1;
  },
  INDEX: (a, ev) => {
    argc(a, 2, 3);
    const m = block(ev(a[0]));
    let r = int(ev(a[1])), c = given(a[2]) ? int(ev(a[2])) : 0;
    if (m.length === 1 && !given(a[2])) { c = r; r = 1; }
    if (r < 0 || c < 0 || r > m.length || c > (m[0]?.length ?? 0)) fail('#REF!');
    if (r === 0 || c === 0) {
      if (r === 0 && c === 0) return m;
      return r === 0 ? m.map((row) => [row[c - 1] ?? null]) : [m[r - 1]];
    }
    return at(m, r - 1, Math.max(c, 1) - 1);
  },
  ROW: (a, _ev, ctx) => (a.length && (a[0].k === 'ref' || a[0].k === 'area') ? (a[0].k === 'ref' ? a[0].r : a[0].r1) + 1 : ctx.here.r + 1),
  COLUMN: (a, _ev, ctx) => (a.length && (a[0].k === 'ref' || a[0].k === 'area') ? (a[0].k === 'ref' ? a[0].c : a[0].c1) + 1 : ctx.here.c + 1),
  ROWS: (a, ev) => { argc(a, 1); const x = a[0]; return x.k === 'area' && x.r2 === MAX_ROWS - 1 && x.r1 === 0 ? MAX_ROWS : block(ev(x)).length; },
  COLUMNS: (a, ev) => { argc(a, 1); return block(ev(a[0]))[0]?.length ?? 0; },
  ADDRESS: (a, ev) => {
    argc(a, 2, 4);
    const r = int(ev(a[0])) - 1, c = int(ev(a[1])) - 1, kind = given(a[2]) ? int(ev(a[2])) : 1;
    if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) fail('#VALUE!');
    return addr(r, c, kind === 1 || kind === 2, kind === 1 || kind === 3);
  },

  // ── Dates and times (days since 1900, as in Excel)
  TODAY: (_a, _ev, ctx) => { const d = new Date(ctx.now); return serial(d.getFullYear(), d.getMonth() + 1, d.getDate()); },
  NOW: (_a, _ev, ctx) => { const d = new Date(ctx.now); return serialOf(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())); },
  DATE: (a, ev) => { argc(a, 3); let y = int(ev(a[0])); if (y < 1900) y += 1900; const n = serial(y, int(ev(a[1])), int(ev(a[2]))); return n < 0 ? fail('#NUM!') : n; },
  TIME: (a, ev) => { argc(a, 3); const t = (int(ev(a[0])) * 3600 + int(ev(a[1])) * 60 + int(ev(a[2]))) / 86400; return t < 0 ? fail('#NUM!') : t - Math.floor(t); },
  YEAR: (a, ev) => ymd(dateArg(ev(a[0]))).y,
  MONTH: (a, ev) => ymd(dateArg(ev(a[0]))).m,
  DAY: (a, ev) => ymd(dateArg(ev(a[0]))).d,
  HOUR: (a, ev) => Math.floor(((dateArg(ev(a[0])) % 1) * 86400 + 0.5) / 3600) % 24,
  MINUTE: (a, ev) => Math.floor(((dateArg(ev(a[0])) % 1) * 86400 + 0.5) / 60) % 60,
  SECOND: (a, ev) => Math.floor((dateArg(ev(a[0])) % 1) * 86400 + 0.5) % 60,
  WEEKDAY: (a, ev) => { argc(a, 1, 2); const wd = ymd(dateArg(ev(a[0]))).wd, t = given(a[1]) ? int(ev(a[1])) : 1; return t === 2 ? ((wd + 6) % 7) + 1 : t === 3 ? (wd + 6) % 7 : wd + 1; },
  WEEKNUM: (a, ev) => { argc(a, 1, 2); const n = Math.floor(dateArg(ev(a[0]))), { y } = ymd(n), start = serial(y, 1, 1), t = given(a[1]) ? int(ev(a[1])) : 1; const off = t === 2 ? (ymd(start).wd + 6) % 7 : ymd(start).wd; return Math.floor((n - start + off) / 7) + 1; },
  DAYS: (a, ev) => { argc(a, 2); return Math.floor(dateArg(ev(a[0]))) - Math.floor(dateArg(ev(a[1]))); },
  DATEDIF: (a, ev) => {
    argc(a, 3);
    const s = Math.floor(dateArg(ev(a[0]))), e = Math.floor(dateArg(ev(a[1]))), u = text(ev(a[2])).toUpperCase();
    if (e < s) fail('#NUM!');
    const x = ymd(s), y = ymd(e);
    let months = (y.y - x.y) * 12 + (y.m - x.m);
    if (y.d < x.d) months--;
    if (u === 'D') return e - s;
    if (u === 'M') return months;
    if (u === 'Y') return Math.floor(months / 12);
    if (u === 'YM') return months % 12;
    if (u === 'MD') return y.d >= x.d ? y.d - x.d : e - addMonths(s, months);
    if (u === 'YD') { let t = serial(y.y, x.m, x.d); if (t > e) t = serial(y.y - 1, x.m, x.d); return e - t; }
    return fail('#NUM!');
  },
  EDATE: (a, ev) => { argc(a, 2); return addMonths(Math.floor(dateArg(ev(a[0]))), int(ev(a[1]))); },
  EOMONTH: (a, ev) => { argc(a, 2); const { y, m } = ymd(dateArg(ev(a[0]))); return serial(y, m + int(ev(a[1])) + 1, 0); },
  NETWORKDAYS: (a, ev) => {
    argc(a, 2, 3);
    let s = Math.floor(dateArg(ev(a[0]))), e = Math.floor(dateArg(ev(a[1])));
    const sign = e < s ? -1 : 1;
    if (sign < 0) [s, e] = [e, s];
    if (e - s > 100_000) fail('#NUM!');
    const hol = new Set(given(a[2]) ? numbers([a[2]], ev).map(Math.floor) : []);
    let n = 0;
    for (let d = s; d <= e; d++) if (isWorkday(d, hol)) n++;
    return sign * n;
  },
  WORKDAY: (a, ev) => {
    argc(a, 2, 3);
    let d = Math.floor(dateArg(ev(a[0])));
    let k = int(ev(a[1]));
    if (Math.abs(k) > 100_000) fail('#NUM!');
    const hol = new Set(given(a[2]) ? numbers([a[2]], ev).map(Math.floor) : []);
    const step = k < 0 ? -1 : 1;
    while (k !== 0) { d += step; if (isWorkday(d, hol)) k -= step; }
    return d;
  },
  DATEVALUE: (a, ev) => { const d = dateFrom(text(ev(a[0]))); return d == null ? fail('#VALUE!') : Math.floor(d); },
  TIMEVALUE: (a, ev) => { const t = timeFrom(text(ev(a[0]))); return t == null ? fail('#VALUE!') : t; },

  // ── Money
  PMT: (a, ev) => { argc(a, 3, 5); const [r, n, pv] = [num(ev(a[0])), num(ev(a[1])), num(ev(a[2]))], fv = given(a[3]) ? num(ev(a[3])) : 0, type = given(a[4]) ? num(ev(a[4])) : 0; if (n === 0) fail('#NUM!'); if (r === 0) return -(pv + fv) / n; const f = (1 + r) ** n; return -(r * (pv * f + fv)) / ((1 + r * type) * (f - 1)); },
  FV: (a, ev) => { argc(a, 3, 5); const [r, n, pmt] = [num(ev(a[0])), num(ev(a[1])), num(ev(a[2]))], pv = given(a[3]) ? num(ev(a[3])) : 0, type = given(a[4]) ? num(ev(a[4])) : 0; if (r === 0) return -(pv + pmt * n); const f = (1 + r) ** n; return -(pv * f + (pmt * (1 + r * type) * (f - 1)) / r); },
  PV: (a, ev) => { argc(a, 3, 5); const [r, n, pmt] = [num(ev(a[0])), num(ev(a[1])), num(ev(a[2]))], fv = given(a[3]) ? num(ev(a[3])) : 0, type = given(a[4]) ? num(ev(a[4])) : 0; if (r === 0) return -(fv + pmt * n); const f = (1 + r) ** n; return -(fv + (pmt * (1 + r * type) * (f - 1)) / r) / f; },
  NPER: (a, ev) => { argc(a, 3, 5); const [r, pmt, pv] = [num(ev(a[0])), num(ev(a[1])), num(ev(a[2]))], fv = given(a[3]) ? num(ev(a[3])) : 0, type = given(a[4]) ? num(ev(a[4])) : 0; if (r === 0) return pmt === 0 ? fail('#NUM!') : -(pv + fv) / pmt; const z = pmt * (1 + r * type) / r; return finite(Math.log((z - fv) / (z + pv)) / Math.log(1 + r)); },
  NPV: (a, ev) => { const r = num(ev(a[0])); return numbers(a.slice(1), ev).reduce((t, x, i) => t + x / (1 + r) ** (i + 1), 0); },
  IRR: (a, ev) => {
    argc(a, 1, 2);
    const cf = numbers([a[0]], ev);
    if (!cf.some((x) => x > 0) || !cf.some((x) => x < 0)) fail('#NUM!');
    let r = given(a[1]) ? num(ev(a[1])) : 0.1;
    for (let i = 0; i < 100; i++) {
      let f = 0, d = 0;
      cf.forEach((x, k) => { f += x / (1 + r) ** k; d -= (k * x) / (1 + r) ** (k + 1); });
      if (Math.abs(f) < 1e-10) return r;
      if (d === 0) break;
      r -= f / d;
      if (!Number.isFinite(r) || r <= -1) break;
    }
    return fail('#NUM!');
  },
};

/** An argument's value, keeping errors as values (for IFERROR and the IS… tests). */
function scalarOrM(ev: Ev, a: Ast): V | M {
  try { const v = ev(a); return isM(v) ? (v[0]?.[0] ?? null) : v; } catch (e) { if (e instanceof Fail) return e.v; throw e; }
}

function findSorted(list: V[], want: V, mode: 1 | -1): number {
  // XLOOKUP / XMATCH: the exact match, else the next smaller (-1) or larger (1), in any order.
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === null || typeof v !== typeof want) continue;
    const c = compare(v, want);
    if (c === 0) return i;
    if (mode === -1 ? c < 0 && (best < 0 || compare(v, list[best]) > 0) : c > 0 && (best < 0 || compare(v, list[best]) < 0)) best = i;
  }
  return best;
}

function lookup(a: Ast[], ev: Ev, horizontal: boolean): V {
  argc(a, 3, 4);
  const want = scalar(ev(a[0]));
  if (isErr(want)) throw new Fail(want);
  const m = block(ev(a[1]));
  const k = int(ev(a[2]));
  const approx = given(a[3]) ? bool(ev(a[3])) : true;
  const list = horizontal ? (m[0] ?? []) : m.map((r) => r[0] ?? null);
  const width = horizontal ? m.length : (m[0]?.length ?? 0);
  if (k < 1) fail('#VALUE!');
  if (k > width) fail('#REF!');
  const i = find(list, want, approx ? 1 : 0);
  if (i < 0) fail('#N/A');
  return horizontal ? at(m, k - 1, i) : at(m, i, k - 1);
}

// Excel's other names for the same functions.
const ALIASES: Record<string, string> = {
  'STDEV.S': 'STDEV', 'STDEV.P': 'STDEVP', 'VAR.S': 'VAR', 'VAR.P': 'VARP', 'MODE.SNGL': 'MODE', 'RANK.EQ': 'RANK',
  'PERCENTILE.INC': 'PERCENTILE', 'QUARTILE.INC': 'QUARTILE', 'CEILING.MATH': 'CEILING', 'FLOOR.MATH': 'FLOOR', AVG: 'AVERAGE',
};
export const FUNCTIONS: Record<string, Fn> = { ...F, ...Object.fromEntries(Object.entries(ALIASES).map(([k, v]) => [k, F[v]])) };

/** For the formula helper: each function's arguments and what it does, by group. */
export const FUNCTION_HELP: { name: string; args: string; does: string; group: 'Maths' | 'Statistics' | 'Logic' | 'Text' | 'Lookup' | 'Date' | 'Money' }[] = [
  { name: 'SUM', args: 'numbers…', does: 'Adds numbers.', group: 'Maths' },
  { name: 'AVERAGE', args: 'numbers…', does: 'The average.', group: 'Statistics' },
  { name: 'MIN', args: 'numbers…', does: 'The smallest number.', group: 'Statistics' },
  { name: 'MAX', args: 'numbers…', does: 'The largest number.', group: 'Statistics' },
  { name: 'COUNT', args: 'values…', does: 'How many numbers.', group: 'Statistics' },
  { name: 'COUNTA', args: 'values…', does: 'How many cells aren’t empty.', group: 'Statistics' },
  { name: 'COUNTBLANK', args: 'range', does: 'How many cells are empty.', group: 'Statistics' },
  { name: 'COUNTIF', args: 'range, criteria', does: 'How many cells meet a test, like ">50".', group: 'Statistics' },
  { name: 'COUNTIFS', args: 'range1, criteria1, …', does: 'How many rows meet every test.', group: 'Statistics' },
  { name: 'SUMIF', args: 'range, criteria, [sum_range]', does: 'Adds the cells that meet a test.', group: 'Maths' },
  { name: 'SUMIFS', args: 'sum_range, range1, criteria1, …', does: 'Adds the rows that meet every test.', group: 'Maths' },
  { name: 'AVERAGEIF', args: 'range, criteria, [average_range]', does: 'The average of the cells that meet a test.', group: 'Statistics' },
  { name: 'AVERAGEIFS', args: 'average_range, range1, criteria1, …', does: 'The average of the rows that meet every test.', group: 'Statistics' },
  { name: 'MAXIFS', args: 'max_range, range1, criteria1, …', does: 'The largest among rows that meet every test.', group: 'Statistics' },
  { name: 'MINIFS', args: 'min_range, range1, criteria1, …', does: 'The smallest among rows that meet every test.', group: 'Statistics' },
  { name: 'MEDIAN', args: 'numbers…', does: 'The middle number.', group: 'Statistics' },
  { name: 'MODE', args: 'numbers…', does: 'The most common number.', group: 'Statistics' },
  { name: 'STDEV', args: 'numbers…', does: 'Standard deviation of a sample.', group: 'Statistics' },
  { name: 'STDEVP', args: 'numbers…', does: 'Standard deviation of a whole population.', group: 'Statistics' },
  { name: 'VAR', args: 'numbers…', does: 'Variance of a sample.', group: 'Statistics' },
  { name: 'LARGE', args: 'range, k', does: 'The k-th largest number.', group: 'Statistics' },
  { name: 'SMALL', args: 'range, k', does: 'The k-th smallest number.', group: 'Statistics' },
  { name: 'RANK', args: 'number, range, [ascending]', does: 'A number’s place in a list.', group: 'Statistics' },
  { name: 'PERCENTILE', args: 'range, k', does: 'The value below which k (0 to 1) of the numbers fall.', group: 'Statistics' },
  { name: 'QUARTILE', args: 'range, quart', does: 'A quartile (0 to 4).', group: 'Statistics' },
  { name: 'PRODUCT', args: 'numbers…', does: 'Multiplies numbers.', group: 'Maths' },
  { name: 'SUMPRODUCT', args: 'range1, range2, …', does: 'Multiplies ranges cell by cell and adds the results.', group: 'Maths' },
  { name: 'ROUND', args: 'number, [digits]', does: 'Rounds to a number of decimal places.', group: 'Maths' },
  { name: 'ROUNDUP', args: 'number, [digits]', does: 'Rounds away from zero.', group: 'Maths' },
  { name: 'ROUNDDOWN', args: 'number, [digits]', does: 'Rounds towards zero.', group: 'Maths' },
  { name: 'MROUND', args: 'number, multiple', does: 'Rounds to the nearest multiple.', group: 'Maths' },
  { name: 'INT', args: 'number', does: 'Rounds down to a whole number.', group: 'Maths' },
  { name: 'TRUNC', args: 'number, [digits]', does: 'Cuts off the decimals.', group: 'Maths' },
  { name: 'ABS', args: 'number', does: 'The number without its sign.', group: 'Maths' },
  { name: 'SQRT', args: 'number', does: 'The square root.', group: 'Maths' },
  { name: 'POWER', args: 'number, power', does: 'A number to a power (also ^).', group: 'Maths' },
  { name: 'MOD', args: 'number, divisor', does: 'The remainder after dividing.', group: 'Maths' },
  { name: 'QUOTIENT', args: 'number, divisor', does: 'The whole part of a division.', group: 'Maths' },
  { name: 'CEILING', args: 'number, [significance]', does: 'Rounds up to a multiple.', group: 'Maths' },
  { name: 'FLOOR', args: 'number, [significance]', does: 'Rounds down to a multiple.', group: 'Maths' },
  { name: 'EXP', args: 'number', does: 'e to a power.', group: 'Maths' },
  { name: 'LN', args: 'number', does: 'The natural logarithm.', group: 'Maths' },
  { name: 'LOG', args: 'number, [base]', does: 'A logarithm (base 10 unless given).', group: 'Maths' },
  { name: 'PI', args: '', does: 'π, 3.14159…', group: 'Maths' },
  { name: 'FACT', args: 'number', does: 'The factorial (5! = 120).', group: 'Maths' },
  { name: 'GCD', args: 'numbers…', does: 'The greatest common divisor.', group: 'Maths' },
  { name: 'LCM', args: 'numbers…', does: 'The least common multiple.', group: 'Maths' },
  { name: 'COMBIN', args: 'n, k', does: 'Ways to choose k from n.', group: 'Maths' },
  { name: 'RAND', args: '', does: 'A random number from 0 to 1 (changes with every edit).', group: 'Maths' },
  { name: 'RANDBETWEEN', args: 'bottom, top', does: 'A random whole number in a range.', group: 'Maths' },
  { name: 'SIN', args: 'angle', does: 'Sine (angle in radians).', group: 'Maths' },
  { name: 'COS', args: 'angle', does: 'Cosine (angle in radians).', group: 'Maths' },
  { name: 'TAN', args: 'angle', does: 'Tangent (angle in radians).', group: 'Maths' },
  { name: 'RADIANS', args: 'degrees', does: 'Degrees to radians.', group: 'Maths' },
  { name: 'DEGREES', args: 'radians', does: 'Radians to degrees.', group: 'Maths' },
  { name: 'IF', args: 'test, if_true, [if_false]', does: 'One value if a test is true, another if not.', group: 'Logic' },
  { name: 'IFS', args: 'test1, value1, test2, value2, …', does: 'The value of the first test that’s true.', group: 'Logic' },
  { name: 'AND', args: 'tests…', does: 'TRUE if every test is true.', group: 'Logic' },
  { name: 'OR', args: 'tests…', does: 'TRUE if any test is true.', group: 'Logic' },
  { name: 'NOT', args: 'test', does: 'The opposite of a test.', group: 'Logic' },
  { name: 'XOR', args: 'tests…', does: 'TRUE if an odd number of tests are true.', group: 'Logic' },
  { name: 'IFERROR', args: 'value, if_error', does: 'A value, or something else if it’s an error.', group: 'Logic' },
  { name: 'IFNA', args: 'value, if_na', does: 'A value, or something else if it’s #N/A.', group: 'Logic' },
  { name: 'SWITCH', args: 'value, case1, result1, …, [default]', does: 'The result for the first case that matches.', group: 'Logic' },
  { name: 'CHOOSE', args: 'index, value1, value2, …', does: 'Picks a value by its number.', group: 'Logic' },
  { name: 'ISBLANK', args: 'value', does: 'TRUE if the cell is empty.', group: 'Logic' },
  { name: 'ISNUMBER', args: 'value', does: 'TRUE if it’s a number.', group: 'Logic' },
  { name: 'ISTEXT', args: 'value', does: 'TRUE if it’s text.', group: 'Logic' },
  { name: 'ISERROR', args: 'value', does: 'TRUE if it’s an error.', group: 'Logic' },
  { name: 'ISEVEN', args: 'number', does: 'TRUE if the number is even.', group: 'Logic' },
  { name: 'ISODD', args: 'number', does: 'TRUE if the number is odd.', group: 'Logic' },
  { name: 'LEN', args: 'text', does: 'How many characters.', group: 'Text' },
  { name: 'LEFT', args: 'text, [count]', does: 'The first characters.', group: 'Text' },
  { name: 'RIGHT', args: 'text, [count]', does: 'The last characters.', group: 'Text' },
  { name: 'MID', args: 'text, start, count', does: 'Characters from the middle.', group: 'Text' },
  { name: 'UPPER', args: 'text', does: 'IN CAPITALS.', group: 'Text' },
  { name: 'LOWER', args: 'text', does: 'in small letters.', group: 'Text' },
  { name: 'PROPER', args: 'text', does: 'Capital First Letters.', group: 'Text' },
  { name: 'TRIM', args: 'text', does: 'Removes extra spaces.', group: 'Text' },
  { name: 'CONCAT', args: 'texts…', does: 'Joins text (also &).', group: 'Text' },
  { name: 'TEXTJOIN', args: 'separator, skip_empty, texts…', does: 'Joins text with a separator.', group: 'Text' },
  { name: 'SUBSTITUTE', args: 'text, old, new, [which]', does: 'Replaces some text with other text.', group: 'Text' },
  { name: 'REPLACE', args: 'text, start, count, new', does: 'Replaces characters by position.', group: 'Text' },
  { name: 'FIND', args: 'find, in_text, [start]', does: 'Where some text is (capitals matter).', group: 'Text' },
  { name: 'SEARCH', args: 'find, in_text, [start]', does: 'Where some text is (capitals don’t matter; * and ? allowed).', group: 'Text' },
  { name: 'REPT', args: 'text, times', does: 'Repeats text.', group: 'Text' },
  { name: 'TEXT', args: 'value, format', does: 'A number as text in a format, like "0.00" or "d mmm yyyy".', group: 'Text' },
  { name: 'VALUE', args: 'text', does: 'Text as a number.', group: 'Text' },
  { name: 'EXACT', args: 'text1, text2', does: 'TRUE if two texts are exactly the same.', group: 'Text' },
  { name: 'VLOOKUP', args: 'value, table, column, [approximate]', does: 'Finds a value in the first column and gives the value from another column.', group: 'Lookup' },
  { name: 'HLOOKUP', args: 'value, table, row, [approximate]', does: 'Finds a value in the first row and gives the value from another row.', group: 'Lookup' },
  { name: 'XLOOKUP', args: 'value, look_in, return, [if_not_found], [match_mode], [search_mode]', does: 'Finds a value and gives the matching one from another range.', group: 'Lookup' },
  { name: 'INDEX', args: 'range, row, [column]', does: 'The value at a row and column of a range.', group: 'Lookup' },
  { name: 'MATCH', args: 'value, range, [type]', does: 'The position of a value in a range.', group: 'Lookup' },
  { name: 'XMATCH', args: 'value, range, [match_mode]', does: 'The position of a value (exact by default).', group: 'Lookup' },
  { name: 'ROW', args: '[cell]', does: 'A cell’s row number.', group: 'Lookup' },
  { name: 'COLUMN', args: '[cell]', does: 'A cell’s column number.', group: 'Lookup' },
  { name: 'ROWS', args: 'range', does: 'How many rows a range has.', group: 'Lookup' },
  { name: 'COLUMNS', args: 'range', does: 'How many columns a range has.', group: 'Lookup' },
  { name: 'ADDRESS', args: 'row, column, [kind]', does: 'A cell’s address as text.', group: 'Lookup' },
  { name: 'TODAY', args: '', does: 'Today’s date.', group: 'Date' },
  { name: 'NOW', args: '', does: 'The date and time now.', group: 'Date' },
  { name: 'DATE', args: 'year, month, day', does: 'A date from its parts.', group: 'Date' },
  { name: 'TIME', args: 'hour, minute, second', does: 'A time from its parts.', group: 'Date' },
  { name: 'YEAR', args: 'date', does: 'The year of a date.', group: 'Date' },
  { name: 'MONTH', args: 'date', does: 'The month (1–12).', group: 'Date' },
  { name: 'DAY', args: 'date', does: 'The day of the month.', group: 'Date' },
  { name: 'HOUR', args: 'time', does: 'The hour (0–23).', group: 'Date' },
  { name: 'MINUTE', args: 'time', does: 'The minute.', group: 'Date' },
  { name: 'WEEKDAY', args: 'date, [type]', does: 'The day of the week (1 = Sunday).', group: 'Date' },
  { name: 'WEEKNUM', args: 'date, [type]', does: 'The week of the year.', group: 'Date' },
  { name: 'DAYS', args: 'end, start', does: 'Days between two dates.', group: 'Date' },
  { name: 'DATEDIF', args: 'start, end, unit', does: 'Whole years ("Y"), months ("M") or days ("D") between dates.', group: 'Date' },
  { name: 'EDATE', args: 'date, months', does: 'The same day some months later.', group: 'Date' },
  { name: 'EOMONTH', args: 'date, months', does: 'The last day of a month.', group: 'Date' },
  { name: 'NETWORKDAYS', args: 'start, end, [holidays]', does: 'Working days between two dates.', group: 'Date' },
  { name: 'WORKDAY', args: 'start, days, [holidays]', does: 'The date some working days later.', group: 'Date' },
  { name: 'PMT', args: 'rate, periods, amount, [future], [type]', does: 'The payment each period for a loan.', group: 'Money' },
  { name: 'FV', args: 'rate, periods, payment, [present], [type]', does: 'What savings grow to.', group: 'Money' },
  { name: 'PV', args: 'rate, periods, payment, [future], [type]', does: 'What future payments are worth now.', group: 'Money' },
  { name: 'NPER', args: 'rate, payment, amount, [future], [type]', does: 'How many periods to pay off.', group: 'Money' },
  { name: 'NPV', args: 'rate, values…', does: 'Net present value.', group: 'Money' },
  { name: 'IRR', args: 'values, [guess]', does: 'Internal rate of return.', group: 'Money' },
];
