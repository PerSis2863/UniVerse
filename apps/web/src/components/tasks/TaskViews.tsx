'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { barSpan, dayKey, monthGrid, moveDue, shiftDates, weekStart } from '@/lib/task-calendar';
import { useWeekStart, weekdayNames } from '@/lib/use-week-start';

// Calendar and timeline views of a task board (Stage 5 · B9.8; src/lib/task-calendar.ts): cards on
// their due dates (drag one to another day to move it), and the timeline as a Gantt chart (M230).
// Tap a card to open it.

export interface ViewCard { id: string; listId: string; title: string; dueAt: string | null; doneAt: string | null; createdAt: string; startAt?: string | null; milestone?: boolean; blockedBy?: string[] }
interface Props { cards: ViewCard[]; lists: { id: string; title: string }[]; canEdit: boolean; onOpen: (id: string) => void; onMove: (id: string, dueAt: string) => void }

// Fixed colours, dark enough for white text (WCAG AA); the theme's named colours are brighter.
const TONES = ['#27272a', '#b45309', '#047857', '#0369a1', '#a32c7b', '#be123c', '#0f766e', '#27272a'];
const toneOf = (lists: { id: string }[], id: string) => ({ background: TONES[Math.max(0, lists.findIndex((l) => l.id === id)) % TONES.length] });

function Legend({ lists }: { lists: { id: string; title: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-zinc-500" aria-label="Lists">
      {lists.map((l) => <span key={l.id} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={toneOf(lists, l.id)} aria-hidden />{l.title}</span>)}
    </div>
  );
}

export function CalendarView({ cards, lists, canEdit, onOpen, onMove }: Props) {
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [over, setOver] = useState<string | null>(null);
  const first = useWeekStart();
  const days = monthGrid(month.y, month.m, first);
  const today = dayKey(new Date());
  const byDay = new Map<string, ViewCard[]>();
  for (const c of cards) if (c.dueAt) { const k = dayKey(new Date(c.dueAt)); byDay.set(k, [...(byDay.get(k) ?? []), c]); }
  const undated = cards.filter((c) => !c.dueAt && !c.doneAt);
  // M162: the month slides in from the side the arrow points to.
  const [dir, setDir] = useState(0);
  const shift = (n: number) => { setDir(n); setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };
  const label = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white w-36 text-center">{label}</h2>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => { const d = new Date(); setDir(Math.sign(d.getFullYear() * 12 + d.getMonth() - (month.y * 12 + month.m))); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2">Today</button>
        <span className="flex-1" />
        <Legend lists={lists} />
      </div>
      <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] overflow-hidden bg-white/70 dark:bg-white/[0.03]">
        <div className="grid grid-cols-7 text-[11px] font-semibold text-zinc-500 border-b border-zinc-200/80 dark:border-white/[0.07]">{weekdayNames(first).map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}</div>
        <div key={`${month.y}-${month.m}`} className="swap grid grid-cols-7" data-dir={dir > 0 ? 'next' : dir < 0 ? 'back' : undefined}>
          {days.map((d) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === month.m;
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} onDragOver={(e) => { if (canEdit) { e.preventDefault(); if (over !== k) setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); const c = cards.find((x) => x.id === id); if (c && canEdit) onMove(c.id, moveDue(c.dueAt, k)); }}
                className={cn('min-h-20 sm:min-h-24 border-b border-e border-zinc-100 dark:border-white/[0.05] p-1 space-y-0.5', !inMonth && 'bg-zinc-50/70 dark:bg-white/[0.015]', over === k && 'bg-indigo-500/10')}>
                <p className={cn('text-[11px] px-1 tabular-nums', k === today ? 'inline-block rounded-full bg-indigo-500 text-white font-bold' : inMonth ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400')}>{d.getDate()}</p>
                {list.slice(0, 3).map((c) => (
                  <button key={c.id} type="button" draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} onClick={() => onOpen(c.id)} title={c.title}
                    style={toneOf(lists, c.listId)} className={cn('w-full text-start truncate rounded px-1 py-0.5 text-[10px] sm:text-[11px] font-medium text-white', c.doneAt && 'opacity-60 line-through')}>{c.title}</button>
                ))}
                {list.length > 3 && <button type="button" onClick={() => onOpen(list[3].id)} className="text-[10px] text-zinc-500 px-1">+{list.length - 3} more</button>}
              </div>
            );
          })}
        </div>
      </div>
      {undated.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 mb-1.5">No due date ({undated.length}){canEdit ? ': drag one onto a day' : ''}</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.slice(0, 40).map((c) => <button key={c.id} type="button" draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} onClick={() => onOpen(c.id)} className="rounded-full border border-zinc-200 dark:border-white/10 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:border-indigo-400/60">{c.title}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** M230: the timeline as a Gantt chart. Each card's bar runs from its start (or when it was made) to its due day; a
 * milestone is a diamond on its day; a line joins each card to the cards waiting on it (rose when the waiting card
 * starts before the other is due). Drag a bar to move both dates, its end to change the due day; Shift+arrows move it
 * by a day from the keyboard. */
export function TimelineView({ cards, lists, canEdit, onOpen, onDates }: Omit<Props, 'onMove'> & { onDates: (id: string, d: { startAt: string | null; dueAt: string }) => void }) {
  const WEEKS = 8, ROW = 32;
  const [start, setStart] = useState(() => { const s = weekStart(new Date()); s.setDate(s.getDate() - 7); return s; });
  const days = WEEKS * 7;
  const todayIdx = Math.round((new Date().setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
  const rows = cards.map((c) => ({ c, span: barSpan(c.milestone && c.dueAt ? new Date(c.dueAt) : new Date(c.startAt ?? c.createdAt), c.dueAt ? new Date(c.dueAt) : null, start, days) }))
    .filter((r): r is { c: ViewCard; span: NonNullable<ReturnType<typeof barSpan>> } => !!r.span)
    .sort((a, b) => a.span.from - b.span.from || a.span.to - b.span.to);
  const undated = cards.filter((c) => !c.dueAt).length;
  const [dir, setDir] = useState(0);
  const shift = (weeks: number) => { setDir(weeks); setStart((s) => { const n = new Date(s); n.setDate(n.getDate() + weeks * 7); return n; }); };
  const pct = (i: number) => `${(i / days) * 100}%`;
  // Dragging: which bar, moved whole or by its end, by how many days so far.
  const [drag, setDrag] = useState<{ id: string; end: boolean; x0: number; dayPx: number; n: number; moved: boolean } | null>(null);
  const shown = (c: ViewCard, span: { from: number; to: number }) => {
    if (drag?.id !== c.id || !drag.n) return span;
    return drag.end ? { from: span.from, to: Math.max(span.from, span.to + drag.n) } : { from: span.from + drag.n, to: span.to + drag.n };
  };
  const commit = (c: ViewCard, n: number, end: boolean) => {
    if (!n || !c.dueAt) return;
    if (!end) { onDates(c.id, shiftDates(c.startAt ?? null, c.dueAt, n)); return; }
    const due = shiftDates(null, c.dueAt, n).dueAt;
    const from = c.startAt ?? c.createdAt;
    if (new Date(due) < new Date(from)) return;
    onDates(c.id, { startAt: c.startAt ?? null, dueAt: due });
  };
  const down = (e: React.PointerEvent, c: ViewCard, end: boolean) => {
    if (!canEdit || !c.dueAt || e.button !== 0) return;
    const box = (e.currentTarget as HTMLElement).closest('[data-gantt-rows]')?.getBoundingClientRect();
    if (!box) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: c.id, end, x0: e.clientX, dayPx: box.width / days, n: 0, moved: false });
    if (end) e.stopPropagation();
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, n = Math.round(dx / drag.dayPx);
    if (n !== drag.n || (!drag.moved && Math.abs(dx) > 4)) setDrag({ ...drag, n, moved: drag.moved || Math.abs(dx) > 4 });
  };
  const up = (c: ViewCard) => { if (drag?.id === c.id) commit(c, drag.n, drag.end); setTimeout(() => setDrag(null)); };
  const at = new Map(rows.map((r, i) => [r.c.id, i]));
  const links = rows.flatMap((r, i) => (r.c.blockedBy ?? []).filter((b) => at.has(b)).map((b) => {
    const j = at.get(b)!, from = shown(rows[j].c, rows[j].span), to = shown(r.c, r.span);
    return { key: `${b}-${r.c.id}`, x1: (from.to + 1) * 10, y1: j * ROW + ROW / 2, x2: to.from * 10, y2: i * ROW + ROW / 2, late: to.from <= from.to && !rows[j].c.doneAt };
  }));
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-4)} aria-label="Earlier" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">{start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {new Date(start.getTime() + (days - 1) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</h2>
        <button type="button" onClick={() => shift(4)} aria-label="Later" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
        <span className="flex-1" />
        <Legend lists={lists} />
      </div>
      <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] overflow-x-auto" data-no-arrange>
        <div key={start.getTime()} className="swap min-w-[640px]" data-dir={dir > 0 ? 'next' : dir < 0 ? 'back' : undefined}>
          <div className="relative h-7 border-b border-zinc-200/80 dark:border-white/[0.07] text-[11px] text-zinc-500">
            {Array.from({ length: WEEKS }, (_, w) => {
              const d = new Date(start); d.setDate(d.getDate() + w * 7);
              return <span key={w} className="absolute top-1.5 ps-1.5 border-s border-zinc-200 dark:border-white/10 h-5" style={{ left: pct(w * 7) }}>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>;
            })}
          </div>
          <div className="py-1">
            <div className="relative" data-gantt-rows style={{ minHeight: ROW }}>
              {Array.from({ length: WEEKS - 1 }, (_, w) => <span key={w} aria-hidden className="absolute top-0 bottom-0 w-px bg-zinc-100 dark:bg-white/[0.04]" style={{ left: pct((w + 1) * 7) }} />)}
              {todayIdx >= 0 && todayIdx < days && <span className="absolute top-0 bottom-0 w-px bg-rose-500/70" style={{ left: pct(todayIdx + 0.5) }} aria-hidden />}
              {links.length > 0 && (
                <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${days * 10} ${rows.length * ROW}`} preserveAspectRatio="none">
                  {links.map((l) => <path key={l.key} d={`M${l.x1} ${l.y1} H${l.x1 + 4} V${l.y2} H${l.x2}`} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={l.late ? 'stroke-rose-500' : 'stroke-zinc-400 dark:stroke-zinc-500'} />)}
                </svg>
              )}
              {rows.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No cards with due dates in these weeks.</p>}
              {rows.map(({ c, span }) => {
                const s = shown(c, span);
                const due = c.dueAt ? new Date(c.dueAt).toLocaleDateString() : '';
                const keys = (e: React.KeyboardEvent) => {
                  if (!canEdit || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                  e.preventDefault(); commit(c, e.key === 'ArrowRight' ? 1 : -1, false);
                };
                const click = () => { if (!drag?.moved) onOpen(c.id); };
                const hint = canEdit ? ' · drag or Shift+arrows to move' : '';
                return (
                  <div key={c.id} className="relative" style={{ height: ROW }}>
                    {c.milestone ? (
                      <button type="button" onClick={click} onKeyDown={keys} onPointerDown={(e) => down(e, c, false)} onPointerMove={move} onPointerUp={() => up(c)} title={`Milestone: ${c.title} · ${due}${hint}`}
                        className={cn('absolute top-1 h-6 flex items-center gap-1.5 -translate-x-[7px] rtl:translate-x-[7px] text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 whitespace-nowrap', canEdit && 'cursor-grab active:cursor-grabbing touch-none', c.doneAt && 'opacity-60 line-through')}
                        style={{ left: pct(s.to + 0.5) }}>
                        <span aria-hidden className="w-3.5 h-3.5 rotate-45 rounded-[2px] shrink-0" style={toneOf(lists, c.listId)} /><span className="sr-only">Milestone: </span>{c.title}
                      </button>
                    ) : (
                      <>
                        {/* The bar is its true length; its name sits beside it (before it near the chart's end). */}
                        <button type="button" onClick={click} onKeyDown={keys} onPointerDown={(e) => down(e, c, false)} onPointerMove={move} onPointerUp={() => up(c)}
                          title={`${c.title}${c.startAt ? ` · from ${new Date(c.startAt).toLocaleDateString()}` : ''}${due ? ` · due ${due}` : ''}${hint}`}
                          className={cn('absolute top-1.5 h-5 min-w-3', span.cutStart ? 'rounded-e-md' : span.cutEnd ? 'rounded-s-md' : 'rounded-md', canEdit && 'cursor-grab active:cursor-grabbing touch-none', drag?.id === c.id && drag.moved && 'shadow-lg ring-2 ring-white/70', c.doneAt && 'opacity-60')}
                          style={{ ...toneOf(lists, c.listId), left: pct(s.from), width: pct(s.to - s.from + 1) }}>
                          <span className="sr-only">{c.title}</span>
                          {canEdit && !span.cutEnd && <span aria-hidden onPointerDown={(e) => down(e, c, true)} onPointerMove={move} onPointerUp={() => up(c)} className="absolute inset-y-0 end-0 w-2 cursor-ew-resize rounded-e-md hover:bg-white/30" />}
                        </button>
                        <span aria-hidden className={cn('absolute top-1.5 h-5 leading-5 text-[11px] font-medium text-zinc-800 dark:text-zinc-100 whitespace-nowrap pointer-events-none', c.doneAt && 'line-through text-zinc-500 dark:text-zinc-400')}
                          style={s.to > days - 12 ? { right: `calc(${pct(days - s.from)} + 6px)` } : { left: `calc(${pct(s.to + 1)} + 6px)` }}>{c.title}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        {undated > 0 && `${undated} card${undated === 1 ? '' : 's'} without a due date ${undated === 1 ? 'isn’t' : 'aren’t'} shown here. `}
        {canEdit && rows.length > 0 && 'Give a card a start day in it to set where its bar begins.'}
      </p>
    </div>
  );
}
