import { isFormula, parseFormula, type Ast } from './formula';
import { FUNCTIONS, Fail, type Ctx } from './functions';
import { MAX_ROWS, cellOf, keyOf, type Area } from './refs';
import { compare, err, isErr, isM, readInput, toNum, toText, type M, type V } from './values';

// Working out a workbook (Stage 5 · Office suite): each cell's value from what's typed in it, with
// formulas reading other cells (on any sheet), and loops (A1 = B1, B1 = A1) shown as #CIRC!.
// Values are worked out when asked for and kept until something changes (`clear()`); a sheet is
// worked out top to bottom first, so a long column of running totals never goes deep.
// Import-free; tested in calc.test.ts.

export interface Source {
  /** The sheet's id for a name as a formula writes it (any case); null if there's none. */
  idOf(name: string): string | null;
  /** What's typed in a cell (undefined: empty). */
  raw(sheet: string, key: string): string | undefined;
  /** Every non-empty cell's key on a sheet. */
  keys(sheet: string): Iterable<string>;
}

const MAX_DEPTH = 1200;
const MAX_AREA = 250_000;

export class Calc {
  private vals = new Map<string, Map<string, V>>();
  private busy = new Set<string>();
  private asts = new Map<string, Ast | null>();
  private rows = new Map<string, number>();
  private warmed = new Set<string>();
  private depth = 0;
  constructor(private src: Source, private opts: { now?: () => number; rand?: () => number } = {}) {}

  /** Something changed: values are worked out again when next asked for. */
  clear() { this.vals.clear(); this.rows.clear(); this.warmed.clear(); if (this.asts.size > 20_000) this.asts.clear(); }

  /** A cell's value. */
  value(sheet: string, r: number, c: number): V {
    if (this.depth === 0 && !this.warmed.has(sheet)) this.warm(sheet);
    return this.get(sheet, keyOf(r, c), r, c);
  }

  /** The last row with anything in it, plus one (whole-column references stop there). */
  usedRows(sheet: string): number {
    let n = this.rows.get(sheet);
    if (n == null) {
      n = 0;
      for (const k of this.src.keys(sheet)) { const x = cellOf(k); if (x && x.r + 1 > n) n = x.r + 1; }
      this.rows.set(sheet, n);
    }
    return n;
  }

  private warm(sheet: string) {
    this.warmed.add(sheet);
    const cells = [...this.src.keys(sheet)].map((k) => ({ k, at: cellOf(k) })).filter((x) => x.at && isFormula(this.src.raw(sheet, x.k) ?? ''));
    cells.sort((a, b) => a.at!.r - b.at!.r || a.at!.c - b.at!.c);
    for (const x of cells) this.get(sheet, x.k, x.at!.r, x.at!.c);
  }

  private get(sheet: string, key: string, r: number, c: number): V {
    let m = this.vals.get(sheet);
    if (!m) { m = new Map(); this.vals.set(sheet, m); }
    const have = m.get(key);
    if (have !== undefined) return have;
    const raw = this.src.raw(sheet, key);
    if (raw === undefined || raw === '') return null;
    if (!isFormula(raw)) { const v = readInput(raw).v; m.set(key, v); return v; }
    const id = `${sheet}\u0000${key}`;
    if (this.busy.has(id)) return err('#CIRC!');
    if (this.depth > MAX_DEPTH) return err('#NUM!');
    this.busy.add(id);
    this.depth++;
    let v: V;
    try {
      const ast = this.parse(raw.slice(1));
      v = ast ? this.evalTop(ast, sheet, r, c) : err('#NAME?');
    } finally { this.depth--; this.busy.delete(id); }
    m.set(key, v);
    return v;
  }

  private parse(src: string): Ast | null {
    let a = this.asts.get(src);
    if (a === undefined) { a = parseFormula(src); this.asts.set(src, a); }
    return a;
  }

  private evalTop(ast: Ast, sheet: string, r: number, c: number): V {
    const out = this.eval(ast, this.ctx(sheet, r, c));
    const v = isM(out) ? (out[0]?.[0] ?? null) : out;
    return typeof v === 'number' && !Number.isFinite(v) ? err('#NUM!') : v === null ? 0 : v;
  }

  private ctx(sheet: string, r: number, c: number): Ctx {
    const resolve = (name: string | null) => (name == null ? sheet : this.src.idOf(name));
    return {
      here: { r, c },
      now: this.opts.now?.() ?? Date.now(),
      rand: this.opts.rand ?? Math.random,
      cell: (name, rr, cc) => { const id = resolve(name); return id == null ? err('#REF!') : this.get(id, keyOf(rr, cc), rr, cc); },
      area: (name, a: Area): M => {
        const id = resolve(name);
        if (id == null) return [[err('#REF!')]];
        // Whole columns (A:A) stop at the last row used.
        const r2 = a.r2 === MAX_ROWS - 1 && a.r1 === 0 ? Math.max(0, this.usedRows(id) - 1) : a.r2;
        if ((r2 - a.r1 + 1) * (a.c2 - a.c1 + 1) > MAX_AREA) return [[err('#NUM!')]];
        const out: M = [];
        for (let rr = a.r1; rr <= r2; rr++) {
          const row: V[] = [];
          for (let cc = a.c1; cc <= a.c2; cc++) row.push(this.get(id, keyOf(rr, cc), rr, cc));
          out.push(row);
        }
        return out;
      },
    };
  }

  private eval(a: Ast, ctx: Ctx): V | M {
    switch (a.k) {
      case 'num': case 'str': case 'bool': return a.v;
      case 'err': return err(a.v);
      case 'name': return err('#NAME?');
      case 'ref': return ctx.cell(a.sheet, a.r, a.c);
      case 'area': return ctx.area(a.sheet, a);
      case 'un': {
        const v = one(this.eval(a.a, ctx));
        if (a.op === '+') return v;
        const n = toNum(v);
        return isErr(n) ? n : -n;
      }
      case 'pct': { const n = toNum(one(this.eval(a.a, ctx))); return isErr(n) ? n : n / 100; }
      case 'bin': {
        const x = one(this.eval(a.a, ctx)), y = one(this.eval(a.b, ctx));
        if (isErr(x)) return x;
        if (isErr(y)) return y;
        if (a.op === '&') { const p = toText(x), q = toText(y); return isErr(p) ? p : isErr(q) ? q : p + q; }
        if (a.op === '=' || a.op === '<>' || a.op === '<' || a.op === '>' || a.op === '<=' || a.op === '>=') {
          const d = compare(x, y);
          return a.op === '=' ? d === 0 : a.op === '<>' ? d !== 0 : a.op === '<' ? d < 0 : a.op === '>' ? d > 0 : a.op === '<=' ? d <= 0 : d >= 0;
        }
        const p = toNum(x), q = toNum(y);
        if (isErr(p)) return p;
        if (isErr(q)) return q;
        switch (a.op) {
          case '+': return p + q;
          case '-': return p - q;
          case '*': return p * q;
          case '/': return q === 0 ? err('#DIV/0!') : p / q;
          case '^': { if (p === 0 && q < 0) return err('#DIV/0!'); const v = p ** q; return Number.isFinite(v) ? v : err('#NUM!'); }
        }
        return err('#VALUE!');
      }
      case 'fn': {
        const f = FUNCTIONS[a.name];
        if (!f) return err('#NAME?');
        try {
          const v = f(a.args, (x) => this.eval(x, ctx), ctx);
          return typeof v === 'number' && !Number.isFinite(v) ? err('#NUM!') : v;
        } catch (e) {
          if (e instanceof Fail) return e.v;
          if (e instanceof RangeError) return err('#NUM!'); // far too deep
          throw e;
        }
      }
    }
  }
}

const one = (v: V | M): V => (isM(v) ? (v[0]?.[0] ?? null) : v);

/** A simple source over plain maps (tests, imports, and pages that only read a sheet). */
export function mapSource(sheets: { id: string; name: string; cells: Map<string, string> | Record<string, string> }[]): Source {
  const byId = new Map(sheets.map((s) => [s.id, s.cells instanceof Map ? s.cells : new Map(Object.entries(s.cells))]));
  return {
    idOf: (name) => sheets.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id ?? null,
    raw: (sheet, key) => byId.get(sheet)?.get(key),
    keys: (sheet) => byId.get(sheet)?.keys() ?? [],
  };
}
