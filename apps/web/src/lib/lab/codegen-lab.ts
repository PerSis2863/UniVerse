import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { indexHooks, opHooks, textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import { CodegenError, generate, quotientType, type Cls, type Ty } from './codegen';
import * as X from './fixed';

// Hyperion's embedded code in the language (M480): codegen turns a function of the script into C (name.c and name.h
// in Hyperion's files), from example inputs that fix the sizes and types; fi, a fixed-point number for embedded and
// FPGA work (choose word and fraction lengths in a script; M524: codegen takes fi examples and writes fixed-point C).
// MATLAB Coder's codegen takes -args {…}; here: codegen('name', {examples}). MATLAB's fi is an object; here a struct
// marked fi that does + − .* * with full-precision growth.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const files = (lab: Lab) => { const s = (lab.host as { files?: unknown }).files; return s instanceof FileStore ? s : null; };
function tyOf(v: Value, i: number): Ty {
  // M524: a fi example makes a fixed-point input (its stored whole numbers in C).
  if (v.k === 'struct' && v.fi) { const m = valuesOf(v); return { cls: 'fixed', r: m.r, c: m.c, fx: typeOf(v) }; }
  if (v.k !== 'mat') throw new LabError(`Input ${i}: an example number or matrix (here ${v.k === 'str' ? 'text' : v.k}).`);
  if ((v.p ?? 1) > 1) throw new LabError(`Input ${i}: 2D only.`);
  if (v.im) throw new LabError(`Input ${i}: complex numbers can’t become C here.`);
  return { cls: (v.logical ? 'logical' : v.cls ?? 'double') as Cls, r: v.r, c: v.c };
}
def('codegen', (a, nout, lab) => {
  const name = a[0] ? textOf(a[0]).replace(/\.m$/, '') : '';
  if (!name) throw new LabError("codegen('name', {example inputs}): the function to turn into C.");
  const ex = a[1];
  const args = !ex ? [] : ex.k === 'cell' ? ex.d.map(tyOf) : [tyOf(ex, 1)];
  let out: { c: string; h: string };
  try { out = generate(lab.fns, name, args); } catch (e) { if (e instanceof CodegenError) throw new LabError(`codegen: ${e.message}`); throw e; }
  const fs = files(lab);
  if (fs) { fs.putText(`${name}.c`, out.c); fs.putText(`${name}.h`, out.h); }
  if (nout > 0) return [{ k: 'struct', f: new Map<string, Value>([['C', str(out.c)], ['H', str(out.h)]]) } satisfies Struct];
  lab.host.out(`Wrote ${name}.c and ${name}.h${fs ? ' to Hyperion’s files' : ''}:\n\n${out.c}\n`);
  return [];
});

// ——— fi ———
const isFi = (v: Value | undefined): v is Struct => v?.k === 'struct' && !!v.fi;
const typeOf = (v: Struct): X.Nt => {
  const rm = v.f.get('RoundingMethod'), om = v.f.get('OverflowAction');
  return { signed: !!toMat(v.f.get('Signed')!).d[0], wl: toMat(v.f.get('WordLength')!).d[0], fl: toMat(v.f.get('FractionLength')!).d[0], ...(rm ? { rm: textOf(rm) as X.Rm } : {}), ...(om ? { om: textOf(om) as X.Om } : {}) };
};
const valuesOf = (v: Struct) => toMat(v.f.get('Value')!);
function make(m: Mat, t: X.Nt): Struct {
  if (!(t.wl >= 2 && t.wl <= 128 && Number.isInteger(t.wl))) throw new LabError('The word length is a whole number of bits from 2 to 128.');
  const q = mat(m.r, m.c, [...m.d].map((x) => X.quantize(x, t)));
  const f = new Map<string, Value>([['Value', q], ['Signed', { ...num(t.signed ? 1 : 0), logical: true }], ['WordLength', num(t.wl)], ['FractionLength', num(t.fl)]]);
  // M530: a fimath other than the default is kept with the value (MATLAB shows it the same way).
  if (t.rm || t.om) { f.set('RoundingMethod', str(t.rm ?? 'Nearest')); f.set('OverflowAction', str(t.om ?? 'Saturate')); }
  return { k: 'struct', fi: true, f };
}
// ——— M530: fimath (MATLAB's rounding method and overflow action; sums and products stay full precision) ———
const FMV = { RoundingMethod: X.RMS as string[], OverflowAction: ['Saturate', 'Wrap'] };
const fmName = (k: string) => (Object.keys(FMV) as (keyof typeof FMV)[]).find((n) => n.toLowerCase() === k.toLowerCase());
const isFimath = (v: Value | undefined): v is Struct => v?.k === 'struct' && !v.fi && v.f.has('RoundingMethod') && v.f.has('OverflowAction');
/** Name–value pairs (or a fimath) read into a type's rounding and overflow. */
function fmFrom(args: Value[], into: Pick<X.Nt, 'rm' | 'om'> = {}): Pick<X.Nt, 'rm' | 'om'> {
  const out = { ...into };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (isFimath(a)) { out.rm = textOf(a.f.get('RoundingMethod')!) as X.Rm; out.om = textOf(a.f.get('OverflowAction')!) as X.Om; continue; }
    const k = a.k === 'str' ? fmName(textOf(a)) : undefined;
    if (!k || !args[i + 1]) throw new LabError("fimath takes 'RoundingMethod' (Nearest, Floor, Ceiling, Zero, Round or Convergent) and 'OverflowAction' (Saturate or Wrap).");
    const v = textOf(args[++i]), hit = FMV[k].find((x) => x.toLowerCase() === v.toLowerCase() || (k === 'RoundingMethod' && v.toLowerCase() === 'fix' && x === 'Zero'));
    if (!hit) throw new LabError(`${k} is one of ${FMV[k].join(', ')} (here ${v}).`);
    if (k === 'RoundingMethod') out.rm = hit as X.Rm; else out.om = hit as X.Om;
  }
  return out;
}
const fimathOf = (t: Pick<X.Nt, 'rm' | 'om'>): Struct => ({ k: 'struct', f: new Map<string, Value>([['RoundingMethod', str(t.rm ?? 'Nearest')], ['OverflowAction', str(t.om ?? 'Saturate')], ['ProductMode', str('FullPrecision')], ['SumMode', str('FullPrecision')]]) });
def('fimath', (a) => [fimathOf(isFi(a[0]) ? typeOf(a[0]) : fmFrom(a))]);
def('setfimath', (a) => { if (!isFi(a[0])) throw new LabError('setfimath(x, F): x is a fi value.'); return [make(valuesOf(a[0]), { ...typeOf(a[0]), ...fmFrom(a.slice(1)) })]; });
def('removefimath', (a) => { if (!isFi(a[0])) throw new LabError('removefimath takes a fi value.'); const { rm: _r, om: _o, ...t } = typeOf(a[0]); void _r; void _o; return [make(valuesOf(a[0]), t)]; });
def('fi', (a) => {
  // fi(x, …) of a fi: its value in the new type (M524).
  const m = isFi(a[0]) ? valuesOf(a[0]) : toMat(a[0] ?? num(0), 'fi’s value');
  if (m.im) throw new LabError('fi takes real numbers here.');
  // M530: the numbers (signed, word, fraction) may be followed by a fimath or 'RoundingMethod' / 'OverflowAction' pairs.
  let k = 1;
  while (k < 4 && a[k]?.k === 'mat') k++;
  const n = a.slice(1, k), fm = fmFrom(a.slice(k), isFi(a[0]) ? typeOf(a[0]) : {});
  const signed = n[0] ? !!toMat(n[0]).d[0] : true, wl = n[1] ? toMat(n[1]).d[0] : 16;
  const fl = n[2] ? toMat(n[2]).d[0] : X.bestFl(m.d, signed, wl);
  const { rm, om } = fm;
  return [make(m, { signed, wl, fl, ...(rm ? { rm } : {}), ...(om ? { om } : {}) })];
});
const before = opHooks.binop;
opHooks.binop = (op, a, b) => (!isFi(a) && !isFi(b) ? before?.(op, a, b) ?? null : fiOp(op, a, b));
/** An operator on fi values; T (M530: mldivide / mrdivide) chooses a division's answer type. */
function fiOp(op: string, a: Value, b: Value, T?: X.Nt): Value {
  const ta = isFi(a) ? typeOf(a) : null, tb = isFi(b) ? typeOf(b) : null;
  // A plain number meets a fi: it takes the fi's word length and sign, with its own best precision (as MATLAB).
  const asFi = (v: Value, like: X.Nt): [Mat, X.Nt] => { if (isFi(v)) return [valuesOf(v), typeOf(v)]; const m = toMat(v); return [m, { ...like, fl: X.bestFl(m.d, like.signed, like.wl) }]; };
  const [ma, na] = asFi(a, (ta ?? tb)!), [mb, nb] = asFi(b, (tb ?? ta)!);
  const qa = mat(ma.r, ma.c, [...ma.d].map((x) => X.quantize(x, na))), qb = mat(mb.r, mb.c, [...mb.d].map((x) => X.quantize(x, nb)));
  const typed = (q: X.Nt): X.Nt => (T ? { ...X.fmOf(na, nb), ...T } : q);
  let t: X.Nt;
  if (op === '+' || op === '-') t = X.sumType(na, nb);
  else if (op === '.*' || (op === '*' && (qa.d.length === 1 || qb.d.length === 1))) t = X.productType(na, nb);
  else if (op === '*') { const k = qa.c; t = X.productType(na, nb); t = { ...t, wl: Math.min(128, t.wl + Math.ceil(Math.log2(Math.max(2, k)))) }; }
  else if (op === './' || (op === '/' && qb.d.length === 1)) return fiDiv(qa, na, qb, nb, typed(quotientType(na, nb)));
  // M530: A \ B and B / A by a square fi matrix: solved exactly, each answer rounded once (fiSolve).
  else if (op === '\\' && qa.d.length > 1) return fiSolve(qa, na, qb, nb, typed(quotientType(nb, na)));
  else if (op === '\\') return fiDiv(qb, nb, qa, na, typed(quotientType(nb, na)));
  else if (op === '/') return transposeFi(fiSolve(transpose(qb), nb, transpose(qa), na, typed(quotientType(na, nb))));
  else if (['<', '<=', '>', '>=', '==', '~=', '!='].includes(op)) return compare(op, qa, qb);
  else throw new LabError(`${op} on fi values isn’t here: + − .* * ./ \\ / (or double(x) first).`);
  return make(toMat(fiArith(op, qa, qb)), t);
}
/** M527: a ./ b in type t, exactly as the C (fx_div): the stored quotient rounded to the nearest (halves up) and held in
 * range; dividing by zero gives the top (or bottom) of the range, 0 / 0 gives 0. Worked in BigInt. */
function fiDiv(a: Mat, na: X.Nt, b: Mat, nb: X.Nt, t: X.Nt): Struct {
  if (a.d.length > 1 && b.d.length > 1 && (a.r !== b.r || a.c !== b.c)) throw new LabError(`The sizes must agree: ${a.r}×${a.c} and ${b.r}×${b.c}.`);
  const shape = a.d.length >= b.d.length ? a : b, at = (m: Mat, i: number) => m.d[m.d.length === 1 ? 0 : i];
  const s = t.fl - na.fl + nb.fl;
  const out = Array.from({ length: shape.d.length }, (_, i) => Number(divBig(BigInt(X.stored(at(a, i), na)), BigInt(X.stored(at(b, i), nb)), s, t)) / 2 ** t.fl);
  return make(mat(shape.r, shape.c, out), t);
}
/** M530: the stored p / q in type t, p and q stored integers and s the fraction bits to add (as the C's fx_div): rounded by
 * t's method, held or wrapped; dividing by zero gives the top or bottom (0 / 0 gives 0). */
function divBig(p: bigint, q: bigint, s: number, t: X.Nt): bigint {
  const one = BigInt(1), zero = BigInt(0), w = BigInt(t.wl), lo = t.signed ? -(one << (w - one)) : zero, hi = t.signed ? (one << (w - one)) - one : (one << w) - one;
  if (q === zero) return p > zero ? hi : p < zero ? lo : zero;
  if (q < zero) { p = -p; q = -q; }
  if (s >= 0) p *= one << BigInt(s); else q *= one << BigInt(-s);
  return X.fitBig(X.rdivBig(p, q, t.rm), t);
}
const transpose = (m: Mat): Mat => { const o = mat(m.c, m.r); for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) o.d[j + i * m.c] = m.d[i + j * m.r]; return o; };
const transposeFi = (v: Struct): Struct => make(transpose(valuesOf(v)), typeOf(v));
/** M530: A \ B for a square fi A: fraction-free Gauss–Jordan elimination on the stored integers (every number on the way
 * a whole one, so nothing is rounded), which leaves det·x on the right; each answer is then one division, rounded once
 * into t as ./ does. A singular A gives zeros. The C (codegen) does exactly these steps. */
function fiSolve(a: Mat, na: X.Nt, b: Mat, nb: X.Nt, t: X.Nt): Struct {
  if (a.r !== a.c) throw new LabError(`A \\ B takes a square A here (A is ${a.r}×${a.c}).`);
  if (b.r !== a.r) throw new LabError(`A \\ B: B needs ${a.r} rows (here ${b.r}).`);
  const n = a.r, m = b.c, M = solveStored(Array.from({ length: n * n }, (_, i) => BigInt(X.stored(a.d[i], na))), Array.from({ length: n * m }, (_, i) => BigInt(X.stored(b.d[i], nb))), n, m);
  const s = t.fl - nb.fl + na.fl, out = mat(n, m);
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) out.d[i + j * n] = M.det === BigInt(0) ? 0 : Number(divBig(M.rhs[i + j * n], M.det, s, t)) / 2 ** t.fl;
  return make(out, t);
}
/** The elimination itself (column by column storage); exported for the tests. */
export function solveStored(A: bigint[], B: bigint[], n: number, m: number): { det: bigint; rhs: bigint[] } {
  const w = n + m, M = [...A, ...B], at = (i: number, j: number) => i + j * n, zero = BigInt(0);
  let prev = BigInt(1);
  for (let k = 0; k < n; k++) {
    let p = k;
    while (p < n && M[at(p, k)] === zero) p++;
    if (p === n) return { det: zero, rhs: B.map(() => zero) };
    if (p !== k) for (let j = 0; j < w; j++) { const x = M[at(k, j)]; M[at(k, j)] = M[at(p, j)]; M[at(p, j)] = x; }
    const pk = M[at(k, k)];
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const f = M[at(i, k)];
      for (let j = 0; j < w; j++) if (j !== k) M[at(i, j)] = (pk * M[at(i, j)] - f * M[at(k, j)]) / prev;
      M[at(i, k)] = zero;
    }
    prev = pk;
  }
  return { det: prev, rhs: M.slice(n * n) };
}
def('divide', (a) => {
  if (!isFi(a[0])) throw new LabError('divide(T, a, b): T is the answer’s type, numerictype(s, w, f) or a fi value.');
  if (!isFi(a[1]) && !isFi(a[2])) throw new LabError('divide(T, a, b): a or b must be a fi value.');
  const like = typeOf((isFi(a[1]) ? a[1] : a[2]) as Struct);
  const side = (v: Value): [Mat, X.Nt] => { if (isFi(v)) return [valuesOf(v), typeOf(v)]; const m = toMat(v); return [m, { ...like, fl: X.bestFl(m.d, like.signed, like.wl) }]; };
  const [ma, na] = side(a[1]), [mb, nb] = side(a[2]);
  return [fiDiv(ma, na, mb, nb, { ...X.fmOf(na, nb), ...typeOf(a[0]) })];
});
// M530: mldivide(A, B, T) and mrdivide(B, A, T): A \ B and B / A with the answer's type chosen (a fi or numerictype).
for (const [name, op] of [['mldivide', '\\'], ['mrdivide', '/']] as const) {
  const plain = BUILTINS[name];
  BUILTINS[name] = (a, n, lab) => {
    if (!isFi(a[0]) && !isFi(a[1])) return plain ? plain(a, n, lab) : [lab.binop(op, a[0], a[1])];
    if (a[2] && !isFi(a[2])) throw new LabError(`${name}(…, T): T is the answer's type, numerictype(s, w, f) or a fi value.`);
    return [fiOp(op, a[0], a[1], isFi(a[2]) ? typeOf(a[2]) : undefined)];
  };
}
/** M524: fi values compared by their values (a logical array). */
function compare(op: string, a: Mat, b: Mat): Value {
  if (a.d.length > 1 && b.d.length > 1 && (a.r !== b.r || a.c !== b.c)) throw new LabError(`The sizes must agree: ${a.r}×${a.c} and ${b.r}×${b.c}.`);
  const shape = a.d.length >= b.d.length ? a : b, at = (m: Mat, i: number) => m.d[m.d.length === 1 ? 0 : i];
  const ok = (x: number, y: number) => (op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : op === '>=' ? x >= y : op === '==' ? x === y : x !== y);
  return { ...mat(shape.r, shape.c, Array.from({ length: shape.d.length }, (_, i) => (ok(at(a, i), at(b, i)) ? 1 : 0))), logical: true };
}
opHooks.post = (a) => (isFi(a) ? transposeFi(a) : null);
// −x keeps x's type (the most negative value held in range, as MATLAB's saturation).
opHooks.neg = (a) => (isFi(a) ? make(mat(valuesOf(a).r, valuesOf(a).c, [...valuesOf(a).d].map((x) => -x)), typeOf(a)) : null);
/** The exact result of the quantised values (the fi type then holds it). */
function fiArith(op: string, a: Mat, b: Mat): Mat {
  const n = Math.max(a.d.length, b.d.length), at = (m: Mat, i: number) => m.d[m.d.length === 1 ? 0 : i];
  if (op === '*' && a.d.length > 1 && b.d.length > 1) {
    if (a.c !== b.r) throw new LabError(`The inner sizes must agree: ${a.r}×${a.c} * ${b.r}×${b.c}.`);
    const out = mat(a.r, b.c);
    for (let j = 0; j < b.c; j++) for (let i = 0; i < a.r; i++) { let s = 0; for (let p = 0; p < a.c; p++) s += a.d[i + p * a.r] * b.d[p + j * b.r]; out.d[i + j * a.r] = s; }
    return out;
  }
  if (a.d.length > 1 && b.d.length > 1 && (a.r !== b.r || a.c !== b.c)) throw new LabError(`The sizes must agree: ${a.r}×${a.c} and ${b.r}×${b.c}.`);
  const shape = a.d.length >= b.d.length ? a : b;
  return mat(shape.r, shape.c, Array.from({ length: n }, (_, i) => (op === '+' ? at(a, i) + at(b, i) : op === '-' ? at(a, i) - at(b, i) : at(a, i) * at(b, i))));
}
// M524: x(i) keeps x's type; x(i) = v and x(:) = v round v to x's steps and hold its range (MATLAB's subscripted
// assignment into a fi: how a fixed-point loop keeps its accumulator's type).
indexHooks.get = (v, _idx, plain) => (isFi(v) ? make(toMat(plain(valuesOf(v))), typeOf(v)) : null);
indexHooks.set = (base, _idx, v, plain) => {
  if (!isFi(base)) return null;
  const t = typeOf(base), x = isFi(v) ? valuesOf(v) : toMat(v, 'The value');
  return make(toMat(plain(valuesOf(base), x)), t);
};
def('storedInteger', (a) => { if (!isFi(a[0])) throw new LabError('storedInteger takes a fi value.'); const t = typeOf(a[0]), m = valuesOf(a[0]); return [mat(m.r, m.c, [...m.d].map((x) => X.stored(x, t)))]; });
def('bin', (a) => { if (!isFi(a[0])) throw new LabError('bin takes a fi value.'); const t = typeOf(a[0]); return [str([...valuesOf(a[0]).d].map((x) => X.bits(x, t)).join('   '))]; });
def('hex', (a) => { if (!isFi(a[0])) throw new LabError('hex takes a fi value.'); const t = typeOf(a[0]); return [str([...valuesOf(a[0]).d].map((x) => X.hex(x, t)).join('   '))]; });
def('numerictype', (a) => {
  // M527: numerictype(s, w, f) is a type to divide into (here a fi zero of that type).
  if (a.length === 3 && !isFi(a[0])) return [make(mat(1, 1, [0]), { signed: !!toMat(a[0]).d[0], wl: toMat(a[1]).d[0], fl: toMat(a[2]).d[0] })];
  if (!isFi(a[0])) throw new LabError('numerictype takes a fi value.'); const t = typeOf(a[0]); return [str(`${t.signed ? 'Signed' : 'Unsigned'}, word length ${t.wl}, fraction length ${t.fl}`)]; });
def('upperbound', (a) => { if (!isFi(a[0])) throw new LabError('upperbound takes a fi value.'); const t = typeOf(a[0]); return [num(X.limits(t)[1] / 2 ** t.fl)]; });
def('lowerbound', (a) => { if (!isFi(a[0])) throw new LabError('lowerbound takes a fi value.'); const t = typeOf(a[0]); return [num(X.limits(t)[0] / 2 ** t.fl)]; });
for (const name of ['double', 'single']) {
  const plain = BUILTINS[name];
  BUILTINS[name] = (a, n, lab) => (isFi(a[0]) ? plain([valuesOf(a[0])], n, lab) : plain(a, n, lab));
}
const plainNumel = BUILTINS.numel;
BUILTINS.numel = (a, n, lab) => (isFi(a[0]) ? [num(valuesOf(a[0]).d.length)] : plainNumel(a, n, lab));
