'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { Map as MLMap, Marker } from 'maplibre-gl';
import { toast } from 'sonner';
import { BookOpen, Box, Camera, ChevronUp, Compass, Footprints, LocateFixed, Minus, Plus, Star, Sun, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { CATEGORIES, classesOf, kindOf, listingKind, sameOnce, walkFrom, type CategoryId, type MapPlace } from '@/lib/travel-map';
import { osmKey, type Photo, type Story } from '@/lib/travel-place';
import { clockText, localClock, sunTimes, zoneAt } from '@/lib/travel-local';
import { km } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { PlaceSearch } from '../travel-ui';
import { addLayers, points, setData, showClasses, sunlight, STYLE } from './map-layers';
import { PlaceCard, type Picked } from './PlaceCard';
import { TripPicker } from './TripPicker';

// UniVerse Travel's map (M209, the owner: "make the map detailed with all the information like the apple
// maps … something different that nobody has"): OpenFreeMap's vector map of OpenStreetMap (every street,
// building in 3D, and place), lit by where the sun really is at that place and the hour you pick; the
// kind of place you want in the accent with a list of those in view; tap any place for its real facts
// (open or not at that hour, in its own time), its photo and story, and UniVerse's reviews with locals
// apart from visitors; layers of photos people took there (Commons) and stories of places nearby
// (Wikipedia); and "Walk from here", the notable sights nearby strung into a walk. Loaded only when
// opened (src/components/travel/TravelExplore.tsx).

type View = { lat: number; lon: number; zoom: number; s: number; w: number; n: number; e: number };
type Walk = ReturnType<typeof walkFrom>;
const KEEP = 'uv-travel-map', HOME = { lat: 38.7139, lon: -9.1394, zoom: 14 };
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const metres = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1)} km`);
const ctl = 'flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--card-bg)] text-zinc-800 shadow-md ring-1 ring-black/5 transition-transform duration-150 active:scale-95 dark:text-zinc-100 dark:ring-white/10';

/** Where to open: ?at=lat,lon,zoom, else the last view on this device, else Lisbon. */
function startAt(at: string | null) {
  const m = at ? /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(at) : null;
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), zoom: Number(m[3] ?? 15) };
  try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return { lat: v.lat, lon: v.lon, zoom: Math.min(18, Math.max(3, v.zoom ?? 14)) }; } catch { /* private mode */ }
  return HOME;
}

function drawPicked(m: MLMap, p: Picked | null) {
  const at2 = !p ? null : p.type === 'place' ? p : p.type === 'story' ? p.story : p.photo;
  setData(m, 'uv-sel', points(at2 ? [{ lat: at2.lat, lon: at2.lon, props: {} }] : []));
}
function drawWalk(m: MLMap, w: Walk | null) {
  const c = m.getCenter();
  setData(m, 'uv-walk', !w ? points([]) : { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[c.lng, c.lat], ...w.stops.map((s) => [s.lon, s.lat])] }, properties: {} },
    ...w.stops.map((s, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] }, properties: { n: String(i + 1) } })),
  ] });
}
function fly(m: MLMap, to: { lat: number; lon: number; box?: [number, number, number, number] | null }) {
  if (to.box && Math.abs(to.box[2] - to.box[0]) > 0.01) m.fitBounds([[to.box[0], to.box[1]], [to.box[2], to.box[3]]], { padding: 40, maxZoom: 15, duration: calm() ? 0 : 1800 });
  else m.flyTo({ center: [to.lon, to.lat], zoom: 15, duration: calm() ? 0 : 1800, essential: true });
}

export default function TravelMap({ at, place }: { at: string | null; place: string | null }) {
  const box = useRef<HTMLDivElement>(null), mapRef = useRef<MLMap | null>(null), photoMarks = useRef<Marker[]>([]), meMark = useRef<Marker | null>(null);
  const dark = useDarkMode(), now = useNow();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [cat, setCat] = useState<CategoryId>('see');
  const [show, setShow] = useState({ photos: false, stories: true, reviews: true, d3: true });
  const [picked, setPicked] = useState<Picked | null>(null);
  const [list, setList] = useState<MapPlace[]>([]);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [walkFor, setWalkFor] = useState(180);
  const [shift, setShift] = useState(0); // half hours from now
  const [bearing, setBearing] = useState(0);
  const [open, setOpen] = useState(false); // the panel on a phone
  const applied = useRef<string | null>(null); // the style the map has

  // Data for what's in view (rounded, so small moves reuse the answer).
  const near = view && view.zoom >= 12 ? `lat=${view.lat.toFixed(2)}&lon=${view.lon.toFixed(2)}&r=${Math.min(10_000, Math.round((km({ lat: view.s, lon: view.w }, { lat: view.n, lon: view.e }) ?? 4) * 500 / 100) * 100)}` : null;
  const { data: stories } = useSWR<{ stories: Story[] }>(show.stories && near ? `/travel/stories?${near}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: photos } = useSWR<{ photos: Photo[]; credit: string }>(show.photos && near ? `/travel/photos?${near}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const box4 = view && view.zoom >= 11 ? `s=${view.s.toFixed(3)}&w=${view.w.toFixed(3)}&n=${view.n.toFixed(3)}&e=${view.e.toFixed(3)}` : null;
  const { data: reviewed } = useSWR<{ places: { place: string; name: string; lat: number; lon: number; average: number; count: number }[] }>(show.reviews && box4 ? `/travel/reviews/near?${box4}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const storyList = useMemo(() => (show.stories ? stories?.stories ?? [] : []), [show.stories, stories]);
  const reviewFc = useMemo(() => points((show.reviews ? reviewed?.places ?? [] : []).map((r) => ({ lat: r.lat, lon: r.lon, props: { place: r.place, name: r.name, label: `${r.average}★` } }))), [show.reviews, reviewed]);
  const when = useMemo(() => new Date((now || 0) + shift * 1_800_000), [now, shift]);
  const centre = view ?? { ...HOME, s: 0, w: 0, n: 0, e: 0 };
  const zone = zoneAt(centre.lat, centre.lon), clock = localClock(zone, when), sun = sunTimes(centre.lat, centre.lon, when);

  /** The places of the chosen kind in view, the notable and near the middle first. */
  const readList = useEffectEvent((m: MLMap) => {
    if (m.getZoom() < 12) { setList([]); return; }
    const b = m.getBounds(), c = m.getCenter(), seen = new Set<string>(), out: MapPlace[] = [];
    for (const f of m.querySourceFeatures('openmaptiles', { sourceLayer: 'poi', filter: ['in', ['get', 'class'], ['literal', [...classesOf(cat)]]] })) {
      const name = (f.properties.name_en ?? f.properties.name) as string | undefined;
      if (!name || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!b.contains([lon, lat])) continue;
      const key = osmKey(f.id) ?? `${name}@${lat.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, name, cls: f.properties.class as string, sub: f.properties.subclass as string, rank: Number(f.properties.rank) || 99, lat, lon });
    }
    const here = { lat: c.lat, lon: c.lng };
    setList(sameOnce(out.sort((a, z) => a.rank - z.rank || km(here, a)! - km(here, z)!)).slice(0, 40));
  });
  /** Our layers, again after every style change (light and dark), with what was shown. */
  const onStyle = useEffectEvent((m: MLMap) => {
    addLayers(m, dark);
    showClasses(m, classesOf(cat));
    setData(m, 'uv-stories', points(storyList.map((st, i) => ({ lat: st.lat, lon: st.lon, props: { i } }))));
    setData(m, 'uv-reviews', reviewFc);
    drawWalk(m, walk);
    drawPicked(m, picked);
    setReady(true);
  });
  const onPick = useEffectEvent((p: Picked) => pick(p));
  const firstView = useEffectEvent(() => ({ start: startAt(at), style: STYLE[dark ? 'dark' : 'light'] }));
  const onClick = useEffectEvent((m: MLMap, x: number, y: number) => {
    const hits = m.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]]);
    const story = hits.find((f) => f.layer.id === 'uv-stories'), rev = hits.find((f) => f.layer.id === 'uv-reviews' || f.layer.id === 'uv-reviews-stars');
    const poi = hits.find((f) => f.sourceLayer === 'poi' && (f.properties.name || f.properties.name_en));
    if (story) { const st = storyList[Number(story.properties.i)]; if (st) pick({ type: 'story', story: st }); }
    else if (rev) { const [lon, lat] = (rev.geometry as GeoJSON.Point).coordinates; pick({ type: 'place', key: /^[NWR]\d+$/.test(rev.properties.place) ? rev.properties.place : null, review: rev.properties.place, name: rev.properties.name, kind: 'Reviewed on UniVerse', lat, lon }); }
    else if (poi && poi.geometry.type === 'Point') {
      const [lon, lat] = poi.geometry.coordinates;
      pick({ type: 'place', key: osmKey(poi.id), name: (poi.properties.name_en ?? poi.properties.name) as string, kind: kindOf(poi.properties.class as string, poi.properties.subclass as string), cls: poi.properties.class as string, lat, lon });
    }
  });

  // The map, made once (MapLibre loads only now; its worker comes from this site).
  useEffect(() => {
    let gone = false, map: MLMap | null = null;
    void (async () => {
      const ml = await import('maplibre-gl');
      ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      if (gone || !box.current) return;
      const { start: s, style } = firstView();
      applied.current = style;
      map = new ml.Map({
        container: box.current, style, center: [s.lon, s.lat], zoom: s.zoom, pitch: s.zoom >= 15 ? 50 : 0, maxPitch: 75,
        attributionControl: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1), fadeDuration: 150, maplibreLogo: false,
      });
      mapRef.current = map;
      const read = () => {
        const m = map!, c = m.getCenter(), b = m.getBounds();
        setView({ lat: c.lat, lon: c.lng, zoom: m.getZoom(), s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
        try { localStorage.setItem(KEEP, JSON.stringify({ lat: c.lat, lon: c.lng, zoom: m.getZoom() })); } catch { /* private mode */ }
      };
      map.on('style.load', () => onStyle(map!));
      map.on('moveend', read);
      map.on('load', read);
      map.on('rotate', () => setBearing(map!.getBearing()));
      map.on('idle', () => readList(map!));
      map.on('click', (e) => onClick(map!, e.point.x, e.point.y));
      for (const id of ['uv-stories', 'uv-reviews']) {
        map.on('mouseenter', id, () => { map!.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map!.getCanvas().style.cursor = ''; });
      }
    })();
    const marks = photoMarks.current;
    return () => { gone = true; marks.forEach((mk) => mk.remove()); map?.remove(); mapRef.current = null; };
  }, []); // made once: later changes reach it through the effects below

  // Light and dark: the style changes, our layers come back on 'style.load'.
  useEffect(() => {
    const m = mapRef.current, style = STYLE[dark ? 'dark' : 'light'];
    if (m && ready && applied.current !== style) { applied.current = style; m.setStyle(style); }
  }, [dark, ready]);
  // The kind of place chosen.
  useEffect(() => { const m = mapRef.current; if (m && ready) { showClasses(m, classesOf(cat)); readList(m); } }, [cat, ready]);
  // Where the sun is, for the hour chosen, lights the buildings.
  useEffect(() => { const m = mapRef.current; if (m && ready && view) sunlight(m, view.lat, view.lon, when); }, [ready, view, when]);
  // Wikipedia's stories and UniVerse's reviews on the map.
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-stories', points(storyList.map((st, i) => ({ lat: st.lat, lon: st.lon, props: { i } })))); }, [storyList, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-reviews', reviewFc); }, [reviewFc, ready]);
  // Photos people took here: small round pictures (at most 30).
  useEffect(() => {
    const m = mapRef.current;
    photoMarks.current.forEach((mk) => mk.remove());
    photoMarks.current = [];
    if (!m || !ready || !show.photos) return;
    void import('maplibre-gl').then((ml) => {
      for (const ph of (photos?.photos ?? []).slice(0, 30)) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'h-11 w-11 overflow-hidden rounded-full shadow-lg ring-2 ring-white transition-transform duration-150 hover:scale-110';
        el.setAttribute('aria-label', `Photo: ${ph.title}`);
        el.style.backgroundImage = `url("${ph.thumb.replace(/"/g, '%22')}")`;
        el.style.backgroundSize = 'cover';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); onPick({ type: 'photo', photo: ph }); });
        photoMarks.current.push(new ml.Marker({ element: el }).setLngLat([ph.lon, ph.lat]).addTo(m));
      }
    });
  }, [photos, show.photos, ready]);
  // 3D: tilt and buildings.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    for (const l of m.getStyle().layers ?? []) if (l.type === 'fill-extrusion') m.setLayoutProperty(l.id, 'visibility', show.d3 ? 'visible' : 'none');
    m.easeTo({ pitch: show.d3 && m.getZoom() >= 14 ? 50 : 0, duration: calm() ? 0 : 600 });
  }, [show.d3, ready]);
  // A place asked for from a guide (?d=…): find where it is and go there.
  useEffect(() => {
    if (!place || !ready) return;
    void api.get<{ lat: number; lon: number; box: [number, number, number, number] | null }>(`/travel/where?q=${encodeURIComponent(place)}`).then(({ data }) => { if (mapRef.current) fly(mapRef.current, data); }).catch(() => {});
  }, [place, ready]);

  function pick(p: Picked | null) {
    setPicked(p);
    if (p) setOpen(true);
    const m = mapRef.current;
    if (!m) return;
    drawPicked(m, p);
    if (p) { const at2 = p.type === 'place' ? p : p.type === 'story' ? p.story : p.photo; m.easeTo({ center: [at2.lon, at2.lat], duration: calm() ? 0 : 500, offset: window.innerWidth >= 640 ? [180, 0] : [0, -120] }); }
  }
  const findMe = () => navigator.geolocation?.getCurrentPosition(async (p) => {
    const m = mapRef.current, ml = await import('maplibre-gl');
    if (!m) return;
    const el = document.createElement('span');
    el.className = 'block h-4 w-4 rounded-full bg-sky-500 ring-4 ring-sky-500/30 shadow';
    meMark.current?.remove();
    meMark.current = new ml.Marker({ element: el }).setLngLat([p.coords.longitude, p.coords.latitude]).addTo(m);
    m.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16, duration: calm() ? 0 : 1500, essential: true });
  }, () => toast.error('Your browser didn’t share where you are.'), { enableHighAccuracy: true, timeout: 10_000 });
  const startWalk = () => {
    const m = mapRef.current;
    if (!m) return;
    const c = m.getCenter(), sights: MapPlace[] = [], seen = new Set<string>();
    for (const f of m.querySourceFeatures('openmaptiles', { sourceLayer: 'poi', filter: ['in', ['get', 'class'], ['literal', [...classesOf('see')]]] })) {
      const name = (f.properties.name_en ?? f.properties.name) as string | undefined, key = osmKey(f.id);
      if (!name || !key || seen.has(key) || f.geometry.type !== 'Point') continue;
      seen.add(key);
      sights.push({ key, name, cls: f.properties.class as string, sub: f.properties.subclass as string, rank: Number(f.properties.rank) || 99, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
    }
    const w = walkFrom({ lat: c.lat, lon: c.lng }, sights, walkFor);
    if (!w.stops.length) { toast('No sights within a walk of here: move the map or zoom in.'); return; }
    setWalk(w); setPicked(null); setOpen(true);
    drawWalk(m, w);
    const lons = [c.lng, ...w.stops.map((s) => s.lon)], lats = [c.lat, ...w.stops.map((s) => s.lat)];
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: { top: 120, bottom: 120, left: window.innerWidth >= 640 ? 420 : 40, right: 80 }, maxZoom: 16.5, duration: calm() ? 0 : 1200 });
  };
  const endWalk = () => { setWalk(null); if (mapRef.current) drawWalk(mapRef.current, null); };
  const toggle = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const startClock = clockText(zone, when), sunTxt = sun ? `Sunrise ${clockText(zone, sun.rise)} · golden hour ${clockText(zone, sun.goldenEvening)} · sunset ${clockText(zone, sun.set)}` : 'No sunrise or sunset today';
  const panelTitle = picked ? null : walk ? `A ${Math.round(walk.total / 6) / 10} h walk` : `${CATEGORIES.find((c) => c.id === cat)!.label} here`;
  return (
    <div className="relative h-[calc(100dvh-12rem)] min-h-[32rem] overflow-hidden rounded-[var(--radius-card)] bg-zinc-200 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10" data-no-arrange data-no-motion>
      {/* Inline: MapLibre's own stylesheet makes its container position: relative. */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}

      {/* Search and the kinds of place. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:end-auto sm:w-[24rem]">
        <div className="pointer-events-auto rounded-2xl bg-[var(--card-bg)] p-1.5 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
          <PlaceSearch label="Find a place on the map" placeholder="Search a city, island or park…" onPick={(t) => void api.get<{ lat: number; lon: number; box: [number, number, number, number] | null }>(`/travel/where?q=${encodeURIComponent(t)}`).then(({ data }) => { if (mapRef.current) fly(mapRef.current, data); }).catch(() => toast.error('That place isn’t on the map.'))} />
        </div>
        <div className="pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Kind of place">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => { setCat(c.id); endWalk(); pick(null); }}
              className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-md ring-1 transition-colors', cat === c.id ? 'bg-sky-700 text-white ring-sky-700' : 'bg-[var(--card-bg)] text-zinc-800 ring-black/5 hover:bg-zinc-100 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-white/10')}>{c.label}</button>
          ))}
        </div>
      </div>

      {/* Controls. */}
      {/* A row under the kinds of place on a phone (pinch to zoom there), a column on the right on a computer. */}
      <div className="absolute end-3 top-[6.9rem] z-20 flex flex-row gap-2 sm:top-3 sm:flex-col">
        <button type="button" className={cn(ctl, 'hidden sm:flex')} aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="h-5 w-5" aria-hidden /></button>
        <button type="button" className={cn(ctl, 'hidden sm:flex')} aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="h-5 w-5" aria-hidden /></button>
        <button type="button" className={ctl} aria-label="Face north" onClick={() => mapRef.current?.resetNorthPitch({ duration: calm() ? 0 : 500 })}><Compass className="h-5 w-5 transition-transform" style={{ transform: `rotate(${-bearing - 45}deg)` }} aria-hidden /></button>
        <button type="button" className={ctl} aria-label="Where I am" onClick={findMe}><LocateFixed className="h-5 w-5" aria-hidden /></button>
        <span className="hidden h-1 sm:block" aria-hidden />
        {([['d3', '3D buildings', Box], ['photos', 'Photos people took', Camera], ['stories', 'Stories of places', BookOpen], ['reviews', 'UniVerse reviews', Star]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" aria-pressed={show[k]} aria-label={label} title={label} onClick={() => toggle(k)} className={cn(ctl, show[k] && 'bg-sky-700 text-white ring-sky-700 dark:text-white')}><Icon className="h-5 w-5" aria-hidden /></button>
        ))}
      </div>

      {/* The panel: the places in view, a place, or a walk; with the hour and the sun. */}
      <aside aria-label="Places" className={cn('absolute inset-x-2 bottom-2 z-30 flex max-h-[58%] flex-col rounded-2xl bg-[var(--card-bg)] shadow-2xl ring-1 ring-black/5 dark:ring-white/10 sm:inset-x-auto sm:bottom-3 sm:start-3 sm:top-[7.4rem] sm:max-h-none sm:w-[24rem]')}>
        <div className="border-b border-zinc-200/70 p-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              <span className="flex justify-between gap-2"><span>{shift ? `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][clock.day]} ${startClock}` : `Now ${startClock}`} <span className="font-normal text-zinc-500 dark:text-zinc-400">their time</span></span>{shift > 0 && <button type="button" onClick={() => setShift(0)} className="text-sky-700 dark:text-sky-300">Now</button>}</span>
              <input type="range" min={0} max={47} step={1} value={shift} onChange={(e) => setShift(Number(e.target.value))} aria-label="The hour at this place" className="mt-1 w-full accent-sky-600" />
            </label>
            <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost btn-sm p-1.5 sm:hidden" aria-expanded={open} aria-label={open ? 'Show less' : 'Show more'}><ChevronUp className={cn('h-5 w-5 transition-transform duration-200', !open && 'rotate-180')} aria-hidden /></button>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sunTxt}. The buildings are lit from where the sun is.</p>
        </div>
        <div className={cn('min-h-0 flex-1 flex-col p-3', open ? 'flex' : 'hidden sm:flex')}>
          {picked ? <PlaceCard key={JSON.stringify(picked).slice(0, 200)} picked={picked} at={when} onClose={() => pick(null)} /> : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-zinc-900 dark:text-white">{panelTitle}</h3>
                {walk ? <button type="button" onClick={endWalk} className="btn-ghost btn-sm inline-flex items-center gap-1"><X className="h-4 w-4" aria-hidden />End</button> : (
                  <span className="flex items-center gap-1">
                    <label className="sr-only" htmlFor="walk-for">How long a walk</label>
                    <select id="walk-for" value={walkFor} onChange={(e) => setWalkFor(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                      {[60, 120, 180, 240].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
                    </select>
                    <button type="button" onClick={startWalk} disabled={!ready} className="btn-primary btn-sm inline-flex items-center gap-1"><Footprints className="h-4 w-4" aria-hidden />Walk from here</button>
                  </span>
                )}
              </div>
              <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
                {walk ? walk.stops.map((s, i) => (
                  <li key={s.key}>
                    <p className="ps-9 text-xs text-zinc-500 dark:text-zinc-400"><Footprints className="me-1 inline h-3.5 w-3.5" aria-hidden />{s.walk} min walk</p>
                    <button type="button" onClick={() => pick({ type: 'place', key: s.key, name: s.name, kind: kindOf(s.cls, s.sub), cls: s.cls, lat: s.lat, lon: s.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white" aria-hidden>{i + 1}</span>
                      <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(s.cls, s.sub)} · at {clockText(zone, new Date(when.getTime() + s.at * 60_000))}, about {s.stay} min</span></span>
                    </button>
                  </li>
                )) : list.map((p) => (
                  <li key={p.key}>
                    <button type="button" onClick={() => pick({ type: 'place', key: /^[NWR]\d+$/.test(p.key) ? p.key : null, name: p.name, kind: kindOf(p.cls, p.sub), cls: p.cls, lat: p.lat, lon: p.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(p.cls, p.sub)}</span></span>
                      {view && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{metres(km(view, p) ?? 0)}</span>}
                    </button>
                  </li>
                ))}
                {!walk && !list.length && <li className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-300">{view && view.zoom < 12 ? 'Zoom in to see the places here.' : 'None of these in view: move the map or pick another kind.'}</li>}
              </ol>
              {walk && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                  <span>{walk.stops.length} stops · {walk.km} km on foot · back by {clockText(zone, new Date(when.getTime() + walk.total * 60_000))}</span>
                  <TripPicker items={walk.stops.map((s) => ({ name: s.name, kind: listingKind(s.cls), lat: s.lat, lon: s.lon }))} city={null} cc={null} />
                </div>
              )}
            </>
          )}
        </div>
        <p className="border-t border-zinc-200/70 px-3 py-1.5 text-[11px] leading-snug text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>{show.photos && photos?.credit ? ` · ${photos.credit}` : ''}
        </p>
      </aside>
    </div>
  );
}
