'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import { toast } from 'sonner';
import { ExternalLink, LocateFixed } from 'lucide-react';
import { useMapDark } from '@/lib/use-dark';
import { osmKey } from '@/lib/travel-place';
import { km } from '@/lib/travel-plan';
import { STYLE } from '@/components/travel/map/map-layers';
import { mapRequest } from '@/components/travel/map/map-style';
import { useBareChrome } from '@/lib/chrome';
import { DeskCard, DeskRow, DeskTable, MapDesk, MapSearch, TickRows } from '@/components/map-ui/Desk';

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
/** M330: the places table's columns from `sm` up. */
const GREEN_ROW = 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_5.5rem_8rem]';
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
  const dark = useMapDark();
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(HOME.zoom);
  const [spots, setSpots] = useState<Spot[]>([]), [centre, setCentre] = useState(HOME);
  const [shown, setShown] = useState<Set<KindId>>(new Set(KINDS.map((k) => k.id)));
  const [picked, setPicked] = useState<Spot | null>(null);
  const [tab, setTab] = useState<'all' | KindId>('all');
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
      map = new ml.Map({ container: box.current, style: applied.current, center: [s.lon, s.lat], zoom: s.zoom, transformRequest: mapRequest, attributionControl: false, maplibreLogo: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
      mapRef.current = map;
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

  // M330 (the owner's dashboard picture): one screen, no gaps: what to show (with counts) down the side, the map at the
  // top with a search over it, the places in view in a table under it, nearest first.
  const dist = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1)} km`);
  return (
    <MapDesk className="green-desk" title="Green places"
      peek={list.length ? <><strong className="font-semibold tabular-nums">{list.length}</strong> places in view · nearest <span translate="no">{list[0].s.name}</span>, {dist(list[0].d)}</> : zoom < 13 ? 'Zoom in to a town' : 'No places of these kinds in view'}
      side={<>
        <DeskCard title="What to show">
          <TickRows<KindId> label="Kinds of green places in view: press one to show or hide it" onPick={toggle}
            rows={KINDS.map((k) => ({ id: k.id, label: k.label, n: counts[k.id] ?? 0, on: shown.has(k.id) }))} />
          <button type="button" onClick={findMe} className="btn-secondary btn-sm mt-3 inline-flex items-center justify-center gap-1.5"><LocateFixed className="h-4 w-4" aria-hidden />Near me</button>
        </DeskCard>
        {picked && <section className="desk-card p-4" aria-label={picked.name}>
          <div className="rounded-2xl bg-emerald-500/[0.08] p-3" data-no-motion>
            <p className="font-semibold text-zinc-900 dark:text-white" translate="no">{picked.name}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">{KINDS.find((k) => k.id === picked.kind)!.label} · {(km(centre, picked) ?? 0) < 1 ? `${Math.round((km(centre, picked) ?? 0) * 100) * 10} m` : `${(km(centre, picked) ?? 0).toFixed(1)} km`} from the middle of the map</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${picked.lat}%2C${picked.lon}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Directions</a>
              {osm(picked.key) && <a href={osm(picked.key)!} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Details on OpenStreetMap</a>}
            </div>
          </div>
        </section>}
        <section className="desk-card flex flex-col p-4 lg:flex-1" aria-labelledby="gp-near">
          <h2 id="gp-near" className="mb-2 text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Nearest of each</h2>
          <ul className="space-y-0.5">
            {KINDS.map((k) => { const n = list.find((x) => x.s.kind === k.id); return (
              <li key={k.id}>
                {n ? <button type="button" onClick={() => pick(n.s)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: k.color }} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{n.s.name}</span><span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">{k.label}</span></span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{dist(n.d)}</span>
                </button> : <p className="flex items-center gap-2.5 px-1.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />No {k.label.toLowerCase()} in view</p>}
              </li>
            ); })}
          </ul>
        <p className="mt-auto pt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a> · Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenMapTiles</a></p>
        </section>
      </>}
      map={
        <div className="desk-card relative h-[60dvh] min-h-[22rem] overflow-hidden p-0 lg:h-full" data-no-arrange data-no-motion>
          <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map of green places" />
          {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}
          <MapSearch className="absolute start-3 top-3 z-10 w-[min(18rem,calc(100%-1.5rem))]" placeholder="Search a town or street"
            onFound={(f) => { const m = mapRef.current; if (!m) return; if (f.box) m.fitBounds([[f.box[0], f.box[1]], [f.box[2], f.box[3]]], { maxZoom: 16, duration: calm() ? 0 : 1200 }); else m.flyTo({ center: [f.lon, f.lat], zoom: 15, duration: calm() ? 0 : 1200 }); }} />
        </div>
      }
      table={
        <DeskTable<'all' | KindId> title="Places in view" value={tab} onChange={setTab}
          tabs={[{ id: 'all', label: 'All', count: list.length }, ...KINDS.filter((k) => (counts[k.id] ?? 0) > 0).map((k) => ({ id: k.id, label: k.label, count: counts[k.id] }))]}
          head={['Place', 'Kind', 'Distance', '']} cols={GREEN_ROW}
          empty={!list.length ? <p className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">{zoom < 13 ? 'Zoom in to a town or neighbourhood.' : 'None of the kinds you chose in view: move the map.'}</p> : null}>
          {list.filter(({ s: x }) => tab === 'all' || x.kind === tab).slice(0, 150).map(({ s: x, d }) => { const k = KINDS.find((y) => y.id === x.kind)!; return (
            <DeskRow key={x.key} cols={GREEN_ROW} chosen={picked?.key === x.key}>
              <button type="button" onClick={() => pick(x)} className="flex min-w-0 items-center gap-2.5 text-start">
                <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ background: k.color }} aria-hidden />
                <span className="truncate font-semibold text-zinc-900 dark:text-white" translate="no">{x.name}</span>
              </button>
              <span className="truncate text-zinc-700 dark:text-zinc-200">{k.label}</span>
              <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{dist(d)}</span>
              <span className="flex justify-end"><a href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=%3B${x.lat}%2C${x.lon}`} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Directions<span className="sr-only"> to {x.name}</span></a></span>
            </DeskRow>
          ); })}
        </DeskTable>
      } />
  );
}
