'use client';

import { AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpAZ, Baseline, Bold, ChartColumn, ChevronDown, Combine, Eraser, Filter, Grid3x3, Italic, ListPlus, Minus, PaintBucket, Percent, Plus, Redo2, Search, Sigma, Snowflake, Strikethrough, Underline, Undo2, WrapText } from 'lucide-react';
import { ColorGrid, Menu, Popover, type MenuItem } from '@/components/ui/Menu';
import { CURRENCIES, FONTS, NUM_FMTS, type Style } from '@/lib/sheet/format';
import { cn } from '@/lib/utils';

// The spreadsheet's toolbar (Office suite): undo, number formats, fonts, colours, borders,
// alignment, merging, inserting, sorting, filtering, freezing, conditional colours, checks on what
// can be typed, charts and find. It acts on the selected cells through `on`.

export type BorderKind = 'all' | 'outer' | 'top' | 'bottom' | 'left' | 'right' | 'none';
export interface ToolbarActions {
  undo: () => void; redo: () => void;
  style: (patch: Partial<Style>) => void; toggle: (k: 'b' | 'i' | 'u' | 'st' | 'wrap') => void;
  decimals: (d: number) => void; borders: (k: BorderKind) => void; clearFormat: () => void;
  merge: () => void; autosum: () => void;
  insert: (what: 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight') => void; remove: (what: 'rows' | 'cols') => void;
  sort: (asc: boolean) => void; filter: () => void; freeze: (r: number, c: number) => void;
  dialog: (d: 'rules' | 'checks' | 'find' | 'chart' | 'functions') => void; checkbox: () => void;
}

const btn = (on: boolean | undefined, label: string, Icon: typeof Bold, run: () => void, disabled?: boolean, key?: string) => (
  <button key={key ?? label} type="button" title={label} aria-label={label} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}
    className={cn('w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40', on ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10')}><Icon className="w-4 h-4" /></button>
);
const sep = (k: string) => <span key={k} aria-hidden className="w-px h-5 bg-zinc-200 dark:bg-white/10 mx-1 shrink-0" />;

export function SheetToolbar({ s, on, canEdit, canUndo, canRedo, frozen, filterOn, merged, sel }: {
  s: Style | undefined; on: ToolbarActions; canEdit: boolean; canUndo: boolean; canRedo: boolean;
  frozen: { r: number; c: number }; filterOn: boolean; merged: boolean; sel: { r: number; c: number };
}) {
  const off = !canEdit;
  const insertItems: MenuItem[] = [
    { label: 'Row above', onSelect: () => on.insert('rowAbove') }, { label: 'Row below', onSelect: () => on.insert('rowBelow') },
    { label: 'Column on the left', onSelect: () => on.insert('colLeft') }, { label: 'Column on the right', onSelect: () => on.insert('colRight') },
    'sep',
    { label: 'Chart…', onSelect: () => on.dialog('chart'), icon: <ChartColumn className="w-4 h-4" /> },
    { label: 'Function…', onSelect: () => on.dialog('functions'), icon: <Sigma className="w-4 h-4" /> },
    { label: 'Checkboxes', onSelect: on.checkbox },
    { label: 'Drop-down list…', onSelect: () => on.dialog('checks'), icon: <ListPlus className="w-4 h-4" /> },
    'sep',
    { label: 'Delete rows', onSelect: () => on.remove('rows') }, { label: 'Delete columns', onSelect: () => on.remove('cols') },
  ];
  const freezeItems: MenuItem[] = [
    { label: 'No frozen rows or columns', onSelect: () => on.freeze(0, 0), checked: !frozen.r && !frozen.c },
    { label: 'Top row', onSelect: () => on.freeze(1, frozen.c), checked: frozen.r === 1 },
    { label: 'Top 2 rows', onSelect: () => on.freeze(2, frozen.c), checked: frozen.r === 2 },
    { label: `Rows down to ${sel.r + 1}`, onSelect: () => on.freeze(sel.r + 1, frozen.c), disabled: sel.r + 1 > 50 },
    'sep',
    { label: 'First column', onSelect: () => on.freeze(frozen.r, 1), checked: frozen.c === 1 },
    { label: 'Columns up to this one', onSelect: () => on.freeze(frozen.r, sel.c + 1), disabled: sel.c + 1 > 20 },
  ];
  const borderItems: MenuItem[] = (
    [['all', 'All borders'], ['outer', 'Outside borders'], ['top', 'Top border'], ['bottom', 'Bottom border'], ['left', 'Left border'], ['right', 'Right border'], ['none', 'No borders']] as const
  ).map(([k, label]) => ({ label, onSelect: () => on.borders(k) }));
  const dataItems: MenuItem[] = [
    { label: 'Sort A → Z', onSelect: () => on.sort(true), icon: <ArrowDownAZ className="w-4 h-4" /> },
    { label: 'Sort Z → A', onSelect: () => on.sort(false), icon: <ArrowUpAZ className="w-4 h-4" /> },
    { label: filterOn ? 'Remove the filter' : 'Filter', onSelect: on.filter, icon: <Filter className="w-4 h-4" /> },
    'sep',
    { label: 'Conditional colours…', onSelect: () => on.dialog('rules') },
    { label: 'Checks on what can be typed…', onSelect: () => on.dialog('checks') },
    { label: 'Find and replace…', onSelect: () => on.dialog('find'), icon: <Search className="w-4 h-4" />, hint: 'Ctrl F' },
  ];
  return (
    <div role="toolbar" aria-label="Spreadsheet formatting" className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] px-2 py-1.5">
      {btn(undefined, 'Undo', Undo2, on.undo, off || !canUndo)}
      {btn(undefined, 'Redo', Redo2, on.redo, off || !canRedo)}
      {sep('a')}
      <label className="sr-only" htmlFor="sheet-fmt">Number format</label>
      <select id="sheet-fmt" disabled={off} value={s?.fmt ?? 'general'} onChange={(e) => on.style({ fmt: e.target.value as Style['fmt'] })} className="h-8 shrink-0 rounded-lg bg-transparent text-xs font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1.5 disabled:opacity-40">
        {NUM_FMTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        {s?.fmt === 'custom' && <option value="custom">Custom</option>}
      </select>
      <Menu label="Currency" disabled={off} button={<span className="text-sm font-semibold w-4">{s?.cur ?? '$'}</span>} items={CURRENCIES.map((c) => ({ label: c, onSelect: () => on.style({ fmt: 'currency', cur: c }), checked: s?.fmt === 'currency' && (s.cur ?? '$') === c }))} />
      {btn(s?.fmt === 'percent', 'Percent', Percent, () => on.style({ fmt: s?.fmt === 'percent' ? 'general' : 'percent' }), off)}
      {btn(undefined, 'Fewer decimal places', Minus, () => on.decimals(-1), off, 'dec-')}
      {btn(undefined, 'More decimal places', Plus, () => on.decimals(1), off, 'dec+')}
      {sep('b')}
      <label className="sr-only" htmlFor="sheet-font">Font</label>
      <select id="sheet-font" disabled={off} value={s?.font ?? 'Inter'} onChange={(e) => on.style({ font: e.target.value === 'Inter' ? undefined : e.target.value })} className="h-8 w-28 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1.5 disabled:opacity-40">
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <label className="sr-only" htmlFor="sheet-size">Font size</label>
      <select id="sheet-size" disabled={off} value={s?.size ?? 10} onChange={(e) => on.style({ size: Number(e.target.value) === 10 ? undefined : Number(e.target.value) })} className="h-8 w-14 shrink-0 rounded-lg bg-transparent text-xs text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 px-1 disabled:opacity-40">
        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {btn(s?.b, 'Bold', Bold, () => on.toggle('b'), off)}
      {btn(s?.i, 'Italic', Italic, () => on.toggle('i'), off)}
      {btn(s?.u, 'Underline', Underline, () => on.toggle('u'), off)}
      {btn(s?.st, 'Strikethrough', Strikethrough, () => on.toggle('st'), off)}
      <Popover label="Text colour" disabled={off} button={<span className="flex flex-col items-center"><Baseline className="w-4 h-4" /><span className="w-4 h-1 rounded-sm -mt-0.5" style={{ background: s?.color ?? 'currentColor' }} /></span>}>
        {(close) => <ColorGrid label="Text colour" value={s?.color} none="Automatic" onPick={(c) => { on.style({ color: c ?? undefined }); close(); }} />}
      </Popover>
      <Popover label="Fill colour" disabled={off} button={<span className="flex flex-col items-center"><PaintBucket className="w-4 h-4" /><span className="w-4 h-1 rounded-sm -mt-0.5 border border-zinc-300 dark:border-white/20" style={{ background: s?.bg ?? 'transparent' }} /></span>}>
        {(close) => <ColorGrid label="Fill colour" value={s?.bg} onPick={(c) => { on.style({ bg: c ?? undefined }); close(); }} />}
      </Popover>
      <Menu label="Borders" disabled={off} button={<><Grid3x3 className="w-4 h-4" /><ChevronDown className="w-3 h-3" /></>} items={borderItems} />
      {sep('c')}
      {btn(s?.align === 'left', 'Align left', AlignLeft, () => on.style({ align: s?.align === 'left' ? undefined : 'left' }), off)}
      {btn(s?.align === 'center', 'Centre', AlignCenter, () => on.style({ align: s?.align === 'center' ? undefined : 'center' }), off)}
      {btn(s?.align === 'right', 'Align right', AlignRight, () => on.style({ align: s?.align === 'right' ? undefined : 'right' }), off)}
      <Menu label="Vertical alignment" disabled={off} button={<span className="text-xs font-semibold">↕</span>} items={[
        { label: 'Top', onSelect: () => on.style({ va: 'top' }), checked: s?.va === 'top' },
        { label: 'Middle', onSelect: () => on.style({ va: 'middle' }), checked: s?.va === 'middle' },
        { label: 'Bottom', onSelect: () => on.style({ va: undefined }), checked: !s?.va || s.va === 'bottom' },
      ]} />
      {btn(s?.wrap, 'Wrap text', WrapText, () => on.toggle('wrap'), off)}
      {btn(merged, merged ? 'Unmerge cells' : 'Merge cells', Combine, on.merge, off)}
      {btn(undefined, 'Clear formatting', Eraser, on.clearFormat, off)}
      {sep('d')}
      {btn(undefined, 'Sum (AutoSum)', Sigma, on.autosum, off)}
      <Menu label="Insert" disabled={off} button={<><Plus className="w-4 h-4" /><span className="text-xs font-medium">Insert</span></>} items={insertItems} />
      <Menu label="Data" button={<><Filter className="w-4 h-4" /><span className="text-xs font-medium">Data</span></>} items={dataItems.map((x) => (x !== 'sep' && 'label' in x && x.label !== 'Find and replace…' ? { ...x, disabled: off } : x))} />
      <Menu label="Freeze" button={<Snowflake className={cn('w-4 h-4', (frozen.r || frozen.c) && 'text-sky-600 dark:text-sky-300')} />} items={freezeItems} />
      {btn(undefined, 'Chart', ChartColumn, () => on.dialog('chart'), off)}
    </div>
  );
}
