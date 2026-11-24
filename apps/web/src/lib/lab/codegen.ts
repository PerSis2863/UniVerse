import type { Expr, FnDef, Stmt } from './parse';
import { bestFl, limits, productType, stored, sumType, type Nt } from './fixed';

// Hyperion's C code generation (M480): a function written in Hyperion's language, with example inputs that fix every
// size and type, becomes plain, readable C99 for embedded work: no memory allocated at run time, fixed-size arrays
// stored column by column (as the engine stores them), double / single / whole-number types (whole numbers saturate and
// round as MATLAB's do), loops, branches, element-wise array maths, the matrix product, sums and the usual maths
// functions, and calls to other functions of the script. What it can't turn into C it refuses with the reason and the
// place. Our own generator (MATLAB Coder's output isn't copied).
// M524: and fixed-point numbers (fi): each one is its stored whole number in the smallest C integer that holds its
// word (up to 62 bits); sums and products grow exactly as the engine's fi does (a sum one bit and the finer fraction, a
// product both words), worked in 64-bit integers, so C and Hyperion give the same bits; fi(x, s, w, f) and y(:) = …
// round to the nearest step and hold the range, as MATLAB's do.

export type Cls = 'double' | 'single' | 'logical' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64' | 'fixed';
/** A value's type: its class and size; a fixed-point one (cls 'fixed') also its sign, word and fraction lengths. */
export interface Ty { cls: Cls; r: number; c: number; fx?: Nt }
export class CodegenError extends Error {}

const CTYPE: Record<Cls, string> = { double: 'double', single: 'float', logical: 'bool', int8: 'int8_t', uint8: 'uint8_t', int16: 'int16_t', uint16: 'uint16_t', int32: 'int32_t', uint32: 'uint32_t', int64: 'int64_t', uint64: 'uint64_t', fixed: 'int64_t' };
const isInt = (c: Cls) => c.includes('int');
const isFx = (t: Ty) => t.cls === 'fixed';
// M527: up to 62 bits the work is in int64_t; wider types (to 126 bits) are held and worked in 128-bit integers
// (fx128_t: GCC and Clang on 64-bit computers), so a sum, a product or an alignment still never overflows.
const NARROW_FX = 62, MAX_FX = 126;
const fxC = (t: Nt) => (t.wl > 64 ? `${t.signed ? '' : 'u'}fx128_t` : `${t.signed ? '' : 'u'}int${t.wl <= 8 ? 8 : t.wl <= 16 ? 16 : t.wl <= 32 ? 32 : 64}_t`);
const cty = (t: Ty) => (isFx(t) ? fxC(t.fx!) : CTYPE[t.cls]);
const sameFx = (a: Ty, b: Ty) => !!a.fx && !!b.fx && a.fx.signed === b.fx.signed && a.fx.wl === b.fx.wl && a.fx.fl === b.fx.fl;
const fxText = (t: Nt) => `fi(${t.signed ? 'signed' : 'unsigned'}, ${t.wl} bits, ${t.fl} fraction)`;
const tyText = (t: Ty) => (isFx(t) ? fxText(t.fx!) : t.cls);
const big = (v: number) => `INT64_C(${v})`;
/** M527: a stored whole number as exact C, also past 2^53 (a double's whole numbers there are m·2^e with m at most 2^53). */
function bigX(v: number): string {
  if (Math.abs(v) <= 2 ** 52) return big(v);
  const e = Math.ceil(Math.log2(Math.abs(v))) - 53;
  return `((fxw_t)${big(v / 2 ** e)} * ((fxw_t)1 << ${e}))`;
}
const p2 = (d: number) => (d <= 52 ? big(2 ** d) : `((fxw_t)1 << ${d})`);
/** M527: a fixed type's range as exact C. */
function lim(t: Nt): [string, string] {
  if (t.wl <= 52) return limits(t).map(big) as [string, string];
  return t.signed ? [`(-((fxw_t)1 << ${t.wl - 1}))`, `(((fxw_t)1 << ${t.wl - 1}) - 1)`] : ['0', `(((fxw_t)1 << ${t.wl}) - 1)`];
}
/** M527: the quotient's fraction and the bits its working needs (numerator scaled up, or denominator). */
const divPlan = (a: Nt, b: Nt, to: Nt) => { const s = to.fl - a.fl + b.fl; return { s, need: Math.max(a.wl + Math.max(s, 0), b.wl + Math.max(-s, 0)) + 2 }; };
/** M527: a ./ b's own type: the larger word, the fraction a's minus b's (divide(T, a, b) chooses another). */
export const quotientType = (a: Nt, b: Nt): Nt => ({ signed: a.signed || b.signed, wl: Math.max(a.wl, b.wl), fl: a.fl - b.fl });
const scalar = (t: Ty) => t.r === 1 && t.c === 1;
const n = (t: Ty) => t.r * t.c;
const sizeText = (t: Ty) => `${t.r}×${t.c}`;
const RANGE: Partial<Record<Cls, [string, string]>> = { int8: ['-128', '127'], uint8: ['0', '255'], int16: ['-32768', '32767'], uint16: ['0', '65535'], int32: ['-2147483648.0', '2147483647.0'], uint32: ['0', '4294967295.0'], int64: ['-9223372036854775808.0', '9223372036854775807.0'], uint64: ['0', '18446744073709551615.0'] };
const FN1: Record<string, string> = { sqrt: 'sqrt', abs: 'fabs', exp: 'exp', log: 'log', log10: 'log10', log2: 'log2', sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', floor: 'floor', ceil: 'ceil', round: 'round', fix: 'trunc' };
const FN2: Record<string, string> = { atan2: 'atan2', hypot: 'hypot', power: 'pow' };
const CMP: Record<string, string> = { '==': '==', '~=': '!=', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=', '&&': '&&', '||': '||', '&': '&&', '|': '||' };

/** Result type of combining two classes (MATLAB: a whole-number type wins; single beats double). */
function mix(a: Cls, b: Cls): Cls {
  if (isInt(a)) return a;
  if (isInt(b)) return b;
  if (a === 'single' || b === 'single') return 'single';
  return 'double';
}

interface Fn { def: FnDef; args: Ty[]; outs: Ty[]; cname: string; code: string[]; decls: Map<string, Ty> }

export function generate(fns: Map<string, FnDef>, entry: string, args: Ty[]): { c: string; h: string } {
  const helpers = new Set<string>(), made = new Map<string, Fn>(), order: Fn[] = [];
  let wide = false; // M527: some fixed-point work needs 128-bit integers
  let tmp = 0;

  function make(name: string, argTypes: Ty[], from: string[]): Fn {
    const def = fns.get(name);
    if (!def) throw new CodegenError(`There’s no function ${name} in the script.`);
    if (from.includes(name)) throw new CodegenError(`${name} calls itself: recursion can’t become fixed-size C here.`);
    if (def.varargin || def.varargout) throw new CodegenError(`${name}: varargin and varargout can’t become C here.`);
    if (argTypes.length !== def.params.length) throw new CodegenError(`${name} takes ${def.params.length} inputs; ${argTypes.length} examples were given.`);
    const key = `${name}(${argTypes.map((t) => `${t.cls}${t.fx ? `<${+t.fx.signed},${t.fx.wl},${t.fx.fl}>` : ''}${sizeText(t)}`).join(',')})`;
    const have = made.get(key);
    if (have) return have;
    // The first version of each function keeps its name; another set of input types gets a number.
    const versions = [...made.values()].filter((g) => g.def === def).length;
    const f: Fn = { def, args: argTypes, outs: [], cname: versions ? `${name}_${versions + 1}` : name, code: [], decls: new Map() };
    made.set(key, f);
    const vars = new Map<string, Ty>(def.params.map((p, i) => [p, argTypes[i]]));
    let depth = 1;
    const out = (line: string) => f.code.push(`${'  '.repeat(depth)}${line}`);
    const fail = (what: string): never => { throw new CodegenError(`${name}: ${what}`); };
    const declare = (v: string, t: Ty) => {
      const old = vars.get(v);
      if (def.params.includes(v) && !scalar(old ?? t)) fail(`the input ${v} is an array and is changed: copy it first (y = ${v};) and change the copy.`);
      if (old && (old.r !== t.r || old.c !== t.c)) fail(`${v} changes size (${sizeText(old)} → ${sizeText(t)}): in C every variable keeps one size.`);
      if (old && (isFx(old) || isFx(t)) && !(isFx(old) && isFx(t) && sameFx(old, t))) fail(`${v} changes type (${tyText(old)} → ${tyText(t)}): keep its type with ${v}(:) = … (rounded and held in range, as MATLAB does).`);
      if (old && old.cls !== t.cls && !(def.params.includes(v))) {
        // MATLAB keeps the first class of a variable assigned a different one only for whole numbers; here: refuse.
        if (isInt(old.cls) !== isInt(t.cls)) fail(`${v} changes type (${old.cls} → ${t.cls}).`);
      }
      const keep = old ?? t;
      vars.set(v, keep);
      if (!def.params.includes(v) && !f.decls.has(v)) f.decls.set(v, keep);
      return keep;
    };
    const fresh = (t: Ty) => { const v = `t${++tmp}`; f.decls.set(v, t); return v; };
    const lit = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));

    // ——— Fixed point (M524) ———
    function fxTy(fx: Nt, r = 1, c = 1): Ty {
      if (!(fx.wl >= 2 && fx.wl <= MAX_FX && Number.isInteger(fx.wl) && Number.isInteger(fx.fl))) fail(`a fixed-point value of ${fx.wl} bits: C here works up to ${MAX_FX} bits (sums and products grow: give the accumulator a type with acc(:) = …).`);
      if (fx.wl > NARROW_FX) wide = true;
      return { cls: 'fixed', r, c, fx };
    }
    /** A number written in the code, met by a fixed-point value: it takes that value's word and sign, its own best fraction. */
    const literal = (e: Expr): number | null => (e.k === 'num' && !e.imag ? e.v : e.k === 'un' && e.op === '-' && e.a.k === 'num' ? -e.a.v : null);
    function fxSide(e: Expr, t: Ty, like: Nt): { nt: Nt; code: (k: string | null) => string } {
      if (isFx(t)) return { nt: t.fx!, code: (k) => scal(e, scalar(t) ? null : k).code };
      const v = literal(e);
      if (v === null) fail('a fixed-point value meets a number that isn’t written in the code: make it fixed point too, with fi(x, s, w, f).');
      const nt: Nt = { signed: like.signed, wl: like.wl, fl: bestFl([v!], like.signed, like.wl) };
      return { nt, code: () => bigX(stored(v!, nt)) };
    }
    function fxBin(e: Extract<Expr, { k: 'bin' }>, a: Ty, b: Ty): { t: Ty; code: (k: string | null) => string } {
      const like = (isFx(a) ? a : b).fx!, A = fxSide(e.a, a, like), B = fxSide(e.b, b, like);
      const shape = scalar(a) ? b : a;
      if (!scalar(a) && !scalar(b) && !(e.op === '*') && (a.r !== b.r || a.c !== b.c)) fail(`the sizes don’t agree: ${sizeText(a)} ${e.op} ${sizeText(b)}.`);
      const at = (side: typeof A, fl: number, k: string | null) => { const d = fl - side.nt.fl; return d ? `(fxw_t)${side.code(k)} * ${p2(d)}` : `(fxw_t)${side.code(k)}`; };
      if (CMP[e.op]) {
        if (!scalar(a) || !scalar(b)) fail(`compare single numbers in conditions (here ${sizeText(a)} ${e.op} ${sizeText(b)}).`);
        const fl = Math.max(A.nt.fl, B.nt.fl);
        return { t: { cls: 'logical', r: 1, c: 1 }, code: (k) => `(${at(A, fl, k)} ${CMP[e.op]} ${at(B, fl, k)})` };
      }
      if (e.op === '+' || e.op === '-') {
        const nt = sumType(A.nt, B.nt), t = fxTy(nt, shape.r, shape.c);
        return { t, code: (k) => `(${fxC(nt)})(${at(A, nt.fl, k)} ${e.op} ${at(B, nt.fl, k)})` };
      }
      if (e.op === '.*' || (e.op === '*' && (scalar(a) || scalar(b)))) {
        const nt = productType(A.nt, B.nt), t = fxTy(nt, shape.r, shape.c);
        return { t, code: (k) => `(${fxC(nt)})((fxw_t)${A.code(k)} * (fxw_t)${B.code(k)})` };
      }
      if (e.op === './' || e.op === '/') {
        if (e.op === '/' && !scalar(b)) fail('/ by a fixed-point matrix can’t become C here (use ./).');
        const nt = quotientType(A.nt, B.nt);
        return { t: fxTy(nt, shape.r, shape.c), code: (k) => fxDivCode(nt, A, B, k) };
      }
      if (e.op === '*') {
        if (!isFx(a) || !isFx(b)) fail('a matrix product of fixed-point values needs both fixed point.');
        if (a.c !== b.r) fail(`the inner sizes don’t agree: ${sizeText(a)} * ${sizeText(b)}.`);
        const p = productType(a.fx!, b.fx!), nt = { ...p, wl: p.wl + Math.ceil(Math.log2(Math.max(2, a.c))) };
        return { t: fxTy(nt, a.r, b.c), code: () => fail('a matrix product where one number is needed.') };
      }
      return fail(`${e.op} on fixed-point values can’t become C here (+ − .* * ./ and comparisons).`);
    }
    /** M527: a quotient rounded to the nearest step of its type (halves up) and held in its range; dividing by zero gives the top or bottom (0 / 0 is 0). */
    function fxDivCode(to: Nt, A: { nt: Nt; code: (k: string | null) => string }, B: { nt: Nt; code: (k: string | null) => string }, k: string | null): string {
      const { s, need } = divPlan(A.nt, B.nt, to);
      if (need > MAX_FX + 1) fail(`a fixed-point division that needs ${need} bits of working: choose a type with fewer fraction bits (divide(T, a, b)).`);
      if (need > NARROW_FX + 1) wide = true;
      helpers.add('fx_div'); helpers.add('fx_sat');
      const [lo, hi] = lim(to);
      return `(${fxC(to)})fx_div((fxw_t)${A.code(k)}, (fxw_t)${B.code(k)}, ${s}, ${lo}, ${hi})`;
    }
    /** A value converted to a fixed-point type: rounded to the nearest step (halves up) and held in range. */
    function toFx(to: Nt, x: { code: string; t: Ty }): string {
      const [lo, hi] = lim(to);
      if (!isFx(x.t)) helpers.add('fx_from');
      if (!isFx(x.t)) return `(${fxC(to)})fx_from_double((double)${x.code}, ${to.fl}, ${lo}, ${hi})`;
      const from = x.t.fx!;
      if (from.signed === to.signed && from.wl === to.wl && from.fl === to.fl) return x.code;
      helpers.add('fx_shift'); helpers.add('fx_sat');
      return `(${fxC(to)})fx_shift((fxw_t)${x.code}, ${to.fl - from.fl}, ${lo}, ${hi})`;
    }

    // ——— Types ———
    function typeOf(e: Expr): Ty {
      switch (e.k) {
        case 'num': if (e.imag) fail('complex numbers can’t become C here.'); return { cls: 'double', r: 1, c: 1 };
        case 'id': {
          if (e.name === 'pi' || e.name === 'eps' || e.name === 'Inf' || e.name === 'NaN' || e.name === 'inf' || e.name === 'nan') return { cls: 'double', r: 1, c: 1 };
          if (e.name === 'true' || e.name === 'false') return { cls: 'logical', r: 1, c: 1 };
          const t = vars.get(e.name);
          if (!t) { if (fns.has(e.name)) return callType(e.name, []); fail(`${e.name} is used before it’s given a value.`); }
          return t!;
        }
        case 'bin': {
          const a = typeOf(e.a), b = typeOf(e.b);
          if (isFx(a) || isFx(b)) return fxBin(e, a, b).t;
          if (CMP[e.op]) { if (!scalar(a) || !scalar(b)) fail(`compare single numbers in conditions (here ${sizeText(a)} ${e.op} ${sizeText(b)}).`); return { cls: 'logical', r: 1, c: 1 }; }
          if (e.op === '*' && !scalar(a) && !scalar(b)) { if (a.c !== b.r) fail(`the inner sizes don’t agree: ${sizeText(a)} * ${sizeText(b)}.`); return { cls: mix(a.cls, b.cls), r: a.r, c: b.c }; }
          if (['+', '-', '.*', './', '*', '/', '.^', '^'].includes(e.op)) {
            if ((e.op === '/' || e.op === '^') && !scalar(b)) fail(`${e.op} by a matrix can’t become C here (use ./ or .^).`);
            if ((e.op === '^') && !scalar(a)) fail('a matrix power can’t become C here (use .^).');
            if (!scalar(a) && !scalar(b) && (a.r !== b.r || a.c !== b.c)) fail(`the sizes don’t agree: ${sizeText(a)} ${e.op} ${sizeText(b)}.`);
            const t = scalar(a) ? b : a;
            return { cls: mix(a.cls === 'logical' ? 'double' : a.cls, b.cls === 'logical' ? 'double' : b.cls), r: t.r, c: t.c };
          }
          return fail(`the operator ${e.op} can’t become C here.`);
        }
        case 'un': { const a = typeOf(e.a); return e.op === '~' || e.op === '!' ? { cls: 'logical', r: a.r, c: a.c } : a; }
        case 'post': { const a = typeOf(e.a); return { ...a, r: a.c, c: a.r }; }
        case 'matrix': {
          if (e.cell) fail('cell arrays can’t become C here.');
          const rows = e.rows.map((r) => r.map(typeOf));
          if (rows.flat().some(isFx)) fail('build fixed-point arrays with fi([…], s, w, f) here.');
          if (rows.some((r) => r.some((t) => !scalar(t)))) fail('build matrices from single numbers here ([a b; c d]).');
          const c = rows[0]?.length ?? 0;
          if (rows.some((r) => r.length !== c)) fail('every row of a matrix needs as many entries.');
          return { cls: rows.flat().reduce<Cls>((k, t) => mix(k, t.cls), 'double'), r: rows.length, c };
        }
        case 'index': {
          if (e.of.k !== 'id') fail('only a variable or a function can be indexed here.');
          const name = (e.of as { name: string }).name, v = vars.get(name);
          if (!v) return callType(name, e.args);
          if (e.args.some((a) => a.k === 'colon' || a.k === 'range')) fail(`${name}(…): take one element at a time (a(i) or a(i, j)); ranges and : can’t become C here.`);
          for (const a of e.args) if (a.k !== 'end' && !scalar(typeOf(a))) fail(`${name}(…): each index is one number.`);
          if (e.args.length > 2) fail('only 2D arrays here.');
          return { ...v, r: 1, c: 1 };
        }
        default: return fail(`${e.k === 'str' ? 'text' : e.k === 'lambda' || e.k === 'handle' ? 'function handles' : e.k === 'range' ? 'a range outside a for loop' : e.k} can’t become C here.`);
      }
    }
    function callType(fname: string, a: Expr[]): Ty {
      const t = a.map(typeOf), d: Ty = { cls: 'double', r: 1, c: 1 };
      if (fname === 'fi') {
        if (a.length !== 4) fail('fi(x, signed, wordLength, fractionLength) here: all four, so the type is known.');
        const fx: Nt = { signed: !!constant(a[1]), wl: constant(a[2]), fl: constant(a[3]) };
        return fxTy(fx, t[0].r, t[0].c);
      }
      if (fname === 'numerictype' && !fns.has(fname)) {
        if (a.length !== 3) fail('numerictype(signed, wordLength, fractionLength) here: all three, so the type is known.');
        return fxTy({ signed: !!constant(a[0]), wl: constant(a[1]), fl: constant(a[2]) });
      }
      if (fname === 'divide' && !fns.has(fname)) {
        if (a.length !== 3 || !isFx(t[0]) || !scalar(t[0])) fail('divide(T, a, b): T a type (numerictype(s, w, f) or a fi value), then a and b.');
        if (!isFx(t[1]) && !isFx(t[2])) fail('divide(T, a, b): a or b must be fixed point.');
        if (!scalar(t[1]) && !scalar(t[2]) && (t[1].r !== t[2].r || t[1].c !== t[2].c)) fail(`the sizes don’t agree: ${sizeText(t[1])} and ${sizeText(t[2])}.`);
        const shape = scalar(t[1]) ? t[2] : t[1];
        return fxTy(t[0].fx!, shape.r, shape.c);
      }
      if (t.some(isFx) && !fns.has(fname)) {
        if (fname === 'double' || fname === 'single') return { cls: fname, r: t[0].r, c: t[0].c };
        if (fname === 'sum' && t.length === 1 && (t[0].r === 1 || t[0].c === 1)) return fxTy({ ...t[0].fx!, wl: t[0].fx!.wl + Math.ceil(Math.log2(Math.max(2, n(t[0])))) });
        if (!['numel', 'length', 'size'].includes(fname)) fail(`${fname} of a fixed-point value can’t become C here (+ − .* * sum, fi, double).`);
      }
      if (FN1[fname]) { if (t.length !== 1) fail(`${fname} takes one input here.`); return { ...t[0], cls: isInt(t[0].cls) ? t[0].cls : t[0].cls === 'single' ? 'single' : 'double' }; }
      if (FN2[fname] || fname === 'mod' || fname === 'rem') { if (t.length !== 2 || !t.every(scalar)) fail(`${fname} takes two single numbers here.`); return { ...d, cls: mix(t[0].cls, t[1].cls) }; }
      if (fname === 'min' || fname === 'max') { if (t.length === 2 && t.every(scalar)) return { ...d, cls: mix(t[0].cls, t[1].cls) }; if (t.length === 1 && (t[0].r === 1 || t[0].c === 1)) return { ...d, cls: t[0].cls }; fail(`${fname}: of two numbers, or of a vector.`); }
      if (fname === 'sum' || fname === 'prod' || fname === 'mean') { if (t.length !== 1 || !(t[0].r === 1 || t[0].c === 1)) fail(`${fname} of a vector only here.`); return { ...d, cls: fname === 'mean' ? 'double' : t[0].cls }; }
      if (fname === 'numel' || fname === 'length') return d;
      if (fname === 'size') { if (a.length !== 2) fail('size(x, dim) only here (one number).'); return d; }
      if (fname === 'zeros' || fname === 'ones') {
        const dims = a.map((x) => constant(x));
        const [r, c] = dims.length === 1 ? [dims[0], dims[0]] : [dims[0], dims[1]];
        return { cls: 'double', r, c };
      }
      if (CTYPE[fname as Cls] && fname !== 'fixed' && t.length === 1) return { cls: fname as Cls, r: t[0].r, c: t[0].c };
      if (fns.has(fname)) { const g = make(fname, t, [...from, name]); if (g.outs.length < 1) fail(`${fname} gives no output.`); return g.outs[0]; }
      return fail(`${fname} can’t become C here.`);
    }
    /** A number known when generating (sizes of zeros / ones). */
    function constant(e: Expr): number {
      if (e.k === 'num') return e.v;
      if (e.k === 'index' && e.of.k === 'id' && (e.of.name === 'numel' || e.of.name === 'length') && e.args[0]?.k === 'id') { const t = vars.get(e.args[0].name); if (t) return e.of.name === 'numel' ? n(t) : Math.max(t.r, t.c); }
      if (e.k === 'index' && e.of.k === 'id' && e.of.name === 'size' && e.args[0]?.k === 'id' && e.args[1]?.k === 'num') { const t = vars.get(e.args[0].name); if (t) return e.args[1].v === 1 ? t.r : t.c; }
      if (e.k === 'bin' && ['+', '-', '*'].includes(e.op)) { const a = constant(e.a), b = constant(e.b); return e.op === '+' ? a + b : e.op === '-' ? a - b : a * b; }
      return fail('sizes must be numbers known before the code runs (fixed-size arrays).');
    }

    // ——— Scalar expressions (and element k of array expressions) ———
    const satCall = (cls: Cls, code: string) => { if (!isInt(cls)) return code; helpers.add(cls); return `sat_${cls}(${code})`; };
    function idx(name: string, args: Expr[], t: Ty, k: string | null): string {
      const at = (a: Expr, dimLen: number) => (a.k === 'end' ? `${dimLen - 1}` : `(int)(${scal(a).code}) - 1`);
      if (k) return `${name}[${k}]`;
      if (args.length === 1) return `${name}[${args[0].k === 'end' ? n(t) - 1 : `(int)(${scal(args[0]).code}) - 1`}]`;
      return `${name}[${at(args[0], t.r)} + (${at(args[1], t.c)}) * ${t.r}]`;
    }
    function scal(e: Expr, k: string | null = null): { code: string; t: Ty } {
      switch (e.k) {
        case 'num': return { code: lit(e.v), t: typeOf(e) };
        case 'id': {
          const special: Record<string, string> = { pi: '3.14159265358979323846', eps: '2.220446049250313e-16', Inf: 'INFINITY', inf: 'INFINITY', NaN: 'NAN', nan: 'NAN', true: '1', false: '0' };
          if (special[e.name] && !vars.has(e.name)) return { code: special[e.name], t: typeOf(e) };
          const t = typeOf(e);
          if (!scalar(t) && !k) fail(`${e.name} is an array (${sizeText(t)}) where one number is needed.`);
          return { code: scalar(t) ? e.name : `${e.name}[${k}]`, t };
        }
        case 'bin': {
          const t = typeOf(e);
          if (isFx(typeOf(e.a)) || isFx(typeOf(e.b))) {
            if (e.op === '*' && !scalar(typeOf(e.a)) && !scalar(typeOf(e.b))) { if (!k) fail('a matrix product where one number is needed.'); return { code: `${arrayRef(e)}[${k}]`, t: { ...t, r: 1, c: 1 } }; }
            return { code: fxBin(e, typeOf(e.a), typeOf(e.b)).code(k), t: { ...t, r: 1, c: 1 } };
          }
          if (e.op === '*' && !scalar(typeOf(e.a)) && !scalar(typeOf(e.b))) { if (!k) fail('a matrix product where one number is needed.'); return { code: `${arrayRef(e)}[${k}]`, t: { ...t, r: 1, c: 1 } }; }
          const a = scal(e.a, scalar(typeOf(e.a)) ? null : k), b = scal(e.b, scalar(typeOf(e.b)) ? null : k);
          if (CMP[e.op]) return { code: `(${a.code} ${CMP[e.op]} ${b.code})`, t };
          const ad = `(double)${a.code}`, bd = `(double)${b.code}`, whole = isInt(t.cls);
          const x = (u: string, v: string) => (whole ? [ad, bd] : [u, v]);
          const [p, q] = x(a.code, b.code);
          let code: string;
          if (e.op === '+' || e.op === '-') code = `${p} ${e.op} ${q}`;
          else if (e.op === '*' || e.op === '.*') code = `${p} * ${q}`;
          else if (e.op === '/' || e.op === './') code = `${p} / ${q}`;
          else code = e.b.k === 'num' && e.b.v === 2 ? `${p} * ${p}` : `pow(${p}, ${q})`;
          return { code: whole ? satCall(t.cls, code) : `(${code})`, t };
        }
        case 'un': {
          const a = scal(e.a, k);
          if (e.op === '-' && isFx(a.t)) { helpers.add('fx_sat'); const [lo, hi] = lim(a.t.fx!); return { code: `(${fxC(a.t.fx!)})fx_sat(-(fxw_t)${a.code}, ${lo}, ${hi})`, t: a.t }; }
          if (e.op === '-') return { code: isInt(a.t.cls) ? satCall(a.t.cls, `-(double)${a.code}`) : `(-${a.code})`, t: a.t };
          if (e.op === '~' || e.op === '!') return { code: `(!${a.code})`, t: { ...a.t, cls: 'logical' } };
          return a;
        }
        case 'index': {
          const name = (e.of as { name: string }).name, v = vars.get(name);
          if (v) { typeOf(e); return { code: idx(name, e.args, v, null), t: { cls: v.cls, r: 1, c: 1 } }; }
          return call(name, e.args, k);
        }
        default: {
          if (e.k === 'post' && scalar(typeOf(e.a))) return scal(e.a, k);
          // An array inside an element-wise expression (a matrix product, a transpose, a literal): made first.
          const t = typeOf(e);
          if (!k || scalar(t)) return fail('this can’t be one number here.');
          return { code: `${arrayRef(e)}[${k}]`, t: { ...t, r: 1, c: 1 } };
        }
      }
    }
    function call(fname: string, a: Expr[], k: string | null): { code: string; t: Ty } {
      const t = callType(fname, a);
      if (fname === 'fi') { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: toFx(t.fx!, x), t: { ...t, r: 1, c: 1 } }; }
      if (fname === 'numerictype' && !fns.has(fname)) return { code: '0', t };
      if (fname === 'divide' && !fns.has(fname)) {
        const ta = typeOf(a[1]), tb = typeOf(a[2]), like = (isFx(ta) ? ta : tb).fx!;
        const A = fxSide(a[1], ta, like), B = fxSide(a[2], tb, like);
        return { code: fxDivCode(t.fx!, { nt: A.nt, code: (kk) => A.code(scalar(ta) ? null : kk) }, { nt: B.nt, code: (kk) => B.code(scalar(tb) ? null : kk) }, k), t: { ...t, r: 1, c: 1 } };
      }
      if ((fname === 'double' || fname === 'single') && isFx(typeOf(a[0]))) { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: `${fname === 'single' ? '(float)' : ''}ldexp((double)${x.code}, ${-x.t.fx!.fl})`, t: { ...t, r: 1, c: 1 } }; }
      if (FN1[fname]) { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: isInt(t.cls) ? satCall(t.cls, `${FN1[fname]}((double)${x.code})`) : `${FN1[fname]}(${x.code})`, t }; }
      if (FN2[fname]) { const [x, y] = a.map((v) => scal(v)); return { code: `${FN2[fname]}(${x.code}, ${y.code})`, t }; }
      if (fname === 'mod' || fname === 'rem') { helpers.add(fname); const [x, y] = a.map((v) => scal(v)); return { code: satCall(t.cls, `${fname}_d((double)${x.code}, (double)${y.code})`), t }; }
      if ((fname === 'min' || fname === 'max') && a.length === 2) { const [x, y] = a.map((v) => scal(v)); return { code: `${fname === 'min' ? 'fmin' : 'fmax'}(${x.code}, ${y.code})`, t }; }
      if (fname === 'numel' || fname === 'length' || fname === 'size') return { code: lit(constant({ k: 'index', of: { k: 'id', name: fname, at: 0 }, args: a, brace: false })), t };
      if (CTYPE[fname as Cls]) { const x = scal(a[0], k); return { code: isInt(t.cls) ? satCall(t.cls, `(double)${x.code}`) : `(${CTYPE[t.cls]})${x.code}`, t }; }
      if (['sum', 'prod', 'mean', 'min', 'max'].includes(fname)) {
        // A reduction of a vector: worked out just before the statement, into a temporary.
        const src = arrayRef(a[0]), v = fresh({ cls: t.cls, r: 1, c: 1 }), len = n(typeOf(a[0]));
        const init = fname === 'prod' ? '1.0' : fname === 'min' || fname === 'max' ? `${src}[0]` : isFx(t) ? '0' : '0.0';
        out(`${v} = ${init};`);
        out(`for (int i = ${fname === 'min' || fname === 'max' ? 1 : 0}; i < ${len}; i++) ${fname === 'prod' ? `${v} *= ${src}[i];` : fname === 'min' ? `if (${src}[i] < ${v}) ${v} = ${src}[i];` : fname === 'max' ? `if (${src}[i] > ${v}) ${v} = ${src}[i];` : `${v} += ${src}[i];`}`);
        if (fname === 'mean') out(`${v} /= ${len};`);
        return { code: v, t };
      }
      if (fns.has(fname)) {
        const g = make(fname, a.map(typeOf), [...from, name]);
        if (!scalar(g.outs[0])) fail(`${fname} gives an array: assign it to a variable on its own line (y = ${fname}(…)).`);
        const extra = g.outs.slice(1).map((o) => fresh(o));
        return { code: `${g.cname}(${[...a.map((x) => arrayRef(x, true)), ...extra.map((v, i) => (scalar(g.outs[i + 1]) ? `&${v}` : v))].join(', ')})`, t };
      }
      return fail(`${fname} can’t become C here.`);
    }
    /** An array argument: a variable's name, or a temporary holding the expression. */
    function arrayRef(e: Expr, allowScalar = false): string {
      const t = typeOf(e);
      if (scalar(t) && allowScalar) return scal(e).code;
      if (e.k === 'id' && vars.has(e.name)) return e.name;
      const v = fresh(t);
      assignArray(v, e, t);
      return v;
    }
    function assignArray(target: string, e: Expr, t: Ty) {
      const N = n(t);
      if (e.k === 'index' && e.of.k === 'id' && (e.of.name === 'zeros' || e.of.name === 'ones') && !vars.has(e.of.name)) { out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${e.of.name === 'ones' ? '1.0' : '0.0'};`); return; }
      if (e.k === 'matrix') { e.rows.forEach((row, i) => row.forEach((x, j) => out(`${target}[${i + j * t.r}] = ${cast(t, scal(x))};`))); return; }
      if (e.k === 'post' && (e.op === "'" || e.op === ".'")) {
        const src = arrayRef(e.a), s = typeOf(e.a);
        out(`for (int j = 0; j < ${s.c}; j++) for (int i = 0; i < ${s.r}; i++) ${target}[j + i * ${s.c}] = ${src}[i + j * ${s.r}];`);
        return;
      }
      if (e.k === 'bin' && e.op === '*' && !scalar(typeOf(e.a)) && !scalar(typeOf(e.b))) {
        const A = arrayRef(e.a), B = arrayRef(e.b), at = typeOf(e.a), bt = typeOf(e.b);
        const into = A === target || B === target ? fresh(t) : target;
        const fx = isFx(t) ? typeOf(e) : null;
        out(`for (int j = 0; j < ${bt.c}; j++) {`);
        out(`  for (int i = 0; i < ${at.r}; i++) {`);
        out(fx ? '    fxw_t s = 0;' : `    double s = 0.0;`);
        out(`    for (int p = 0; p < ${at.c}; p++) s += ${fx ? '(fxw_t)' : ''}${A}[i + p * ${at.r}] * ${fx ? '(fxw_t)' : ''}${B}[p + j * ${bt.r}];`);
        out(`    ${into}[i + j * ${at.r}] = ${fx ? cast(t, { code: 's', t: fx }) : cast(t, { code: 's', t: { cls: 'double', r: 1, c: 1 } })};`);
        out('  }');
        out('}');
        if (into !== target) out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${into}[k];`);
        return;
      }
      if (e.k === 'index' && e.of.k === 'id' && fns.has(e.of.name) && !vars.has(e.of.name)) {
        const g = make(e.of.name, e.args.map(typeOf), [...from, name]);
        out(`${g.cname}(${[...e.args.map((x) => arrayRef(x, true)), target, ...g.outs.slice(1).map((o) => (scalar(o) ? `&${fresh(o)}` : fresh(o)))].join(', ')});`);
        return;
      }
      if (e.k === 'id' && vars.has(e.name)) { out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t, scal(e, 'k'))};`); return; }
      // Element-wise: one loop over the elements.
      const x = scal(e, 'k');
      out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t, x)};`);
    }
    const cast = (to: Ty | Cls, x: { code: string; t: Ty }): string => {
      if (typeof to !== 'string' && isFx(to)) return toFx(to.fx!, x);
      const cls = typeof to === 'string' ? to : to.cls;
      if (isFx(x.t)) return cast(cls, { code: `ldexp((double)${x.code}, ${-x.t.fx!.fl})`, t: { cls: 'double', r: 1, c: 1 } });
      return isInt(cls) && !isInt(x.t.cls) ? satCall(cls, x.code) : cls === x.t.cls || (cls === 'double' && x.t.cls !== 'single') ? x.code : `(${CTYPE[cls]})${x.code}`;
    };

    // ——— Statements ———
    function stmt(st: Stmt) {
      switch (st.s) {
        case 'assign': {
          if (st.op !== '=') { const to = st.to[0]; return stmt({ ...st, op: '=', e: { k: 'bin', op: st.op[0], a: to, b: st.e } }); }
          if (st.to.length > 1) {
            // [a, b] = f(…)
            if (st.e.k !== 'index' || st.e.of.k !== 'id' || !fns.has(st.e.of.name)) fail('several outputs only from a function of the script.');
            const call0 = st.e as Extract<Expr, { k: 'index' }>, g = make((call0.of as { name: string }).name, call0.args.map(typeOf), [...from, name]);
            const targets = st.to.map((t, i) => { if (t.k !== 'id') fail('outputs go to plain variables here.'); return t.k === 'id' && t.name === '~' ? fresh(g.outs[i]) : (declare((t as { name: string }).name, g.outs[i]), (t as { name: string }).name); });
            out(`${g.cname}(${[...call0.args.map((x) => arrayRef(x, true)), ...targets.map((v, i) => (scalar(g.outs[i]) ? `&${v}` : v))].join(', ')});`);
            return;
          }
          const to = st.to[0];
          if (to.k === 'id') {
            const t = typeOf(st.e), keep = declare(to.name, t);
            if (scalar(t)) out(`${to.name} = ${cast(keep, scal(st.e))};`);
            else assignArray(to.name, st.e, keep);
            return;
          }
          if (to.k === 'index' && to.of.k === 'id' && to.args.length === 1 && to.args[0].k === 'colon' && !to.brace) {
            // y(:) = …: y keeps its type and size (M524: how a fixed-point accumulator keeps its word).
            const v = vars.get(to.of.name), t = typeOf(st.e);
            if (!v) fail(`${to.of.name} must be made before ${to.of.name}(:) = … sets it.`);
            if (!scalar(t) && n(t) !== n(v!)) fail(`${to.of.name}(:) = takes ${n(v!)} values or one (here ${sizeText(t)}).`);
            if (scalar(v!)) out(`${to.of.name} = ${cast(v!, scal(st.e))};`);
            else assignArray(to.of.name, st.e, v!);
            return;
          }
          if (to.k === 'index' && to.of.k === 'id') {
            const v = vars.get(to.of.name);
            if (!v) fail(`${to.of.name} must be made (with zeros or an example input) before its elements are set: arrays have a fixed size in C.`);
            if (!scalar(typeOf(st.e))) fail(`${to.of.name}(…) = takes one number here.`);
            out(`${idx(to.of.name, to.args, v!, null)} = ${cast(v!, scal(st.e))};`);
            return;
          }
          return fail('only variables and their elements can be assigned here.');
        }
        case 'expr': {
          if (st.e.k === 'index' && st.e.of.k === 'id' && (st.e.of.name === 'fprintf' || st.e.of.name === 'printf')) {
            const [fmt, ...rest] = st.e.args;
            if (fmt?.k !== 'str') fail('fprintf needs its format as text first.');
            const text = (fmt as { v: string }).v.replace(/%(-?\d*)(\.\d+)?[di]/g, (_, w, p) => `%${w}${p ?? '.0'}f`).replace(/"/g, '\\"');
            helpers.add('stdio');
            out(`printf("${text}"${rest.map((x) => `, (double)${scal(x).code}`).join('')});`);
            return;
          }
          if (st.e.k === 'index' && st.e.of.k === 'id' && fns.has(st.e.of.name)) { const g = make(st.e.of.name, st.e.args.map(typeOf), [...from, name]); out(`${g.cname}(${[...st.e.args.map((x) => arrayRef(x, true)), ...g.outs.map((o) => (scalar(o) ? `&${fresh(o)}` : fresh(o)))].join(', ')});`); return; }
          return fail('a line here must assign a value (y = …), call a function of the script or print with fprintf.');
        }
        case 'if': {
          st.arms.forEach((arm, i) => { out(`${i ? '} else if' : 'if'} (${scal(arm.cond).code}) {`); depth++; arm.body.forEach(stmt); depth--; });
          if (st.other) { out('} else {'); depth++; st.other.forEach(stmt); depth--; }
          out('}');
          return;
        }
        case 'for': {
          if (st.v.k !== 'id' || st.e.k !== 'range') fail('for loops go over a range here: for i = a:b or a:step:b.');
          const v = (st.v as { name: string }).name, rg = st.e as Extract<Expr, { k: 'range' }>;
          const step = rg.step ? (rg.step.k === 'num' ? rg.step.v : rg.step.k === 'un' && rg.step.op === '-' && rg.step.a.k === 'num' ? -rg.step.a.v : NaN) : 1;
          if (!Number.isFinite(step) || step === 0) fail('a for loop’s step must be a number known before the code runs.');
          declare(v, { cls: 'double', r: 1, c: 1 });
          const a = scal(rg.from).code, b = scal(rg.to).code;
          out(`for (${v} = ${a}; ${v} ${step > 0 ? '<=' : '>='} ${b}; ${v} += ${lit(step)}) {`);
          depth++; st.body.forEach(stmt); depth--;
          out('}');
          return;
        }
        case 'while': out(`while (${scal(st.cond).code}) {`); depth++; st.body.forEach(stmt); depth--; out('}'); return;
        case 'break': out('break;'); return;
        case 'continue': out('continue;'); return;
        case 'return': out('goto done;'); usesDone = true; return;
        case 'switch': {
          if (!scalar(typeOf(st.e))) fail('switch on a number here.');
          const sv = scal(st.e).code;
          st.cases.forEach((c, i) => { out(`${i ? '} else if' : 'if'} (${sv} == ${scal(c.match).code}) {`); depth++; c.body.forEach(stmt); depth--; });
          if (st.other) { out(st.cases.length ? '} else {' : 'if (1) {'); depth++; st.other.forEach(stmt); depth--; }
          out('}');
          return;
        }
        default: return fail(`${st.s} can’t become C here.`);
      }
    }
    let usesDone = false;
    def.body.forEach(stmt);
    for (const o of def.outs) { const t = vars.get(o); if (!t) fail(`the output ${o} is never given a value.`); f.outs.push(t!); }
    if (usesDone) f.code.push('done:;');
    order.push(f);
    return f;
  }

  const main = make(entry, args, []);
  const sig = (f: Fn, proto: boolean) => {
    const oneScalar = f.outs.length === 1 && scalar(f.outs[0]);
    const ins = f.def.params.map((p, i) => (scalar(f.args[i]) ? `${cty(f.args[i])} ${p}` : `const ${cty(f.args[i])} ${p}[${n(f.args[i])}]`));
    const outs = oneScalar ? [] : f.def.outs.map((o, i) => (scalar(f.outs[i]) ? `${cty(f.outs[i])} *${o}` : `${cty(f.outs[i])} ${o}[${n(f.outs[i])}]`));
    return `${f === main || !proto ? '' : 'static '}${oneScalar ? cty(f.outs[0]) : 'void'} ${f.cname}(${[...ins, ...outs].join(', ') || 'void'})`;
  };
  const body = (f: Fn) => {
    const oneScalar = f.outs.length === 1 && scalar(f.outs[0]);
    const lines = [`/* ${f.def.outs.length ? `[${f.def.outs.join(', ')}] = ` : ''}${f.def.name}(${f.def.params.map((p, i) => `${p}: ${tyText(f.args[i])} ${sizeText(f.args[i])}`).join(', ')}${f.outs.some(isFx) || f.args.some(isFx) ? ' (fixed point: each value is its stored whole number; the value is that × 2^-fraction)' : ''}${f.outs.map((o, i) => (isFx(o) ? `; ${f.def.outs[i]}: ${tyText(o)}` : '')).join('')}) */`, `${f === main ? '' : 'static '}${sig(f, false)} {`];
    for (const [v, t] of f.decls) {
      if (!oneScalar && f.def.outs.includes(v)) continue;
      lines.push(`  ${cty(t)} ${v}${scalar(t) ? ' = 0' : `[${n(t)}]`};`);
    }
    // Scalar outputs passed by pointer: worked on in a local of the same name, copied out at the end.
    const ptrOuts = oneScalar ? [] : f.def.outs.filter((_, i) => scalar(f.outs[i]));
    const code = f.code.map((l) => ptrOuts.reduce((s, o) => s.replace(new RegExp(`\\b${o}\\b`, 'g'), `(*${o})`), l));
    lines.push(...code);
    if (oneScalar) lines.push(`  return ${f.def.outs[0]};`);
    lines.push('}');
    return lines.join('\n');
  };
  const guard = `${entry.toUpperCase()}_H`;
  const inc = ['#include <math.h>', '#include <stdbool.h>', '#include <stdint.h>', ...(helpers.has('stdio') ? ['#include <stdio.h>'] : [])];
  const help: string[] = [];
  for (const c of Object.keys(RANGE) as Cls[]) if (helpers.has(c)) { const [lo, hi] = RANGE[c]!; help.push(`/* ${c}: rounded to the nearest (halves away from zero) and held in range, as MATLAB does */\nstatic ${CTYPE[c]} sat_${c}(double v) {\n  if (isnan(v)) return 0;\n  v = round(v);\n  if (v <= ${lo}) return (${CTYPE[c]})${lo};\n  if (v >= ${hi}) return (${CTYPE[c]})${hi};\n  return (${CTYPE[c]})v;\n}`); }
  const anyFx = helpers.has('fx_sat') || helpers.has('fx_from') || order.some((f) => [...f.args, ...f.outs, ...f.decls.values()].some(isFx));
  const fxNote = `/* Fixed point: held in range, moved to another fraction length (rounded to the nearest step, halves up, as MATLAB's
 * fi does), made from a double, divided. Worked in ${wide ? '128' : '64'}-bit integers (fxw_t); every type here has at most ${wide ? MAX_FX : NARROW_FX} bits. */`;
  if (anyFx) help.push(fxNote, `typedef ${wide ? 'fx128_t' : 'int64_t'} fxw_t;`);
  if (helpers.has('fx_sat')) help.push('static fxw_t fx_sat(fxw_t v, fxw_t lo, fxw_t hi) { return v < lo ? lo : v > hi ? hi : v; }');
  if (helpers.has('fx_shift')) help.push(`static fxw_t fx_shift(fxw_t v, int d, fxw_t lo, fxw_t hi) {
  if (d >= 0) {
    fxw_t m = (fxw_t)1 << d;
    if (v > hi / m) return hi;
    if (v < lo / m) return lo;
    return v * m;
  }
  fxw_t m = (fxw_t)1 << -d, t = v + m / 2, q = t / m;
  if (t % m != 0 && t < 0) q -= 1;
  return fx_sat(q, lo, hi);
}`);
  if (helpers.has('fx_div')) help.push(`/* a / b as the stored number of a type s fraction bits finer than a's less b's: rounded to the nearest (halves up) */
static fxw_t fx_div(fxw_t a, fxw_t b, int s, fxw_t lo, fxw_t hi) {
  if (b == 0) return a > 0 ? hi : a < 0 ? lo : 0;
  if (b < 0) { a = -a; b = -b; }
  if (s >= 0) a *= (fxw_t)1 << s; else b *= (fxw_t)1 << -s;
  fxw_t t = 2 * a + b, m = 2 * b, q = t / m;
  if (t % m != 0 && t < 0) q -= 1;
  return fx_sat(q, lo, hi);
}`);
  if (helpers.has('fx_from')) help.push(`static fxw_t fx_from_double(double x, int fl, fxw_t lo, fxw_t hi) {
  if (isnan(x)) return 0;
  double s = floor(ldexp(x, fl) + 0.5);
  if (s <= (double)lo) return lo;
  if (s >= (double)hi) return hi;
  return (fxw_t)s;
}`);
  if (helpers.has('mod')) help.push('/* mod: the remainder with the sign of the divisor */\nstatic double mod_d(double a, double b) {\n  if (b == 0.0) return a;\n  double r = fmod(a, b);\n  return (r != 0.0 && ((r < 0) != (b < 0))) ? r + b : r;\n}');
  if (helpers.has('rem')) help.push('/* rem: the remainder with the sign of the dividend */\nstatic double rem_d(double a, double b) { return b == 0.0 ? a : fmod(a, b); }');
  const others = order.filter((f) => f !== main);
  const c = [`/* ${entry}.c: generated by Hyperion from ${entry}.m. Plain C99, no memory allocated while it runs.`, ' * Arrays are stored column by column, as in Hyperion: element (i, j) of an r-row matrix is x[(i-1) + (j-1)*r]. */', ...inc, `#include "${entry}.h"`, '', ...help.flatMap((h) => [h, '']), ...others.map((f) => `${sig(f, true)};`), ...(others.length ? [''] : []), ...order.flatMap((f) => [body(f), ''])].join('\n');
  const wideH = wide ? ['#if !defined(__SIZEOF_INT128__)', '#error "this code uses fixed-point types over 62 bits: it needs 128-bit integers (GCC or Clang on a 64-bit computer); keep every type at 62 bits for small chips"', '#endif', '__extension__ typedef __int128 fx128_t;', '__extension__ typedef unsigned __int128 ufx128_t;', ''] : [];
  const h = [`/* ${entry}.h: generated by Hyperion */`, `#ifndef ${guard}`, `#define ${guard}`, '#include <stdbool.h>', '#include <stdint.h>', '', ...wideH, `${sig(main, false)};`, '', `#endif /* ${guard} */`, ''].join('\n');
  return { c, h };
}
