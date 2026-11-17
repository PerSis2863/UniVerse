'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpDown, Bike, Car, Copy, CornerUpRight, Footprints, LocateFixed, MapPin, Ruler, Share, TrainFront, Undo2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { addressOf, area, areaOf, directionsUrl, distance, duration, googleDirections, lengthOf, MODES, reverseUrl, routesOf, spotLink, type Mode, type Pt, type Route } from '@/lib/map-tools';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/Segmented';
import { PlaceSearch } from '../travel-ui';

// M237: the Google Maps features on Travel's map (the logic in src/lib/map-tools.ts): directions, "what's here"
// with sharing, and measuring a distance.

export type Spot = Pt & { name: string };
export type Directions = { from: Spot | null; to: Spot | null; mode: Mode; chosen: number };
const ICON: Record<Mode, typeof Footprints> = { foot: Footprints, bike: Bike, car: Car };
const round = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition-[transform,background-color] duration-150 hover:bg-zinc-200 active:scale-95 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.14]';

/** A place typed in a directions field, found as the map's search finds places. */
async function find(t: string): Promise<Spot | null> {
  try {
    const { data } = await api.get<{ lat: number; lon: number }>(`/travel/where?q=${encodeURIComponent(t)}`);
    return { lat: data.lat, lon: data.lon, name: t.slice(0, 80) };
  } catch { toast.error('That place isn’t on the map.'); return null; }
}

/** The routes for a trip, from the free router of its way of travel (walking, cycling, driving). */
export function useRoutes(d: Directions | null) {
  const [state, setState] = useState<{ key: string; routes: Route[]; failed: boolean } | null>(null);
  const key = d?.from && d.to ? directionsUrl(d.mode, d.from, d.to) : ''; // the question is the key
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController();
    fetch(key, { signal: ctl.signal })
      .then((r) => r.json()).then((a) => setState({ key, routes: routesOf(a), failed: false }))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setState({ key, routes: [], failed: true }); });
    return () => ctl.abort();
  }, [key]);
  const current = state?.key === key ? state : null;
  return { routes: current?.routes ?? [], loading: !!key && !current, failed: !!current?.failed || (!!current && !current.routes.length) };
}

/** The directions card: from, to, the way of travel, the routes (the quickest first) and the turns of the chosen. */
export function DirectionsCard({ d, set, routes, loading, failed, myPlace, onClose }: {
  d: Directions; set: (d: Directions) => void; routes: Route[]; loading: boolean; failed: boolean; myPlace: () => Spot | null; onClose: () => void;
}) {
  const r = routes[d.chosen] ?? routes[0];
  const field = (which: 'from' | 'to') => {
    const v = d[which];
    return (
      <div className="flex items-center gap-2">
        <span className={cn('flex h-3 w-3 shrink-0 rounded-full', which === 'from' ? 'border-[3px] border-[#1f87ff] bg-white' : 'bg-[#ea4335]')} aria-hidden />
        {v ? (
          <button type="button" onClick={() => set({ ...d, [which]: null })} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-start text-sm dark:bg-white/[0.06]" aria-label={`${which === 'from' ? 'From' : 'To'} ${v.name}: change`}>
            <span className="truncate font-medium text-zinc-900 dark:text-white" translate="no">{v.name}</span><X className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <PlaceSearch className="min-w-0 flex-1" label={which === 'from' ? 'Starting point' : 'Destination'} placeholder={which === 'from' ? 'Choose a starting point…' : 'Choose where to go…'} onPick={(t) => void find(t).then((s) => s && set({ ...d, [which]: s, chosen: 0 }))} />
            <button type="button" className={round} aria-label="Use where I am" onClick={() => { const me = myPlace(); if (me) set({ ...d, [which]: me, chosen: 0 }); }}><LocateFixed className="h-4 w-4" aria-hidden /></button>
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white">Directions</h3>
        <button type="button" onClick={onClose} className={round} aria-label="Close directions"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-2">{field('from')}{field('to')}</div>
        <button type="button" className={round} aria-label="Swap start and destination" onClick={() => set({ ...d, from: d.to, to: d.from, chosen: 0 })}><ArrowUpDown className="h-4 w-4" aria-hidden /></button>
      </div>
      <Segmented<Mode> label="Way of travel" className="mt-3" value={d.mode} onChange={(mode) => set({ ...d, mode, chosen: 0 })} segments={MODES.map((m) => ({ value: m.id, label: m.label }))} />
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">Right-click the map (or press and hold) for “Directions from here” and “to here”.</p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2" aria-live="polite">
        {d.from && d.to && loading && <p className="py-4 text-center text-sm text-zinc-500">Finding the way…</p>}
        {d.from && d.to && !loading && failed && <p className="py-4 text-center text-sm text-zinc-600 dark:text-zinc-300">No {MODES.find((m) => m.id === d.mode)!.label.toLowerCase()} route found between these places.</p>}
        {routes.length > 0 && (
          <ul className="space-y-1.5">
            {routes.map((x, i) => { const Icon = ICON[d.mode]; return (
              <li key={i}>
                <button type="button" aria-pressed={i === d.chosen} onClick={() => set({ ...d, chosen: i })} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start ring-1 transition-colors', i === d.chosen ? 'bg-[#1f87ff]/[0.08] ring-[#1f87ff]/40' : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-white/[0.04]')}>
                  <Icon className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-300" aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-zinc-900 dark:text-white">{duration(x.minutes)}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{distance(x.km)}{i === 0 ? ' · the quickest' : ''}</span></span>
                </button>
              </li>
            ); })}
          </ul>
        )}
        {r && (
          <ol className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/10">
            {r.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 py-2 text-sm">
                <CornerUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-100">{s.text}</span>
                {s.km > 0 && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{distance(s.km)}</span>}
              </li>
            ))}
          </ol>
        )}
        {d.from && d.to && (
          <a href={googleDirections(d.from, d.to, 'transit')} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"><TrainFront className="h-4 w-4" aria-hidden />Public transport in Google Maps</a>
        )}
      </div>
      <p className="border-t border-zinc-200/70 pt-1.5 text-[11px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">Routes <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer" className="underline">FOSSGIS</a> (OSRM, © OpenStreetMap)</p>
    </div>
  );
}

/** "What's here": the address of a point the map was right-clicked or held at, with what can be done from it. */
export function HereCard({ p, zoom, x, y, onFrom, onTo, onMeasure, onClose }: {
  p: Pt; zoom: number; x: number; y: number; onFrom: (s: Spot) => void; onTo: (s: Spot) => void; onMeasure: () => void; onClose: () => void;
}) {
  const [found, setFound] = useState<{ key: string; address: string | null } | null>(null);
  const key = reverseUrl(p), address = found?.key === key ? found.address : undefined;
  useEffect(() => {
    const ctl = new AbortController();
    fetch(key, { signal: ctl.signal, headers: { Accept: 'application/json' } }).then((r) => r.json()).then((a) => setFound({ key, address: addressOf(a) })).catch((e) => { if ((e as Error).name !== 'AbortError') setFound({ key, address: null }); });
    return () => ctl.abort();
  }, [key]);
  const coords = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, name = address?.split(', ').slice(0, 2).join(', ') || coords;
  const spot = { ...p, name };
  const share = async () => {
    const url = spotLink(location.origin, p, zoom);
    try { if (navigator.share) await navigator.share({ title: name, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied'); } } catch { /* closed */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(coords); toast.success('Coordinates copied'); } catch { toast.error('Couldn’t copy.'); } };
  const item = 'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]';
  return (
    <div role="dialog" aria-label="What’s here" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="absolute z-40 w-64 origin-top-left rounded-2xl bg-[var(--card-bg)] p-1.5 shadow-2xl ring-1 ring-black/5 animate-[layers-in_160ms_var(--ease-out-soft)] motion-reduce:animate-none dark:ring-white/10"
      style={{ left: Math.max(8, Math.min(x, 9999)), top: Math.max(8, y) }}>
      <div className="flex items-start gap-2 px-2.5 pb-1.5 pt-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ea4335]" aria-hidden />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-900 dark:text-white">{address === undefined ? 'Finding the address…' : address ?? 'Dropped pin'}</p><p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{coords}</p></div>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <button type="button" className={item} onClick={() => onFrom(spot)}><span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-[#1f87ff] bg-white" aria-hidden />Directions from here</button>
      <button type="button" className={item} onClick={() => onTo(spot)}><span className="h-3 w-3 shrink-0 rounded-full bg-[#ea4335]" aria-hidden />Directions to here</button>
      <button type="button" className={item} onClick={onMeasure}><Ruler className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Measure distance</button>
      <button type="button" className={item} onClick={() => void copy()}><Copy className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Copy coordinates</button>
      <button type="button" className={item} onClick={() => void share()}><Share className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Share this place</button>
      <p className="px-2.5 pb-1 pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">Address <a href="https://nominatim.org" target="_blank" rel="noopener noreferrer" className="underline">Nominatim</a> · © OpenStreetMap</p>
    </div>
  );
}

/** The measuring bar: the line's length (and the area once there are three points), undo, clear, done. */
export function MeasureBar({ pts, onUndo, onClear, onDone }: { pts: Pt[]; onUndo: () => void; onClear: () => void; onDone: () => void }) {
  const km = lengthOf(pts), a = areaOf(pts);
  return (
    <div role="status" className="absolute start-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--card-bg)] py-1.5 pe-1.5 ps-4 shadow-xl ring-1 ring-black/5 dark:ring-white/10 rtl:translate-x-1/2">
      <Ruler className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">{pts.length < 2 ? 'Click the map to measure' : `${distance(km)}${pts.length > 2 ? ` · ${area(a)} inside` : ''}`}</span>
      <button type="button" className={round} onClick={onUndo} disabled={!pts.length} aria-label="Undo the last point"><Undo2 className="h-4 w-4" aria-hidden /></button>
      <button type="button" className="btn-ghost btn-sm" onClick={onClear} disabled={!pts.length}>Clear</button>
      <button type="button" className="btn-primary btn-sm" onClick={onDone}>Done</button>
    </div>
  );
}

/** What the map draws for the directions: the other routes in grey, the chosen in blue, the two ends. */
export function routeFeatures(d: Directions | null, routes: Route[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  routes.forEach((r, i) => { if (i !== d?.chosen) features.push({ type: 'Feature', properties: { role: 'alt', i }, geometry: { type: 'LineString', coordinates: r.path } }); });
  const main = routes[d?.chosen ?? 0];
  if (main) features.push({ type: 'Feature', properties: { role: 'main' }, geometry: { type: 'LineString', coordinates: main.path } });
  for (const [role, s] of [['from', d?.from], ['to', d?.to]] as const) if (s) features.push({ type: 'Feature', properties: { role }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
  return { type: 'FeatureCollection', features };
}
/** What the map draws for a measurement: the line, its points, and the area once closed by a third point. */
export function measureFeatures(pts: Pt[] | null): GeoJSON.FeatureCollection {
  const c = (pts ?? []).map((p) => [p.lon, p.lat]);
  const features: GeoJSON.Feature[] = c.map((xy) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: xy } }));
  if (c.length > 1) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } });
  if (c.length > 2) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...c, c[0]]] } });
  return { type: 'FeatureCollection', features };
}
