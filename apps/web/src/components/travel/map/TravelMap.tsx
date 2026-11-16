'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { Map as MLMap, Marker } from 'maplibre-gl';
import { toast } from 'sonner';
import { BookOpen, Box, Camera, ChevronUp, Compass, Footprints, Layers, LocateFixed, Minus, Plus, ScanEye, Search, Star, Sun, TrainFront, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { CATEGORIES, classesOf, kindOf, listingKind, sameOnce, streetPhotoOf, walkFrom, type CategoryId, type MapPlace } from '@/lib/travel-map';
import { osmKey, type Photo, type Story } from '@/lib/travel-place';
import { clockText, localClock, sunTimes, zoneAt } from '@/lib/travel-local';
import { km } from '@/lib/travel-plan';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/Segmented';
import { PlaceSearch } from '../travel-ui';
import { addLayers, applyLook, meArea, points, rings, setData, showClasses, skyFor, sunlight, STYLE } from './map-layers';
import { PlaceCard, type Picked } from './PlaceCard';
import { addPins, drawPins, PINS, PinSource, type PinImages } from './pins';
import { TripPicker } from './TripPicker';

// UniVerse Travel's map (M209, the owner: "make the map detailed with all the information like the apple
// maps … something different that nobody has"): OpenFreeMap's vector map of OpenStreetMap (every street,
// building in 3D, and place), lit by where the sun really is at that place and the hour you pick; the
// kind of place you want in the accent with a list of those in view; tap any place for its real facts
// (open or not at that hour, in its own time), its photo and story, and UniVerse's reviews with locals
// apart from visitors; layers of photos people took there (Commons) and stories of places nearby
// (Wikipedia); and "Walk from here", the notable sights nearby strung into a walk. Loaded only when
// opened (src/components/travel/TravelExplore.tsx). M214 (the owner: "more good looking and accurate … a lot
// of details and features … my cloudflare cpu limit should not rise"): hills in relief and 3D terrain, a
// satellite view, the globe when zoomed out, a sky that follows the sun, public transport, street-level
// photos ("look around"), walking-distance rings, where I am with how sure the phone is, a Layers panel
// (remembered on the device) and a filter for the places in view. Every tile and picture goes straight
// from its free source to the browser; the Worker does nothing more.

type View = { lat: number; lon: number; zoom: number; s: number; w: number; n: number; e: number };
type Walk = ReturnType<typeof walkFrom>;
const KEEP = 'uv-travel-map', LOOK = 'uv-travel-map-look', HOME = { lat: 38.7139, lon: -9.1394, zoom: 14 };
const SHOW = { photos: false, stories: true, reviews: true, d3: true, satellite: false, transit: false, street: false, rings: false };
type Show = typeof SHOW;
/** The layers chosen last time on this device. */
function shownBefore(): Show {
  try { const v = JSON.parse(localStorage.getItem(LOOK) ?? 'null'); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(SHOW).map((k) => [k, typeof v[k] === 'boolean' ? v[k] : SHOW[k as keyof Show]])) as Show; } catch { /* private mode */ }
  return SHOW;
}
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
  const box = useRef<HTMLDivElement>(null), pinBox = useRef<HTMLDivElement>(null), pins = useRef<PinImages>(new Map()), mapRef = useRef<MLMap | null>(null), photoMarks = useRef<Marker[]>([]), me = useRef<GeoJSON.FeatureCollection | null>(null);
  const dark = useDarkMode(), now = useNow();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [cat, setCat] = useState<CategoryId>('see');
  const [show, setShow] = useState<Show>(shownBefore);
  const [layers, setLayers] = useState(false); // the Layers panel
  const [filter, setFilter] = useState('');
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
    addPins(m, pins.current);
    addLayers(m, dark);
    showClasses(m, classesOf(cat), `uv-pin-${cat}`);
    setData(m, 'uv-stories', points(storyList.map((st, i) => ({ lat: st.lat, lon: st.lon, props: { i } }))));
    setData(m, 'uv-reviews', reviewFc);
    drawWalk(m, walk);
    drawPicked(m, picked);
    applyLook(m, show);
    if (me.current) setData(m, 'uv-me', me.current);
    setReady(true);
  });
  const onPick = useEffectEvent((p: Picked) => pick(p));
  const firstView = useEffectEvent(() => ({ start: startAt(at), style: STYLE[dark ? 'dark' : 'light'] }));
  const onClick = useEffectEvent((m: MLMap, x: number, y: number, lat: number, lon: number) => {
    const hits = m.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]]);
    if (show.street && hits.some((f) => f.layer.id === 'uv-street') && !hits.some((f) => f.layer.id === 'uv-stories' || f.layer.id === 'uv-reviews')) { void lookAround(lat, lon); return; }
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
      pins.current = await drawPins(pinBox.current); // the pins, drawn before the first style asks for them
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
      map.on('click', (e) => onClick(map!, e.point.x, e.point.y, e.lngLat.lat, e.lngLat.lng));
      for (const id of ['uv-stories', 'uv-reviews', 'uv-street', 'uv-hit']) {
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
  useEffect(() => { const m = mapRef.current; if (m && ready) { showClasses(m, classesOf(cat), `uv-pin-${cat}`); readList(m); } }, [cat, ready]);
  // Where the sun is, for the hour chosen, lights the buildings.
  useEffect(() => { const m = mapRef.current; if (m && ready && view) skyFor(m, sunlight(m, view.lat, view.lon, when).altitude, dark); }, [ready, view, when, dark]);
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
  // The layers (satellite, 3D terrain and buildings, transit, street photos), kept for next time.
  useEffect(() => {
    const m = mapRef.current;
    try { localStorage.setItem(LOOK, JSON.stringify(show)); } catch { /* private mode */ }
    if (m && ready) applyLook(m, show);
  }, [show, ready]);
  // 3D: tilt when turned on or off.
  useEffect(() => {
    const m = mapRef.current;
    if (m && ready) m.easeTo({ pitch: show.d3 && m.getZoom() >= 12 ? 55 : 0, duration: calm() ? 0 : 600 });
  }, [show.d3, ready]);
  // How far you can walk from the middle of the map.
  useEffect(() => {
    const m = mapRef.current;
    if (m && ready) setData(m, 'uv-rings', show.rings && view && view.zoom >= 12 ? rings(view.lat, view.lon) : points([]));
  }, [show.rings, view, ready]);
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
    if (p) {
      // M214 (the owner: "auto zoom when i click on the specific restaurant … smooth"): glide in to it (close,
      // tilted in 3D), leaving room for the card; a short ease when already close.
      const at2 = p.type === 'place' ? p : p.type === 'story' ? p.story : p.photo, z = m.getZoom(), to = Math.max(z, 17);
      const offset: [number, number] = window.innerWidth >= 640 ? [190, 40] : [0, -140];
      if (calm()) m.jumpTo({ center: [at2.lon, at2.lat], zoom: to });
      else if (to - z < 0.5) m.easeTo({ center: [at2.lon, at2.lat], offset, duration: 650, easing: (t) => 1 - Math.pow(1 - t, 3) });
      else m.flyTo({ center: [at2.lon, at2.lat], zoom: to, pitch: show.d3 ? 58 : 0, offset, speed: 0.9, curve: 1.3, maxDuration: 1600, essential: true, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    }
  }
  const findMe = () => navigator.geolocation?.getCurrentPosition((p) => {
    const m = mapRef.current;
    if (!m) return;
    // A blue dot, and a circle as wide as the phone is unsure (shown only on this screen, never sent).
    me.current = meArea(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
    setData(m, 'uv-me', me.current);
    m.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 16, duration: calm() ? 0 : 1500, essential: true });
    if (p.coords.accuracy > 200) toast(`Your position is only sure to about ${Math.round(p.coords.accuracy / 100) / 10} km.`);
  }, () => toast.error('Your browser didn’t share where you are.'), { enableHighAccuracy: true, timeout: 10_000 });
  /** "Look around": the nearest street-level photo to where the map was tapped (Panoramax, from the browser). */
  async function lookAround(lat: number, lon: number) {
    try {
      const res = await fetch(`https://api.panoramax.xyz/api/search?place_position=${lon.toFixed(6)},${lat.toFixed(6)}&place_distance=0-60&limit=8`);
      const photo = res.ok ? streetPhotoOf(await res.json()) : null;
      if (photo) pick({ type: 'street', photo }); else toast('No street photo right here: tap closer to an orange line.');
    } catch { toast.error('Couldn’t reach Panoramax just now.'); }
  }
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
  const toggle = (k: keyof Show) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const shown = filter.trim() ? list.filter((p) => fold(p.name).includes(fold(filter.trim()))) : list;

  const startClock = clockText(zone, when), sunTxt = sun ? `Sunrise ${clockText(zone, sun.rise)} · golden hour ${clockText(zone, sun.goldenEvening)} · sunset ${clockText(zone, sun.set)}` : 'No sunrise or sunset today';
  const panelTitle = picked ? null : walk ? `A ${Math.round(walk.total / 6) / 10} h walk` : `${CATEGORIES.find((c) => c.id === cat)!.label} here`;
  return (
    <div className="relative h-[calc(100dvh-12rem)] min-h-[32rem] overflow-hidden rounded-[var(--radius-card)] bg-zinc-200 ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10" data-no-arrange data-no-motion>
      <PinSource ref={pinBox} />
      {/* Inline: MapLibre's own stylesheet makes its container position: relative. */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}

      {/* Search and the kinds of place. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:end-auto sm:w-[24rem]">
        <div className="pointer-events-auto rounded-2xl bg-[var(--card-bg)] p-1.5 shadow-lg ring-1 ring-black/5 dark:ring-white/10">
          <PlaceSearch label="Find a place on the map" placeholder="Search a city, island or park…" onPick={(t) => void api.get<{ lat: number; lon: number; box: [number, number, number, number] | null }>(`/travel/where?q=${encodeURIComponent(t)}`).then(({ data }) => { if (mapRef.current) fly(mapRef.current, data); }).catch(() => toast.error('That place isn’t on the map.'))} />
        </div>
        <div className="pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Kind of place">
          {CATEGORIES.map((c) => {
            const Icon = PINS[c.id].icon;
            return (
              <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => { setCat(c.id); setFilter(''); endWalk(); pick(null); }}
                className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pe-3.5 ps-2.5 text-sm font-semibold shadow-md ring-1 transition-colors', cat === c.id ? 'bg-indigo-700 text-white ring-indigo-700' : 'bg-[var(--card-bg)] text-zinc-800 ring-black/5 hover:bg-zinc-100 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-white/10')}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: PINS[c.id].color }} aria-hidden><Icon className="h-3 w-3" /></span>{c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls. */}
      {/* A row under the kinds of place on a phone (pinch to zoom there), a column on the right on a computer. */}
      <div className="absolute end-3 top-[6.9rem] z-20 flex flex-row gap-2 sm:top-3 sm:flex-col">
        <button type="button" className={cn(ctl, 'hidden sm:flex')} aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="h-5 w-5" aria-hidden /></button>
        <button type="button" className={cn(ctl, 'hidden sm:flex')} aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="h-5 w-5" aria-hidden /></button>
        <button type="button" className={ctl} aria-label="Face north" onClick={() => mapRef.current?.resetNorthPitch({ duration: calm() ? 0 : 500 })}><Compass className="h-5 w-5 transition-transform" style={{ transform: `rotate(${-bearing - 45}deg)` }} aria-hidden /></button>
        <button type="button" className={ctl} aria-label="Where I am" onClick={findMe}><LocateFixed className="h-5 w-5" aria-hidden /></button>
        <button type="button" className={cn(ctl, layers && 'bg-indigo-700 text-white ring-indigo-700 dark:text-white')} aria-label="Layers" aria-expanded={layers} aria-controls="map-layers" onClick={() => setLayers((o) => !o)}><Layers className="h-5 w-5" aria-hidden /></button>
      </div>
      {layers && (
        <div id="map-layers" role="dialog" aria-label="Map layers" onKeyDown={(e) => { if (e.key === 'Escape') setLayers(false); }}
          className="absolute end-3 top-[10.2rem] z-40 w-[min(18rem,calc(100%-1.5rem))] origin-top-right rounded-2xl bg-[var(--card-bg)] p-3 shadow-2xl ring-1 ring-black/5 animate-[layers-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none dark:ring-white/10 sm:end-16 sm:top-3 rtl:origin-top-left">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-zinc-900 dark:text-white">Layers</h3><button type="button" onClick={() => setLayers(false)} className="btn-ghost btn-sm p-1" aria-label="Close layers"><X className="h-4 w-4" aria-hidden /></button></div>
          <Segmented<'map' | 'sat'> label="Map" className="mb-3" value={show.satellite ? 'sat' : 'map'} onChange={(v) => setShow((x) => ({ ...x, satellite: v === 'sat' }))} segments={[{ value: 'map', label: 'Map' }, { value: 'sat', label: 'Satellite' }]} />
          {show.satellite && <p className="-mt-1 mb-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">Pictures from the Sentinel-2 satellites: clear for cities, coasts and nature, soft close up.</p>}
          <ul className="space-y-0.5">
            {([['d3', '3D hills and buildings', Box], ['transit', 'Trains, metro and ferries', TrainFront], ['street', 'Street photos (look around)', ScanEye], ['rings', 'Walking distance', Footprints], ['photos', 'Photos people took', Camera], ['stories', 'Stories of places', BookOpen], ['reviews', 'UniVerse reviews', Star]] as const).map(([k, label, Icon]) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.06]">
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <input type="checkbox" checked={show[k]} onChange={() => toggle(k)} className="h-4 w-4 accent-indigo-600" />
                </label>
              </li>
            ))}
          </ul>
          {show.street && <p className="mt-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">Zoom in close: orange lines are streets someone photographed. Tap one to look around.</p>}
          {show.rings && <p className="mt-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">Rings around the middle of the map: 5, 10 and 15 minutes on foot.</p>}
        </div>
      )}

      {/* The panel: the places in view, a place, or a walk; with the hour and the sun. */}
      <aside aria-label="Places" className={cn('absolute inset-x-2 bottom-2 z-30 flex max-h-[58%] flex-col rounded-2xl bg-[var(--card-bg)] shadow-2xl ring-1 ring-black/5 dark:ring-white/10 sm:inset-x-auto sm:bottom-3 sm:start-3 sm:top-[7.4rem] sm:max-h-none sm:w-[24rem]')}>
        <div className="border-b border-zinc-200/70 p-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <label className="min-w-0 flex-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              <span className="flex justify-between gap-2"><span>{shift ? `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][clock.day]} ${startClock}` : `Now ${startClock}`} <span className="font-normal text-zinc-500 dark:text-zinc-400">their time</span></span>{shift > 0 && <button type="button" onClick={() => setShift(0)} className="text-indigo-700 dark:text-indigo-300">Now</button>}</span>
              <input type="range" min={0} max={47} step={1} value={shift} onChange={(e) => setShift(Number(e.target.value))} aria-label="The hour at this place" className="mt-1 w-full accent-indigo-600" />
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
              {!walk && list.length > 6 && (
                <label className="relative mb-2 block">
                  <span className="sr-only">Filter these places</span>
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                  <input type="search" value={filter} onChange={(e) => setFilter(e.target.value.slice(0, 60))} placeholder={`Filter ${list.length} places in view…`} className="w-full rounded-xl border border-zinc-200 bg-white py-1.5 pe-3 ps-8 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
                </label>
              )}
              <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
                {walk ? walk.stops.map((s, i) => (
                  <li key={s.key}>
                    <p className="ps-9 text-xs text-zinc-500 dark:text-zinc-400"><Footprints className="me-1 inline h-3.5 w-3.5" aria-hidden />{s.walk} min walk</p>
                    <button type="button" onClick={() => pick({ type: 'place', key: s.key, name: s.name, kind: kindOf(s.cls, s.sub), cls: s.cls, lat: s.lat, lon: s.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white" aria-hidden>{i + 1}</span>
                      <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(s.cls, s.sub)} · at {clockText(zone, new Date(when.getTime() + s.at * 60_000))}, about {s.stay} min</span></span>
                    </button>
                  </li>
                )) : shown.map((p) => (
                  <li key={p.key}>
                    <button type="button" onClick={() => pick({ type: 'place', key: /^[NWR]\d+$/.test(p.key) ? p.key : null, name: p.name, kind: kindOf(p.cls, p.sub), cls: p.cls, lat: p.lat, lon: p.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white shadow-sm dark:ring-zinc-900" style={{ background: PINS[cat].color }} aria-hidden>{(() => { const Icon = PINS[cat].icon; return <Icon className="h-3.5 w-3.5" />; })()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(p.cls, p.sub)}</span></span>
                      {view && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{metres(km(view, p) ?? 0)}</span>}
                    </button>
                  </li>
                ))}
                {!walk && !shown.length && <li className="px-2 py-4 text-sm text-zinc-600 dark:text-zinc-300">{list.length ? `No place here matches “${filter.trim()}”.` : view && view.zoom < 12 ? 'Zoom in to see the places here.' : 'None of these in view: move the map or pick another kind.'}</li>}
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
          Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a> · Relief <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer" className="underline">Terrain Tiles</a>{show.satellite && <> · <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer" className="underline">Sentinel-2 cloudless 2016 by EOX</a> (CC BY 4.0, modified Copernicus data)</>}{show.street && <> · Street photos <a href="https://panoramax.fr" target="_blank" rel="noopener noreferrer" className="underline">Panoramax</a> (CC BY-SA 4.0)</>}{show.photos && photos?.credit ? ` · ${photos.credit}` : ''}
        </p>
      </aside>
    </div>
  );
}
