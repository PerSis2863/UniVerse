'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Copy, LineChart, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';
import type { Step, View } from '@/lib/lab/inspect';
import type { Inspect } from './lab.worker';

// M390: the Lab's variable viewer: every number of a matrix in a grid (a window of a big one, a page of a 3D one),
// edited in place (the change is run as code, so it shows in the command window), the fields of a struct, the items
// of a cell and the rows of a table, each opened in turn; a few figures about the numbers; plot it, copy it.

export interface Shown extends Inspect { expr: string; size: string; v: View | null; error?: string }
const ROWS = 200, COLS = 40;

export function VariableViewer({ shown, onAsk, onRun, onClose, onInsert, busy }: {
  shown: Shown;
  onAsk: (q: Inspect) => void;
  /** Runs code in the command window (edits and plots). */
  onRun: (code: string) => void;
  onClose: () => void;
  onInsert: (expr: string) => void;
  busy: boolean;
}) {
  const { v, name, steps, page, from, expr } = shown;
  const go = (s: Step[], p = 0, f: [number, number] = [0, 0]) => onAsk({ name, steps: s, page: p, from: f });
  const crumbs = [{ label: name, steps: [] as Step[] }, ...steps.map((s, i) => ({ label: 'field' in s ? `.${s.field}` : `{${s.item[0] + 1},${s.item[1] + 1}}`, steps: steps.slice(0, i + 1) }))];
  const plot = () => {
    if (!v || v.kind !== 'grid') return;
    onRun(v.r === 1 || v.c === 1 ? `figure; plot(${expr}); grid on; title('${expr.replace(/'/g, "''")}')` : `figure; imagesc(${expr}${v.pages > 1 ? `(:, :, ${page + 1})` : ''}); colorbar; title('${expr.replace(/'/g, "''")}')`);
    toast.success('Plotted: see the Figure.');
  };
  const copy = async () => {
    if (!v) return;
    const rows = v.kind === 'grid' ? v.cells : v.kind === 'table' ? [v.names, ...v.rows] : null;
    if (!rows) return;
    try { await navigator.clipboard.writeText(rows.map((r) => r.map((x) => x.trim()).join('\t')).join('\n')); toast.success('Copied: paste it into a spreadsheet.'); } catch { toast.error('Copying isn’t allowed here.'); }
  };
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';

  return (
    <Sheet title={expr} onClose={onClose} wide>
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[13px]">
          {crumbs.length > 1 && crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-400 rtl:rotate-180" aria-hidden />}
              <button type="button" className={cn('rounded px-1 font-mono', i === crumbs.length - 1 ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-600 hover:underline dark:text-zinc-300')} onClick={() => go(c.steps)} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</button>
            </span>
          ))}
          <span className="ms-auto font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{shown.size}</span>
        </div>
        {v?.kind === 'grid' && v.stats.length > 0 && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
            {v.stats.map(([k, x]) => <div key={k} className="flex gap-1.5"><dt>{k}</dt><dd className="font-mono tabular-nums text-zinc-900 dark:text-white">{x.trim()}</dd></div>)}
          </dl>
        )}
        {shown.error && <p className="text-[13px] text-red-700 dark:text-red-400">{shown.error}</p>}
        {v?.kind === 'grid' && <Grid v={v} expr={expr} page={page} busy={busy} onRun={onRun} onMove={(f) => go(steps, page, f)} onPage={(p) => go(steps, p, from)} />}
        {v?.kind === 'fields' && (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 dark:divide-white/[0.06] dark:border-white/10">
            {v.items.map((it) => (
              <li key={it.name}>
                <button type="button" disabled={!it.open} onClick={() => go([...steps, { field: it.name }])} className="flex w-full items-center gap-3 px-3 py-2 text-start text-[13px] enabled:hover:bg-zinc-50 dark:enabled:hover:bg-white/[0.04]">
                  <span className="font-mono font-semibold text-zinc-900 dark:text-white">{it.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-zinc-600 dark:text-zinc-300">{it.summary}</span>
                  {it.open && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {v?.kind === 'cells' && (
          <div className="overflow-auto rounded-xl border border-zinc-200/80 dark:border-white/10" tabIndex={0} aria-label="Cell items">
            <table className="text-[13px]">
              <tbody>
                {Array.from({ length: v.r }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: v.c }, (_, j) => { const it = v.items[i + j * v.r]; return (
                      <td key={j} className="border-e border-t border-zinc-100 p-0 first:border-s-0 dark:border-white/[0.06]">
                        <button type="button" disabled={!it.open} onClick={() => go([...steps, { item: it.at }])} className="block max-w-[14rem] truncate px-3 py-2 text-start font-mono enabled:hover:bg-zinc-50 dark:enabled:hover:bg-white/[0.04]" title={`{${i + 1},${j + 1}} ${it.summary}`}>{it.summary}</button>
                      </td>
                    ); })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v?.kind === 'table' && (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-200/80 dark:border-white/10" tabIndex={0} aria-label={`Rows of ${expr}`}>
            <table className="text-[13px]">
              <thead className="sticky top-0 bg-white dark:bg-[#1b1d22]"><tr><th className="px-2 py-1.5 text-end text-xs font-medium text-zinc-500">#</th>{v.names.map((n) => <th key={n} className="px-3 py-1.5 text-start font-mono text-xs font-semibold"><button type="button" className="hover:underline" onClick={() => go([...steps, { field: n }])}>{n}</button></th>)}</tr></thead>
              <tbody>{v.rows.map((r, i) => <tr key={i} className="border-t border-zinc-100 dark:border-white/[0.06]"><td className="px-2 py-1 text-end text-xs tabular-nums text-zinc-500">{v.from + i + 1}</td>{r.map((x, j) => <td key={j} className="whitespace-nowrap px-3 py-1 font-mono">{x.trim()}</td>)}</tr>)}</tbody>
            </table>
            {v.height > v.from + v.rows.length && <p className="px-3 py-2 text-xs text-zinc-500">{v.height - v.from - v.rows.length} more rows. <button type="button" className="underline" onClick={() => go(steps, 0, [v.from + ROWS, 0])}>Next {ROWS}</button></p>}
          </div>
        )}
        {v?.kind === 'text' && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200/80 p-3 font-mono text-[13px] dark:border-white/10" translate="no">{v.text}</pre>}
        <div className="flex flex-wrap gap-1 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          {v?.kind === 'grid' && <button type="button" className={btn} onClick={plot} disabled={busy}><LineChart className="h-3.5 w-3.5" aria-hidden />Plot</button>}
          {(v?.kind === 'grid' || v?.kind === 'table') && <button type="button" className={btn} onClick={() => void copy()}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</button>}
          <button type="button" className={btn} onClick={() => onInsert(expr)}><TerminalSquare className="h-3.5 w-3.5" aria-hidden />Put in the command</button>
        </div>
      </div>
    </Sheet>
  );
}

/** The numbers in a grid: arrow keys move, Enter (or typing, or a double click) edits, Escape cancels. */
function Grid({ v, expr, page, busy, onRun, onMove, onPage }: {
  v: Extract<View, { kind: 'grid' }>; expr: string; page: number; busy: boolean;
  onRun: (code: string) => void; onMove: (from: [number, number]) => void; onPage: (p: number) => void;
}) {
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const [editing, setEditing] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const rows = v.cells.length, cols = v.cells[0]?.length ?? 0;
  const [r0, c0] = v.from;
  useEffect(() => { box.current?.querySelector<HTMLElement>(`[data-at="${at[0]}-${at[1]}"]`)?.focus({ preventScroll: false }); }, [at]);
  const commit = (text: string) => {
    setEditing(null);
    if (!text.trim() || busy) return;
    const where = `${r0 + at[0] + 1}, ${c0 + at[1] + 1}${v.pages > 1 ? `, ${page + 1}` : ''}`;
    onRun(`${expr}(${where}) = ${text.trim()};`);
  };
  const key = (e: React.KeyboardEvent) => {
    if (editing !== null) return;
    const move = (dr: number, dc: number) => { e.preventDefault(); setAt(([i, j]) => [Math.max(0, Math.min(rows - 1, i + dr)), Math.max(0, Math.min(cols - 1, j + dc))]); };
    if (e.key === 'ArrowDown') move(1, 0); else if (e.key === 'ArrowUp') move(-1, 0); else if (e.key === 'ArrowRight') move(0, 1); else if (e.key === 'ArrowLeft') move(0, -1);
    else if ((e.key === 'Enter' || e.key === 'F2') && v.editable) { e.preventDefault(); setEditing(v.cells[at[0]][at[1]].trim()); }
    else if (/^[-\d.]$/.test(e.key) && v.editable) { e.preventDefault(); setEditing(e.key); }
  };
  const more = v.r > r0 + rows || v.c > c0 + cols || r0 > 0 || c0 > 0;
  const nav = 'rounded-md p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/[0.08]';
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {(v.pages > 1 || more) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
          {v.pages > 1 && (
            <span className="inline-flex items-center gap-1">Page
              <button type="button" className={nav} aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
              <span className="font-mono tabular-nums">{page + 1} / {v.pages}</span>
              <button type="button" className={nav} aria-label="Next page" disabled={page >= v.pages - 1} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            </span>
          )}
          {more && (
            <span className="inline-flex items-center gap-1">Rows {r0 + 1}–{r0 + rows} of {v.r}, columns {c0 + 1}–{c0 + cols} of {v.c}
              <button type="button" className={nav} aria-label="Earlier rows" disabled={r0 === 0} onClick={() => onMove([Math.max(0, r0 - ROWS), c0])}><ChevronUp className="h-4 w-4" aria-hidden /></button>
              <button type="button" className={nav} aria-label="Later rows" disabled={r0 + rows >= v.r} onClick={() => onMove([r0 + ROWS, c0])}><ChevronDown className="h-4 w-4" aria-hidden /></button>
              <button type="button" className={nav} aria-label="Earlier columns" disabled={c0 === 0} onClick={() => onMove([r0, Math.max(0, c0 - COLS)])}><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
              <button type="button" className={nav} aria-label="Later columns" disabled={c0 + cols >= v.c} onClick={() => onMove([r0, c0 + COLS])}><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            </span>
          )}
        </div>
      )}
      <div ref={box} role="grid" aria-label={`Values of ${expr}`} aria-rowcount={v.r} aria-colcount={v.c} onKeyDown={key} className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-200/80 dark:border-white/10" data-no-motion>
        <div role="row" className="sticky top-0 z-[1] flex bg-zinc-50 dark:bg-[#1f2126]">
          <span role="columnheader" className="sticky start-0 w-12 shrink-0 bg-zinc-50 dark:bg-[#1f2126]" />
          {Array.from({ length: cols }, (_, j) => <span key={j} role="columnheader" className="w-24 shrink-0 px-2 py-1 text-end text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{c0 + j + 1}</span>)}
        </div>
        {v.cells.map((row, i) => (
          <div key={i} role="row" className="flex">
            <span role="rowheader" className="sticky start-0 w-12 shrink-0 bg-zinc-50 px-2 py-1 text-end text-xs tabular-nums text-zinc-500 dark:bg-[#1f2126] dark:text-zinc-400">{r0 + i + 1}</span>
            {row.map((x, j) => {
              const here = at[0] === i && at[1] === j;
              return here && editing !== null ? (
                <input key={j} autoFocus defaultValue={editing} aria-label={`Value at row ${r0 + i + 1}, column ${c0 + j + 1}`} onBlur={(e) => commit(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
                  className="w-24 shrink-0 border-0 bg-violet-50 px-2 py-1 text-end font-mono text-[13px] outline outline-2 outline-violet-600 dark:bg-violet-950" />
              ) : (
                <span key={j} role="gridcell" data-at={`${i}-${j}`} tabIndex={here ? 0 : -1} aria-selected={here} onClick={() => setAt([i, j])} onDoubleClick={() => { setAt([i, j]); if (v.editable) setEditing(x.trim()); }}
                  className={cn('w-24 shrink-0 cursor-default truncate border-t border-zinc-100 px-2 py-1 text-end font-mono text-[13px] tabular-nums outline-none dark:border-white/[0.05]', here && 'bg-violet-50 outline outline-2 -outline-offset-2 outline-violet-600 dark:bg-violet-950/60')}>{x.trim()}</span>
              );
            })}
          </div>
        ))}
      </div>
      {v.editable && <p className="text-xs text-zinc-500 dark:text-zinc-400">Double-click a value (or press Enter) to change it.</p>}
    </div>
  );
}
