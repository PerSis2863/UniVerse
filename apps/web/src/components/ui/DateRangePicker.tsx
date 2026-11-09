'use client';

import { useState } from 'react';
import { addDays, addMonths, differenceInCalendarDays, format, isAfter, isBefore, isSameDay, isSameMonth, parseISO, startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subDays, subMonths } from 'date-fns';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNow } from '@/lib/use-now';
import { useWeekStart, weekdayNames } from '@/lib/use-week-start';
import { cn } from '@/lib/utils';
import { Popover } from './Menu';

// M140: picking a span of days, after the Ballast reels: quick choices down the side (Last 7 days…),
// two months side by side (one on a phone) with the days between the first and the last on a band,
// the span written out underneath, then Cancel or Apply. Nothing changes until Apply. Arrow keys move
// through the days. Dates go in and out as "yyyy-MM-dd" ('' = open), like a date field's.

export interface DayRange { from: string; to: string }
export interface RangePreset { id: string; label: string; range: (today: Date) => [Date, Date] }

/** For filters over what has happened. */
export const PAST_PRESETS: RangePreset[] = [
  { id: 'today', label: 'Today', range: (t) => [t, t] },
  { id: '7', label: 'Last 7 days', range: (t) => [subDays(t, 6), t] },
  { id: '30', label: 'Last 30 days', range: (t) => [subDays(t, 29), t] },
  { id: '90', label: 'Last 90 days', range: (t) => [subDays(t, 89), t] },
  { id: '365', label: 'Last 12 months', range: (t) => [addDays(subMonths(t, 12), 1), t] },
  { id: 'q', label: 'This quarter', range: (t) => [startOfQuarter(t), t] },
  { id: 'ytd', label: 'Year to date', range: (t) => [startOfYear(t), t] },
];

const ISO = 'yyyy-MM-dd';
const read = (s: string) => (s ? startOfDay(parseISO(s)) : null);
const written = (a: Date, b: Date) => `${format(a, isSameDay(a, b) || a.getFullYear() === b.getFullYear() ? 'MMM d' : 'MMM d, yyyy')} to ${format(b, 'MMM d, yyyy')}`;

/** The quick choice a span is, if any. */
function presetOf(presets: RangePreset[], from: Date | null, to: Date | null, today: Date) {
  if (!from || !to) return null;
  return presets.find((p) => { const [a, b] = p.range(today); return isSameDay(a, from) && isSameDay(b, to); }) ?? null;
}

export function DateRangePicker({ value, onChange, label = 'Dates', presets = PAST_PRESETS, clearable = false, className }: {
  value: DayRange;
  onChange: (v: DayRange) => void;
  /** What the dates are for, e.g. "Term dates" (the button's name starts with it). */
  label?: string;
  /** The quick choices down the side; [] for none (dates in a form). */
  presets?: RangePreset[];
  /** A "Clear" (any dates) for a filter. */
  clearable?: boolean;
  className?: string;
}) {
  const ms = useNow();
  const today = startOfDay(new Date(ms));
  const from = read(value.from), to = read(value.to);
  const chosen = ms ? presetOf(presets, from, to, today) : null;
  const text = chosen ? chosen.label : from && to ? written(from, to) : from ? `From ${format(from, 'MMM d, yyyy')}` : 'Any dates';
  return (
    <Popover label={`${label}: ${text}`} title={label} panelClass="w-[min(44rem,calc(100vw-1rem))]"
      className={cn('h-9 px-3 gap-2 rounded-lg border border-zinc-200 dark:border-white/[0.12] bg-[var(--card-bg)] text-[13.5px] font-medium text-zinc-900 dark:text-white whitespace-nowrap', className)}
      button={<><CalendarDays className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden />{text}<ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden /></>}>
      {(close) => <Panel value={value} today={today} presets={presets} clearable={clearable} onDone={(v) => { if (v) onChange(v); close(); }} />}
    </Popover>
  );
}

function Panel({ value, today, presets, clearable, onDone }: { value: DayRange; today: Date; presets: RangePreset[]; clearable: boolean; onDone: (v: DayRange | null) => void }) {
  const first = useWeekStart();
  const [from, setFrom] = useState(() => read(value.from));
  const [to, setTo] = useState(() => read(value.to));
  const [hover, setHover] = useState<Date | null>(null);
  // The left month: the one before the span's end, so the end shows on the right (as in the reel).
  const [month, setMonth] = useState(() => startOfMonth(subMonths(read(value.to) ?? read(value.from) ?? today, 1)));
  const [dir, setDir] = useState(0);
  const chosen = presetOf(presets, from, to, today);

  const turn = (by: number) => { setDir(by); setMonth((m) => addMonths(m, by)); };
  const show = (d: Date) => {
    if (isBefore(d, month)) turn(-1);
    else if (!isBefore(d, addMonths(month, 2))) turn(1);
  };
  const pick = (d: Date) => {
    if (!from || to) { setFrom(d); setTo(null); }
    else if (isBefore(d, from)) { setTo(from); setFrom(d); }
    else setTo(d);
  };
  const applyPreset = (p: RangePreset) => {
    const [a, b] = p.range(today);
    setFrom(a); setTo(b); setDir(0);
    setMonth(startOfMonth(subMonths(b, 1)));
  };
  // The band: from the first day to the last (or the day under the pointer while picking the last).
  const end = to ?? (from && hover && !isBefore(hover, from) ? hover : null);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const at = (document.activeElement as HTMLElement | null)?.dataset.day;
    if (!step || !at) return;
    e.preventDefault();
    const box = e.currentTarget;
    const next = addDays(parseISO(at), document.dir === 'rtl' && Math.abs(step) === 1 ? -step : step);
    const sel = `[data-in][data-day="${format(next, ISO)}"]`;
    const there = box.querySelector<HTMLElement>(sel);
    if (there) there.focus();
    else { show(next); requestAnimationFrame(() => box.querySelector<HTMLElement>(sel)?.focus()); }
  };
  const days = from && (to ?? from) ? differenceInCalendarDays(to ?? from, from) + 1 : 0;
  // One stop for Tab in the months (the arrow keys go on from there): the first day, else today, else the 1st.
  const seen = (d: Date | null) => !!d && !isBefore(d, month) && isBefore(d, addMonths(month, 2));
  const stop = seen(from) ? from! : seen(today) ? today : month;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col sm:flex-row">
        {presets.length > 0 && (
          <ul className="flex sm:flex-col gap-0.5 p-2 sm:w-44 shrink-0 overflow-x-auto sm:overflow-visible border-b sm:border-b-0 sm:border-e border-zinc-200 dark:border-white/[0.08]" aria-label="Quick choices">
            {presets.map((p) => (
              <li key={p.id} className="shrink-0">
                <button type="button" onClick={() => applyPreset(p)} aria-pressed={chosen?.id === p.id}
                  className={cn('w-full flex items-center justify-between gap-3 px-2.5 h-8 rounded-md text-[13px] text-start whitespace-nowrap transition-colors', chosen?.id === p.id ? 'bg-zinc-100 dark:bg-white/[0.08] font-semibold text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.05]')}>
                  {p.label}{chosen?.id === p.id && <Check className="w-3.5 h-3.5" aria-hidden />}
                </button>
              </li>
            ))}
            <li className="shrink-0">
              <span className={cn('flex items-center justify-between px-2.5 h-8 rounded-md text-[13px] whitespace-nowrap', !chosen && from ? 'bg-zinc-100 dark:bg-white/[0.08] font-semibold text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400')}>
                Custom{!chosen && from && <Check className="w-3.5 h-3.5" aria-hidden />}
              </span>
            </li>
          </ul>
        )}
        <div className="flex-1 min-w-0 p-3 sm:p-4" onKeyDown={onKey} onPointerLeave={() => setHover(null)}>
          <div className="relative z-10 flex items-center justify-between mb-1 pointer-events-none [&>button]:pointer-events-auto">
            <button type="button" onClick={() => turn(-1)} aria-label="Previous month" className="btn-ghost btn-icon rounded-full w-8 h-8"><ChevronLeft className="w-4 h-4 rtl:rotate-180" /></button>
            <button type="button" onClick={() => turn(1)} aria-label="Next month" className="btn-ghost btn-icon rounded-full w-8 h-8"><ChevronRight className="w-4 h-4 rtl:rotate-180" /></button>
          </div>
          <div key={format(month, 'yyyy-MM')} className="drp-months -mt-9 grid sm:grid-cols-2 gap-6" data-dir={dir > 0 ? 'next' : dir < 0 ? 'back' : undefined}>
            {[month, addMonths(month, 1)].map((m, i) => (
              <Month key={i} month={m} first={first} today={today} stop={stop} from={from} end={end} picking={!!from && !to} className={i ? 'hidden sm:block' : undefined}
                onPick={pick} onHover={setHover} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-zinc-200 dark:border-white/[0.08]">
        <p className="me-auto text-[13px] text-zinc-900 dark:text-white" aria-live="polite">
          {from ? <>{written(from, to ?? from)} <span className="text-zinc-500 dark:text-zinc-400">{to ? `${days} day${days === 1 ? '' : 's'}` : '· now pick the last day'}</span></> : <span className="text-zinc-500 dark:text-zinc-400">Pick the first day</span>}
        </p>
        {clearable && (value.from || value.to) && <button type="button" onClick={() => onDone({ from: '', to: '' })} className="btn-ghost btn-sm">Clear</button>}
        <button type="button" onClick={() => onDone(null)} className="btn-secondary btn-sm">Cancel</button>
        <button type="button" disabled={!from} onClick={() => from && onDone({ from: format(from, ISO), to: format(to ?? from, ISO) })} className="btn-primary btn-sm">Apply</button>
      </div>
    </div>
  );
}

function Month({ month, first, today, stop, from, end, picking, onPick, onHover, className }: {
  month: Date; first: 0 | 1; today: Date; stop: Date; from: Date | null; end: Date | null; picking: boolean;
  onPick: (d: Date) => void; onHover: (d: Date) => void; className?: string;
}) {
  const start = startOfWeek(month, { weekStartsOn: first });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const last = end ?? from;
  return (
    <div className={className}>
      <p className="h-8 grid place-items-center text-[13px] font-semibold text-zinc-900 dark:text-white mb-1">{format(month, 'MMMM yyyy')}</p>
      <div className="grid grid-cols-7 mb-1" aria-hidden>
        {weekdayNames(first).map((n) => <span key={n} className="h-7 grid place-items-center text-[11px] text-zinc-500 dark:text-zinc-400">{n.slice(0, 2)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          const inMonth = isSameMonth(d, month);
          const isEnd = inMonth && ((from && isSameDay(d, from)) || (last && isSameDay(d, last)));
          const inBand = inMonth && !!from && !!last && !isBefore(d, from) && !isAfter(d, last) && !isSameDay(from, last);
          const col = i % 7;
          const bandStart = inBand && (isSameDay(d, from!) || col === 0 || d.getDate() === 1);
          const bandEnd = inBand && (isSameDay(d, last!) || col === 6 || isSameMonth(addDays(d, 1), month) === false);
          return (
            <div key={i} className={cn('drp-cell h-9', inBand && 'bg-indigo-500/[0.14] dark:bg-indigo-400/[0.16]', bandStart && 'rounded-s-lg', bandEnd && 'rounded-e-lg')}>
              <button type="button" data-day={format(d, ISO)} data-in={inMonth ? '' : undefined} tabIndex={inMonth && isSameDay(d, stop) ? 0 : -1}
                onClick={() => onPick(d)} onPointerEnter={() => picking && onHover(d)} onFocus={() => picking && onHover(d)}
                aria-pressed={!!isEnd} aria-current={isSameDay(d, today) ? 'date' : undefined}
                className={cn('drp-day w-full h-full rounded-lg text-[13px] tabular-nums transition-[background-color,color,transform] duration-150',
                  isEnd ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold' : inMonth ? 'text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08]' : 'text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-white/[0.04]',
                  isSameDay(d, today) && !isEnd && 'ring-1 ring-inset ring-zinc-300 dark:ring-white/25')}>
                <span aria-hidden>{d.getDate()}</span><span className="sr-only">{format(d, 'EEEE d MMMM yyyy')}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
