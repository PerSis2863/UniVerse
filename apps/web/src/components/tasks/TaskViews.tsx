'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { barSpan, dayKey, monthGrid, moveDue, weekStart } from '@/lib/task-calendar';
import { useWeekStart, weekdayNames } from '@/lib/use-week-start';

// Calendar and timeline views of a task board (Stage 5 · B9.8; src/lib/task-calendar.ts): cards on
// their due dates (drag one to another day to move it), and bars from when each card was made to
// its due date over the coming weeks. Tap a card to open it.

export interface ViewCard { id: string; listId: string; title: string; dueAt: string | null; doneAt: string | null; createdAt: string }
interface Props { cards: ViewCard[]; lists: { id: string; title: string }[]; canEdit: boolean; onOpen: (id: string) => void; onMove: (id: string, dueAt: string) => void }

// Fixed colours, dark enough for white text (WCAG AA); the theme's named colours are brighter.
const TONES = ['#253745', '#b45309', '#047857', '#0369a1', '#be185d', '#be123c', '#0f766e', '#253745'];
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
  const shift = (n: number) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const label = new Date(month.y, month.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white w-36 text-center">{label}</h2>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
        <button type="button" onClick={() => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2">Today</button>
        <span className="flex-1" />
        <Legend lists={lists} />
      </div>
      <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] overflow-hidden bg-white/70 dark:bg-white/[0.03]">
        <div className="grid grid-cols-7 text-[11px] font-semibold text-zinc-500 border-b border-zinc-200/80 dark:border-white/[0.07]">{weekdayNames(first).map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}</div>
        <div className="grid grid-cols-7">
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

export function TimelineView({ cards, lists, onOpen }: Omit<Props, 'canEdit' | 'onMove'>) {
  const WEEKS = 8;
  const [start, setStart] = useState(() => { const s = weekStart(new Date()); s.setDate(s.getDate() - 7); return s; });
  const days = WEEKS * 7;
  const todayIdx = Math.round((new Date().setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
  const rows = cards.map((c) => ({ c, span: barSpan(new Date(c.createdAt), c.dueAt ? new Date(c.dueAt) : null, start, days) })).filter((r) => r.span)
    .sort((a, b) => a.span!.to - b.span!.to);
  const undated = cards.filter((c) => !c.dueAt).length;
  const shift = (weeks: number) => setStart((s) => { const n = new Date(s); n.setDate(n.getDate() + weeks * 7); return n; });
  const pct = (i: number) => `${(i / days) * 100}%`;
  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-4)} aria-label="Earlier" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">{start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {new Date(start.getTime() + (days - 1) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</h2>
        <button type="button" onClick={() => shift(4)} aria-label="Later" className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
        <span className="flex-1" />
        <Legend lists={lists} />
      </div>
      <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative h-7 border-b border-zinc-200/80 dark:border-white/[0.07] text-[10px] text-zinc-500">
            {Array.from({ length: WEEKS }, (_, w) => {
              const d = new Date(start); d.setDate(d.getDate() + w * 7);
              return <span key={w} className="absolute top-1.5 ps-1.5 border-s border-zinc-200 dark:border-white/10 h-5" style={{ left: pct(w * 7) }}>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>;
            })}
          </div>
          <div className="relative py-1">
            {todayIdx >= 0 && todayIdx < days && <span className="absolute top-0 bottom-0 w-px bg-rose-500/70" style={{ left: pct(todayIdx + 0.5) }} aria-hidden />}
            {rows.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No cards with due dates in these weeks.</p>}
            {rows.map(({ c, span }) => (
              <div key={c.id} className="relative h-8">
                <button type="button" onClick={() => onOpen(c.id)} title={`${c.title}${c.dueAt ? ` · due ${new Date(c.dueAt).toLocaleDateString()}` : ''}`}
                  className={cn('absolute top-1 h-6 px-2 text-start text-[11px] font-medium text-white truncate', span!.cutStart ? 'rounded-e-md' : span!.cutEnd ? 'rounded-s-md' : 'rounded-md', c.doneAt && 'opacity-60 line-through')}
                  style={{ ...toneOf(lists, c.listId), left: pct(span!.from), width: `max(${pct(span!.to - span!.from + 1)}, 4rem)` }}>{c.title}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {undated > 0 && <p className="text-xs text-zinc-500">{undated} card{undated === 1 ? '' : 's'} without a due date {undated === 1 ? 'isn’t' : 'aren’t'} shown here.</p>}
    </div>
  );
}
