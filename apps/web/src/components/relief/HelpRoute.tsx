'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LocateFixed, Navigation, Route } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { mapsLink, orderStops, routeSummary, type Mode, type Pt } from '@/lib/relief-route';
import type { ReliefPost } from './ReliefApp';

// M312: Relief → My requests → I'm helping → Plan my route: the requests I took and haven't delivered yet,
// in the order to visit them from where I am (nearest first, untangled), with each leg, the whole time by
// foot, bike or car, and one link to follow it in Google Maps. Places are rounded to about 500 m.

export function HelpRoute({ posts }: { posts: ReliefPost[] }) {
  const open = useMemo(() => posts.filter((p) => p.status === 'TAKEN'), [posts]);
  const [start, setStart] = useState<Pt | null>(null);
  const [mode, setMode] = useState<Mode>('walk');
  const [locating, setLocating] = useState(false);
  const from = start ?? open[0] ?? null;
  const order = useMemo(() => (from ? orderStops(from, start ? open : open.slice(1)) : []), [from, start, open]);
  if (open.length < 2) return null;
  const visit = start ? order : [open[0], ...order];
  const sum = from ? routeSummary(from, order, mode) : null;
  const locate = () => {
    if (!('geolocation' in navigator)) return void toast.error('This device can’t share where it is.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition((g) => { setStart({ lat: g.coords.latitude, lng: g.coords.longitude }); setLocating(false); }, () => { setLocating(false); toast.error('Allow location for this site to start from where you are.'); }, { timeout: 10_000, maximumAge: 120_000 });
  };
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="route-h">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="route-h" className="me-auto font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><Route className="w-4 h-4 text-orange-500" aria-hidden />Plan my route</h3>
        <Segmented<Mode> label="How you travel" value={mode} onChange={setMode} segments={[{ value: 'walk', label: 'Walk' }, { value: 'bike', label: 'Bike' }, { value: 'drive', label: 'Car' }]} />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{open.length} deliveries, in the order that saves the most way{start ? ' from where you are' : ', starting at the first'}. Places are about 500 m from the real address: message each person for the exact one.</p>
      <ol className="space-y-1 text-sm">
        {visit.map((p, i) => (
          <li key={p.id} className="flex gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-800 dark:text-orange-200">{i + 1}</span>
            <span className="min-w-0 flex-1"><span className="font-medium text-zinc-900 dark:text-white" translate="no">{p.title}</span>{p.place && <span className="text-zinc-500"> · <span translate="no">{p.place}</span></span>}</span>
            {sum && (start ? i : i - 1) >= 0 && <span className="shrink-0 tabular-nums text-xs text-zinc-500">{sum.legs[start ? i : i - 1]} km</span>}
          </li>
        ))}
      </ol>
      {sum && <p className="text-sm font-medium text-zinc-900 dark:text-white tabular-nums">About {sum.km} km · {sum.minutes < 90 ? `${sum.minutes} min` : `${Math.round(sum.minutes / 6) / 10} h`}</p>}
      <div className="flex flex-wrap gap-2">
        {!start && <button type="button" className="btn-secondary btn-sm" disabled={locating} onClick={locate}><LocateFixed className="w-4 h-4" aria-hidden />{locating ? 'Finding you…' : 'Start from where I am'}</button>}
        {from && <a className="btn-primary btn-sm" href={mapsLink(from, order, mode)} target="_blank" rel="noreferrer"><Navigation className="w-4 h-4" aria-hidden />Follow it in Google Maps</a>}
      </div>
    </section>
  );
}
