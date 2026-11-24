import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { indexHooks, opHooks, textOf, type Lab } from './interp';
import { FileStore } from './files';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import { CodegenError, generate, type Cls, type Ty } from './codegen';
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
const typeOf = (v: Struct): X.Nt => ({ signed: !!toMat(v.f.get('Signed')!).d[0], wl: toMat(v.f.get('WordLength')!).d[0], fl: toMat(v.f.get('FractionLength')!).d[0] });
const valuesOf = (v: Struct) => toMat(v.f.get('Value')!);
function make(m: Mat, t: X.Nt): Struct {
  if (!(t.wl >= 2 && t.wl <= 128 && Number.isInteger(t.wl))) throw new LabError('The word length is a whole number of bits from 2 to 128.');
  const q = mat(m.r, m.c, [...m.d].map((x) => X.quantize(x, t)));
  return { k: 'struct', fi: true, f: new Map<string, Value>([['Value', q], ['Signed', { ...num(t.signed ? 1 : 0), logical: true }], ['WordLength', num(t.wl)], ['FractionLength', num(t.fl)]]) };
}
def('fi', (a) => {
  // fi(x, …) of a fi: its value in the new type (M524).
  const m = isFi(a[0]) ? valuesOf(a[0]) : toMat(a[0] ?? num(0), 'fi’s value');
  if (m.im) throw new LabError('fi takes real numbers here.');
  const signed = a[1] ? !!toMat(a[1]).d[0] : true, wl = a[2] ? toMat(a[2]).d[0] : 16;
  const fl = a[3] ? toMat(a[3]).d[0] : X.bestFl(m.d, signed, wl);
  return [make(m, { signed, wl, fl })];
});
const before = opHooks.binop;
opHooks.binop = (op, a, b) => {
  if (!isFi(a) && !isFi(b)) return before?.(op, a, b) ?? null;
  const ta = isFi(a) ? typeOf(a) : null, tb = isFi(b) ? typeOf(b) : null;
  // A plain number meets a fi: it takes the fi's word length and sign, with its own best precision (as MATLAB).
  const asFi = (v: Value, like: X.Nt): [Mat, X.Nt] => { if (isFi(v)) return [valuesOf(v), typeOf(v)]; const m = toMat(v); return [m, { ...like, fl: X.bestFl(m.d, like.signed, like.wl) }]; };
  const [ma, na] = asFi(a, (ta ?? tb)!), [mb, nb] = asFi(b, (tb ?? ta)!);
  const qa = mat(ma.r, ma.c, [...ma.d].map((x) => X.quantize(x, na))), qb = mat(mb.r, mb.c, [...mb.d].map((x) => X.quantize(x, nb)));
  let t: X.Nt;
  if (op === '+' || op === '-') t = X.sumType(na, nb);
  else if (op === '.*' || (op === '*' && (qa.d.length === 1 || qb.d.length === 1))) t = X.productType(na, nb);
  else if (op === '*') { const k = qa.c; t = X.productType(na, nb); t = { ...t, wl: Math.min(128, t.wl + Math.ceil(Math.log2(Math.max(2, k)))) }; }
  else if (['<', '<=', '>', '>=', '==', '~=', '!='].includes(op)) return compare(op, qa, qb);
  else throw new LabError(`${op} on fi values isn’t here: + − .* * (or double(x) first).`);
  return make(toMat(fiArith(op, qa, qb)), t);
};
/** M524: fi values compared by their values (a logical array). */
function compare(op: string, a: Mat, b: Mat): Value {
  if (a.d.length > 1 && b.d.length > 1 && (a.r !== b.r || a.c !== b.c)) throw new LabError(`The sizes must agree: ${a.r}×${a.c} and ${b.r}×${b.c}.`);
  const shape = a.d.length >= b.d.length ? a : b, at = (m: Mat, i: number) => m.d[m.d.length === 1 ? 0 : i];
  const ok = (x: number, y: number) => (op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : op === '>=' ? x >= y : op === '==' ? x === y : x !== y);
  return { ...mat(shape.r, shape.c, Array.from({ length: shape.d.length }, (_, i) => (ok(at(a, i), at(b, i)) ? 1 : 0))), logical: true };
}
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
def('numerictype', (a) => { if (!isFi(a[0])) throw new LabError('numerictype takes a fi value.'); const t = typeOf(a[0]); return [str(`${t.signed ? 'Signed' : 'Unsigned'}, word length ${t.wl}, fraction length ${t.fl}`)]; });
def('upperbound', (a) => { if (!isFi(a[0])) throw new LabError('upperbound takes a fi value.'); const t = typeOf(a[0]); return [num(X.limits(t)[1] / 2 ** t.fl)]; });
def('lowerbound', (a) => { if (!isFi(a[0])) throw new LabError('lowerbound takes a fi value.'); const t = typeOf(a[0]); return [num(X.limits(t)[0] / 2 ** t.fl)]; });
for (const name of ['double', 'single']) {
  const plain = BUILTINS[name];
  BUILTINS[name] = (a, n, lab) => (isFi(a[0]) ? plain([valuesOf(a[0])], n, lab) : plain(a, n, lab));
}
const plainNumel = BUILTINS.numel;
BUILTINS.numel = (a, n, lab) => (isFi(a[0]) ? [num(valuesOf(a[0]).d.length)] : plainNumel(a, n, lab));
