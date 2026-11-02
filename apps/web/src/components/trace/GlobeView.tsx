'use client';

import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Globe2, MapPin, Plane as PlaneIcon } from 'lucide-react';
import type { AirTraffic } from '@/lib/aircraft';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { useActivePoll } from '@/lib/realtime-client';
import { Planet } from '@/components/live/Planet';
import { globeFromShipments, minutesText, type GlobeShipment } from '@/lib/trace-globe';
import { cn } from '@/lib/utils';

// Trace's Live globe (M59): the brand's own shipments as points and arcs on the 3D globe, polled
// while the page is active. Reuses GET /trace/map/tracking and the Planet component; the mapping is
// in src/lib/trace-globe.ts. Only the brand's data — no outside tracking. M67: a globe to use (turn,
// zoom, click) beside the shipments' list and the chosen one's details; the globe turns to the one picked.

export function GlobeView() {
  const poll = useActivePoll(10_000);
  const { data, error, mutate } = useSWR<{ shipments: GlobeShipment[] }>('/trace/map/tracking', fetcher, { refreshInterval: poll, keepPreviousData: true });

  if (error) {
    const noBrand = /brand/i.test(errorMessage(error, ''));
    return (
      <div className="panel p-8 text-center">
        <Globe2 className="w-8 h-8 mx-auto text-pink-500" aria-hidden />
        <p className="mt-3 font-bold text-zinc-900 dark:text-white">{noBrand ? 'Start your brand to see it on the globe.' : 'The globe could not load.'}</p>
        {noBrand ? <Link href="/trace" className="btn-primary mt-4 inline-flex">Start your brand</Link> : <button type="button" onClick={() => void mutate()} className="btn-secondary mt-4">Try again</button>}
      </div>
    );
  }

  const ships = data?.shipments ?? [];
  return <GlobeBody ships={ships} />;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  IN_TRANSIT: { text: 'On the move', cls: 'bg-pink-500/15 text-pink-700 dark:text-pink-200' },
  DELIVERED: { text: 'Delivered', cls: 'bg-aqua-300/15 text-aqua-700 dark:text-aqua-300' },
};

/** The globe and, beside it, every shipment: pick one (in the list or on the globe) and the globe
 *  turns to it, with its name, route, time left, distance, speed and temperature (M67). */
function GlobeBody({ ships }: { ships: GlobeShipment[] }) {
  const { places, arcs, at } = useMemo(() => globeFromShipments(ships), [ships]);
  const [pick, setPick] = useState<number | null>(null);
  // Until someone picks one: the first on the move (else the first on the globe).
  const auto = ships.findIndex((s, i) => s.status === 'IN_TRANSIT' && at[i] >= 0);
  const chosen = pick !== null && pick < ships.length ? pick : auto >= 0 ? auto : at.findIndex((x) => x >= 0);
  const sel = chosen >= 0 ? ships[chosen] : null;
  const p = chosen >= 0 && at[chosen] >= 0 ? places[at[chosen]] : null;
  const destIdx = chosen >= 0 ? arcs.find(([a]) => a === at[chosen])?.[1] : undefined;
  const onMove = ships.filter((s) => s.status === 'IN_TRANSIT' && s.position).length;
  // Air traffic (M69): every plane in the sky, from the OpenSky Network (cached 15 min on the server).
  const [air, setAir] = useState(false);
  const airPoll = useActivePoll(15 * 60_000);
  const { data: traffic } = useSWR<AirTraffic>(air ? '/trace/aircraft' : null, fetcher, { refreshInterval: airPoll, revalidateOnFocus: false });
  const swarm = useMemo(() => (air && traffic?.planes.length ? { planes: traffic.planes, at: traffic.at ? Date.parse(traffic.at) : Number.NaN } : null), [air, traffic]);
  const hot = ships.filter((s) => s.tempC != null && s.maxTempC != null && s.tempC > s.maxTempC).length;

  if (!places.length) return (
    <div className="panel p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Ship a batch and it appears here, moving toward its destination.</div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="panel relative overflow-hidden p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
          <h2 className="font-bold text-zinc-900 dark:text-white">Your shipments, live</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{onMove} on the move · {ships.filter((s) => s.position).length} on the globe{hot ? ` · ${hot} too warm` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-2">
          <button type="button" aria-pressed={air} onClick={() => setAir((v) => !v)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors', air ? 'bg-pink-500 text-[#171f44] ring-pink-500' : 'ring-zinc-300 dark:ring-white/15 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06]')}>
            <PlaneIcon className="w-3.5 h-3.5" aria-hidden />Air traffic
          </button>
          {air && <span className="text-xs text-zinc-500 dark:text-zinc-400" role="status">{!traffic ? 'Loading planes…' : traffic.note ?? `${traffic.planes.length.toLocaleString()} planes in the air · ${traffic.source}${traffic.at ? ` · ${new Date(traffic.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span>}
        </div>
        <Planet interactive swarm={swarm} places={places} arcs={arcs} label="Your shipments on a globe you can turn"
          focus={p ? { lat: p.lat, lon: p.lon } : null} selected={[...(chosen >= 0 && at[chosen] >= 0 ? [at[chosen]] : []), ...(destIdx !== undefined ? [destIdx] : [])]}
          onPick={(i) => { const k = at.indexOf(i); const d = arcs.find(([, b]) => b === i); setPick(k >= 0 ? k : d ? at.indexOf(d[0]) : pick); }}
          className="h-[420px] sm:h-[560px]" />
        <p className="px-5 pb-4 text-xs text-zinc-500 dark:text-zinc-400">Drag to turn it · pinch or ⌘/Ctrl + scroll to zoom · click a point to see it</p>
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        {sel && (
          <section className="panel p-4" aria-labelledby="globe-sel">
            <div className="flex items-start gap-2">
              <h3 id="globe-sel" className="min-w-0 flex-1 font-bold text-zinc-900 dark:text-white truncate" translate="no">{sel.product}</h3>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS[sel.status]?.cls ?? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>{STATUS[sel.status]?.text ?? 'At the depot'}</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400" translate="no">{sel.label}{sel.quantity ? ` · ${sel.quantity.toLocaleString()} units` : ''}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><MapPin className="w-4 h-4 shrink-0 text-aqua-700 dark:text-aqua-300" aria-hidden /><span className="truncate" translate="no">{sel.stops?.[0]?.place ?? 'Start'} → {sel.dest?.place ?? 'Destination'}</span></p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {[
                ['Time left', sel.etaMinutes != null ? minutesText(sel.etaMinutes) : sel.status === 'DELIVERED' ? 'Arrived' : '—'],
                ['Distance left', sel.kmLeft != null ? `${sel.kmLeft.toLocaleString()} km` : '—'],
                ['Speed', sel.speedKmh != null ? `${Math.round(sel.speedKmh)} km/h` : '—'],
                ['Temperature', sel.tempC != null ? `${sel.tempC} °C${sel.maxTempC != null ? ` / ${sel.maxTempC}` : ''}` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2">
                  <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{k}</dt>
                  <dd className={cn('font-mono text-sm tabular-nums text-zinc-900 dark:text-white', k === 'Temperature' && sel.tempC != null && sel.maxTempC != null && sel.tempC > sel.maxTempC && 'text-rose-600 dark:text-rose-300')}>{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/trace/tracking" className="btn-secondary btn-sm mt-3 inline-flex">Open in Tracking</Link>
          </section>
        )}
        <section className="panel p-2" aria-label="Shipments">
          <ul className="max-h-[360px] overflow-y-auto">
            {ships.map((s, i) => (
              <li key={s.id ?? `${s.label}-${i}`}>
                <button type="button" disabled={at[i] < 0} aria-pressed={i === chosen} onClick={() => setPick(i)}
                  className={cn('w-full flex items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors disabled:opacity-50', i === chosen ? 'bg-zinc-900/[0.06] dark:bg-white/[0.08]' : 'hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.04]')}>
                  <span className={cn('w-2 h-2 shrink-0 rounded-full', s.status === 'IN_TRANSIT' ? 'bg-pink-500' : s.status === 'DELIVERED' ? 'bg-aqua-300' : 'bg-zinc-400')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{s.product}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{s.label} · {s.dest?.place ?? 'no destination yet'}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{s.etaMinutes != null ? minutesText(s.etaMinutes) : STATUS[s.status]?.text ?? '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
