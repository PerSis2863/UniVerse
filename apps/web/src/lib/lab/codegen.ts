import type { Expr, FnDef, Stmt } from './parse';
import { accType, bestFl, fmOf, limits, MODES, plain, productType, PS0, RMS, stored, sumType, type Mode, type Nt, type Om, type PS, type Rm } from './fixed';

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
// M527: up to 62 bits the work is in int64_t; wider types (to 126 bits) are held and worked in 128-bit integers, so a
// sum, a product or an alignment still never overflows. M530: fx128_t is __int128 where the compiler has it (GCC and
// Clang on 64-bit computers) and otherwise two 64-bit halves with their own arithmetic (small chips), the same answers;
// wide code is written with the fxw_ operations so it builds either way.
const NARROW_FX = 62, MAX_FX = 126;
const fxC = (t: Nt) => (t.wl > 64 ? 'fx128_t' : `${t.signed ? '' : 'u'}int${t.wl <= 8 ? 8 : t.wl <= 16 ? 16 : t.wl <= 32 ? 32 : 64}_t`);
/** M530: a stored type past int64_t's reach (unsigned, 63 or 64 bits). */
const ufx = (t: Nt) => !t.signed && t.wl > 62 && t.wl <= 64;
const RM_C: Record<Rm, string> = { Nearest: 'FX_NEAREST', Floor: 'FX_FLOOR', Ceiling: 'FX_CEILING', Zero: 'FX_ZERO', Round: 'FX_ROUND', Convergent: 'FX_CONVERGENT' };
const OM_C: Record<Om, string> = { Saturate: 'FX_SATURATE', Wrap: 'FX_WRAP' };
const fmC = (t: Nt) => `${RM_C[t.rm ?? 'Nearest']}, ${OM_C[t.om ?? 'Saturate']}`;
const cty = (t: Ty) => (isFx(t) ? fxC(t.fx!) : CTYPE[t.cls]);
const sameFx = (a: Ty, b: Ty) => !!a.fx && !!b.fx && a.fx.signed === b.fx.signed && a.fx.wl === b.fx.wl && a.fx.fl === b.fx.fl;
const fxText = (t: Nt) => `fi(${t.signed ? 'signed' : 'unsigned'}, ${t.wl} bits, ${t.fl} fraction${t.rm && t.rm !== 'Nearest' ? `, ${t.rm}` : ''}${t.om === 'Wrap' ? ', Wrap' : ''})`;
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
/** M531: past 128 bits a matrix division is worked in fxb_t (32-bit pieces); this many bits at most (M536: 4096 before,
 * now long division on the pieces keeps it quick) and this much working memory at most; past 64 KB it is static. */
const FXB_MAX = 65536, FXB_MEM = 16 * 1024 * 1024, FXB_STACK = 64 * 1024;
/** M531: the bits an exact matrix division's working needs. Every number the elimination keeps is a minor of [A | B]
 * (of AᵀA and AᵀB for least squares), at most Hadamard's bound D(k) for order k; a step's difference before its exact
 * division is the old pivot times the new number (D(k)·D(k+1)), and the products inside it may wrap (the working wraps
 * round, so only the difference must fit). Then det·x scaled by the answer's extra fraction bits. */
export function solveBits(a: Nt, b: Nt, R: number, N: number, s: number, ls: boolean): number {
  const mag = (t: Nt) => (t.signed ? t.wl - 1 : t.wl), lr = Math.log2(Math.max(1, R));
  const la = ls ? lr + 2 * mag(a) : mag(a), lb = ls ? lr + mag(a) + mag(b) : mag(b);
  const D = (k: number) => (k === 0 ? 0 : (k / 2) * Math.log2(k) + (k - 1) * la + Math.max(la, lb));
  let need = Math.max(D(N) + Math.max(s, 0), D(N) + Math.max(-s, 0), ls ? lr + 2 * Math.max(mag(a), mag(b)) : 0);
  for (let k = 0; k < N; k++) need = Math.max(need, D(k) + D(k + 1));
  return Math.ceil(need) + 2;
}
/** M540: lsqminnorm's tolerance for fi values, exact: a column of A counts when the part of it the earlier counted columns
 * don't explain is longer than tol (QR's |R(k,k)|), i.e. on G = AᵀA in stored units pivot / previous pivot > tol² · 2^(2·fa).
 * tol is kept to 16 significant bits: tol² · 2^(2·fa) = mt2 · 2^sh. */
export function tolParts(tol: number, fa: number): { mt2: number; sh: number } {
  if (!(tol > 0)) return { mt2: 0, sh: 0 };
  const e = Math.floor(Math.log2(tol));
  let mt = Math.round(tol * 2 ** (15 - e)), ex = e - 15;
  while (mt % 2 === 0) { mt /= 2; ex++; } // (a power of two needs no multiplier)
  return { mt2: mt * mt, sh: 2 * ex + 2 * fa };
}
/** M535: the bits lsqminnorm's working needs: G = AᵀA and C = AᵀB, H = G_PᵀG_P (P at most N columns), the minors of
 * [H | C_P] (Hadamard), and each answer's numerator G_P·(det·z), scaled by the answer's extra fraction bits. M540: with a
 * tolerance, G's pivots compared with mt2 · 2^sh times the one before. */
export function minNormBits(a: Nt, b: Nt, R: number, N: number, s: number, tol?: { mt2: number; sh: number }): number {
  const mag = (t: Nt) => (t.signed ? t.wl - 1 : t.wl), lr = Math.log2(Math.max(1, R)), ln = Math.log2(Math.max(1, N));
  const lg = lr + 2 * mag(a), lc = lr + mag(a) + mag(b), lh = ln + 2 * lg;
  const D = (k: number) => (k === 0 ? 0 : (k / 2) * Math.log2(k) + (k - 1) * lh + Math.max(lh, lc));
  let need = Math.max(lh, lc, ln + lg + D(N) + Math.max(s, 0), D(N) + Math.max(-s, 0));
  for (let k = 0; k < N; k++) need = Math.max(need, D(k) + D(k + 1));
  if (tol) { const g = (N / 2) * Math.log2(Math.max(1, N)) + N * lg; need = Math.max(need, g + Math.max(-tol.sh, Math.log2(tol.mt2 + 1) + Math.max(tol.sh, 0)) + 1); }
  return Math.ceil(need) + 2;
}
/** M527: a ./ b's own type: the larger word, the fraction a's minus b's (divide(T, a, b) chooses another). */
export const quotientType = (a: Nt, b: Nt): Nt => ({ signed: a.signed || b.signed, wl: Math.max(a.wl, b.wl), fl: a.fl - b.fl, ...fmOf(a, b) });
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

export function generate(fns0: Map<string, FnDef>, entry: string, args: Ty[]): { c: string; h: string } {
  const fns = new Map([...fns0].map(([k, d]) => [k, cSafe(d)]));
  // M530: the wide way of writing is chosen before writing: a first pass finds out whether anything needs it.
  const first = emit(fns, entry, args, false);
  return first.wide ? emit(fns, entry, args, true) : first;
}

// M534: names the C itself uses (loop counters, temporaries, helpers) and C's own words. A variable of the script
// with one of these names is renamed in the C (a _ added) so it can't clash: an output called i used to turn the
// loops' own i into (*i).
const C_WORDS = new Set('auto bool break case char const continue default do double else enum extern false float for goto if inline int long register restrict return short signed sizeof static struct switch true typedef union unsigned void volatile while abs exp log sqrt round floor ceil fabs fmod pow sin cos tan isnan main NULL'.split(' '));
const C_OWN = /^([ijk]|t\d+|s[ijc]|sv_\w*|mp_\w*|fx\w*_\w*|fx128_t|sat_\w+|int\d+_t|uint\d+_t)$/;
export const cClash = (v: string) => C_WORDS.has(v) || C_OWN.test(v);

function cSafe(def: FnDef): FnDef {
  const vars = new Set([...def.params, ...def.outs]);
  const root = (e: Expr): void => { if (e.k === 'id') vars.add(e.name); else if (e.k === 'index' || e.k === 'field') root(e.of); };
  const seen = (b: Stmt[]): void => b.forEach((st) => {
    if (st.s === 'assign') st.to.forEach(root);
    else if (st.s === 'for') { root(st.v); seen(st.body); }
    else if (st.s === 'if') { st.arms.forEach((a) => seen(a.body)); if (st.other) seen(st.other); }
    else if (st.s === 'while' || st.s === 'do') seen(st.body);
    else if (st.s === 'switch') { st.cases.forEach((c) => seen(c.body)); if (st.other) seen(st.other); }
    else if (st.s === 'try') { if (st.id) vars.add(st.id); seen(st.body); seen(st.handler); }
    else if (st.s === 'global') st.names.forEach((v) => vars.add(v));
  });
  seen(def.body);
  const ren = new Map<string, string>();
  for (const v of vars) {
    if (!cClash(v)) continue;
    let w = `${v}_`;
    while (vars.has(w) || cClash(w) || [...ren.values()].includes(w)) w += '_';
    ren.set(v, w);
  }
  if (!ren.size) return def;
  const to = (v: string) => ren.get(v) ?? v;
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const o = x as Record<string, unknown>;
    if (o.k === 'id') return { ...o, name: to(o.name as string) };
    if (o.k === 'field') return { ...o, of: walk(o.of), name: typeof o.name === 'string' ? o.name : walk(o.name) };
    if (o.k === 'lambda' || o.k === 'handle') return o;
    const r: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(o)) r[key] = key === 'id' && typeof val === 'string' ? to(val) : key === 'names' && o.s === 'global' ? (val as string[]).map(to) : walk(val);
    return r;
  };
  return { ...def, params: def.params.map(to), outs: def.outs.map(to), body: walk(def.body) as Stmt[] };
}

/** M530: fixed-point C written for 64-bit work (plain operators) or wide work (the fxw_ operations). */
function fxEmit(W: boolean) {
  const E = {
    W,
    zero: W ? 'fxw_of(0)' : '0',
    /** A stored value as working fxw_t. */
    w: (code: string, t: Nt) => (!W ? `(fxw_t)${code}` : t.wl > 64 ? code : ufx(t) ? `fxw_ofu(${code})` : `fxw_of(${code})`),
    /** Working fxw_t back as the stored type. */
    to: (code: string, t: Nt) => (!W ? `(${fxC(t)})(${code})` : t.wl > 64 ? code : ufx(t) ? `(uint64_t)fxw_lou(${code})` : `(${fxC(t)})fxw_lo64(${code})`),
    add: (a: string, b: string) => (W ? `fxw_add(${a}, ${b})` : `${a} + ${b}`),
    sub: (a: string, b: string) => (W ? `fxw_sub(${a}, ${b})` : `${a} - ${b}`),
    mul: (a: string, b: string) => (W ? `fxw_mul(${a}, ${b})` : `${a} * ${b}`),
    div: (a: string, b: string) => (W ? `fxw_div(${a}, ${b})` : `${a} / ${b}`),
    neg: (a: string) => (W ? `fxw_neg(${a})` : `-${a}`),
    shl: (a: string, d: number) => (W ? `fxw_shl(${a}, ${d})` : `${a} * ${p2(d)}`),
    cmp: (op: string, a: string, b: string) => (W ? `(fxw_cmp(${a}, ${b}) ${op} 0)` : `(${a} ${op} ${b})`),
    /** A whole number as working fxw_t, exact. */
    k: (v: number): string => {
      if (!W) return bigX(v);
      if (Math.abs(v) <= 2 ** 62) return `fxw_of(${big(v)})`;
      const e = Math.ceil(Math.log2(Math.abs(v))) - 53;
      return `fxw_shl(fxw_of(${big(v / 2 ** e)}), ${e})`;
    },
    /** A stored whole number written as the stored type's value. */
    lit: (v: number, t: Nt) => (!W ? bigX(v) : t.wl > 64 ? E.k(v) : big(v)),
    lim: (t: Nt): [string, string] => {
      if (!W) return lim(t);
      if (t.wl <= 52) return limits(t).map((v) => `fxw_of(${big(v)})`) as [string, string];
      return t.signed ? [`fxw_neg(fxw_p2(${t.wl - 1}))`, `fxw_sub(fxw_p2(${t.wl - 1}), fxw_of(1))`] : ['fxw_of(0)', `fxw_sub(fxw_p2(${t.wl}), fxw_of(1))`];
    },
    /** A stored value as a double (the stored whole number). */
    dbl: (code: string, t: Nt) => (W ? `fxw_dbl(${E.w(code, t)})` : `(double)${code}`),
  };
  return E;
}

function emit(fns: Map<string, FnDef>, entry: string, args: Ty[], W: boolean): { c: string; h: string; wide: boolean } {
  const helpers = new Set<string>(), made = new Map<string, Fn>(), order: Fn[] = [];
  let wide = W; // M527: some fixed-point work needs 128-bit integers
  let fxbK = 0; // M531: the 32-bit pieces of fxb_t, when a matrix division needs more than 128 bits
  let tmp = 0;
  const E = fxEmit(W);

  function make(name: string, argTypes: Ty[], from: string[]): Fn {
    const def = fns.get(name);
    if (!def) throw new CodegenError(`There’s no function ${name} in the script.`);
    if (from.includes(name)) throw new CodegenError(`${name} calls itself: recursion can’t become fixed-size C here.`);
    if (def.varargin || def.varargout) throw new CodegenError(`${name}: varargin and varargout can’t become C here.`);
    if (argTypes.length !== def.params.length) throw new CodegenError(`${name} takes ${def.params.length} inputs; ${argTypes.length} examples were given.`);
    const key = `${name}(${argTypes.map((t) => `${t.cls}${t.fx ? `<${+t.fx.signed},${t.fx.wl},${t.fx.fl},${t.fx.rm ?? ''},${t.fx.om ?? ''},${t.fx.ps ? Object.values(t.fx.ps).join('/') : ''}>` : ''}${sizeText(t)}`).join(',')})`;
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
    // M530: fimath settings known when generating: F = fimath(…) is kept here (no C), fi(x, s, w, f, F) reads it.
    const fmVars = new Map<string, Pick<Nt, 'rm' | 'om' | 'ps'>>();
    const isFimathCall = (e: Expr): e is Extract<Expr, { k: 'index' }> => e.k === 'index' && e.of.k === 'id' && e.of.name === 'fimath' && !vars.has('fimath') && !fns.has('fimath');
    function fmArgs(args: Expr[]): Pick<Nt, 'rm' | 'om' | 'ps'> {
      const out: Pick<Nt, 'rm' | 'om' | 'ps'> = {};
      const ps = (): PS => (out.ps = { ...(out.ps ?? PS0) });
      const LEN: Record<string, keyof PS> = { productwordlength: 'pwl', productfractionlength: 'pfl', maxproductwordlength: 'pmax', sumwordlength: 'swl', sumfractionlength: 'sfl', maxsumwordlength: 'smax' };
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (isFimathCall(a)) { Object.assign(out, fmArgs(a.args)); continue; }
        if (a.k === 'id' && fmVars.has(a.name)) { Object.assign(out, fmVars.get(a.name)); continue; }
        const v = args[i + 1];
        if (a.k !== 'str' || !v) fail("fimath here: 'RoundingMethod', 'OverflowAction', 'ProductMode', 'SumMode', their lengths and 'CastBeforeSum', written in the code.");
        const key = (a as { v: string }).v.toLowerCase();
        i++;
        if (LEN[key] || key === 'castbeforesum') {
          const x = v.k === 'id' && (v.name === 'true' || v.name === 'false') ? +(v.name === 'true') : literal(v);
          if (x === null) fail(`fimath’s ${(a as { v: string }).v} is a number written in the code.`);
          (ps() as unknown as Record<string, unknown>)[LEN[key] ?? 'cbs'] = key === 'castbeforesum' ? !!x : x;
          continue;
        }
        if (v.k !== 'str') fail(`fimath’s ${(a as { v: string }).v} is text written in the code.`);
        const val = (v as { v: string }).v.toLowerCase();
        if (key === 'roundingmethod') { const rm = RMS.find((r) => r.toLowerCase() === val) ?? (val === 'fix' ? 'Zero' : undefined); if (!rm) fail(`RoundingMethod is one of ${RMS.join(', ')}.`); out.rm = rm; }
        else if (key === 'overflowaction') { if (val !== 'saturate' && val !== 'wrap') fail('OverflowAction is Saturate or Wrap.'); out.om = val === 'wrap' ? 'Wrap' : 'Saturate'; }
        else if (key === 'productmode' || key === 'summode') { const m = MODES.find((x) => x.toLowerCase() === val); if (!m) fail(`${key === 'productmode' ? 'ProductMode' : 'SumMode'} is one of ${MODES.join(', ')}.`); if (key === 'productmode') ps().pm = m as Mode; else ps().sm = m as Mode; }
        else fail(`fimath’s ${(a as { v: string }).v} can’t become C here.`);
      }
      return out;
    }
    const isSolve = (e: Expr): boolean => {
      if (e.k === 'bin' && (e.op === '\\' || e.op === '/')) return (isFx(typeOf(e.a)) || isFx(typeOf(e.b))) && !scalar(typeOf(e.op === '\\' ? e.a : e.b));
      if (e.k === 'index' && e.of.k === 'id' && e.of.name === 'lsqminnorm' && !vars.has(e.of.name) && !fns.has(e.of.name)) return true;
      return e.k === 'index' && e.of.k === 'id' && (e.of.name === 'mldivide' || e.of.name === 'mrdivide') && !vars.has(e.of.name) && !fns.has(e.of.name) && e.args.length >= 2 && !scalar(typeOf(e.args[e.of.name === 'mldivide' ? 0 : 1])) && isFx(typeOf(e));
    };
    /** [A, B, left, smallest] of A \ B, B / A, mldivide(A, B, T), mrdivide(B, A, T) or lsqminnorm(A, B, T) (M535). */
    const solveArgs = (e: Expr): [Expr, Expr, boolean, boolean] => {
      if (e.k === 'bin') return e.op === '\\' ? [e.a, e.b, true, false] : [e.b, e.a, false, false];
      const x = e as Extract<Expr, { k: 'index' }>, name = (x.of as { name: string }).name;
      return name === 'mrdivide' ? [x.args[1], x.args[0], false, false] : [x.args[0], x.args[1], true, name === 'lsqminnorm'];
    };
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
      const nt: Nt = { signed: like.signed, wl: like.wl, fl: bestFl([v!], like.signed, like.wl), ...fmOf(like, like) };
      return { nt, code: () => E.lit(stored(v!, nt), nt) };
    }
    const fxOf = (side: { nt: Nt; code: (k: string | null) => string }, k: string | null) => ({ code: side.code(k), t: { cls: 'fixed' as Cls, r: 1, c: 1, fx: side.nt } });
    /** M532: one step of a running sum (sum of a vector, a matrix product) in type acc, as X.accStep: acc is the working
     * value, x a stored one of type xt; the new working value. */
    function accStepC(acc: string, x: string, xt: Nt, at: Nt): string {
      const d = at.fl - xt.fl, xw = E.w(x, xt);
      if (!at.ps || at.ps.sm === 'FullPrecision') return E.add(acc, d > 0 ? E.shl(xw, d) : xw);
      const [lo, hi] = E.lim(at);
      if (at.ps.cbs) { helpers.add('fx_fit'); return `fx_fit(${E.add(acc, E.w(toFx(at, { code: x, t: fxTy(xt) }), at))}, ${lo}, ${hi}, ${OM_C[at.om ?? 'Saturate']})`; }
      helpers.add('fx_shift');
      const fl = Math.max(at.fl, xt.fl), up = (v: string, by: number) => (by ? E.shl(v, by) : v);
      return `fx_shift(${E.add(up(acc, fl - at.fl), up(xw, fl - xt.fl))}, ${at.fl - fl}, ${lo}, ${hi}, ${fmC(at)})`;
    }
    function fxBin(e: Extract<Expr, { k: 'bin' }>, a: Ty, b: Ty): { t: Ty; code: (k: string | null) => string } {
      const like = (isFx(a) ? a : b).fx!, A = fxSide(e.a, a, like), B = fxSide(e.b, b, like);
      const shape = scalar(a) ? b : a;
      if (!scalar(a) && !scalar(b) && !['*', '\\', '/'].includes(e.op) && (a.r !== b.r || a.c !== b.c)) fail(`the sizes don’t agree: ${sizeText(a)} ${e.op} ${sizeText(b)}.`);
      const at = (side: typeof A, fl: number, k: string | null) => { const d = fl - side.nt.fl, x = E.w(side.code(k), side.nt); return d ? E.shl(x, d) : x; };
      if (CMP[e.op]) {
        if (!scalar(a) || !scalar(b)) fail(`compare single numbers in conditions (here ${sizeText(a)} ${e.op} ${sizeText(b)}).`);
        if (W && (e.op === '&&' || e.op === '||' || e.op === '&' || e.op === '|')) fail(`${e.op} on fixed-point values over 62 bits: compare them first (x ~= 0).`);
        const fl = Math.max(A.nt.fl, B.nt.fl);
        return { t: { cls: 'logical', r: 1, c: 1 }, code: (k) => E.cmp(CMP[e.op], at(A, fl, k), at(B, fl, k)) };
      }
      if (e.op === '+' || e.op === '-') {
        const nt = sumType(A.nt, B.nt), t = fxTy(nt, shape.r, shape.c), op = e.op === '+' ? E.add : E.sub;
        if (!nt.ps || nt.ps.sm === 'FullPrecision') return { t, code: (k) => E.to(op(at(A, nt.fl, k), at(B, nt.fl, k)), nt) };
        // M532: CastBeforeSum: each side into the sum's type, then the sum held or wrapped there; else the full sum put into it.
        const full = sumType(plain(A.nt), plain(B.nt)), [lo, hi] = E.lim(nt);
        if (nt.ps.cbs) { helpers.add('fx_fit'); return { t, code: (k) => E.to(`fx_fit(${op(E.w(toFx(nt, fxOf(A, k)), nt), E.w(toFx(nt, fxOf(B, k)), nt))}, ${lo}, ${hi}, ${OM_C[nt.om ?? 'Saturate']})`, nt) }; }
        fxTy(full);
        return { t, code: (k) => toFx(nt, { code: E.to(op(at(A, full.fl, k), at(B, full.fl, k)), full), t: fxTy(full) }) };
      }
      if (e.op === '.*' || (e.op === '*' && (scalar(a) || scalar(b)))) {
        const nt = productType(A.nt, B.nt), t = fxTy(nt, shape.r, shape.c), full = productType(plain(A.nt), plain(B.nt)), ft = fxTy(full);
        // M532: a ProductMode other than full precision: the full product put into the narrower type.
        return { t, code: (k) => toFx(nt, { code: E.to(E.mul(E.w(A.code(k), A.nt), E.w(B.code(k), B.nt)), full), t: ft }) };
      }
      if (e.op === './' || (e.op === '/' && scalar(b))) {
        const nt = quotientType(A.nt, B.nt);
        return { t: fxTy(nt, shape.r, shape.c), code: (k) => fxDivCode(nt, A, B, k) };
      }
      if (e.op === '\\' && scalar(a)) {
        const nt = quotientType(B.nt, A.nt);
        return { t: fxTy(nt, shape.r, shape.c), code: (k) => fxDivCode(nt, B, A, k) };
      }
      if (e.op === '\\' || e.op === '/') return { t: solveType(e.op === '\\' ? e.a : e.b, e.op === '\\' ? e.b : e.a, e.op === '\\'), code: () => fail('a matrix division where one number is needed.') };
      if (e.op === '*') {
        if (!isFx(a) || !isFx(b)) fail('a matrix product of fixed-point values needs both fixed point.');
        if (a.c !== b.r) fail(`the inner sizes don’t agree: ${sizeText(a)} * ${sizeText(b)}.`);
        const nt = accType(productType(a.fx!, b.fx!), a.c);
        return { t: fxTy(nt, a.r, b.c), code: () => fail('a matrix product where one number is needed.') };
      }
      return fail(`${e.op} on fixed-point values can’t become C here (+ − .* * ./ \\ / and comparisons).`);
    }
    /** M538: lsqminnorm's inputs: A, B and the rest (a tolerance for plain numbers; for fi a tolerance and the answer's
     * type T, M540); 'warn' / 'nowarn' last (M540: 'warn' calls HYPERION_WARN when A's rank is short). */
    function minNormArgs(a: Expr[]): { A: Expr; B: Expr; rest: Expr[]; warn: boolean } {
      const last = a[a.length - 1], flag = a.length > 2 && last.k === 'str';
      if (flag && !['warn', 'nowarn'].includes((last as { v: string }).v.toLowerCase())) fail("lsqminnorm's last input is 'warn' or 'nowarn'.");
      const b = flag ? a.slice(0, -1) : a;
      if (b.length < 2 || b.length > 4) fail('lsqminnorm(A, B), lsqminnorm(A, B, tol) here (for fi: lsqminnorm(A, B, tol, T)).');
      return { A: b[0], B: b[1], rest: b.slice(2), warn: flag && (last as { v: string }).v.toLowerCase() === 'warn' };
    }
    /** M540: a fi lsqminnorm's answer type T and tolerance (written in the code, as tolParts' whole numbers). */
    function minNormFi(Ae: Expr, rest: Expr[]): { T?: Nt; tol?: { mt2: number; sh: number } } {
      const Ts = rest.filter((x) => isFx(typeOf(x))), tols = rest.filter((x) => !isFx(typeOf(x)));
      if (Ts.length > 1 || tols.length > 1 || Ts.some((x) => !scalar(typeOf(x)))) fail("lsqminnorm(A, B, tol, T) of fixed-point values: tol a number, T the answer's type (numerictype(s, w, f) or a fi value).");
      const v = tols.length ? literal(tols[0]) : null;
      if (tols.length && !(v !== null && v >= 0)) fail('lsqminnorm(A, B, tol) of fixed-point values: tol is a number of 0 or more written in the code (it sets how many bits the working needs).');
      return { T: Ts.length ? typeOf(Ts[0]).fx : undefined, tol: v === null ? undefined : tolParts(v, typeOf(Ae).fx!.fl) };
    }
    /** M538: lsqminnorm of plain numbers: x is N×m for A R×N and B R×m, double (single when either is). */
    function minNormType(Ae: Expr, Be: Expr, tol?: Expr): Ty {
      const a = typeOf(Ae), b = typeOf(Be);
      if ([a, b].some((x) => isInt(x.cls))) fail('lsqminnorm of whole-number types can’t become C here: make them double or single, or fi for fixed point.');
      if (b.r !== a.r) fail(`the sizes don’t agree: lsqminnorm(${sizeText(a)}, ${sizeText(b)}) needs B with ${a.r} rows.`);
      if (tol) { const tt = typeOf(tol); if (!scalar(tt) || isFx(tt)) fail('lsqminnorm(A, B, tol): tol is one plain number.'); }
      helpers.add(a.cls === 'single' || b.cls === 'single' ? 'minnorm_f' : 'minnorm_d');
      return { cls: a.cls === 'single' || b.cls === 'single' ? 'single' : 'double', r: a.c, c: b.c };
    }
    /** M538: target = lsqminnorm(A, B[, tol]) of plain numbers, through the SVD (lsq_minnorm_d / _f: one-sided Jacobi, as
     * Hyperion's pinv), into fixed-size working arrays. */
    function minNormInto(target: string, e: Extract<Expr, { k: 'index' }>, t: Ty) {
      const { A: Ae, B: Be, rest: [tol], warn } = minNormArgs(e.args), at = typeOf(Ae), bt = typeOf(Be), A = arrayRef(Ae), B = arrayRef(Be);
      const R = at.r, N = at.c, m = bt.c, big = Math.max(R, N), sm = Math.min(R, N), f = t.cls === 'single' ? 'f' : 'd', T = CTYPE[t.cls];
      const conv = (src: string, ty: Ty, len: number, name: string) => { if (ty.cls === t.cls) return src; out(`  ${T} ${name}[${len}];`); out(`  for (int k = 0; k < ${len}; k++) ${name}[k] = (${T})${src}[k];`); return name; };
      out(`{ /* lsqminnorm(A, B${tol ? ', tol' : ''}): the smallest least-squares answer, through the SVD */`);
      const a = conv(A, at, R * N, 'mn_a'), b = conv(B, bt, R * m, 'mn_b');
      out(`  ${T} mn_w[${big * sm}], mn_v[${sm * sm}];`);
      const call = `lsq_minnorm_${f}(${a}, ${R}, ${N}, ${b}, ${m}, ${tol ? `(${T})(${scal(tol).code})` : '-1'}, mn_w, mn_v, ${target})`;
      out(warn ? `  if (${call} < ${sm}) HYPERION_WARN("lsqminnorm: A's rank is below ${sm}: the smallest of many answers is given");` : `  ${call};`);
      out('}');
    }
    /** M530–M531: A \ B (left) or B / A: the answer's type and size; T chooses the type (mldivide / mrdivide's third input). */
    function solveType(Ae: Expr, Be: Expr, left: boolean, T?: Nt, mn = false, tol?: { mt2: number; sh: number }): Ty {
      const a = typeOf(Ae), b = typeOf(Be);
      if (!isFx(a) || !isFx(b)) fail('a matrix division of fixed-point values needs both fixed point (fi(…)).');
      // A \ B: A is R×N, B R×m, x N×m. B / A: A is r×c, B p×c, x p×r.
      if (left ? b.r !== a.r : b.c !== a.c) fail(`the sizes don’t agree: ${left ? `${sizeText(a)} \\ ${sizeText(b)}` : `${sizeText(b)} / ${sizeText(a)}`}.`);
      const nt = T ? { ...fmOf(b.fx!, a.fx!), ...T } : quotientType(b.fx!, a.fx!);
      const t = left ? fxTy(nt, a.c, b.c) : fxTy(nt, b.r, a.r);
      solvePlan(a, b, left, nt, mn, tol);
      return t;
    }
    /** M531: how each way of solving is worked: 'w' in fxw_t (64 bits, or 128 when the file is wide) or 'b' in fxb_t
     * (whole numbers of 32-bit pieces, past 128 bits), and the fraction bits the answers add. */
    function solvePlan(a: Ty, b: Ty, left: boolean, to: Nt, mn = false, tol?: { mt2: number; sh: number }) {
      const R = left ? a.r : a.c, N = left ? a.c : a.r, s = to.fl - b.fx!.fl + a.fx!.fl;
      const pick = (need: number, mayWiden: boolean): 'w' | 'b' => {
        if (need > FXB_MAX) fail(`a ${R}×${N} fixed-point matrix division of ${Math.max(a.fx!.wl, b.fx!.wl)}-bit values needs ${need} bits of working (at most ${FXB_MAX} here): use shorter words.`);
        if (need <= 64) return 'w';
        if (need <= 128 && (W || mayWiden)) { if (mayWiden) wide = true; return 'w'; }
        fxbK = Math.max(fxbK, Math.ceil(need / 32));
        return 'b';
      };
      if (mn) return { s, R, N, direct: null, ls: pick(minNormBits(a.fx!, b.fx!, R, N, s, tol), false) };
      const direct = R === N ? pick(solveBits(a.fx!, b.fx!, R, N, s, false), true) : null;
      return { s, R, N, direct, ls: pick(solveBits(a.fx!, b.fx!, R, N, s, true), false) };
    }
    /** M531: the C for target = A \ B (or B / A): a square A by exact fraction-free elimination on whole numbers, a
     * non-square or singular one through the normal equations (least squares); then each answer one division rounded
     * into its type. The engine's fiSolve does the same steps. */
    function solveInto(target: string, Ae: Expr, Be: Expr, left: boolean, t: Ty, mn = false, mnArgs: Expr[] = []) {
      const opt = mn ? minNormArgs(mnArgs) : null, tol = opt ? minNormFi(Ae, opt.rest).tol : undefined;
      const at = typeOf(Ae), bt = typeOf(Be), A = arrayRef(Ae), B = arrayRef(Be), { s, R, N, direct, ls } = solvePlan(at, bt, left, t.fx!, mn, tol), m = left ? bt.c : bt.r, w = N + m;
      // B / A is (A.' \ B.').': read A and B across, write the answer across.
      const aAt = (i: string, j: string) => (left ? `${A}[${i} + ${j} * ${R}]` : `${A}[${j} + ${i} * ${N}]`);
      const bAt = (i: string, j: string) => (left ? `${B}[${i} + ${j} * ${R}]` : `${B}[${j} + ${i} * ${m}]`);
      const xAt = (i: string, j: string) => (left ? `${target}[${i} + ${j} * ${N}]` : `${target}[${j} + ${i} * ${m}]`);
      const [lo, hi] = E.lim(t.fx!);
      helpers.add('fx_div');
      const ofW = (S: 'w' | 'b', x: string) => (S === 'w' ? x : `fxb_ofw(${x})`);
      const load = (S: 'w' | 'b', into: string) => {
        out(`  for (int sj = 0; sj < ${N}; sj++) for (int si = 0; si < ${R}; si++) ${into}[si + sj * ${R}] = ${ofW(S, E.w(aAt('si', 'sj'), at.fx!))};`);
        out(`  for (int sj = 0; sj < ${m}; sj++) for (int si = 0; si < ${R}; si++) ${into}[si + (${N} + sj) * ${R}] = ${ofW(S, E.w(bAt('si', 'sj'), bt.fx!))};`);
      };
      const answers = (S: 'w' | 'b', M: string, pad: string) => {
        const q = S === 'w' ? `fx_div(${M}[sv_piv[sc] + (${N} + sj) * ${N}], sv_det, ${s}, ${lo}, ${hi}, ${fmC(t.fx!)})` : `fxb_tow(fxb_divfit(${M}[sv_piv[sc] + (${N} + sj) * ${N}], sv_det, ${s}, fxb_ofw(${lo}), fxb_ofw(${hi}), ${fmC(t.fx!)}))`;
        out(`${pad}for (int sj = 0; sj < ${m}; sj++) for (int sc = 0; sc < ${N}; sc++) ${xAt('sc', 'sj')} = ${E.to(`sv_piv[sc] < 0 ? ${E.zero} : ${q}`, t.fx!)};`);
      };
      // M536: a big fxb_t working is kept static (not on the stack); past FXB_MEM it is refused.
      const keep = (S: 'w' | 'b', count: number) => {
        if (S !== 'b') return '';
        const bytes = count * fxbK * 4;
        if (bytes > FXB_MEM) fail(`this ${R}×${N} fixed-point matrix division needs ${Math.ceil(bytes / 2 ** 20)} MB of working (at most ${FXB_MEM / 2 ** 20} MB here): use shorter words or a smaller system.`);
        return bytes > FXB_STACK ? 'static ' : '';
      };
      helpers.add(`elim_${ls}`);
      if (mn) {
        // M535: lsqminnorm: the smallest least-squares answer, exact (the engine's minNormStored), each answer rounded once.
        const q = ls === 'w' ? `fx_div(sv_x[sc + sj * ${N}], sv_det, ${s}, ${lo}, ${hi}, ${fmC(t.fx!)})` : `fxb_tow(fxb_divfit(sv_x[sc + sj * ${N}], sv_det, ${s}, fxb_ofw(${lo}), fxb_ofw(${hi}), ${fmC(t.fx!)}))`;
        out(`{ /* lsqminnorm(A, B): the smallest least-squares answer, exact on whole numbers, then each answer rounded once */`);
        out(`  int sv_piv[${N}], sv_p[${N}];`);
        out(`  ${keep(ls, R * w + 2 * N * w + N * m)}fx${ls}_t sv_a[${R * w}], sv_g[${N * w}], sv_h[${N * w}], sv_x[${N * m}];`);
        out(`  fx${ls}_t sv_det;`);
        load(ls, 'sv_a');
        out(`  fx${ls}_normal(sv_a, ${R}, ${N}, ${w}, sv_g);`);
        const call = `fx${ls}_minnorm(sv_g, ${N}, ${m}, sv_h, sv_piv, sv_p, sv_x, &sv_det, ${tol ? `1, ${big(tol.mt2)}, ${tol.sh}` : '0, 0, 0'})`;
        out(opt!.warn ? `  if (${call} < ${Math.min(R, N)}) HYPERION_WARN("lsqminnorm: A's rank is below ${Math.min(R, N)}: the smallest of many answers is given");` : `  ${call};`);
        out(`  for (int sj = 0; sj < ${m}; sj++) for (int sc = 0; sc < ${N}; sc++) ${xAt('sc', 'sj')} = ${E.to(q, t.fx!)};`);
        out('}');
        return;
      }
      out(`{ /* ${left ? 'A \\ B' : 'B / A'}: exact elimination on whole numbers, then each answer rounded once */`);
      out(`  int sv_piv[${N}], sv_done = 0;`);
      if (direct) {
        helpers.add(`elim_${direct}`);
        out(`  { /* square: solved directly */`);
        out(`    ${keep(direct, N * w)}fx${direct}_t sv_m[${N * w}];`);
        out(`    fx${direct}_t sv_det;`);
        load(direct, 'sv_m');
        out(`    if (fx${direct}_elim(sv_m, ${N}, ${N}, ${w}, sv_piv, &sv_det) == ${N}) {`);
        answers(direct, 'sv_m', '      ');
        out('      sv_done = 1;');
        out('    }');
        out('  }');
      }
      out(`  if (!sv_done) { /* ${direct ? 'singular' : 'not square'}: the least-squares answer, through AᵀA x = AᵀB */`);
      out(`    ${keep(ls, R * w + N * w)}fx${ls}_t sv_a[${R * w}], sv_m[${N * w}];`);
      out(`    fx${ls}_t sv_det;`);
      load(ls, 'sv_a');
      out(`    fx${ls}_normal(sv_a, ${R}, ${N}, ${w}, sv_m);`);
      out(`    (void)fx${ls}_elim(sv_m, ${N}, ${N}, ${w}, sv_piv, &sv_det);`);
      answers(ls, 'sv_m', '    ');
      out('  }');
      out('}');
    }
    /** M527: a quotient rounded to the nearest step of its type (halves up) and held in its range; dividing by zero gives the top or bottom (0 / 0 is 0). */
    function fxDivCode(to: Nt, A: { nt: Nt; code: (k: string | null) => string }, B: { nt: Nt; code: (k: string | null) => string }, k: string | null): string {
      const { s, need } = divPlan(A.nt, B.nt, to);
      if (need > MAX_FX + 1) fail(`a fixed-point division that needs ${need} bits of working: choose a type with fewer fraction bits (divide(T, a, b)).`);
      if (need > NARROW_FX + 1) wide = true;
      helpers.add('fx_div');
      const [lo, hi] = E.lim(to);
      return E.to(`fx_div(${E.w(A.code(k), A.nt)}, ${E.w(B.code(k), B.nt)}, ${s}, ${lo}, ${hi}, ${fmC(to)})`, to);
    }
    /** A value converted to a fixed-point type: rounded to the nearest step (halves up) and held in range. */
    function toFx(to: Nt, x: { code: string; t: Ty }): string {
      const [lo, hi] = E.lim(to);
      if (!isFx(x.t)) helpers.add('fx_from');
      if (!isFx(x.t)) return E.to(`fx_from_double((double)${x.code}, ${to.fl}, ${lo}, ${hi}, ${fmC(to)})`, to);
      const from = x.t.fx!, d = to.fl - from.fl;
      if (from.signed === to.signed && from.wl === to.wl && from.fl === to.fl) return x.code;
      // M530: wrapping a value moved up by a whole word or more leaves 0; any other move must fit the working.
      if (d >= to.wl && to.om === 'Wrap') return E.to(E.zero, to);
      if (Math.abs(d) > (wide ? MAX_FX : NARROW_FX) - 1) fail(`a fixed-point value moved by ${Math.abs(d)} fraction bits: choose closer fraction lengths.`);
      helpers.add('fx_shift');
      return E.to(`fx_shift(${E.w(x.code, from)}, ${d}, ${lo}, ${hi}, ${fmC(to)})`, to);
    }

    // ——— Types ———
    function typeOf(e: Expr): Ty {
      switch (e.k) {
        case 'num': if (e.imag) fail('complex numbers can’t become C here.'); return { cls: 'double', r: 1, c: 1 };
        case 'id': {
          if (e.name === 'pi' || e.name === 'eps' || e.name === 'Inf' || e.name === 'NaN' || e.name === 'inf' || e.name === 'nan') return { cls: 'double', r: 1, c: 1 };
          if (e.name === 'true' || e.name === 'false') return { cls: 'logical', r: 1, c: 1 };
          const t = vars.get(e.name);
          if (!t && fmVars.has(e.name)) fail(`${e.name} is a fimath: here it goes only into fi(…) and setfimath.`);
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
      const d: Ty = { cls: 'double', r: 1, c: 1 };
      // (M530: a fimath written as text, fimath(…) or a fimath variable has no C type of its own.)
      const t = a.map((x) => (x.k === 'str' || isFimathCall(x) || (x.k === 'id' && fmVars.has(x.name)) ? d : typeOf(x)));
      if (fname === 'fi') {
        if (a.length < 4) fail('fi(x, signed, wordLength, fractionLength) here: all four, so the type is known (then a fimath if wanted).');
        const fm = { ...(isFx(t[0]) ? fmOf(t[0].fx!, t[0].fx!) : {}), ...fmArgs(a.slice(4)) };
        const fx: Nt = { signed: !!constant(a[1]), wl: constant(a[2]), fl: constant(a[3]), ...fm };
        return fxTy(fx, t[0].r, t[0].c);
      }
      if ((fname === 'setfimath' || fname === 'removefimath') && !fns.has(fname)) {
        if (!isFx(t[0])) fail(`${fname} takes a fixed-point value.`);
        const { rm: _r, om: _o, ...plain } = t[0].fx!;
        void _r; void _o;
        return fxTy(fname === 'removefimath' ? plain : { ...t[0].fx!, ...fmArgs(a.slice(1)) }, t[0].r, t[0].c);
      }
      if ((fname === 'mldivide' || fname === 'mrdivide') && !fns.has(fname) && t.slice(0, 2).some(isFx)) {
        if (a.length < 2 || a.length > 3 || (a[2] && !(isFx(t[2]) && scalar(t[2])))) fail(`${fname}(${fname === 'mldivide' ? 'A, B' : 'B, A'}, T): T the answer's type (numerictype(s, w, f) or a fi value).`);
        const left = fname === 'mldivide', [Ae, Be] = left ? [a[0], a[1]] : [a[1], a[0]], T = a[2] ? t[2].fx! : undefined;
        const at = typeOf(Ae), bt = typeOf(Be);
        if (!scalar(at)) return solveType(Ae, Be, left, T);
        if (!isFx(at) || !isFx(bt)) fail(`${fname} of fixed-point values needs both fixed point here.`);
        return fxTy(T ? { ...fmOf(bt.fx!, at.fx!), ...T } : quotientType(bt.fx!, at.fx!), bt.r, bt.c);
      }
      if (fname === 'lsqminnorm' && !fns.has(fname)) {
        const { A, B, rest, warn } = minNormArgs(a);
        if (warn) helpers.add('warn');
        if (t[0].cls !== 'fixed' && t[1].cls !== 'fixed') { if (rest.length > 1) fail('lsqminnorm(A, B, tol) of plain numbers takes one tolerance.'); return minNormType(A, B, rest[0]); }
        if (!isFx(typeOf(A))) fail('lsqminnorm(A, B) of fixed-point values needs both fixed point (fi(…)).');
        const { T, tol } = minNormFi(A, rest);
        return solveType(A, B, true, T, true, tol);
      }
      if (fname === 'numerictype' && !fns.has(fname)) {
        if (a.length !== 3) fail('numerictype(signed, wordLength, fractionLength) here: all three, so the type is known.');
        return fxTy({ signed: !!constant(a[0]), wl: constant(a[1]), fl: constant(a[2]) });
      }
      if (fname === 'divide' && !fns.has(fname)) {
        if (a.length !== 3 || !isFx(t[0]) || !scalar(t[0])) fail('divide(T, a, b): T a type (numerictype(s, w, f) or a fi value), then a and b.');
        if (!isFx(t[1]) && !isFx(t[2])) fail('divide(T, a, b): a or b must be fixed point.');
        if (!scalar(t[1]) && !scalar(t[2]) && (t[1].r !== t[2].r || t[1].c !== t[2].c)) fail(`the sizes don’t agree: ${sizeText(t[1])} and ${sizeText(t[2])}.`);
        const shape = scalar(t[1]) ? t[2] : t[1], fa = (t[1].fx ?? t[2].fx)!, fb = (t[2].fx ?? t[1].fx)!;
        return fxTy({ ...fmOf(fa, fb), ...t[0].fx! }, shape.r, shape.c);
      }
      if (t.some(isFx) && !fns.has(fname)) {
        if (fname === 'double' || fname === 'single') return { cls: fname, r: t[0].r, c: t[0].c };
        if (fname === 'sum' && t.length === 1 && (t[0].r === 1 || t[0].c === 1)) return fxTy(accType(t[0].fx!, n(t[0])));
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
            if ((e.op === '*' && !scalar(typeOf(e.a)) && !scalar(typeOf(e.b))) || isSolve(e)) { if (!k) fail(`a matrix ${e.op === '*' ? 'product' : 'division'} where one number is needed.`); return { code: `${arrayRef(e)}[${k}]`, t: { ...t, r: 1, c: 1 } }; }
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
          if (e.op === '-' && isFx(a.t)) { helpers.add('fx_fit'); const [lo, hi] = E.lim(a.t.fx!); return { code: E.to(`fx_fit(${E.neg(E.w(a.code, a.t.fx!))}, ${lo}, ${hi}, ${OM_C[a.t.fx!.om ?? 'Saturate']})`, a.t.fx!), t: a.t }; }
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
      if (fname === 'numerictype' && !fns.has(fname)) return { code: E.to(E.zero, t.fx!), t };
      if ((fname === 'setfimath' || fname === 'removefimath') && !fns.has(fname)) return { code: scal(a[0], scalar(typeOf(a[0])) ? null : k).code, t: { ...t, r: 1, c: 1 } };
      if (fname === 'lsqminnorm' && !fns.has(fname)) {
        if (!k) fail('a matrix division where one number is needed.');
        return { code: `${arrayRef({ k: 'index', of: { k: 'id', name: fname, at: 0 }, args: a, brace: false })}[${k}]`, t: { ...t, r: 1, c: 1 } };
      }
      if ((fname === 'mldivide' || fname === 'mrdivide') && !fns.has(fname) && isFx(t)) {
        const e: Expr = { k: 'index', of: { k: 'id', name: fname, at: 0 }, args: a, brace: false };
        if (isSolve(e)) { if (!k) fail('a matrix division where one number is needed.'); return { code: `${arrayRef(e)}[${k}]`, t: { ...t, r: 1, c: 1 } }; }
        const [Ae, Be] = fname === 'mldivide' ? [a[0], a[1]] : [a[1], a[0]], ta = typeOf(Ae), tb = typeOf(Be);
        return { code: fxDivCode(t.fx!, { nt: tb.fx!, code: (kk) => scal(Be, scalar(tb) ? null : kk).code }, { nt: ta.fx!, code: () => scal(Ae).code }, k), t: { ...t, r: 1, c: 1 } };
      }
      if (fname === 'divide' && !fns.has(fname)) {
        const ta = typeOf(a[1]), tb = typeOf(a[2]), like = (isFx(ta) ? ta : tb).fx!;
        const A = fxSide(a[1], ta, like), B = fxSide(a[2], tb, like);
        return { code: fxDivCode(t.fx!, { nt: A.nt, code: (kk) => A.code(scalar(ta) ? null : kk) }, { nt: B.nt, code: (kk) => B.code(scalar(tb) ? null : kk) }, k), t: { ...t, r: 1, c: 1 } };
      }
      if ((fname === 'double' || fname === 'single') && isFx(typeOf(a[0]))) { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: `${fname === 'single' ? '(float)' : ''}ldexp(${E.dbl(x.code, x.t.fx!)}, ${-x.t.fx!.fl})`, t: { ...t, r: 1, c: 1 } }; }
      if (FN1[fname]) { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: isInt(t.cls) ? satCall(t.cls, `${FN1[fname]}((double)${x.code})`) : `${FN1[fname]}(${x.code})`, t }; }
      if (FN2[fname]) { const [x, y] = a.map((v) => scal(v)); return { code: `${FN2[fname]}(${x.code}, ${y.code})`, t }; }
      if (fname === 'mod' || fname === 'rem') { helpers.add(fname); const [x, y] = a.map((v) => scal(v)); return { code: satCall(t.cls, `${fname}_d((double)${x.code}, (double)${y.code})`), t }; }
      if ((fname === 'min' || fname === 'max') && a.length === 2) { const [x, y] = a.map((v) => scal(v)); return { code: `${fname === 'min' ? 'fmin' : 'fmax'}(${x.code}, ${y.code})`, t }; }
      if (fname === 'numel' || fname === 'length' || fname === 'size') return { code: lit(constant({ k: 'index', of: { k: 'id', name: fname, at: 0 }, args: a, brace: false })), t };
      if (CTYPE[fname as Cls]) { const x = scal(a[0], k); return { code: isInt(t.cls) ? satCall(t.cls, `(double)${x.code}`) : `(${CTYPE[t.cls]})${x.code}`, t }; }
      if (['sum', 'prod', 'mean', 'min', 'max'].includes(fname)) {
        // A reduction of a vector: worked out just before the statement, into a temporary.
        const src = arrayRef(a[0]), v = fresh({ ...t, r: 1, c: 1 }), len = n(typeOf(a[0]));
        if (isFx(t)) {
          // M530: a fixed-point sum in full precision (its type has room for every element).
          const st = typeOf(a[0]).fx!;
          out(`${v} = ${E.to(E.zero, t.fx!)};`);
          out(`for (int i = 0; i < ${len}; i++) ${v} = ${E.to(accStepC(E.w(v, t.fx!), `${src}[i]`, st, t.fx!), t.fx!)};`);
          return { code: v, t };
        }
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
        out(fx ? `    fxw_t mp_s = ${E.zero};` : `    double mp_s = 0.0;`);
        // M532: each product in its (ProductMode) type, the running sum in the result's (SumMode) type, step by step.
        const pt = fx ? productType(at.fx!, bt.fx!) : null, full = fx ? productType(plain(at.fx!), plain(bt.fx!)) : null;
        const prod = () => toFx(pt!, { code: E.to(E.mul(E.w(`${A}[i + mp_p * ${at.r}]`, at.fx!), E.w(`${B}[mp_p + j * ${bt.r}]`, bt.fx!)), full!), t: fxTy(full!) });
        out(fx ? `    for (int mp_p = 0; mp_p < ${at.c}; mp_p++) mp_s = ${accStepC('mp_s', prod(), pt!, fx.fx!)};` : `    for (int mp_p = 0; mp_p < ${at.c}; mp_p++) mp_s += ${A}[i + mp_p * ${at.r}] * ${B}[mp_p + j * ${bt.r}];`);
        out(`    ${into}[i + j * ${at.r}] = ${fx ? cast(t, { code: E.to('mp_s', fx.fx!), t: fx }) : cast(t, { code: 'mp_s', t: { cls: 'double', r: 1, c: 1 } })};`);
        out('  }');
        out('}');
        if (into !== target) out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${into}[k];`);
        return;
      }
      if (isSolve(e) && !isFx(typeOf(e))) {
        // M538: lsqminnorm of plain numbers (a temporary when the target is also an input, or of another type).
        const st = typeOf(e), x = e as Extract<Expr, { k: 'index' }>, uses = x.args.some((v) => v.k === 'id' && v.name === target);
        const into = st.cls === t.cls && !uses ? target : fresh(st);
        minNormInto(into, x, st);
        if (into !== target) out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t, { code: `${into}[k]`, t: { ...st, r: 1, c: 1 } })};`);
        return;
      }
      if (isSolve(e)) {
        // M530: into a temporary first when the answer's type differs from the target's (it is then converted).
        const st = typeOf(e), into = sameFx(st, t) ? target : fresh(st), [Ae, Be, left, mn] = solveArgs(e);
        solveInto(into, Ae, Be, left, st, mn, mn ? (e as Extract<Expr, { k: 'index' }>).args : []);
        if (into !== target) out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t, { code: `${into}[k]`, t: { ...st, r: 1, c: 1 } })};`);
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
      if (isFx(x.t)) return cast(cls, { code: `ldexp(${E.dbl(x.code, x.t.fx!)}, ${-x.t.fx!.fl})`, t: { cls: 'double', r: 1, c: 1 } });
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
          if (to.k === 'id' && isFimathCall(st.e)) { fmVars.set(to.name, fmArgs(st.e.args)); return; }
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
            out(`printf("${text}"${rest.map((x) => { const v = scal(x); return `, ${isFx(v.t) ? `ldexp(${E.dbl(v.code, v.t.fx!)}, ${-v.t.fx!.fl})` : `(double)${v.code}`}`; }).join('')});`);
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
      lines.push(`  ${cty(t)} ${v}${scalar(t) ? (cty(t) === 'fx128_t' ? ' = {0}' : ' = 0') : `[${n(t)}]`};`);
    }
    // Scalar outputs passed by pointer: worked on in a local of the same name, copied out at the end.
    const ptrOuts = oneScalar ? [] : f.def.outs.filter((_, i) => scalar(f.outs[i]));
    const code = f.code.map((l) => ptrOuts.reduce((s, o) => s.replace(new RegExp(`\\b${o}\\b`, 'g'), `(*${o})`), l));
    lines.push(...code);
    // M530: a variable only ever set (a type holder such as T = fi(0, 1, 24, 16) for divide) is marked used for -Wall.
    const text = code.join('\n');
    for (const v of f.decls.keys()) if (!f.def.outs.includes(v) && !new RegExp(`\\b${v}\\b(?!\\s*=[^=])`).test(text)) lines.push(`  (void)${v};`);
    if (oneScalar) lines.push(`  return ${f.def.outs[0]};`);
    lines.push('}');
    return lines.join('\n');
  };
  const guard = `${entry.toUpperCase()}_H`;
  const inc = ['#include <math.h>', '#include <stdbool.h>', '#include <stdint.h>', ...(helpers.has('stdio') ? ['#include <stdio.h>'] : [])];
  const help: string[] = [];
  for (const c of Object.keys(RANGE) as Cls[]) if (helpers.has(c)) { const [lo, hi] = RANGE[c]!; help.push(`/* ${c}: rounded to the nearest (halves away from zero) and held in range, as MATLAB does */\nstatic ${CTYPE[c]} sat_${c}(double v) {\n  if (isnan(v)) return 0;\n  v = round(v);\n  if (v <= ${lo}) return (${CTYPE[c]})${lo};\n  if (v >= ${hi}) return (${CTYPE[c]})${hi};\n  return (${CTYPE[c]})v;\n}`); }
  const anyFx = ['fx_fit', 'fx_from', 'fx_shift', 'fx_div'].some((x) => helpers.has(x)) || order.some((f) => [...f.args, ...f.outs, ...f.decls.values()].some(isFx));
  if (anyFx) {
    // M530: the helpers are written with the fxw_ operations, so one text serves 64-bit, 128-bit and two-half working.
    if (helpers.has('fx_div') || helpers.has('fx_shift')) helpers.add('fx_fit');
    if (helpers.has('fx_fit')) helpers.add('fx_rdiv');
    help.push(`/* Fixed point: a value is its stored whole number; the value is that × 2^-fraction. Moved to another fraction length,
 * made from a double or divided, it is rounded to a step by the type's method and held in range or wrapped round it
 * (MATLAB's fimath; Nearest and Saturate unless the type says otherwise). Worked in ${wide ? '128' : '64'}-bit integers (fxw_t); every type
 * here has at most ${wide ? MAX_FX : NARROW_FX} bits. */`, 'enum { FX_NEAREST, FX_FLOOR, FX_CEILING, FX_ZERO, FX_ROUND, FX_CONVERGENT };\nenum { FX_SATURATE, FX_WRAP };');
    help.push(wide ? `typedef fx128_t fxw_t;\n#ifdef HYPERION_FX128_NATIVE\n${FXW_OPS('fxw_t', true)}\n#else\n${FXW_PORTABLE}\n#endif` : `typedef int64_t fxw_t;\n${FXW_OPS('fxw_t', false)}`);
    for (const h of ['fx_rdiv', 'fx_fit', 'fx_shift', 'fx_div', 'fx_from']) if (helpers.has(h)) help.push(FX_HELP[h]);
    if (helpers.has('elim_w')) help.push(elimC('fxw'));
    if (helpers.has('elim_b')) help.push(fxbC(fxbK, wide), elimC('fxb'));
  }
  // M540: 'warn' in C: HYPERION_WARN(message), printed to stderr unless the chip's own is defined before this file.
  if (helpers.has('warn')) help.push('/* lsqminnorm(…, \'warn\'): define HYPERION_WARN(message) before this file for your own (a log, a light) */\n#ifndef HYPERION_WARN\n#include <stdio.h>\n#define HYPERION_WARN(msg) fprintf(stderr, "Warning: %s\\n", msg)\n#endif');
  for (const f of ['d', 'f'] as const) if (helpers.has(`minnorm_${f}`)) help.push(minNormC(f));
  if (helpers.has('mod')) help.push('/* mod: the remainder with the sign of the divisor */\nstatic double mod_d(double a, double b) {\n  if (b == 0.0) return a;\n  double r = fmod(a, b);\n  return (r != 0.0 && ((r < 0) != (b < 0))) ? r + b : r;\n}');
  if (helpers.has('rem')) help.push('/* rem: the remainder with the sign of the dividend */\nstatic double rem_d(double a, double b) { return b == 0.0 ? a : fmod(a, b); }');
  const others = order.filter((f) => f !== main);
  const c = [`/* ${entry}.c: generated by Hyperion from ${entry}.m. Plain C99, no memory allocated while it runs.`, ' * Arrays are stored column by column, as in Hyperion: element (i, j) of an r-row matrix is x[(i-1) + (j-1)*r]. */', ...inc, `#include "${entry}.h"`, '', ...help.flatMap((h) => [h, '']), ...others.map((f) => `${sig(f, true)};`), ...(others.length ? [''] : []), ...order.flatMap((f) => [body(f), ''])].join('\n');
  const wideH = wide ? [FX128_H, ''] : [];
  const h = [`/* ${entry}.h: generated by Hyperion */`, `#ifndef ${guard}`, `#define ${guard}`, '#include <stdbool.h>', '#include <stdint.h>', '', ...wideH, `${sig(main, false)};`, '', `#endif /* ${guard} */`, ''].join('\n');
  return { c, h, wide };
}

// ——— M530: the fixed-point helpers in C ———
/** A 128-bit number for the public header: __int128 where the compiler has it, else two 64-bit halves (define
 * HYPERION_FX_PORTABLE to choose the halves anyway). The guard lets several generated headers be included together. */
const FX128_H = `#ifndef HYPERION_FX128
#define HYPERION_FX128
#if defined(__SIZEOF_INT128__) && !defined(HYPERION_FX_PORTABLE)
#define HYPERION_FX128_NATIVE
__extension__ typedef __int128 fx128_t;
#else
/* a 128-bit two's complement number in two halves (this compiler has no 128-bit integers) */
typedef struct { uint64_t lo, hi; } fx128_t;
#endif
#endif`;
/** The operations on working numbers, as plain operators (int64_t or __int128). */
const FXW_OPS = (T: string, wide: boolean) => `static inline ${T} fxw_of(int64_t v) { return v; }
static inline ${T} fxw_add(${T} a, ${T} b) { return a + b; }
static inline ${T} fxw_sub(${T} a, ${T} b) { return a - b; }
static inline ${T} fxw_mul(${T} a, ${T} b) { return a * b; }
${wide ? '__extension__ typedef unsigned __int128 fxw_u;' : 'typedef uint64_t fxw_u;'}
static inline ${T} fxw_addw(${T} a, ${T} b) { return (${T})((fxw_u)a + (fxw_u)b); }
static inline ${T} fxw_subw(${T} a, ${T} b) { return (${T})((fxw_u)a - (fxw_u)b); }
static inline ${T} fxw_mulw(${T} a, ${T} b) { return (${T})((fxw_u)a * (fxw_u)b); }
static inline ${T} fxw_div(${T} a, ${T} b) { return a / b; }
static inline ${T} fxw_neg(${T} a) { return -a; }
static inline int fxw_cmp(${T} a, ${T} b) { return (a > b) - (a < b); }
static inline ${T} fxw_p2(int d) { return (${T})1 << d; }
static inline ${T} fxw_shl(${T} a, int d) { return a * fxw_p2(d); }
static inline int fxw_odd(${T} a) { return a % 2 != 0; }
static inline double fxw_dbl(${T} a) { return (double)a; }
static inline ${T} fxw_from_dbl(double x) { return (${T})x; }${wide ? `
static inline ${T} fxw_ofu(uint64_t v) { return (${T})v; }
static inline int64_t fxw_lo64(${T} a) { return (int64_t)a; }
static inline uint64_t fxw_lou(${T} a) { return (uint64_t)a; }` : ''}`;
/** The same operations on two 64-bit halves (two's complement), for compilers without 128-bit integers. */
const FXW_PORTABLE = `static inline fxw_t fxw_mk(uint64_t hi, uint64_t lo) { fxw_t r; r.lo = lo; r.hi = hi; return r; }
static inline fxw_t fxw_of(int64_t v) { return fxw_mk(v < 0 ? ~(uint64_t)0 : 0, (uint64_t)v); }
static inline fxw_t fxw_ofu(uint64_t v) { return fxw_mk(0, v); }
static inline int64_t fxw_lo64(fxw_t a) { return a.lo <= (uint64_t)INT64_MAX ? (int64_t)a.lo : -(int64_t)(~a.lo) - 1; }
static inline uint64_t fxw_lou(fxw_t a) { return a.lo; }
static inline int fxw_isneg(fxw_t a) { return (int)(a.hi >> 63); }
static inline fxw_t fxw_add(fxw_t a, fxw_t b) { uint64_t lo = a.lo + b.lo; return fxw_mk(a.hi + b.hi + (lo < a.lo), lo); }
static inline fxw_t fxw_neg(fxw_t a) { uint64_t lo = ~a.lo + 1; return fxw_mk(~a.hi + (lo == 0), lo); }
static inline fxw_t fxw_sub(fxw_t a, fxw_t b) { return fxw_add(a, fxw_neg(b)); }
#define fxw_addw fxw_add
#define fxw_subw fxw_sub
#define fxw_mulw fxw_mul
static inline int fxw_cmp(fxw_t a, fxw_t b) {
  uint64_t x = a.hi ^ ((uint64_t)1 << 63), y = b.hi ^ ((uint64_t)1 << 63);
  if (x != y) return x < y ? -1 : 1;
  return (a.lo > b.lo) - (a.lo < b.lo);
}
static inline fxw_t fxw_mul(fxw_t a, fxw_t b) {
  /* the low 128 bits of the product (right for two's complement): a.lo × b.lo in 32-bit pieces, then the cross terms */
  uint64_t a0 = a.lo & 0xffffffffu, a1 = a.lo >> 32, b0 = b.lo & 0xffffffffu, b1 = b.lo >> 32;
  uint64_t p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  uint64_t mid = (p00 >> 32) + (p01 & 0xffffffffu) + (p10 & 0xffffffffu);
  uint64_t lo = (mid << 32) | (p00 & 0xffffffffu), hi = p11 + (p01 >> 32) + (p10 >> 32) + (mid >> 32);
  return fxw_mk(hi + a.lo * b.hi + a.hi * b.lo, lo);
}
static inline fxw_t fxw_shl(fxw_t a, int d) {
  if (d == 0) return a;
  if (d >= 64) return fxw_mk(a.lo << (d - 64), 0);
  return fxw_mk((a.hi << d) | (a.lo >> (64 - d)), a.lo << d);
}
static inline fxw_t fxw_p2(int d) { return fxw_shl(fxw_of(1), d); }
static inline int fxw_odd(fxw_t a) { return (int)(a.lo & 1); }
/* a / b towards zero, as C's own division: shift and subtract on the sizes, then the sign */
static inline fxw_t fxw_div(fxw_t a, fxw_t b) {
  int na = fxw_isneg(a), nb = fxw_isneg(b);
  fxw_t n = na ? fxw_neg(a) : a, d = nb ? fxw_neg(b) : b, q = fxw_of(0), r = fxw_of(0);
  for (int i = 127; i >= 0; i--) {
    r = fxw_shl(r, 1);
    r.lo |= (i >= 64 ? n.hi >> (i - 64) : n.lo >> i) & 1;
    if (fxw_cmp(r, d) >= 0) { r = fxw_sub(r, d); if (i >= 64) q.hi |= (uint64_t)1 << (i - 64); else q.lo |= (uint64_t)1 << i; }
  }
  return na != nb ? fxw_neg(q) : q;
}
/* to a double, rounded once (the bits below the top 64 kept as one sticky bit) */
static inline double fxw_dbl(fxw_t a) {
  int neg = fxw_isneg(a), k = 0;
  fxw_t m = neg ? fxw_neg(a) : a;
  double r;
  if (m.hi == 0) r = (double)m.lo;
  else {
    while (k < 64 && (m.hi >> k) != 0) k++;
    r = ldexp((double)(((m.hi << (64 - k)) | (m.lo >> k)) | ((m.lo << (64 - k)) != 0)), k);
  }
  return neg ? -r : r;
}
/* from a double holding a whole number */
static inline fxw_t fxw_from_dbl(double x) {
  int neg = x < 0, e = 0;
  double m = neg ? -x : x, f;
  fxw_t r;
  if (m < 9223372036854775808.0) r = fxw_ofu((uint64_t)m);
  else { f = frexp(m, &e); r = fxw_shl(fxw_ofu((uint64_t)ldexp(f, 64)), e - 64); }
  return neg ? fxw_neg(r) : r;
}`;
const FX_HELP: Record<string, string> = {
  fx_rdiv: `/* t / m (m > 0) rounded to a whole number by the method */
static inline fxw_t fx_rdiv(fxw_t t, fxw_t m, int rm) {
  fxw_t one = fxw_of(1), zero = fxw_of(0), q = fxw_div(t, m), r = fxw_sub(t, fxw_mul(q, m));
  int c;
  if (fxw_cmp(r, zero) < 0) { q = fxw_sub(q, one); r = fxw_add(r, m); }
  if (fxw_cmp(r, zero) == 0) return q;
  c = fxw_cmp(r, fxw_sub(m, r)); /* past, at or before the half */
  switch (rm) {
    case FX_FLOOR: return q;
    case FX_CEILING: return fxw_add(q, one);
    case FX_ZERO: return fxw_cmp(q, zero) < 0 ? fxw_add(q, one) : q;
    case FX_ROUND: return c > 0 || (c == 0 && fxw_cmp(q, zero) >= 0) ? fxw_add(q, one) : q;
    case FX_CONVERGENT: return c > 0 || (c == 0 && fxw_odd(q)) ? fxw_add(q, one) : q;
    default: return c >= 0 ? fxw_add(q, one) : q;
  }
}`,
  fx_fit: `/* v held in [lo, hi] (FX_SATURATE) or wrapped round it (FX_WRAP: two's complement) */
static inline fxw_t fx_fit(fxw_t v, fxw_t lo, fxw_t hi, int om) {
  fxw_t span, k;
  if (fxw_cmp(v, lo) >= 0 && fxw_cmp(v, hi) <= 0) return v;
  if (om == FX_SATURATE) return fxw_cmp(v, lo) < 0 ? lo : hi;
  span = fxw_add(fxw_sub(hi, lo), fxw_of(1));
  k = fx_rdiv(fxw_sub(v, lo), span, FX_FLOOR);
  return fxw_sub(v, fxw_mul(k, span));
}`,
  fx_shift: `/* v moved d fraction bits finer (d < 0: coarser, rounded) */
static inline fxw_t fx_shift(fxw_t v, int d, fxw_t lo, fxw_t hi, int rm, int om) {
  fxw_t m, part;
  if (d < 0) return fx_fit(fx_rdiv(v, fxw_p2(-d), rm), lo, hi, om);
  m = fxw_p2(d);
  if (om == FX_SATURATE) {
    if (fxw_cmp(v, fxw_div(hi, m)) > 0) return hi;
    if (fxw_cmp(v, fxw_div(lo, m)) < 0) return lo;
    return fxw_mul(v, m);
  }
  /* wrapped: only v's low bits matter, so take them first and nothing overflows */
  part = fxw_div(fxw_add(fxw_sub(hi, lo), fxw_of(1)), m);
  return fx_fit(fxw_mul(fxw_sub(v, fxw_mul(fx_rdiv(v, part, FX_FLOOR), part)), m), lo, hi, om);
}`,
  fx_div: `/* a / b as the stored number of a type s fraction bits finer than a's less b's; by zero: the top or bottom (0 / 0 is 0) */
static inline fxw_t fx_div(fxw_t a, fxw_t b, int s, fxw_t lo, fxw_t hi, int rm, int om) {
  fxw_t zero = fxw_of(0);
  if (fxw_cmp(b, zero) == 0) return fxw_cmp(a, zero) > 0 ? hi : fxw_cmp(a, zero) < 0 ? lo : zero;
  if (fxw_cmp(b, zero) < 0) { a = fxw_neg(a); b = fxw_neg(b); }
  if (s >= 0) a = fxw_shl(a, s); else b = fxw_shl(b, -s);
  return fx_fit(fx_rdiv(a, b, rm), lo, hi, om);
}`,
  fx_from: `/* a double to a stored number: rounded by the method, held or wrapped (the same arithmetic as Hyperion) */
static inline fxw_t fx_from_double(double x, int fl, fxw_t lo, fxw_t hi, int rm, int om) {
  double y, r, d, l = fxw_dbl(lo), h = fxw_dbl(hi), span;
  if (isnan(x)) return fxw_of(0);
  y = ldexp(x, fl);
  switch (rm) {
    case FX_FLOOR: r = floor(y); break;
    case FX_CEILING: r = ceil(y); break;
    case FX_ZERO: r = trunc(y); break;
    case FX_ROUND: r = y < 0 ? -floor(-y + 0.5) : floor(y + 0.5); break;
    case FX_CONVERGENT: r = floor(y); d = y - r; if (d > 0.5 || (d == 0.5 && fmod(r, 2) != 0)) r += 1; break;
    default: r = floor(y + 0.5);
  }
  if (om == FX_WRAP && !isinf(r) && (r < l || r > h)) {
    span = h - l + 1; /* 2^word: fmod is exact */
    r = fmod(r, span);
    if (r < l) r += span;
    if (r > h) r -= span;
  }
  if (r <= l) return lo;
  if (r >= h) return hi;
  return fxw_from_dbl(r);
}`,
};
/** M531: fraction-free Gauss–Jordan elimination and the normal equations, in fxw_t or fxb_t (the engine's elimStored
 * and solveAny). The products may wrap round: only each step's difference must fit, and it divides exactly. */
const elimC = (S: 'fxw' | 'fxb') => `/* fraction-free Gauss–Jordan on M (n rows, w columns, column by column) over its first nu columns; a column with no
 * pivot left is skipped (piv -1, its unknown 0). Every division is exact; the pivots end equal to *det. */
static inline int ${S}_elim(${S}_t *M, int n, int nu, int w, int *piv, ${S}_t *det) {
  ${S}_t prev = ${S}_of(1), zero = ${S}_of(0), pk, f, t;
  int row = 0, p;
  for (int k = 0; k < nu; k++) {
    piv[k] = -1;
    if (row == n) continue;
    for (p = row; p < n && ${S}_cmp(M[p + k * n], zero) == 0; p++) {}
    if (p == n) continue;
    if (p != row) for (int j = 0; j < w; j++) { t = M[row + j * n]; M[row + j * n] = M[p + j * n]; M[p + j * n] = t; }
    pk = M[row + k * n];
    for (int i = 0; i < n; i++) {
      if (i == row) continue;
      f = M[i + k * n];
      for (int j = 0; j < w; j++) if (j != k) M[i + j * n] = ${S}_div(${S}_subw(${S}_mulw(pk, M[i + j * n]), ${S}_mulw(f, M[row + j * n])), prev);
      M[i + k * n] = zero;
    }
    prev = pk;
    piv[k] = row++;
  }
  *det = prev;
  return row;
}
/* the normal equations: M (N rows, w columns) = a's first N columns' transpose times all w of them (a has R rows) */
static inline void ${S}_normal(const ${S}_t *a, int R, int N, int w, ${S}_t *M) {
  for (int j = 0; j < w; j++) for (int i = 0; i < N; i++) {
    ${S}_t s = ${S}_of(0);
    for (int r = 0; r < R; r++) s = ${S}_addw(s, ${S}_mulw(a[r + i * R], a[r + j * R]));
    M[i + j * N] = s;
  }
}
/* M535: the smallest least-squares answer from g = [AᵀA | AᵀB] (N rows, N + m columns): P, the columns of AᵀA with a
 * pivot; H = g_Pᵀ g_P with g's right part's rows P beside it (r rows, in h), solved fraction-free; x = g_P·(det·z), so
 * each answer is x / det. */
static inline int ${S}_minnorm(const ${S}_t *g, int N, int m, ${S}_t *h, int *piv, int *P, ${S}_t *x, ${S}_t *det, int tol, int64_t mt2, int sh) {
  int r = 0;
  for (int i = 0; i < N * (N + m); i++) h[i] = g[i];
  if (tol) {
    /* M540: a tolerance: each diagonal the pivot, a column kept when pivot / previous (QR's R(k,k)²) > mt2 · 2^sh */
    ${S}_t prev = ${S}_of(1), pk, m2 = ${S}_of(mt2), zero = ${S}_of(0);
    for (int k = 0; k < N; k++) {
      pk = h[k + k * N];
      if (${S}_cmp(pk, zero) <= 0) continue;
      if (sh >= 0 ? ${S}_cmp(pk, ${S}_shl(${S}_mul(m2, prev), sh)) <= 0 : ${S}_cmp(${S}_shl(pk, -sh), ${S}_mul(m2, prev)) <= 0) continue;
      for (int j = k + 1; j < N; j++) for (int i = k + 1; i < N; i++) h[i + j * N] = ${S}_div(${S}_subw(${S}_mulw(pk, h[i + j * N]), ${S}_mulw(h[i + k * N], h[k + j * N])), prev);
      prev = pk;
      P[r++] = k;
    }
  } else {
    (void)${S}_elim(h, N, N, N + m, piv, det);
    for (int k = 0; k < N; k++) if (piv[k] >= 0) P[r++] = k;
  }
  for (int q = 0; q < r; q++) {
    for (int p = 0; p < r; p++) {
      ${S}_t s = ${S}_of(0);
      for (int i = 0; i < N; i++) s = ${S}_addw(s, ${S}_mulw(g[i + P[q] * N], g[i + P[p] * N]));
      h[q + p * r] = s;
    }
    for (int j = 0; j < m; j++) h[q + (r + j) * r] = g[P[q] + (N + j) * N];
  }
  (void)${S}_elim(h, r, r, r + m, piv, det);
  for (int j = 0; j < m; j++) for (int i = 0; i < N; i++) {
    ${S}_t s = ${S}_of(0);
    for (int q = 0; q < r; q++) s = ${S}_addw(s, ${S}_mulw(g[i + P[q] * N], h[piv[q] + (r + j) * r]));
    x[i + j * N] = s;
  }
  return r;
}`;
/** M531: whole numbers of k 32-bit pieces (two's complement, lowest first) for matrix divisions past 128 bits: the
 * operations, the rounding division and the fit written as fx_rdiv, fx_fit and fx_div are, and the way to and from fxw_t. */
function fxbC(k: number, wide: boolean): string {
  const same = ['fx_rdiv', 'fx_fit', 'fx_div'].map((h) => FX_HELP[h].replace(/fxw_/g, 'fxb_').replace(/\bfx_rdiv\b/g, 'fxb_rdiv').replace(/\bfx_fit\b/g, 'fxb_fit').replace(/\bfx_div\b/g, 'fxb_divfit'));
  return `/* Whole numbers of ${32 * k} bits in ${k} 32-bit pieces (two's complement, lowest first): a matrix division's exact working */
typedef struct { uint32_t d[${k}]; } fxb_t;
static inline fxb_t fxb_ofu(uint64_t u) { fxb_t r; for (int i = 0; i < ${k}; i++) r.d[i] = i < 2 ? (uint32_t)(u >> (32 * i)) : 0; return r; }
static inline fxb_t fxb_of(int64_t v) { fxb_t r = fxb_ofu((uint64_t)v); if (v < 0) for (int i = 2; i < ${k}; i++) r.d[i] = 0xffffffffu; return r; }
static inline int fxb_isneg(fxb_t a) { return (int)(a.d[${k - 1}] >> 31); }
static inline fxb_t fxb_add(fxb_t a, fxb_t b) { uint64_t c = 0; for (int i = 0; i < ${k}; i++) { c += (uint64_t)a.d[i] + b.d[i]; a.d[i] = (uint32_t)c; c >>= 32; } return a; }
static inline fxb_t fxb_neg(fxb_t a) { uint64_t c = 1; for (int i = 0; i < ${k}; i++) { c += (uint32_t)~a.d[i]; a.d[i] = (uint32_t)c; c >>= 32; } return a; }
static inline fxb_t fxb_sub(fxb_t a, fxb_t b) { return fxb_add(a, fxb_neg(b)); }
static inline fxb_t fxb_mul(fxb_t a, fxb_t b) {
  fxb_t r = fxb_ofu(0);
  for (int i = 0; i < ${k}; i++) {
    uint64_t c = 0, t;
    for (int j = 0; i + j < ${k}; j++) { t = (uint64_t)a.d[i] * b.d[j] + r.d[i + j] + c; r.d[i + j] = (uint32_t)t; c = t >> 32; }
  }
  return r;
}
#define fxb_addw fxb_add
#define fxb_subw fxb_sub
#define fxb_mulw fxb_mul
static inline int fxb_ucmp(fxb_t a, fxb_t b) { for (int i = ${k - 1}; i >= 0; i--) if (a.d[i] != b.d[i]) return a.d[i] < b.d[i] ? -1 : 1; return 0; }
static inline int fxb_cmp(fxb_t a, fxb_t b) { int na = fxb_isneg(a), nb = fxb_isneg(b); return na != nb ? (na ? -1 : 1) : fxb_ucmp(a, b); }
static inline fxb_t fxb_p2(int d) { fxb_t r = fxb_ofu(0); r.d[d / 32] = (uint32_t)1 << (d % 32); return r; }
static inline fxb_t fxb_shl(fxb_t a, int d) { return fxb_mul(a, fxb_p2(d)); }
static inline int fxb_odd(fxb_t a) { return (int)(a.d[0] & 1); }
/* the carry of a signed step: t's part above 32 bits, rounded down (exact, no shift of a negative number) */
#define FXB_HI(t) (((t) - (int64_t)(uint32_t)(t)) / 4294967296LL)
/* a / b towards zero (M536): long division on the sizes' 32-bit pieces (Knuth's algorithm D), then the sign; b is never 0 */
static inline fxb_t fxb_div(fxb_t a, fxb_t b) {
  int na = fxb_isneg(a), nb = fxb_isneg(b), m = ${k}, n = ${k}, s = 0;
  fxb_t u = na ? fxb_neg(a) : a, v = nb ? fxb_neg(b) : b, q = fxb_ofu(0);
  uint32_t un[${k + 1}], vn[${k}];
  while (m > 0 && u.d[m - 1] == 0) m--;
  while (n > 0 && v.d[n - 1] == 0) n--;
  if (n == 0 || m < n) return q;
  if (n == 1) {
    uint64_t r = 0;
    for (int i = m - 1; i >= 0; i--) { uint64_t t = (r << 32) | u.d[i]; q.d[i] = (uint32_t)(t / v.d[0]); r = t % v.d[0]; }
    return na != nb ? fxb_neg(q) : q;
  }
  while (!((v.d[n - 1] << s) & 0x80000000u)) s++;
  for (int i = n - 1; i > 0; i--) vn[i] = (v.d[i] << s) | (uint32_t)((uint64_t)v.d[i - 1] >> (32 - s));
  vn[0] = v.d[0] << s;
  un[m] = (uint32_t)((uint64_t)u.d[m - 1] >> (32 - s));
  for (int i = m - 1; i > 0; i--) un[i] = (u.d[i] << s) | (uint32_t)((uint64_t)u.d[i - 1] >> (32 - s));
  un[0] = u.d[0] << s;
  for (int j = m - n; j >= 0; j--) {
    uint64_t top = ((uint64_t)un[j + n] << 32) | un[j + n - 1], qh = top / vn[n - 1], rh = top % vn[n - 1];
    while (qh >> 32 || qh * vn[n - 2] > ((rh << 32) | un[j + n - 2])) { qh--; rh += vn[n - 1]; if (rh >> 32) break; }
    int64_t t, c = 0;
    for (int i = 0; i < n; i++) {
      uint64_t p = qh * vn[i];
      t = (int64_t)un[i + j] - c - (int64_t)(p & 0xffffffffu);
      un[i + j] = (uint32_t)t;
      c = (int64_t)(p >> 32) - FXB_HI(t);
    }
    t = (int64_t)un[j + n] - c;
    un[j + n] = (uint32_t)t;
    if (t < 0) {
      qh--; c = 0;
      for (int i = 0; i < n; i++) { t = (int64_t)un[i + j] + vn[i] + c; un[i + j] = (uint32_t)t; c = FXB_HI(t); }
      un[j + n] = (uint32_t)((int64_t)un[j + n] + c);
    }
    q.d[j] = (uint32_t)qh;
  }
  return na != nb ? fxb_neg(q) : q;
}
${same.join('\n')}
${wide ? `static inline fxb_t fxb_ofw(fxw_t v) { return fxb_add(fxb_shl(fxb_of(fxw_lo64(fx_rdiv(v, fxw_p2(64), FX_FLOOR))), 64), fxb_ofu(fxw_lou(v))); }
static inline fxw_t fxb_tow(fxb_t a) {
  uint64_t lo = (uint64_t)a.d[0] | ((uint64_t)a.d[1] << 32), hi = (uint64_t)a.d[2] | ((uint64_t)a.d[3] << 32);
  return fxw_add(fxw_shl(fxw_of(hi <= (uint64_t)INT64_MAX ? (int64_t)hi : -(int64_t)(~hi) - 1), 64), fxw_ofu(lo));
}` : `static inline fxb_t fxb_ofw(fxw_t v) { return fxb_of(v); }
static inline fxw_t fxb_tow(fxb_t a) { uint64_t u = (uint64_t)a.d[0] | ((uint64_t)a.d[1] << 32); return u <= (uint64_t)INT64_MAX ? (int64_t)u : -(int64_t)(~u) - 1; }`}`;
}

/** M538: lsqminnorm for plain numbers in C: the SVD by one-sided Jacobi on the tall form (the same rotations and stops as
 * Hyperion's svd, dsp.ts), then x = pinv(A) · B without forming pinv: singular values at or below tol count as zero (a
 * negative tol: max(size) · eps(largest), as pinv's default). w holds max(R, N) × min(R, N) numbers, v min² of them.
 * M540: it gives the rank (the singular values kept), for 'warn'. */
function minNormC(f: 'd' | 'f'): string {
  const T = f === 'd' ? 'double' : 'float', F = (x: string) => (f === 'd' ? x : `${x}f`), stop = f === 'd' ? '1e-15' : '1e-7f', bits = f === 'd' ? 52 : 23;
  return `/* lsqminnorm: the smallest least-squares answer of A x = B (A R×N, B R×m, x N×m), through the SVD; singular values
 * at or below tol count as zero (tol < 0: max(R, N) · eps of the largest, as pinv). w: max(R, N)·min(R, N), v: min(R, N)². */
static int lsq_minnorm_${f}(const ${T} *A, int R, int N, const ${T} *B, int m, ${T} tol, ${T} *w, ${T} *v, ${T} *x) {
  int tall = R >= N, r = tall ? R : N, c = tall ? N : R, e, rank = 0;
  ${T} smax = 0;
  for (int j = 0; j < c; j++) for (int i = 0; i < r; i++) w[i + j * r] = tall ? A[i + j * R] : A[j + i * R];
  for (int j = 0; j < c; j++) for (int i = 0; i < c; i++) v[i + j * c] = (${T})(i == j);
  for (int sweep = 0; sweep < 60; sweep++) {
    ${T} off = 0;
    for (int p = 0; p < c - 1; p++) for (int q = p + 1; q < c; q++) {
      ${T} a = 0, b = 0, g = 0, zeta, t, cs, sn;
      for (int i = 0; i < r; i++) { a += w[i + p * r] * w[i + p * r]; b += w[i + q * r] * w[i + q * r]; g += w[i + p * r] * w[i + q * r]; }
      if (${F('fabs')}(g) <= ${stop} * ${F('sqrt')}(a * b)) continue;
      if (${F('fabs')}(g) / ${F('sqrt')}(a * b) > off) off = ${F('fabs')}(g) / ${F('sqrt')}(a * b);
      zeta = (b - a) / (2 * g);
      t = (zeta >= 0 ? 1 : -1) / (${F('fabs')}(zeta) + ${F('sqrt')}(1 + zeta * zeta));
      cs = 1 / ${F('sqrt')}(1 + t * t); sn = cs * t;
      for (int i = 0; i < r; i++) { ${T} y = w[i + p * r], z = w[i + q * r]; w[i + p * r] = cs * y - sn * z; w[i + q * r] = sn * y + cs * z; }
      for (int i = 0; i < c; i++) { ${T} y = v[i + p * c], z = v[i + q * c]; v[i + p * c] = cs * y - sn * z; v[i + q * c] = sn * y + cs * z; }
    }
    if (off < ${stop}) break;
  }
  for (int k = 0; k < c; k++) { ${T} s = 0; for (int i = 0; i < r; i++) s += w[i + k * r] * w[i + k * r]; s = ${F('sqrt')}(s); if (s > smax) smax = s; }
  if (tol < 0) { ${F('frexp')}(smax > 0 ? smax : 1, &e); tol = (R > N ? R : N) * ${F('ldexp')}(1, e - 1 - ${bits}); }
  for (int k = 0; k < N * m; k++) x[k] = 0;
  /* tall: A = W Vᵀ, so x = Σ v_k (w_kᵀ B) / s_k²; wide (Aᵀ = W Vᵀ): x = Σ w_k (v_kᵀ B) / s_k² */
  for (int k = 0; k < c; k++) {
    ${T} s2 = 0;
    for (int i = 0; i < r; i++) s2 += w[i + k * r] * w[i + k * r];
    if (!(${F('sqrt')}(s2) > tol)) continue;
    rank++;
    for (int j = 0; j < m; j++) {
      ${T} d = 0;
      for (int i = 0; i < R; i++) d += (tall ? w[i + k * r] : v[i + k * c]) * B[i + j * R];
      d /= s2;
      for (int i = 0; i < N; i++) x[i + j * N] += (tall ? v[i + k * c] : w[i + k * r]) * d;
    }
  }
  return rank;
}`;
}
