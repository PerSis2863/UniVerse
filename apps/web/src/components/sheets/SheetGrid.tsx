'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { ChevronDown, Filter } from 'lucide-react';
import type { Calc } from '@/lib/sheet/calc';
import { DEFAULT_COL, DEFAULT_ROW, type CellJSON, type CheckJSON, type RuleJSON } from '@/lib/sheet/book';
import { alignOf, display, type Style } from '@/lib/sheet/format';
import { cellsOf, getMeta, sizeOf, usedSize } from '@/lib/sheet/model';
import { MAX_COLS, MAX_ROWS, colName, inArea, keyOf, norm, parseArea, type Area } from '@/lib/sheet/refs';
import { ruleLook, ruleStats, type RuleStats } from '@/lib/sheet/tools';
import { isErr, type V } from '@/lib/sheet/values';
import { cn } from '@/lib/utils';
import { readable, textOn } from '@/lib/contrast';
import { useDarkMode } from '@/lib/use-dark';
import { Axis, HEADER_H, ROWHEAD_W, windowOf } from './geometry';

// The cells of a spreadsheet (Office suite): only what's in view is drawn (a few thousand rows stay
// quick), with frozen rows and columns kept in place, merged cells, text running into empty cells
// next to it as in Excel, conditional colours, data bars, checkboxes and drop-down lists, other
// people's selections in their colour, the fill handle and resizing rows and columns.
// A grid for screen readers: the active cell is announced (aria-activedescendant).

export interface Sel { r: number; c: number; r2: number; c2: number }
export const selArea = (s: Sel): Area => norm({ r1: s.r, c1: s.c, r2: s.r2, c2: s.c2 });
export interface Other { name: string; color: string; r: number; c: number }

/** What the grid needs to know about a sheet, worked out once per change. */
export function useSheetView(doc: Y.Doc, sheet: string, version: number, calc: Calc) {
  return useMemo(() => {
    void version;
    const cells = cellsOf(doc, sheet);
    const used = usedSize(doc, sheet);
    const freeze = getMeta(doc, sheet, 'freeze') ?? { r: 0, c: 0 };
    const merges = (getMeta(doc, sheet, 'merges') ?? []).map(parseArea).filter((a): a is Area => !!a);
    const filter = getMeta(doc, sheet, 'filter');
    const rules = getMeta(doc, sheet, 'rules') ?? [];
    const checks = getMeta(doc, sheet, 'checks') ?? [];
    const hiddenRows = new Set(getMeta(doc, sheet, 'hiddenRows') ?? []);
    const hiddenCols = new Set(getMeta(doc, sheet, 'hiddenCols') ?? []);
    // Rows the filter hides: below its header, where a column's shown value is unticked.
    const filterArea = filter ? parseArea(filter.area) : null;
    if (filter && filterArea) {
      const hide = Object.entries(filter.hide).filter(([, list]) => list.length).map(([c, list]) => [Number(c), new Set(list)] as const);
      if (hide.length) for (let r = filterArea.r1 + 1; r <= filterArea.r2; r++) {
        for (const [c, set] of hide) {
          const cell = cells?.get(keyOf(r, c));
          const t = cell ? display(calc.value(sheet, r, c), cell.s) : '';
          if (set.has(t)) { hiddenRows.add(r); break; }
        }
      }
    }
    const merged = new Map<string, Area>(), covered = new Set<string>();
    for (const m of merges) {
      merged.set(keyOf(m.r1, m.c1), m);
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(keyOf(r, c));
    }
    const ruleList = rules.map((rule) => {
      const a = parseArea(rule.area);
      if (!a) return null;
      const vals: V[] = [];
      for (let r = a.r1; r <= Math.min(a.r2, a.r1 + 5000); r++) for (let c = a.c1; c <= a.c2; c++) vals.push(cells?.has(keyOf(r, c)) ? calc.value(sheet, r, c) : null);
      return { rule, a, st: ruleStats(rule, vals) };
    }).filter((x): x is { rule: RuleJSON; a: Area; st: RuleStats } => !!x);
    const checkList = checks.map((ch) => ({ ch, a: parseArea(ch.area) })).filter((x): x is { ch: CheckJSON; a: Area } => !!x.a);
    return { cells, used, freeze, merged, covered, filter, filterArea, ruleList, checkList, hiddenRows, hiddenCols };
  }, [doc, sheet, version, calc]);
}
export type SheetView = ReturnType<typeof useSheetView>;

export const checkAt = (view: SheetView, r: number, c: number) => view.checkList.find((x) => inArea(x.a, r, c))?.ch ?? null;

const fontPx = (s?: Style) => (s?.size ? Math.round(s.size * 4 / 3) : 13);
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, s?: Style) {
  if (typeof document === 'undefined') return text.length * 7;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = `${s?.i ? 'italic ' : ''}${s?.b ? '700 ' : '400 '}${fontPx(s)}px ${s?.font ? `"${s.font}"` : 'Inter, system-ui, sans-serif'}`;
  return measureCtx.measureText(text).width;
}
/** The width a column needs for its widest cell (double-clicking its edge). */
export function fitWidth(view: SheetView, sheet: string, calc: Calc, c: number): number {
  let w = 40;
  for (const [k, cell] of view.cells?.entries() ?? []) {
    const m = /^([A-Z]+)(\d+)$/.exec(k);
    if (!m || m[1] !== colName(c)) continue;
    const r = Number(m[2]) - 1;
    w = Math.max(w, textWidth(display(calc.value(sheet, r, c), cell.s), cell.s) + 14);
  }
  return Math.min(600, Math.ceil(w));
}

interface Props {
  doc: Y.Doc; sheet: string; sheetName: string; version: number; calc: Calc; view: SheetView;
  sel: Sel; canEdit: boolean; others: Other[]; commented: Set<string>;
  /** The in-cell editor, drawn in the active cell while editing. */
  editor: React.ReactNode;
  /** The grid's id (the editor focuses it by id); the active cell's is `${gridId}-active`. */
  gridId: string;
  onPointerCell: (r: number, c: number, e: { shift: boolean; drag: boolean; kind: 'cell' | 'row' | 'col' | 'all' }) => void;
  onEditCell: () => void;
  onFill: (target: Area) => void;
  onResize: (axis: 'col' | 'row', i: number, size: number) => void;
  onAutofit: (axis: 'col' | 'row', i: number) => void;
  onContext: (x: number, y: number) => void;
  onCheck: (r: number, c: number) => void;
  onList: (r: number, c: number, el: HTMLElement) => void;
  onFilterMenu: (c: number, el: HTMLElement) => void;
  keyHandlers: Pick<React.HTMLAttributes<HTMLDivElement>, 'onKeyDown' | 'onCopy' | 'onCut' | 'onPaste'>;
}

export const SheetGrid = memo(function SheetGrid(p: Props) {
  const { view, sel, calc, sheet } = p;
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, w: 900, h: 600 });
  const [extra, setExtra] = useState({ rows: 0, cols: 0 });
  const drag = useRef<{ kind: 'cell' | 'row' | 'col' | 'fill' | 'resize'; axis?: 'col' | 'row'; i?: number; start?: number; size?: number; moved?: boolean } | null>(null);
  const [fillTo, setFillTo] = useState<Area | null>(null);
  const [resizing, setResizing] = useState<{ axis: 'col' | 'row'; i: number; size: number } | null>(null);
  const dark = useDarkMode();

  const area = selArea(sel);
  const nRows = Math.min(MAX_ROWS, Math.max(100, view.used.rows + 50, area.r2 + 30) + extra.rows);
  const nCols = Math.min(MAX_COLS, Math.max(26, view.used.cols + 8, area.c2 + 6) + extra.cols);
  const doc = p.doc;
  // Sizes come from the sheet (`view` is new after every change), or the edge being dragged.
  const rows = useMemo(() => new Axis(nRows, (r) => (view.hiddenRows.has(r) ? 0 : resizing?.axis === 'row' && resizing.i === r ? resizing.size : sizeOf(doc, sheet, 'rows', r) ?? DEFAULT_ROW)), [nRows, view, resizing, doc, sheet]);
  const cols = useMemo(() => new Axis(nCols, (c) => (view.hiddenCols.has(c) ? 0 : resizing?.axis === 'col' && resizing.i === c ? resizing.size : sizeOf(doc, sheet, 'cols', c) ?? DEFAULT_COL)), [nCols, view, resizing, doc, sheet]);
  const fr = Math.min(view.freeze.r, nRows), fc = Math.min(view.freeze.c, nCols);
  const [r0, r1] = windowOf(rows, fr, box.top, box.h, HEADER_H);
  const [c0, c1] = windowOf(cols, fc, box.left, box.w, ROWHEAD_W);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox((b) => ({ ...b, w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the active cell in view when it moves.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const { r, c } = { r: sel.r2, c: sel.c2 };
    const top = rows.pos(r), h = rows.size(r), left = cols.pos(c), w = cols.size(c);
    const fh = rows.pos(fr), fw = cols.pos(fc);
    if (r >= fr) {
      if (top - fh < el.scrollTop) el.scrollTop = top - fh;
      else if (top + h + HEADER_H > el.scrollTop + el.clientHeight) el.scrollTop = top + h + HEADER_H - el.clientHeight;
    }
    if (c >= fc) {
      if (left - fw < el.scrollLeft) el.scrollLeft = left - fw;
      else if (left + w + ROWHEAD_W > el.scrollLeft + el.clientWidth) el.scrollLeft = left + w + ROWHEAD_W - el.clientWidth;
    }
  }, [sel.r2, sel.c2, rows, cols, fr, fc]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setBox({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight });
    // Near the end: more rows and columns to scroll into.
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 300 && nRows < MAX_ROWS) setExtra((x) => ({ ...x, rows: x.rows + 100 }));
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 300 && nCols < MAX_COLS) setExtra((x) => ({ ...x, cols: x.cols + 10 }));
  };

  /** The cell under a point on screen. */
  const hit = (clientX: number, clientY: number) => {
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const fh = rows.pos(fr), fw = cols.pos(fc);
    const ry = y < HEADER_H ? -1 : y - HEADER_H < fh ? y - HEADER_H : y - HEADER_H + el.scrollTop;
    const cx = x < ROWHEAD_W ? -1 : x - ROWHEAD_W < fw ? x - ROWHEAD_W : x - ROWHEAD_W + el.scrollLeft;
    return { r: ry < 0 ? -1 : rows.at(ry), c: cx < 0 ? -1 : cols.at(cx) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.button === 2 || t.closest('[data-own-pointer]') || t.closest('textarea, input')) return;
    const { r, c } = hit(e.clientX, e.clientY);
    const kind = r < 0 && c < 0 ? 'all' : r < 0 ? 'col' : c < 0 ? 'row' : 'cell';
    p.onPointerCell(Math.max(0, r), Math.max(0, c), { shift: e.shiftKey, drag: false, kind });
    if (e.pointerType !== 'touch' && kind !== 'all') {
      drag.current = { kind };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    // Past the edge: scroll along.
    if (e.clientY > rect.bottom - 10) el.scrollTop += 20; else if (e.clientY < rect.top + HEADER_H + 4) el.scrollTop -= 20;
    if (e.clientX > rect.right - 10) el.scrollLeft += 20; else if (e.clientX < rect.left + ROWHEAD_W + 4) el.scrollLeft -= 20;
    const { r, c } = hit(e.clientX, e.clientY);
    if (d.kind === 'resize') {
      const pos = d.axis === 'col' ? e.clientX : e.clientY;
      setResizing({ axis: d.axis!, i: d.i!, size: Math.max(d.axis === 'col' ? 20 : 16, Math.min(d.axis === 'col' ? 1000 : 600, d.size! + pos - d.start!)) });
      return;
    }
    if (d.kind === 'fill') {
      // Along whichever way the pointer has gone further from the selection.
      const rr = Math.max(0, r), cc = Math.max(0, c);
      const down = rr > area.r2 ? rr - area.r2 : rr < area.r1 ? rr - area.r1 : 0;
      const right = cc > area.c2 ? cc - area.c2 : cc < area.c1 ? cc - area.c1 : 0;
      if (!down && !right) { setFillTo(null); return; }
      setFillTo(Math.abs(down) >= Math.abs(right)
        ? norm({ r1: down > 0 ? area.r1 : rr, c1: area.c1, r2: down > 0 ? rr : area.r2, c2: area.c2 })
        : norm({ r1: area.r1, c1: right > 0 ? area.c1 : cc, r2: area.r2, c2: right > 0 ? cc : area.c2 }));
      return;
    }
    d.moved = true;
    p.onPointerCell(Math.max(0, r), Math.max(0, c), { shift: true, drag: true, kind: d.kind as 'cell' | 'row' | 'col' });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'fill' && fillTo) p.onFill(fillTo);
    if (d?.kind === 'resize' && resizing) p.onResize(resizing.axis, resizing.i, Math.round(resizing.size));
    setFillTo(null);
    setResizing(null);
  };
  // A row's or column's edge (which one: its data-axis and data-i).
  const startResize = (e: React.PointerEvent<HTMLElement>) => {
    const axis = e.currentTarget.dataset.axis === 'row' ? 'row' : 'col', i = Number(e.currentTarget.dataset.i);
    e.stopPropagation();
    e.preventDefault();
    drag.current = { kind: 'resize', axis, i, start: axis === 'col' ? e.clientX : e.clientY, size: axis === 'col' ? cols.size(i) : rows.size(i) };
    scroller.current?.setPointerCapture(e.pointerId);
  };
  const autofit = (e: React.MouseEvent<HTMLElement>) => p.onAutofit(e.currentTarget.dataset.axis === 'row' ? 'row' : 'col', Number(e.currentTarget.dataset.i));
  const startFill = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { kind: 'fill' };
    scroller.current?.setPointerCapture(e.pointerId);
  };

  const totalW = ROWHEAD_W + cols.total, totalH = HEADER_H + rows.total;
  const othersAt = new Map(p.others.map((o) => [keyOf(o.r, o.c), o]));
  const inSel = (r: number, c: number) => inArea(area, r, c);
  const colInSel = (c: number) => c >= area.c1 && c <= area.c2;
  const rowInSel = (r: number) => r >= area.r1 && r <= area.r2;

  const cellEl = (r: number, c: number, left: number | null) => {
    const k = keyOf(r, c);
    const w = cols.size(c), h = rows.size(r);
    if (!w) return null;
    const active = r === sel.r && c === sel.c;
    const covered = view.covered.has(k);
    const merge = view.merged.get(k);
    const cell: CellJSON | undefined = view.cells?.get(k);
    const v = cell ? calc.value(sheet, r, c) : null;
    const s = cell?.s;
    let text = cell ? display(v, s) : '';
    let look: { color?: string; bg?: string; bar?: number } | null = null;
    for (const x of view.ruleList) if (inArea(x.a, r, c)) { look = ruleLook(x.rule, v, x.st); if (look) break; }
    const check = checkAt(view, r, c);
    const isBox = check?.kind === 'checkbox';
    if (isBox) text = '';
    const align = alignOf(v, s);
    const bg = look?.bg ?? s?.bg;
    // Chosen colours stay readable on what's behind them (a fill, or the light or dark sheet).
    const chosen = look?.color ?? s?.color ?? (isErr(v) ? '#b91c1c' : undefined);
    const ink = chosen ? readable(chosen, bg ?? (dark ? '#0b1a24' : '#ffffff')) : bg ? textOn(bg) : undefined;
    // Text runs on into empty cells to its right (left-aligned, not wrapped).
    let span = merge ? cols.span(merge.c1, merge.c2) : w;
    const spanH = merge ? rows.span(merge.r1, merge.r2) : h;
    if (!merge && text && !s?.wrap && align === 'left' && typeof v === 'string' && textWidth(text, s) > w - 8) {
      for (let cc = c + 1; cc < Math.min(nCols, c + 20) && span < textWidth(text, s) + 8; cc++) {
        if (view.cells?.has(keyOf(r, cc)) || view.covered.has(keyOf(r, cc))) break;
        span += cols.size(cc);
      }
    }
    const filterHead = view.filterArea && r === view.filterArea.r1 && c >= view.filterArea.c1 && c <= view.filterArea.c2;
    const filtered = filterHead && (view.filter?.hide[c]?.length ?? 0) > 0;
    const listBtn = active && check?.kind === 'list' && p.canEdit;
    const other = othersAt.get(k);
    const selected = inSel(r, c);
    const edges = selected ? { t: r === area.r1, b: r === area.r2, l: c === area.c1, r: c === area.c2 } : null;
    const filling = fillTo && inArea(fillTo, r, c) && !selected;
    const sticky = left != null;
    return (
      <div key={k} id={active ? `${p.gridId}-active` : undefined} role="gridcell" aria-colindex={c + 2} aria-selected={selected || undefined}
        aria-label={active ? `${colName(c)}${r + 1}${text ? `, ${text}` : ''}` : undefined}
        className={cn('relative shrink-0 border-e border-b border-zinc-200 dark:border-white/[0.07] select-none', sticky && 'sticky z-[2] bg-white dark:bg-[#0b1a24]', covered && 'border-transparent dark:border-transparent')}
        style={{ width: w, height: h, ...(sticky ? { left } : {}), ...(bg && !covered ? { background: bg } : {}) }}>
        {!covered && (
          <div className={cn('absolute top-0 start-0 px-1 flex overflow-hidden', s?.wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre', (span > w || merge) && 'z-[1]', (span > w || merge) && !bg && 'bg-white dark:bg-[#0b1a24]')}
            style={{ width: span - 1, height: spanH - 1, alignItems: s?.va === 'top' ? 'flex-start' : s?.va === 'middle' ? 'center' : 'flex-end', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
              fontWeight: s?.b ? 700 : undefined, fontStyle: s?.i ? 'italic' : undefined, textDecoration: [s?.u && 'underline', s?.st && 'line-through'].filter(Boolean).join(' ') || undefined,
              color: ink, fontSize: fontPx(s), fontFamily: s?.font ? `"${s.font}"` : undefined, ...(merge && bg ? { background: bg } : {}) }}>
            {look?.bar != null && <span aria-hidden className="absolute start-0 top-1 bottom-1 rounded-e bg-sky-400/40" style={{ width: `${Math.round(look.bar * 100)}%` }} />}
            {isBox ? (
              <input type="checkbox" data-own-pointer checked={v === true} disabled={!p.canEdit} aria-label={`${colName(c)}${r + 1}`} onChange={() => p.onCheck(r, c)} className="m-auto w-4 h-4 accent-indigo-600" />
            ) : <span className={cn('relative leading-[22px] text-zinc-900 dark:text-zinc-100', s?.wrap ? 'w-full' : 'truncate')} style={ink ? { color: ink } : undefined}>{text}</span>}
          </div>
        )}
        {s?.bd && <span aria-hidden className="absolute inset-0 pointer-events-none border-zinc-700 dark:border-zinc-300" style={{ borderTopWidth: s.bd.t ? 1 : 0, borderRightWidth: s.bd.r ? 1 : 0, borderBottomWidth: s.bd.b ? 1 : 0, borderLeftWidth: s.bd.l ? 1 : 0 }} />}
        {p.commented.has(k) && <span aria-hidden title="Has a comment" className="absolute top-0 end-0 w-0 h-0 border-t-[7px] border-s-[7px] border-t-amber-500 border-s-transparent z-[3]" />}
        {(filterHead || listBtn) && (
          <button type="button" data-own-pointer aria-label={filterHead ? `Filter ${colName(c)}${filtered ? ' (on)' : ''}` : `Choose a value for ${colName(c)}${r + 1}`}
            onClick={(e) => (filterHead ? p.onFilterMenu(c, e.currentTarget) : p.onList(r, c, e.currentTarget))}
            className={cn('absolute end-0.5 top-1/2 -translate-y-1/2 z-[4] w-5 h-5 rounded flex items-center justify-center border', filtered ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-white/20')}>
            {filterHead ? <Filter className="w-3 h-3" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
        {selected && !active && <span aria-hidden className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />}
        {filling && <span aria-hidden className="absolute inset-0 bg-indigo-500/5 border border-dashed border-indigo-500 pointer-events-none" />}
        {edges && <span aria-hidden className="absolute -inset-px pointer-events-none border-indigo-600 dark:border-indigo-400 z-[3]" style={{ borderTopWidth: edges.t ? 2 : 0, borderBottomWidth: edges.b ? 2 : 0, borderLeftWidth: edges.l ? 2 : 0, borderRightWidth: edges.r ? 2 : 0 }} />}
        {active && <span aria-hidden className="absolute -inset-px pointer-events-none border-2 border-indigo-600 dark:border-indigo-400 z-[3]" />}
        {other && !active && (
          <>
            <span aria-hidden className="absolute -inset-px pointer-events-none border-2 z-[3]" style={{ borderColor: other.color }} />
            <span className="absolute -top-4 start-0 z-[5] px-1 rounded text-[10px] font-semibold text-white whitespace-nowrap pointer-events-none" style={{ background: other.color }}>{other.name}</span>
          </>
        )}
        {p.canEdit && r === area.r2 && c === area.c2 && (
          <span data-own-pointer onPointerDown={startFill} aria-hidden title="Drag to fill" className="absolute -end-1 -bottom-1 w-2.5 h-2.5 bg-indigo-600 dark:bg-indigo-400 border border-white dark:border-zinc-900 cursor-crosshair z-[6] touch-none" />
        )}
        {active && p.editor}
      </div>
    );
  };

  const rowEl = (r: number) => {
    const h = rows.size(r);
    if (!h) return null;
    const frozenCells = [];
    for (let c = 0; c < fc; c++) frozenCells.push(cellEl(r, c, ROWHEAD_W + cols.pos(c)));
    const cells = [];
    for (let c = c0; c <= c1; c++) cells.push(cellEl(r, c, null));
    return (
      <div key={r} role="row" aria-rowindex={r + 2} className="flex" style={{ height: h, width: totalW }}>
        <div role="rowheader" className={cn('sticky start-0 z-[4] shrink-0 flex items-center justify-center text-[11px] tabular-nums border-e border-b border-zinc-200 dark:border-white/[0.07] relative', rowInSel(r) ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-100 font-semibold' : 'bg-zinc-50 text-zinc-600 dark:bg-[#11212d] dark:text-zinc-400')} style={{ width: ROWHEAD_W, height: h }}>
          {r + 1}
          <span data-own-pointer data-axis="row" data-i={r} onPointerDown={startResize} onDoubleClick={autofit} aria-hidden className="absolute start-0 end-0 -bottom-1 h-2 cursor-row-resize z-[5] touch-none" />
        </div>
        {frozenCells}
        <div aria-hidden className="shrink-0" style={{ width: cols.pos(c0) - cols.pos(fc) }} />
        {cells}
      </div>
    );
  };

  const head = (c: number, left: number | null) => {
    const w = cols.size(c);
    if (!w) return null;
    return (
      <div key={c} role="columnheader" aria-colindex={c + 2} className={cn('relative shrink-0 flex items-center justify-center text-[11px] border-e border-b border-zinc-200 dark:border-white/[0.07]', left != null && 'sticky z-[4]', colInSel(c) ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-100 font-semibold' : 'bg-zinc-50 text-zinc-600 dark:bg-[#11212d] dark:text-zinc-400')} style={{ width: w, height: HEADER_H, ...(left != null ? { left } : {}) }}>
        {colName(c)}
        <span data-own-pointer data-axis="col" data-i={c} onPointerDown={startResize} onDoubleClick={autofit} aria-hidden className="absolute top-0 bottom-0 -end-1 w-2 cursor-col-resize z-[5] touch-none" />
      </div>
    );
  };
  const headCells = [];
  for (let c = 0; c < fc; c++) headCells.push(head(c, ROWHEAD_W + cols.pos(c)));
  const headRest = [];
  for (let c = c0; c <= c1; c++) headRest.push(head(c, null));
  const frozenRows = [];
  for (let r = 0; r < fr; r++) frozenRows.push(rowEl(r));
  const body = [];
  for (let r = r0; r <= r1; r++) body.push(rowEl(r));

  return (
    <div ref={scroller} id={p.gridId} role="grid" tabIndex={0} aria-label={`Sheet ${p.sheetName}`} aria-rowcount={nRows + 1} aria-colcount={nCols + 1} aria-multiselectable="true" aria-activedescendant={`${p.gridId}-active`}
      onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('[data-own-pointer], [role="columnheader"], [role="rowheader"]')) p.onEditCell(); }}
      onContextMenu={(e) => { e.preventDefault(); const { r, c } = hit(e.clientX, e.clientY); if (r >= 0 && c >= 0 && !inSel(r, c)) p.onPointerCell(r, c, { shift: false, drag: false, kind: 'cell' }); p.onContext(e.clientX, e.clientY); }}
      {...p.keyHandlers}
      className="relative flex-1 min-h-0 overflow-auto outline-none bg-white dark:bg-[#0b1a24] text-zinc-900 dark:text-zinc-100 font-[Inter,system-ui,sans-serif] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 overscroll-contain">
      <div style={{ width: totalW, height: totalH }} className="relative">
        <div className="sticky top-0 z-[6]" style={{ width: totalW }}>
          <div role="row" aria-rowindex={1} className="flex" style={{ height: HEADER_H }}>
            <div role="columnheader" aria-label="Select all" className="sticky start-0 z-[7] shrink-0 bg-zinc-100 dark:bg-[#1b2c39] border-e border-b border-zinc-200 dark:border-white/[0.07]" style={{ width: ROWHEAD_W, height: HEADER_H }} />
            {headCells}
            <div aria-hidden className="shrink-0" style={{ width: cols.pos(c0) - cols.pos(fc) }} />
            {headRest}
          </div>
          {frozenRows.length > 0 && <div className="bg-white dark:bg-[#0b1a24] shadow-[0_2px_0_0_rgba(37,55,69,0.35)]">{frozenRows}</div>}
        </div>
        <div aria-hidden style={{ height: rows.pos(r0) - rows.pos(fr) }} />
        {body}
      </div>
    </div>
  );
});
