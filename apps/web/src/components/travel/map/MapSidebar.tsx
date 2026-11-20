'use client';

import { ArrowUpRight, Bookmark, CornerUpRight, LayoutGrid, Luggage, Map as MapIcon, PanelLeftClose, PanelLeftOpen, Search, X, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import { CATEGORIES, type CategoryId } from '@/lib/travel-map';
import { cn } from '@/lib/utils';
import type { Saved } from '../travel-ui';
import { PINS } from './pins';

// M349 (the owner, 20 Nov, with Apple Maps' pictures: "make the map ui like this exactly and keep all the current
// features"; "add whatever you can in this sections"): on a computer a narrow menu column (Search, Guides, Directions,
// plus Saved and Trips) and, beside it, the chosen section's panel with a big title and a round close button; on a
// phone the same sections as a row at the top of the sheet. Colours: Apple's greys, its blue (#0a84ff) for what's chosen.

export type Section = 'search' | 'guides' | 'directions' | 'saved' | 'trips';
export const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'guides', label: 'Guides', icon: LayoutGrid },
  { id: 'directions', label: 'Directions', icon: CornerUpRight },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'trips', label: 'Trips', icon: Luggage },
];
export const RAIL_REM = 12.5, PANEL_REM = 23.5;
export const sideBg = 'bg-[#f2f2f7] dark:bg-[#141618]';
export const panelBg = 'bg-white dark:bg-[#1c1e21]';
export const tile = 'bg-[#f2f2f7] hover:bg-[#e8e8ed] dark:bg-[#26292d] dark:hover:bg-[#2e3136]';

/** The menu column (a computer). */
export function MapRail({ active, onPick, onHide }: { active: Section | null; onPick: (s: Section) => void; onHide: () => void }) {
  return (
    <nav aria-label="Map" data-map-side className={cn('absolute inset-y-0 start-0 z-30 hidden flex-col border-e border-black/[0.06] px-2.5 pb-3 pt-4 sm:flex dark:border-white/[0.06]', sideBg)} style={{ width: `${RAIL_REM}rem` }}>
      <div className="mb-4 flex items-center justify-between ps-1.5">
        <span className="flex items-center gap-1.5 text-[19px] font-semibold tracking-tight text-zinc-900 dark:text-white">
          <MapIcon className="h-5 w-5" aria-hidden />Maps
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-white/[0.12] dark:text-zinc-300">Travel</span>
        </span>
        <button type="button" onClick={onHide} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10" aria-label="Hide the sidebar"><PanelLeftClose className="h-[18px] w-[18px]" aria-hidden /></button>
      </div>
      <ul className="space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const on = active === id;
          return (
            <li key={id}>
              <button type="button" aria-current={on ? 'true' : undefined} onClick={() => onPick(id)}
                className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start text-[16px] font-medium transition-colors', on ? 'bg-white shadow-sm dark:bg-white/[0.09]' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]', 'text-zinc-900 dark:text-white')}>
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]', on ? 'bg-[#0a84ff] text-white' : 'bg-zinc-200 text-zinc-800 dark:bg-white/[0.1] dark:text-white')} aria-hidden><Icon className="h-[17px] w-[17px]" /></span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
      <Link href="/travel/saved" className="mt-auto block rounded-2xl bg-black/[0.04] px-3 py-2.5 text-[13px] leading-snug text-zinc-700 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]">
        Planning a trip?<span className="flex items-center gap-1 font-semibold text-zinc-900 dark:text-white">Days, budget and friends <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
      </Link>
    </nav>
  );
}

/** The button that brings the hidden menu column back (a computer). */
export function RailShow({ onShow }: { onShow: () => void }) {
  return (
    <button type="button" onClick={onShow} className={cn('absolute start-3 top-3 z-30 hidden h-10 w-10 items-center justify-center rounded-xl text-zinc-800 shadow-lg ring-1 ring-black/5 sm:flex dark:text-white dark:ring-white/10', panelBg)} aria-label="Show the sidebar">
      <PanelLeftOpen className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** A section's panel heading: its title, big, and a round close button (and whatever else goes beside it). */
export function PanelHead({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="min-w-0 flex-1 truncate text-[26px] font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h2>
      {children}
      <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-800 transition-colors hover:bg-zinc-300 dark:bg-white/[0.14] dark:text-white dark:hover:bg-white/[0.2]" aria-label={`Close ${title.toLowerCase()}`}><X className="h-5 w-5" aria-hidden /></button>
    </div>
  );
}

/** On a phone: the sections as a row at the top of the sheet. */
export function SectionRow({ active, onPick }: { active: Section | null; onPick: (s: Section) => void }) {
  return (
    <div role="group" aria-label="Map sections" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:hidden">
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-pressed={active === id} onClick={() => onPick(id)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold', active === id ? 'bg-[#0071e3] text-white' : cn(tile, 'text-zinc-800 dark:text-zinc-100'))}>
          <Icon className="h-4 w-4" aria-hidden />{label}
        </button>
      ))}
    </div>
  );
}

/** Apple Maps' "Find Nearby": every kind of place as a tile, two to a row. */
export function FindNearby({ cat, onPick }: { cat: CategoryId; onPick: (c: CategoryId) => void }) {
  return (
    <section aria-labelledby="find-nearby">
      <h3 id="find-nearby" className="mb-2 text-[19px] font-bold text-zinc-900 dark:text-white">Find Nearby</h3>
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => {
          const Icon = PINS[c.id].icon, on = cat === c.id;
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => onPick(c.id)}
              className={cn('flex min-w-0 items-center gap-2.5 rounded-2xl px-2.5 py-2 text-start transition-colors', tile, on && 'ring-2 ring-[#0a84ff]')}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: PINS[c.id].color }} aria-hidden><Icon className="h-4 w-4" /></span>
              <span className="truncate text-[14px] font-medium text-zinc-900 dark:text-white">{c.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Saved places with a position, to see on the map. */
export function SavedPlaces({ list, onPick }: { list: Saved[] | undefined; onPick: (s: Saved) => void }) {
  const placed = (list ?? []).filter((s) => s.lat != null && s.lon != null);
  if (!list) return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  if (!placed.length) return <p className="py-6 text-center text-sm text-zinc-600 dark:text-zinc-300">Nothing saved yet. Tap a place on the map, or open a guide, and press Save.</p>;
  return (
    <ul className="space-y-1">
      {placed.map((s) => (
        <li key={s.id}>
          <button type="button" onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: PINS.saved.color }} aria-hidden><Bookmark className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{s.address ?? s.guide}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Your trips, to draw one on the map. */
export function TripsList({ list, shown, onShow }: { list: { id: string; name: string; cities: string[] }[] | undefined; shown: string | null; onShow: (id: string) => void }) {
  if (!list) return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  return (
    <>
      {list.length ? (
        <ul className="space-y-1">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" aria-pressed={shown === t.id} onClick={() => onShow(t.id)} className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]', shown === t.id && 'bg-[#0a84ff]/10')}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white" aria-hidden><Luggage className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{t.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{t.cities.join(' · ') || 'No cities yet'}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-sm text-zinc-600 dark:text-zinc-300">No trips yet.</p>}
      <Link href="/travel/saved" className="btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5">Plan a trip<ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
    </>
  );
}
