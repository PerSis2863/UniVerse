'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowUpDown, Bike, Briefcase, Car, Clock, Copy, Flag, Mountain, Footprints, Home, LocateFixed, MapPin, Navigation, Plus, Ruler, Share, TrainFront, Undo2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { addressOf, area, areaOf, AVOIDS, directionsUrl, distance, duration, googleDirections, keptOf, lengthOf, MODES, reverseUrl, routesOf, spotLink, withRecent, type Avoid, type Kept, type Mode, type Pt, type Route, type Spot } from '@/lib/map-tools';
import { bubbleSpot } from '@/lib/navigation';
import { plusCode, reportUrl } from '@/lib/map-extras';
import { heightsAt } from './map-extras';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/Segmented';
import { PlaceSearch } from '../travel-ui';
import { TurnIcon } from './TurnIcon';
import { Profile } from './MapExtras';

// M237: the Google Maps features on Travel's map (the logic in src/lib/map-tools.ts): directions, "what's here"
// with sharing, and measuring a distance. M260: stops on the way, roads to leave out, leave at or arrive by, each
// route's time on the map and how much longer the others are, Home, Work and recent places, and Start (live
// navigation, Navigate.tsx).

export type { Spot };
export type Directions = { from: Spot | null; to: Spot | null; mode: Mode; chosen: number; via: Spot[]; avoid: Avoid };
const ICON: Record<Mode, typeof Footprints> = { foot: Footprints, bike: Bike, car: Car };
const round = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition-[transform,background-color] duration-150 hover:bg-zinc-200 active:scale-95 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.14]';
const KEPT = 'uv-map-kept';

/** M260: Home, Work and recent places, kept on this device only. */
export function readKept(): Kept { try { return keptOf(JSON.parse(localStorage.getItem(KEPT) ?? 'null')); } catch { return keptOf(null); } }
export function writeKept(k: Kept) { try { localStorage.setItem(KEPT, JSON.stringify(k)); } catch { /* private mode */ } }

/** A place typed in a directions field, found as the map's search finds places. */
async function find(t: string): Promise<Spot | null> {
  try {
    const { data } = await api.get<{ lat: number; lon: number }>(`/travel/where?q=${encodeURIComponent(t)}`);
    return { lat: data.lat, lon: data.lon, name: t.slice(0, 80) };
  } catch { toast.error('That place isn’t on the map.'); return null; }
}

/** The routes for a trip, from the free router of its way of travel (walking, cycling, driving). M260: when the router
 *  can't leave out the road asked (`avoided` false), the fastest route is shown and the card says so. */
export function useRoutes(d: Directions | null) {
  const [state, setState] = useState<{ key: string; routes: Route[]; failed: boolean; avoided: boolean } | null>(null);
  const key = d?.from && d.to ? directionsUrl(d.mode, d.from, d.to, { via: d.via, avoid: d.avoid }) : ''; // the question is the key
  const plain = d?.from && d.to && d.avoid && d.mode === 'car' ? directionsUrl(d.mode, d.from, d.to, { via: d.via }) : '';
  useEffect(() => {
    if (!key) return;
    const ctl = new AbortController(), ask = (u: string) => fetch(u, { signal: ctl.signal }).then((r) => r.json()).then(routesOf);
    ask(key)
      .then(async (routes) => (routes.length || !plain ? { routes, avoided: true } : { routes: await ask(plain), avoided: false }))
      .then(({ routes, avoided }) => setState({ key, routes, failed: false, avoided }))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setState({ key, routes: [], failed: true, avoided: true }); });
    return () => ctl.abort();
  }, [key, plain]);
  const current = state?.key === key ? state : null;
  return { routes: current?.routes ?? [], loading: !!key && !current, failed: !!current?.failed || (!!current && !current.routes.length), avoided: current?.avoided ?? true };
}

type When = { kind: 'now' | 'leave' | 'arrive'; time: string };
const hm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** "Arrive 14:35" (leaving now or at a time), or "Leave 13:50" (to arrive by a time): no live traffic, so the router's pace. */
function timing(w: When, minutes: number, now: number) {
  const [h, m] = w.time.split(':').map(Number), at = new Date(now);
  if (w.kind !== 'now' && Number.isFinite(h) && Number.isFinite(m)) at.setHours(h, m, 0, 0);
  if (w.kind === 'arrive') return `Leave by ${hm(new Date(at.getTime() - minutes * 60_000))}`;
  return `Arrive ${hm(new Date((w.kind === 'now' ? now : at.getTime()) + minutes * 60_000))}`;
}

/** The directions card: from, to (and stops on the way), the way of travel, the routes (the quickest first, the others
 *  with how much longer), when to leave, the turns of the chosen route and Start. */
export function DirectionsCard({ d, set, near, routes, loading, failed, avoided, now, myPlace, onStart, onClose }: {
  near?: { lat: number; lon: number } | null; d: Directions; set: (d: Directions) => void; routes: Route[]; loading: boolean; failed: boolean; avoided: boolean; now: number; myPlace: () => Spot | null; onStart: (r: Route) => void; onClose: () => void;
}) {
  const r = routes[d.chosen] ?? routes[0];
  const [kept, setKept] = useState<Kept>(readKept);
  const [adding, setAdding] = useState(false);
  const [when, setWhen] = useState<When>({ kind: 'now', time: '' });
  const choose = (patch: Partial<Directions>, s?: Spot) => { if (s) { const k = withRecent(kept, s); setKept(k); writeKept(k); } set({ ...d, ...patch, chosen: 0 }); };
  const quick = (which: 'from' | 'to') => {
    const list = [...(kept.home ? [{ s: kept.home, Icon: Home, label: 'Home' }] : []), ...(kept.work ? [{ s: kept.work, Icon: Briefcase, label: 'Work' }] : []), ...kept.recent.slice(0, 4).map((s) => ({ s, Icon: Clock, label: s.name }))];
    if (!list.length) return null;
    return (
      <div className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="group" aria-label={which === 'from' ? 'Start from a kept place' : 'Go to a kept place'}>
        {list.map(({ s, Icon, label }, i) => (
          <button key={i} type="button" onClick={() => choose({ [which]: s }, s)} className="inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.14]">
            <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden /><span className="truncate" translate={label === s.name ? 'no' : undefined}>{label}</span>
          </button>
        ))}
      </div>
    );
  };
  const field = (which: 'from' | 'to') => {
    const v = d[which];
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className={cn('flex h-3 w-3 shrink-0 rounded-full', which === 'from' ? 'border-[3px] border-[#1f87ff] bg-white' : 'bg-[#ea4335]')} aria-hidden />
          {v ? (
            <button type="button" onClick={() => set({ ...d, [which]: null })} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-start text-sm dark:bg-white/[0.06]" aria-label={`${which === 'from' ? 'From' : 'To'} ${v.name}: change`}>
              <span className="truncate font-medium text-zinc-900 dark:text-white" translate="no">{v.name}</span><X className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <PlaceSearch className="min-w-0 flex-1" label={which === 'from' ? 'Starting point' : 'Destination'} placeholder={which === 'from' ? 'Choose a starting point…' : 'Choose where to go…'} near={near} onPick={(t) => void find(t).then((s) => s && choose({ [which]: s }, s))}
                onPlace={(p) => { const s = { lat: p.lat, lon: p.lon, name: p.name }; choose({ [which]: s }, s); }} />
              <button type="button" className={round} aria-label="Use where I am" onClick={() => { const me = myPlace(); if (me) choose({ [which]: me }); }}><LocateFixed className="h-4 w-4" aria-hidden /></button>
            </div>
          )}
        </div>
        {!v && <div className="ps-5">{quick(which)}</div>}
      </div>
    );
  };
  const fastest = routes.length ? Math.min(...routes.map((x) => x.minutes)) : 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white">Directions</h3>
        <button type="button" onClick={onClose} className={round} aria-label="Close directions"><X className="h-5 w-5" aria-hidden /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {field('from')}
            {/* M260: stops on the way (up to three), each removable. */}
            {d.via.map((v, i) => (
              <div key={`${v.name}${i}`} className="flex items-center gap-2">
                <span className="flex h-3 w-3 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-white/[0.06]"><span className="truncate font-medium text-zinc-900 dark:text-white" translate="no">{v.name}</span>
                  <button type="button" onClick={() => set({ ...d, via: d.via.filter((_, j) => j !== i), chosen: 0 })} className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10" aria-label={`Remove the stop ${v.name}`}><X className="h-4 w-4" aria-hidden /></button></span>
              </div>
            ))}
            {adding && (
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <PlaceSearch className="min-w-0 flex-1" label="A stop on the way" placeholder="Add a stop…" near={near} onPick={(t) => void find(t).then((s) => { if (s) { choose({ via: [...d.via, s].slice(0, 3) }, s); setAdding(false); } })}
                  onPlace={(p) => { const s = { lat: p.lat, lon: p.lon, name: p.name }; choose({ via: [...d.via, s].slice(0, 3) }, s); setAdding(false); }} />
                <button type="button" className={round} onClick={() => setAdding(false)} aria-label="Don’t add a stop"><X className="h-4 w-4" aria-hidden /></button>
              </div>
            )}
            {field('to')}
          </div>
          <button type="button" className={round} aria-label="Swap start and destination" onClick={() => set({ ...d, from: d.to, to: d.from, via: [...d.via].reverse(), chosen: 0 })}><ArrowUpDown className="h-4 w-4" aria-hidden /></button>
        </div>
        {!adding && d.via.length < 3 && <button type="button" onClick={() => setAdding(true)} className="ms-5 mt-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-[#0b55c4] hover:bg-[#1f87ff]/10 dark:text-[#8cc0ff]"><Plus className="h-3.5 w-3.5" aria-hidden />Add a stop</button>}
        <Segmented<Mode> label="Way of travel" className="mt-3" value={d.mode} onChange={(mode) => set({ ...d, mode, chosen: 0 })} segments={MODES.map((m) => ({ value: m.id, label: m.label }))} />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <label className="inline-flex items-center gap-1.5"><span className="sr-only">When</span>
            <select value={when.kind} onChange={(e) => setWhen({ kind: e.target.value as When['kind'], time: when.time || hm(new Date(now + 1_800_000)) })} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100">
              <option value="now">Leave now</option><option value="leave">Leave at</option><option value="arrive">Arrive by</option>
            </select>
          </label>
          {when.kind !== 'now' && <label className="inline-flex items-center"><span className="sr-only">{when.kind === 'leave' ? 'Leaving time' : 'Arrival time'}</span><input type="time" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} className="min-w-[6.5rem] rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100" /></label>}
          {d.mode === 'car' && (
            <label className="inline-flex items-center gap-1.5">Avoid
              <select value={d.avoid} onChange={(e) => set({ ...d, avoid: e.target.value as Avoid, chosen: 0 })} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100">
                {AVOIDS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="mt-3" aria-live="polite">
          {d.from && d.to && loading && <p className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">Finding the way…</p>}
          {d.from && d.to && !loading && failed && <p className="py-4 text-center text-sm text-zinc-600 dark:text-zinc-300">No {MODES.find((m) => m.id === d.mode)!.label.toLowerCase()} route found between these places.</p>}
          {!loading && !avoided && routes.length > 0 && <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">This route can’t leave out {AVOIDS.find((a) => a.id === d.avoid)?.label.toLowerCase()}: showing the fastest.</p>}
        </div>
        {!loading && routes.length > 0 && (
          <ul className="space-y-1.5">
            {routes.map((x, i) => { const Icon = ICON[d.mode], on = i === d.chosen, more = x.minutes - fastest; return (
              <li key={i} className={cn('flex items-center gap-2 rounded-xl ps-3 pe-2 ring-1 transition-colors', on ? 'bg-[#1f87ff]/[0.08] ring-[#1f87ff]/40' : 'ring-zinc-200 hover:bg-zinc-50 dark:ring-white/10 dark:hover:bg-white/[0.04]')}>
                <button type="button" aria-pressed={on} onClick={() => set({ ...d, chosen: i })} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-start">
                  <Icon className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-300" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-zinc-900 dark:text-white">{duration(x.minutes)}{more > 0 && <span className="ms-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">+{more} min</span>}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{timing(when, x.minutes, now)} · {distance(x.km)}{i === 0 && routes.length > 1 ? ' · the quickest' : ''}</span>
                  </span>
                </button>
                {on && <button type="button" onClick={() => onStart(x)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#0a66d0] px-4 text-sm font-semibold text-white shadow-sm transition-[transform,background-color] duration-150 hover:bg-[#0957b3]"><Navigation className="h-4 w-4" aria-hidden />Start</button>}
              </li>
            ); })}
          </ul>
        )}
        {/* M336: the climb on foot or by bike (Komoot, Apple Maps' cycling directions). */}
        {r && !loading && d.mode !== 'car' && <Profile path={r.path} />}
        {!loading && routes.length > 0 && d.mode === 'car' && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Times at the usual pace of these roads: live traffic isn’t counted.</p>}
        {r && !loading && (
          <ol className="mt-3 divide-y divide-zinc-200/70 dark:divide-white/10">
            {r.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <TurnIcon type={s.type} mod={s.mod} className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-300" />
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
  // M336: its height, from the terrain tiles the 3D hills use (Google Maps' terrain, Apple Maps' elevation).
  const [height, setHeight] = useState<{ key: string; m: number | null } | null>(null);
  useEffect(() => {
    let gone = false;
    void heightsAt([[p.lon, p.lat]]).then((h) => { if (!gone) setHeight({ key, m: h ? Math.round(h[0]) : null }); });
    return () => { gone = true; };
  }, [key, p.lat, p.lon]);
  const metres = height?.key === key ? height.m : null, code = plusCode(p.lat, p.lon);
  const coords = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, name = address?.split(', ').slice(0, 2).join(', ') || coords;
  const spot = { ...p, name };
  const share = async () => {
    const url = spotLink(location.origin, p, zoom);
    try { if (navigator.share) await navigator.share({ title: name, url }); else { await navigator.clipboard.writeText(url); toast.success('Link copied'); } } catch { /* closed */ }
  };
  const keep = (which: 'home' | 'work') => { writeKept({ ...readKept(), [which]: { ...p, name: address ?? name } }); toast.success(which === 'home' ? 'Saved as Home on this device' : 'Saved as Work on this device'); onClose(); };
  const copyCode = async () => { try { await navigator.clipboard.writeText(code); toast.success('Plus Code copied'); } catch { toast.error('Couldn’t copy.'); } };
  const copy = async () => { try { await navigator.clipboard.writeText(coords); toast.success('Coordinates copied'); } catch { toast.error('Couldn’t copy.'); } };
  const item = 'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]';
  return (
    <div role="dialog" aria-label="What’s here" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="absolute z-40 w-64 origin-top-left rounded-2xl bg-[var(--card-bg)] p-1.5 shadow-2xl ring-1 ring-black/5 animate-[layers-in_160ms_var(--ease-out-soft)] motion-reduce:animate-none dark:ring-white/10"
      style={{ left: Math.max(8, Math.min(x, 9999)), top: Math.max(8, y) }}>
      <div className="flex items-start gap-2 px-2.5 pb-1.5 pt-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ea4335]" aria-hidden />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-900 dark:text-white">{address === undefined ? 'Finding the address…' : address ?? 'Dropped pin'}</p><p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{coords}</p><p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400"><span title="Plus Code: a short address for any spot, which Google Maps also reads">{code}</span>{metres !== null && <> · <Mountain className="inline h-3 w-3 align-[-1px]" aria-hidden /> {metres} m</>}</p></div>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <button type="button" className={item} onClick={() => onFrom(spot)}><span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-[#1f87ff] bg-white" aria-hidden />Directions from here</button>
      <button type="button" className={item} onClick={() => onTo(spot)}><span className="h-3 w-3 shrink-0 rounded-full bg-[#ea4335]" aria-hidden />Directions to here</button>
      <button type="button" className={item} onClick={() => keep('home')}><Home className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Set as Home</button>
      <button type="button" className={item} onClick={() => keep('work')}><Briefcase className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Set as Work</button>
      <button type="button" className={item} onClick={onMeasure}><Ruler className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Measure distance</button>
      <button type="button" className={item} onClick={() => void copy()}><Copy className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Copy coordinates</button>
      <button type="button" className={item} onClick={() => void share()}><Share className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Share this place</button>
      <button type="button" className={item} onClick={() => void copyCode()}><Copy className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Copy the Plus Code</button>
      <a className={item} href={reportUrl(p.lat, p.lon)} target="_blank" rel="noopener noreferrer"><Flag className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />Report a problem with the map</a>
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
  const features: GeoJSON.Feature[] = [], chosen = d?.chosen ?? 0, fastest = routes.length ? Math.min(...routes.map((x) => x.minutes)) : 0;
  routes.forEach((r, i) => { if (i !== chosen) features.push({ type: 'Feature', properties: { role: 'alt', i }, geometry: { type: 'LineString', coordinates: r.path } }); });
  const main = routes[chosen];
  if (main) features.push({ type: 'Feature', properties: { role: 'main' }, geometry: { type: 'LineString', coordinates: main.path } });
  // M260: each route's time on its own stretch (the others say how much longer, as Google Maps does).
  routes.forEach((r, i) => {
    const more = r.minutes - fastest, label = i === chosen || more <= 0 ? duration(r.minutes) : `+${more} min`;
    features.push({ type: 'Feature', properties: { role: 'time', main: i === chosen, label, i }, geometry: { type: 'Point', coordinates: bubbleSpot(r.path, routes.filter((_, j) => j !== i).map((o) => o.path)) } });
  });
  for (const [role, s] of [['from', d?.from], ...(d?.via ?? []).map((v) => ['via', v] as const), ['to', d?.to]] as const) if (s) features.push({ type: 'Feature', properties: { role }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
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
