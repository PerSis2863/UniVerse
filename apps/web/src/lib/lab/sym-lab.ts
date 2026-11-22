import { LabError, parse } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { cmat, mat, str, symPlain, symShown, symTex, type Fn, type Struct, type Sym, type Value } from './values';
import * as S from './sym';
import * as C from './sym-calc';

// Hyperion's symbolic values in the language (M396): `syms x`, sym(…), arithmetic and indexing on them, and the
// Symbolic Math Toolbox's everyday functions (diff, int, solve, subs, simplify, expand, factor, limit, taylor, vpa,
// latex, pretty, matlabFunction…). A result shown in the command window carries its LaTeX too, so the window can set
// it as real maths (values.ts `show`; the window's LabText).

type N = S.N;
export const symOf = (r: number, c: number, d: N[]): Sym => ({ k: 'sym', r, c, d });
const one = (n: N): Sym => symOf(1, 1, [n]);
const isSym = (v: Value | undefined): v is Sym => v?.k === 'sym';

/** A number as MATLAB's sym makes it: an exact fraction, a fraction of pi or a square root when it is one. */
export function fromNumber(v: number): N {
  if (!Number.isFinite(v)) return S.flt(v);
  if (Number.isSafeInteger(v)) return S.rat(v);
  // As MATLAB's sym: a short fraction, then a fraction of pi, then a square root, then any fraction that is exactly
  // this double (continued fractions), else a decimal.
  const frac = (maxD: number): N | null => {
    let [h0, h1, k0, k1, x] = [0, 1, 1, 0, Math.abs(v)];
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(x), h = a * h1 + h0, k = a * k1 + k0;
      if (k > maxD) return null;
      if (h / k === Math.abs(v)) return S.rat(Math.sign(v) * h, k);
      [h0, h1, k0, k1] = [h1, h, k1, k];
      if (x - a < 1e-15) return null;
      x = 1 / (x - a);
    }
    return null;
  };
  const short = frac(10000);
  if (short) return short;
  for (let d = 1; d <= 360; d++) { const n = Math.round((v / Math.PI) * d); if (n && (n * Math.PI) / d === v) return S.mul(S.rat(n, d), S.PI); }
  for (let d = 1; d <= 100; d++) { const n = Math.round(v * v * d); if (n && Math.sqrt(n / d) === Math.abs(v)) return S.mul(S.rat(Math.sign(v)), S.sqrt(S.rat(n, d))); }
  const long = frac(1e9);
  if (long) return long;
  return S.flt(v);
}
/** Any value as a symbolic array (numbers made exact, text read as a name or a number). */
export function toSym(v: Value, what = 'This'): Sym {
  if (v.k === 'sym') return v;
  if (v.k === 'mat') return symOf(v.r, v.c, Array.from(v.d, (x, k) => (v.im && v.im[k] ? S.add(fromNumber(x), S.mul(fromNumber(v.im[k]), S.I)) : fromNumber(x))));
  if (v.k === 'str') {
    const t = v.v.trim();
    if (/^[A-Za-z]\w*$/.test(t)) return one(t === 'pi' ? S.PI : t === 'Inf' || t === 'inf' ? S.INF : S.sym(t));
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return one(fromNumber(Number(t)));
    throw new LabError(`sym('${t}'): give a name (sym('x')) or a number; build expressions from symbols, like 2*x + 1.`);
  }
  if (v.k === 'cell') return symOf(v.r, v.c, v.d.map((x) => toSym(x, what).d[0] ?? S.ZERO));
  throw new LabError(`${what} must be a number or symbolic, not ${v.k === 'struct' ? 'a struct' : 'a function handle'}.`);
}
const scalarSym = (v: Value, what: string): N => { const s = toSym(v, what); if (s.d.length !== 1) throw new LabError(`${what} must be one expression, not ${s.r}x${s.c}.`); return s.d[0]; };
const name = (v: Value, what: string): string => { const n = scalarSym(v, what); if (n.t !== 's') throw new LabError(`${what} must be a symbol, like x.`); return n.name; };
const mapS = (v: Sym, f: (n: N) => N): Sym => symOf(v.r, v.c, v.d.map(f));

function zipS(a: Sym, b: Sym, f: (x: N, y: N) => N): Sym {
  if (a.d.length === 1) return mapS(b, (y) => f(a.d[0], y));
  if (b.d.length === 1) return mapS(a, (x) => f(x, b.d[0]));
  if (a.r !== b.r || a.c !== b.c) throw new LabError(`The sizes don’t match: ${a.r}x${a.c} and ${b.r}x${b.c}.`);
  return symOf(a.r, a.c, a.d.map((x, k) => f(x, b.d[k])));
}
const at = (m: Sym, i: number, j: number) => m.d[i + j * m.r];
function smatmul(a: Sym, b: Sym): Sym {
  if (a.c !== b.r) throw new LabError(`Inner sizes must agree for *: ${a.r}x${a.c} times ${b.r}x${b.c} (use .* element by element).`);
  const out: N[] = [];
  for (let j = 0; j < b.c; j++) for (let i = 0; i < a.r; i++) out.push(S.add(...Array.from({ length: a.c }, (_, k) => S.mul(at(a, i, k), at(b, k, j)))));
  return symOf(a.r, b.c, out);
}
export function sdet(a: Sym): N {
  if (a.r !== a.c) throw new LabError('det needs a square matrix.');
  const n = a.r;
  if (n === 0) return S.ONE;
  if (n === 1) return a.d[0];
  if (n === 2) return S.sub(S.mul(at(a, 0, 0), at(a, 1, 1)), S.mul(at(a, 0, 1), at(a, 1, 0)));
  if (n > 7) throw new LabError('det of a symbolic matrix above 7x7 isn’t supported.');
  // Along the first row.
  return S.add(...Array.from({ length: n }, (_, j) => {
    const minor: N[] = [];
    for (let c = 0; c < n; c++) if (c !== j) for (let r = 1; r < n; r++) minor.push(at(a, r, c));
    return S.mul(j % 2 ? S.MINUS : S.ONE, at(a, 0, j), sdet(symOf(n - 1, n - 1, minor)));
  }));
}
export function sinv(a: Sym): Sym {
  if (a.r !== a.c) throw new LabError('inv needs a square matrix.');
  const n = a.r, out: N[] = [];
  for (let j = 0; j < n; j++) {
    const A = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, k) => at(a, i, k)), i === j ? S.ONE : S.ZERO]);
    const x = C.gauss(A, n);
    if (!x) throw new LabError('That symbolic matrix has no inverse (it is singular).');
    out.push(...x.map((v) => C.simplify(v, 1)));
  }
  return symOf(n, n, out);
}
const transposeS = (a: Sym): Sym => { const out: N[] = []; for (let i = 0; i < a.r; i++) for (let j = 0; j < a.c; j++) out.push(at(a, i, j)); return symOf(a.c, a.r, out); };
export const symTranspose = transposeS;

/** An operator with a symbolic side; null hands it back to the numbers (both sides without letters). */
export function symBinop(op: string, A: Value, B: Value): Value | null {
  const a = toSym(A, 'The left side'), b = toSym(B, 'The right side');
  switch (op) {
    case '+': return zipS(a, b, S.add);
    case '-': return zipS(a, b, S.sub);
    case '.*': return zipS(a, b, S.mul);
    case './': return zipS(a, b, S.div);
    case '.\\': return zipS(a, b, (x, y) => S.div(y, x));
    case '.^': return zipS(a, b, S.pow);
    case '*': return a.d.length === 1 || b.d.length === 1 ? zipS(a, b, S.mul) : smatmul(a, b);
    case '/': return b.d.length === 1 ? zipS(a, b, S.div) : smatmul(a, sinv(b));
    case '\\': return a.d.length === 1 ? zipS(a, b, (x, y) => S.div(y, x)) : smatmul(sinv(a), b);
    case '^': {
      if (a.d.length === 1 && b.d.length === 1) return one(S.pow(a.d[0], b.d[0]));
      const k = b.d[0];
      if (b.d.length !== 1 || !S.isInt(k) || a.r !== a.c) throw new LabError('A symbolic matrix to a power needs a square matrix and a whole number (use .^ element by element).');
      let out = a, base = a;
      if (S.val(k) < 0) base = out = sinv(a);
      for (let i = 1; i < Math.abs(S.val(k)); i++) out = smatmul(out, base);
      return S.val(k) === 0 ? symOf(a.r, a.c, a.d.map((_, q) => (q % (a.r + 1) === 0 ? S.ONE : S.ZERO))) : out;
    }
    case '==': return zipS(a, b, S.eq);
  }
  if ([...a.d, ...b.d].some((n) => S.symbols(n).size)) throw new LabError(`“${op}” doesn’t work on symbolic expressions with letters in them: use solve, or subs and double first.`);
  return null;
}
export const symNeg = (a: Sym): Sym => mapS(a, S.neg);

/** [x, y; 1, 2] with symbols in it. */
export function symConcat(rows: Value[][]): Sym {
  const blocks = rows.map((r) => r.filter((v) => !(v.k === 'mat' && v.d.length === 0)).map((v) => toSym(v)));
  const joined = blocks.filter((r) => r.length).map((r) => {
    const h = r[0].r;
    if (r.some((m) => m.r !== h)) throw new LabError(`Can’t put these side by side: they have ${r.map((m) => m.r).join(' and ')} rows.`);
    const d: N[] = [];
    for (const m of r) d.push(...m.d);
    return symOf(h, r.reduce((s, m) => s + m.c, 0), d);
  });
  if (!joined.length) return symOf(0, 0, []);
  const c = joined[0].c;
  if (joined.some((m) => m.c !== c)) throw new LabError(`Can’t stack these: they have ${joined.map((m) => m.c).join(' and ')} columns.`);
  const r = joined.reduce((s, m) => s + m.r, 0), d: N[] = Array(r * c);
  let top = 0;
  for (const m of joined) { for (let j = 0; j < c; j++) for (let i = 0; i < m.r; i++) d[top + i + j * r] = at(m, i, j); top += m.r; }
  return symOf(r, c, d);
}

/** Numbers from a symbolic array (complex when needed); an error naming the letters left in it. */
export function symToMat(v: Sym, what = 'This'): Value {
  const left = new Set<string>();
  for (const n of v.d) for (const s of S.symbols(n)) left.add(s);
  if (left.size) throw new LabError(`${what} still has ${[...left].join(', ')} in it: give ${left.size > 1 ? 'them values' : 'it a value'} with subs, then double.`);
  const re: number[] = [], im: number[] = [];
  for (const n of v.d) { const [a, b] = S.evalC(n); re.push(Math.abs(a) < 1e-300 ? 0 : a); im.push(Math.abs(b) < 1e-14 * (1 + Math.abs(a)) ? 0 : b); }
  return im.some((x) => x !== 0) ? cmat(v.r, v.c, re, im) : mat(v.r, v.c, re);
}

// ——— Showing: values.ts (symPlain, symTex, symShown) ———

// ——— Functions ———

const flag = (a: Value[], key: string): Value | undefined => { const i = a.findIndex((v) => v.k === 'str' && v.v.toLowerCase() === key.toLowerCase()); return i >= 0 ? a[i + 1] : undefined; };
const withoutFlags = (a: Value[], keys: string[]) => { const out: Value[] = []; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v.k === 'str' && keys.some((k) => k.toLowerCase() === v.v.toLowerCase())) { i++; continue; } out.push(v); } return out; };
const mainOf = (v: Sym): string | null => S.mainVar(S.add(...v.d.map((n) => (n.t === '=' ? S.sub(n.l, n.r) : n))));
const listNames = (v: Value): string[] => (v.k === 'cell' ? v.d.flatMap(listNames) : toSym(v).d.map((n) => { if (n.t !== 's') throw new LabError('Give the variables as symbols, like [x, y].'); return n.name; }));
const col = (ns: N[]): Sym => symOf(ns.length, ns.length ? 1 : 0, ns);

const def = (names: string, f: Builtin) => { for (const n of names.split(' ')) SYM[n] = f; };
export const SYM: Record<string, Builtin> = {};
/** Functions that mean something only for symbolic maths (they work even with plain numbers). */
export const SYM_ONLY = new Set<string>();
const only = (names: string, f: Builtin) => { def(names, f); for (const n of names.split(' ')) SYM_ONLY.add(n); };

only('sym', (a) => {
  if (!a.length) throw new LabError('sym needs a value: sym(\'x\'), sym(1/3), sym([1 2; 3 4]).');
  // sym('x', [1 3]) → [x1, x2, x3]
  if (a[0].k === 'str' && a[1]?.k === 'mat') {
    const base = a[0].v.trim(), dims = Array.from(a[1].d), [r, c] = dims.length === 1 ? [dims[0], dims[0]] : dims;
    if (!/^[A-Za-z]\w*$/.test(base)) throw new LabError('sym(name, size) needs a name, like sym(\'a\', [1 3]).');
    const d: N[] = [];
    for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) d.push(S.sym(r === 1 || c === 1 ? `${base}${i + j + 1}` : `${base}${i + 1}_${j + 1}`));
    return [symOf(r, c, d)];
  }
  return [toSym(a[0])];
});
only('syms', (a, _n, lab, frame) => {
  const vars = (frame as { vars?: Map<string, Value> } | undefined)?.vars ?? lab.vars;
  for (const v of a) {
    const t = v.k === 'str' ? v.v.trim() : '';
    if (['real', 'positive', 'integer', 'rational', 'clear', 'complex'].includes(t)) continue;
    if (/^[A-Za-z]\w*\(/.test(t)) throw new LabError(`Symbolic functions like ${t} aren’t supported yet: write the expression itself (f = x^2 + 1) and use subs(f, x, 2).`);
    if (!/^[A-Za-z]\w*$/.test(t)) throw new LabError(`syms takes names, like syms x y t (not “${t}”).`);
    vars.set(t, one(S.sym(t)));
  }
  return [];
});
for (const f of [...S.FUNCS, 'sqrt']) def(f, (a) => [mapS(toSym(a[0]), (n) => S.fn(f, n))]);
def('nthroot', (a) => [zipS(toSym(a[0]), toSym(a[1]), (x, n) => S.pow(x, S.div(S.ONE, n)))]);
def('double', (a) => [symToMat(toSym(a[0]), 'double(…)')]);
def('char string', (a) => [str(symPlain(toSym(a[0])))]);
def('disp', (a, _n, lab) => { lab.host.out(`${symShown(toSym(a[0]))}\n`); return []; });
only('pretty', (a, _n, lab) => { lab.host.out(`${symShown(toSym(a[0]))}\n`); return []; });
only('latex', (a) => [str(symTex(toSym(a[0])))]);
only('vpa', (a) => {
  const digits = a[1] ? Math.max(1, Math.min(32, Math.round(toSymNumber(a[1])))) : 32;
  const go = (n: N): N => {
    if (!S.symbols(n).size && n.t !== '=') {
      const [re, im] = S.evalC(n), r = (v: number) => (digits < 17 ? Number(v.toPrecision(digits)) : v);
      return Math.abs(im) > 1e-14 * (1 + Math.abs(re)) ? S.add(S.flt(r(re)), S.mul(S.flt(r(im)), S.I)) : S.flt(r(re));
    }
    switch (n.t) {
      case '+': return S.add(...n.a.map(go));
      case '*': return S.mul(...n.a.map(go));
      case '^': return S.pow(go(n.b), S.isNum(n.e) ? n.e : go(n.e));
      case 'fn': return S.fn(n.name, ...n.a.map(go));
      case '=': return S.eq(go(n.l), go(n.r));
      default: return n;
    }
  };
  return [mapS(toSym(a[0]), go)];
});
const toSymNumber = (v: Value) => { const n = scalarSym(v, 'That'); const [re] = S.evalC(n); return re; };
only('symvar', (a) => { const all = new Set<string>(); for (const n of toSym(a[0]).d) S.symbols(n, all); const names = [...all].sort(); return [symOf(1, names.length, names.map(S.sym))]; });

def('diff', (a) => {
  const f = toSym(a[0]);
  let x: string | null = null, k = 1;
  for (const v of a.slice(1)) {
    if (v.k === 'mat') k = Math.round(v.d[0]);
    else x = name(v, 'The variable');
  }
  x ??= mainOf(f);
  if (!x) return [mapS(f, () => S.ZERO)];
  return [mapS(f, (n) => { let d = n; for (let i = 0; i < k; i++) d = S.diff(d, x!); return d; })];
});
only('int', (a) => {
  const f = toSym(a[0]);
  const rest = a.slice(1);
  let x: string | null = null;
  if (rest.length === 1 || rest.length === 3) x = name(rest[0], 'The variable');
  const bounds = rest.length >= 2 ? rest.slice(rest.length - 2) : null;
  x ??= mainOf(f) ?? 'x';
  return [mapS(f, (n) => {
    if (bounds) return C.definite(n, x!, scalarSym(bounds[0], 'The lower limit'), scalarSym(bounds[1], 'The upper limit'));
    const F = C.integrate(n, x!);
    return F ? C.simplify(F, 1) : S.fn('int', n, S.sym(x!));
  })];
});
only('simplify', (a) => { const steps = flag(a, 'Steps'); return [mapS(toSym(a[0]), (n) => C.simplify(n, steps ? Math.max(1, Math.min(10, Math.round(toSymNumber(steps) / 10))) : 2))]; });
only('expand', (a) => [mapS(toSym(a[0]), S.expand)]);
only('simplifyFraction', (a) => [mapS(toSym(a[0]), C.together)]);
def('factor', (a) => { const f = toSym(a[0]); if (f.d.length !== 1) throw new LabError('factor takes one expression.'); const fs = C.factorList(f.d[0]); return [symOf(1, fs.length, fs)]; });
only('collect', (a) => {
  const f = toSym(a[0]);
  return [mapS(f, (n) => {
    const x = a[1] ? name(a[1], 'The variable') : S.mainVar(n);
    const cs = x ? S.polyOf(n, x) : null;
    return cs ? S.add(...cs.map((c, k) => S.mul(C.simplify(c, 1), S.pow(S.sym(x!), S.rat(k))))) : n;
  })];
});
only('numden', (a) => { const f = toSym(a[0]); const parts = f.d.map((n) => S.numden(C.together(n))); return [symOf(f.r, f.c, parts.map((p) => p[0])), symOf(f.r, f.c, parts.map((p) => p[1]))]; });
only('lhs', (a) => [mapS(toSym(a[0]), (n) => (n.t === '=' ? n.l : n))]);
only('rhs', (a) => [mapS(toSym(a[0]), (n) => (n.t === '=' ? n.r : S.ZERO))]);

only('solve', (a, nout) => {
  const args = withoutFlags(a, ['Real', 'ReturnConditions', 'PrincipalValue', 'IgnoreAnalyticConstraints', 'MaxDegree']);
  const eqs: N[] = [], vars: string[] = [];
  for (const v of args) {
    const s = toSym(v);
    if (s.d.every((n) => n.t === 's') && eqs.length) vars.push(...s.d.map((n) => (n as { name: string }).name));
    else eqs.push(...s.d);
  }
  if (!eqs.length) throw new LabError('solve needs an equation, like solve(x^2 == 4, x).');
  if (!vars.length) {
    const all = new Set<string>();
    for (const e of eqs) S.symbols(e, all);
    const names = [...all].sort();
    if (eqs.length === 1) { const m = S.mainVar(eqs[0]); if (m) vars.push(m); } else vars.push(...names.slice(0, eqs.length));
  }
  if (!vars.length) throw new LabError('There is nothing to solve for: the equation has no letters.');
  if (vars.length === 1 && eqs.length === 1) return [col(C.solveFor(eqs[0], vars[0]))];
  const sols = C.solveSystem(eqs, vars);
  const per = vars.map((v) => col(sols.map((s) => s.get(v) ?? S.sym(v))));
  if (nout > 1) return per;
  const f = new Map<string, Value>(vars.map((v, i) => [v, per[i]]));
  return [{ k: 'struct', f } satisfies Struct];
});
only('isolate', (a) => { const e = scalarSym(a[0], 'The equation'), x = name(a[1], 'The variable'), r = C.solveFor(e, x); if (!r.length) throw new LabError(`I couldn’t isolate ${x}.`); return [one(S.eq(S.sym(x), r[0]))]; });
only('subs', (a, _n, lab, frame) => {
  const f = toSym(a[0]);
  let olds: N[], news: Value[];
  const values = (v: Value): Value[] => (v.k === 'cell' ? v.d : [v]);
  if (a.length === 1) {
    // subs(f): letters that are variables in the workspace take their values.
    const vars = (frame as { vars?: Map<string, Value> } | undefined)?.vars ?? lab.vars;
    const all = new Set<string>();
    for (const n of f.d) S.symbols(n, all);
    olds = []; news = [];
    for (const s of all) { const v = vars.get(s); if (v && !(isSym(v) && v.d.length === 1 && v.d[0].t === 's' && v.d[0].name === s)) { olds.push(S.sym(s)); news.push(v); } }
  } else if (a.length === 2) {
    const x = mainOf(f);
    if (!x) return [f];
    olds = [S.sym(x)]; news = [a[1]];
  } else {
    olds = a[1].k === 'cell' ? a[1].d.flatMap((v) => toSym(v).d) : toSym(a[1]).d;
    news = a[2].k === 'cell' ? values(a[2]) : olds.length > 1 ? toSym(a[2]).d.map((n) => symOf(1, 1, [n])) : [a[2]];
  }
  if (olds.length !== news.length) throw new LabError('subs needs as many new values as things to replace.');
  // One letter and an array of values: the expression at each value.
  if (olds.length === 1 && f.d.length === 1 && news[0].k !== 'sym' && news[0].k === 'mat' && news[0].d.length > 1) {
    const vs = toSym(news[0]);
    return [mapS(vs, (v) => S.subst(f.d[0], olds[0], v))];
  }
  const repl = news.map((v) => scalarOrArray(v));
  return [mapS(f, (n) => olds.reduce((acc, o, i) => S.subst(acc, o, repl[i]), n))];
});
const scalarOrArray = (v: Value): N => { const s = toSym(v); if (s.d.length !== 1) throw new LabError('Replace one letter with one value (or one letter with an array of values).'); return s.d[0]; };

only('limit', (a) => {
  const args = a.filter((v) => !(v.k === 'str' && /^(left|right)$/i.test(v.v)));
  const dirArg = a.find((v) => v.k === 'str' && /^(left|right)$/i.test(v.v)) as { v: string } | undefined;
  const dir = dirArg ? (dirArg.v.toLowerCase() as 'left' | 'right') : 'both';
  const f = toSym(args[0]);
  let x: string | null = null, p: N = S.ZERO;
  if (args.length >= 3) { x = name(args[1], 'The variable'); p = scalarSym(args[2], 'The point'); }
  else if (args.length === 2) p = scalarSym(args[1], 'The point');
  return [mapS(f, (n) => { const v = x ?? S.mainVar(n); return v ? C.limitOf(n, v, p, dir) : n; })];
});
only('taylor', (a) => {
  const order = flag(a, 'Order'), point = flag(a, 'ExpansionPoint');
  const args = withoutFlags(a, ['Order', 'ExpansionPoint']);
  const f = toSym(args[0]);
  const x = args[1] ? name(args[1], 'The variable') : null;
  const p = point ? scalarSym(point, 'The expansion point') : args[2] ? scalarSym(args[2], 'The expansion point') : S.ZERO;
  const n = order ? Math.max(1, Math.round(toSymNumber(order))) : 6;
  return [mapS(f, (e) => { const v = x ?? S.mainVar(e); return v ? C.taylor(e, v, p, n) : e; })];
});
only('symsum', (a) => {
  const f = scalarSym(a[0], 'The term'), k = a.length >= 4 ? name(a[1], 'The index') : S.mainVar(f) ?? 'k';
  const [lo, hi] = a.length >= 4 ? [scalarSym(a[2], 'From'), scalarSym(a[3], 'To')] : [scalarSym(a[1], 'From'), scalarSym(a[2], 'To')];
  return [one(symsum(f, k, lo, hi))];
});
/** Σ f(k) for k from lo to hi: written out when short, a polynomial in hi when f is one, geometric sums, or 1/k². */
function symsum(f: N, k: string, lo: N, hi: N): N {
  const K = S.sym(k);
  if (S.isInt(lo) && S.isInt(hi) && S.val(hi) - S.val(lo) <= 2000) return C.simplify(S.add(...Array.from({ length: Math.max(0, S.val(hi) - S.val(lo) + 1) }, (_, i) => S.subst(f, K, S.rat(S.val(lo) + i)))), 1);
  const cs = S.polyOf(f, k);
  if (cs && S.isInt(lo) && hi.t !== 'c') {
    // The sum of a degree-p polynomial is a degree-(p+1) polynomial in the top: fit it through p + 2 points.
    const p = cs.length - 1, n = S.sym('_n'), pts = Array.from({ length: p + 2 }, (_, i) => S.val(lo) + i);
    const vals = pts.map((m) => S.add(...Array.from({ length: m - S.val(lo) + 1 }, (_, i) => S.subst(f, K, S.rat(S.val(lo) + i)))));
    const poly = S.add(...pts.map((m, i) => S.mul(vals[i], ...pts.filter((_, j) => j !== i).map((q) => S.div(S.sub(n, S.rat(q)), S.rat(m - q))))));
    return C.simplify(S.subst(S.expand(poly), n, hi), 2);
  }
  // r^k
  if (f.t === '^' && f.b.t !== 's' && !S.has(f.b, k) && f.e.t === 's' && f.e.name === k) {
    const r = f.b;
    if (hi.t === 'c' && hi.name === 'inf') return C.simplify(S.div(S.pow(r, lo), S.sub(S.ONE, r)), 1);
    return C.simplify(S.div(S.sub(S.pow(r, lo), S.pow(r, S.add(hi, S.ONE))), S.sub(S.ONE, r)), 1);
  }
  if (hi.t === 'c' && hi.name === 'inf' && S.isOne(lo) && f.t === '^' && f.b.t === 's' && f.b.name === k && S.isInt(f.e)) {
    const e = -S.val(f.e);
    if (e === 2) return S.mul(S.rat(1, 6), S.pow(S.PI, S.rat(2)));
    if (e === 4) return S.mul(S.rat(1, 90), S.pow(S.PI, S.rat(4)));
    if (e === 1) return S.INF;
  }
  return S.fn('symsum', f, K, lo, hi);
}

only('coeffs', (a) => {
  const f = scalarSym(a[0], 'The polynomial');
  const all = a.some((v) => v.k === 'str' && v.v.toLowerCase() === 'all');
  const xv = a.find((v, i) => i > 0 && v.k !== 'str');
  const x = xv ? name(xv, 'The variable') : S.mainVar(f);
  if (!x) return [one(f)];
  const cs = S.polyOf(f, x);
  if (!cs) throw new LabError(`That isn’t a polynomial in ${x}.`);
  const out = all ? [...cs].reverse() : cs.filter((c) => !S.isZero(c));
  return [symOf(1, out.length, out)];
});
only('sym2poly', (a) => {
  const f = scalarSym(a[0], 'The polynomial'), x = S.mainVar(f);
  if (!x) return [symToMat(one(f))];
  const cs = S.polyOf(f, x);
  if (!cs) throw new LabError(`That isn’t a polynomial in ${x}.`);
  return [symToMat(symOf(1, cs.length, [...cs].reverse()), 'sym2poly')];
});
only('poly2sym', (a) => {
  const c = toSym(a[0]), x = a[1] ? name(a[1], 'The variable') : 'x';
  return [one(S.fromPoly([...c.d].reverse(), x))];
});
only('jacobian', (a) => {
  const F = toSym(a[0]), vs = a[1] ? listNames(a[1]) : [...new Set(F.d.flatMap((n) => [...S.symbols(n)]))].sort();
  const out: N[] = [];
  for (let j = 0; j < vs.length; j++) for (const f of F.d) out.push(S.diff(f, vs[j]));
  return [symOf(F.d.length, vs.length, out)];
});
only('hessian', (a) => {
  const f = scalarSym(a[0], 'The expression'), vs = a[1] ? listNames(a[1]) : [...S.symbols(f)].sort();
  const out: N[] = [];
  for (const q of vs) for (const p of vs) out.push(S.diff(S.diff(f, p), q));
  return [symOf(vs.length, vs.length, out)];
});
def('gradient', (a) => {
  const f = scalarSym(a[0], 'The expression'), vs = a[1] ? listNames(a[1]) : [...S.symbols(f)].sort();
  return [col(vs.map((v) => S.diff(f, v)))];
});
def('det', (a) => [one(C.simplify(sdet(toSym(a[0])), 1))]);
def('inv', (a) => [sinv(toSym(a[0]))]);
def('eig', (a) => {
  const A = toSym(a[0]);
  if (A.r !== A.c) throw new LabError('eig needs a square matrix.');
  const lam = S.sym('_lambda');
  const shifted = symOf(A.r, A.c, A.d.map((n, k) => (k % (A.r + 1) === 0 ? S.sub(n, lam) : n)));
  return [col(C.solveFor(S.expand(sdet(shifted)), '_lambda'))];
});
def('sum', (a) => {
  const v = toSym(a[0]);
  return [v.r === 1 || v.c === 1 ? one(S.add(...v.d)) : symOf(1, v.c, Array.from({ length: v.c }, (_, j) => S.add(...Array.from({ length: v.r }, (_, i) => at(v, i, j)))))];
});
SYM.prod = (a) => { const v = toSym(a[0]); return [v.r === 1 || v.c === 1 ? one(S.mul(...v.d)) : symOf(1, v.c, Array.from({ length: v.c }, (_, j) => S.mul(...Array.from({ length: v.r }, (_, i) => at(v, i, j)))))]; };
only('isAlways', (a) => {
  const v = toSym(a[0]);
  return [mat(v.r, v.c, v.d.map((n) => {
    const e = n.t === '=' ? S.sub(n.l, n.r) : n;
    return S.isZero(C.simplify(e)) ? 1 : 0;
  }), true)];
});
only('assume assumeAlso', () => []);

/** f as a function handle, vectorized (.*, ./, .^), its inputs the letters in it (or 'Vars'). */
only('matlabFunction', (a) => [handleOf(toSym(a[0]), a)]);
function handleOf(f: Sym, a: Value[]): Fn {
  const varsArg = flag(a, 'Vars');
  const all = new Set<string>();
  for (const n of f.d) S.symbols(n, all);
  const params = varsArg ? listNames(varsArg) : [...all].sort();
  const body = f.d.length === 1 ? code(f.d[0].t === '=' ? S.sub(f.d[0].l, f.d[0].r) : f.d[0]) : `[${Array.from({ length: f.r }, (_, i) => Array.from({ length: f.c }, (_, j) => code(at(f, i, j))).join(', ')).join('; ')}]`;
  const src = `@(${params.join(',')}) ${body}`;
  const prog = parse(`__h = ${src};`);
  const st = prog.body[0];
  if (st?.s !== 'assign' || st.e.k !== 'lambda') throw new LabError('Couldn’t make a function from that expression.');
  return { k: 'fn', params: st.e.params, body: st.e.body, src: st.e.src, closure: new Map() };
}
/** Hyperion code for an expression, element by element. */
function code(n: N): string {
  const wrap = (x: N) => (x.t === '+' || x.t === '*' || x.t === '^' || (S.isNum(x) && S.val(x) < 0) || (x.t === 'n' && x.d !== 1) ? `(${code(x)})` : code(x));
  switch (n.t) {
    case 'n': return n.d === 1 ? String(n.n) : `${n.n}/${n.d}`;
    case 'f': return String(n.v);
    case 's': return n.name;
    case 'c': return n.name === 'pi' ? 'pi' : n.name === 'i' ? '1i' : n.name === 'inf' ? 'Inf' : 'NaN';
    case '+': return n.a.map(code).join(' + ');
    case '*': return n.a.map(wrap).join('.*');
    case '^': return `${wrap(n.b)}.^${wrap(n.e)}`;
    case 'fn': return `${n.name}(${n.a.map(code).join(', ')})`;
    case '=': return `${code(n.l)} - (${code(n.r)})`;
  }
}
// Plots of formulas: made into handles, then drawn as usual.
for (const p of ['fplot', 'fsurf', 'fmesh', 'fcontour', 'fimplicit', 'ezplot', 'fplot3']) {
  def(p, (a, nout, lab) => {
    const arity = p === 'fplot' || p === 'ezplot' ? 1 : p === 'fplot3' ? 1 : 2;
    const outArgs: Value[] = [];
    for (const v of a) {
      if (isSym(v)) {
        const f = v.d.length === 1 && v.d[0].t === '=' ? one(S.sub(v.d[0].l, v.d[0].r)) : v;
        const all = new Set<string>();
        for (const n of f.d) S.symbols(n, all);
        if (all.size > arity && p !== 'fplot3') throw new LabError(`${p} draws expressions in ${arity === 1 ? 'one letter' : 'two letters'}; this has ${[...all].join(', ')}.`);
        // fplot3(x(t), y(t), z(t)): each a function of the same letter.
        outArgs.push(handleOf(f, []));
      } else outArgs.push(v);
    }
    return lab.call(p, outArgs, nout);
  });
}

// Functions that only make sense here are known everywhere (help, Tab completion, exist).
for (const n of SYM_ONLY) if (!BUILTINS[n]) BUILTINS[n] = SYM[n];
/** True when this call should go to the symbolic version. */
export const symCall = (name: string, args: Value[]): Builtin | null => (SYM[name] && (args.some(isSym) || SYM_ONLY.has(name)) ? SYM[name] : null);
