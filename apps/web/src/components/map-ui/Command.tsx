'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Check, Clock, Loader2, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// M262 (the owner, 17 Nov, with a screen recording of a logistics "command" dashboard: "make me a exact same design
// and animations and ui in the trace and relief and travel app and where ever it feels to fitted because it contains
// map"): the recording's parts, made once for every map. A row of filter chips with counts over the map, number cards
// along the map's foot (a tick strip, a line, faces, a pill), cards pinned to places on the map, an accent pill on a
// route, the "needs you" queue card (who suggests it and when, what, three facts, why, an approve button), the
// "what changes" sheet (now against after, the steps that run once approved ticking off one by one, Approved), and a
// dark toast with Undo. Each app's own colour is the accent (`--cmd`, set by `.cmd-relief` / `.cmd-trace` /
// `.cmd-travel` in globals.css): Relief's orange is the recording's. Motion: CSS only (transform and opacity).

/** Filter chips over the map: the chosen one ink with its count, the others white with a coloured dot. */
export function CountChips<T extends string>({ items, value, onChange, label, className }: {
  items: { id: T; label: string; count?: number; dot?: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-white/95 p-1 shadow-[0_6px_24px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/5 [scrollbar-width:none] dark:bg-[#1b1d22]/95 dark:ring-white/10', className)}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(it.id)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150',
              on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]')}>
            {!on && it.dot && <span className="h-2 w-2 rounded-full" style={{ background: it.dot }} aria-hidden />}
            {it.label}
            {it.count != null && <span className={cn('rounded-md px-1.5 py-px text-[11px] tabular-nums', on ? 'bg-white/20 dark:bg-zinc-900/15' : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300')}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The number cards along the foot of the map (two across on a phone, four on a computer). */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  // On a phone they're left out (the owner, 17 Nov: the maps felt busy; the chips over the map carry the counts); a
  // tablet one row that scrolls sideways; a computer four across.
  return <div className={cn('hidden gap-2 overflow-x-auto [scrollbar-width:none] sm:flex lg:grid lg:grid-cols-4 lg:overflow-visible', className)}>{children}</div>;
}
/** One number card: its name and icon, the number (and a word after it), and a small picture under it. */
export function StatCard({ label, icon: Icon, value, unit, tone, foot, delay = 0 }: {
  label: string; icon: LucideIcon; value: ReactNode; unit?: string; tone?: 'accent'; foot?: ReactNode; delay?: number;
}) {
  return (
    <div className="cmd-pop w-[10.5rem] min-w-0 shrink-0 rounded-2xl bg-white/95 px-3.5 pb-3 pt-2.5 lg:w-auto shadow-[0_8px_28px_-14px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:bg-[#1b1d22]/95 dark:ring-white/10" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
        <Icon className={cn('h-4 w-4 shrink-0', tone === 'accent' ? 'text-[var(--cmd-ink)]' : 'text-zinc-500 dark:text-zinc-400')} aria-hidden />
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-[26px] font-semibold leading-none tracking-tight tabular-nums', tone === 'accent' ? 'text-[var(--cmd-ink)]' : 'text-zinc-900 dark:text-white')}>{value}</span>
        {unit && <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{unit}</span>}
      </p>
      {foot && <div className="mt-2">{foot}</div>}
    </div>
  );
}
/** Thin upright ticks, one per item, coloured by its kind (the recording's "42 of 58"). */
export function TickStrip({ parts, max = 48 }: { parts: { n: number; color: string }[]; max?: number }) {
  const total = parts.reduce((t, p) => t + p.n, 0), scale = total > max ? max / total : 1;
  const ticks = parts.flatMap((p) => Array.from({ length: Math.round(p.n * scale) }, () => p.color));
  return (
    <div className="flex h-4 items-end gap-[2px] overflow-hidden" aria-hidden>
      {ticks.length ? ticks.map((c, i) => <span key={i} className="h-full w-[2px] shrink-0 rounded-full" style={{ background: c }} />) : <span className="h-full w-full rounded bg-zinc-100 dark:bg-white/[0.06]" />}
    </div>
  );
}
/** A small line of the last days, ending in an accent dot. */
export function MiniLine({ values }: { values: number[] }) {
  const W = 120, H = 22, max = Math.max(1, ...values), n = Math.max(2, values.length);
  const pts = (values.length ? values : [0, 0]).map((v, i) => [(i / (n - 1)) * W, H - 3 - (v / max) * (H - 6)] as const);
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[22px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" className="text-zinc-800 dark:text-zinc-200" />
      <circle cx={end[0]} cy={end[1]} r={2.6} className="fill-[var(--cmd)]" />
    </svg>
  );
}
/** The ink pill under a number ("5 need you ›"). */
export function InkPill({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-900 py-1 pe-2 ps-2.5 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cmd)]" aria-hidden /><span className="truncate">{children}</span>
    </button>
  );
}

/** A card pinned to a place on the map. The map moves it (`placeCallout`) from its own frame: no React render a frame. */
export function Callout({ ref, children, className }: { ref: React.Ref<HTMLDivElement>; children: ReactNode; className?: string }) {
  return (
    <div ref={ref} className={cn('pointer-events-auto absolute start-0 top-0 z-10 w-64 will-change-transform', className)} style={{ transform: 'translate3d(-9999px,0,0)' }}>
      <div className="cmd-pop rounded-2xl bg-white p-3.5 text-zinc-900 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.4)] ring-1 ring-black/5 dark:bg-[#1b1d22] dark:text-white dark:ring-white/10">{children}</div>
    </div>
  );
}
/** Put a pinned card beside its place (`x`, `y` on the map), on the side with room, kept inside the map. */
export function placeCallout(el: HTMLElement | null, x: number, y: number, w: number, h: number, gap = 22, room = w) {
  if (!el) return;
  const cw = el.offsetWidth || 256, ch = el.offsetHeight || 120;
  // `room`: how much of the map's width is clear (a side card may cover the rest).
  const left = x + gap + cw < room - 8 ? x + gap : x - gap - cw;
  const top = Math.max(8, Math.min(h - ch - 8, y - ch / 2));
  const off = x < -40 || y < -40 || x > w + 40 || y > h + 40;
  el.style.transform = off ? 'translate3d(-9999px,0,0)' : `translate3d(${Math.round(Math.max(8, left))}px,${Math.round(top)}px,0)`;
}
/** The accent pill on a route ("Via TX-6, saves 38 min"). Placed like a callout. */
export function RoutePill({ icon: Icon, children, tone = 'accent' }: { icon?: LucideIcon; children: ReactNode; tone?: 'accent' | 'ink' }) {
  return (
    <span className={cn('cmd-pop inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg', tone === 'accent' ? 'bg-[var(--cmd-fill)]' : 'bg-zinc-900 dark:bg-zinc-800')}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--cmd)]" aria-hidden />}{children}
    </span>
  );
}

export type Fact = { k: string; v: ReactNode; sub?: ReactNode };
/** A "needs you" card: who suggests it and when (and by when), what, three facts, why, and the approve button. */
export function QueueCard({ icon: Icon, source, ago, due, title, facts, note, noteIcon: NoteIcon, hot, chosen, links, approve, onOpen }: {
  icon: LucideIcon; source: string; ago?: string; due?: string; title: ReactNode; facts: Fact[]; note?: ReactNode; noteIcon?: LucideIcon;
  hot?: boolean; chosen?: boolean; links?: ReactNode; approve?: { label: string; onClick: () => void; busy?: boolean } | null; onOpen?: () => void;
}) {
  return (
    <article className={cn('rounded-2xl bg-white p-4 shadow-[0_6px_22px_-14px_rgba(0,0,0,0.35)] ring-1 transition-[box-shadow] duration-200 dark:bg-[#1b1d22]',
      hot || chosen ? 'ring-[1.5px] ring-[var(--cmd)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--cmd)_14%,transparent),0_10px_30px_-16px_rgba(0,0,0,0.4)]' : 'ring-black/[0.06] dark:ring-white/10')}>
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <span className="flex items-center gap-2 text-[13px]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--cmd)_14%,transparent)] text-[var(--cmd-ink)]"><Icon className="h-4 w-4" aria-hidden /></span>
          <span className="truncate font-semibold text-zinc-900 dark:text-white">{source}</span>
          {ago && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{ago}</span>}
          {due && <span className="ms-auto inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--cmd-ink)]"><Clock className="h-3.5 w-3.5" aria-hidden />{due}</span>}
        </span>
        <span className="mt-2.5 block text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white">{title}</span>
      </button>
      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-3 divide-x divide-zinc-200/80 overflow-hidden rounded-xl bg-zinc-50 dark:divide-white/10 dark:bg-white/[0.04] rtl:divide-x-reverse">
          {facts.slice(0, 3).map((f) => (
            <div key={f.k} className="min-w-0 px-3 py-2.5">
              <dt className="truncate text-xs text-zinc-500 dark:text-zinc-400">{f.k}</dt>
              <dd className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-white">{f.v}</dd>
              {f.sub && <dd className="truncate text-xs text-zinc-500 dark:text-zinc-400">{f.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      {note && <p className="mt-3 hidden items-start gap-2 text-[13px] sm:flex text-zinc-600 dark:text-zinc-300">{NoteIcon && <NoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />}<span className="line-clamp-2">{note}</span></p>}
      {(links || approve) && (
        <div className="mt-3 flex items-center gap-3 border-t border-zinc-200/70 pt-3 text-sm dark:border-white/10">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-zinc-600 dark:text-zinc-300">{links}</div>
          {approve && (
            <button type="button" disabled={approve.busy} onClick={approve.onClick} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 text-[13px] font-semibold text-white transition-[background-color] duration-150 hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
              {approve.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{approve.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export type Change = { k: string; now: ReactNode; next: ReactNode; nowWarn?: boolean };
/** A step: `now` runs on approval (ticks off), `ready` was already checked, `later` happens afterwards. */
export type PlanStep = { who: string; what: ReactNode; before: string; after: string; when: 'now' | 'ready' | 'later' };
/** The "what changes" sheet: now against after, the steps that run once approved (they tick off one by one), and
 *  Approve, which turns into Approved. `onApprove` does the real work and says whether it worked. */
export function ProposalSheet({ app, open, onClose, icon: Icon, source, ago, title, due, changes, steps, note, noteIcon: NoteIcon, approveLabel, onApprove, secondary }: {
  /** Whose colours (the sheet opens over the whole page, outside the app's `.cmd-*` box). */
  app: 'relief' | 'trace' | 'travel'; open: boolean; onClose: () => void; icon: LucideIcon; source: string; ago?: string; title: ReactNode; due?: string;
  changes: Change[]; steps: PlanStep[]; note?: ReactNode; noteIcon?: LucideIcon; approveLabel: string; onApprove: () => Promise<boolean>; secondary?: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'ticking' | 'done'>('idle');
  const [ticked, setTicked] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [open, onClose]);
  // Once approved, the steps that run now tick off one after another, then the button says Approved.
  useEffect(() => {
    if (state !== 'ticking') return;
    const now = steps.filter((s) => s.when === 'now').length;
    if (ticked >= now) { const t = setTimeout(() => setState('done'), 160); return () => clearTimeout(t); }
    const t = setTimeout(() => setTicked((n) => n + 1), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
    return () => clearTimeout(t);
  }, [state, ticked, steps]);
  if (!open || typeof document === 'undefined') return null;
  const approve = async () => {
    setState('busy');
    if (await onApprove()) { setTicked(0); setState('ticking'); } else setState('idle');
  };
  let order = 0;
  return createPortal(
    <div className={`cmd-${app} fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : source}
        className="cmd-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] bg-white text-zinc-900 shadow-2xl outline-none dark:bg-[#17191e] dark:text-white sm:max-w-[30rem] sm:rounded-[1.6rem]">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--cmd)_14%,transparent)] text-[var(--cmd-ink)]"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="font-semibold">{source}</span>{ago && <span className="text-zinc-500 dark:text-zinc-400">{ago}</span>}
            <button type="button" onClick={onClose} className="ms-auto flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight">{title}</h2>
          {due && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--cmd)_12%,transparent)] px-2.5 py-1 text-[13px] font-semibold text-[var(--cmd-ink)]"><Clock className="h-3.5 w-3.5" aria-hidden />{due}</p>}
          <h3 className="mt-5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">What changes</h3>
          <table className="mt-2 w-full overflow-hidden rounded-xl text-sm ring-1 ring-zinc-200 dark:ring-white/10">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400"><tr><th className="px-3 py-2 text-start font-medium"><span className="sr-only">What</span></th><th className="px-3 py-2 text-start font-medium">Now</th><th className="px-3 py-2 text-start font-medium">After</th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.k} className="border-t border-zinc-200/70 dark:border-white/10">
                  <th scope="row" className="px-3 py-2.5 text-start font-normal text-zinc-600 dark:text-zinc-300">{c.k}</th>
                  <td className={cn('px-3 py-2.5', c.nowWarn ? 'font-medium text-[var(--cmd-ink)]' : 'text-zinc-700 dark:text-zinc-200')}>{c.now}</td>
                  <td className="bg-[color-mix(in_srgb,var(--cmd)_10%,transparent)] px-3 py-2.5 font-semibold">{c.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">What happens, in {steps.length} steps</h3>
          <ol className="mt-2">
            {steps.map((s, i) => {
              const runsNow = s.when === 'now', n = runsNow ? order++ : -1, done = s.when === 'ready' || (runsNow && ((state === 'ticking' && n < ticked) || state === 'done'));
              return (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < steps.length - 1 && <span className="absolute start-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-zinc-200 dark:bg-white/10" aria-hidden />}
                  <span className={cn('relative flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-200',
                    done ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : runsNow ? 'bg-[color-mix(in_srgb,var(--cmd)_14%,transparent)] text-[var(--cmd-ink)]' : 'bg-white ring-1 ring-zinc-300 dark:bg-transparent dark:ring-white/20')}>
                    {done ? <Check key="d" className="cmd-pop h-3.5 w-3.5" aria-hidden /> : runsNow ? <Clock className="h-3.5 w-3.5" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" aria-hidden />}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{s.who}</p>
                    <p className="text-[15px] font-medium">{s.what}</p>
                    <p className={cn('text-[13px]', done ? 'text-zinc-500 dark:text-zinc-400' : runsNow ? 'text-[var(--cmd-ink)]' : 'text-zinc-500 dark:text-zinc-400')}>{done ? s.after : s.before}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {note && <p className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-50 px-3.5 py-3 text-[13px] text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200">{NoteIcon && <NoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />}<span>{note}</span></p>}
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-200/70 px-5 py-3.5 dark:border-white/10">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10">{state === 'done' ? 'Close' : 'Not now'}</button>
          {secondary}
          <button type="button" disabled={state === 'busy' || state === 'ticking'} onClick={() => (state === 'done' ? onClose() : void approve())} aria-live="polite"
            className="ms-auto inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-5 text-[15px] font-semibold text-white transition-[background-color] duration-150 hover:bg-zinc-800 disabled:hover:bg-zinc-900 dark:bg-white dark:text-zinc-900">
            {state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}{state === 'done' ? 'Approved' : state === 'ticking' ? 'Working…' : approveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The dark toast with Undo at the foot of the map ("Reroute approved. … Undo"). */
export function undoToast(text: string, onUndo: () => void) {
  toast(text, { duration: 8000, action: { label: 'Undo', onClick: onUndo } });
}

/** M350 (the owner, 20 Nov: every map like Apple Maps): a map's buttons as Apple Maps groups them, one rounded column with
 *  hairlines between, white (near-black in dark mode); `on` marks a button that's switched on in Apple's blue. */
export function MapButtons<Id extends string = string>({ items, onPick, className }: { items: { id?: Id; label: string; icon: LucideIcon; onClick?: () => void; on?: boolean }[]; onPick?: (id: Id) => void; className?: string }) {
  return (
    <div role="group" aria-label="Map controls" className={cn('flex flex-col divide-y divide-zinc-200 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 dark:divide-white/10 dark:bg-[#1c1e21] dark:ring-white/10', className)}>
      {items.map(({ id, label, icon: Icon, onClick, on }) => (
        <button key={label} type="button" aria-label={label} title={label} aria-pressed={on} onClick={() => (onClick ? onClick() : id && onPick?.(id))}
          className={cn('grid h-11 w-11 place-items-center transition-colors duration-150', on ? 'bg-[#0a84ff] text-white' : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]')}>
          <Icon className="h-5 w-5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

