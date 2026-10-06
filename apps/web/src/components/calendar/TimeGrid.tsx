'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, m as motion, type PanInfo } from 'framer-motion';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Info } from 'lucide-react';
import { Segmented, type Segment } from '@/components/ui/Segmented';
import { spring } from '@/lib/motion';
import { reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';

// The timetable like a phone's calendar app (student and teacher calendars): days side by side
// under a weekday and date (today in a two-tone circle), hours down the side, every class a solid
// block in its course's colour with white text, classes at the same time side by side, one-off
// events marked with an info icon, and a red line at the current time. Phones open on the next 4
// days, larger screens on the week. Swipe (or the arrows) for the next or previous days; tap a day,
// or a date in Month, to see just that day. Saturdays and Sundays only show when something is on.

export interface GridEntry<T = unknown> {
  id: string;
  /** Weekly classes: 0 = Monday … 6 = Sunday. */
  weekday?: number;
  /** One-off events: the day they happen on. */
  date?: Date;
  /** Minutes after midnight. An end at or before the start is a moment (a deadline): it shows above the hours. */
  start: number;
  end: number;
  /** The bold first line (course code or title). */
  title: string;
  /** The second line, when there's room (course name). */
  subtitle?: string;
  location?: string;
  color: string;
  /** A one-off event (meeting, exam, office hours) rather than a weekly class. */
  event?: boolean;
  data: T;
}

export type GridView = 'day' | 'days' | 'week' | 'month';

/** Events without a colour of their own: deep navy, like meetings in a calendar app. */
export const EVENT_COLOR = '#27325a';

const VIEWS: Segment<GridView>[] = [
  { value: 'day', label: 'Day' },
  { value: 'days', label: '4 Days' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const DAY_MIN = 24 * 60;
/** Space above the first hour line and below the last, so their labels fit (px). */
const PAD = 10;
/** The shortest block drawn (minutes), so it can still be tapped. */
const MIN_BLOCK = 22;
/** All-day events: anything this long sits above the hours instead of filling the column. */
const ALL_DAY = 20 * 60;

const PHONE = '(max-width: 639px)';
const TOUCH = '(pointer: coarse)';
const media = (q: string) => ({
  subscribe: (cb: () => void) => {
    const m = window.matchMedia(q);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  },
  get: () => typeof window !== 'undefined' && window.matchMedia(q).matches,
});
const phoneQuery = media(PHONE);
const touchQuery = media(TOUCH);
const offServer = () => false;

// The current minute, so the red line moves and "today" turns over at midnight.
const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** 0 = Monday … 6 = Sunday, like the timetable. */
const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const clock = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return { t: `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}`, p: h < 12 ? 'AM' : 'PM' };
};
/** "9:00 – 10:30 AM", "11:30 AM – 1:00 PM". */
export function timeRange(start: number, end: number) {
  const a = clock(start), b = clock(end);
  if (end <= start) return `${a.t} ${a.p}`;
  return a.p === b.p ? `${a.t} – ${b.t} ${b.p}` : `${a.t} ${a.p} – ${b.t} ${b.p}`;
}
const hourLabel = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`;

// White text needs a dark enough block: light course colours (amber, sky) are deepened until white
// on them reads at 4.5:1, keeping their hue. Colours that aren't hex are used as they are.
const solidCache = new Map<string, string>();
function solid(color: string): string {
  const hit = solidCache.get(color);
  if (hit) return hit;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  let out = color;
  if (m) {
    const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = () => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    for (let i = 0; i < 20 && lum() > 0.183; i++) { r *= 0.93; g *= 0.93; b *= 0.93; }
    out = `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
  }
  solidCache.set(color, out);
  return out;
}

const isMoment = (e: GridEntry) => e.end <= e.start;
const isAllDay = (e: GridEntry) => e.end - e.start >= ALL_DAY;

interface Placed<T> { e: GridEntry<T>; s: number; f: number; col: number; span: number; cols: number }

/**
 * Lays a day's classes out like a calendar app: classes that overlap share the width side by side
 * (each in the first free column of its group), and a class widens into free columns to its right.
 */
function layoutDay<T>(list: GridEntry<T>[]): Placed<T>[] {
  const items = list
    .map((e) => ({ e, s: e.start, f: Math.min(DAY_MIN, Math.max(e.end, e.start + MIN_BLOCK)) }))
    .sort((a, b) => a.s - b.s || b.f - a.f);
  const out: Placed<T>[] = [];
  let group: (typeof items[number] & { col: number })[] = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = ends.length;
    for (const it of group) {
      let span = 1;
      while (it.col + span < cols && !group.some((o) => o.col === it.col + span && o.s < it.f && it.s < o.f)) span++;
      out.push({ ...it, span, cols });
    }
    group = [];
    ends = [];
  };
  for (const it of items) {
    if (it.s >= groupEnd) { flush(); groupEnd = -1; }
    let col = ends.findIndex((end) => end <= it.s);
    if (col === -1) { col = ends.length; ends.push(it.f); } else ends[col] = it.f;
    group.push({ ...it, col });
    groupEnd = Math.max(groupEnd, it.f);
  }
  flush();
  return out;
}

export function TimeGrid<T>({ entries, loading, onOpen, label, toolbarEnd, emptyText = 'No classes' }: {
  entries: GridEntry<T>[];
  loading?: boolean;
  onOpen: (entry: GridEntry<T>, day: Date) => void;
  /** Accessible name, e.g. "Your timetable". */
  label: string;
  /** Extra controls beside the view switch (e.g. Office hours). */
  toolbarEnd?: React.ReactNode;
  /** What an empty day says in the Day view. */
  emptyText?: string;
}) {
  const phone = useSyncExternalStore(phoneQuery.subscribe, phoneQuery.get, offServer);
  const touch = useSyncExternalStore(touchQuery.subscribe, touchQuery.get, offServer);
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, minuteNow);
  const now = new Date(minute * 60_000);
  const today = startOfDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const [picked, setPicked] = useState<GridView | null>(null);
  const view: GridView = picked ?? (phone ? 'days' : 'week');
  const [focus, setFocus] = useState(() => startOfDay(new Date()));
  const [dir, setDir] = useState(0);
  const dragged = useRef(false);

  // Weekly classes by weekday, one-off events by date.
  const index = useMemo(() => {
    const weekly: GridEntry<T>[][] = [[], [], [], [], [], [], []];
    const dated = new Map<string, GridEntry<T>[]>();
    for (const e of entries) {
      if (e.date) {
        const k = dayKey(e.date);
        const list = dated.get(k);
        if (list) list.push(e); else dated.set(k, [e]);
      } else if (e.weekday != null && weekly[e.weekday]) weekly[e.weekday].push(e);
    }
    return { weekly, dated };
  }, [entries]);
  const on = (d: Date) => [...index.weekly[weekdayOf(d)], ...(index.dated.get(dayKey(d)) ?? [])];
  /** Weekdays always; a Saturday or Sunday when something's on, or it's today. */
  const shown = (d: Date) => weekdayOf(d) < 5 || isSameDay(d, today) || on(d).length > 0;

  const keep = (d: Date) => shown(d) || isSameDay(d, focus);
  const days: Date[] = [];
  if (view === 'day' || view === 'month') days.push(focus);
  else if (view === 'week') {
    const monday = startOfWeek(focus, { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) if (keep(addDays(monday, i))) days.push(addDays(monday, i));
  } else {
    for (let d = focus, i = 0; days.length < 4 && i < 14; d = addDays(d, 1), i++) if (keep(d)) days.push(d);
  }

  const go = (d: Date, direction: number) => {
    setDir(direction);
    setFocus(startOfDay(d));
  };
  const step = (by: 1 | -1) => {
    let next: Date;
    if (view === 'month') next = addMonths(focus, by);
    else if (view === 'week') next = addDays(focus, 7 * by);
    else if (view === 'day') {
      next = addDays(focus, by);
      for (let i = 0; i < 7 && !shown(next); i++) next = addDays(next, by);
    } else if (by > 0) {
      next = addDays(days[days.length - 1], 1);
      for (let i = 0; i < 7 && !shown(next); i++) next = addDays(next, 1);
    } else {
      next = focus;
      let d = addDays(focus, -1);
      for (let i = 0, n = 0; i < 21 && n < 4; i++, d = addDays(d, -1)) if (shown(d)) { next = d; n++; }
    }
    go(next, by);
  };
  const pickView = (v: GridView) => { setDir(0); setPicked(v); };
  const openDay = (d: Date) => { setDir(0); setPicked('day'); setFocus(startOfDay(d)); };

  const showsToday = view === 'month' ? isSameMonth(focus, today) : days.some((d) => isSameDay(d, today));
  const first = days[0], last = days[days.length - 1];
  const title = view === 'month' || isSameMonth(first, last)
    ? format(view === 'month' ? focus : first, 'MMMM yyyy')
    : `${format(first, 'MMM')} – ${format(last, 'MMM yyyy')}`;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => { dragged.current = false; }, 0);
    if (info.offset.x < -56 || info.velocity.x < -450) step(1);
    else if (info.offset.x > 56 || info.velocity.x > 450) step(-1);
  };
  const open = (e: GridEntry<T>, d: Date) => { if (!dragged.current) onOpen(e, d); };

  const calm = reducedMotion();
  const slide = {
    enter: (d: number) => (calm || d === 0 ? { x: 0, opacity: 0 } : { x: d > 0 ? '100%' : '-100%', opacity: 1 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (calm || d === 0 ? { x: 0, opacity: 0 } : { x: d > 0 ? '-100%' : '100%', opacity: 1 }),
  };
  const pageKey = view === 'month' ? `month:${format(focus, 'yyyy-MM')}` : `${view}:${dayKey(first)}`;
  const pager = {
    custom: dir,
    variants: slide,
    initial: 'enter',
    animate: 'center',
    exit: 'exit',
    transition: { x: spring.smooth, opacity: { duration: 0.18 } },
    drag: touch ? ('x' as const) : false,
    dragDirectionLock: true,
    dragConstraints: { left: 0, right: 0 },
    dragElastic: 0.45,
    onDragStart: () => { dragged.current = true; },
    onDragEnd,
  };

  // ── Time views: hours that cover every class in sight (at least 8 AM – 6 PM) ──
  const timed = days.map((d) => on(d).filter((e) => !isMoment(e) && !isAllDay(e)));
  const tops = days.map((d) => on(d).filter((e) => isMoment(e) || isAllDay(e)).sort((a, b) => a.start - b.start));
  const flat = timed.flat();
  const lo = Math.max(0, Math.min(8, ...flat.map((e) => Math.floor(e.start / 60))));
  const hi = Math.min(24, Math.max(18, ...flat.map((e) => Math.ceil(Math.min(DAY_MIN, Math.max(e.end, e.start + MIN_BLOCK)) / 60))));
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const y = (min: number) => `calc(${PAD}px + ${(min - lo * 60) / 60} * var(--hh))`;
  const bodyH = `calc(${PAD * 2}px + ${hi - lo} * var(--hh))`;
  // Above the hours: up to two all-day events or deadlines per day (one and "+N more" when there are more).
  const topRows = Math.max(0, ...tops.map((t) => Math.min(t.length, 2)));
  const headH = (view === 'day' ? 60 : 58) + topRows * 20;
  const todayCol = days.findIndex((d) => isSameDay(d, today));
  const nowShown = todayCol >= 0 && nowMin >= lo * 60 && nowMin <= hi * 60;
  const sticky = 'sticky top-[calc(var(--mobile-header-h)+var(--safe-top))] lg:top-16';

  const frame = 'relative -mx-4 sm:mx-0 bg-[var(--card-bg)] sm:rounded-2xl border-y sm:border border-[var(--card-border)] shadow-[var(--card-shadow)]';

  return (
    <div className="space-y-3">
      {/* Month (tap to jump to a date), arrows and Today, then the view switch */}
      <div className="flex items-center justify-between gap-2">
        <label className="relative inline-flex items-center gap-1 min-w-0 rounded-lg cursor-pointer pressable">
          <span className="text-[22px] sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white truncate">{title}</span>
          <ChevronDown className="w-4 h-4 mt-1 text-tint-text shrink-0" strokeWidth={2.5} />
          <input
            type="date"
            aria-label="Go to a date"
            value={format(focus, 'yyyy-MM-dd')}
            onChange={(ev) => {
              const [yy, mm, dd] = ev.target.value.split('-').map(Number);
              if (yy && mm && dd) { const d = new Date(yy, mm - 1, dd); go(d, Math.sign(d.getTime() - focus.getTime())); }
            }}
            onClick={(ev) => { try { ev.currentTarget.showPicker(); } catch { /* the browser opens its own picker */ } }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className="btn-ghost btn-icon rounded-full"><ChevronLeft className="w-5 h-5" /></button>
          <button type="button" onClick={() => go(today, Math.sign(today.getTime() - focus.getTime()))} disabled={showsToday} className="btn-secondary btn-sm rounded-full">Today</button>
          <button type="button" onClick={() => step(1)} aria-label="Next" className="btn-ghost btn-icon rounded-full"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Segmented segments={VIEWS} value={view} onChange={pickView} label="Show" large className="w-full sm:w-auto" />
        {toolbarEnd}
      </div>

      {view === 'month' ? (
        <section aria-label={`${label}, ${title}`} className={cn(frame, 'overflow-x-clip')}>
          <div className={cn(sticky, 'z-20 grid grid-cols-7 bg-[var(--material-thick)] backdrop-blur-xl sm:rounded-t-2xl')} style={{ boxShadow: 'inset 0 -0.5px 0 var(--separator)' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{phone ? d[0] : d}</span>
            ))}
          </div>
          <div className="relative">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div key={pageKey} {...pager} className="w-full touch-pan-y">
                <MonthGrid focus={focus} today={today} on={on} phone={phone} loading={loading} onPick={(d) => { if (!dragged.current) openDay(d); }} />
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      ) : (
        <section aria-label={`${label}, ${title}`} className={cn(frame, 'flex [--hh:56px] sm:[--hh:64px]')}>
          {/* Hours: they stay put while the days slide */}
          <div className="w-11 sm:w-14 shrink-0 relative" aria-hidden>
            <div className={cn(sticky, 'z-20 bg-[var(--material-thick)] backdrop-blur-xl sm:rounded-tl-2xl')} style={{ height: headH, boxShadow: 'inset 0 -0.5px 0 var(--separator)' }} />
            <div className="relative" style={{ height: bodyH }}>
              {hours.map((h) => {
                const near = nowShown && Math.abs(h * 60 - nowMin) < 13;
                return (
                  <span key={h} className={cn('absolute right-1.5 sm:right-2 -translate-y-1/2 text-[10.5px] sm:text-[11px] font-medium tabular-nums text-zinc-500 whitespace-nowrap transition-opacity', near && 'opacity-0')} style={{ top: y(h * 60) }}>
                    {hourLabel(h)}
                  </span>
                );
              })}
              {nowShown && (
                <span className="absolute right-1 sm:right-1.5 -translate-y-1/2 text-[10.5px] sm:text-[11px] font-semibold tabular-nums text-[var(--ios-red)] whitespace-nowrap" style={{ top: y(nowMin) }}>
                  {clock(nowMin).t}
                </span>
              )}
            </div>
          </div>

          <div className="relative flex-1 min-w-0 overflow-x-clip">
            {/* Hour lines, also still */}
            <div aria-hidden className="absolute inset-x-0 pointer-events-none" style={{ top: headH, height: bodyH }}>
              {hours.map((h) => <div key={h} className="absolute inset-x-0 h-px bg-[var(--separator)] opacity-70" style={{ top: y(h * 60) }} />)}
            </div>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div key={pageKey} {...pager} className="relative z-[1] w-full touch-pan-y">
                {/* Weekday and date; tap one for just that day */}
                <div className={cn(sticky, 'z-20 flex bg-[var(--material-thick)] backdrop-blur-xl sm:rounded-tr-2xl')} style={{ height: headH, boxShadow: 'inset 0 -0.5px 0 var(--separator)' }}>
                  {days.map((d, i) => {
                    const isToday = isSameDay(d, today);
                    const head = (
                      <>
                        <span className={cn('text-[11px] font-semibold uppercase tracking-wide', isToday ? 'text-tint-text' : weekdayOf(d) > 4 ? 'text-zinc-400' : 'text-zinc-500')}>
                          {format(d, view === 'day' ? 'EEEE' : 'EEE')}
                        </span>
                        <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[17px] font-semibold tabular-nums', isToday ? 'text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_4px_12px_-4px_rgba(139,92,246,0.75)]' : 'text-zinc-900 dark:text-white')}>
                          {format(d, 'd')}
                        </span>
                        {view === 'day' && <span className="text-[13px] font-medium text-zinc-500">{format(d, 'MMMM')}</span>}
                      </>
                    );
                    return (
                      <div key={dayKey(d)} className="flex-1 min-w-0 flex flex-col items-stretch px-0.5" style={{ boxShadow: 'inset 0.5px 0 0 var(--separator)' }}>
                        {view === 'day' ? (
                          <div className="flex items-center justify-center gap-1.5 pt-1.5 pb-1">{head}</div>
                        ) : (
                          <button type="button" onClick={() => openDay(d)} aria-label={`${format(d, 'EEEE, MMMM d')}: show this day`} className="flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 pressable">{head}</button>
                        )}
                        {tops[i].slice(0, tops[i].length > 2 ? 1 : 2).map((e) => (
                          <button key={e.id} type="button" onClick={() => open(e, d)} title={`${e.title}${isMoment(e) ? ` · ${timeRange(e.start, e.end)}` : ''}`}
                            className="mt-0.5 h-[18px] rounded-[5px] px-1 text-[10px] font-semibold leading-[18px] text-white text-left truncate pressable"
                            style={{ background: solid(e.color) }}>
                            {isMoment(e) && view !== 'week' ? `${clock(e.start).t} ` : ''}{e.title}
                          </button>
                        ))}
                        {tops[i].length > 2 && (
                          <button type="button" onClick={() => openDay(d)} className="mt-0.5 h-[18px] text-[10px] font-semibold text-tint-text text-left px-1">+{tops[i].length - 1} more</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex" style={{ height: bodyH }}>
                  {days.map((d, i) => {
                    const isToday = i === todayCol;
                    const placed = layoutDay(timed[i]);
                    return (
                      <div key={dayKey(d)} role="group" aria-label={format(d, 'EEEE, MMMM d')} className="relative flex-1 min-w-0" style={{ boxShadow: 'inset 0.5px 0 0 var(--separator)' }}>
                        {isToday && view !== 'day' && <div aria-hidden className="absolute inset-0 bg-indigo-500/[0.04] dark:bg-indigo-400/[0.06]" />}
                        {loading ? (
                          [[9 * 60, 90], [11 * 60, 60], [14 * 60, 90]].filter((_, k) => (i + k) % 3 !== 2).map(([s, len]) => (
                            <div key={s} aria-hidden className="absolute inset-x-[3px] rounded-md skeleton" style={{ top: y(s + 2), height: `calc(${len / 60} * var(--hh) - 3px)` }} />
                          ))
                        ) : placed.length === 0 && tops[i].length === 0 && view === 'day' ? (
                          <div className="absolute inset-x-0 top-24 flex flex-col items-center text-zinc-400">
                            <Clock className="w-7 h-7 mb-2" />
                            <span className="text-sm font-medium">{emptyText}</span>
                          </div>
                        ) : (
                          placed.map((p) => <Block key={p.e.id} p={p} y={y} wide={view === 'day' || (!phone && days.length <= 4)} onOpen={() => open(p.e, d)} />)
                        )}
                        {isToday && nowShown && (
                          <div aria-hidden className="absolute inset-x-0 z-[15] pointer-events-none" style={{ top: y(nowMin) }}>
                            <span className="absolute -left-[4px] -top-[4px] w-2 h-2 rounded-full bg-[var(--ios-red)]" />
                            <span className="absolute inset-x-0 -top-px h-[2px] bg-[var(--ios-red)]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      )}
    </div>
  );
}

/** One class or event: a solid block in its colour with white text, as much as fits. */
function Block<T>({ p, y, wide, onOpen }: { p: Placed<T>; y: (min: number) => string; wide: boolean; onOpen: () => void }) {
  const { e, s, f } = p;
  const mins = f - s;
  const when = timeRange(e.start, e.end);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${e.title}${e.subtitle ? `, ${e.subtitle}` : ''}, ${when}${e.location ? `, ${e.location}` : ''}${e.event ? ', event' : ''}`}
      title={`${e.title}${e.subtitle ? ` · ${e.subtitle}` : ''}\n${when}${e.location ? ` · ${e.location}` : ''}`}
      className={cn(
        'absolute z-10 overflow-hidden rounded-md text-left text-white pressable',
        'shadow-[0_0_0_1px_var(--surface),0_1px_2px_rgba(0,0,0,0.12)]',
        mins < 40 ? 'px-1.5 py-0.5' : 'px-1.5 py-1 sm:px-2 sm:py-1.5',
      )}
      style={{
        top: `calc(${y(s)} + 1px)`,
        height: `calc(${mins / 60} * var(--hh) - 2px)`,
        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
        width: `calc(${(p.span / p.cols) * 100}% - 4px)`,
        background: solid(e.color),
      }}
    >
      {e.event && <Info aria-hidden className="absolute top-1 right-1 w-3.5 h-3.5 text-[var(--ios-orange)] drop-shadow" strokeWidth={2.6} />}
      {mins < 40 ? (
        <span className={cn('block truncate text-[11px] sm:text-xs leading-tight', e.event && 'pr-4')}>
          <b className="font-semibold">{e.title}</b>{e.location ? <span className="opacity-85"> · {e.location}</span> : null}
        </span>
      ) : (
        <>
          <span className={cn('block font-semibold text-[11.5px] sm:text-[13px] leading-tight break-words line-clamp-2', e.event && 'pr-4')}>{e.title}</span>
          {e.location && <span className="block mt-0.5 text-[10.5px] sm:text-xs leading-tight opacity-90 break-words line-clamp-2">{e.location}</span>}
          {mins >= 60 && e.subtitle && <span className="block mt-0.5 text-[10.5px] sm:text-xs leading-tight opacity-80 break-words line-clamp-2">{e.subtitle}</span>}
          {wide && <span className="block mt-0.5 text-[10.5px] sm:text-xs leading-tight opacity-80 tabular-nums">{when}</span>}
        </>
      )}
    </button>
  );
}

/** Month: the dates of the month, each with a dot (phones) or a short line (wider screens) per class. */
function MonthGrid<T>({ focus, today, on, phone, loading, onPick }: {
  focus: Date;
  today: Date;
  on: (d: Date) => GridEntry<T>[];
  phone: boolean;
  loading?: boolean;
  onPick: (d: Date) => void;
}) {
  const startDay = startOfWeek(startOfMonth(focus), { weekStartsOn: 1 });
  const endDay = endOfWeek(endOfMonth(focus), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let d = startDay; d <= endDay; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="grid grid-cols-7">
      {cells.map((d, i) => {
        const list = loading ? [] : on(d).sort((a, b) => a.start - b.start);
        const inMonth = isSameMonth(d, focus);
        const isToday = isSameDay(d, today);
        return (
          <button
            key={dayKey(d)}
            type="button"
            onClick={() => onPick(d)}
            aria-label={`${format(d, 'EEEE, MMMM d')}${list.length ? `, ${list.length} ${list.length === 1 ? 'item' : 'items'}` : ''}`}
            className={cn('relative flex flex-col gap-0.5 min-h-[64px] sm:min-h-[96px] p-1 sm:p-1.5 text-left transition-colors active:bg-[var(--fill)]', !inMonth && 'opacity-40', phone ? 'items-center' : 'items-stretch')}
            style={{ boxShadow: `${i % 7 ? 'inset 0.5px 0 0 var(--separator), ' : ''}inset 0 -0.5px 0 var(--separator)` }}
          >
            <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[15px] font-semibold tabular-nums shrink-0', isToday ? 'text-white bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500' : weekdayOf(d) > 4 ? 'text-zinc-400' : 'text-zinc-900 dark:text-white')}>
              {format(d, 'd')}
            </span>
            {loading ? (
              inMonth && weekdayOf(d) < 5 && <span aria-hidden className="w-full max-w-[3rem] h-2 rounded-full skeleton" />
            ) : phone ? (
              <span className="flex flex-wrap justify-center gap-[3px] max-w-full">
                {list.slice(0, 4).map((e) => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: solid(e.color) }} />)}
              </span>
            ) : (
              <>
                {list.slice(0, 3).map((e) => (
                  <span key={e.id} className="block truncate rounded-[4px] px-1 text-[10.5px] font-semibold leading-4 text-white" style={{ background: solid(e.color) }}>
                    {e.title}
                  </span>
                ))}
                {list.length > 3 && <span className="text-[10.5px] font-semibold text-tint-text px-1">+{list.length - 3} more</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
