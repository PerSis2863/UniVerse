'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import useSWR from 'swr';
import type { Map as MLMap } from 'maplibre-gl';
import { ExternalLink, Mountain, TrendingDown, TrendingUp, X } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { climbOf, samples } from '@/lib/map-extras';
import { ALERT_KINDS, type Alert } from '@/lib/relief-plus';
import { Spark } from '@/components/instruments/parts';
import { sky } from '../travel-ui';
import { heightsAt } from './map-extras';

// M336: the small parts the new map features show: Apple Maps' weather in the corner, a scale that shows while
// zooming, a disaster's card, and a route's climb (Komoot, Apple Maps' cycling directions).

const fahrenheit = () => typeof navigator !== 'undefined' && /^en-(US|LR|MM)$/.test(navigator.language);
const deg = (c: number, f: boolean) => `${Math.round(f ? c * 1.8 + 32 : c)}°`;
const chip = 'rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 dark:bg-[#1f232b]/95 dark:ring-white/10';

type Weather = { days: { date: string; min: number; max: number; symbol: string | null; rain: number }[]; now?: { temp: number; symbol: string | null } | null };
/** The weather at the middle of the map (MET Norway, kept an hour by the Worker per 0.1°): now, and the next days on a tap. */
export function WeatherChip({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const [open, setOpen] = useState(false);
  const f = fahrenheit(), on = zoom >= 5;
  // A quarter of a degree: small moves reuse the answer.
  const key = on ? `/travel/weather?lat=${(Math.round(lat * 4) / 4).toFixed(2)}&lon=${(Math.round(lon * 4) / 4).toFixed(2)}` : null;
  const { data } = useSWR<Weather>(key, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const now = data?.now ?? null;
  if (!on || !now) return null;
  const s = sky(now.symbol), Icon = s.icon, today = data?.days[0];
  return (
    <div className={chip}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-11 w-11 flex-col items-center justify-center text-zinc-800 dark:text-zinc-100"
        aria-label={`Weather here: ${s.words}, ${deg(now.temp, f)}${today ? `. Today ${deg(today.min, f)} to ${deg(today.max, f)}` : ''}`}>
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-semibold tabular-nums leading-none">{deg(now.temp, f)}</span>
      </button>
      {open && (
        <ul className="map-panel-in border-t border-zinc-200/70 px-1 pb-1.5 pt-1 dark:border-white/10">
          {data!.days.slice(0, 4).map((d) => { const D = sky(d.symbol).icon; return (
            <li key={d.date} className="flex flex-col items-center py-1 text-[11px] leading-tight text-zinc-600 dark:text-zinc-300" title={`${sky(d.symbol).words}${d.rain ? `, ${d.rain} mm of rain` : ''}`}>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString([], { weekday: 'short' })}</span>
              <D className="my-0.5 h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{deg(d.max, f)}</span><span className="tabular-nums text-zinc-500 dark:text-zinc-400">{deg(d.min, f)}</span>
            </li>
          ); })}
        </ul>
      )}
    </div>
  );
}

/** Apple Maps' scale: shown while zooming, fading a moment after (MapLibre's own scale, moved by the map, not React). */
export function ScaleBar({ mapRef, ready }: { mapRef: RefObject<MLMap | null>; ready: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const m = mapRef.current, box = holder.current;
    if (!m || !ready || !box) return;
    let gone = false, cleanup = () => {};
    void import('maplibre-gl').then((ml) => {
      if (gone) return;
      const sc = new ml.ScaleControl({ maxWidth: 96, unit: fahrenheit() ? 'imperial' : 'metric' });
      box.appendChild(sc.onAdd(m));
      let hide: ReturnType<typeof setTimeout> | undefined;
      const show = () => { clearTimeout(hide); box.dataset.on = ''; };
      const later = () => { clearTimeout(hide); hide = setTimeout(() => delete box.dataset.on, 1400); };
      m.on('zoomstart', show); m.on('zoomend', later);
      cleanup = () => { clearTimeout(hide); m.off('zoomstart', show); m.off('zoomend', later); sc.onRemove(); };
    });
    return () => { gone = true; cleanup(); };
  }, [mapRef, ready]);
  return (
    <div ref={holder} aria-hidden className="pointer-events-none opacity-0 transition-opacity duration-300 data-[on]:opacity-100 data-[on]:duration-100 [&_.maplibregl-ctrl-scale]:m-0 [&_.maplibregl-ctrl-scale]:border-x-2 [&_.maplibregl-ctrl-scale]:border-b-2 [&_.maplibregl-ctrl-scale]:border-t-0 [&_.maplibregl-ctrl-scale]:border-zinc-800 [&_.maplibregl-ctrl-scale]:bg-white/80 [&_.maplibregl-ctrl-scale]:px-1 [&_.maplibregl-ctrl-scale]:text-[11px] [&_.maplibregl-ctrl-scale]:font-semibold [&_.maplibregl-ctrl-scale]:text-zinc-800 dark:[&_.maplibregl-ctrl-scale]:border-zinc-200 dark:[&_.maplibregl-ctrl-scale]:bg-black/60 dark:[&_.maplibregl-ctrl-scale]:text-zinc-100" />
  );
}

const ago = (iso: string, now: number) => { const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000)); return h < 1 ? 'within the hour' : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
/** A disaster on the map (Google's crisis map): what, how serious, when, and the source's page. */
export function AlertCard({ a, x, y, now, onClose }: { a: Alert; x: number; y: number; now: number; onClose: () => void }) {
  const tone = a.level === 'red' ? 'bg-red-600' : a.level === 'orange' ? 'bg-orange-500' : 'bg-emerald-600';
  return (
    <div role="dialog" aria-label={ALERT_KINDS[a.kind]} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      className="absolute z-40 w-64 rounded-2xl bg-[var(--card-bg)] p-3 shadow-2xl ring-1 ring-black/5 animate-[layers-in_160ms_var(--ease-out-soft)] motion-reduce:animate-none dark:ring-white/10" style={{ left: x, top: y }}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">{ALERT_KINDS[a.kind]}{a.magnitude ? ` · M${a.magnitude}` : ''}</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{a.title}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{now ? ago(a.at, now) : ''} · {a.level === 'red' ? 'Red alert' : a.level === 'orange' ? 'Orange alert' : 'Reported'} · {a.source}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Read more at {a.source}<ExternalLink className="h-3 w-3" aria-hidden /></a>}
    </div>
  );
}

/** A route's ups and downs: the climb, the descent, the highest point and a line of its heights. */
export function Profile({ path }: { path: [number, number][] }) {
  // The 60 points it is measured at, as text: the effect runs again only when they change.
  const key = path.length > 1 ? samples(path, 60).map((s) => `${s.at[0].toFixed(5)},${s.at[1].toFixed(5)}`).join(';') : '';
  const [got, setGot] = useState<{ key: string; heights: number[] | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let gone = false;
    void heightsAt(key.split(';').map((p) => p.split(',').map(Number) as [number, number])).then((heights) => { if (!gone) setGot({ key, heights }); });
    return () => { gone = true; };
  }, [key]);
  const heights = got?.key === key ? got.heights : null;
  if (!heights) return null;
  const c = climbOf(heights);
  return (
    <div className="mt-3 rounded-xl bg-zinc-50 px-3 pb-1 pt-2.5 dark:bg-white/[0.04]">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-100"><TrendingUp className="h-3.5 w-3.5" aria-hidden />{c.up} m up</span>
        <span className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-100"><TrendingDown className="h-3.5 w-3.5" aria-hidden />{c.down} m down</span>
        <span className="inline-flex items-center gap-1"><Mountain className="h-3.5 w-3.5" aria-hidden />{c.low}–{c.high} m high</span>
      </p>
      <Spark values={heights.map((h) => h - c.low + Math.max(4, (c.high - c.low) * 0.1))} height={44} className="text-[#1f87ff]" />
    </div>
  );
}
