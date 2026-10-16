'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { toast } from 'sonner';
import { ClipboardPaste, Copy, MessageSquarePlus, Scissors } from 'lucide-react';
import { createPortal } from 'react-dom';
import { authedJson } from '@/lib/authed-fetch';
import { colorFor, useLiveDoc, type DocStatus } from '@/lib/use-live-doc';
import { Calc } from '@/lib/sheet/calc';
import { cleanBook, emptyBook, type BookJSON, type CellJSON, type CheckJSON } from '@/lib/sheet/book';
import { display, type Style } from '@/lib/sheet/format';
import { isFormula, parseFormula } from '@/lib/sheet/formula';
import { FUNCTION_HELP } from '@/lib/sheet/functions';
import { LOCAL, addSheet, cellsOf, changeLines, clipFromText, copyArea, deleteSheet, duplicateSheet, getMeta, isEmptyBook, liveSource, loadBook, moveSheet, nameOf, orderOf, pasteCells, renameSheet, setCells, setMeta, setSheetColor, setSizes, sheetIds, toBook, type Clip } from '@/lib/sheet/model';
import { MAX_COLS, MAX_ROWS, addr, areaText, inArea, keyOf, norm, parseAddr, parseArea, type Area } from '@/lib/sheet/refs';
import { bookHtml, bookPreview, sheetHtml } from '@/lib/sheet/render';
import { fillSeries, sortArea } from '@/lib/sheet/tools';
import { dateFrom, isErr, numberFrom, readInput, type V } from '@/lib/sheet/values';
import { MenuList, type MenuItem } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/Dialogs';
import { SheetGrid, checkAt, fitWidth, selArea, useSheetView, type Other, type Sel } from './SheetGrid';
import { SheetToolbar, type BorderKind, type ToolbarActions } from './SheetToolbar';
import { SheetTabs } from './SheetTabs';
import { SheetDialogs, type DialogKind } from './SheetDialogs';

// A spreadsheet (Office suite): Excel's way of working in the browser, written together live
// (src/lib/use-live-doc.ts; works offline too). Formulas with ~150 functions (src/lib/sheet),
// several sheets, formatting, fill by dragging, copy and paste with Excel and Google Sheets, sort,
// filter, freeze, merge, conditional colours, checks, charts, find and replace, undo. A version is
// saved now and then for the history (its data, and how it reads for search).

const SheetCharts = dynamic(() => import('./SheetCharts').then((m) => m.SheetCharts), { ssr: false });

export interface SheetApi {
  book: () => BookJSON;
  valueOf: (sheet: string, key: string) => V;
  load: (book: BookJSON) => void;
  /** Adds sheets (an import); into an empty workbook they replace it. */
  addSheets: (book: BookJSON) => void;
  /** The selected cells as a reference ("Marks!B3:C4"), for a comment. */
  pickRef: () => string | null;
  goTo: (ref: string) => boolean;
  activeSheet: () => string;
}

/** Editing a cell: what's typed, where the caret is (`at`), and how it started. */
interface Edit { text: string; at?: number; sheet: string; r: number; c: number; mode: 'enter' | 'edit'; via: 'cell' | 'bar' }
let clipboard: { text: string; clip: Clip; sheet: string; cut: boolean } | null = null;

const one = (r: number, c: number): Sel => ({ r, c, r2: r, c2: c });
const clampR = (r: number) => Math.max(0, Math.min(MAX_ROWS - 1, r));
const clampC = (c: number) => Math.max(0, Math.min(MAX_COLS - 1, c));
/** Where the function name being typed starts, when the caret is right after one. */
const fnToken = (text: string, caret: number) => { const m = /(^=|[=(,;+\-*/^&<> ])([A-Za-z][A-Za-z0-9.]*)$/.exec(text.slice(0, caret)); return m ? { start: caret - m[2].length, word: m[2] } : null; };
/** The function whose brackets the caret is in. */
function fnAround(text: string, caret: number) {
  let depth = 0;
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '"') { const j = text.lastIndexOf('"', i - 1); if (j < 0) return null; i = j; continue; }
    if (ch === ')') depth++;
    else if (ch === '(') { if (depth === 0) { const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text.slice(0, i)); return m ? m[1].toUpperCase() : null; } depth--; }
  }
  return null;
}
/** Whether a reference can go in at the caret (after =, an operator, a bracket or a comma). */
const canPoint = (text: string, caret: number) => isFormula(text) && /[=(,;+\-*/^&<>:]\s*$/.test(text.slice(0, caret));

export function SheetEditor({ docId, me, canEdit: mayEdit, title, onStatus, onPresence, onApi, commentQuotes, start, onComment }: {
  docId: string; me: { id: string; name: string }; canEdit: boolean; title: string;
  onStatus: (s: DocStatus, canEdit: boolean) => void;
  onPresence?: (people: { name: string; color: string }[]) => void;
  onApi: (api: SheetApi | null) => void;
  /** The open comments' quotes ("Marks!B3:C4"): those cells get a corner mark. */
  commentQuotes: string[];
  /** What a new, empty workbook starts as (a template or an imported file), once live. */
  start: () => BookJSON | null;
  onComment: (ref: string) => void;
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => new Awareness(ydoc));
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  useLiveDoc({ docId, ydoc, awareness, mayEdit, onStatus: (s, c) => { setStatus({ s, canEdit: c }); onStatus(s, c); }, onPresence, tooBig: 'This spreadsheet is too big to save more. Delete some rows or sheets.' });
  const editable = (status.s === 'live' || status.s === 'offline') && status.canEdit;
  const gridId = useId().replace(/:/g, '');

  // Every change (anyone's) redraws once per frame.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setVersion((x) => x + 1); }); };
    ydoc.on('update', on);
    return () => { ydoc.off('update', on); cancelAnimationFrame(raf); };
  }, [ydoc]);
  const calc = useMemo(() => { void version; return new Calc(liveSource(ydoc)); }, [ydoc, version]);
  const ids = useMemo(() => { void version; return sheetIds(ydoc); }, [ydoc, version]);
  const [picked, setPicked] = useState<string | null>(null);
  const sheet = picked && ids.includes(picked) ? picked : ids[0] ?? '';
  const view = useSheetView(ydoc, sheet, version, calc);
  const commented = useMemo(() => {
    void version;
    const name = nameOf(ydoc, sheet).toLowerCase(), out = new Set<string>();
    for (const q of commentQuotes) {
      const m = /^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+\d+)/.exec(q);
      if (m && (m[1] ?? m[2]).replace(/''/g, "'").toLowerCase() === name) out.add(m[3]);
    }
    return out;
  }, [commentQuotes, ydoc, sheet, version]);

  const [sel, setSel] = useState<Sel>(one(0, 0));
  const area = selArea(sel);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [hint, setHint] = useState(0);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [listFor, setListFor] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [filterFor, setFilterFor] = useState<{ c: number; x: number; y: number } | null>(null);
  const [charts, setCharts] = useState(true);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const pointing = useRef<{ start: number; end: number; from: { r: number; c: number } } | null>(null);

  // Undo and redo: only my own changes.
  const [undo] = useState(() => new Y.UndoManager([orderOf(ydoc), ydoc.getMap('sheets')], { trackedOrigins: new Set([LOCAL]), captureTimeout: 500 }));
  const [stacks, setStacks] = useState({ undo: 0, redo: 0 });
  useEffect(() => {
    const on = () => setStacks({ undo: undo.undoStack.length, redo: undo.redoStack.length });
    undo.on('stack-item-added', on); undo.on('stack-item-popped', on);
    return () => { undo.off('stack-item-added', on); undo.off('stack-item-popped', on); undo.destroy(); };
  }, [undo]);

  // A new spreadsheet: once it's live and still empty, its template (or a blank sheet) goes in.
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (status.s !== 'live' || !status.canEdit || !isEmptyBook(ydoc)) return;
    loadBook(ydoc, startRef.current() ?? emptyBook());
    undo.clear();
  }, [status, ydoc, undo]);

  // Who else is here, and where.
  const [others, setOthers] = useState<(Other & { sheet: string })[]>([]);
  useEffect(() => {
    awareness.setLocalStateField('user', { name: me.name, color: colorFor(me.id) });
    const on = () => setOthers([...awareness.getStates().entries()].filter(([id]) => id !== ydoc.clientID).flatMap(([, st]) => {
      const s = st as { user?: { name?: string; color?: string }; cell?: { sheet: string; r: number; c: number } };
      return s.cell ? [{ name: s.user?.name ?? 'Someone', color: s.user?.color ?? '#6366f1', ...s.cell }] : [];
    }));
    awareness.on('change', on);
    return () => awareness.off('change', on);
  }, [awareness, me, ydoc]);
  useEffect(() => { awareness.setLocalStateField('cell', { sheet, r: sel.r, c: sel.c }); }, [awareness, sheet, sel.r, sel.c]);

  const rawAt = (r: number, c: number) => cellsOf(ydoc, sheet)?.get(keyOf(r, c));

  // Versions for the history: a few seconds after my last change, and when I leave.
  useEffect(() => {
    if (!editable) return;
    let t: ReturnType<typeof setTimeout> | null = null, dirty = false;
    const save = () => {
      if (!dirty) return;
      dirty = false;
      const book = toBook(ydoc);
      const data = JSON.stringify(book);
      if (data.length > 1_200_000) return;
      const c = new Calc(liveSource(ydoc));
      const v = (sh: string, k: string) => { const x = parseAddr(k); return x ? c.value(sh, x.r, x.c) : null; };
      void authedJson(`/api/docs/${docId}/versions`, { method: 'POST', keepalive: data.length < 60_000, body: JSON.stringify({ html: bookHtml(book, v), text: bookPreview(book, v), data }) }).catch(() => {});
    };
    const on = (_: Uint8Array, origin: unknown) => {
      if (origin !== LOCAL && origin !== undo) return;
      dirty = true;
      if (t) clearTimeout(t);
      t = setTimeout(save, 8000);
    };
    ydoc.on('update', on);
    window.addEventListener('pagehide', save);
    return () => { ydoc.off('update', on); window.removeEventListener('pagehide', save); if (t) clearTimeout(t); save(); };
  }, [editable, ydoc, docId, undo]);

  const focusGrid = () => requestAnimationFrame(() => document.getElementById(gridId)?.focus({ preventScroll: true }));
  const select = (s: Sel) => { setSel({ r: clampR(s.r), c: clampC(s.c), r2: clampR(s.r2), c2: clampC(s.c2) }); };

  // ── Writing cells ──────────────────────────────────────────────────────────────────────
  const checkValue = (ch: CheckJSON | null, text: string): string | null => {
    if (!ch || !text.trim() || isFormula(text)) return null;
    if (ch.kind === 'list' && ch.list?.length && !ch.list.some((x) => x.toLowerCase() === text.trim().toLowerCase())) return `Pick one of: ${ch.list.slice(0, 8).join(', ')}${ch.list.length > 8 ? '…' : ''}.`;
    if (ch.kind === 'number') { const n = numberFrom(text); if (n == null || (ch.min != null && n < ch.min) || (ch.max != null && n > ch.max)) return `Type a number${ch.min != null ? ` from ${ch.min}` : ''}${ch.max != null ? ` to ${ch.max}` : ''}.`; }
    if (ch.kind === 'date' && dateFrom(text) == null) return 'Type a date, like 2026-10-16.';
    return null;
  };
  /** Writes what was typed into a cell; false (and a message) if it can't go in. */
  const write = (sh: string, r: number, c: number, text: string): boolean => {
    const prev = cellsOf(ydoc, sh)?.get(keyOf(r, c));
    if ((prev?.v ?? '') === text) return true;
    if (isFormula(text) && !parseFormula(text.slice(1))) { toast.error('There’s a mistake in this formula: check its brackets, commas and quotes.'); return false; }
    const problem = sh === sheet ? checkValue(checkAt(view, r, c), text) : null;
    if (problem) { toast.error(problem); return false; }
    let s = prev?.s;
    if (!isFormula(text)) {
      // Typed "12%", "$5" or a date: the cell takes that format, as in Excel.
      const inp = readInput(text);
      if (inp.fmt && (!s?.fmt || s.fmt === 'general')) s = { ...s, fmt: inp.fmt, ...(inp.cur ? { cur: inp.cur } : {}) };
    }
    setCells(ydoc, sh, { [keyOf(r, c)]: { v: text, s } });
    return true;
  };

  const startEdit = (mode: Edit['mode'], text?: string, via: Edit['via'] = 'cell') => {
    if (!editable) { if (status.s === 'live') toast('You can read this spreadsheet but not change it.'); return; }
    if (checkAt(view, sel.r, sel.c)?.kind === 'checkbox') { toggleCheck(sel.r, sel.c); return; }
    setEdit({ text: text ?? rawAt(sel.r, sel.c)?.v ?? '', sheet, r: sel.r, c: sel.c, mode, via });
    setHint(0);
  };
  const commit = (move?: [number, number]) => {
    const e = edit;
    if (!e) return;
    if (!write(e.sheet, e.r, e.c, e.text)) return;
    setEdit(null);
    pointing.current = null;
    if (e.sheet !== sheet) setPicked(e.sheet);
    if (move) select(one(e.r + move[0], e.c + move[1])); else select(one(e.r, e.c));
    focusGrid();
  };
  const cancel = () => { setEdit(null); pointing.current = null; if (edit && edit.sheet !== sheet) setPicked(edit.sheet); focusGrid(); };

  // ── Acting on the selection ──────────────────────────────────────────────────────────────
  const eachCell = (a: Area, f: (r: number, c: number) => void) => {
    const r2 = Math.min(a.r2, Math.max(view.used.rows - 1, a.r1)), c2 = Math.min(a.c2, Math.max(view.used.cols - 1, a.c1, a.c1));
    const rows = a.r2 === MAX_ROWS - 1 ? r2 : a.r2, cols = a.c2 === MAX_COLS - 1 ? c2 : a.c2;
    if ((rows - a.r1 + 1) * (cols - a.c1 + 1) > 100_000) { toast.error('That’s too many cells at once. Select fewer.'); return; }
    for (let r = a.r1; r <= rows; r++) for (let c = a.c1; c <= cols; c++) f(r, c);
  };
  const restyle = (f: (s: Style, r: number, c: number) => Style | undefined) => {
    if (!editable) return;
    const changes: Record<string, CellJSON | null> = {};
    eachCell(area, (r, c) => { const k = keyOf(r, c); const cell = cellsOf(ydoc, sheet)?.get(k); const s = f({ ...(cell?.s ?? {}) }, r, c); changes[k] = { v: cell?.v ?? '', s: s && Object.keys(s).length ? s : undefined }; });
    setCells(ydoc, sheet, changes);
  };
  const activeStyle = rawAt(sel.r, sel.c)?.s;
  const patch = (p: Partial<Style>) => restyle((s) => { const out = { ...s, ...p } as Record<string, unknown>; for (const [k, v] of Object.entries(p)) if (v === undefined) delete out[k]; return out as Style; });
  const toggle = (k: 'b' | 'i' | 'u' | 'st' | 'wrap') => { const on = !activeStyle?.[k]; patch({ [k]: on ? true : undefined }); };
  const clearContents = () => {
    if (!editable) return;
    const changes: Record<string, CellJSON | null> = {};
    eachCell(area, (r, c) => { const cell = rawAt(r, c); if (cell?.v) changes[keyOf(r, c)] = { v: '', s: cell.s }; });
    setCells(ydoc, sheet, changes);
  };
  const decimals = (d: number) => restyle((s, r, c) => {
    const v = calc.value(sheet, r, c);
    const now = s.dp ?? (s.fmt && s.fmt !== 'general' ? (s.fmt === 'percent' ? 0 : 2) : typeof v === 'number' ? (String(v).split('.')[1]?.length ?? 0) : 0);
    return { ...s, fmt: !s.fmt || s.fmt === 'general' ? 'number' : s.fmt, dp: Math.max(0, Math.min(10, now + d)) };
  });
  const borders = (k: BorderKind) => restyle((s, r, c) => {
    if (k === 'none') { delete s.bd; return s; }
    const bd = { ...(s.bd ?? {}) };
    const edge = { t: r === area.r1, b: r === area.r2, l: c === area.c1, r: c === area.c2 };
    if (k === 'all') Object.assign(bd, { t: 1, r: 1, b: 1, l: 1 });
    if (k === 'outer') { if (edge.t) bd.t = 1; if (edge.b) bd.b = 1; if (edge.l) bd.l = 1; if (edge.r) bd.r = 1; }
    if (k === 'top' && edge.t) bd.t = 1;
    if (k === 'bottom' && edge.b) bd.b = 1;
    if (k === 'left' && edge.l) bd.l = 1;
    if (k === 'right' && edge.r) bd.r = 1;
    return { ...s, bd };
  });
  const mergeHere = [...view.merged.values()].find((m) => inArea(m, sel.r, sel.c));
  const merge = async () => {
    if (!editable) return;
    const merges = getMeta(ydoc, sheet, 'merges') ?? [];
    if (mergeHere) { setMeta(ydoc, sheet, 'merges', merges.filter((m) => m !== areaText(mergeHere))); return; }
    if (area.r1 === area.r2 && area.c1 === area.c2) { toast('Select two or more cells to merge.'); return; }
    if ((area.r2 - area.r1 + 1) * (area.c2 - area.c1 + 1) > 5000) { toast.error('That’s too big to merge.'); return; }
    const lost: string[] = [];
    eachCell(area, (r, c) => { if ((r !== area.r1 || c !== area.c1) && rawAt(r, c)?.v) lost.push(keyOf(r, c)); });
    if (lost.length && !(await confirmDialog({ title: 'Merge these cells?', message: 'Only the top-left cell’s value stays; the others are cleared.' }))) return;
    ydoc.transact(() => {
      setCells(ydoc, sheet, Object.fromEntries(lost.map((k) => [k, null])));
      setMeta(ydoc, sheet, 'merges', [...merges.filter((m) => { const x = parseArea(m); return x && (x.r2 < area.r1 || x.r1 > area.r2 || x.c2 < area.c1 || x.c1 > area.c2); }), areaText(area)]);
    }, LOCAL);
  };
  /** The block of filled cells around a cell (what Sort and Filter act on when one cell is picked). */
  const region = (r: number, c: number): Area => {
    const has = (rr: number, cc: number) => rr >= 0 && cc >= 0 && !!rawAt(rr, cc)?.v;
    let a: Area = { r1: r, c1: c, r2: r, c2: c };
    for (let grew = true, n = 0; grew && n < 50; n++) {
      grew = false;
      const rowHas = (rr: number) => { for (let cc = a.c1 - 1; cc <= a.c2 + 1; cc++) if (has(rr, cc)) return true; return false; };
      const colHas = (cc: number) => { for (let rr = a.r1 - 1; rr <= a.r2 + 1; rr++) if (has(rr, cc)) return true; return false; };
      while (a.r1 > 0 && rowHas(a.r1 - 1)) { a = { ...a, r1: a.r1 - 1 }; grew = true; }
      while (a.r2 < view.used.rows && rowHas(a.r2 + 1)) { a = { ...a, r2: a.r2 + 1 }; grew = true; }
      while (a.c1 > 0 && colHas(a.c1 - 1)) { a = { ...a, c1: a.c1 - 1 }; grew = true; }
      while (a.c2 < view.used.cols && colHas(a.c2 + 1)) { a = { ...a, c2: a.c2 + 1 }; grew = true; }
    }
    return a;
  };
  const single = area.r1 === area.r2 && area.c1 === area.c2;
  const sort = (asc: boolean) => {
    if (!editable) return;
    const a = view.filterArea && inArea(view.filterArea, sel.r, sel.c) ? view.filterArea : single ? region(sel.r, sel.c) : area;
    const first = [] as V[];
    for (let c = a.c1; c <= a.c2; c++) first.push(calc.value(sheet, a.r1, c));
    // A first row of text over numbers or dates is a header and stays put.
    const header = a.r2 > a.r1 && first.every((v) => typeof v === 'string' || v === null) && (() => { for (let c = a.c1; c <= a.c2; c++) if (typeof calc.value(sheet, a.r1 + 1, c) !== 'string') return true; return view.filterArea === a; })();
    setCells(ydoc, sheet, sortArea((k) => cellsOf(ydoc, sheet)?.get(k), (r, c) => calc.value(sheet, r, c), a, sel.c, asc, header));
  };
  const filter = () => {
    if (!editable) return;
    if (view.filter) { setMeta(ydoc, sheet, 'filter', undefined); return; }
    const a = single ? region(sel.r, sel.c) : area;
    if (a.r1 === a.r2) { toast('Put a header row over your data, then filter.'); return; }
    setMeta(ydoc, sheet, 'filter', { area: areaText(a), hide: {} });
  };
  const autosum = () => {
    if (!editable) return;
    if (single) {
      const num = (r: number, c: number) => typeof calc.value(sheet, r, c) === 'number';
      let r = sel.r - 1;
      while (r >= 0 && num(r, sel.c)) r--;
      if (r < sel.r - 1) { startEdit('edit', `=SUM(${addr(r + 1, sel.c)}:${addr(sel.r - 1, sel.c)})`); return; }
      let c = sel.c - 1;
      while (c >= 0 && num(sel.r, c)) c--;
      startEdit('edit', c < sel.c - 1 ? `=SUM(${addr(sel.r, c + 1)}:${addr(sel.r, sel.c - 1)})` : '=SUM()');
      return;
    }
    const changes: Record<string, CellJSON> = {};
    for (let c = area.c1; c <= area.c2; c++) changes[keyOf(area.r2 + 1, c)] = { v: `=SUM(${addr(area.r1, c)}:${addr(area.r2, c)})`, s: { ...(rawAt(area.r2 + 1, c)?.s ?? {}), b: true } };
    setCells(ydoc, sheet, changes);
  };
  const toggleCheck = (r: number, c: number) => { if (editable) setCells(ydoc, sheet, { [keyOf(r, c)]: { v: calc.value(sheet, r, c) === true ? 'FALSE' : 'TRUE', s: rawAt(r, c)?.s } }); };
  const addCheckboxes = () => {
    const checks = getMeta(ydoc, sheet, 'checks') ?? [];
    ydoc.transact(() => {
      setMeta(ydoc, sheet, 'checks', [...checks, { id: `v${Date.now().toString(36)}`, area: areaText(area), kind: 'checkbox' }]);
      const changes: Record<string, CellJSON> = {};
      eachCell(area, (r, c) => { const v = calc.value(sheet, r, c); if (typeof v !== 'boolean') changes[keyOf(r, c)] = { v: 'FALSE', s: { ...(rawAt(r, c)?.s ?? {}), align: 'center' } }; });
      setCells(ydoc, sheet, changes);
    }, LOCAL);
  };
  const insert = (what: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight') => {
    if (!editable) return;
    const n = what.startsWith('row') ? area.r2 - area.r1 + 1 : area.c2 - area.c1 + 1;
    if (what === 'rowAbove') changeLines(ydoc, sheet, 'row', area.r1, n);
    if (what === 'rowBelow') changeLines(ydoc, sheet, 'row', area.r2 + 1, n);
    if (what === 'colLeft') changeLines(ydoc, sheet, 'col', area.c1, n);
    if (what === 'colRight') changeLines(ydoc, sheet, 'col', area.c2 + 1, n);
  };
  const remove = (what: 'rows' | 'cols') => {
    if (!editable) return;
    if (what === 'rows') changeLines(ydoc, sheet, 'row', area.r1, -(Math.min(area.r2, MAX_ROWS - 1) - area.r1 + 1));
    else changeLines(ydoc, sheet, 'col', area.c1, -(area.c2 - area.c1 + 1));
    select(one(area.r1, area.c1));
  };
  const hide = (what: 'rows' | 'cols' | 'show') => {
    if (what === 'show') { ydoc.transact(() => { setMeta(ydoc, sheet, 'hiddenRows', undefined); setMeta(ydoc, sheet, 'hiddenCols', undefined); }, LOCAL); return; }
    const key = what === 'rows' ? 'hiddenRows' : 'hiddenCols';
    const now = new Set(getMeta(ydoc, sheet, key) ?? []);
    const [a, b] = what === 'rows' ? [area.r1, Math.min(area.r2, area.r1 + 1000)] : [area.c1, area.c2];
    for (let i = a; i <= b; i++) now.add(i);
    setMeta(ydoc, sheet, key, [...now]);
  };

  // ── Fill, copy and paste ───────────────────────────────────────────────────────────────
  const fill = (target: Area) => {
    if (!editable) return;
    const changes: Record<string, CellJSON | null> = {};
    const down = target.r2 > area.r2, up = target.r1 < area.r1, right = target.c2 > area.c2;
    if (down || up) {
      for (let c = area.c1; c <= area.c2; c++) {
        const src: { v: string; s?: Style }[] = [];
        for (let r = area.r1; r <= area.r2; r++) src.push(rawAt(r, c) ?? { v: '' });
        const list = up ? [...src].reverse() : src;
        const n = up ? area.r1 - target.r1 : target.r2 - area.r2;
        const made = fillSeries(list.map((x) => x.v), n, up ? -1 : 1, 0);
        made.forEach((v, i) => { const r = up ? area.r1 - 1 - i : area.r2 + 1 + i; changes[keyOf(r, c)] = { v, s: list[i % list.length].s }; });
      }
    } else {
      for (let r = area.r1; r <= area.r2; r++) {
        const src: { v: string; s?: Style }[] = [];
        for (let c = area.c1; c <= area.c2; c++) src.push(rawAt(r, c) ?? { v: '' });
        const list = right ? src : [...src].reverse();
        const n = right ? target.c2 - area.c2 : area.c1 - target.c1;
        const made = fillSeries(list.map((x) => x.v), n, 0, right ? 1 : -1);
        made.forEach((v, i) => { const c = right ? area.c2 + 1 + i : area.c1 - 1 - i; changes[keyOf(r, c)] = { v, s: list[i % list.length].s }; });
      }
    }
    setCells(ydoc, sheet, changes);
    select({ r: target.r1, c: target.c1, r2: target.r2, c2: target.c2 });
  };
  const fillDownRight = (down: boolean) => {
    if (!editable) return;
    const src = down ? { ...area, r2: area.r1 } : { ...area, c2: area.c1 };
    const clip = copyArea(ydoc, sheet, src);
    const at = down ? { r: area.r1 + 1, c: area.c1 } : { r: area.r1, c: area.c1 + 1 };
    const size = down ? { rows: area.r2 - area.r1, cols: area.c2 - area.c1 + 1 } : { rows: area.r2 - area.r1 + 1, cols: area.c2 - area.c1 };
    if (size.rows < 1 || size.cols < 1) return;
    const out = pasteCells({ ...clip, rows: down ? 1 : clip.rows, cols: down ? clip.cols : 1 }, at, size, 'all');
    setCells(ydoc, sheet, Object.fromEntries(Object.entries(out).filter(([k]) => { const x = parseAddr(k)!; return inArea(area, x.r, x.c); })));
  };
  const copyText = (a: Area) => {
    const lines: string[] = [];
    for (let r = a.r1; r <= Math.min(a.r2, a.r1 + 5000); r++) {
      const row: string[] = [];
      for (let c = a.c1; c <= a.c2; c++) { const cell = rawAt(r, c); row.push(cell ? display(calc.value(sheet, r, c), cell.s).replace(/[\t\n]/g, ' ') : ''); }
      lines.push(row.join('\t'));
    }
    return lines.join('\n');
  };
  const copy = (cut: boolean, data?: DataTransfer | null) => {
    const a = area.r2 === MAX_ROWS - 1 ? { ...area, r2: Math.max(area.r1, view.used.rows - 1) } : area;
    if ((a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1) > 100_000) { toast.error('That’s too many cells to copy at once.'); return; }
    const text = copyText(a);
    clipboard = { text, clip: copyArea(ydoc, sheet, a), sheet, cut };
    if (data) {
      data.setData('text/plain', text);
      const book = toBook(ydoc).sheets.find((s) => s.id === sheet);
      if (book) data.setData('text/html', sheetHtml({ ...book, cells: Object.fromEntries(Object.entries(book.cells).filter(([k]) => { const x = parseAddr(k)!; return inArea(a, x.r, x.c); }).map(([k, c]) => { const x = parseAddr(k)!; return [keyOf(x.r - a.r1, x.c - a.c1), c]; })) }, (k) => { const x = parseAddr(k)!; return calc.value(sheet, x.r + a.r1, x.c + a.c1); }));
    } else void navigator.clipboard?.writeText(text).catch(() => {});
    toast(`${cut ? 'Cut' : 'Copied'} ${areaText(a)}`, { duration: 1500 });
  };
  const paste = (text: string, mode: 'all' | 'values' = 'all') => {
    if (!editable) return;
    const internal = clipboard && clipboard.text === text ? clipboard : null;
    const clip = internal?.clip ?? clipFromText(text);
    const big = !single ? { rows: area.r2 - area.r1 + 1, cols: area.c2 - area.c1 + 1 } : null;
    const valueAt = internal ? (r: number, c: number) => { const v = calc.value(internal.sheet, r, c); return v === null ? '' : isErr(v) ? v.e : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v); } : undefined;
    const out = internal?.cut ? pasteCells({ ...clip, from: { r: area.r1, c: area.c1 } }, { r: area.r1, c: area.c1 }, null, mode, valueAt) : pasteCells(clip, { r: area.r1, c: area.c1 }, big, mode, valueAt);
    ydoc.transact(() => {
      if (internal?.cut) {
        // A cut moves: the old cells are emptied (where they aren't pasted over).
        const clear: Record<string, null> = {};
        for (let r = 0; r < clip.rows; r++) for (let c = 0; c < clip.cols; c++) clear[keyOf(clip.from.r + r, clip.from.c + c)] = null;
        setCells(ydoc, internal.sheet, clear);
        clipboard = null;
      }
      setCells(ydoc, sheet, out);
    }, LOCAL);
    const rows = Math.max(clip.rows, big?.rows ?? 0), cols = Math.max(clip.cols, big?.cols ?? 0);
    select({ r: area.r1, c: area.c1, r2: area.r1 + rows - 1, c2: area.c1 + cols - 1 });
  };
  const pasteFromMenu = (mode: 'all' | 'values') => {
    if (mode === 'values' && clipboard) { paste(clipboard.text, 'values'); return; }
    if (!navigator.clipboard?.readText) { toast('Press Ctrl+V (⌘V on a Mac) to paste.'); return; }
    navigator.clipboard.readText().then((t) => paste(t, mode), () => toast('Press Ctrl+V (⌘V on a Mac) to paste.'));
  };

  // ── Moving around ──────────────────────────────────────────────────────────────────────
  const hiddenR = (r: number) => view.hiddenRows.has(r), hiddenC = (c: number) => view.hiddenCols.has(c);
  const step = (r: number, c: number, dr: number, dc: number, jump: boolean): [number, number] => {
    const has = (rr: number, cc: number) => !!rawAt(rr, cc)?.v;
    let nr = r, nc = c;
    const next = () => { nr += dr; nc += dc; while (dr && hiddenR(nr) && nr > 0 && nr < MAX_ROWS - 1) nr += dr; while (dc && hiddenC(nc) && nc > 0 && nc < MAX_COLS - 1) nc += dc; };
    if (!jump) { next(); return [clampR(nr), clampC(nc)]; }
    // Ctrl + arrow: to the edge of the data, as in Excel.
    const limit = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= Math.max(view.used.rows, r + 1) || cc >= Math.max(view.used.cols, c + 1);
    next();
    if (limit(nr, nc)) return [clampR(dr > 0 ? Math.max(view.used.rows - 1, r) : dr < 0 ? 0 : r), clampC(dc > 0 ? Math.max(view.used.cols - 1, c) : dc < 0 ? 0 : c)];
    if (has(r, c) && has(nr, nc)) { while (!limit(nr + dr, nc + dc) && has(nr + dr, nc + dc)) next(); }
    else { while (!limit(nr, nc) && !has(nr, nc)) next(); if (limit(nr, nc)) { nr -= dr; nc -= dc; } }
    return [clampR(nr), clampC(nc)];
  };
  const move = (dr: number, dc: number, extend: boolean, jump = false) => {
    if (extend) { const [r2, c2] = step(sel.r2, sel.c2, dr, dc, jump); select({ ...sel, r2, c2 }); }
    else { const [r, c] = step(sel.r, sel.c, dr, dc, jump); select(one(r, c)); }
  };
  const goTo = (ref: string): boolean => {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(ref.trim());
    const name = m ? (m[1] ?? m[2]).replace(/''/g, "'") : null;
    const target = name ? ids.find((id) => nameOf(ydoc, id).toLowerCase() === name.toLowerCase()) : sheet;
    const a = parseArea((m ? m[3] : ref).trim().toUpperCase().replace(/\$/g, ''));
    if (!target || !a) return false;
    setPicked(target);
    select({ r: a.r1, c: a.c1, r2: a.r2, c2: a.c2 });
    focusGrid();
    return true;
  };

  const actions: ToolbarActions = {
    undo: () => undo.undo(), redo: () => undo.redo(), style: patch, toggle, decimals, borders,
    clearFormat: () => restyle(() => undefined), merge: () => void merge(), autosum, insert, remove, sort, filter,
    freeze: (r, c) => setMeta(ydoc, sheet, 'freeze', r || c ? { r, c } : undefined),
    dialog: (d) => setDialog(d), checkbox: addCheckboxes,
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (edit || (e.target as HTMLElement).closest('input, textarea, select, button')) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    const run = (f: () => void) => { e.preventDefault(); f(); };
    if (mod && !e.altKey) {
      const l = k.toLowerCase();
      if (l === 'z') return run(() => (e.shiftKey ? undo.redo() : undo.undo()));
      if (l === 'y') return run(() => undo.redo());
      if (l === 'b') return run(() => toggle('b'));
      if (l === 'i') return run(() => toggle('i'));
      if (l === 'u') return run(() => toggle('u'));
      if (l === 'a') return run(() => select({ r: 0, c: 0, r2: Math.max(0, view.used.rows - 1), c2: Math.max(0, view.used.cols - 1) }));
      if (l === 'd') return run(() => fillDownRight(true));
      if (l === 'r') return run(() => fillDownRight(false));
      if (l === 'f' || l === 'h') return run(() => setDialog('find'));
      if (k === ';') return run(() => { const d = new Date(); write(sheet, sel.r, sel.c, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); });
      if (k === ' ') return run(() => select({ r: 0, c: area.c1, r2: MAX_ROWS - 1, c2: area.c2 }));
      if (k === 'Home') return run(() => select(one(0, 0)));
      if (k === 'End') return run(() => select(one(Math.max(0, view.used.rows - 1), Math.max(0, view.used.cols - 1))));
    }
    if (e.altKey && k === '=') return run(autosum);
    if (e.shiftKey && k === ' ' && !mod) return run(() => select({ r: area.r1, c: 0, r2: area.r2, c2: MAX_COLS - 1 }));
    switch (k) {
      case 'ArrowUp': return run(() => move(-1, 0, e.shiftKey, mod));
      case 'ArrowDown': return run(() => move(1, 0, e.shiftKey, mod));
      case 'ArrowLeft': return run(() => move(0, -1, e.shiftKey, mod));
      case 'ArrowRight': return run(() => move(0, 1, e.shiftKey, mod));
      case 'Tab': return run(() => move(0, e.shiftKey ? -1 : 1, false));
      case 'Enter': return run(() => move(e.shiftKey ? -1 : 1, 0, false));
      case 'Home': return run(() => select(one(sel.r, 0)));
      case 'PageDown': return run(() => move(20, 0, e.shiftKey));
      case 'PageUp': return run(() => move(-20, 0, e.shiftKey));
      case 'Delete': case 'Backspace': return run(clearContents);
      case 'F2': return run(() => startEdit('edit'));
      case 'ContextMenu': return run(() => { const el = document.getElementById(`${gridId}-active`)?.getBoundingClientRect(); setCtx({ x: el?.right ?? 200, y: el?.bottom ?? 200 }); });
    }
    if (e.shiftKey && k === 'F10') return run(() => { const el = document.getElementById(`${gridId}-active`)?.getBoundingClientRect(); setCtx({ x: el?.right ?? 200, y: el?.bottom ?? 200 }); });
    if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit('enter', k); }
  };

  // ── The in-cell editor and formula help ──────────────────────────────────────────────────
  // The caret: kept with the text as it moves (read from the box in event handlers).
  const caret = () => edit?.at ?? edit?.text.length ?? 0;
  const at = caret();
  const token = edit && isFormula(edit.text) ? fnToken(edit.text, at) : null;
  const suggestions = token ? FUNCTION_HELP.filter((f) => f.name.startsWith(token.word.toUpperCase())).slice(0, 6) : [];
  const around = edit && isFormula(edit.text) ? fnAround(edit.text, at) : null;
  const track = (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => { const n = e.currentTarget.selectionStart ?? undefined; if (edit && n !== edit.at) setEdit({ ...edit, at: n }); };
  const sig = around ? FUNCTION_HELP.find((f) => f.name === around) : null;
  const accept = (name: string) => {
    if (!edit || !token) return;
    const text = `${edit.text.slice(0, token.start)}${name}(${edit.text.slice(caret())}`;
    const pos = token.start + name.length + 1;
    setEdit({ ...edit, text, at: pos, mode: 'edit' });
    requestAnimationFrame(() => { const el = editRef.current ?? barRef.current; el?.focus(); el?.setSelectionRange(pos, pos); });
  };
  const editorKeys = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!edit) return;
    if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setHint((h) => (h + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length); return; }
    if (suggestions.length && e.key === 'Tab') { e.preventDefault(); accept(suggestions[hint % suggestions.length].name); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const i = caret(); setEdit({ ...edit, text: `${edit.text.slice(0, i)}\n${edit.text.slice(i)}`, at: i + 1 }); return; }
    if (e.key === 'Enter') { e.preventDefault(); commit([e.shiftKey ? -1 : 1, 0]); return; }
    if (e.key === 'Tab') { e.preventDefault(); commit([0, e.shiftKey ? -1 : 1]); return; }
    // Typing a new entry: the arrows finish it and move on, as in Excel.
    if (edit.mode === 'enter' && !canPoint(edit.text, caret()) && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      commit(d[e.key]);
    }
  };
  const cellEditor = edit && edit.via === 'cell' && edit.sheet === sheet ? (
    <div className="absolute left-0 top-0 z-[20]" data-own-pointer>
      <textarea ref={editRef} autoFocus value={edit.text} spellCheck={false} aria-label={`Edit ${addr(edit.r, edit.c)}`}
        onChange={(e) => { setEdit({ ...edit, text: e.target.value, at: e.target.selectionStart }); setHint(0); }} onKeyDown={editorKeys} onSelect={track}
        onFocus={(e) => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }}
        className="block min-w-full resize-none border-2 border-indigo-600 dark:border-indigo-400 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-1 py-0.5 text-[13px] leading-[18px] outline-none shadow-lg font-[inherit]"
        style={{ width: Math.max(140, (edit.text.length + 2) * 7.5), height: Math.max(24, 20 * (edit.text.split('\n').length) + 4) }} />
      {(suggestions.length > 0 || sig) && <FormulaHelp list={suggestions} active={hint % Math.max(1, suggestions.length)} sig={sig ?? null} onPick={accept} />}
    </div>
  ) : null;

  const onPointerCell = (r: number, c: number, e: { shift: boolean; drag: boolean; kind: 'cell' | 'row' | 'col' | 'all' }) => {
    // Writing a formula: clicking a cell puts its address in, as in Excel.
    if (edit && e.kind === 'cell') {
      const at = pointing.current ?? (canPoint(edit.text, caret()) ? { start: caret(), end: caret(), from: { r, c } } : null);
      if (at) {
        const from = e.drag ? at.from : { r, c };
        const ref = `${edit.sheet !== sheet ? `${nameOf(ydoc, sheet).match(/^[A-Za-z_][\w.]*$/) ? nameOf(ydoc, sheet) : `'${nameOf(ydoc, sheet).replace(/'/g, "''")}'`}!` : ''}${areaText(norm({ r1: from.r, c1: from.c, r2: r, c2: c }))}`;
        const text = edit.text.slice(0, at.start) + ref + edit.text.slice(at.end);
        pointing.current = { start: at.start, end: at.start + ref.length, from };
        setEdit({ ...edit, text, at: at.start + ref.length, mode: 'edit' });
        requestAnimationFrame(() => { const el = editRef.current ?? barRef.current; el?.focus(); el?.setSelectionRange(at.start + ref.length, at.start + ref.length); });
        return;
      }
      if (!e.drag) commit();
    }
    if (e.kind === 'all') { select({ r: 0, c: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }); return; }
    if (e.kind === 'row') { select(e.shift ? { ...sel, c: 0, r2: r, c2: MAX_COLS - 1 } : { r, c: 0, r2: r, c2: MAX_COLS - 1 }); return; }
    if (e.kind === 'col') { select(e.shift ? { ...sel, r: 0, r2: MAX_ROWS - 1, c2: c } : { r: 0, c, r2: MAX_ROWS - 1, c2: c }); return; }
    if (e.shift) select({ ...sel, r2: r, c2: c });
    else if (!e.drag && r === sel.r && c === sel.c && single && !edit && 'ontouchstart' in window) startEdit('edit');
    else select(one(r, c));
  };

  // The page's handle on the workbook (versions, files, comments): one object for the editor's
  // whole life, whose methods use what's current (kept fresh after each render).
  const impl = useRef<SheetApi | null>(null);
  useEffect(() => {
    impl.current = {
      book: () => toBook(ydoc),
      valueOf: (sh, key) => { const x = parseAddr(key); return x ? new Calc(liveSource(ydoc)).value(sh, x.r, x.c) : null; },
      load: (b) => loadBook(ydoc, b),
      addSheets: (b) => {
        const book = cleanBook(b);
        const cur = toBook(ydoc);
        if (cur.sheets.length === 1 && !Object.keys(cur.sheets[0].cells).length) { loadBook(ydoc, book); return; }
        let last = sheetIds(ydoc).at(-1);
        for (const s of book.sheets) { const id = addSheet(ydoc, last, s); if (!id) { toast.error('A spreadsheet can have up to 30 sheets.'); break; } last = id; }
      },
      pickRef: () => `${/^[A-Za-z_][\w.]*$/.test(nameOf(ydoc, sheet)) ? nameOf(ydoc, sheet) : `'${nameOf(ydoc, sheet).replace(/'/g, "''")}'`}!${areaText(area)}`,
      goTo,
      activeSheet: () => sheet,
    };
  });
  const onApiRef = useRef(onApi);
  useEffect(() => { onApiRef.current = onApi; });
  useEffect(() => {
    const api: SheetApi = {
      book: () => impl.current!.book(), valueOf: (sh, k) => impl.current!.valueOf(sh, k), load: (b) => impl.current!.load(b),
      addSheets: (b) => impl.current!.addSheets(b), pickRef: () => impl.current!.pickRef(), goTo: (r) => impl.current!.goTo(r), activeSheet: () => impl.current!.activeSheet(),
    };
    onApiRef.current(api);
    return () => onApiRef.current(null);
  }, []);

  // ── Status bar: sum, average and count of the selection ──────────────────────────────────
  const stats = (() => {
    if (single) return null;
    let sum = 0, n = 0, count = 0, seen = 0;
    const a = { ...area, r2: Math.min(area.r2, Math.max(area.r1, view.used.rows - 1)), c2: Math.min(area.c2, Math.max(area.c1, view.used.cols - 1)) };
    for (let r = a.r1; r <= a.r2 && seen < 50_000; r++) for (let c = a.c1; c <= a.c2; c++) {
      seen++;
      if (!rawAt(r, c)?.v) continue;
      count++;
      const v = calc.value(sheet, r, c);
      if (typeof v === 'number') { sum += v; n++; }
    }
    return count ? { sum, n, count } : null;
  })();
  const fmtN = (x: number) => display(Number(x.toPrecision(12)), activeStyle?.fmt && activeStyle.fmt !== 'text' ? activeStyle : undefined);

  const listCheck = listFor ? checkAt(view, listFor.r, listFor.c) : null;
  const ctxItems: MenuItem[] = [
    { label: 'Cut', icon: <Scissors className="w-4 h-4" />, onSelect: () => copy(true), disabled: !editable, hint: 'Ctrl X' },
    { label: 'Copy', icon: <Copy className="w-4 h-4" />, onSelect: () => copy(false), hint: 'Ctrl C' },
    { label: 'Paste', icon: <ClipboardPaste className="w-4 h-4" />, onSelect: () => pasteFromMenu('all'), disabled: !editable, hint: 'Ctrl V' },
    { label: 'Paste values only', onSelect: () => pasteFromMenu('values'), disabled: !editable || !clipboard },
    'sep',
    { label: 'Insert row above', onSelect: () => insert('rowAbove'), disabled: !editable }, { label: 'Insert row below', onSelect: () => insert('rowBelow'), disabled: !editable },
    { label: 'Insert column left', onSelect: () => insert('colLeft'), disabled: !editable }, { label: 'Insert column right', onSelect: () => insert('colRight'), disabled: !editable },
    { label: 'Delete rows', onSelect: () => remove('rows'), disabled: !editable }, { label: 'Delete columns', onSelect: () => remove('cols'), disabled: !editable },
    'sep',
    { label: 'Clear contents', onSelect: clearContents, disabled: !editable, hint: 'Delete' },
    { label: 'Clear formatting', onSelect: () => restyle(() => undefined), disabled: !editable },
    { label: 'Sort A → Z', onSelect: () => sort(true), disabled: !editable }, { label: 'Sort Z → A', onSelect: () => sort(false), disabled: !editable },
    { label: 'Hide rows', onSelect: () => hide('rows'), disabled: !editable }, { label: 'Hide columns', onSelect: () => hide('cols'), disabled: !editable },
    { label: 'Show hidden rows and columns', onSelect: () => hide('show'), disabled: !editable || !(getMeta(ydoc, sheet, 'hiddenRows')?.length || getMeta(ydoc, sheet, 'hiddenCols')?.length) },
    'sep',
    { label: 'Comment', icon: <MessageSquarePlus className="w-4 h-4" />, onSelect: () => onComment(`${nameOf(ydoc, sheet)}!${areaText(area)}`) },
  ];

  const active = rawAt(sel.r, sel.c);
  const tabs = ids.map((id) => ({ id, name: nameOf(ydoc, id), color: ydoc.getMap<Y.Map<unknown>>('sheets').get(id)?.get('color') as string | undefined }));
  const sheetCharts = getMeta(ydoc, sheet, 'charts') ?? [];

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="border-b border-zinc-200/70 dark:border-white/[0.06] bg-white/80 dark:bg-[#0b0e1a]/80">
        <SheetToolbar s={activeStyle} on={actions} canEdit={editable} canUndo={stacks.undo > 0} canRedo={stacks.redo > 0} frozen={view.freeze} filterOn={!!view.filter} merged={!!mergeHere} sel={sel} />
      </div>
      <div className="flex items-stretch gap-0 border-b border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[#0f1322] text-sm">
        <NameBox value={areaText(area)} onGo={(t) => { if (!goTo(t)) toast.error('That isn’t a cell or range, like B3 or A1:C10.'); }} />
        <span aria-hidden className="px-2 flex items-center text-zinc-500 dark:text-zinc-400 italic font-serif border-r border-zinc-200 dark:border-white/[0.07]">fx</span>
        <div className="relative flex-1 min-w-0">
          <input ref={barRef} aria-label="Formula bar" value={edit ? edit.text : active?.v ?? ''} readOnly={!editable} spellCheck={false}
            onFocus={() => { if (editable && !edit) setEdit({ text: active?.v ?? '', sheet, r: sel.r, c: sel.c, mode: 'edit', via: 'bar' }); }}
            onChange={(e) => { if (edit) setEdit({ ...edit, text: e.target.value, at: e.target.selectionStart ?? undefined }); setHint(0); }} onKeyDown={editorKeys} onSelect={track}
            className="w-full h-8 px-2 bg-transparent outline-none font-mono text-[13px] text-zinc-900 dark:text-zinc-100" />
          {edit?.via === 'bar' && (suggestions.length > 0 || sig) && <div className="absolute left-0 top-8 z-30"><FormulaHelp list={suggestions} active={hint % Math.max(1, suggestions.length)} sig={sig ?? null} onPick={accept} /></div>}
        </div>
      </div>
      <SheetGrid doc={ydoc} sheet={sheet} sheetName={nameOf(ydoc, sheet)} version={version} calc={calc} view={view} sel={sel} canEdit={editable}
        others={others.filter((o) => o.sheet === sheet)} commented={commented} editor={cellEditor} gridId={gridId}
        onPointerCell={onPointerCell} onEditCell={() => startEdit('edit')} onFill={fill}
        onResize={(axis, i, size) => { const targets = axis === 'col' && area.c1 <= i && i <= area.c2 && area.r1 === 0 && area.r2 === MAX_ROWS - 1 ? Array.from({ length: area.c2 - area.c1 + 1 }, (_, k) => area.c1 + k) : axis === 'row' && area.r1 <= i && i <= area.r2 && area.c1 === 0 && area.c2 === MAX_COLS - 1 ? Array.from({ length: Math.min(500, area.r2 - area.r1 + 1) }, (_, k) => area.r1 + k) : [i]; setSizes(ydoc, sheet, axis === 'col' ? 'cols' : 'rows', Object.fromEntries(targets.map((t) => [t, size]))); }}
        onAutofit={(axis, i) => { if (!editable) return; if (axis === 'col') setSizes(ydoc, sheet, 'cols', { [i]: fitWidth(view, sheet, calc, i) }); else setSizes(ydoc, sheet, 'rows', { [i]: null }); }}
        onContext={(x, y) => setCtx({ x, y })} onCheck={toggleCheck}
        onList={(r, c, el) => { const b = el.getBoundingClientRect(); setListFor({ r, c, x: b.left, y: b.bottom }); }}
        onFilterMenu={(c, el) => { const b = el.getBoundingClientRect(); setFilterFor({ c, x: b.left, y: b.bottom }); }}
        keyHandlers={{ onKeyDown, onCopy: (e) => { if (edit || (e.target as HTMLElement).closest('input, textarea')) return; e.preventDefault(); copy(false, e.clipboardData); }, onCut: (e) => { if (edit || !editable || (e.target as HTMLElement).closest('input, textarea')) return; e.preventDefault(); copy(true, e.clipboardData); }, onPaste: (e) => { if (edit || (e.target as HTMLElement).closest('input, textarea')) return; e.preventDefault(); paste(e.clipboardData.getData('text/plain')); } }} />
      {sheetCharts.length > 0 && (
        <div className="border-t border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-[#0b0e1a]">
          <button type="button" onClick={() => setCharts((x) => !x)} aria-expanded={charts} className="w-full text-left px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Charts ({sheetCharts.length}) {charts ? '▾' : '▸'}</button>
          {charts && <SheetCharts doc={ydoc} sheet={sheet} calc={calc} version={version} canEdit={editable} />}
        </div>
      )}
      <SheetTabs tabs={tabs} active={sheet} canEdit={editable}
        onPick={(id) => { if (edit && edit.via === 'cell' && !pointing.current && !canPoint(edit.text, caret())) commit(); setPicked(id); select(one(0, 0)); }}
        onAdd={() => { const id = addSheet(ydoc, sheet); if (id) setPicked(id); else toast.error('A spreadsheet can have up to 30 sheets.'); }}
        onRename={(id, n) => { const done = renameSheet(ydoc, id, n); if (done !== n.trim() && n.trim()) toast(`Named “${done}”`); }}
        onCopy={(id) => { const n = duplicateSheet(ydoc, id); if (n) setPicked(n); }}
        onMove={(id, d) => moveSheet(ydoc, id, ids.indexOf(id) + d)}
        onColor={(id, c) => setSheetColor(ydoc, id, c)}
        onDelete={async (id) => { if (await confirmDialog({ title: `Delete “${nameOf(ydoc, id)}”?`, message: 'Its cells go for everyone. Formulas on other sheets that use it will show #REF!. You can undo this.', destructive: true })) { deleteSheet(ydoc, id); setPicked(null); } }}
        status={stats ? <p className="shrink-0 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums hidden sm:block" aria-live="polite">{stats.n ? `Sum ${fmtN(stats.sum)} · Average ${fmtN(stats.sum / stats.n)} · ` : ''}Count {stats.count}</p> : null} />
      {ctx && <Floating x={ctx.x} y={ctx.y} onClose={() => { setCtx(null); focusGrid(); }}><MenuList label="Cell actions" items={ctxItems} onDone={() => setCtx(null)} /></Floating>}
      {listFor && listCheck?.list && (
        <Floating x={listFor.x} y={listFor.y} onClose={() => { setListFor(null); focusGrid(); }}>
          <MenuList label="Pick a value" onDone={() => setListFor(null)} items={[...listCheck.list.map((v) => ({ label: v, checked: rawAt(listFor.r, listFor.c)?.v === v, onSelect: () => { write(sheet, listFor.r, listFor.c, v); focusGrid(); } })), 'sep', { label: 'Clear', onSelect: () => { write(sheet, listFor.r, listFor.c, ''); focusGrid(); } }]} />
        </Floating>
      )}
      {filterFor && view.filterArea && (
        <Floating x={filterFor.x} y={filterFor.y} onClose={() => { setFilterFor(null); focusGrid(); }}>
          <FilterMenu values={(() => { const out = new Map<string, number>(); for (let r = view.filterArea.r1 + 1; r <= view.filterArea.r2; r++) { const cell = rawAt(r, filterFor.c); const t = cell ? display(calc.value(sheet, r, filterFor.c), cell.s) : ''; out.set(t, (out.get(t) ?? 0) + 1); } return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })); })()}
            hidden={view.filter?.hide[filterFor.c] ?? []} canEdit={editable}
            onSort={(asc) => { setFilterFor(null); select(one(view.filterArea!.r1 + 1, filterFor.c)); const a = view.filterArea!; setCells(ydoc, sheet, sortArea((k) => cellsOf(ydoc, sheet)?.get(k), (r, c) => calc.value(sheet, r, c), a, filterFor.c, asc, true)); }}
            onApply={(hide) => { setFilterFor(null); const f = getMeta(ydoc, sheet, 'filter'); if (f) setMeta(ydoc, sheet, 'filter', { ...f, hide: { ...f.hide, [filterFor.c]: hide } }); focusGrid(); }} />
        </Floating>
      )}
      <SheetDialogs kind={dialog} onClose={() => { setDialog(null); focusGrid(); }} doc={ydoc} sheet={sheet} calc={calc} area={area} canEdit={editable}
        onGoTo={(sh, r, c) => { setPicked(sh); select(one(r, c)); }} onInsertFunction={(name) => { setDialog(null); startEdit('edit', `=${name}(`); }} title={title} />
    </div>
  );
}

function NameBox({ value, onGo }: { value: string; onGo: (t: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input aria-label="Cell or range (type one to go there)" value={text ?? value} onFocus={(e) => { setText(value); e.currentTarget.select(); }} onBlur={() => setText(null)}
      onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { onGo(text ?? value); setText(null); e.currentTarget.blur(); } if (e.key === 'Escape') { setText(null); e.currentTarget.blur(); } }}
      className="w-24 sm:w-28 h-8 px-2 bg-transparent border-r border-zinc-200 dark:border-white/[0.07] outline-none font-mono text-[13px] text-zinc-900 dark:text-zinc-100" />
  );
}

function FormulaHelp({ list, active, sig, onPick }: { list: typeof FUNCTION_HELP; active: number; sig: (typeof FUNCTION_HELP)[number] | null; onPick: (n: string) => void }) {
  return (
    <div className="mt-1 w-80 max-w-[90vw] rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm overflow-hidden">
      {sig && !list.length && <p className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300"><span className="font-mono font-semibold">{sig.name}({sig.args})</span><br />{sig.does}</p>}
      {list.length > 0 && (
        <ul role="listbox" aria-label="Functions">
          {list.map((f, i) => (
            <li key={f.name} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); onPick(f.name); }} className={cn('w-full text-left px-3 py-1.5', i === active && 'bg-indigo-50 dark:bg-indigo-500/15')}>
                <span className="font-mono font-semibold text-zinc-900 dark:text-white">{f.name}</span><span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">({f.args})</span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">{f.does}</span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-white/[0.06]">Tab to choose · ↑↓ to move</li>
        </ul>
      )}
    </div>
  );
}

/** A menu at a point on the screen (right-click, a cell's list, a filter). */
function Floating({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const el = box.current;
    if (el) {
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
      el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
      el.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled]), input, button')?.focus();
    }
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [x, y]);
  return createPortal(
    <div ref={box} style={{ position: 'fixed', left: -9999, top: -9999 }} className="z-[70] min-w-52 max-w-72 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm text-zinc-800 dark:text-zinc-100">{children}</div>,
    document.body,
  );
}

function FilterMenu({ values, hidden, canEdit, onSort, onApply }: { values: [string, number][]; hidden: string[]; canEdit: boolean; onSort: (asc: boolean) => void; onApply: (hide: string[]) => void }) {
  const [off, setOff] = useState(() => new Set(hidden));
  const [q, setQ] = useState('');
  const shown = values.filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
  return (
    <div className="p-2 space-y-2 w-64">
      <div className="flex gap-1">
        <button type="button" disabled={!canEdit} onClick={() => onSort(true)} className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] disabled:opacity-40">Sort A → Z</button>
        <button type="button" disabled={!canEdit} onClick={() => onSort(false)} className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] disabled:opacity-40">Sort Z → A</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search values" aria-label="Search values" className="input py-1.5 text-sm" />
      <div className="flex gap-3 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
        <button type="button" onClick={() => setOff(new Set())}>Select all</button>
        <button type="button" onClick={() => setOff(new Set(values.map(([v]) => v)))}>Clear</button>
      </div>
      <ul className="max-h-56 overflow-y-auto space-y-0.5" aria-label="Values to show">
        {shown.map(([v, n]) => (
          <li key={v}>
            <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-sm">
              <input type="checkbox" checked={!off.has(v)} onChange={() => setOff((s) => { const x = new Set(s); if (x.has(v)) x.delete(v); else x.add(v); return x; })} className="w-4 h-4 accent-indigo-600" />
              <span className="flex-1 truncate">{v || '(Blank)'}</span><span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{n}</span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" disabled={!canEdit} onClick={() => onApply([...off])} className="btn-primary btn-sm w-full disabled:opacity-40">Show these</button>
    </div>
  );
}
