'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Clock, Luggage, Navigation, Thermometer, Users, X, ZoomIn } from 'lucide-react';
import Link from '@/components/ui/Link';
import { clockText, zoneAt } from '@/lib/travel-local';
import { flag } from '@/lib/travel-stats';
import { Cover, startTrip } from '../travel-ui';
import type { Dest } from './map-world';

// M259: a destination tapped on Travel's map (a hand-picked place's photo pin, or any town of 15,000 people or
// more): what it is, the time there, this month's weather for the hand-picked ones, and the ways on: its guide,
// closer in on the map, directions, or a new trip starting there.

const REGION = typeof Intl !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const btn = 'btn-secondary btn-sm inline-flex items-center gap-1.5';

export function DestCard({ d, at, onClose, onZoom, onDirections }: { d: Dest; at: Date; onClose: () => void; onZoom: () => void; onDirections: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const guide = d.idea?.title ?? d.name, country = d.idea?.country ?? (d.cc === 'TR' ? 'Türkiye' : REGION?.of(d.cc) ?? d.cc);
  const zone = zoneAt(d.lat, d.lon), month = at.getUTCMonth(), c = d.idea?.climate;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-end">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm p-1.5" aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="-mt-8 min-h-0 flex-1 space-y-4 overflow-y-auto pe-1">
        <div className="pe-8">
          <h3 className="text-xl font-semibold text-zinc-900 dark:text-white" translate="no">{d.name}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300"><span aria-hidden>{d.cc.length === 2 ? `${flag(d.cc)} ` : ''}</span>{country}</p>
        </div>
        {d.idea && (
          <div className="relative h-40 overflow-hidden rounded-2xl">
            <Cover photo={d.idea.photo} banner={d.idea.banner} sizes="23rem" />
          </div>
        )}
        {d.idea && <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">{d.idea.blurb}</p>}
        <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
          <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />{clockText(zone, at)} there now</li>
          {d.pop > 0 && <li className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />About {d.pop >= 1000 ? `${(d.pop / 1000).toFixed(d.pop >= 10_000 ? 0 : 1)} million` : `${d.pop.toLocaleString('en')},000`} people</li>}
          {c && <li className="flex items-center gap-2"><Thermometer className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />{MONTHS[month]}: {c.low[month]}–{c.high[month]}°C, {c.rain[month]} mm of rain</li>}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/travel/guide?d=${encodeURIComponent(guide)}`} className="btn-primary btn-sm inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" aria-hidden />Open the guide</Link>
          <button type="button" onClick={onZoom} className={btn}><ZoomIn className="h-4 w-4" aria-hidden />Explore the streets</button>
          <button type="button" onClick={onDirections} className={btn}><Navigation className="h-4 w-4" aria-hidden />Directions</button>
          <button type="button" disabled={busy} onClick={() => { setBusy(true); void startTrip(router, { guide, name: d.name, cc: d.cc, lat: d.lat, lon: d.lon, days: 3 }).finally(() => setBusy(false)); }} className={btn}><Luggage className="h-4 w-4" aria-hidden />Start a trip here</button>
        </div>
      </div>
    </div>
  );
}
