'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BedDouble, Check, Clock, Coffee, Footprints, Landmark, MapPin, Menu, Mountain, Navigation, Plus, ShoppingBag, SlidersHorizontal, Sparkles, Ticket, TramFront, Utensils, Wand2, X, type LucideIcon } from 'lucide-react';
import { Photo } from '@/components/ui/Photo';
import Link from '@/components/ui/Link';
import { mapLink } from '@/lib/travel-book';
import { googleDirections } from '@/lib/map-tools';
import { commonsImage } from '@/lib/travel-guide';
import { DAY_START, TIME_CHOICES, addDays, clock, dayOrder, daySchedule, distance, hm, planDays, readStarts, type PlanItem, type PlanStop } from '@/lib/travel-plan';
import { morph } from '@/lib/view-transition';
import { cn } from '@/lib/utils';

// A city's days on a trip (M206), in the itinerary look of the owner's picture (M327, 18 Nov 2026): a row of day
// circles (the weekday over the day's number), "Total travel today", then the day as a timeline: a tick-off ring per
// place, its photo (the guide listing's), name, kind and its clock time, a handle to drag it, and between two places
// the walk or ride with its distance and Directions. Round buttons float at the bottom: ✨ plan the days, the day's
// options (shortest round, when it starts, spread over the days), + add places. Drag a place up or down, or onto
// another day's circle; tap it for its time, day, order, map and remove (touch and keyboards).

export interface TripItem extends PlanItem { address?: string | null; url?: string | null; note?: string | null; photo?: string | null; doneAt?: string | null }
export interface Move { id: string; stopId: string; day: number | null; position: number }

const ZINC = 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200';
const KINDS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  see: { label: 'Sight', icon: Landmark, tone: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200' },
  do: { label: 'Activity', icon: Ticket, tone: 'bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200' },
  eat: { label: 'Food', icon: Utensils, tone: 'bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200' },
  drink: { label: 'Café & drinks', icon: Coffee, tone: 'bg-rose-50 text-rose-800 dark:bg-rose-400/10 dark:text-rose-200' },
  buy: { label: 'Shopping', icon: ShoppingBag, tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200' },
  go: { label: 'Day trip', icon: Mountain, tone: ZINC },
  sleep: { label: 'Stay', icon: BedDouble, tone: ZINC },
  other: { label: 'Place', icon: MapPin, tone: ZINC },
};
const kindOf = (k: string) => KINDS[k] ?? KINDS.other;
const STARTS = Array.from({ length: 21 }, (_, i) => 5 * 60 + i * 30); // 5:00 to 15:00
const located = (p: { lat: number | null; lon: number | null }): p is { lat: number; lon: number } => p.lat !== null && p.lon !== null;

/** Columns in order: not planned (null), then day 0, 1, … */
function columns(items: TripItem[], days: number) {
  const cols = new Map<number | null, TripItem[]>([[null, []], ...Array.from({ length: days }, (_, d) => [d, []] as [number, TripItem[]])]);
  for (const it of items) (cols.get(it.day !== null && it.day < days ? it.day : null) ?? cols.get(null)!).push(it);
  for (const list of cols.values()) list.sort((a, b) => a.position - b.position);
  return cols;
}

export function TripDays({ stop, items, from, today = null, onMove, onTime, onRemove, onDone, onAdd, onMagic, onStarts }: {
  stop: PlanStop; items: TripItem[]; from: string | null; today?: number | null;
  onMove: (moves: Move[], next: TripItem[]) => void; onTime: (it: TripItem, minutes: number) => void; onRemove: (it: TripItem) => void;
  onDone: (it: TripItem, done: boolean) => void; onAdd: () => void; onMagic?: () => void;
  /** M329: when each day starts (the stop's `starts`), saved for everyone on the trip. */
  onStarts: (starts: Record<number, number>) => void;
}) {
  const board = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ day: number | null; index: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // The place you sleep starts and ends each day; it isn't one of the day's cards.
  const stay = useMemo(() => items.find((x) => x.kind === 'sleep' && located(x)) ?? null, [items]);
  const cols = useMemo(() => columns(items.filter((x) => x.id !== stay?.id), stop.days), [items, stay, stop.days]);
  const [sel, setSel] = useState<number | null>(() => (today !== null && today < stop.days ? today : [...cols.entries()].find(([d, l]) => d !== null && l.length)?.[0] ?? 0));
  const day = sel !== null && sel >= stop.days ? stop.days - 1 : sel;
  const list = useMemo(() => cols.get(day) ?? [], [cols, day]);
  const starts = useMemo(() => readStarts(stop.starts), [stop.starts]);
  const start = (day !== null ? starts[day] : undefined) ?? DAY_START;
  const plan = useMemo(() => daySchedule(list, start, stay), [list, start, stay]);
  const setStart = (m: number) => { if (day !== null) onStarts({ ...starts, [day]: m }); };

  /** Put a place at a spot; renumber the days it left and joined; slide everything that moved. */
  const place = (id: string, to: number | null, index: number) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const fromDay = it.day !== null && it.day < stop.days ? it.day : null;
    const target = (cols.get(to) ?? []).filter((x) => x.id !== id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, it);
    const changed = new Map<string, Move>();
    target.forEach((x, position) => changed.set(x.id, { id: x.id, stopId: stop.id, day: to, position }));
    if (fromDay !== to) (cols.get(fromDay) ?? []).filter((x) => x.id !== id).forEach((x, position) => changed.set(x.id, { id: x.id, stopId: stop.id, day: fromDay, position }));
    apply([...changed.values()]);
  };
  const apply = (all: Move[]) => {
    const moves = all.filter((m) => { const x = items.find((y) => y.id === m.id)!; return x.day !== m.day || x.position !== m.position; });
    if (!moves.length) return false;
    const by = new Map(moves.map((m) => [m.id, m]));
    morph(board.current, () => onMove(moves, items.map((x) => { const m = by.get(x.id); return m ? { ...x, day: m.day, position: m.position } : x; })), { deep: true });
    return true;
  };
  const spread = () => { setMenu(false); apply(planDays(items.filter((x) => x.id !== stay?.id), stop.days).map((p) => ({ id: p.id, stopId: stop.id, day: p.day, position: p.position }))); };
  const shortest = () => { setMenu(false); apply(dayOrder(list, stay).map((x, position) => ({ id: x.id, stopId: stop.id, day, position }))); };

  /** Where in the day the pointer is: before the first card whose middle is below it. */
  const indexAt = (y: number) => {
    const cards = Array.from(board.current?.querySelectorAll<HTMLElement>(':scope > li[data-key]') ?? []).filter((el) => el.dataset.key !== drag);
    const i = cards.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return i < 0 ? cards.length : i;
  };
  // A day's circle takes a dragged place (data-day: the day, '' for not planned).
  const dayOf = (el: HTMLElement) => (el.dataset.day ? Number(el.dataset.day) : null);
  const onDayOver = (e: React.DragEvent<HTMLElement>) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const to = dayOf(e.currentTarget); if (over?.day !== to || over.index !== -1) setOver({ day: to, index: -1 }); };
  const onDayLeave = (e: React.DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); };
  const onDayDrop = (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); const to = dayOf(e.currentTarget), id = e.dataTransfer.getData('text/plain') || drag; if (id) place(id, to, (cols.get(to) ?? []).length); setDrag(null); setOver(null); };

  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [menu]);

  const date = day !== null && from ? addDays(from, day) : null;
  const dateLabel = (d: number, o: Intl.DateTimeFormatOptions) => (from ? new Date(`${addDays(from, d)}T12:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' }) : null);
  const located2 = list.filter(located).length;
  const unplanned = cols.get(null)?.length ?? 0;
  return (
    <div className="relative">
      {/* The days: the weekday over the day's number, the chosen one filled. A place dragged onto one moves there. */}
      <div role="tablist" aria-label={`${stop.name}: days`} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] sm:gap-3">
        {Array.from({ length: stop.days }, (_, d) => {
          const n = cols.get(d)?.length ?? 0, on = day === d, hot = over?.day === d && over.index === -1;
          return (
            <button key={d} type="button" role="tab" aria-selected={on} onClick={() => { setSel(d); setOpen(null); }} data-day={d} onDragOver={onDayOver} onDragLeave={onDayLeave} onDrop={onDayDrop}
              className="group flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-2xl py-1 outline-offset-2 sm:w-16">
              <span className={cn('text-[11px] font-semibold uppercase tracking-wide', on ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400')}>{dateLabel(d, { weekday: 'short' }) ?? 'Day'}</span>
              <span className="sr-only">Day </span>
              <span className={cn('relative flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-200 sm:h-14 sm:w-14 sm:text-xl',
                on ? 'bg-indigo-600 text-white shadow-[0_6px_16px_-6px_rgb(37_99_235/0.7)]' : 'bg-zinc-100 text-zinc-800 group-hover:bg-zinc-200 dark:bg-white/[0.07] dark:text-zinc-100 dark:group-hover:bg-white/[0.12]',
                hot && 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-[var(--card-bg)]')}>
                {d + 1}
                {n > 0 && !on && <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden />}
              </span>
              <span className="sr-only">{dateLabel(d, { day: 'numeric', month: 'long' }) ? `, ${dateLabel(d, { day: 'numeric', month: 'long' })}` : ''}: {n} {n === 1 ? 'place' : 'places'}</span>
            </button>
          );
        })}
        <button type="button" role="tab" aria-selected={day === null} onClick={() => { setSel(null); setOpen(null); }} data-day="" onDragOver={onDayOver} onDragLeave={onDayLeave} onDrop={onDayDrop}
          className="group flex shrink-0 flex-col items-center gap-1.5 rounded-2xl py-1 outline-offset-2">
          <span className={cn('text-[11px] font-semibold uppercase tracking-wide', day === null ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400')}>Later</span>
          <span className="sr-only">, not on a day yet:</span>
          <span className={cn('flex h-12 min-w-12 items-center justify-center rounded-full px-3 text-sm font-semibold tabular-nums sm:h-14 sm:min-w-14',
            day === null ? 'bg-indigo-600 text-white' : 'border border-dashed border-zinc-300 text-zinc-600 dark:border-white/20 dark:text-zinc-300',
            over?.day === null && over.index === -1 && 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-[var(--card-bg)]')}>{unplanned}</span>
          <span className="sr-only"> {unplanned === 1 ? 'place' : 'places'}</span>
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
        <div className="min-w-0">
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300" aria-live="polite">
            {day === null ? <>Places on the trip that aren’t on a day yet. Drag one onto a day, or tap it.</>
              : list.length ? <>Total travel today: <strong className="font-semibold text-zinc-900 dark:text-white">{hm(plan.travel) || '0 min'}</strong>{date && <span className="text-zinc-500 dark:text-zinc-400"> · {dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}</span>}</>
                : <>Nothing on Day {day + 1} yet: tap ✨ to plan it, + to add places, or drag one here.</>}
          </p>

          {day !== null && stay && list.length > 0 && <Anchor stay={stay} time={clock(start)} label="Leave" />}
          <ol ref={board} data-no-arrange className="mt-3" aria-label={day === null ? 'Not planned yet' : `Day ${day + 1}`}
            onDragOver={(e) => { if (!drag) return; e.preventDefault(); const index = indexAt(e.clientY); if (over?.day !== day || over.index !== index) setOver({ day, index }); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || drag; if (id) place(id, day, indexAt(e.clientY)); setDrag(null); setOver(null); }}>
            {list.map((it, i) => {
              const at = day === null ? null : plan.stops[i], next = list[i + 1], way = day === null ? null : plan.stops[i + 1]?.way ?? null;
              const before = list.slice(0, i).filter((x) => x.id !== drag).length;
              return (
                <li key={it.id} data-key={it.id} className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
                  {over?.day === day && over.index === before && it.id !== drag && <span className="col-span-2 mb-2 block h-0.5 rounded-full bg-indigo-500" aria-hidden />}
                  <div className="relative flex justify-center">
                    <button type="button" onClick={() => onDone(it, !it.doneAt)} aria-pressed={!!it.doneAt} aria-label={`${it.doneAt ? 'Done' : 'Not done yet'}: ${it.name}`}
                      className={cn('relative z-[1] mt-6 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-[background-color,border-color] duration-200',
                        it.doneAt ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-dashed border-zinc-300 bg-[var(--card-bg)] text-transparent hover:border-emerald-500 dark:border-white/25')}>
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    {(next || (stay && day !== null)) && <span className="absolute bottom-0 top-14 start-1/2 -translate-x-1/2 border-s-2 border-dashed border-zinc-200 rtl:translate-x-1/2 dark:border-white/10" aria-hidden />}
                  </div>
                  <div className="min-w-0">
                    <Stop it={it} at={at} days={stop.days} near={stop.name} open={open === it.id} dragging={drag === it.id} first={i === 0} last={i === list.length - 1}
                      onOpen={() => setOpen((o) => (o === it.id ? null : it.id))}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; setDrag(it.id); setOpen(null); }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}
                      onMoveTo={(d) => place(it.id, d, (cols.get(d) ?? []).length)} onStep={(dir) => place(it.id, day, i + dir)}
                      onTime={(m) => onTime(it, m)} onRemove={() => onRemove(it)} />
                    {next && way && <Way a={it} b={next} way={way} />}
                    {!next && day !== null && stay && plan.back && <Way a={it} b={stay} way={plan.back} home />}
                  </div>
                </li>
              );
            })}
            {over?.day === day && over.index >= list.filter((x) => x.id !== drag).length && <li className="ms-11 mb-2 h-0.5 rounded-full bg-indigo-500" aria-hidden />}
            {!list.length && (
              <li className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
                {day === null ? 'Everything is on a day.' : <>
                  <span>An empty day: a slow one, or a plan waiting.</span>
                  <span className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={onMagic ?? spread} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" aria-hidden />Plan it for me</button>
                    <button type="button" onClick={onAdd} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" aria-hidden />Add places</button>
                  </span>
                </>}
              </li>
            )}
          </ol>
          {day !== null && stay && list.length > 0 && <Anchor stay={stay} time={clock(plan.end)} label="Back" />}
        </div>

        {/* On a computer: the day at a glance beside it. */}
        {day !== null && (
          <aside className="mt-6 hidden lg:block" aria-label={`Day ${day + 1} at a glance`}>
            <div className="sticky top-24 space-y-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/[0.03] dark:ring-white/10">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Day {day + 1}{date && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}</p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Places</dt><dd className="font-semibold tabular-nums text-zinc-900 dark:text-white">{list.length}</dd></div>
                <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Getting about</dt><dd className="font-semibold tabular-nums text-zinc-900 dark:text-white">{hm(plan.travel) || '–'}</dd></div>
                <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Starts</dt><dd className="font-semibold tabular-nums text-zinc-900 dark:text-white">{clock(start)}</dd></div>
                <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">{stay ? 'Back' : 'Ends'}</dt><dd className={cn('font-semibold tabular-nums', plan.end - start > 11 * 60 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-900 dark:text-white')}>{list.length ? clock(plan.end) : '–'}</dd></div>
              </dl>
              {plan.end - start > 11 * 60 && <p className="text-xs text-amber-800 dark:text-amber-200">A very full day: move a place to another day, or start earlier.</p>}
              {stay ? <p className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-300"><BedDouble className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /><span>From and back to <span translate="no">{stay.name}</span></span></p>
                : <p className="text-xs text-zinc-600 dark:text-zinc-300">Add where you’re staying (+, then Stay) and each day starts and ends there.</p>}
              {located2 >= 3 && <button type="button" onClick={shortest} className="btn-secondary btn-sm w-full">Shortest round</button>}
            </div>
          </aside>
        )}
      </div>

      {/* The round buttons, floating at the bottom while the day is on screen (above the assistant's button). */}
      {/* On a phone they step aside while a place is open, so they never cover its buttons. */}
      <div className={cn('pointer-events-none sticky bottom-[calc(var(--mobile-tabbar-h)+var(--safe-bottom)+4.75rem)] z-10 mt-4 flex flex-col items-end gap-3 lg:bottom-[5.5rem]', open && 'max-lg:hidden')}>
        <div className="pointer-events-auto relative">
          {menu && (
            <div role="menu" aria-label="Day options" className="card absolute bottom-full end-0 mb-3 w-64 space-y-1 p-2! spot-up origin-bottom-right rtl:origin-bottom-left">
              {day !== null && <button type="button" role="menuitem" onClick={shortest} disabled={located2 < 2} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"><Navigation className="h-4 w-4" aria-hidden />Shortest round for Day {day + 1}</button>}
              <button type="button" role="menuitem" onClick={spread} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.06]"><Wand2 className="h-4 w-4" aria-hidden />Spread the places over the days</button>
              {day !== null && <label className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
                <span className="flex items-center gap-2"><Clock className="h-4 w-4" aria-hidden />Day {day === null ? '' : day + 1} starts at</span>
                <select value={start} onChange={(e) => setStart(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold dark:border-white/10 dark:bg-white/[0.05]">
                  {STARTS.map((m) => <option key={m} value={m}>{clock(m)}</option>)}
                </select>
              </label>}
            </div>
          )}
        </div>
        {onMagic && <Fab label="Plan my days for me" onClick={onMagic} icon={Sparkles} tone="bg-indigo-700" />}
        <Fab label="Day options" onClick={() => setMenu((m) => !m)} icon={SlidersHorizontal} expanded={menu} />
        <Fab label="Add places" onClick={onAdd} icon={Plus} />
      </div>
    </div>
  );
}

function Fab({ label, onClick, icon: Icon, tone = 'bg-indigo-600', expanded }: { label: string; onClick: () => void; icon: LucideIcon; tone?: string; expanded?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-expanded={expanded}
      className={cn('pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_24px_-8px_rgb(15_23_42/0.45)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5', tone)}>
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** The stay at the top (leaving) and the bottom (back) of a day. */
function Anchor({ stay, time, label }: { stay: TripItem; time: string; label: string }) {
  return (
    <div className="mt-3 grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
      <span className="flex justify-center"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"><BedDouble className="h-3.5 w-3.5" aria-hidden /></span></span>
      <p className="min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-300"><span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{label} {time}</span> · <span translate="no">{stay.name}</span></p>
    </div>
  );
}

/** Between two places: the walk or ride, how far, and directions. */
function Way({ a, b, way, home }: { a: TripItem; b: TripItem; way: { minutes: number; walk: boolean; metres: number }; home?: boolean }) {
  const Icon = way.walk ? Footprints : TramFront;
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5 ps-1 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="inline-flex items-center gap-1.5 tabular-nums"><Icon className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">{way.walk ? 'Walk' : 'Metro, bus or taxi'}: </span>{hm(way.minutes)} · {distance(way.metres)}{home && <span> back</span>}</span>
      {located(a) && located(b) && (
        <a href={googleDirections(a, b, way.walk ? 'foot' : 'transit')} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.07] dark:text-zinc-200 dark:hover:bg-white/[0.12]">
          <Navigation className="h-3 w-3" aria-hidden />Directions<span className="sr-only"> from {a.name} to {b.name} (opens Google Maps)</span>
        </a>
      )}
    </div>
  );
}

function Picture({ it }: { it: TripItem }) {
  const K = kindOf(it.kind);
  const box = 'h-16 w-16 shrink-0 rounded-xl sm:h-[4.5rem] sm:w-[4.5rem]';
  return it.photo ? <Photo src={commonsImage(it.photo, 250)} srcSet={`${commonsImage(it.photo, 120)} 120w, ${commonsImage(it.photo, 250)} 250w`} shown={72} alt="" loading="lazy" className={cn(box, 'bg-zinc-100 object-cover dark:bg-white/[0.06]')} />
    : <span className={cn(box, 'flex items-center justify-center', K.tone)} aria-hidden><K.icon className="h-6 w-6" /></span>;
}

function Stop({ it, at, days, near, open, dragging, first, last, onOpen, onDragStart, onDragEnd, onMoveTo, onStep, onTime, onRemove }: {
  it: TripItem; at: { from: number; to: number } | null; days: number; near: string; open: boolean; dragging: boolean; first: boolean; last: boolean;
  onOpen: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onMoveTo: (day: number | null) => void; onStep: (dir: -1 | 1) => void; onTime: (m: number) => void; onRemove: () => void;
}) {
  const K = kindOf(it.kind);
  const times = TIME_CHOICES.includes(it.minutes as (typeof TIME_CHOICES)[number]) ? TIME_CHOICES : [...TIME_CHOICES, it.minutes].sort((a, b) => a - b);
  const field = 'rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200';
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={cn('card overflow-hidden p-0! transition-[opacity,transform,box-shadow] duration-150', dragging && 'scale-[0.98] opacity-50', it.doneAt && 'opacity-80')}>
      <div className="flex items-center gap-3 p-2.5 pe-1.5">
        <Picture it={it} />
        <button type="button" onClick={onOpen} aria-expanded={open} className="min-w-0 flex-1 self-stretch text-start">
          <span className={cn('line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white sm:text-base', it.doneAt && 'line-through decoration-zinc-400')} translate="no">{it.name}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', K.tone)}><K.icon className="h-3 w-3" aria-hidden />{K.label}</span>
            {at && <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400"><span className="sr-only">From </span>{clock(at.from)} · {hm(at.to - at.from) || 'a stop'}</span>}
          </span>
        </button>
        <span className="cursor-grab p-2 text-zinc-400 active:cursor-grabbing dark:text-zinc-500" aria-hidden title="Drag to move"><Menu className="h-4 w-4" /></span>
      </div>
      {open && (
        <div className="space-y-2 border-t border-zinc-200/70 px-3 pb-3 pt-2.5 dark:border-white/10">
          {it.note && <p className="line-clamp-4 text-sm text-zinc-700 dark:text-zinc-200" translate="no">{it.note}</p>}
          {(it.hours || it.price) && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              {it.hours && <span className="inline-flex items-start gap-1"><Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /><span><span className="sr-only">Open </span>{it.hours}</span></span>}
              {it.price && <span>{it.price}</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor={`t-${it.id}`}>Time at {it.name}</label>
            <select id={`t-${it.id}`} value={it.minutes} onChange={(e) => onTime(Number(e.target.value))} className={field}>
              {times.map((m) => <option key={m} value={m}>{m ? hm(m) : 'No time'}</option>)}
            </select>
            <label className="sr-only" htmlFor={`d-${it.id}`}>Move {it.name} to</label>
            <select id={`d-${it.id}`} value={it.day === null || it.day >= days ? '' : String(it.day)} onChange={(e) => onMoveTo(e.target.value === '' ? null : Number(e.target.value))} className={field}>
              <option value="">Not planned</option>
              {Array.from({ length: days }, (_, d) => <option key={d} value={d}>Day {d + 1}</option>)}
            </select>
            <span className="ms-auto flex items-center">
              <button type="button" disabled={first} onClick={() => onStep(-1)} className="btn-ghost btn-sm p-1.5" aria-label={`Move ${it.name} earlier`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
              <button type="button" disabled={last} onClick={() => onStep(1)} className="btn-ghost btn-sm p-1.5" aria-label={`Move ${it.name} later`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
              <Link href={mapLink(it.name, { lat: it.lat ?? undefined, lon: it.lon ?? undefined, address: it.address ?? undefined, near })} className="btn-ghost btn-sm p-1.5" aria-label={`${it.name} on the map`}><MapPin className="h-4 w-4" aria-hidden /></Link>
              <button type="button" onClick={onRemove} className="btn-ghost btn-sm p-1.5 text-red-600 dark:text-red-400" aria-label={`Remove ${it.name}`}><X className="h-4 w-4" aria-hidden /></button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
