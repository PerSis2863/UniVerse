'use client';

import { format, isSameDay } from 'date-fns';
import { CardHead } from '@/components/ui/CardMenu';
import { cn } from '@/lib/utils';
import type { GridEntry } from './TimeGrid';

// M140: the calendar's Timeline view, after the Ballast reels' "Dock calendar": the days down the side,
// the hours across the top, each class a small card at its time (two lines: title, then what and where),
// a "Now" pill on the hours and a line through every day at the current time. Done is the accent (solid
// today, faint on earlier days), on now is ink, coming up is a white card, a clash or a deadline gets an
// amber edge. Below it, like the reel: how busy each day is, and what's coming up next.

type Status = 'done' | 'now' | 'booked';
interface Laid<T> { e: GridEntry<T>; s: number; f: number; lane: number; clash: boolean }

/** Room per lane (px): a two-line card and its gap. */
const LANE_H = 46;
const MOMENT = 60;
const ALL_DAY = 20 * 60;
const isMoment = (e: GridEntry) => e.end <= e.start;
const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Lays one day's entries in lanes: each in the first lane free at its start. Overlaps are clashes. */
export function laneDay<T>(list: GridEntry<T>[], lo: number, hi: number): { items: Laid<T>[]; lanes: number } {
  const items = list
    .map((e) => {
      const allDay = e.end - e.start >= ALL_DAY;
      // A deadline gets an hour of room, kept inside the hours shown (one at 23:59 sits at the end).
      const s = allDay ? lo * 60 : isMoment(e) ? Math.min(Math.max(e.start, lo * 60), hi * 60 - MOMENT) : e.start;
      return { e, s, f: allDay ? hi * 60 : isMoment(e) ? s + MOMENT : e.end };
    })
    .sort((a, b) => a.s - b.s || b.f - a.f);
  const ends: number[] = [];
  const out = items.map((it) => {
    let lane = ends.findIndex((end) => end <= it.s);
    if (lane === -1) { lane = ends.length; ends.push(it.f); } else ends[lane] = it.f;
    return { ...it, lane, clash: false };
  });
  for (const a of out) a.clash = !isMoment(a.e) && out.some((b) => b !== a && !isMoment(b.e) && b.s < a.f && a.s < b.f);
  return { items: out, lanes: Math.max(1, ends.length) };
}

/** Done, on now or coming up, from the day and the minute now. */
export function statusOf(e: GridEntry, d: Date, today: Date, nowMin: number): Status {
  if (isSameDay(d, today)) {
    if (isMoment(e)) return e.start <= nowMin ? 'done' : 'booked';
    return e.end <= nowMin ? 'done' : e.start <= nowMin ? 'now' : 'booked';
  }
  return d < today ? 'done' : 'booked';
}

const LOOK: Record<Status | 'past', string> = {
  booked: 'bg-[var(--card-bg)] border-zinc-200 dark:border-white/[0.12] text-zinc-900 dark:text-white',
  now: 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900',
  done: 'bg-indigo-600 border-indigo-600 text-white',
  past: 'bg-indigo-500/[0.08] border-indigo-500/20 text-indigo-800 dark:text-indigo-200',
};
const SUB: Record<Status | 'past', string> = {
  booked: 'text-zinc-500 dark:text-zinc-400', now: 'text-zinc-300 dark:text-zinc-600', done: '', past: 'text-indigo-700 dark:text-indigo-300',
};
const SAY: Record<Status, string> = { done: 'done', now: 'on now', booked: 'coming up' };

export function Timeline<T>({ days, today, nowMin, lo, hi, on, when, onOpen, animate, clash }: {
  days: Date[]; today: Date; nowMin: number; lo: number; hi: number;
  on: (d: Date) => GridEntry<T>[];
  /** "9:00 – 10:30 AM" for the screen reader line. */
  when: (e: GridEntry<T>) => string;
  onOpen: (e: GridEntry<T>, d: Date) => void;
  /** The cards settle in one after another (a first look, a new view), not on a swipe to the next week. */
  animate: boolean;
  /** What counts as a clash, when it's more than two things at once (the admin's: a teacher or room twice). */
  clash?: (e: GridEntry<T>) => boolean;
}) {
  const span = (hi - lo) * 60;
  const pct = (m: number) => ((Math.min(hi * 60, Math.max(lo * 60, m)) - lo * 60) / span) * 100;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const laid = days.map((d) => {
    const l = laneDay(on(d), lo, hi);
    if (clash) for (const it of l.items) it.clash = clash(it.e);
    return l;
  });
  const nowShown = days.some((d) => isSameDay(d, today)) && nowMin >= lo * 60 && nowMin <= hi * 60;
  const clashes = laid.some((l) => l.items.some((it) => it.clash));
  let n = 0;

  return (
    <div className="overflow-x-auto overscroll-x-contain" role="region" aria-label="Timeline" tabIndex={0}>
      <div className="px-3 sm:px-4 pt-3 pb-4" style={{ minWidth: `calc(6.5rem + ${hours.length - 1} * 4.5rem)` }}>
        {/* The key, like the reel's */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-zinc-600 dark:text-zinc-300" aria-hidden>
          {clashes && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-amber-400" />Clash</span>}
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-zinc-300 dark:bg-white/25" />Coming up</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-zinc-900 dark:bg-white" />On now</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-indigo-600" />Done</span>
        </div>
        <div className="flex">
          <div className="w-[6.5rem] shrink-0" />
          {/* The hours, and "Now" on them */}
          <div className="relative flex-1 h-7" aria-hidden>
            {hours.filter((h) => !nowShown || Math.abs(h * 60 - nowMin) >= 40).map((h) => (
              <span key={h} className={cn('absolute top-1 text-xs tabular-nums text-zinc-500 dark:text-zinc-400', h === lo ? '' : h === hi ? '-translate-x-full' : '-translate-x-1/2')} style={{ insetInlineStart: `${pct(h * 60)}%` }}>{hh(h * 60)}</span>
            ))}
            {nowShown && (
              <span className="tl-now absolute inset-y-0 inset-x-0 pointer-events-none" style={{ ['--x' as string]: `${pct(nowMin)}%` }}>
                <span className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2 px-1.5 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[11px] font-semibold tabular-nums whitespace-nowrap">Now {hh(nowMin)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            const { items, lanes } = laid[i];
            return (
              <div key={d.toISOString()} role="group" aria-label={format(d, 'EEEE d MMMM')} className={cn('flex', i % 2 === 0 && 'bg-zinc-500/[0.045] dark:bg-white/[0.025]')}>
                <div className="w-[6.5rem] shrink-0 ps-2 py-2.5 leading-tight">
                  <span className={cn('block text-[13px] font-semibold', isToday ? 'text-tint-text' : 'text-zinc-900 dark:text-white')}>{format(d, 'EEE')}{isToday && <span className="font-normal"> · Today</span>}</span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{format(d, 'd MMM')}</span>
                </div>
                <div className="tl-track relative flex-1" style={{ height: lanes * LANE_H + 8, backgroundSize: `calc(100% / ${hi - lo}) 100%` }}>
                  {items.map((it) => {
                    const st = statusOf(it.e, d, today, nowMin);
                    const look = st === 'done' && !isToday ? 'past' : st;
                    const sub = [isMoment(it.e) ? `Due ${hh(it.e.start)}` : null, it.e.subtitle, it.e.location].filter(Boolean).join(' · ');
                    const left = pct(it.s), width = Math.max(pct(it.f) - left, 4);
                    return (
                      <button key={it.e.id} type="button" onClick={() => onOpen(it.e, d)}
                        className={cn('tl-block absolute rounded-md border px-2 py-1 text-start overflow-hidden shadow-[0_1px_2px_rgb(16_24_40/0.06)]', LOOK[look], (it.clash || isMoment(it.e)) && st !== 'now' && 'border-amber-400 dark:border-amber-400/80 ring-1 ring-amber-400/40', animate && 'tl-in')}
                        style={{ insetInlineStart: `${left}%`, width: `calc(${width}% - 3px)`, top: 4 + it.lane * LANE_H, height: LANE_H - 6, ['--i' as string]: n++ }}>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: it.e.color }} />
                          <span className="truncate text-[12.5px] font-semibold leading-4">{it.e.title}</span>
                        </span>
                        {sub && <span className={cn('block truncate text-xs leading-4', SUB[look])}>{sub}</span>}
                        <span className="sr-only">, {when(it.e)}, {SAY[st]}{it.clash ? ', clashes with another' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {nowShown && (
            <div aria-hidden className="absolute inset-y-0 start-[6.5rem] end-0 pointer-events-none">
              <div className="tl-now absolute inset-0" style={{ ['--x' as string]: `${pct(nowMin)}%` }}>
                <div className="absolute inset-y-0 start-0 w-[1.5px] -ms-px bg-zinc-900 dark:bg-white" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Under the timeline, like the reel's two cards: how full each day is, and what's next. */
export function TimelineSummary<T>({ days, today, nowMin, on, when, onOpen }: {
  days: Date[]; today: Date; nowMin: number;
  on: (d: Date) => GridEntry<T>[];
  when: (e: GridEntry<T>) => string;
  onOpen: (e: GridEntry<T>, d: Date) => void;
}) {
  const busy = days.map((d) => {
    const timed = on(d).filter((e) => !isMoment(e) && e.end - e.start < ALL_DAY);
    return { d, mins: timed.reduce((s, e) => s + (e.end - e.start), 0), count: timed.length };
  });
  const most = Math.max(60, ...busy.map((b) => b.mins));
  const next = days
    .flatMap((d) => on(d).map((e) => ({ e, d, st: statusOf(e, d, today, nowMin) })))
    .filter((x) => x.st !== 'done')
    .sort((a, b) => a.d.getTime() - b.d.getTime() || a.e.start - b.e.start)
    .slice(0, 4);
  const pill = (x: { e: GridEntry<T>; d: Date; st: Status }) => {
    if (x.st === 'now') return 'On now';
    if (!isSameDay(x.d, today)) return format(x.d, 'EEE');
    const m = x.e.start - nowMin;
    return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`;
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card">
        <CardHead title="Busy this week" sub="Time in class or at events, day by day" />
        <ul className="space-y-3">
          {busy.map((b) => (
            <li key={b.d.toISOString()} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3">
              <span className={cn('text-[13px] font-medium', isSameDay(b.d, today) ? 'text-tint-text' : 'text-zinc-700 dark:text-zinc-200')}>{format(b.d, 'EEE')}</span>
              <span className="h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.07]"><span className="block h-full rounded-full bg-indigo-600" style={{ width: `${(b.mins / most) * 100}%` }} /></span>
              <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300 text-end">{b.mins >= 60 ? `${Math.round((b.mins / 60) * 10) / 10} h` : `${b.mins} min`} · {b.count} {b.count === 1 ? 'thing' : 'things'}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <CardHead title="Coming up" sub="The next things on your calendar this week" />
        {next.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing else this week.</p> : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {next.map((x) => (
              <li key={`${x.e.id}:${x.d.toISOString()}`}>
                <button type="button" onClick={() => onOpen(x.e, x.d)} className="w-full flex items-center gap-3 py-2.5 text-start rounded-md hover:bg-[var(--fill)] transition-colors">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-zinc-900 dark:text-white">{x.e.title}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{[x.e.subtitle, format(x.d, 'EEE'), when(x.e)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums border', x.st === 'now' ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white' : 'border-zinc-200 dark:border-white/[0.12] text-zinc-600 dark:text-zinc-300')}>{pill(x)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
