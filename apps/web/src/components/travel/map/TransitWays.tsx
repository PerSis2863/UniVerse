'use client';

import { Bus, Car, ExternalLink, Plane, TrainFront, TramFront, type LucideIcon } from 'lucide-react';
import { duration, type Spot } from '@/lib/map-tools';
import { transitApps, waysBetween, type WayKind } from '@/lib/transit-options';
import { betweenLinks } from '@/lib/travel-book';
import { cn } from '@/lib/utils';

// M356: Directions' Public transport tab (src/lib/transit-options.ts says why the times are estimates): every way to
// get there, quickest first, each with its time and CO₂ and where to see or book it; then the exact departures, lines
// and changes in Google Maps, Apple Maps or Citymapper, and Rome2Rio to compare every way with prices.

const KIND: Record<WayKind, { icon: LucideIcon; color: string }> = {
  local: { icon: TramFront, color: '#0284c7' },
  train: { icon: TrainFront, color: '#7c3aed' },
  bus: { icon: Bus, color: '#15803d' },
  flight: { icon: Plane, color: '#ea580c' },
  car: { icon: Car, color: '#52525b' },
};
/** Names the routers can't read as a place (Rome2Rio and Google Flights search by name). */
const GENERIC = new Set(['Middle of the map', 'Your location', 'This place']);
const action = 'inline-flex shrink-0 items-center gap-1 rounded-full bg-[#0a84ff]/10 px-3 py-1.5 text-xs font-semibold text-[#0066cc] hover:bg-[#0a84ff]/15 dark:text-[#4da3ff]';

export function TransitWays({ from, to, onDrive }: { from: Spot; to: Spot; onDrive: () => void }) {
  const ways = waysBetween(from, to), apps = transitApps(from, to);
  const named = !GENERIC.has(from.name) && !GENERIC.has(to.name);
  const links = named ? betweenLinks({ name: from.name, cc: null }, { name: to.name, cc: null }, { flight: ways.some((w) => w.kind === 'flight') }) : [];
  const compare = links.find((l) => l.partner === 'Rome2Rio'), flights = links.find((l) => l.partner === 'Google Flights');
  if (!ways.length) return <p className="mt-4 rounded-2xl bg-[#f2f2f7] p-4 text-sm text-zinc-700 dark:bg-[#26292d] dark:text-zinc-200">It’s only a few steps: walk there.</p>;
  return (
    <div className="mt-4 space-y-4">
      <section aria-labelledby="ways-h">
        <h4 id="ways-h" className="mb-1.5 text-[17px] font-bold text-zinc-900 dark:text-white">Ways to get there</h4>
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/10">
          {ways.map((w) => {
            const { icon: Icon, color } = KIND[w.kind];
            const go = w.kind === 'local' ? { href: apps[0].url, text: 'Lines and times' } : w.kind === 'flight' ? (flights ? { href: flights.url, text: 'Flights' } : null) : w.kind === 'car' ? null : compare ? { href: compare.url, text: 'Times and prices' } : { href: apps[0].url, text: 'Lines and times' };
            return (
              <li key={w.kind} className="flex items-center gap-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }} aria-hidden><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold text-zinc-900 dark:text-white">{w.label}</span><span className="whitespace-nowrap text-sm tabular-nums text-zinc-700 dark:text-zinc-200">about {duration(w.minutes)}</span></span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">{w.note} · {w.kg < 1 ? 'under 1' : Math.round(w.kg)} kg CO₂</span>
                </span>
                {w.kind === 'car' ? <button type="button" onClick={onDrive} className={action}>Route</button>
                  : go && <a href={go.href} target="_blank" rel="noopener noreferrer" className={action}>{go.text}<ExternalLink className="h-3 w-3" aria-hidden /></a>}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Times and CO₂ are estimates from the distance.</p>
      </section>
      <section aria-labelledby="exact-h">
        <h4 id="exact-h" className="mb-1.5 text-[17px] font-bold text-zinc-900 dark:text-white">Exact departures, lines and changes</h4>
        <div className="grid grid-cols-3 gap-2">
          {apps.map((a) => (
            <a key={a.name} href={a.url} target="_blank" rel="noopener noreferrer" className={cn('flex flex-col items-center gap-1 rounded-2xl bg-[#f2f2f7] px-2 py-3 text-center text-[13px] font-semibold text-zinc-900 hover:bg-[#e8e8ed] dark:bg-[#26292d] dark:text-white dark:hover:bg-[#2e3136]')}>
              <TrainFront className="h-5 w-5 text-[#0066cc] dark:text-[#4da3ff]" aria-hidden />{a.name}
            </a>
          ))}
        </div>
        {compare && <a href={compare.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#0066cc] dark:text-[#4da3ff]">Compare every way with prices on Rome2Rio<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
      </section>
    </div>
  );
}
