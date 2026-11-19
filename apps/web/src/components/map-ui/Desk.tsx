'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, Loader2, Search, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { useBareChrome } from '@/lib/chrome';
import Link from '@/components/ui/Link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// M330 (the owner, 18 Nov 2026, with a logistics dashboard picture: "make design of ui like this so there are no extra
// spaces are left and specially the map position and design like that… where ever it will be needed or maps are
// there"): one screen, no gaps. Cards down the start side (a progress card, a distribution with tick bars, a chart),
// the map at the top of the other side with a search pill and a sort pill over it, and the table of what's on the map
// under it (tabs in its head, rows that scroll inside it). On a computer the desk fills the window below the page's
// top; on a phone the map fills the screen and the rest opens in a sheet from a slim line under it.

const wide = () => window.matchMedia('(min-width: 1024px)').matches;
/** Whether the desk is laid out for a computer (1024 px and wider). */
function useWide() {
  return useSyncExternalStore((f) => { const q = window.matchMedia('(min-width: 1024px)'); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, wide, () => true);
}

/** The desk: `side` cards, the `map` card and the `table` card, with the page's `tools` (filters) above them.
 *  On a phone (the owner, 19 Nov: "in mobile it should show map only… important information but it should not take a
 *  lot of space") the map takes the screen (no top bar, useBareChrome) with one slim `peek` line under it; the tools,
 *  the cards and the table open in a sheet from it. */
export function MapDesk({ side, map, table, tools, peek, title, className }: {
  side: ReactNode; map: ReactNode; table: ReactNode; tools?: ReactNode; peek?: ReactNode; title?: string; className?: string;
}) {
  const desk = useWide();
  const [open, setOpen] = useState(false);
  useBareChrome(!desk);
  if (!desk) return (
    <div className={cn('map-desk-phone space-y-2', className)}>
      <div className="h-[calc(100dvh-18rem+var(--bare-gain))] min-h-[20rem]">{map}</div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="desk-card flex h-11 w-full items-center gap-2 px-3.5 text-start text-sm">
        <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100">{peek}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-zinc-900 dark:text-white"><SlidersHorizontal className="h-4 w-4" aria-hidden />Details</span>
      </button>
      {open && (
        <Sheet title={title ?? 'Details'} onClose={() => setOpen(false)}>
          <div className={cn('space-y-2.5', className)}>
            {tools}
            {table}
            {side}
          </div>
        </Sheet>
      )}
    </div>
  );
  return (
    <div className="space-y-2.5">
      {tools}
      <div className={cn('map-desk grid grid-cols-[minmax(17.5rem,30%)_minmax(0,1fr)] grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)] gap-2.5', className)}>
        <div className="row-span-2 flex min-h-0 flex-col gap-2.5 overflow-y-auto [scrollbar-width:thin]">{side}</div>
        <div className="min-h-0">{map}</div>
        <div className="min-h-0">{table}</div>
      </div>
    </div>
  );
}

/** A card on the desk: a title, an optional ↗ to its own page, what's in it. */
export function DeskCard({ title, href, hrefLabel, children, className, grow }: { title: string; href?: string; hrefLabel?: string; children: ReactNode; className?: string; grow?: boolean }) {
  return (
    <section className={cn('desk-card flex flex-col p-4', grow && 'lg:flex-1', className)} aria-label={title}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
        {href && <Link href={href} className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white" aria-label={hrefLabel ?? `Open ${title}`}><ArrowUpRight className="h-4 w-4" aria-hidden /></Link>}
      </header>
      {children}
    </section>
  );
}

/** A distribution as rows of tick bars (the picture's "by type"): icon, name, count, ticks, share. Rows can be
 *  pressed to filter (`on` marks the chosen ones). */
export function TickRows<T extends string>({ rows, onPick, label }: {
  rows: { id: T; label: string; icon?: LucideIcon; n: number; on?: boolean }[]; onPick?: (id: T) => void; label: string;
}) {
  const total = rows.reduce((t, r) => t + r.n, 0) || 1, top = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-1" aria-label={label}>
      {rows.map((r) => {
        const pct = Math.round((r.n / total) * 100), Icon = r.icon;
        const body = (
          <>
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-zinc-700 dark:text-zinc-200" aria-hidden />}
            <span className="w-24 shrink-0 truncate text-start text-sm text-zinc-800 dark:text-zinc-100">{r.label}</span>
            <span className="w-8 shrink-0 text-end text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{r.n}</span>
            <span className="relative h-3.5 min-w-0 flex-1" aria-hidden>
              <span className="desk-ticks absolute inset-0 opacity-25" />
              <span className="desk-ticks absolute inset-y-0 start-0" style={{ width: `${(r.n / top) * 100}%` }} />
            </span>
            <span className="w-10 shrink-0 text-end text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{pct}%</span>
          </>
        );
        return (
          <li key={r.id}>
            {onPick ? (
              <button type="button" aria-pressed={!!r.on} onClick={() => onPick(r.id)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-white/[0.05]', r.on && 'bg-[var(--cmd-soft,rgb(0_0_0/0.05))] ring-1 ring-[var(--cmd,#18181b)]/30')}>{body}</button>
            ) : <div className="flex items-center gap-2.5 px-1.5 py-1.5">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** The progress card's scale: 0% … 100% with a marker and a sentence under it. */
export function DeskGauge({ value, note }: { value: number; note: ReactNode }) {
  const v = Math.max(0, Math.min(1, value)), pct = Math.round(v * 100);
  return (
    <div>
      <div className="relative mt-9">
        <div className="h-1.5 rounded-full bg-gradient-to-r from-zinc-200 via-[var(--cmd,#71717a)]/50 to-[var(--cmd,#18181b)] dark:from-white/10" />
        <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${pct}%` }}>
          <span className="absolute bottom-full start-1/2 mb-2 -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-900 shadow ring-1 ring-black/5 rtl:translate-x-1/2 dark:bg-zinc-800 dark:text-white">{pct}%</span>
          <span className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-zinc-900 shadow dark:border-zinc-900 dark:bg-white" />
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"><span>0%</span><span>100%</span></div>
      <p className="mt-1 text-center text-sm text-zinc-600 dark:text-zinc-300">{note}</p>
    </div>
  );
}

/** Chips with a number (the picture's "Electronics 245kg"). */
export function DeskChips({ items }: { items: { label: string; n: ReactNode; icon?: LucideIcon }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => { const Icon = it.icon; return (
        <span key={it.label} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200">
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}{it.label}<span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{it.n}</span>
        </span>
      ); })}
    </div>
  );
}

/** The search pill over the map: a town, a street or a place, found (OpenStreetMap) and flown to. */
export function MapSearch({ onFound, placeholder = 'Search a place', className }: {
  onFound: (p: { lat: number; lon: number; box: [number, number, number, number] | null; name: string }) => void; placeholder?: string; className?: string;
}) {
  const [q, setQ] = useState(''), [busy, setBusy] = useState(false);
  const find = async () => {
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    try {
      const { data } = await api.get<{ lat: number; lon: number; box: [number, number, number, number] | null; name: string | null }>(`/travel/where?q=${encodeURIComponent(term)}`);
      onFound({ ...data, name: data.name ?? term });
    } catch { toast.error('That place wasn’t found. Try a town or a full address.'); } finally { setBusy(false); }
  };
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); void find(); }}
      className={cn('flex h-10 items-center gap-2 rounded-full bg-white/95 ps-3.5 pe-1.5 shadow-[0_6px_24px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:bg-[#1b1d22]/95 dark:ring-white/10', className)}>
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-hidden /> : <Search className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-300" aria-hidden />}
      <label className="sr-only" htmlFor="map-search">{placeholder}</label>
      <input id="map-search" value={q} onChange={(e) => setQ(e.target.value.slice(0, 120))} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-white dark:placeholder:text-zinc-400" />
    </form>
  );
}

/** The sort pill over the map ("Sort by  Most urgent ⌄"). */
export function SortPill<T extends string>({ value, onChange, options, label = 'Sort by', className }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label?: string; className?: string }) {
  return (
    <label className={cn('flex h-10 items-center gap-1.5 rounded-full bg-white/95 ps-3.5 pe-2 text-sm shadow-[0_6px_24px_-10px_rgba(0,0,0,0.3)] ring-1 ring-black/5 dark:bg-[#1b1d22]/95 dark:ring-white/10', className)}>
      <span className="text-zinc-600 dark:text-zinc-300">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="cursor-pointer appearance-none bg-transparent pe-1 font-semibold text-zinc-900 outline-none dark:text-white">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-600 dark:text-zinc-300" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </label>
  );
}

/** The table card under the map: its title, tabs (pills, the chosen one filled), tools, then the rows, scrolling
 *  inside it on a computer (a list a keyboard can scroll). `head` names the columns (shown from `sm` up). */
export function DeskTable<T extends string>({ title, tabs, value, onChange, tools, head, cols, children, empty }: {
  title: string; tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; tools?: ReactNode;
  head: string[]; cols: string; children: ReactNode; empty?: ReactNode;
}) {
  return (
    <section className="desk-card flex h-full max-h-[78vh] min-h-0 flex-col overflow-hidden lg:max-h-none" aria-label={title}>
      <header className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3.5">
        <h2 className="me-auto text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
        <div role="radiogroup" aria-label={`Show ${title.toLowerCase()}`} className="flex max-w-full gap-0.5 overflow-x-auto rounded-full p-0.5 ring-1 ring-zinc-200 [scrollbar-width:none] dark:ring-white/10">
          {tabs.map((t) => { const on = t.id === value; return (
            <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.id)}
              className={cn('shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-150', on ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]')}>
              {t.label}{t.count != null && <span className={cn('ms-1.5 tabular-nums', on ? 'opacity-80' : 'text-zinc-500 dark:text-zinc-400')}>{t.count}</span>}
            </button>
          ); })}
        </div>
        {tools}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The column names are for the eye; each row reads as one item of the list. */}
        <div aria-hidden className={cn('hidden border-y border-zinc-200/80 px-4 py-2 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400 sm:grid', cols)}>
          {head.map((h, i) => <span key={h || i} className={cn(i === head.length - 1 && 'text-end')}>{h}</span>)}
        </div>
        <div role="list" aria-label={title} tabIndex={0} className="min-h-0 flex-1 divide-y divide-zinc-200/80 overflow-y-auto outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50 dark:divide-white/10">{children}</div>
        {empty}
      </div>
    </section>
  );
}

/** A row of the desk's table: a grid on a computer, two lines on a phone (its first cell holds the row's button). */
export function DeskRow({ cols, children, chosen }: { cols: string; children: ReactNode; chosen?: boolean }) {
  return (
    <div role="listitem" className={cn('grid grid-cols-2 items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors duration-150 hover:bg-zinc-50 sm:gap-y-0 dark:hover:bg-white/[0.03]', cols, chosen && 'bg-[var(--cmd-soft,rgb(0_0_0/0.04))]')}>
      {children}
    </div>
  );
}
