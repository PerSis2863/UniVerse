'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Footprints, GripVertical, MapPin, TramFront, Wand2, X } from 'lucide-react';
import { mapLink } from '@/lib/travel-book';
import { TIME_CHOICES, addDays, hm, hop, planDays, type PlanItem, type PlanStop } from '@/lib/travel-plan';
import { morph } from '@/lib/view-transition';
import { cn } from '@/lib/utils';

// A city's days on a trip (M206): a column per day and one for places not planned yet. Drag a place to
// another day or another spot (or use its "Move to" menu and arrows, for touch and keyboards); each card
// shows its opening hours, price and the time to spend, and the walk or ride from the place before it.
// "Plan my days" spreads the places over the days by how close they are (src/lib/travel-plan.ts).

export interface TripItem extends PlanItem { address?: string | null; url?: string | null; note?: string | null }
export interface Move { id: string; stopId: string; day: number | null; position: number }
const KIND: Record<string, string> = { see: 'See', do: 'Do', eat: 'Eat', drink: 'Drink', sleep: 'Sleep', buy: 'Buy', go: 'Day trip', other: 'Place' };
const FULL = 9 * 60;

/** Columns in order: not planned (null), then day 0, 1, … */
function columns(items: TripItem[], days: number) {
  const cols = new Map<number | null, TripItem[]>([[null, []], ...Array.from({ length: days }, (_, d) => [d, []] as [number, TripItem[]])]);
  for (const it of items) (cols.get(it.day !== null && it.day < days ? it.day : null) ?? cols.get(null)!).push(it);
  for (const list of cols.values()) list.sort((a, b) => a.position - b.position);
  return cols;
}

export function TripDays({ stop, items, from, onMove, onTime, onRemove }: {
  stop: PlanStop; items: TripItem[]; from: string | null;
  onMove: (moves: Move[], next: TripItem[]) => void; onTime: (it: TripItem, minutes: number) => void; onRemove: (it: TripItem) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ day: number | null; index: number } | null>(null);
  const cols = useMemo(() => columns(items, stop.days), [items, stop.days]);

  /** Put a place at a spot; renumber the columns it left and joined; slide everything that moved. */
  const place = (id: string, day: number | null, index: number) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const fromDay = it.day !== null && it.day < stop.days ? it.day : null;
    const target = (cols.get(day) ?? []).filter((x) => x.id !== id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, it);
    const changed = new Map<string, Move>();
    target.forEach((x, position) => changed.set(x.id, { id: x.id, stopId: stop.id, day, position }));
    if (fromDay !== day) (cols.get(fromDay) ?? []).filter((x) => x.id !== id).forEach((x, position) => changed.set(x.id, { id: x.id, stopId: stop.id, day: fromDay, position }));
    const moves = [...changed.values()].filter((m) => { const x = items.find((y) => y.id === m.id)!; return x.day !== m.day || x.position !== m.position; });
    if (!moves.length) return;
    const next = items.map((x) => { const m = changed.get(x.id); return m ? { ...x, day: m.day, position: m.position } : x; });
    morph(board.current, () => onMove(moves, next), { deep: true });
  };
  const autoPlan = () => {
    const plan = planDays(items, stop.days);
    const moves = plan.map((p) => ({ id: p.id, stopId: stop.id, day: p.day, position: p.position })).filter((m) => { const x = items.find((y) => y.id === m.id)!; return x.day !== m.day || x.position !== m.position; });
    if (!moves.length) return;
    const by = new Map(plan.map((p) => [p.id, p]));
    morph(board.current, () => onMove(moves, items.map((x) => { const p = by.get(x.id); return p ? { ...x, day: p.day, position: p.position } : x; })), { deep: true });
  };
  /** Where in a column the pointer is: before the first card whose middle is below it. */
  const indexAt = (list: HTMLElement, y: number) => {
    const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-key]')).filter((el) => el.dataset.key !== drag);
    const i = cards.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return i < 0 ? cards.length : i;
  };

  const planned = items.filter((x) => x.kind !== 'sleep').length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Drag places between days, or use each place’s menu. Times between places are walking or riding estimates.</p>
        <button type="button" onClick={autoPlan} disabled={planned < 2} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Wand2 className="h-4 w-4" aria-hidden />Plan my days</button>
      </div>
      <div ref={board} data-no-arrange tabIndex={0} role="group" aria-label={`${stop.name}: the days (scroll sideways on a phone)`} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] lg:grid lg:snap-none lg:grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] lg:overflow-visible">
        {[...cols.entries()].map(([day, list]) => {
          const total = list.reduce((n, x) => n + x.minutes, 0) + list.slice(1).reduce((n, x, i) => n + (hop(list[i], x)?.minutes ?? 0), 0);
          const date = day !== null && from ? addDays(from, day) : null;
          const here = over && over.day === day;
          return (
            <section key={String(day)} aria-label={day === null ? 'Not planned yet' : `Day ${day + 1}`}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const index = indexAt(e.currentTarget, e.clientY); if (!here || over.index !== index) setOver({ day, index }); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o && o.day === day ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || drag; if (id) place(id, day, indexAt(e.currentTarget, e.clientY)); setDrag(null); setOver(null); }}
              className={cn('flex w-[82%] shrink-0 snap-start flex-col rounded-2xl p-2.5 ring-1 transition-[box-shadow,background-color] duration-150 sm:w-72 lg:w-auto',
                day === null ? 'bg-zinc-100/70 ring-zinc-200 dark:bg-white/[0.03] dark:ring-white/10' : 'bg-[var(--card-bg)] ring-zinc-200 dark:ring-white/10',
                here && 'ring-2 ring-indigo-400')}>
              <header className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h4 className="font-semibold text-zinc-900 dark:text-white">{day === null ? 'Not planned yet' : `Day ${day + 1}`}{date && <span className="ms-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400">{new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>}</h4>
                {day !== null && list.length > 0 && <span className={cn('text-xs font-semibold tabular-nums', total > FULL ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400')} title={total > FULL ? 'A very full day' : undefined}>{hm(total)}{total > FULL ? ' · full' : ''}</span>}
              </header>
              <ol className="flex min-h-16 flex-1 flex-col">
                {list.map((it, i) => {
                  const h = i > 0 ? hop(list[i - 1], it) : null;
                  const at = list.slice(0, i).filter((x) => x.id !== drag).length; // its place without the one being dragged
                  return (
                    <li key={it.id} data-key={it.id} className="relative">
                      {here && it.id !== drag && over.index === at && <span className="mb-1.5 block h-0.5 rounded-full bg-indigo-500" aria-hidden />}
                      {h && <p className="flex items-center gap-1.5 px-2 pb-1 text-xs text-zinc-500 dark:text-zinc-400">{h.walk ? <Footprints className="h-3.5 w-3.5" aria-hidden /> : <TramFront className="h-3.5 w-3.5" aria-hidden />}{h.minutes} min {h.walk ? 'walk' : 'by metro, bus or taxi'}</p>}
                      <Card it={it} days={stop.days} near={stop.name} dragging={drag === it.id} first={i === 0} last={i === list.length - 1}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; setDrag(it.id); }}
                        onDragEnd={() => { setDrag(null); setOver(null); }}
                        onMoveTo={(d) => place(it.id, d, (cols.get(d) ?? []).length)} onStep={(dir) => place(it.id, day, i + dir)}
                        onTime={(m) => onTime(it, m)} onRemove={() => onRemove(it)} />
                    </li>
                  );
                })}
                {here && over.index >= list.filter((x) => x.id !== drag).length && <li className="mb-1.5 h-0.5 rounded-full bg-indigo-500" aria-hidden />}
                {!list.length && <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 px-3 py-5 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400">{day === null ? 'Add places from Saved or the guide' : 'Drop places here'}</li>}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({ it, days, near, dragging, first, last, onDragStart, onDragEnd, onMoveTo, onStep, onTime, onRemove }: {
  it: TripItem; days: number; near: string; dragging: boolean; first: boolean; last: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onMoveTo: (day: number | null) => void; onStep: (dir: -1 | 1) => void; onTime: (m: number) => void; onRemove: () => void;
}) {
  const times = TIME_CHOICES.includes(it.minutes as (typeof TIME_CHOICES)[number]) ? TIME_CHOICES : [...TIME_CHOICES, it.minutes].sort((a, b) => a - b);
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={cn('card mb-1.5 cursor-grab p-3 transition-[opacity,transform,box-shadow] duration-150 active:cursor-grabbing', dragging && 'scale-[0.98] opacity-50')}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-zinc-900 dark:text-white" translate="no">{it.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="rounded-full bg-indigo-500/10 px-2 py-px font-semibold text-indigo-700 dark:text-indigo-300">{KIND[it.kind] ?? 'Place'}</span>
            {it.price && <span className="max-w-[10rem] truncate" title={it.price}>{it.price}</span>}
          </p>
          {it.hours && <p className="mt-1 flex items-start gap-1 text-xs text-zinc-600 dark:text-zinc-300"><Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /><span><span className="sr-only">Open </span>{it.hours}</span></p>}
        </div>
        <button type="button" onClick={onRemove} className="btn-ghost btn-sm -me-1 -mt-1 shrink-0 p-1.5" aria-label={`Remove ${it.name}`}><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`t-${it.id}`}>Time at {it.name}</label>
        <select id={`t-${it.id}`} value={it.minutes} onChange={(e) => onTime(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
          {times.map((m) => <option key={m} value={m}>{m ? hm(m) : 'No time'}</option>)}
        </select>
        <label className="sr-only" htmlFor={`d-${it.id}`}>Move {it.name} to</label>
        <select id={`d-${it.id}`} value={it.day === null || it.day >= days ? '' : String(it.day)} onChange={(e) => onMoveTo(e.target.value === '' ? null : Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
          <option value="">Not planned</option>
          {Array.from({ length: days }, (_, d) => <option key={d} value={d}>Day {d + 1}</option>)}
        </select>
        <span className="ms-auto flex items-center">
          <button type="button" disabled={first} onClick={() => onStep(-1)} className="btn-ghost btn-sm p-1.5" aria-label={`Move ${it.name} earlier`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
          <button type="button" disabled={last} onClick={() => onStep(1)} className="btn-ghost btn-sm p-1.5" aria-label={`Move ${it.name} later`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
          <a href={mapLink(it.name, { lat: it.lat ?? undefined, lon: it.lon ?? undefined, address: it.address ?? undefined, near })} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm p-1.5" aria-label={`${it.name} on the map`}><MapPin className="h-4 w-4" aria-hidden /></a>
        </span>
      </div>
    </div>
  );
}
