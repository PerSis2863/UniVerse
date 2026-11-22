import { LabError, parse, type Expr, type FnDef, type Stmt } from './parse';
import { cbinop } from './complex';
import { cmat, imOf, isComplex, bool, empty, inline, isScalar, kind, mat, num, numel, page, pages, scalar, show, sizeOf, stack, str, toMat, truthy, type Cell, type Fmt, type Fn, type Mat, type Struct, type Value } from './values';
import { BUILTINS } from './builtins';
import { cast, isNumClass, resultClass, type NumClass } from './types';
import { colPositions, contents, isTable, joinTables, pick as pickTable, properties, remove as removeRows, renamed, setValues } from './table';
// The functions in other files add themselves to BUILTINS when loaded (M378).
import './signal';

// UniVerse Lab's interpreter (M374): runs the tree from parse.ts. Our own code, written from the MATLAB / Octave
// language's documented behaviour: implicit expansion, column-major indexing, growth on assignment, `end` in indexes,
// multiple outputs, closures for @(x) handles, functions defined in the script.

export interface Host {
  /** Text for the command window. */
  out(text: string): void;
  /** The figures (plot.ts adds them); the interpreter only passes it along. */
  graphics?: unknown;
  /** Milliseconds, for tic / toc (performance.now in the browser). */
  now?(): number;
  /** Asked now and then during long runs: true stops the code (the Stop button). */
  stopped?(): boolean;
  /** The person's files (files.ts adds them); the interpreter only passes it along. */
  files?: unknown;
}

class Flow { constructor(readonly kind: 'break' | 'continue' | 'return') {} }
interface Frame { vars: Map<string, Value>; nargin: number; nargout: number; depth: number }
type Idx = 'all' | number[]; // 0-based positions

/** Values that may be held in two places: never changed in place (copied first). */
const shared = new WeakSet<object>();

export class Lab {
  readonly vars = new Map<string, Value>();
  readonly globals = new Map<string, Value>();
  readonly fns = new Map<string, FnDef>();
  fmt: Fmt = { long: false };
  ticAt = 0;
  private steps = 0;
  constructor(readonly host: Host) {}

  /** Runs code typed in the command window or a script; errors come back as LabError. */
  run(src: string) {
    const prog = parse(src);
    for (const [k, f] of prog.fns) this.fns.set(k, f);
    this.exec(prog.body, { vars: this.vars, nargin: 0, nargout: 0, depth: 0 });
  }

  // ——— Statements ———
  private exec(body: Stmt[], f: Frame) {
    for (const st of body) {
      if (++this.steps % 20000 === 0 && this.host.stopped?.()) throw new LabError('Stopped.');
      try { this.stmt(st, f); } catch (e) {
        if (e instanceof Flow) throw e;
        if (e instanceof LabError && e.at < 0) throw new LabError(e.message, st.at);
        if (e instanceof RangeError) throw new LabError('Too many nested calls (a function calling itself without stopping?).', st.at);
        throw e;
      }
    }
  }

  private stmt(st: Stmt, f: Frame) {
    switch (st.s) {
      case 'expr': {
        const e = st.e;
        // A bare name of a function with no outputs (e.g. "clc", "figure") runs it without "ans".
        const outs = this.evalMulti(e, f, e.k === 'id' || e.k === 'index' ? 0 : 1);
        if (!outs.length) return;
        const v = outs[0];
        const isVar = e.k === 'id' && f.vars.has(e.name);
        if (!isVar) f.vars.set('ans', v);
        if (st.show) this.host.out(show(isVar ? (e as { name: string }).name : 'ans', v, this.fmt));
        return;
      }
      case 'assign': {
        if (st.to.length > 1) {
          const outs = this.evalMulti(st.e, f, st.to.length);
          if (outs.length < st.to.filter((t) => !(t.k === 'id' && t.name === '~')).length) throw new LabError(`Too many outputs asked for: this gives ${outs.length}.`);
          st.to.forEach((t, i) => { if (!(t.k === 'id' && t.name === '~')) this.assign(t, outs[i], f); });
          if (st.show) for (const t of st.to) if (t.k !== 'id' || t.name !== '~') this.display(t, f);
          return;
        }
        let v = this.ev(st.e, f);
        if (st.op !== '=') v = this.binop(st.op[0], this.ev(st.to[0], f), v);
        this.assign(st.to[0], v, f);
        if (st.show) this.display(st.to[0], f);
        return;
      }
      case 'if':
        for (const arm of st.arms) if (truthy(this.ev(arm.cond, f))) { this.exec(arm.body, f); return; }
        if (st.other) this.exec(st.other, f);
        return;
      case 'for': {
        const v = this.ev(st.e, f);
        const [r, c0] = sizeOf(v), c = c0 * pages(v); // a 3D array's pages continue its columns
        for (let j = 0; j < c; j++) {
          // Each column of the value, in turn (a row vector gives its numbers one by one).
          const item: Value = v.k === 'mat' ? mat(r, 1, v.d.subarray(j * r, j * r + r)) : v.k === 'str' ? str(v.v[j]) : v.k === 'cell' ? { k: 'cell', r, c: 1, d: v.d.slice(j * r, j * r + r) } : v;
          this.assign(st.v, item, f);
          try { this.exec(st.body, f); } catch (e) { if (e instanceof Flow && e.kind === 'break') break; if (e instanceof Flow && e.kind === 'continue') continue; throw e; }
        }
        return;
      }
      case 'while':
        while (truthy(this.ev(st.cond, f))) {
          try { this.exec(st.body, f); } catch (e) { if (e instanceof Flow && e.kind === 'break') break; if (e instanceof Flow && e.kind === 'continue') continue; throw e; }
        }
        return;
      case 'do':
        do {
          try { this.exec(st.body, f); } catch (e) { if (e instanceof Flow && e.kind === 'break') break; if (e instanceof Flow && e.kind === 'continue') continue; throw e; }
        } while (!truthy(this.ev(st.cond, f)));
        return;
      case 'switch': {
        const v = this.ev(st.e, f);
        const hit = (m: Value): boolean => m.k === 'cell' ? m.d.some(hit) : m.k === 'str' || v.k === 'str' ? m.k === 'str' && v.k === 'str' && m.v === v.v : scalar(m) === scalar(v);
        for (const c of st.cases) if (hit(this.ev(c.match, f))) { this.exec(c.body, f); return; }
        if (st.other) this.exec(st.other, f);
        return;
      }
      case 'try':
        try { this.exec(st.body, f); } catch (e) {
          if (e instanceof Flow) throw e;
          if (st.id) f.vars.set(st.id, { k: 'struct', f: new Map([['message', str(e instanceof Error ? e.message : String(e))], ['identifier', str('')]]) });
          this.exec(st.handler, f);
        }
        return;
      case 'break': case 'continue': case 'return': throw new Flow(st.s);
      case 'global':
        for (const n of st.names) { if (!this.globals.has(n)) this.globals.set(n, empty()); f.vars.set(n, this.globals.get(n)!); }
        return;
      case 'command':
        this.call(st.name, st.args.map(str), 0, f);
        return;
    }
  }

  private display(t: Expr, f: Frame) {
    let root = t; while (root.k === 'index' || root.k === 'field') root = root.of;
    if (root.k === 'id') this.host.out(show(root.name, f.vars.get(root.name)!, this.fmt));
  }

  // ——— Assignment: x = v, x(i,j) = v, x{i} = v, s.a.b = v ———
  private assign(t: Expr, v: Value, f: Frame) {
    if (t.k === 'id') {
      if (t.name === '~') return;
      f.vars.set(t.name, v);
      if (this.globals.has(t.name) && f.vars === this.vars) this.globals.set(t.name, v);
      return;
    }
    if (t.k === 'index') {
      const base = this.peek(t.of, f);
      const idx = t.args.map((a, i) => this.index(a, base, i, t.args.length, f));
      const next = t.brace ? setCell(base, idx, v) : setIndex(base, idx, v, t.of.k === 'id' && base !== undefined && !shared.has(base));
      this.assign(t.of, next, f);
      return;
    }
    if (t.k === 'field') {
      const base = this.peek(t.of, f);
      if (base && base.k !== 'struct' && !(base.k === 'mat' && !base.d.length)) throw new LabError(`Fields only go on structs, not on ${kind(base)}.`);
      const name = typeof t.name === 'string' ? t.name : textOf(this.ev(t.name, f));
      if (isTable(base) && name === 'Properties') { this.assign(t.of, renamed(base, v), f); return; }
      const s: Struct = { k: 'struct', f: new Map(base?.k === 'struct' ? base.f : []), ...(isTable(base) ? { table: true } : {}) };
      // A table's new column must be as tall as the table (a row of the right length is turned into a column).
      if (isTable(base) && base.f.size && !(base.f.size === 1 && base.f.has(name))) {
        const h = sizeOf(base)[0];
        if (v.k === 'mat' && v.r === 1 && v.c === h && h !== 1) v = mat(h, 1, v.d, v.logical);
        else if (v.k === 'cell' && v.r === 1 && v.c === h && h !== 1) v = { ...v, r: h, c: 1 };
        if (sizeOf(v)[0] !== h) throw new LabError(`A new column must have ${h} rows, as the table does.`);
      }
      s.f.set(name, v);
      this.assign(t.of, s, f);
      return;
    }
    throw new LabError('This can’t be assigned to.');
  }
  /** The current value at an assignment target, or undefined (not made yet, or past the end). */
  private peek(t: Expr, f: Frame): Value | undefined {
    if (t.k === 'id') return f.vars.get(t.name);
    if (t.k === 'field') { const b = this.peek(t.of, f); const n = typeof t.name === 'string' ? t.name : textOf(this.ev(t.name, f)); return b?.k === 'struct' ? (isTable(b) && n === 'Properties' && !b.f.has(n) ? properties(b) : b.f.get(n)) : undefined; }
    if (t.k === 'index') {
      const b = this.peek(t.of, f);
      if (!b) return undefined;
      try { const idx = t.args.map((a, i) => this.index(a, b, i, t.args.length, f)); return t.brace ? getCell(b, idx)[0] : getIndex(b, idx); } catch { return undefined; }
    }
    return undefined;
  }

  // ——— Expressions ———
  ev(e: Expr, f: Frame): Value {
    const outs = this.evalMulti(e, f, 1);
    if (!outs.length) throw new LabError(e.k === 'index' || e.k === 'id' ? 'This function gives no value back.' : 'This has no value.');
    return outs[0];
  }

  evalMulti(e: Expr, f: Frame, nout: number): Value[] {
    switch (e.k) {
      case 'num': return [e.imag ? cmat(1, 1, [0], [e.v]) : num(e.v)];
      case 'str': return [str(e.v)];
      case 'id': {
        const v = f.vars.get(e.name);
        if (v) { shared.add(v); return [v]; }
        return this.call(e.name, [], nout, f);
      }
      case 'colon': throw new LabError('“:” on its own only works inside an index, like A(:, 1).');
      case 'end': throw new LabError('“end” only works inside an index, like x(end).');
      case 'bin': {
        if (e.op === '&&' || e.op === '||') {
          const a = truthy(this.ev(e.a, f));
          if (e.op === '&&' ? !a : a) return [bool(a)];
          return [bool(truthy(this.ev(e.b, f)))];
        }
        return [this.binop(e.op, this.ev(e.a, f), this.ev(e.b, f))];
      }
      case 'un': {
        const a = this.ev(e.a, f);
        if (e.op === '+') return [toMat(a)];
        if (e.op === '-') { const m = toMat(a); if (m.cls) return [cast({ ...m, d: m.d.map((x) => -x), im: m.im?.map((x) => -x) }, m.cls)]; return [m.im ? cmat(m.r, m.c, m.d.map((x) => -x), m.im.map((x) => -x)) : map1(m, (x) => -x)]; }
        return [{ ...map1(toMat(a), (x) => (x === 0 ? 1 : 0)), logical: true }];
      }
      case 'post': { const v = transpose(this.ev(e.a, f)); return [e.op === "'" && v.k === 'mat' && v.im ? { ...v, im: v.im.map((x) => -x) } : v]; }
      case 'range': {
        const a = scalar(this.ev(e.from, f), 'The start of a range'), s = e.step ? scalar(this.ev(e.step, f), 'The step of a range') : 1, b = scalar(this.ev(e.to, f), 'The end of a range');
        return [range(a, s, b)];
      }
      case 'matrix': return [e.cell ? this.cellLiteral(e.rows, f) : concat(e.rows.map((r) => r.flatMap((x) => this.spread(x, f))))];
      case 'lambda': {
        const closure = new Map(f.vars);
        for (const v of closure.values()) shared.add(v);
        return [{ k: 'fn', params: e.params, body: e.body, src: e.src, closure }];
      }
      case 'handle': return [{ k: 'fn', name: e.name }];
      case 'field': {
        const b = this.ev(e.of, f);
        const n = typeof e.name === 'string' ? e.name : textOf(this.ev(e.name, f));
        if (b.k !== 'struct') throw new LabError(`“.${n}” only works on a struct, not on ${kind(b)}.`);
        if (isTable(b) && n === 'Properties' && !b.f.has(n)) return [properties(b)];
        if (!b.f.has(n)) throw new LabError(isTable(b) ? `This table has no column “${n}” (its columns: ${[...b.f.keys()].join(', ')}).` : `This struct has no field “${n}”.`);
        return [b.f.get(n)!];
      }
      case 'index': {
        // A variable is indexed; anything else with a name is a function to call.
        if (e.of.k === 'id' && !f.vars.has(e.of.name)) {
          const args = e.args.flatMap((a) => (a.k === 'colon' ? [str(':')] : this.spread(a, f)));
          return this.call(e.of.name, args, nout, f);
        }
        const b = this.ev(e.of, f);
        if (b.k === 'fn') return this.callFn(b, e.args.flatMap((a) => this.spread(a, f)), nout);
        const idx = e.args.map((a, i) => this.index(a, b, i, e.args.length, f));
        return e.brace ? getCell(b, idx) : [getIndex(b, idx)];
      }
    }
  }
  /** An argument that may stand for several values: c{:} spreads a cell's contents. */
  private spread(e: Expr, f: Frame): Value[] {
    if (e.k === 'index' && e.brace) return this.evalMulti(e, f, -1);
    return [this.ev(e, f)];
  }
  private cellLiteral(rows: Expr[][], f: Frame): Cell {
    const rs = rows.map((r) => r.flatMap((x) => { const v = this.ev(x, f); return v.k === 'cell' && !(x.k === 'matrix') ? [v] : [v]; })).filter((r) => r.length);
    if (!rs.length) return { k: 'cell', r: 0, c: 0, d: [] };
    const c = rs[0].length;
    if (rs.some((r) => r.length !== c)) throw new LabError('Each row of { } needs the same number of items.');
    const d: Value[] = [];
    for (let j = 0; j < c; j++) for (let i = 0; i < rs.length; i++) d.push(rs[i][j]);
    return { k: 'cell', r: rs.length, c, d };
  }
  /** An index argument into 0-based positions, with `end` meaning the last along its place. */
  private index(a: Expr, base: Value | undefined, i: number, n: number, f: Frame): Idx {
    if (a.k === 'colon') return 'all';
    const [r, c] = base ? sizeOf(base) : [0, 0];
    const endHere = n === 1 ? r * c : i === 0 ? r : i === 1 ? c : 1;
    const v = this.withEnd(a, endHere, f);
    if (v.k === 'str' && v.v === ':') return 'all';
    // A table's columns may be named: T(:, 'Age'), T(:, {'Name', 'Age'}).
    if (isTable(base) && i === 1 && n === 2) { const cols = colPositions(base, v); if (cols) return cols; }
    const m = toMat(v, 'An index');
    if (m.logical) {
      const out: number[] = [];
      m.d.forEach((x, k) => { if (x) out.push(k); });
      return out;
    }
    return [...m.d].map((x) => {
      if (!Number.isInteger(x) || x < 1) throw new LabError(`Indexes start at 1 and must be whole numbers (got ${x}).`);
      return x - 1;
    });
  }
  private withEnd(a: Expr, endHere: number, f: Frame): Value {
    const sub = (e: Expr): Expr => {
      switch (e.k) {
        case 'end': return { k: 'num', v: endHere };
        case 'bin': return { ...e, a: sub(e.a), b: sub(e.b) };
        case 'un': case 'post': return { ...e, a: sub(e.a) };
        case 'range': return { ...e, from: sub(e.from), step: e.step && sub(e.step), to: sub(e.to) };
        case 'matrix': return { ...e, rows: e.rows.map((r) => r.map(sub)) };
        case 'index': return e.of.k === 'id' && !f.vars.has(e.of.name) ? { ...e, args: e.args.map(sub) } : e;
        default: return e;
      }
    };
    return this.ev(sub(a), f);
  }

  // ——— Calls ———
  /** A function by name: one written in the script, else a built-in. */
  call(name: string, args: Value[], nout: number, f?: Frame): Value[] {
    const user = this.fns.get(name);
    if (user) return this.callUser(user, args, nout, f?.depth ?? 0);
    if (name === 'nargin' && f) return [num(f.nargin)];
    if (name === 'nargout' && f) return [num(f.nargout)];
    if (name === 'exist' && f) { const n = args[0] ? textOf(args[0]) : ''; const files = this.host.files as { has?(n: string): boolean } | undefined; return [num(f.vars.has(n) ? 1 : files?.has?.(n) ? 2 : this.fns.has(n) || BUILTINS[n] ? 5 : 0)]; }
    const b = BUILTINS[name];
    if (!b) throw new LabError(`“${name}” isn’t a variable or a function I know.${suggest(name)}`);
    // A class name at the end makes the result that type: zeros(2, 'uint8'), ones(3, 'like', x) (M386).
    const last = args[args.length - 1], like = args.length >= 2 && args[args.length - 2]?.k === 'str' && /^like$/i.test((args[args.length - 2] as { v: string }).v);
    if (MAKERS.has(name) && (like || (last?.k === 'str' && (isNumClass(last.v) || last.v === 'double')))) {
      const target = like ? (last.k === 'mat' ? last.cls : undefined) : (last as { v: string }).v === 'double' ? undefined : ((last as { v: string }).v as NumClass);
      const outs = b(args.slice(0, like ? -2 : -1), nout, this, f);
      return outs.map((o) => (o.k === 'mat' ? cast(o, target) : o));
    }
    const outs = b(args, nout, this, f);
    const first = args[0];
    if (first?.k !== 'mat' || !(first.cls || first.nd)) return outs;
    return outs.map((o) => {
      if (o.k !== 'mat') return o;
      let r = o;
      // More than three dimensions: a result of the same size keeps its shape.
      if (first.nd && !o.nd && !RESHAPERS.has(name) && o.r === first.r && o.c === first.c && (o.p ?? 1) === (first.p ?? 1)) r = { ...r, nd: first.nd };
      if (first.cls && !o.cls && !o.logical && KEEP_TYPE.has(name)) r = cast(r, first.cls);
      return r;
    });
  }
  callFn(fn: Fn | Value, args: Value[], nout = 1): Value[] {
    if (fn.k === 'str') return this.call(fn.v, args, nout);
    if (fn.k !== 'fn') throw new LabError(`A function handle (like @sin) was expected, not ${kind(fn)}.`);
    if (fn.name) return this.call(fn.name, args, nout);
    const vars = new Map(fn.closure);
    fn.params!.forEach((p, i) => { if (i < args.length) { shared.add(args[i]); vars.set(p, args[i]); } });
    return this.evalMulti(fn.body!, { vars, nargin: args.length, nargout: nout, depth: 1 }, nout);
  }
  private callUser(fd: FnDef, args: Value[], nout: number, depth: number): Value[] {
    if (depth > 200) throw new LabError(`“${fd.name}” called itself more than 200 times without stopping.`);
    if (args.length > fd.params.length && !fd.varargin) throw new LabError(`“${fd.name}” takes at most ${fd.params.length} inputs, but got ${args.length}.`);
    const vars = new Map<string, Value>();
    fd.params.forEach((p, i) => { if (i < args.length && p !== '~') { shared.add(args[i]); vars.set(p, args[i]); } });
    if (fd.varargin) { const rest = args.slice(fd.params.length); vars.set('varargin', { k: 'cell', r: 1, c: rest.length, d: rest }); }
    try { this.exec(fd.body, { vars, nargin: args.length, nargout: Math.max(nout, 0), depth: depth + 1 }); } catch (e) { if (!(e instanceof Flow && e.kind === 'return')) throw e; }
    const outs: Value[] = [];
    const want = nout < 0 ? fd.outs.length : Math.max(nout, Math.min(1, fd.outs.length));
    for (let i = 0; i < Math.min(want, fd.outs.length); i++) {
      const v = vars.get(fd.outs[i]);
      if (!v) { if (i === 0 && nout === 0) break; throw new LabError(`“${fd.name}” didn’t set its output “${fd.outs[i]}”.`); }
      outs.push(v);
    }
    if (fd.varargout && outs.length < want) { const vo = vars.get('varargout'); if (vo?.k === 'cell') outs.push(...vo.d.slice(0, want - outs.length)); }
    return outs;
  }

  // ——— Operators ———
  binop(op: string, a: Value, b: Value): Value {
    if ((op === '==' || op === '~=') && a.k === 'str' && b.k === 'str' && a.v.length !== b.v.length && a.v.length !== 1 && b.v.length !== 1) throw new LabError('To compare texts of different lengths use strcmp(a, b).');
    const A = toMat(a, 'The left side'), B = toMat(b, 'The right side');
    // Whole-number types (M386): worked out in doubles, then rounded and held in the type's range.
    if (A.cls || B.cls) {
      const cls = resultClass(A, B), out = this.binop(op, cast(A, undefined), cast(B, undefined)) as Mat;
      return out.logical ? out : cast(out, cls);
    }
    if (A.im || B.im) return cbinop(op, A, B, solve);
    switch (op) {
      case '+': return zip(A, B, (x, y) => x + y);
      case '-': return zip(A, B, (x, y) => x - y);
      case '.*': return zip(A, B, (x, y) => x * y);
      case './': return zip(A, B, (x, y) => x / y);
      case '.\\': return zip(A, B, (x, y) => y / x);
      case '.^': { const out = zip(A, B, Math.pow); return out.d.some(Number.isNaN) && A.d.some((x) => x < 0) ? cbinop('.^', A, B, solve) : out; }
      case '*': return isScalar(A) || isScalar(B) ? zip(A, B, (x, y) => x * y) : matmul(A, B);
      case '/': return isScalar(B) ? zip(A, B, (x, y) => x / y) : transpose(solve(transpose(B) as Mat, transpose(A) as Mat)) as Mat;
      case '\\': return isScalar(A) ? zip(A, B, (x, y) => y / x) : solve(A, B);
      case '^': return mpower(A, B);
      case '==': return logic(zip(A, B, (x, y) => +(x === y)));
      case '~=': return logic(zip(A, B, (x, y) => +(x !== y)));
      case '<': return logic(zip(A, B, (x, y) => +(x < y)));
      case '<=': return logic(zip(A, B, (x, y) => +(x <= y)));
      case '>': return logic(zip(A, B, (x, y) => +(x > y)));
      case '>=': return logic(zip(A, B, (x, y) => +(x >= y)));
      case '&': return logic(zip(A, B, (x, y) => +(x !== 0 && y !== 0)));
      case '|': return logic(zip(A, B, (x, y) => +(x !== 0 || y !== 0)));
    }
    throw new LabError(`I don’t know the operator “${op}”.`);
  }
}

// ——— Matrix helpers (shared with builtins.ts) ———

export const textOf = (v: Value): string => (v.k === 'str' ? v.v : v.k === 'mat' ? String.fromCharCode(...v.d) : (() => { throw new LabError(`Text was expected, not ${kind(v)}.`); })());
const logic = (m: Mat): Mat => ({ ...m, logical: true });
export const map1 = (m: Mat, fn: (x: number) => number): Mat => mat(m.r, m.c, m.d.map(fn));

/** Element by element, with MATLAB's implicit expansion (a row and a column make a grid). */
export function zip(a: Mat, b: Mat, fn: (x: number, y: number) => number): Mat {
  const pa = a.p ?? 1, pb = b.p ?? 1;
  if (a.r === b.r && a.c === b.c && pa === pb) { const d = new Float64Array(a.d.length); for (let i = 0; i < d.length; i++) d[i] = fn(a.d[i], b.d[i]); const o = mat(a.r, a.c, d); if (a.nd || b.nd) o.nd = a.nd ?? b.nd; return o; }
  const grow = (x: number, y: number) => (x === y ? x : x === 1 ? y : y === 1 ? x : -1);
  const r = grow(a.r, b.r), c = grow(a.c, b.c), p = grow(pa, pb);
  const size = (m: Mat, q: number) => `${m.r}x${m.c}${q > 1 ? `x${q}` : ''}`;
  if (r < 0 || c < 0 || p < 0) throw new LabError(`Sizes don’t match: ${size(a, pa)} and ${size(b, pb)}.`);
  const d = new Float64Array(r * c * p), na = a.r * a.c, nb = b.r * b.c;
  for (let k = 0; k < p; k++) for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) {
    d[i + j * r + k * r * c] = fn(a.d[(a.r === 1 ? 0 : i) + (a.c === 1 ? 0 : j) * a.r + (pa === 1 ? 0 : k) * na], b.d[(b.r === 1 ? 0 : i) + (b.c === 1 ? 0 : j) * b.r + (pb === 1 ? 0 : k) * nb]);
  }
  const o = mat(r, c, d);
  const nd = (pa === p && a.nd) || (pb === p && b.nd);
  if (nd) o.nd = nd;
  return o;
}
const flatOnly = (m: Mat, what: string) => { if ((m.p ?? 1) > 1) throw new LabError(`${what} works on 2D matrices; for a 3D array, work page by page (A(:, :, k)) or use permute.`); };
export function matmul(a: Mat, b: Mat): Mat {
  flatOnly(a, '*'); flatOnly(b, '*');
  if (a.c !== b.r) throw new LabError(`Can’t multiply a ${a.r}x${a.c} by a ${b.r}x${b.c} matrix: the inner sizes must match (use .* to multiply element by element).`);
  const d = new Float64Array(a.r * b.c);
  for (let j = 0; j < b.c; j++) for (let k = 0; k < a.c; k++) { const bk = b.d[k + j * b.r]; if (bk === 0) continue; for (let i = 0; i < a.r; i++) d[i + j * a.r] += a.d[i + k * a.r] * bk; }
  return mat(a.r, b.c, d);
}
export function transpose(v: Value): Value {
  if (v.k === 'cell') { const d: Value[] = []; for (let i = 0; i < v.r; i++) for (let j = 0; j < v.c; j++) d.push(v.d[i + j * v.r]); return { k: 'cell', r: v.c, c: v.r, d }; }
  if (v.k === 'str') return v.v.length <= 1 ? v : mat(v.v.length, 1, [...v.v].map((ch) => ch.charCodeAt(0)));
  const m = toMat(v);
  flatOnly(m, 'Transposing (\')');
  const d = new Float64Array(m.d.length), im = m.im ? new Float64Array(m.d.length) : null;
  for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) { d[j + i * m.c] = m.d[i + j * m.r]; if (im) im[j + i * m.c] = m.im![i + j * m.r]; }
  return { ...mat(m.c, m.r, d), ...(m.logical ? { logical: true } : {}), ...(im ? { im } : {}), ...(m.cls ? { cls: m.cls } : {}) };
}
function mpower(a: Mat, b: Mat): Mat {
  if (isScalar(a) && isScalar(b)) { const v = a.d[0] ** b.d[0]; return Number.isNaN(v) && a.d[0] < 0 ? cbinop('^', a, b, solve) : num(v); }
  if (a.r !== a.c || !isScalar(b)) throw new LabError('“^” needs a square matrix and a whole-number power; use .^ for each element.');
  let p = b.d[0];
  if (!Number.isInteger(p)) throw new LabError('A matrix power must be a whole number here.');
  let base = p < 0 ? inv(a) : a, out = eye(a.r);
  p = Math.abs(p);
  while (p > 0) { if (p & 1) out = matmul(out, base); base = matmul(base, base); p >>= 1; }
  return out;
}
export const eye = (n: number, m = n): Mat => { const o = mat(n, m); for (let i = 0; i < Math.min(n, m); i++) o.d[i + i * n] = 1; return o; };
export function range(a: number, s: number, b: number): Mat {
  if (s === 0 || (s > 0 && a > b) || (s < 0 && a < b) || [a, s, b].some(Number.isNaN)) return mat(1, 0);
  const n = Math.floor((b - a) / s + 1e-10) + 1;
  if (n > 5e7) throw new LabError('That range is too long (over 50 million numbers).');
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = a + i * s;
  return mat(1, n, d);
}

/** A \ B: Gaussian elimination with partial pivoting for a square A; least squares (QR) otherwise. */
export function solve(A: Mat, B: Mat): Mat {
  if (A.r !== B.r) throw new LabError(`A\\B needs the same number of rows (${A.r} and ${B.r}).`);
  if (A.r !== A.c) return lstsq(A, B);
  const n = A.r, m = B.c, a = Float64Array.from(A.d), b = Float64Array.from(B.d);
  let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i + k * n]) > Math.abs(a[p + k * n])) p = i;
    if (Math.abs(a[p + k * n]) < 1e-14) { singular = true; continue; }
    if (p !== k) { for (let j = 0; j < n; j++) [a[k + j * n], a[p + j * n]] = [a[p + j * n], a[k + j * n]]; for (let j = 0; j < m; j++) [b[k + j * n], b[p + j * n]] = [b[p + j * n], b[k + j * n]]; }
    for (let i = k + 1; i < n; i++) {
      const l = a[i + k * n] / a[k + k * n];
      if (l === 0) continue;
      for (let j = k; j < n; j++) a[i + j * n] -= l * a[k + j * n];
      for (let j = 0; j < m; j++) b[i + j * n] -= l * b[k + j * n];
    }
  }
  const x = new Float64Array(n * m);
  for (let j = 0; j < m; j++) for (let i = n - 1; i >= 0; i--) {
    let s = b[i + j * n];
    for (let k = i + 1; k < n; k++) s -= a[i + k * n] * x[k + j * n];
    x[i + j * n] = s / a[i + i * n];
  }
  if (singular) warnOnce = 'Warning: the matrix is singular to working precision (the answer may be Inf or NaN).';
  return mat(n, m, x);
}
/** The last warning a solve raised, for the command window to show once. */
export let warnOnce = '';
export const takeWarning = () => { const w = warnOnce; warnOnce = ''; return w; };

function lstsq(A: Mat, B: Mat): Mat {
  // Householder QR: R x = Qᵀ b (the least-squares answer when A is tall; the minimum-step answer otherwise).
  const m = A.r, n = A.c, a = Float64Array.from(A.d), b = Float64Array.from(B.d), k = B.c;
  const steps = Math.min(m, n);
  for (let j = 0; j < steps; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm += a[i + j * m] ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = a[j + j * m] > 0 ? -norm : norm;
    const v = new Float64Array(m);
    for (let i = j; i < m; i++) v[i] = a[i + j * m];
    v[j] -= alpha;
    const vv = v.reduce((s, x) => s + x * x, 0);
    if (vv === 0) continue;
    for (let c = j; c < n; c++) { let s = 0; for (let i = j; i < m; i++) s += v[i] * a[i + c * m]; s = (2 * s) / vv; for (let i = j; i < m; i++) a[i + c * m] -= s * v[i]; }
    for (let c = 0; c < k; c++) { let s = 0; for (let i = j; i < m; i++) s += v[i] * b[i + c * m]; s = (2 * s) / vv; for (let i = j; i < m; i++) b[i + c * m] -= s * v[i]; }
  }
  const x = new Float64Array(n * k);
  for (let c = 0; c < k; c++) for (let i = steps - 1; i >= 0; i--) {
    let s = b[i + c * m];
    for (let j = i + 1; j < steps; j++) s -= a[i + j * m] * x[j + c * n];
    x[i + c * n] = Math.abs(a[i + i * m]) < 1e-14 ? 0 : s / a[i + i * m];
  }
  return mat(n, k, x);
}
export function inv(A: Mat): Mat {
  if (A.r !== A.c) throw new LabError('inv needs a square matrix.');
  return solve(A, eye(A.r));
}

/** Rows of values side by side, then the rows on top of each other ([a b; c d]). Text joins as text. */
export function concat(rows: Value[][]): Value {
  // A whole-number type wins (the first one met), as MATLAB joins them.
  const typed = rows.flat().find((v): v is Mat => v.k === 'mat' && !!v.cls);
  if (typed) { const out = concat(rows.map((r) => r.map((v) => (v.k === 'mat' && v.cls ? cast(v, undefined) : v)))); return out.k === 'mat' ? cast(out, typed.cls) : out; }
  // Tables join as tables: [T1; T2] adds rows, [T1, T2] adds columns.
  if (rows.flat().length > 1 && rows.flat().every((v) => isTable(v))) return joinTables(rows as Struct[][]);
  // 3D arrays join page by page (a plain matrix joins every page).
  const P = Math.max(...rows.flat().map(pages), 1);
  if (P > 1) {
    if (rows.flat().some((v) => pages(v) > 1 && pages(v) !== P)) throw new LabError('3D arrays joined together must have the same number of pages.');
    return stack(Array.from({ length: P }, (_, k) => toMat(concat(rows.map((r) => r.map((v) => (v.k === 'mat' && pages(v) > 1 ? page(v, k) : v)))))));
  }
  if (rows.some((r) => r.some(isComplex))) {
    const re = concat(rows.map((r) => r.map((v) => (v.k === 'mat' ? { ...v, im: undefined } : v)))) as Mat;
    const im = concat(rows.map((r) => r.map((v) => (v.k === 'mat' ? mat(v.r, v.c, imOf(v)) : v)))) as Mat;
    return cmat(re.r, re.c, re.d, im.d);
  }
  type Piece = Value | { cell: Value[] } | null;
  const joined = rows.map((r): Piece => {
    const parts = r.filter((v) => numel(v) > 0 || v.k === 'cell');
    if (parts.some((v) => v.k === 'cell')) return { cell: parts };
    if (parts.length && parts.every((v) => v.k === 'str' || v.k === 'mat') && parts.some((v) => v.k === 'str')) return str(parts.map((v) => (v.k === 'str' ? v.v : String.fromCharCode(...(v as Mat).d))).join(''));
    if (!parts.length) return null;
    const ms = parts.map((v) => toMat(v));
    const h = ms[0].r;
    if (ms.some((m) => m.r !== h)) throw new LabError(`Can’t put these side by side: they have ${ms.map((m) => m.r).join(' and ')} rows.`);
    const c = ms.reduce((s, m) => s + m.c, 0), d = new Float64Array(h * c);
    let off = 0;
    for (const m of ms) { d.set(m.d, off); off += m.d.length; }
    return { ...mat(h, c, d), ...(ms.every((m) => m.logical) ? { logical: true } : {}) };
  });
  if (joined.some((x) => x && 'cell' in x && !('k' in x))) {
    const cells = joined.flatMap((x): Value[] => (!x ? [] : 'k' in x ? [x] : x.cell));
    const d = cells.flatMap((v) => (v.k === 'cell' ? v.d : [v]));
    return { k: 'cell', r: 1, c: d.length, d };
  }
  const present = joined.filter((x): x is Value => !!x && 'k' in x);
  if (!present.length) return empty();
  if (present.length === 1) return present[0];
  if (present.every((v) => v.k === 'str')) {
    const lens = new Set(present.map((v) => (v as { v: string }).v.length));
    if (lens.size > 1) throw new LabError('Text rows stacked with ; must be the same length (use a cell { } for different lengths).');
    return str(present.map((v) => (v as { v: string }).v).join('\n'));
  }
  const ms = present.map((v) => toMat(v));
  const c = ms[0].c;
  if (ms.some((m) => m.c !== c)) throw new LabError(`Can’t stack these: they have ${ms.map((m) => m.c).join(' and ')} columns.`);
  const r = ms.reduce((s, m) => s + m.r, 0), d = new Float64Array(r * c);
  let top = 0;
  for (const m of ms) { for (let j = 0; j < c; j++) for (let i = 0; i < m.r; i++) d[top + i + j * r] = m.d[i + j * m.r]; top += m.r; }
  return mat(r, c, d);
}

// ——— Indexing ———
const positions = (idx: Idx, n: number) => (idx === 'all' ? Array.from({ length: n }, (_, i) => i) : idx);

export function getIndex(v: Value, idx: Idx[]): Value {
  if (v.k === 'struct' && v.table) {
    if (idx.length !== 2) throw new LabError('Index a table with rows and columns: T(rows, :) or T(:, \'name\').');
    return pickTable(v, idx[0], idx[1]);
  }
  if (v.k === 'mat' && v.im) { const re = getIndex({ ...v, im: undefined }, idx) as Mat, im = getIndex(mat(v.r, v.c, v.im), idx) as Mat; return cmat(re.r, re.c, re.d, im.d); }
  if (v.k === 'mat' && v.cls) { const out = getIndex(cast(v, undefined), idx); return out.k === 'mat' ? { ...out, cls: v.cls } : out; }
  if (v.k === 'mat' && (pages(v) > 1 || idx.length >= 3)) {
    const P = pages(v), n = v.r * v.c;
    // One or two indices fold the pages into the columns, as MATLAB does.
    if (idx.length < 3) return getIndex({ ...v, c: v.c * P, p: undefined, nd: undefined }, idx);
    const rows = positions(idx[0], v.r), cols = positions(idx[1], v.c);
    for (const i of rows) if (i >= v.r) throw new LabError(`Row ${i + 1} is past the end: there are ${v.r}.`);
    for (const j of cols) if (j >= v.c) throw new LabError(`Column ${j + 1} is past the end: there are ${v.c}.`);
    const { pages: pg, sizes } = pagePlaces(v, idx.slice(2));
    const out = new Float64Array(rows.length * cols.length * pg.length);
    let t = 0;
    for (const k of pg) for (const j of cols) for (const i of rows) out[t++] = v.d[i + j * v.r + k * n];
    const res = mat(rows.length, cols.length, out, v.logical);
    if (rows.length * cols.length === 0 && pg.length > 1) res.p = pg.length;
    const trimmed = trimSizes(sizes);
    if (trimmed.length > 1) res.nd = trimmed;
    return res;
  }
  if (v.k === 'struct' || v.k === 'fn') {
    if (idx.every((x) => x === 'all' || (x.length === 1 && x[0] === 0))) return v;
    throw new LabError(`Index past the end: this ${kind(v)} has 1 element.`);
  }
  const [r, c] = sizeOf(v), n = r * c;
  const pick = <T>(from: (k: number) => T, make: (rr: number, cc: number, items: T[]) => Value): Value => {
    if (idx.length === 0) return v;
    if (idx.length === 1) {
      const p = positions(idx[0], n);
      for (const k of p) if (k >= n) throw new LabError(`Index ${k + 1} is past the end: this has ${n} element${n === 1 ? '' : 's'}.`);
      const items = p.map(from);
      // A vector keeps its direction; ":" gives a column; otherwise the index's own shape (a row here).
      if (idx[0] === 'all') return make(items.length, 1, items);
      return r === 1 || (r !== 1 && c !== 1 && false) ? make(1, items.length, items) : c === 1 ? make(items.length, 1, items) : make(1, items.length, items);
    }
    const rows = positions(idx[0], r), cols = positions(idx[1], c);
    for (const i of rows) if (i >= r) throw new LabError(`Row ${i + 1} is past the end: there are ${r}.`);
    for (const j of cols) if (j >= c) throw new LabError(`Column ${j + 1} is past the end: there are ${c}.`);
    for (const x of idx.slice(2)) if (x !== 'all' && x.some((k) => k !== 0)) throw new LabError('Only two dimensions (rows and columns) are supported.');
    const items: T[] = [];
    for (const j of cols) for (const i of rows) items.push(from(i + j * r));
    return make(rows.length, cols.length, items);
  };
  if (v.k === 'str') return pick((k) => v.v[k], (rr, cc, items) => (rr <= 1 ? str(items.join('')) : mat(rr, cc, items.map((ch) => ch.charCodeAt(0)))));
  if (v.k === 'cell') return pick((k) => v.d[k], (rr, cc, items) => ({ k: 'cell', r: rr, c: cc, d: items }));
  return pick((k) => v.d[k], (rr, cc, items) => ({ ...mat(rr, cc, items), ...(v.logical ? { logical: true } : {}) }));
}
function getCell(v: Value, idx: Idx[]): Value[] {
  if (isTable(v)) {
    if (idx.length !== 2) throw new LabError('Take values from a table with rows and columns: T{rows, \'name\'}.');
    return [contents(v, idx[0], idx[1])];
  }
  if (v.k !== 'cell') throw new LabError(`{ } only works on a cell, not on ${kind(v)} (use ( ) instead).`);
  const sub = getIndex(v, idx) as Cell;
  return sub.d;
}

/** x(idx) = v: grows the matrix when needed (filled with 0), [] deletes, a scalar fills every position. */
function setIndex(base: Value | undefined, idx: Idx[], v: Value, inPlace: boolean): Value {
  // A typed array keeps its type; a new or empty one takes the value's (M386).
  const cls = base?.k === 'mat' && base.d.length ? base.cls : v.k === 'mat' ? v.cls : undefined;
  if ((base?.k === 'mat' && base.cls) || (v.k === 'mat' && v.cls)) {
    const out = setIndex(base?.k === 'mat' ? cast(base, undefined) : base, idx, v.k === 'mat' ? cast(v, undefined) : v, false);
    return out.k === 'mat' && cls ? cast(out, cls) : out;
  }
  if (isTable(base)) {
    if (idx.length !== 2) throw new LabError('Index a table with rows and columns: T(rows, :) = [].');
    if (v.k === 'mat' && !v.d.length) return removeRows(base, idx[0], idx[1]);
    if (isTable(v) && idx[1] === 'all' && idx[0] !== 'all') { let t = base; for (const [n, col] of v.f) t = setValues(t, idx[0], [[...t.f.keys()].indexOf(n)], col); return t; }
    throw new LabError('To change values in a table, use braces: T{rows, \'name\'} = values (or T.name(rows) = values).');
  }
  if ((base && isComplex(base)) || isComplex(v)) {
    const B = base ? toMat(base) : undefined, V = toMat(v);
    if (!V.d.length) { const re = setIndex(B && { ...B, im: undefined }, idx, V, false) as Mat, im = setIndex(B && mat(B.r, B.c, imOf(B)), idx, V, false) as Mat; return cmat(re.r, re.c, re.d, im.d); }
    const re = setIndex(B && { ...B, im: undefined }, idx, mat(V.r, V.c, V.d), false) as Mat, im = setIndex(B && mat(B.r, B.c, imOf(B)), idx, mat(V.r, V.c, imOf(V)), false) as Mat;
    return cmat(re.r, re.c, re.d, im.d);
  }
  if (base?.k === 'cell' || (v.k === 'cell' && (!base || numel(base) === 0))) {
    const b: Cell = base?.k === 'cell' ? base : { k: 'cell', r: 0, c: 0, d: [] };
    if (v.k !== 'cell') throw new LabError('Use { } to put a value inside a cell: c{2} = 5.');
    return place(b, idx, v.d.length === 1 ? (() => v.d[0]) : (k) => v.d[k], v.d.length, () => empty(), (r, c, d) => ({ k: 'cell', r, c, d }), false) as Cell;
  }
  if (base && base.k !== 'mat' && base.k !== 'str') throw new LabError(`Can’t index into ${kind(base)} with ( ).`);
  if ((!base || base.k === 'mat') && idx.length >= 3) return place3(base ? toMat(base) : mat(0, 0), idx, toMat(v));
  if (base?.k === 'mat' && pages(base) > 1) {
    // One or two indices into a 3D array: its pages continue its columns, and the size must stay.
    const P = pages(base), out = setIndex({ ...base, c: base.c * P, p: undefined }, idx, v, false);
    if (out.k === 'mat' && out.r === base.r && out.c === base.c * P) return { ...out, c: base.c, p: P };
    throw new LabError('That would change the size of a 3D array; use three indices, A(i, j, k) = ….');
  }
  const isText = base?.k === 'str' || (!base && v.k === 'str');
  const B = base ? toMat(base) : mat(0, 0), V = toMat(v);
  // x(i) = [] deletes.
  if (V.d.length === 0 && v.k === 'mat') return remove(B, idx, isText);
  const out = place(B, idx, V.d.length === 1 ? (() => V.d[0]) : (k) => V.d[k], V.d.length, () => 0, (r, c, d) => mat(r, c, d), inPlace) as Mat;
  if (base?.k === 'mat' && base.logical && V.logical) out.logical = true;
  return isText && out.r <= 1 ? str(String.fromCharCode(...out.d)) : out;
}
function place<T>(b: { r: number; c: number; d: ArrayLike<T> }, idx: Idx[], get: (k: number) => T, count: number, blank: () => T, make: (r: number, c: number, d: T[]) => unknown, inPlace: boolean): unknown {
  let r = b.r, c = b.c;
  let targets: number[];
  let nr = r, nc = c;
  if (idx.length === 1) {
    const n = r * c;
    const p = positions(idx[0], n);
    const max = p.length ? Math.max(...p) + 1 : 0;
    if (max > n) {
      if (r <= 1) { nr = 1; nc = max; } else if (c === 1) { nr = max; nc = 1; } else throw new LabError(`Can’t grow a ${r}x${c} matrix with one index; use two: A(i, j).`);
    }
    targets = p.map((k) => (nr === r ? k : k)); // linear positions in the new shape (rows and columns keep their order for vectors)
  } else {
    const rows = idx[0] === 'all' ? positions('all', r || (count && idx[1] !== 'all' ? Math.max(1, count / (idx[1] as number[]).length) : 1)) : idx[0];
    const cols = idx[1] === 'all' ? positions('all', c || (count && idx[0] !== 'all' ? Math.max(1, count / (idx[0] as number[]).length) : 1)) : idx[1];
    nr = Math.max(r, rows.length ? Math.max(...rows) + 1 : 0);
    nc = Math.max(c, cols.length ? Math.max(...cols) + 1 : 0);
    targets = [];
    for (const j of cols) for (const i of rows) targets.push(i + j * nr);
  }
  if (count !== 1 && count !== targets.length) throw new LabError(`Sizes don’t match: ${targets.length} places to fill but ${count} values given.`);
  let d: T[] | Float64Array;
  if (nr === r && nc === c && inPlace && b.d instanceof Float64Array) d = b.d as unknown as Float64Array;
  else {
    const fresh: T[] = Array.from({ length: nr * nc }, blank);
    for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) fresh[i + j * nr] = (b.d as ArrayLike<T>)[i + j * r];
    d = fresh;
  }
  targets.forEach((t, k) => { (d as T[])[t] = get(k); });
  if (d === b.d) return b;
  r = nr; c = nc;
  return make(r, c, d as T[]);
}
/** Trailing sizes without the ones at the end (MATLAB's own sizes never end in 1 past the second). */
const trimSizes = (sizes: number[]) => { const s = [...sizes]; while (s.length && s[s.length - 1] === 1) s.pop(); return s; };
/** The pages that indices past the second pick (M386: any number of dimensions), and how many along each. */
function pagePlaces(v: Mat, rest: Idx[]): { pages: number[]; sizes: number[] } {
  let dims = v.nd ?? [pages(v)];
  // Fewer indices than dimensions: the last index runs over the remaining ones together (as MATLAB folds them).
  if (rest.length < dims.length) dims = [...dims.slice(0, rest.length - 1), dims.slice(rest.length - 1).reduce((s, x) => s * x, 1)];
  const lists = rest.map((x, q) => {
    const n = dims[q] ?? 1, list = positions(x, n);
    for (const k of list) if (k >= n) throw new LabError(`Index ${k + 1} in dimension ${q + 3} is past the end: there ${n === 1 ? 'is 1' : `are ${n}`}.`);
    return list;
  });
  // The order is the first trailing index fastest (column-major).
  const sized = lists.reduce<number[][]>((acc, list) => list.flatMap((k) => acc.map((a) => [...a, k])), [[]]);
  const strides = dims.map((_, q) => dims.slice(0, q).reduce((s, x) => s * x, 1));
  return { pages: sized.map((ks) => ks.reduce((s, k, q) => s + k * strides[q], 0)), sizes: lists.map((l) => l.length) };
}
/** A(i, j, k) = v: grows rows, columns and pages as needed; A(:, :, k) = [] removes pages. */
function place3(B: Mat, idx: Idx[], V: Mat): Mat {
  // Past three dimensions, values change in place (the array keeps its size).
  if (idx.length > 3 || B.nd) {
    if (!V.d.length) throw new LabError('Deleting parts of an array with more than three dimensions isn’t supported: build a new one.');
    const rows = positions(idx[0], B.r), cols = positions(idx[1], B.c), { pages: pg } = pagePlaces(B, idx.slice(2));
    for (const i of rows) if (i >= B.r) throw new LabError(`Row ${i + 1} is past the end: there are ${B.r}.`);
    for (const j of cols) if (j >= B.c) throw new LabError(`Column ${j + 1} is past the end: there are ${B.c}.`);
    const count = rows.length * cols.length * pg.length;
    if (V.d.length !== 1 && V.d.length !== count) throw new LabError(`Sizes don’t match: ${count} places to fill but ${V.d.length} values given.`);
    const d = Float64Array.from(B.d), n = B.r * B.c;
    let t = 0;
    for (const k of pg) for (const j of cols) for (const i of rows) d[i + j * B.r + k * n] = V.d.length === 1 ? V.d[0] : V.d[t++];
    return { ...B, d, im: undefined };
  }
  const has = B.d.length > 0, r = has ? B.r : 0, c = has ? B.c : 0, P = has ? pages(B) : 0;
  if (!V.d.length) {
    if (idx[0] !== 'all' || idx[1] !== 'all') throw new LabError('To delete from a 3D array, delete whole pages: A(:, :, k) = [].');
    const drop = new Set(positions(idx[2], P)), keep = Array.from({ length: P }, (_, k) => k).filter((k) => !drop.has(k));
    return keep.length ? stack(keep.map((k) => page(B, k))) : mat(r, c > 0 ? 0 : 0);
  }
  const rows = idx[0] === 'all' ? positions('all', r || V.r) : idx[0], cols = idx[1] === 'all' ? positions('all', c || V.c) : idx[1], pg = idx[2] === 'all' ? positions('all', P || pages(V)) : idx[2];
  const nr = Math.max(r, rows.length ? Math.max(...rows) + 1 : 0), nc = Math.max(c, cols.length ? Math.max(...cols) + 1 : 0), np = Math.max(P, pg.length ? Math.max(...pg) + 1 : 0);
  const count = rows.length * cols.length * pg.length;
  if (V.d.length !== 1 && V.d.length !== count) throw new LabError(`Sizes don’t match: ${count} places to fill but ${V.d.length} values given.`);
  const d = new Float64Array(nr * nc * np);
  for (let k = 0; k < P; k++) for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) d[i + j * nr + k * nr * nc] = B.d[i + j * r + k * r * c];
  let t = 0;
  for (const k of pg) for (const j of cols) for (const i of rows) d[i + j * nr + k * nr * nc] = V.d.length === 1 ? V.d[0] : V.d[t++];
  const out = mat(nr, nc, d, !!B.logical && !!V.logical);
  if (nr * nc === 0 && np > 1) out.p = np;
  return out;
}
function remove(B: Mat, idx: Idx[], text: boolean): Value {
  let out: Mat;
  if (idx.length === 1) {
    const drop = new Set(positions(idx[0], B.d.length));
    const keep = [...B.d].filter((_, k) => !drop.has(k));
    out = B.c === 1 && B.r > 1 ? mat(keep.length, 1, keep) : mat(keep.length ? 1 : 0, keep.length, keep);
  } else if (idx[0] === 'all') {
    const drop = new Set(positions(idx[1], B.c)), cols = Array.from({ length: B.c }, (_, j) => j).filter((j) => !drop.has(j));
    out = mat(B.r, cols.length, cols.flatMap((j) => [...B.d.subarray(j * B.r, j * B.r + B.r)]));
  } else if (idx[1] === 'all') {
    const drop = new Set(positions(idx[0], B.r)), rows = Array.from({ length: B.r }, (_, i) => i).filter((i) => !drop.has(i));
    const d: number[] = [];
    for (let j = 0; j < B.c; j++) for (const i of rows) d.push(B.d[i + j * B.r]);
    out = mat(rows.length, B.c, d);
  } else throw new LabError('To delete, use A(i, :) = [] for rows or A(:, j) = [] for columns.');
  return text ? str(String.fromCharCode(...out.d)) : out;
}
function setCell(base: Value | undefined, idx: Idx[], v: Value): Value {
  if (isTable(base)) {
    if (idx.length !== 2) throw new LabError('Change table values with rows and a column: T{rows, \'name\'} = values.');
    return setValues(base, idx[0], idx[1], v);
  }
  if (base && base.k !== 'cell' && numel(base) > 0) throw new LabError(`{ } only works on a cell, not on ${kind(base)}.`);
  const b: Cell = base?.k === 'cell' ? base : { k: 'cell', r: 0, c: 0, d: [] };
  return place(b, idx, () => v, 1, () => empty(), (r, c, d) => ({ k: 'cell', r, c, d }), false) as Cell;
}

/** "Did you mean…?" for a name typed wrong. */
function suggest(name: string): string {
  const all = Object.keys(BUILTINS);
  const near = all.filter((n) => n !== name && lev(n, name) <= Math.max(1, Math.floor(name.length / 4))).slice(0, 3);
  return near.length ? ` Did you mean ${near.map((n) => `“${n}”`).join(' or ')}?` : '';
}
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export { inline };

// ——— 3D arrays in column functions (M382) ———
// Functions that work down columns (sum, max, sort…) run on each page of a 3D array, as MATLAB's do; with dim = 3
// they work along the pages instead (each element's values across the pages become one column).
const ALONG: Record<string, number | null> = {
  sum: 1, prod: 1, mean: 1, median: 1, mode: 1, cumsum: 1, cumprod: 1, cummax: 1, cummin: 1, any: 1, all: 1, max: 2, min: 2, std: 2, var: 2, diff: 2, sort: 1,
  fliplr: null, flipud: null, rot90: null, circshift: null, triu: null, tril: null, trapz: null, cumtrapz: null, bounds: null, normalize: null, rescale: null,
};
for (const [name, at] of Object.entries(ALONG)) {
  const f = BUILTINS[name];
  if (!f) continue;
  BUILTINS[name] = (a, nout, lab, frame) => {
    const m = a[0];
    if (!(m?.k === 'mat' && pages(m) > 1)) return f(a, nout, lab, frame);
    // max(A, B) and min(A, B) are element by element (zip handles the pages).
    if ((name === 'max' || name === 'min') && a.length >= 2 && numel(a[1]) > 0) return f(a, nout, lab, frame);
    const P = pages(m), n = m.r * m.c;
    const dim = at !== null && a[at]?.k === 'mat' && numel(a[at]) === 1 ? (a[at] as Mat).d[0] : null;
    // Along a dimension the array doesn't have: each value stays itself (as sum(A, 4) of a 3D array is A).
    if (dim !== null && dim > 3 && !m.nd) return [m];
    if (dim !== null && (dim > 3 || (dim === 3 && m.nd))) throw new LabError(`${name} along dimension ${dim} of an array with more than three dimensions isn’t supported: reshape it first.`);
    if (dim === 3) {
      const T = mat(P, n);
      for (let k = 0; k < P; k++) for (let e = 0; e < n; e++) T.d[k + e * P] = m.d[e + k * n];
      if (m.im) { T.im = new Float64Array(P * n); for (let k = 0; k < P; k++) for (let e = 0; e < n; e++) T.im[k + e * P] = m.im[e + k * n]; }
      const args = [...a]; args[0] = T; args[at!] = num(1);
      return f(args, nout, lab, frame).map((v) => {
        if (v.k !== 'mat' || v.c !== n) return v;
        const q = v.r, o = mat(m.r, m.c, new Float64Array(n * q), v.logical);
        for (let k = 0; k < q; k++) for (let e = 0; e < n; e++) o.d[e + k * n] = v.d[k + e * q];
        if (v.im) { o.im = new Float64Array(n * q); for (let k = 0; k < q; k++) for (let e = 0; e < n; e++) o.im[e + k * n] = v.im[k + e * q]; }
        return o;
      });
    }
    const outs = Array.from({ length: P }, (_, k) => f(a.map((x, i) => (i === 0 || (x.k === 'mat' && pages(x) === P) ? page(x as Mat, k) : x)), nout, lab, frame));
    return outs[0].map((_, i) => { const st = stack(outs.map((o) => toMat(o[i]))); if (m.nd) st.nd = m.nd; return st; });
  };
}

/** Functions whose job is to change an array's shape (their result's sizes are their own). */
const RESHAPERS = new Set(['squeeze', 'reshape', 'permute', 'ipermute', 'cat', 'horzcat', 'vertcat', 'repmat']);
/** Functions that make arrays and take a type at the end. */
const MAKERS = new Set(['zeros', 'ones', 'eye', 'rand', 'randn', 'randi', 'inf', 'Inf', 'nan', 'NaN', 'cast']);
/** Functions whose result keeps a whole-number type in MATLAB (sum included: it saturates, as MATLAB's does). */
const KEEP_TYPE = new Set(['abs', 'round', 'floor', 'ceil', 'fix', 'sign', 'mod', 'rem', 'min', 'max', 'sort', 'fliplr', 'flipud', 'flip', 'rot90', 'circshift', 'reshape', 'repmat', 'squeeze', 'permute', 'ipermute', 'cat', 'horzcat', 'vertcat', 'unique', 'sum', 'prod', 'cumsum', 'cumprod', 'diff', 'cummax', 'cummin', 'triu', 'tril', 'diag', 'kron', 'bounds', 'mode', 'median', 'transpose', 'circshift', 'sortrows', 'imresize', 'rgb2gray', 'bitand', 'bitor', 'bitxor', 'bitshift', 'idivide']);
