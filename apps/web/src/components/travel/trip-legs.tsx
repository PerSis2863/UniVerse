'use client';

import { Bus, Car, Clock, Coins, ExternalLink, Leaf, Plane, Ship, TrainFront } from 'lucide-react';
import { TRAVEL_FACTORS, type TravelMode } from '@/lib/green';
import { duration } from '@/lib/map-tools';
import { betweenLinks, ferryLikely } from '@/lib/travel-book';
import type { FootLeg } from '@/lib/travel-footprint';
import { cn } from '@/lib/utils';
import { discountsFor } from '@/lib/travel-discounts';

// M357 (the owner, 20 Nov: "all of them and add more options like this in the system"): Directions' compare-the-ways
// (M356) inside a trip. Between two cities every way that works there (train, coach, flight, drive, ferry), quickest
// first, with its door-to-door time and the CO₂ for everyone travelling, the fastest and the greenest marked; a press
// picks it (the same choice as Ready → Footprint, the train logged in Green) and the booking links follow the choice.
// M365: each way's rough price for everyone too, the cheapest marked; the budget's "Between places" uses the way picked.

const ICON: Record<TravelMode, typeof Plane> = { plane: Plane, train: TrainFront, bus: Bus, car: Car, ferry: Ship };
const COLOR: Record<TravelMode, string> = { train: '#7c3aed', bus: '#15803d', plane: '#ea580c', car: '#52525b', ferry: '#0284c7' };
const NAME: Record<TravelMode, string> = { train: 'Train', bus: 'Coach', plane: 'Flight', car: 'Drive', ferry: 'Ferry' };
export const kgText = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()} kg`;
const nice = (t: string) => t.split('/').pop()!.replace(/\s*\([^)]*\)/, '');

/** Which of a leg's booking links fit the way picked (Rome2Rio and Google Maps always: they compare every way). */
const fits = (partner: string, mode: TravelMode) =>
  partner === 'Rome2Rio' || (partner === 'Google Maps' ? mode !== 'plane' && mode !== 'car' : partner === 'Google Flights' ? mode === 'plane' : partner === 'Direct Ferries' ? mode === 'ferry' : mode === 'train' || mode === 'bus');

/** M365: `price` is what a way costs for everyone travelling, as the trip's currency (rough: booked ahead). */
export function TripLeg({ leg, from, to, date, onPick, price, travellers = 1 }: { leg: FootLeg; from: { name: string; cc: string | null }; to: { name: string; cc: string | null }; date: string | null; onPick: (mode: TravelMode) => void; price?: (mode: TravelMode) => { text: string; value: number; each: string }; travellers?: number }) {
  const deals = discountsFor([from.cc, to.cc], [], 'transport').filter((d) => d.id !== 'book-ahead');
  const prices = price ? new Map(leg.ways.map((w) => [w.mode, price(w.mode)])) : null;
  const cheapest = prices && leg.ways.length > 1 ? leg.ways.reduce((a, w) => (prices.get(w.mode)!.value < prices.get(a.mode)!.value ? w : a)).mode : null;
  const links = betweenLinks(from, to, { date, flight: leg.modes.includes('plane'), sea: ferryLikely(from.cc, to.cc) }).filter((l) => fits(l.partner, leg.mode));
  return (
    <div className="ms-4 border-s-2 border-dashed border-indigo-300/70 py-2 ps-5 dark:border-indigo-400/30">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{leg.km.toLocaleString()} km to <span translate="no">{nice(to.name)}</span>{leg.chosen ? '' : ' · pick how you’ll go'}</p>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={`How you’ll get from ${nice(from.name)} to ${nice(to.name)}`}>
        {leg.ways.map((w) => {
          const I = ICON[w.mode], on = w.mode === leg.mode;
          return (
            <button key={w.mode} type="button" role="radio" aria-checked={on} onClick={() => { if (!on || !leg.chosen) onPick(w.mode); }}
              className={cn('flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-start transition-[background-color,border-color] duration-150',
                on ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/15' : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/[0.04]')}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: COLOR[w.mode] }} aria-hidden><I className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">{NAME[w.mode]}</span>
                  <span className="whitespace-nowrap text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{duration(w.minutes)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {prices && <span className="tabular-nums">≈ {prices.get(w.mode)!.text}</span>}
                  <span className="tabular-nums">{kgText(w.kg)} CO₂</span>
                  {w.fastest && <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-700 dark:text-indigo-300"><Clock className="h-3 w-3" aria-hidden />Fastest</span>}
                  {w.greenest && <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-300"><Leaf className="h-3 w-3" aria-hidden />Greenest</span>}
                  {w.mode === cheapest && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-800 dark:text-amber-300"><Coins className="h-3 w-3" aria-hidden />Cheapest</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {leg.mode !== leg.best && leg.kg - leg.bestKg > 0.5 && <p className="mt-1.5 text-xs text-emerald-800 dark:text-emerald-300">By {TRAVEL_FACTORS[leg.best].label.toLowerCase()}: {kgText(leg.kg - leg.bestKg)} less CO₂.</p>}
      {/* M367: how the prices are worked out, and the discounts on this route (src/lib/travel-discounts.ts). */}
      {prices && (
        <details className="group mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200">
          <summary className="cursor-pointer font-semibold text-indigo-700 dark:text-indigo-300">Price details{deals.length ? ` and ${deals.length} ${deals.length === 1 ? 'discount' : 'discounts'}` : ''}</summary>
          <ul className="mt-2 space-y-1">
            {leg.ways.map((w) => {
              const p = prices.get(w.mode)!, each = travellers > 1 && w.mode !== 'car' ? ` · about ${p.each} each` : '';
              return <li key={w.mode} className="tabular-nums"><span className="font-semibold">{NAME[w.mode]}</span>: ≈ {p.text}{w.mode === 'car' ? ` (fuel and tolls, ${travellers > 4 ? `${Math.ceil(travellers / 4)} cars` : 'one car'})` : ` for ${travellers === 1 ? 'one traveller' : `${travellers} travellers`}${each}`}</li>;
            })}
          </ul>
          <p className="mt-2 leading-relaxed text-zinc-600 dark:text-zinc-300">Rough averages for tickets booked a few weeks ahead, from the distance and how dear the two countries are. On the day, trains and flights often cost more; coaches stay cheap. The links below show today’s real fares.</p>
          {!!deals.length && (
            <ul className="mt-2 space-y-1.5 border-t border-zinc-200/70 pt-2 dark:border-white/10">
              {deals.map((d) => <li key={d.id}><span className="font-semibold">{d.title}</span>: {d.text}{d.url && <> <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Official page</a></>}</li>)}
            </ul>
          )}
        </details>
      )}
      {!!links.length && <div className="mt-2 flex flex-wrap gap-1.5">
        {links.map((w) => (
          <a key={w.partner} href={w.url} target="_blank" rel="noopener noreferrer sponsored" className="btn-secondary btn-sm inline-flex items-center gap-1" title={`Opens ${w.partner}`}>{w.label}<span className="text-xs text-zinc-500 dark:text-zinc-400">· {w.partner}</span><ExternalLink className="h-3 w-3 text-zinc-400" aria-hidden /></a>
        ))}
      </div>}
    </div>
  );
}

/** The trip's getting-between totals: time on the move, the CO₂ and what the greenest ways would save. */
export function TripLegTotals({ minutes, total, greenest, legs }: { minutes: number; total: number; greenest: number; legs: number }) {
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-50 p-3 text-center dark:bg-white/[0.04]">
      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">{legs === 1 ? 'Journey' : `${legs} journeys`}</dt><dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{duration(minutes)}</dd></div>
      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">CO₂</dt><dd className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{kgText(total)}</dd></div>
      <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Greenest ways</dt><dd className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{total - greenest > 0.5 ? `−${kgText(total - greenest)}` : 'Already'}</dd></div>
    </dl>
  );
}
