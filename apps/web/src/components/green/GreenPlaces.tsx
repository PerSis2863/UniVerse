'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { toast } from 'sonner';
import { ExternalLink, LocateFixed } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark';
import { osmKey } from '@/lib/travel-place';
import { km } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { STYLE } from '@/components/travel/map/map-layers';
import { mapRequest } from '@/components/travel/map/map-style';
import { useBareChrome } from '@/lib/chrome';
import { SMOOTH_MAP, smoothGestures } from '@/lib/map-smooth';

// Green → Green places (M216): where to recycle, refill a bottle, hire a bike, charge an electric car, buy
// second-hand or at a market, near you. OpenStreetMap's own places, read from the map's tiles as you move
// (OpenFreeMap: they come straight to the browser): no Worker CPU, no outside service to wait on.

const KINDS = [
  { id: 'recycling', label: 'Recycling', color: '#047857', sub: ['recycling'] },
  { id: 'water', label: 'Water refill', color: '#0284c7', sub: ['drinking_water'] },
  { id: 'bikes', label: 'Bike hire', color: '#7c3aed', sub: ['bicycle_rental'] },
  { id: 'charging', label: 'EV charging', color: '#a16207', sub: ['charging_station'] },
  { id: 'used', label: 'Second-hand', color: '#db2777', sub: ['second_hand', 'charity'] },
  { id: 'market', label: 'Markets and farm shops', color: '#ea580c', sub: ['marketplace', 'farm'] },
] as const;
type KindId = (typeof KINDS)[number]['id'];
interface Spot { key: string; kind: KindId; name: string; lat: number; lon: number }
const KEEP = 'uv-green-places', HOME = { lat: 38.7139, lon: -9.1394, zoom: 15 };
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const kindOfSub = (sub: unknown) => KINDS.find((k) => (k.sub as readonly string[]).includes(String(sub)));
const subsOf = (shown: Set<KindId>) => KINDS.filter((k) => shown.has(k.id)).flatMap((k) => [...k.sub]);
const filterOf = (shown: Set<KindId>): ExpressionSpecification => ['in', ['get', 'subclass'], ['literal', subsOf(shown)]];
const colour: ExpressionSpecification = ['match', ['get', 'subclass'], ...KINDS.flatMap((k) => k.sub.flatMap((s) => [s, k.color])), '#71717a'] as unknown as ExpressionSpecification;

export default function GreenPlaces() {
  useBareChrome(); // M271: on a phone the map takes the top bar's place
  const box = useRef<HTMLDivElement>(null), mapRef = useRef<MLMap | null>(null), applied = useRef<StyleSpecification | null>(null);
  const dark = useDarkMode();
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(HOME.zoom);
  const [spots, setSpots] = useState<Spot[]>([]), [centre, setCentre] = useState(HOME);
  const [shown, setShown] = useState<Set<KindId>>(new Set(KINDS.map((k) => k.id)));
  const [picked, setPicked] = useState<Spot | null>(null);
  const list = useMemo(() => spots.filter((s) => shown.has(s.kind)).map((s) => ({ s, d: km(centre, s) ?? 0 })).sort((a, b) => a.d - b.d).slice(0, 50), [spots, shown, centre]);
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, spots.filter((s) => s.kind === k.id).length])) as Record<KindId, number>, [spots]);

  /** The places in view, from the tiles already drawn. */
  const read = useEffectEvent((m: MLMap) => {
    if (m.getZoom() < 13) { setSpots([]); return; }
    const b = m.getBounds(), seen = new Set<string>(), out: Spot[] = [];
    for (const f of m.querySourceFeatures('openmaptiles', { sourceLayer: 'poi', filter: filterOf(new Set(KINDS.map((k) => k.id))) })) {
      const k = kindOfSub(f.properties.subclass);
      if (!k || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!b.contains([lon, lat])) continue;
      const key = osmKey(f.id) ?? `${lat.toFixed(5)},${lon.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, kind: k.id, name: (f.properties.name_en ?? f.properties.name ?? k.label) as string, lat, lon });
    }
    setSpots(out);
  });
  const onStyle = useEffectEvent((m: MLMap) => {
    const halo = dark ? '#0b0c0e' : '#ffffff', ink = dark ? '#f4f6f8' : '#111214';
    const font = (m.getStyle().layers ?? []).map((l) => (l.type === 'symbol' ? (l.layout as Record<string, unknown> | undefined)?.['text-font'] : undefined)).find((x) => Array.isArray(x)) as string[] | undefined;
    if (!m.getSource('gp-sel')) m.addSource('gp-sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({ id: 'gp-sel', type: 'circle', source: 'gp-sel', paint: { 'circle-radius': 17, 'circle-color': 'rgba(4,120,87,0.18)', 'circle-stroke-color': '#047857', 'circle-stroke-width': 3 } });
    m.addLayer({ id: 'gp', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 13, filter: filterOf(shown), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4.5, 17, 9], 'circle-color': colour, 'circle-stroke-color': halo, 'circle-stroke-width': 2 } });
    m.addLayer({ id: 'gp-name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15.5, filter: filterOf(shown), layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': font ?? ['Noto Sans Regular'], 'text-size': 11.5, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true }, paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.5 } });
    setReady(true);
  });
  const onClick = useEffectEvent((m: MLMap, x: number, y: number) => {
    const f = m.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers: ['gp'] })[0];
    const k = f && kindOfSub(f.properties.subclass);
    if (f && k && f.geometry.type === 'Point') { const [lon, lat] = f.geometry.coordinates; pick({ key: osmKey(f.id) ?? `${lat},${lon}`, kind: k.id, name: (f.properties.name_en ?? f.properties.name ?? k.label) as string, lat, lon }); }
  });
  const first = useEffectEvent(() => {
    const style = STYLE[dark ? 'dark' : 'light'];
    try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return { s: { lat: v.lat, lon: v.lon, zoom: Math.min(18, Math.max(3, v.zoom ?? 15)) }, style }; } catch { /* private mode */ }
    return { s: HOME, style };
  });

  useEffect(() => {
    let gone = false, map: MLMap | null = null;
    void (async () => {
      const ml = await import('maplibre-gl');
      ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      if (gone || !box.current) return;
      const { s, style } = first();
      applied.current = style;
      map = new ml.Map({ container: box.current, style: applied.current, center: [s.lon, s.lat], zoom: s.zoom, transformRequest: mapRequest, attributionControl: false, maplibreLogo: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1), ...SMOOTH_MAP });
      mapRef.current = map;
      smoothGestures(map);
      map.on('style.load', () => onStyle(map!));
      map.on('idle', () => read(map!));
      map.on('moveend', () => { const c = map!.getCenter(), z = map!.getZoom(); setZoom(z); setCentre({ lat: c.lat, lon: c.lng, zoom: z }); try { localStorage.setItem(KEEP, JSON.stringify({ lat: c.lat, lon: c.lng, zoom: z })); } catch { /* private mode */ } });
      map.on('click', (e) => onClick(map!, e.point.x, e.point.y));
      map.on('mouseenter', 'gp', () => { map!.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'gp', () => { map!.getCanvas().style.cursor = ''; });
    })();
    return () => { gone = true; map?.remove(); mapRef.current = null; };
  }, []); // made once; light and dark, and the kinds shown, below
  useEffect(() => { const m = mapRef.current, style = STYLE[dark ? 'dark' : 'light']; if (m && ready && applied.current !== style) { applied.current = style; m.setStyle(style); } }, [dark, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) for (const id of ['gp', 'gp-name']) if (m.getLayer(id)) m.setFilter(id, filterOf(shown)); }, [shown, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) (m.getSource('gp-sel') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: picked ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [picked.lon, picked.lat] }, properties: {} }] : [] }); }, [picked, ready]);

  function pick(s: Spot) {
    setPicked(s);
    const m = mapRef.current;
    if (m) m.flyTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 16.5), duration: calm() ? 0 : 1100, essential: true, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
  }
  const findMe = () => navigator.geolocation?.getCurrentPosition((p) => mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15.5, duration: calm() ? 0 : 1400, essential: true }), () => toast.error('Your browser didn’t share where you are.'), { timeout: 10_000 });
  const toggle = (id: KindId) => setShown((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const osm = (key: string) => (/^[NWR]\d+$/.test(key) ? `https://www.openstreetmap.org/${{ N: 'node', W: 'way', R: 'relation' }[key[0] as 'N']}/${key.slice(1)}` : null);

  return (
    <div className="relative grid gap-4 lg:block">
      <aside className="panel flex max-h-[calc(100dvh-14rem+var(--bare-gain))] min-h-[20rem] flex-col p-4 lg:absolute lg:start-3 lg:top-3 lg:bottom-3 lg:z-10 lg:max-h-none lg:rounded-[1.375rem] lg:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] lg:w-[22rem]" aria-label="Green places">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to show">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={shown.has(k.id)} onClick={() => toggle(k.id)} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors', shown.has(k.id) ? 'bg-white text-zinc-900 ring-zinc-300 dark:bg-white/[0.08] dark:text-white dark:ring-white/20' : 'text-zinc-500 ring-zinc-200 dark:text-zinc-400 dark:ring-white/10')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: shown.has(k.id) ? k.color : '#a1a1aa' }} aria-hidden />{k.label}{counts[k.id] > 0 && <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{counts[k.id]}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={findMe} className="btn-secondary btn-sm mt-3 inline-flex items-center justify-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />Near me</button>
        {picked && (
          <div className="mt-3 rounded-2xl bg-emerald-500/[0.08] p-3" data-no-motion>
            <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{picked.name}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">{KINDS.find((k) => k.id === picked.kind)!.label} · {(km(centre, picked) ?? 0) < 1 ? `${Math.round((km(centre, picked) ?? 0) * 100) * 10} m` : `${(km(centre, picked) ?? 0).toFixed(1)} km`} from the middle of the map</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${picked.lat}%2C${picked.lon}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Directions</a>
              {osm(picked.key) && <a href={osm(picked.key)!} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Details on OpenStreetMap</a>}
            </div>
          </div>
        )}
        <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pe-1" data-no-motion>
          {list.map(({ s, d }) => (
            <li key={s.key}>
              <button type="button" onClick={() => pick(s)} className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]', picked?.key === s.key && 'bg-zinc-100 dark:bg-white/[0.06]')}>
                <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ background: KINDS.find((k) => k.id === s.kind)!.color }} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{KINDS.find((k) => k.id === s.kind)!.label}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1)} km`}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-300">{zoom < 13 ? 'Zoom in to a town or neighbourhood.' : 'None of the kinds you chose in view: move the map.'}</li>}
        </ol>
        <p className="mt-2 border-t border-zinc-200/70 pt-2 text-[11px] leading-snug text-zinc-500 dark:border-white/10 dark:text-zinc-400">Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a> · Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenMapTiles</a></p>
      </aside>
      <div className="relative h-[calc(100dvh-14rem+var(--bare-gain))] min-h-[24rem] overflow-hidden lg:h-[calc(100dvh-10rem)] rounded-[var(--radius-card)] bg-zinc-200 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10" data-no-arrange data-no-motion>
        <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map of green places" />
        {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}
      </div>
    </div>
  );
}
