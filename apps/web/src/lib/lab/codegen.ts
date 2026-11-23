import type { Expr, FnDef, Stmt } from './parse';

// Hyperion's C code generation (M480): a function written in Hyperion's language, with example inputs that fix every
// size and type, becomes plain, readable C99 for embedded work: no memory allocated at run time, fixed-size arrays
// stored column by column (as the engine stores them), double / single / whole-number types (whole numbers saturate and
// round as MATLAB's do), loops, branches, element-wise array maths, the matrix product, sums and the usual maths
// functions, and calls to other functions of the script. What it can't turn into C it refuses with the reason and the
// place. Our own generator (MATLAB Coder's output isn't copied).

export type Cls = 'double' | 'single' | 'logical' | 'int8' | 'uint8' | 'int16' | 'uint16' | 'int32' | 'uint32' | 'int64' | 'uint64';
export interface Ty { cls: Cls; r: number; c: number }
export class CodegenError extends Error {}

const CTYPE: Record<Cls, string> = { double: 'double', single: 'float', logical: 'bool', int8: 'int8_t', uint8: 'uint8_t', int16: 'int16_t', uint16: 'uint16_t', int32: 'int32_t', uint32: 'uint32_t', int64: 'int64_t', uint64: 'uint64_t' };
const isInt = (c: Cls) => c.includes('int');
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
  let tmp = 0;

  function make(name: string, argTypes: Ty[], from: string[]): Fn {
    const def = fns.get(name);
    if (!def) throw new CodegenError(`There’s no function ${name} in the script.`);
    if (from.includes(name)) throw new CodegenError(`${name} calls itself: recursion can’t become fixed-size C here.`);
    if (def.varargin || def.varargout) throw new CodegenError(`${name}: varargin and varargout can’t become C here.`);
    if (argTypes.length !== def.params.length) throw new CodegenError(`${name} takes ${def.params.length} inputs; ${argTypes.length} examples were given.`);
    const key = `${name}(${argTypes.map((t) => `${t.cls}${sizeText(t)}`).join(',')})`;
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
          return { cls: v.cls, r: 1, c: 1 };
        }
        default: return fail(`${e.k === 'str' ? 'text' : e.k === 'lambda' || e.k === 'handle' ? 'function handles' : e.k === 'range' ? 'a range outside a for loop' : e.k} can’t become C here.`);
      }
    }
    function callType(fname: string, a: Expr[]): Ty {
      const t = a.map(typeOf), d: Ty = { cls: 'double', r: 1, c: 1 };
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
      if (CTYPE[fname as Cls] && t.length === 1) return { ...t[0], cls: fname as Cls };
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
      if (FN1[fname]) { const x = scal(a[0], scalar(typeOf(a[0])) ? null : k); return { code: isInt(t.cls) ? satCall(t.cls, `${FN1[fname]}((double)${x.code})`) : `${FN1[fname]}(${x.code})`, t }; }
      if (FN2[fname]) { const [x, y] = a.map((v) => scal(v)); return { code: `${FN2[fname]}(${x.code}, ${y.code})`, t }; }
      if (fname === 'mod' || fname === 'rem') { helpers.add(fname); const [x, y] = a.map((v) => scal(v)); return { code: satCall(t.cls, `${fname}_d((double)${x.code}, (double)${y.code})`), t }; }
      if ((fname === 'min' || fname === 'max') && a.length === 2) { const [x, y] = a.map((v) => scal(v)); return { code: `${fname === 'min' ? 'fmin' : 'fmax'}(${x.code}, ${y.code})`, t }; }
      if (fname === 'numel' || fname === 'length' || fname === 'size') return { code: lit(constant({ k: 'index', of: { k: 'id', name: fname, at: 0 }, args: a, brace: false })), t };
      if (CTYPE[fname as Cls]) { const x = scal(a[0], k); return { code: isInt(t.cls) ? satCall(t.cls, `(double)${x.code}`) : `(${CTYPE[t.cls]})${x.code}`, t }; }
      if (['sum', 'prod', 'mean', 'min', 'max'].includes(fname)) {
        // A reduction of a vector: worked out just before the statement, into a temporary.
        const src = arrayRef(a[0]), v = fresh({ cls: t.cls, r: 1, c: 1 }), len = n(typeOf(a[0]));
        const init = fname === 'prod' ? '1.0' : fname === 'min' || fname === 'max' ? `${src}[0]` : '0.0';
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
      if (e.k === 'matrix') { e.rows.forEach((row, i) => row.forEach((x, j) => out(`${target}[${i + j * t.r}] = ${cast(t.cls, scal(x))};`))); return; }
      if (e.k === 'post' && (e.op === "'" || e.op === ".'")) {
        const src = arrayRef(e.a), s = typeOf(e.a);
        out(`for (int j = 0; j < ${s.c}; j++) for (int i = 0; i < ${s.r}; i++) ${target}[j + i * ${s.c}] = ${src}[i + j * ${s.r}];`);
        return;
      }
      if (e.k === 'bin' && e.op === '*' && !scalar(typeOf(e.a)) && !scalar(typeOf(e.b))) {
        const A = arrayRef(e.a), B = arrayRef(e.b), at = typeOf(e.a), bt = typeOf(e.b);
        const into = A === target || B === target ? fresh(t) : target;
        out(`for (int j = 0; j < ${bt.c}; j++) {`);
        out(`  for (int i = 0; i < ${at.r}; i++) {`);
        out(`    double s = 0.0;`);
        out(`    for (int p = 0; p < ${at.c}; p++) s += ${A}[i + p * ${at.r}] * ${B}[p + j * ${bt.r}];`);
        out(`    ${into}[i + j * ${at.r}] = ${cast(t.cls, { code: 's', t: { cls: 'double', r: 1, c: 1 } })};`);
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
      if (e.k === 'id' && vars.has(e.name)) { out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t.cls, scal(e, 'k'))};`); return; }
      // Element-wise: one loop over the elements.
      const x = scal(e, 'k');
      out(`for (int k = 0; k < ${N}; k++) ${target}[k] = ${cast(t.cls, x)};`);
    }
    const cast = (cls: Cls, x: { code: string; t: Ty }) => (isInt(cls) && !isInt(x.t.cls) ? satCall(cls, x.code) : cls === x.t.cls || (cls === 'double' && x.t.cls !== 'single') ? x.code : `(${CTYPE[cls]})${x.code}`);

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
            if (scalar(t)) out(`${to.name} = ${cast(keep.cls, scal(st.e))};`);
            else assignArray(to.name, st.e, keep);
            return;
          }
          if (to.k === 'index' && to.of.k === 'id') {
            const v = vars.get(to.of.name);
            if (!v) fail(`${to.of.name} must be made (with zeros or an example input) before its elements are set: arrays have a fixed size in C.`);
            if (!scalar(typeOf(st.e))) fail(`${to.of.name}(…) = takes one number here.`);
            out(`${idx(to.of.name, to.args, v!, null)} = ${cast(v!.cls, scal(st.e))};`);
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
    const ins = f.def.params.map((p, i) => (scalar(f.args[i]) ? `${CTYPE[f.args[i].cls]} ${p}` : `const ${CTYPE[f.args[i].cls]} ${p}[${n(f.args[i])}]`));
    const outs = oneScalar ? [] : f.def.outs.map((o, i) => (scalar(f.outs[i]) ? `${CTYPE[f.outs[i].cls]} *${o}` : `${CTYPE[f.outs[i].cls]} ${o}[${n(f.outs[i])}]`));
    return `${f === main || !proto ? '' : 'static '}${oneScalar ? CTYPE[f.outs[0].cls] : 'void'} ${f.cname}(${[...ins, ...outs].join(', ') || 'void'})`;
  };
  const body = (f: Fn) => {
    const oneScalar = f.outs.length === 1 && scalar(f.outs[0]);
    const lines = [`/* ${f.def.outs.length ? `[${f.def.outs.join(', ')}] = ` : ''}${f.def.name}(${f.def.params.map((p, i) => `${p}: ${f.args[i].cls} ${sizeText(f.args[i])}`).join(', ')}) */`, `${f === main ? '' : 'static '}${sig(f, false)} {`];
    for (const [v, t] of f.decls) {
      if (!oneScalar && f.def.outs.includes(v)) continue;
      lines.push(`  ${CTYPE[t.cls]} ${v}${scalar(t) ? ' = 0' : `[${n(t)}]`};`);
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
  if (helpers.has('mod')) help.push('/* mod: the remainder with the sign of the divisor */\nstatic double mod_d(double a, double b) {\n  if (b == 0.0) return a;\n  double r = fmod(a, b);\n  return (r != 0.0 && ((r < 0) != (b < 0))) ? r + b : r;\n}');
  if (helpers.has('rem')) help.push('/* rem: the remainder with the sign of the dividend */\nstatic double rem_d(double a, double b) { return b == 0.0 ? a : fmod(a, b); }');
  const others = order.filter((f) => f !== main);
  const c = [`/* ${entry}.c: generated by Hyperion from ${entry}.m. Plain C99, no memory allocated while it runs.`, ' * Arrays are stored column by column, as in Hyperion: element (i, j) of an r-row matrix is x[(i-1) + (j-1)*r]. */', ...inc, `#include "${entry}.h"`, '', ...help.flatMap((h) => [h, '']), ...others.map((f) => `${sig(f, true)};`), ...(others.length ? [''] : []), ...order.flatMap((f) => [body(f), ''])].join('\n');
  const h = [`/* ${entry}.h: generated by Hyperion */`, `#ifndef ${guard}`, `#define ${guard}`, '#include <stdbool.h>', '#include <stdint.h>', '', `${sig(main, false)};`, '', `#endif /* ${guard} */`, ''].join('\n');
  return { c, h };
}
