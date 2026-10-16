import { cleanStyle, type Style } from './format';
import { MAX_COLS, MAX_ROWS, areaText, cellOf, parseArea } from './refs';

// A workbook as plain data (Stage 5 · Office suite): what's saved in a version, imported from Excel
// or CSV, made from a template, and what the live editor reads and writes (sheet-model.ts keeps it
// in a Yjs document). Anything from outside is passed through cleanBook first. Import-free.

export interface CellJSON { v: string; s?: Style }
export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'scatter';
export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'column', label: 'Columns' }, { value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' }, { value: 'pie', label: 'Pie' }, { value: 'scatter', label: 'Scatter' },
];
export interface ChartJSON { id: string; type: ChartType; area: string; title: string }
/** Conditional formatting: cells in `area` meeting the test get the colours. */
export type RuleKind = 'gt' | 'lt' | 'between' | 'eq' | 'ne' | 'contains' | 'empty' | 'notEmpty' | 'top' | 'bottom' | 'aboveAvg' | 'belowAvg' | 'dupe' | 'scale' | 'bars';
export interface RuleJSON { id: string; area: string; kind: RuleKind; a?: string; b?: string; color?: string; bg?: string }
/** Data validation: a list to pick from, or a number range. */
export interface CheckJSON { id: string; area: string; kind: 'list' | 'number' | 'date' | 'checkbox'; list?: string[]; min?: number; max?: number }
export interface SheetJSON {
  id: string; name: string;
  cells: Record<string, CellJSON>;
  /** Column widths and row heights in pixels, by index. */
  cols?: Record<string, number>; rows?: Record<string, number>;
  /** Rows and columns kept in view while scrolling. */
  freeze?: { r: number; c: number };
  merges?: string[];
  hiddenRows?: number[]; hiddenCols?: number[];
  /** The filter's area (its first row is the header), and the values hidden in each column. */
  filter?: { area: string; hide: Record<string, string[]> };
  charts?: ChartJSON[]; rules?: RuleJSON[]; checks?: CheckJSON[];
  /** The tab's colour. */
  color?: string;
}
export interface BookJSON { sheets: SheetJSON[] }

export const DEFAULT_COL = 100, DEFAULT_ROW = 24;
export const MAX_SHEETS = 30;
export const MAX_CELLS = 60_000;
const MAX_TEXT = 32_767;
const HEX = /^#[0-9a-f]{6}$/i;
const RULE_KINDS: RuleKind[] = ['gt', 'lt', 'between', 'eq', 'ne', 'contains', 'empty', 'notEmpty', 'top', 'bottom', 'aboveAvg', 'belowAvg', 'dupe', 'scale', 'bars'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const id = (v: unknown, fallback: string) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : fallback);
const area = (v: unknown) => { const a = typeof v === 'string' ? parseArea(v) : null; return a ? areaText(a) : null; };
const sizes = (v: unknown, max: number, lo: number, hi: number) => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>).slice(0, 5000)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && i < max && typeof n === 'number' && Number.isFinite(n)) out[i] = Math.min(hi, Math.max(lo, Math.round(n)));
  }
  return Object.keys(out).length ? out : undefined;
};
const indexes = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max))].slice(0, 5000) : []);

/** A sheet name Excel would take: no []:*?/\, up to 31 characters, not empty. */
export function cleanSheetName(v: unknown, fallback = 'Sheet'): string {
  const s = (typeof v === 'string' ? v : '').replace(/[[\]:*?/\\]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31);
  return s || fallback;
}

/** A workbook from untrusted JSON: only known fields, within limits; at least one sheet. */
export function cleanBook(raw: unknown): BookJSON {
  const sheetsIn = raw && typeof raw === 'object' && Array.isArray((raw as { sheets?: unknown }).sheets) ? (raw as { sheets: unknown[] }).sheets.slice(0, MAX_SHEETS) : [];
  const names = new Set<string>();
  let total = 0;
  const sheets: SheetJSON[] = sheetsIn.map((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    let name = cleanSheetName(o.name, `Sheet${i + 1}`);
    for (let k = 2; names.has(name.toLowerCase()); k++) name = `${cleanSheetName(o.name, 'Sheet').slice(0, 27)} (${k})`;
    names.add(name.toLowerCase());
    const cells: Record<string, CellJSON> = {};
    if (o.cells && typeof o.cells === 'object') {
      for (const [k, c] of Object.entries(o.cells as Record<string, unknown>)) {
        if (total >= MAX_CELLS) break;
        if (!cellOf(k) || !c || typeof c !== 'object') continue;
        const v = str((c as { v?: unknown }).v, MAX_TEXT);
        const s = cleanStyle((c as { s?: unknown }).s);
        if (!v && !s) continue;
        cells[k] = s ? { v, s } : { v };
        total++;
      }
    }
    const sheet: SheetJSON = { id: id(o.id, `s${i + 1}`), name, cells };
    const cols = sizes(o.cols, MAX_COLS, 0, 1000), rows = sizes(o.rows, MAX_ROWS, 0, 600);
    if (cols) sheet.cols = cols;
    if (rows) sheet.rows = rows;
    const f = o.freeze as { r?: unknown; c?: unknown } | undefined;
    if (f && typeof f === 'object') { const r = Number(f.r), c = Number(f.c); if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r <= 50 && c <= 20 && r + c > 0) sheet.freeze = { r, c }; }
    const merges = (Array.isArray(o.merges) ? o.merges : []).map(area).filter((a): a is string => !!a && a.includes(':')).slice(0, 1000);
    if (merges.length) sheet.merges = merges;
    const hr = indexes(o.hiddenRows, MAX_ROWS), hc = indexes(o.hiddenCols, MAX_COLS);
    if (hr.length) sheet.hiddenRows = hr;
    if (hc.length) sheet.hiddenCols = hc;
    const fl = o.filter as { area?: unknown; hide?: unknown } | undefined;
    const fa = fl && typeof fl === 'object' ? area(fl.area) : null;
    if (fa) {
      const hide: Record<string, string[]> = {};
      if (fl!.hide && typeof fl!.hide === 'object') for (const [k, list] of Object.entries(fl!.hide as Record<string, unknown>).slice(0, MAX_COLS)) if (Number.isInteger(Number(k)) && Array.isArray(list)) hide[k] = list.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, 200)).slice(0, 1000);
      sheet.filter = { area: fa, hide };
    }
    const charts = (Array.isArray(o.charts) ? o.charts : []).slice(0, 20).flatMap((c, k): ChartJSON[] => {
      const x = (c ?? {}) as Record<string, unknown>;
      const a = area(x.area);
      const type = CHART_TYPES.some((t) => t.value === x.type) ? (x.type as ChartType) : 'column';
      return a ? [{ id: id(x.id, `c${k + 1}`), type, area: a, title: str(x.title, 120) }] : [];
    });
    if (charts.length) sheet.charts = charts;
    const rules = (Array.isArray(o.rules) ? o.rules : []).slice(0, 50).flatMap((r, k): RuleJSON[] => {
      const x = (r ?? {}) as Record<string, unknown>;
      const a = area(x.area);
      if (!a || !RULE_KINDS.includes(x.kind as RuleKind)) return [];
      return [{ id: id(x.id, `r${k + 1}`), area: a, kind: x.kind as RuleKind, ...(typeof x.a === 'string' ? { a: x.a.slice(0, 200) } : {}), ...(typeof x.b === 'string' ? { b: x.b.slice(0, 200) } : {}), ...(typeof x.color === 'string' && HEX.test(x.color) ? { color: x.color } : {}), ...(typeof x.bg === 'string' && HEX.test(x.bg) ? { bg: x.bg } : {}) }];
    });
    if (rules.length) sheet.rules = rules;
    const checks = (Array.isArray(o.checks) ? o.checks : []).slice(0, 50).flatMap((r, k): CheckJSON[] => {
      const x = (r ?? {}) as Record<string, unknown>;
      const a = area(x.area);
      if (!a || !['list', 'number', 'date', 'checkbox'].includes(x.kind as string)) return [];
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      const list = Array.isArray(x.list) ? x.list.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, 100)).slice(0, 200) : undefined;
      return [{ id: id(x.id, `v${k + 1}`), area: a, kind: x.kind as CheckJSON['kind'], ...(list?.length ? { list } : {}), ...(n(x.min) != null ? { min: n(x.min) } : {}), ...(n(x.max) != null ? { max: n(x.max) } : {}) }];
    });
    if (checks.length) sheet.checks = checks;
    if (typeof o.color === 'string' && HEX.test(o.color)) sheet.color = o.color;
    return sheet;
  });
  // Ids must be different too.
  const ids = new Set<string>();
  for (const s of sheets) { while (ids.has(s.id)) s.id = `${s.id}x`.slice(-40); ids.add(s.id); }
  return { sheets: sheets.length ? sheets : [{ id: 's1', name: 'Sheet1', cells: {} }] };
}

/** An empty workbook. */
export const emptyBook = (): BookJSON => ({ sheets: [{ id: 's1', name: 'Sheet1', cells: {} }] });
