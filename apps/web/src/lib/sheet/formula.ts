import { MAX_COLS, MAX_ROWS, colIndex, parseAddr, refText, sheetPrefix, type Ref } from './refs';

// Spreadsheet formulas (Stage 5 · Office suite): reads what people type after "=" the way Excel does:
// numbers, "text", TRUE/FALSE, errors (#N/A…), cell references (A1, $A$1, Sheet2!B3, 'My sheet'!A1),
// areas (A1:C3, A:A), operators (+ - * / ^ & % = <> < > <= >=) and functions (SUM(…), IF(…; …)).
// Also rewrites the references in a formula when it's copied, or rows / columns / sheets change,
// keeping the rest of what was typed as it was. Import-free; tested in formula.test.ts.

export type ErrCode = '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#N/A' | '#NUM!' | '#CIRC!' | '#NULL!';
export const ERRORS: ErrCode[] = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#CIRC!', '#NULL!'];

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: ErrCode }
  | { k: 'ref'; sheet: string | null; r: number; c: number }
  | { k: 'area'; sheet: string | null; r1: number; c1: number; r2: number; c2: number }
  | { k: 'fn'; name: string; args: Ast[] }
  | { k: 'un'; op: '-' | '+'; a: Ast }
  | { k: 'pct'; a: Ast }
  | { k: 'bin'; op: string; a: Ast; b: Ast }
  | { k: 'name'; v: string };

type Tok =
  | { t: 'num'; v: number; at: number; end: number }
  | { t: 'str'; v: string; at: number; end: number }
  | { t: 'err'; v: ErrCode; at: number; end: number }
  | { t: 'ref'; sheet: string | null; a: Ref; b: Ref | null; cols: [number, number, boolean, boolean] | null; at: number; end: number }
  | { t: 'id'; v: string; at: number; end: number }
  | { t: 'op'; v: string; at: number; end: number };

const SHEET = /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!/;
const ADDR = /^\$?[A-Za-z]{1,3}\$?\d{1,6}/;
const COLS = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/;

/** The pieces of a formula (without its "="), with where each one is; null if it can't be read. */
export function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    if (c === '"') {
      let j = i + 1, v = '';
      for (; j < src.length; j++) {
        if (src[j] === '"') { if (src[j + 1] === '"') { v += '"'; j++; } else break; } else v += src[j];
      }
      if (j >= src.length) return null;
      out.push({ t: 'str', v, at: i, end: j + 1 }); i = j + 1; continue;
    }
    if (c === '#') {
      const e = ERRORS.find((x) => rest.toUpperCase().startsWith(x));
      if (!e) return null;
      out.push({ t: 'err', v: e, at: i, end: i + e.length }); i += e.length; continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    if (num) { out.push({ t: 'num', v: Number(num[0]), at: i, end: i + num[0].length }); i += num[0].length; continue; }
    // A reference, maybe on another sheet.
    const sh = SHEET.exec(rest);
    const sheet = sh ? (sh[1] ?? sh[2]).replace(/''/g, "'") : null;
    const after = sh ? rest.slice(sh[0].length) : rest;
    const lead = sh ? sh[0].length : 0;
    const cols = COLS.exec(after);
    if (cols && (sh || !/^[A-Za-z]+:[A-Za-z]+\s*\(/.test(after))) {
      const c1 = colIndex(cols[2]), c2 = colIndex(cols[4]);
      if (c1 >= 0 && c2 >= 0) {
        out.push({ t: 'ref', sheet, a: { r: 0, c: c1 }, b: { r: MAX_ROWS - 1, c: c2 }, cols: [c1, c2, !!cols[1], !!cols[3]], at: i, end: i + lead + cols[0].length });
        i += lead + cols[0].length; continue;
      }
    }
    const a = ADDR.exec(after);
    if (a && !/^[A-Za-z0-9_.(]/.test(after.slice(a[0].length))) {
      const ra = parseAddr(a[0]);
      let end = lead + a[0].length, rb: Ref | null = null;
      const b = after[a[0].length] === ':' ? ADDR.exec(after.slice(a[0].length + 1)) : null;
      if (b && !/^[A-Za-z0-9_.(]/.test(after.slice(a[0].length + 1 + b[0].length))) { rb = parseAddr(b[0]); end += 1 + b[0].length; if (!rb) return null; }
      if (!ra) return null;
      out.push({ t: 'ref', sheet, a: ra, b: rb, cols: null, at: i, end: i + end }); i += end; continue;
    }
    if (sh) return null;
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (id) { out.push({ t: 'id', v: id[0], at: i, end: i + id[0].length }); i += id[0].length; continue; }
    const op = /^(<>|<=|>=|[-+*/^&=<>%(),;:{}])/.exec(rest);
    if (op) { out.push({ t: 'op', v: op[0], at: i, end: i + op[0].length }); i += op[0].length; continue; }
    return null;
  }
  return out;
}

const BIN: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
const MAX_DEPTH = 100;

/** Reads a formula (what follows "="); null when it isn't one. */
export function parseFormula(src: string): Ast | null {
  if (src.length > 8000) return null;
  const toks = tokenize(src);
  if (!toks) return null;
  let p = 0, depth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.t === 'op' && t.v === v; };
  function primary(): Ast | null {
    if (++depth > MAX_DEPTH) return null;
    try {
      const t = toks[p++];
      if (!t) return null;
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'str', v: t.v };
      if (t.t === 'err') return { k: 'err', v: t.v };
      if (t.t === 'ref') return t.b ? { k: 'area', sheet: t.sheet, r1: Math.min(t.a.r, t.b.r), c1: Math.min(t.a.c, t.b.c), r2: Math.max(t.a.r, t.b.r), c2: Math.max(t.a.c, t.b.c) } : { k: 'ref', sheet: t.sheet, r: t.a.r, c: t.a.c };
      if (t.t === 'op' && (t.v === '-' || t.v === '+')) { const a = unary(); return a && { k: 'un', op: t.v, a }; }
      if (t.t === 'op' && t.v === '(') { const e = expr(0); if (!e || !isOp(')')) return null; p++; return e; }
      if (t.t === 'id') {
        const name = t.v.toUpperCase().replace(/^_XLFN\.|^_XLWS\./, '');
        if (isOp('(')) {
          p++;
          const args: Ast[] = [];
          if (isOp(')')) { p++; return { k: 'fn', name, args }; }
          for (;;) {
            // An empty argument (IF(A1,,2)) counts as nothing given.
            if (isOp(',') || isOp(';') || isOp(')')) args.push({ k: 'str', v: '' });
            else { const e = expr(0); if (!e) return null; args.push(e); }
            if (isOp(',') || isOp(';')) { p++; continue; }
            if (isOp(')')) { p++; break; }
            return null;
          }
          if (args.length > 255) return null;
          return { k: 'fn', name, args };
        }
        if (name === 'TRUE' || name === 'FALSE') return { k: 'bool', v: name === 'TRUE' };
        return { k: 'name', v: t.v };
      }
      return null;
    } finally { depth--; }
  }
  // Excel: a minus sign binds tighter than ^ (so -2^2 is 4), and % after a value divides it by 100.
  function unary(): Ast | null {
    let a = primary();
    while (a && isOp('%')) { p++; a = { k: 'pct', a }; }
    return a;
  }
  function expr(min: number): Ast | null {
    let a = unary();
    while (a) {
      const t = peek();
      if (!t || t.t !== 'op' || !(t.v in BIN)) break;
      const prec = BIN[t.v];
      if (prec < min) break;
      p++;
      // ^ is left-associative in Excel too (2^3^2 = 64).
      const b = expr(prec + 1);
      if (!b) return null;
      a = { k: 'bin', op: t.v, a, b };
    }
    return a;
  }
  const out = expr(0);
  return out && p === toks.length ? out : null;
}

/** Names of the functions a formula uses (to say which ones aren't known). */
export function functionsIn(ast: Ast, out = new Set<string>()): Set<string> {
  if (ast.k === 'fn') { out.add(ast.name); ast.args.forEach((x) => functionsIn(x, out)); }
  else if (ast.k === 'un' || ast.k === 'pct') functionsIn(ast.a, out);
  else if (ast.k === 'bin') { functionsIn(ast.a, out); functionsIn(ast.b, out); }
  return out;
}

// ── Rewriting references ────────────────────────────────────────────────────────────────────

export interface RefEdit {
  /** The reference's sheet name as written (null: the formula's own sheet). */
  sheet: string | null;
  r: number; c: number; absR: boolean; absC: boolean;
}
/** What becomes of a reference (b: the area's other corner; whole: A:C style): the new corners, or
 *  null for #REF! (it was deleted, or would leave the sheet). */
type Mapper = (a: RefEdit, b: RefEdit | null, whole: boolean) => [RefEdit, RefEdit | null] | null;

const colLetters = (c: number) => refText({ r: 0, c }).replace(/\d+$/, '');

/** Rewrites the references in a formula (src without "="); the rest stays exactly as typed. */
export function mapRefs(src: string, f: Mapper, renameSheet?: (name: string) => string): string {
  const toks = tokenize(src);
  if (!toks) return src;
  let out = '', at = 0;
  for (const t of toks) {
    if (t.t !== 'ref') continue;
    out += src.slice(at, t.at);
    at = t.end;
    const sheet = t.sheet != null && renameSheet ? renameSheet(t.sheet) : t.sheet;
    const pre = sheet != null ? sheetPrefix(sheet) : '';
    const edit = (r: Ref): RefEdit => ({ sheet: t.sheet, r: r.r, c: r.c, absR: !!r.absR, absC: !!r.absC });
    if (t.cols) {
      const [c1, c2, a1, a2] = t.cols;
      const m = f({ sheet: t.sheet, r: 0, c: c1, absR: true, absC: a1 }, { sheet: t.sheet, r: MAX_ROWS - 1, c: c2, absR: true, absC: a2 }, true);
      out += m && m[1] ? `${pre}${m[0].absC ? '$' : ''}${colLetters(m[0].c)}:${m[1].absC ? '$' : ''}${colLetters(m[1].c)}` : '#REF!';
      continue;
    }
    const m = f(edit(t.a), t.b ? edit(t.b) : null, false);
    out += !m ? '#REF!' : m[1] ? `${pre}${refText(m[0])}:${refText(m[1])}` : pre + refText(m[0]);
  }
  return out + src.slice(at);
}

/** A formula copied from one cell to another (dr rows down, dc columns right): relative references
 *  move with it, absolute ($) ones stay; those that would leave the sheet become #REF!. */
export function shiftFormula(src: string, dr: number, dc: number): string {
  const move = (x: RefEdit, whole: boolean): RefEdit | null => {
    const r = x.absR || whole ? x.r : x.r + dr, c = x.absC ? x.c : x.c + dc;
    return r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS ? null : { ...x, r, c };
  };
  return mapRefs(src, (a, b, whole) => {
    const x = move(a, whole), y = b ? move(b, whole) : null;
    return !x || (b && !y) ? null : [x, y];
  });
}

/** Rows (or columns) inserted (count > 0) or deleted (count < 0) on a sheet: references to it move;
 *  deleted cells become #REF!, and an area that loses some of its rows gets smaller (inserting
 *  inside an area makes it bigger), as in Excel. `here`: whether a reference with no sheet name
 *  points at the changed sheet. */
export function adjustForChange(src: string, change: { sheet: string; here: boolean; axis: 'row' | 'col'; at: number; count: number }): string {
  const { axis, at, count } = change;
  const gone = -count;
  const max = axis === 'row' ? MAX_ROWS : MAX_COLS;
  return mapRefs(src, (a, b, whole) => {
    const on = a.sheet == null ? change.here : a.sheet.toLowerCase() === change.sheet.toLowerCase();
    if (!on || (whole && axis === 'row')) return [a, b];
    const get = (x: RefEdit) => (axis === 'row' ? x.r : x.c);
    const put = (x: RefEdit, v: number): RefEdit => (axis === 'row' ? { ...x, r: v } : { ...x, c: v });
    if (count > 0) {
      const move = (v: number) => (v >= at ? v + count : v);
      const v1 = move(get(a)), v2 = b ? move(get(b)) : v1;
      if (v2 >= max) return null;
      return [put(a, v1), b ? put(b, v2) : null];
    }
    const v1 = get(a), v2 = b ? get(b) : v1;
    const lo = Math.min(v1, v2), hi = Math.max(v1, v2);
    const nlo = lo < at ? lo : lo >= at + gone ? lo - gone : at;
    const nhi = hi < at ? hi : hi >= at + gone ? hi - gone : at - 1;
    if (nhi < nlo) return null;
    if (!b) return [put(a, nlo), null];
    return v1 <= v2 ? [put(a, nlo), put(b, nhi)] : [put(a, nhi), put(b, nlo)];
  });
}

/** A sheet renamed: formulas naming it follow. */
export function renameSheetIn(src: string, from: string, to: string): string {
  return mapRefs(src, (a, b) => [a, b], (name) => (name.toLowerCase() === from.toLowerCase() ? to : name));
}

/** A sheet deleted: references to it become #REF!. */
export function dropSheetIn(src: string, name: string): string {
  return mapRefs(src, (a, b) => (a.sheet != null && a.sheet.toLowerCase() === name.toLowerCase() ? null : [a, b]));
}

/** Whether what's in a cell is a formula ("=…" with something after it). */
export const isFormula = (raw: string) => raw.length > 1 && raw[0] === '=';
