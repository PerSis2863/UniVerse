'use client';

import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { toast } from 'sonner';
import { Search, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import type { Calc } from '@/lib/sheet/calc';
import { CHART_TYPES, type ChartType, type CheckJSON, type RuleJSON, type RuleKind } from '@/lib/sheet/book';
import { display } from '@/lib/sheet/format';
import { isFormula } from '@/lib/sheet/formula';
import { FUNCTION_HELP } from '@/lib/sheet/functions';
import { cellsOf, getMeta, nameOf, setCells, setMeta, sheetIds } from '@/lib/sheet/model';
import { areaText, cellOf, parseArea, type Area } from '@/lib/sheet/refs';
import { RULE_LABELS } from '@/lib/sheet/tools';
import { cn } from '@/lib/utils';

// The spreadsheet's dialogs (Office suite): find and replace, conditional colours, checks on what
// can be typed (lists, numbers, dates), the list of functions, and making a chart.

export type DialogKind = 'rules' | 'checks' | 'find' | 'chart' | 'functions';

const LOOKS = [
  { label: 'Red', color: '#9c0006', bg: '#ffc7ce' }, { label: 'Yellow', color: '#9c5700', bg: '#ffeb9c' }, { label: 'Green', color: '#006100', bg: '#c6efce' },
  { label: 'Blue', color: '#1e3a8a', bg: '#dbeafe' }, { label: 'Red text', color: '#c00000' }, { label: 'Bold green text', color: '#166534' },
];
const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 9)}`;

export function SheetDialogs({ kind, onClose, doc, sheet, calc, area, canEdit, onGoTo, onInsertFunction, title }: {
  kind: DialogKind | null; onClose: () => void; doc: Y.Doc; sheet: string; calc: Calc; area: Area; canEdit: boolean;
  onGoTo: (sheet: string, r: number, c: number) => void; onInsertFunction: (name: string) => void; title: string;
}) {
  if (!kind) return null;
  if (kind === 'find') return <FindReplace doc={doc} sheet={sheet} calc={calc} canEdit={canEdit} onGoTo={onGoTo} onClose={onClose} />;
  if (kind === 'functions') return <Functions onPick={onInsertFunction} onClose={onClose} />;
  if (kind === 'chart') return <NewChart doc={doc} sheet={sheet} area={area} onClose={onClose} title={title} />;
  if (kind === 'rules') return <Rules doc={doc} sheet={sheet} area={area} canEdit={canEdit} onClose={onClose} />;
  return <Checks doc={doc} sheet={sheet} area={area} canEdit={canEdit} onClose={onClose} />;
}

function FindReplace({ doc, sheet, calc, canEdit, onGoTo, onClose }: { doc: Y.Doc; sheet: string; calc: Calc; canEdit: boolean; onGoTo: (s: string, r: number, c: number) => void; onClose: () => void }) {
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [whole, setWhole] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const [at, setAt] = useState(-1);
  const hits = useMemo(() => {
    if (!find) return [];
    const norm = (s: string) => (matchCase ? s : s.toLowerCase());
    const want = norm(find);
    const out: { sheet: string; r: number; c: number; key: string }[] = [];
    for (const id of everywhere ? sheetIds(doc) : [sheet]) {
      for (const [key, cell] of cellsOf(doc, id)?.entries() ?? []) {
        const x = cellOf(key);
        if (!x) continue;
        const shown = display(calc.value(id, x.r, x.c), cell.s);
        const hay = [norm(shown), norm(cell.v)];
        if (hay.some((h) => (whole ? h === want : h.includes(want)))) out.push({ sheet: id, ...x, key });
      }
    }
    return out.sort((a, b) => (a.sheet === b.sheet ? a.r - b.r || a.c - b.c : sheetIds(doc).indexOf(a.sheet) - sheetIds(doc).indexOf(b.sheet))).slice(0, 5000);
  }, [find, matchCase, whole, everywhere, doc, sheet, calc]);
  const next = () => { if (!hits.length) return; const i = (at + 1) % hits.length; setAt(i); onGoTo(hits[i].sheet, hits[i].r, hits[i].c); };
  const swap = (v: string) => {
    if (isFormula(v) && !matchCase && !whole) return v.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), repl);
    if (whole) return (matchCase ? v === find : v.toLowerCase() === find.toLowerCase()) ? repl : v;
    return v.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi'), repl);
  };
  const replaceOne = () => {
    const h = hits[Math.max(0, at)];
    if (!h) return;
    const cell = cellsOf(doc, h.sheet)?.get(h.key);
    if (cell) setCells(doc, h.sheet, { [h.key]: { ...cell, v: swap(cell.v) } });
    next();
  };
  const replaceAll = () => {
    let n = 0;
    const bySheet = new Map<string, Record<string, { v: string; s?: object }>>();
    for (const h of hits) {
      const cell = cellsOf(doc, h.sheet)?.get(h.key);
      if (!cell) continue;
      const v = swap(cell.v);
      if (v === cell.v) continue;
      n++;
      bySheet.set(h.sheet, { ...(bySheet.get(h.sheet) ?? {}), [h.key]: { ...cell, v } });
    }
    doc.transact(() => { for (const [id, ch] of bySheet) setCells(doc, id, ch); });
    toast.success(n ? `Replaced in ${n} cell${n === 1 ? '' : 's'}` : 'Nothing to replace');
  };
  return (
    <Sheet title="Find and replace" onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" onClick={next} disabled={!hits.length} className="btn-secondary flex-1 disabled:opacity-40">Find next</button>
        {canEdit && <button type="button" onClick={replaceOne} disabled={!hits.length} className="btn-secondary flex-1 disabled:opacity-40">Replace</button>}
        {canEdit && <button type="button" onClick={replaceAll} disabled={!hits.length} className="btn-primary flex-1 disabled:opacity-40">Replace all</button>}
      </div>
    }>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Find
          <input value={find} onChange={(e) => { setFind(e.target.value); setAt(-1); }} onKeyDown={(e) => e.key === 'Enter' && next()} className="input mt-1" />
        </label>
        {canEdit && <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Replace with<input value={repl} onChange={(e) => setRepl(e.target.value)} className="input mt-1" /></label>}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="w-4 h-4 accent-indigo-600" />Match capitals</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} className="w-4 h-4 accent-indigo-600" />Whole cell</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} className="w-4 h-4 accent-indigo-600" />All sheets</label>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">{find ? `${hits.length} found${at >= 0 && hits.length ? ` · ${at + 1} of ${hits.length}: ${everywhere ? `${nameOf(doc, hits[at].sheet)}!` : ''}${hits[at].key}` : ''}` : 'Type what to look for.'}</p>
      </div>
    </Sheet>
  );
}

function Functions({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const groups = [...new Set(FUNCTION_HELP.map((f) => f.group))];
  const list = FUNCTION_HELP.filter((f) => (!group || f.group === group) && (!q || f.name.includes(q.toUpperCase()) || f.does.toLowerCase().includes(q.toLowerCase())));
  return (
    <Sheet title="Insert a function" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="relative flex-1"><span className="sr-only">Search functions</span><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, like “average” or “date”" className="input pl-9" /></label>
          <select aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)} className="input w-auto"><option value="">All</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {list.map((f) => (
            <li key={f.name}>
              <button type="button" onClick={() => onPick(f.name)} className="w-full text-left px-2 py-2 hover:bg-zinc-50 dark:hover:bg-white/[0.04] rounded-lg">
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">{f.name}</span><span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">({f.args})</span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">{f.does}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="text-sm text-zinc-600 dark:text-zinc-400 p-2">No function matches.</li>}
        </ul>
      </div>
    </Sheet>
  );
}

function NewChart({ doc, sheet, area, onClose, title }: { doc: Y.Doc; sheet: string; area: Area; onClose: () => void; title: string }) {
  const [type, setType] = useState<ChartType>('column');
  const [range, setRange] = useState(areaText(area));
  const [name, setName] = useState(title);
  const add = () => {
    const a = parseArea(range.replace(/\$/g, '').toUpperCase());
    if (!a) { toast.error('Give the cells, like A1:C10.'); return; }
    setMeta(doc, sheet, 'charts', [...(getMeta(doc, sheet, 'charts') ?? []), { id: newId('c'), type, area: areaText(a), title: name.trim().slice(0, 120) }]);
    toast.success('Chart added below the sheet');
    onClose();
  };
  return (
    <Sheet title="Make a chart" onClose={onClose} footer={<button type="button" onClick={add} className="btn-primary w-full">Add the chart</button>}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Select your data first (with its headings). A first row of headings names the series, and a first column of labels names the points.</p>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Cells<input value={range} onChange={(e) => setRange(e.target.value)} className="input mt-1 font-mono" /></label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Title<input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="input mt-1" /></label>
        <fieldset>
          <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">Kind</legend>
          <div className="grid grid-cols-3 gap-2">
            {CHART_TYPES.map((t) => (
              <label key={t.value} className={cn('rounded-xl border px-3 py-2 text-sm text-center cursor-pointer', type === t.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 font-semibold' : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300')}>
                <input type="radio" name="chart-type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />{t.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}

function Rules({ doc, sheet, area, canEdit, onClose }: { doc: Y.Doc; sheet: string; area: Area; canEdit: boolean; onClose: () => void }) {
  const rules = getMeta(doc, sheet, 'rules') ?? [];
  const [range, setRange] = useState(areaText(area));
  const [kind, setKind] = useState<RuleKind>('gt');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [look, setLook] = useState(0);
  const needsA = !['empty', 'notEmpty', 'aboveAvg', 'belowAvg', 'dupe', 'scale', 'bars'].includes(kind);
  const add = () => {
    const x = parseArea(range.replace(/\$/g, '').toUpperCase());
    if (!x) { toast.error('Give the cells, like B2:B30.'); return; }
    if (needsA && !a.trim()) { toast.error('Give the value to compare with.'); return; }
    const l = LOOKS[look];
    const rule: RuleJSON = { id: newId('r'), area: areaText(x), kind, ...(needsA ? { a: a.trim() } : {}), ...(kind === 'between' ? { b: b.trim() } : {}), ...(kind !== 'scale' && kind !== 'bars' ? { color: l.color, ...(l.bg ? { bg: l.bg } : {}) } : {}) };
    setMeta(doc, sheet, 'rules', [...rules, rule]);
    setA(''); setB('');
  };
  return (
    <Sheet title="Conditional colours" onClose={onClose}>
      <div className="space-y-4">
        {rules.length > 0 && (
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm">
                <span className="w-5 h-5 rounded shrink-0 border border-zinc-300 dark:border-white/20" style={{ background: r.kind === 'scale' ? 'linear-gradient(90deg,#f8696b,#ffeb84,#63be7b)' : r.kind === 'bars' ? '#7dd3fc' : r.bg ?? '#fff', color: r.color }} aria-hidden />
                <span className="flex-1 text-zinc-800 dark:text-zinc-200"><span className="font-mono">{r.area}</span>: {RULE_LABELS[r.kind]}{r.a ? ` ${r.a}` : ''}{r.b ? ` and ${r.b}` : ''}</span>
                {canEdit && <button type="button" aria-label="Remove this rule" onClick={() => setMeta(doc, sheet, 'rules', rules.filter((x) => x.id !== r.id))} className="p-1.5 text-zinc-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="space-y-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">New rule</p>
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">Cells<input value={range} onChange={(e) => setRange(e.target.value)} className="input mt-1 font-mono" /></label>
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">When the value is
              <select value={kind} onChange={(e) => setKind(e.target.value as RuleKind)} className="input mt-1">{(Object.keys(RULE_LABELS) as RuleKind[]).map((k) => <option key={k} value={k}>{RULE_LABELS[k]}</option>)}</select>
            </label>
            {needsA && <label className="block text-sm text-zinc-800 dark:text-zinc-200">{kind === 'top' || kind === 'bottom' ? 'How many' : kind === 'between' ? 'From' : 'Value'}<input value={a} onChange={(e) => setA(e.target.value)} className="input mt-1" /></label>}
            {kind === 'between' && <label className="block text-sm text-zinc-800 dark:text-zinc-200">To<input value={b} onChange={(e) => setB(e.target.value)} className="input mt-1" /></label>}
            {kind !== 'scale' && kind !== 'bars' && (
              <fieldset>
                <legend className="text-sm text-zinc-800 dark:text-zinc-200 mb-1">Colour</legend>
                <div className="flex flex-wrap gap-2">
                  {LOOKS.map((l, i) => (
                    <label key={l.label} className={cn('px-3 py-1.5 rounded-lg text-sm cursor-pointer border', look === i ? 'ring-2 ring-indigo-500 border-transparent' : 'border-zinc-200 dark:border-white/10')} style={{ background: l.bg ?? undefined, color: l.color }}>
                      <input type="radio" name="rule-look" checked={look === i} onChange={() => setLook(i)} className="sr-only" />{l.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <button type="button" onClick={add} className="btn-primary btn-sm">Add the rule</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Checks({ doc, sheet, area, canEdit, onClose }: { doc: Y.Doc; sheet: string; area: Area; canEdit: boolean; onClose: () => void }) {
  const checks = getMeta(doc, sheet, 'checks') ?? [];
  const [range, setRange] = useState(areaText(area));
  const [kind, setKind] = useState<CheckJSON['kind']>('list');
  const [list, setList] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const add = () => {
    const x = parseArea(range.replace(/\$/g, '').toUpperCase());
    if (!x) { toast.error('Give the cells, like C2:C50.'); return; }
    const items = list.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (kind === 'list' && !items.length) { toast.error('Give the choices, separated by commas.'); return; }
    const n = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : undefined);
    setMeta(doc, sheet, 'checks', [...checks, { id: newId('v'), area: areaText(x), kind, ...(kind === 'list' ? { list: [...new Set(items)].slice(0, 200) } : {}), ...(kind === 'number' ? { ...(n(min) != null ? { min: n(min) } : {}), ...(n(max) != null ? { max: n(max) } : {}) } : {}) }]);
    setList(''); setMin(''); setMax('');
    toast.success(kind === 'list' ? 'Those cells now have a drop-down list' : 'Check added');
  };
  const label = (c: CheckJSON) => (c.kind === 'list' ? `A list: ${c.list?.slice(0, 6).join(', ')}${(c.list?.length ?? 0) > 6 ? '…' : ''}` : c.kind === 'number' ? `A number${c.min != null ? ` from ${c.min}` : ''}${c.max != null ? ` to ${c.max}` : ''}` : c.kind === 'date' ? 'A date' : 'Checkboxes');
  return (
    <Sheet title="Checks on what can be typed" onClose={onClose}>
      <div className="space-y-4">
        {checks.length > 0 && (
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm">
                <span className="flex-1 text-zinc-800 dark:text-zinc-200"><span className="font-mono">{c.area}</span>: {label(c)}</span>
                {canEdit && <button type="button" aria-label="Remove this check" onClick={() => setMeta(doc, sheet, 'checks', checks.filter((x) => x.id !== c.id))} className="p-1.5 text-zinc-500 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="space-y-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-3">
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">Cells<input value={range} onChange={(e) => setRange(e.target.value)} className="input mt-1 font-mono" /></label>
            <label className="block text-sm text-zinc-800 dark:text-zinc-200">Allow
              <select value={kind} onChange={(e) => setKind(e.target.value as CheckJSON['kind'])} className="input mt-1">
                <option value="list">A choice from a list (drop-down)</option><option value="number">A number</option><option value="date">A date</option><option value="checkbox">A checkbox (TRUE / FALSE)</option>
              </select>
            </label>
            {kind === 'list' && <label className="block text-sm text-zinc-800 dark:text-zinc-200">Choices (separate with commas)<input value={list} onChange={(e) => setList(e.target.value)} placeholder="To do, Doing, Done" className="input mt-1" /></label>}
            {kind === 'number' && (
              <div className="flex gap-2">
                <label className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">From<input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} className="input mt-1" /></label>
                <label className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">To<input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} className="input mt-1" /></label>
              </div>
            )}
            <button type="button" onClick={add} className="btn-primary btn-sm">Add</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
