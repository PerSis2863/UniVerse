'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Activity, CloudLightning, Droplets, ExternalLink, Flame, LocateFixed, Mountain, Sun, type LucideIcon } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { useDarkMode } from '@/lib/use-dark';
import { ALERT_KINDS, distanceKm, type Alert, type AlertKind } from '@/lib/relief-plus';
import { cn } from '@/lib/utils';
import { STYLE } from '@/components/travel/map/map-layers';

// Relief → Alerts (M217): disasters happening now around the world: GDACS's orange and red alerts (earthquakes,
// tropical cyclones, floods, volcanoes, droughts, wildfires; the UN and European Commission's system) and the
// US Geological Survey's earthquakes of magnitude 4.5 and over this week. The server reads them once for
// everyone every 15 minutes; on a globe, worst first, or nearest to you.

const ICON: Record<AlertKind, LucideIcon> = { EQ: Activity, TC: CloudLightning, FL: Droplets, VO: Mountain, DR: Sun, WF: Flame };
const LEVEL = { red: { label: 'Red alert', color: '#dc2626' }, orange: { label: 'Orange alert', color: '#ea580c' }, green: { label: 'Recorded', color: '#16a34a' } } as const;
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function ReliefAlerts() {
  const { data } = useSWR<{ alerts: Alert[]; credit: string }>('/relief/alerts', fetcher, { revalidateOnFocus: false });
  const box = useRef<HTMLDivElement>(null), mapRef = useRef<MLMap | null>(null), applied = useRef<StyleSpecification | null>(null);
  const dark = useDarkMode();
  const [ready, setReady] = useState(false), [kinds, setKinds] = useState<Set<AlertKind>>(new Set(Object.keys(ALERT_KINDS) as AlertKind[]));
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null), [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => {
    const l = (data?.alerts ?? []).filter((a) => kinds.has(a.kind));
    return here ? [...l].sort((a, b) => distanceKm(here, a) - distanceKm(here, b)) : l;
  }, [data, kinds, here]);

  const draw = useEffectEvent((m: MLMap) => (m.getSource('alerts') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: list.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: { id: a.id, color: LEVEL[a.level].color, r: a.level === 'red' ? 11 : a.level === 'orange' ? 8 : 5, sel: a.id === picked ? 1 : 0 } })) }));
  const onStyle = useEffectEvent((m: MLMap) => {
    m.setProjection({ type: 'globe' });
    if (!m.getSource('alerts')) m.addSource('alerts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'alerts-glow', type: 'circle', source: 'alerts', paint: { 'circle-radius': ['*', ['get', 'r'], 2.2], 'circle-color': ['get', 'color'], 'circle-opacity': 0.18, 'circle-blur': 0.6 } });
    m.addLayer({ id: 'alerts', type: 'circle', source: 'alerts', paint: { 'circle-radius': ['get', 'r'], 'circle-color': ['get', 'color'], 'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], dark ? '#ffffff' : '#111214', dark ? '#0b0c0e' : '#ffffff'], 'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 3, 1.5] } });
    draw(m);
    setReady(true);
  });
  const onClick = useEffectEvent((m: MLMap, x: number, y: number) => { const f = m.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]], { layers: ['alerts'] })[0]; if (f) pick(String(f.properties.id)); });
  const firstStyle = useEffectEvent(() => STYLE[dark ? 'dark' : 'light']);

  useEffect(() => {
    let gone = false, map: MLMap | null = null;
    void (async () => {
      const ml = await import('maplibre-gl');
      ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      if (gone || !box.current) return;
      applied.current = firstStyle();
      map = new ml.Map({ container: box.current, style: applied.current, center: [10, 20], zoom: 1.2, attributionControl: false, maplibreLogo: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
      mapRef.current = map;
      map.on('style.load', () => onStyle(map!));
      map.on('click', (e) => onClick(map!, e.point.x, e.point.y));
      map.on('mouseenter', 'alerts', () => { map!.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'alerts', () => { map!.getCanvas().style.cursor = ''; });
    })();
    return () => { gone = true; map?.remove(); mapRef.current = null; };
  }, []); // made once
  useEffect(() => { const m = mapRef.current, style = STYLE[dark ? 'dark' : 'light']; if (m && ready && applied.current !== style) { applied.current = style; m.setStyle(style); } }, [dark, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) draw(m); }, [list, picked, ready]);

  function pick(id: string) {
    setPicked(id);
    const a = data?.alerts.find((x) => x.id === id), m = mapRef.current;
    if (a && m) m.flyTo({ center: [a.lng, a.lat], zoom: Math.max(m.getZoom(), 4), duration: calm() ? 0 : 1600, essential: true, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    document.getElementById(`alert-${id}`)?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
  }
  const findMe = () => navigator.geolocation?.getCurrentPosition((p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 3, duration: calm() ? 0 : 1400, essential: true }); }, () => toast.error('Your browser didn’t share where you are.'), { timeout: 10_000 });
  const toggle = (k: AlertKind) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="relative grid gap-4 lg:block">
      <aside className="panel flex max-h-[calc(100dvh-14rem)] min-h-[22rem] flex-col p-4 lg:absolute lg:start-3 lg:top-3 lg:bottom-3 lg:z-10 lg:max-h-none lg:rounded-[1.375rem] lg:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] lg:w-[24rem]" aria-label="Disaster alerts">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kinds of disaster">
          {(Object.keys(ALERT_KINDS) as AlertKind[]).map((k) => { const I = ICON[k]; return (
            <button key={k} type="button" aria-pressed={kinds.has(k)} onClick={() => toggle(k)} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors', kinds.has(k) ? 'bg-white text-zinc-900 ring-zinc-300 dark:bg-white/[0.08] dark:text-white dark:ring-white/20' : 'text-zinc-500 ring-zinc-200 dark:text-zinc-400 dark:ring-white/10')}><I className="h-3.5 w-3.5" aria-hidden />{ALERT_KINDS[k]}</button>
          ); })}
        </div>
        <button type="button" onClick={findMe} className="btn-secondary btn-sm mt-3 inline-flex items-center justify-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />{here ? 'Nearest to me first' : 'Sort by distance from me'}</button>
        {!data ? <div className="mt-3 h-40 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-white/[0.05]" aria-busy="true" />
          : (
            <ol className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pe-1" data-no-motion>
              {list.map((a) => { const I = ICON[a.kind]; return (
                <li key={a.id} id={`alert-${a.id}`}>
                  <button type="button" onClick={() => pick(a.id)} className={cn('flex w-full items-start gap-3 rounded-xl p-2.5 text-start ring-1 transition-colors', picked === a.id ? 'bg-zinc-100 ring-zinc-300 dark:bg-white/[0.08] dark:ring-white/20' : 'ring-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04]')}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: LEVEL[a.level].color }} aria-hidden><I className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-semibold leading-snug text-zinc-900 dark:text-white" translate="no">{a.title}</span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">{[LEVEL[a.level].label, ALERT_KINDS[a.kind], a.country, formatDistanceToNow(new Date(a.at), { addSuffix: true }), here ? `${Math.round(distanceKm(here, a)).toLocaleString()} km away` : null].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                  {picked === a.id && a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm ms-12 mt-1 inline-flex items-center gap-1 text-xs"><ExternalLink className="h-3.5 w-3.5" aria-hidden />The full report ({a.source})</a>}
                </li>
              ); })}
              {!list.length && <li className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-300">No alerts of these kinds right now.</li>}
            </ol>
          )}
        <p className="mt-2 border-t border-zinc-200/70 pt-2 text-[11px] leading-snug text-zinc-500 dark:border-white/10 dark:text-zinc-400">{data?.credit ?? 'Alerts: GDACS and USGS'}, every 15 minutes. For warnings where you are, follow your local authorities. Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a></p>
      </aside>
      <div className="relative h-[calc(100dvh-14rem)] min-h-[24rem] overflow-hidden lg:h-[calc(100dvh-10rem)] rounded-[var(--radius-card)] bg-zinc-200 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10" data-no-arrange data-no-motion>
        <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map of disaster alerts" />
        {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}
        <div className="pointer-events-none absolute bottom-3 end-3 flex gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow ring-1 ring-black/5 dark:text-zinc-200 dark:ring-white/10" aria-hidden>
          {(['red', 'orange', 'green'] as const).map((l) => <span key={l} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL[l].color }} />{LEVEL[l].label}</span>)}
        </div>
      </div>
    </div>
  );
}
