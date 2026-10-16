import * as Y from 'yjs';
import { cleanBook, cleanSheetName, MAX_SHEETS, type BookJSON, type CellJSON, type ChartJSON, type CheckJSON, type RuleJSON, type SheetJSON } from './book';
import { adjustForChange, dropSheetIn, isFormula, renameSheetIn, shiftFormula } from './formula';
import { MAX_COLS, MAX_ROWS, areaText, cellOf, keyOf, parseArea, sheetPrefix, type Area } from './refs';
import type { Source } from './calc';

// A live workbook (Stage 5 · Office suite): the spreadsheet kept in a Yjs document, so everyone
// editing it sees each other's changes and offline edits merge. Layout:
//   order: Y.Array<string>                 the sheets' ids, in tab order
//   sheets: Y.Map<Y.Map>                   id → { name, color, cells, cols, rows, meta }
//     cells: Y.Map<CellJSON>               "B3" → { v: what's typed, s: style }
//     cols / rows: Y.Map<number>           widths and heights in px, by index
//     meta: Y.Map                          freeze, merges, hiddenRows, hiddenCols, filter, charts, rules, checks
// Every change goes through these functions in one transaction marked LOCAL (for undo).
// Tested in model.test.ts.

export const LOCAL = 'local-sheet';
type YSheet = Y.Map<unknown>;

export const orderOf = (doc: Y.Doc) => doc.getArray<string>('order');
const sheetsOf = (doc: Y.Doc) => doc.getMap<YSheet>('sheets');
export const sheetIds = (doc: Y.Doc) => orderOf(doc).toArray().filter((id, i, a) => sheetsOf(doc).has(id) && a.indexOf(id) === i);
export const sheetOf = (doc: Y.Doc, id: string) => sheetsOf(doc).get(id);
export const cellsOf = (doc: Y.Doc, id: string) => sheetOf(doc, id)?.get('cells') as Y.Map<CellJSON> | undefined;
const sizesOf = (doc: Y.Doc, id: string, k: 'cols' | 'rows') => sheetOf(doc, id)?.get(k) as Y.Map<number> | undefined;
const metaOf = (doc: Y.Doc, id: string) => sheetOf(doc, id)?.get('meta') as Y.Map<unknown> | undefined;
export const nameOf = (doc: Y.Doc, id: string) => (sheetOf(doc, id)?.get('name') as string | undefined) ?? 'Sheet';
export const isEmptyBook = (doc: Y.Doc) => sheetIds(doc).length === 0;

export function getMeta<K extends keyof SheetJSON>(doc: Y.Doc, id: string, k: K): SheetJSON[K] | undefined {
  return metaOf(doc, id)?.get(k) as SheetJSON[K] | undefined;
}
export function setMeta<K extends keyof SheetJSON>(doc: Y.Doc, id: string, k: K, v: SheetJSON[K] | undefined) {
  doc.transact(() => { const m = metaOf(doc, id); if (!m) return; if (v === undefined || (Array.isArray(v) && !v.length)) m.delete(k); else m.set(k, v); }, LOCAL);
}
export const sizeOf = (doc: Y.Doc, id: string, k: 'cols' | 'rows', i: number) => sizesOf(doc, id, k)?.get(String(i));
export function setSizes(doc: Y.Doc, id: string, k: 'cols' | 'rows', changes: Record<number, number | null>) {
  doc.transact(() => { const m = sizesOf(doc, id, k); if (!m) return; for (const [i, v] of Object.entries(changes)) { if (v == null) m.delete(i); else m.set(i, v); } }, LOCAL);
}

const META_KEYS = ['freeze', 'merges', 'hiddenRows', 'hiddenCols', 'filter', 'charts', 'rules', 'checks'] as const;

function makeSheet(s: SheetJSON): YSheet {
  const y = new Y.Map<unknown>();
  y.set('name', s.name);
  if (s.color) y.set('color', s.color);
  const cells = new Y.Map<CellJSON>();
  for (const [k, c] of Object.entries(s.cells)) cells.set(k, c);
  y.set('cells', cells);
  const cols = new Y.Map<number>(), rows = new Y.Map<number>();
  for (const [k, v] of Object.entries(s.cols ?? {})) cols.set(k, v);
  for (const [k, v] of Object.entries(s.rows ?? {})) rows.set(k, v);
  y.set('cols', cols); y.set('rows', rows);
  const meta = new Y.Map<unknown>();
  for (const k of META_KEYS) if (s[k] !== undefined && !(Array.isArray(s[k]) && !(s[k] as unknown[]).length)) meta.set(k, s[k]);
  y.set('meta', meta);
  return y;
}

/** Replaces the whole workbook (a template, an import into an empty book, or going back to a version). */
export function loadBook(doc: Y.Doc, raw: BookJSON) {
  const book = cleanBook(raw);
  doc.transact(() => {
    const order = orderOf(doc), sheets = sheetsOf(doc);
    order.delete(0, order.length);
    for (const k of [...sheets.keys()]) sheets.delete(k);
    for (const s of book.sheets) { sheets.set(s.id, makeSheet(s)); order.push([s.id]); }
  }, LOCAL);
}

/** The workbook as plain data (versions, downloads). */
export function toBook(doc: Y.Doc): BookJSON {
  return {
    sheets: sheetIds(doc).map((id) => {
      const y = sheetOf(doc, id)!;
      const s: SheetJSON = { id, name: nameOf(doc, id), cells: Object.fromEntries((cellsOf(doc, id) ?? new Y.Map()).entries()) as Record<string, CellJSON> };
      const color = y.get('color') as string | undefined;
      if (color) s.color = color;
      const cols = sizesOf(doc, id, 'cols'), rows = sizesOf(doc, id, 'rows');
      if (cols?.size) s.cols = Object.fromEntries(cols.entries());
      if (rows?.size) s.rows = Object.fromEntries(rows.entries());
      const meta = metaOf(doc, id);
      for (const k of META_KEYS) { const v = meta?.get(k); if (v !== undefined) (s as unknown as Record<string, unknown>)[k] = v; }
      return s;
    }),
  };
}

/** Writes cells (null clears one; a cell with neither text nor style is removed). */
export function setCells(doc: Y.Doc, id: string, changes: Record<string, CellJSON | null>) {
  doc.transact(() => {
    const cells = cellsOf(doc, id);
    if (!cells) return;
    for (const [k, c] of Object.entries(changes)) {
      if (!cellOf(k)) continue;
      if (!c || (!c.v && !(c.s && Object.keys(c.s).length))) cells.delete(k);
      else cells.set(k, c.s && Object.keys(c.s).length ? { v: c.v, s: c.s } : { v: c.v });
    }
  }, LOCAL);
}

/** A Source for the calculator (calc.ts) reading the live workbook. */
export function liveSource(doc: Y.Doc): Source {
  return {
    idOf: (name) => sheetIds(doc).find((id) => nameOf(doc, id).toLowerCase() === name.toLowerCase()) ?? null,
    raw: (sheet, key) => cellsOf(doc, sheet)?.get(key)?.v,
    keys: (sheet) => cellsOf(doc, sheet)?.keys() ?? [],
  };
}

/** The last used row and column (+1) of a sheet. */
export function usedSize(doc: Y.Doc, id: string): { rows: number; cols: number } {
  let rows = 0, cols = 0;
  for (const k of cellsOf(doc, id)?.keys() ?? []) { const x = cellOf(k); if (x) { if (x.r >= rows) rows = x.r + 1; if (x.c >= cols) cols = x.c + 1; } }
  return { rows, cols };
}

// ── Sheets ──────────────────────────────────────────────────────────────────────────────────

const newId = () => `s${Math.random().toString(36).slice(2, 10)}`;
function freeName(doc: Y.Doc, base: string, except?: string) {
  const taken = new Set(sheetIds(doc).filter((x) => x !== except).map((x) => nameOf(doc, x).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let k = 2; ; k++) { const n = `${base.slice(0, 26)} (${k})`; if (!taken.has(n.toLowerCase())) return n; }
}

export function addSheet(doc: Y.Doc, after?: string, from?: SheetJSON): string | null {
  if (sheetIds(doc).length >= MAX_SHEETS) return null;
  const id = newId();
  let n = sheetIds(doc).length + 1;
  while (sheetIds(doc).some((x) => nameOf(doc, x).toLowerCase() === `sheet${n}`)) n++;
  const sheet: SheetJSON = from ? { ...from, id, name: freeName(doc, from.name) } : { id, name: `Sheet${n}`, cells: {} };
  doc.transact(() => {
    sheetsOf(doc).set(id, makeSheet(sheet));
    const order = orderOf(doc);
    const at = after ? order.toArray().indexOf(after) : -1;
    order.insert(at >= 0 ? at + 1 : order.length, [id]);
  }, LOCAL);
  return id;
}

/** A copy of a sheet next to it ("Marks (2)"). */
export function duplicateSheet(doc: Y.Doc, id: string): string | null {
  const s = toBook(doc).sheets.find((x) => x.id === id);
  return s ? addSheet(doc, id, s) : null;
}

/** Renames a sheet; formulas on every sheet that name it follow. */
export function renameSheet(doc: Y.Doc, id: string, raw: string): string {
  const from = nameOf(doc, id);
  const to = freeName(doc, cleanSheetName(raw, from), id);
  if (to === from) return from;
  doc.transact(() => {
    sheetOf(doc, id)?.set('name', to);
    rewriteFormulas(doc, (f) => renameSheetIn(f, from, to));
  }, LOCAL);
  return to;
}

/** Deletes a sheet (never the last); formulas that read it show #REF!. */
export function deleteSheet(doc: Y.Doc, id: string) {
  if (sheetIds(doc).length <= 1) return;
  const name = nameOf(doc, id);
  doc.transact(() => {
    const order = orderOf(doc);
    for (let i = order.length - 1; i >= 0; i--) if (order.get(i) === id) order.delete(i, 1);
    sheetsOf(doc).delete(id);
    rewriteFormulas(doc, (f) => dropSheetIn(f, name));
  }, LOCAL);
}

export function moveSheet(doc: Y.Doc, id: string, to: number) {
  doc.transact(() => {
    const order = orderOf(doc);
    const from = order.toArray().indexOf(id);
    if (from < 0) return;
    order.delete(from, 1);
    order.insert(Math.max(0, Math.min(order.length, to)), [id]);
  }, LOCAL);
}

export function setSheetColor(doc: Y.Doc, id: string, color: string | null) {
  doc.transact(() => { const y = sheetOf(doc, id); if (!y) return; if (color) y.set('color', color); else y.delete('color'); }, LOCAL);
}

/** Rewrites every formula on every sheet (f gets the formula without "=" and the sheet's id). */
function rewriteFormulas(doc: Y.Doc, f: (src: string, sheet: string) => string) {
  for (const id of sheetIds(doc)) {
    const cells = cellsOf(doc, id)!;
    for (const [k, c] of [...cells.entries()]) {
      if (!isFormula(c.v)) continue;
      const v = `=${f(c.v.slice(1), id)}`;
      if (v !== c.v) cells.set(k, { ...c, v });
    }
  }
}

// ── Rows and columns ──────────────────────────────────────────────────────────────────────

const moveIndex = (i: number, at: number, count: number) => (count > 0 ? (i >= at ? i + count : i) : i >= at && i < at - count ? null : i >= at - count ? i + count : i);

function moveArea(text: string, axis: 'row' | 'col', at: number, count: number): string | null {
  const a = parseArea(text);
  if (!a) return null;
  const [lo, hi] = axis === 'row' ? [a.r1, a.r2] : [a.c1, a.c2];
  const gone = -count;
  let nlo = lo, nhi = hi;
  if (count > 0) { if (lo >= at) nlo += count; if (hi >= at) nhi += count; }
  else {
    nlo = lo < at ? lo : lo >= at + gone ? lo - gone : at;
    nhi = hi < at ? hi : hi >= at + gone ? hi - gone : at - 1;
    if (nhi < nlo) return null;
  }
  const out: Area = axis === 'row' ? { ...a, r1: nlo, r2: nhi } : { ...a, c1: nlo, c2: nhi };
  if (out.r2 >= MAX_ROWS || out.c2 >= MAX_COLS) return null;
  return areaText(out);
}

/** Inserts (count > 0) or deletes (count < 0) rows or columns at `at`, as Excel does: cells move,
 *  formulas everywhere follow, and sizes, merges, hidden rows, charts, colour rules and checks too. */
export function changeLines(doc: Y.Doc, id: string, axis: 'row' | 'col', at: number, count: number) {
  if (!count) return;
  const name = nameOf(doc, id);
  doc.transact(() => {
    const cells = cellsOf(doc, id)!;
    const moved: [string, CellJSON][] = [];
    for (const [k, c] of [...cells.entries()]) {
      const x = cellOf(k)!;
      const i = axis === 'row' ? x.r : x.c;
      const ni = moveIndex(i, at, count);
      if (ni === i) continue;
      cells.delete(k);
      if (ni != null && ni < (axis === 'row' ? MAX_ROWS : MAX_COLS)) moved.push([axis === 'row' ? keyOf(ni, x.c) : keyOf(x.r, ni), c]);
    }
    for (const [k, c] of moved) cells.set(k, c);
    rewriteFormulas(doc, (f, sheet) => adjustForChange(f, { sheet: name, here: sheet === id, axis, at, count }));
    const sizes = sizesOf(doc, id, axis === 'row' ? 'rows' : 'cols')!;
    const entries = [...sizes.entries()];
    for (const [k] of entries) sizes.delete(k);
    for (const [k, v] of entries) { const ni = moveIndex(Number(k), at, count); if (ni != null) sizes.set(String(ni), v); }
    const meta = metaOf(doc, id)!;
    const areas = (list: unknown) => (Array.isArray(list) ? list : []).map((t) => moveArea(t as string, axis, at, count)).filter((t): t is string => !!t);
    const merges = areas(meta.get('merges'));
    if (merges.length) meta.set('merges', merges); else meta.delete('merges');
    const hiddenKey = axis === 'row' ? 'hiddenRows' : 'hiddenCols';
    const hidden = ((meta.get(hiddenKey) as number[] | undefined) ?? []).map((i) => moveIndex(i, at, count)).filter((i): i is number => i != null);
    if (hidden.length) meta.set(hiddenKey, hidden); else meta.delete(hiddenKey);
    for (const k of ['charts', 'rules', 'checks'] as const) {
      const list = meta.get(k) as (ChartJSON | RuleJSON | CheckJSON)[] | undefined;
      if (!list) continue;
      const next = list.flatMap((x) => { const a = moveArea(x.area, axis, at, count); return a ? [{ ...x, area: a }] : []; });
      if (next.length) meta.set(k, next); else meta.delete(k);
    }
    const filter = meta.get('filter') as SheetJSON['filter'];
    if (filter) { const a = moveArea(filter.area, axis, at, count); if (a) meta.set('filter', { ...filter, area: a }); else meta.delete('filter'); }
  }, LOCAL);
}

// ── Copy and paste ──────────────────────────────────────────────────────────────────────────

/** Cells copied from an area, with where they came from (so formulas can move when pasted). */
export interface Clip { from: { r: number; c: number }; rows: number; cols: number; cells: (CellJSON | null)[][] }

export function copyArea(doc: Y.Doc, id: string, a: Area): Clip {
  const cells = cellsOf(doc, id);
  const out: (CellJSON | null)[][] = [];
  for (let r = a.r1; r <= a.r2; r++) { const row: (CellJSON | null)[] = []; for (let c = a.c1; c <= a.c2; c++) row.push(cells?.get(keyOf(r, c)) ?? null); out.push(row); }
  return { from: { r: a.r1, c: a.c1 }, rows: a.r2 - a.r1 + 1, cols: a.c2 - a.c1 + 1, cells: out };
}

/** The cells a paste writes at (r, c): formulas move by the distance (unless only values are
 *  wanted); a clip pasted over a bigger selection repeats to fill it, as Excel does. */
export function pasteCells(clip: Clip, at: { r: number; c: number }, fill: { rows: number; cols: number } | null, mode: 'all' | 'values' | 'formats', valueOf?: (r: number, c: number) => string): Record<string, CellJSON | null> {
  const reps = (n: number, size: number) => (n > size && n % size === 0 ? n / size : 1);
  const rr = fill ? reps(fill.rows, clip.rows) : 1, rc = fill ? reps(fill.cols, clip.cols) : 1;
  const out: Record<string, CellJSON | null> = {};
  for (let i = 0; i < rr; i++) for (let j = 0; j < rc; j++) {
    for (let r = 0; r < clip.rows; r++) for (let c = 0; c < clip.cols; c++) {
      const tr = at.r + i * clip.rows + r, tc = at.c + j * clip.cols + c;
      if (tr >= MAX_ROWS || tc >= MAX_COLS) continue;
      const src = clip.cells[r][c];
      const key = keyOf(tr, tc);
      if (mode === 'formats') { out[key] = { v: '', s: src?.s }; continue; }
      if (!src) { out[key] = null; continue; }
      let v = src.v;
      if (mode === 'values' && valueOf) v = valueOf(clip.from.r + r, clip.from.c + c);
      else if (isFormula(v)) v = `=${shiftFormula(v.slice(1), tr - (clip.from.r + r), tc - (clip.from.c + c))}`;
      out[key] = mode === 'values' ? { v, s: src.s } : { ...src, v };
    }
  }
  return out;
}

/** Tab-separated text (what other spreadsheets copy) as a clip of typed values. */
export function clipFromText(text: string): Clip {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').slice(0, 5000);
  const cells = lines.map((l) => l.split('\t').slice(0, MAX_COLS).map((v) => (v ? { v } : null)));
  return { from: { r: 0, c: 0 }, rows: cells.length, cols: Math.max(1, ...cells.map((r) => r.length)), cells: cells.map((r) => { const w = Math.max(1, ...cells.map((x) => x.length)); return [...r, ...Array<null>(w - r.length).fill(null)]; }) };
}

/** A sheet's reference text for formulas on other sheets ('My data'!A1). */
export const refOn = (doc: Y.Doc, id: string, area: string) => `${sheetPrefix(nameOf(doc, id))}${area}`;
