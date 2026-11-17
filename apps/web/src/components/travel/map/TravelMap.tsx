'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { Map as MLMap, Marker, StyleSpecification } from 'maplibre-gl';
import { toast } from 'sonner';
import { BookOpen, Box, Camera, Compass, Footprints, Globe2, Heart, Info, Layers, Loader2, LocateFixed, Luggage, Maximize2, Minimize2, Minus, Navigation, Plus, RotateCw, Ruler, ScanEye, Search, Share, Star, Sun, TrainFront, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Photo as Pic } from '@/components/ui/Photo';
import { api } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useDarkMode } from '@/lib/use-dark';
import { useNow } from '@/lib/use-now';
import { bubbleAt, CATEGORIES, classesOf, kindOf, listingKind, routeOf, routeUrl, sameOnce, streetPhotoOf, walkFrom, walkInGoogle, withLegs, type CategoryId, type MapPlace } from '@/lib/travel-map';
import { osmKey, type Photo, type Story } from '@/lib/travel-place';
import { clockText, localClock, sunTimes, zoneAt } from '@/lib/travel-local';
import { km } from '@/lib/travel-plan';
import { IDEAS } from '@/lib/travel-ideas';
import type { Saved } from '../travel-ui';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/Segmented';
import { PlaceSearch } from '../travel-ui';
import { addLayers, applyLook, focusWalk, meArea, points, rings, setData, showClasses, skyFor, sunlight, STYLE } from './map-layers';
import { mapRequest } from './map-style';
import { DirectionsCard, HereCard, MeasureBar, measureFeatures, routeFeatures, useRoutes, type Directions, type Spot } from './MapTools';
import { PlaceCard, type Picked } from './PlaceCard';
import { addPins, drawPins, labelColor, PINS, PinSource, type PinImages } from './pins';
import { DestCard } from './DestCard';
import { areaSearchUrl, DAY_COLORS, destOf, foundOf, loadWorld, setWorld, showWorld, thumbOf, tripBox, tripDaysOn, tripFeatures, watchPhotos, WORLD_LAYERS, WORLD_ZOOM, type Dest, type Found, type TripMap } from './map-world';
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
/** M233: a walk keeps where it starts and, once the walking router answers, its path along the streets. */
type Walk = ReturnType<typeof walkFrom> & { start: { lat: number; lon: number }; path: [number, number][] | null; routing: boolean };
// M259: a first visit opens on the globe with the world's destinations (Lisbon before).
const KEEP = 'uv-travel-map', LOOK = 'uv-travel-map-look', HOME = { lat: 30, lon: 12, zoom: 1.6 };
const SHOW = { photos: false, stories: true, reviews: true, d3: false, satellite: false, transit: false, street: false, rings: false, world: true, saved: true };
type Show = typeof SHOW;
/** The layers chosen last time on this device. */
function shownBefore(): Show {
  try { const v = JSON.parse(localStorage.getItem(LOOK) ?? 'null'); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(SHOW).map((k) => [k, typeof v[k] === 'boolean' ? v[k] : SHOW[k as keyof Show]])) as Show; } catch { /* private mode */ }
  return SHOW;
}
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const metres = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(1)} km`);
// M233: the map's buttons grouped in rounded capsules, as Apple Maps does (zoom in one, the rest in another).
const group = 'flex overflow-hidden rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 dark:bg-[#1f232b]/95 dark:ring-white/10';
const round = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 transition-[transform,background-color] duration-150 hover:bg-zinc-200 active:scale-95 dark:bg-white/[0.08] dark:text-white dark:hover:bg-white/[0.14]';
const ctl = 'flex h-11 w-11 items-center justify-center text-zinc-800 transition-[transform,background-color] duration-150 hover:bg-zinc-100 active:scale-95 dark:text-zinc-100 dark:hover:bg-white/[0.08]';

/** Where to open: ?at=lat,lon,zoom, else the last view on this device, else Lisbon. */
function startAt(at: string | null) {
  const m = at ? /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(at) : null;
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), zoom: Number(m[3] ?? 15) };
  try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return { lat: v.lat, lon: v.lon, zoom: Math.min(18, Math.max(1, v.zoom ?? 14)) }; } catch { /* private mode */ }
  return HOME;
}

function drawPicked(m: MLMap, p: Picked | null) {
  const at2 = !p ? null : p.type === 'place' ? p : p.type === 'story' ? p.story : p.photo;
  setData(m, 'uv-sel', points(at2 ? [{ lat: at2.lat, lon: at2.lon, props: {} }] : []));
}
function drawWalk(m: MLMap, w: Walk | null) {
  if (!w) { setData(m, 'uv-walk', points([])); return; }
  const path = w.path ?? [[w.start.lon, w.start.lat] as [number, number], ...w.stops.map((s) => [s.lon, s.lat] as [number, number])];
  setData(m, 'uv-walk', { type: 'FeatureCollection', features: [
    // Along the streets when the router answered (exact), else straight from stop to stop (dashed).
    { type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: { exact: !!w.path } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [w.start.lon, w.start.lat] }, properties: { role: 'start' } },
    ...w.stops.map((s, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] }, properties: { role: 'stop', n: String(i + 1), name: s.name, order: i + 1 } })),
    // The whole walk's walking minutes in one bubble on its longest stretch, as Apple Maps shows a route (M233).
    { type: 'Feature', geometry: { type: 'Point', coordinates: bubbleAt(path, [w.start, ...w.stops]) }, properties: { role: 'time', label: `${w.stops.reduce((t, s) => t + s.walk, 0)} min` } },
  ] });
}
/** Room around what's framed, clear of the panel (beside it on a computer, the sheet under it on a phone). */
const clearOfPanel = (m: MLMap) => (m.getContainer().clientWidth >= 640 ? { top: 90, bottom: 60, left: 420, right: 80 } : { top: 110, bottom: 300, left: 40, right: 70 });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function fly(m: MLMap, to: { lat: number; lon: number; box?: [number, number, number, number] | null }) {
  if (to.box && Math.abs(to.box[2] - to.box[0]) > 0.01) m.fitBounds([[to.box[0], to.box[1]], [to.box[2], to.box[3]]], { padding: 40, maxZoom: 15, duration: calm() ? 0 : 1800 });
  else m.flyTo({ center: [to.lon, to.lat], zoom: 15, duration: calm() ? 0 : 1800, essential: true });
}

export default function TravelMap({ at, place, pin }: { at: string | null; place: string | null; pin?: boolean }) {
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
  const routeAbort = useRef<AbortController | null>(null);
  const walking = !!walk;
  const [shift, setShift] = useState(0); // half hours from now
  const [open, setOpen] = useState(false); // the panel on a phone
  const [credits, setCredits] = useState(false); // the full map credits shown
  const [full, setFull] = useState(false); // M236: the map over the whole window
  // M237: Google Maps' tools: directions, "what's here" (right-click or press and hold), measuring.
  const [dir, setDir] = useState<Directions | null>(null);
  const { routes, loading: routing, failed: noRoute } = useRoutes(dir);
  const [here, setHere] = useState<{ lat: number; lon: number; x: number; y: number } | null>(null);
  const [measure, setMeasure] = useState<{ lat: number; lon: number }[] | null>(null);
  const pinned = useRef(false);
  const compass = useRef<SVGSVGElement>(null); // M259: turned straight from the map's rotate event, not through React (60 renders a second)
  // M259: the world's destinations, a trip on the map, saved places and "Search this area".
  const [dest, setDest] = useState<Dest | null>(null);
  const [worldIn, setWorldIn] = useState(false); // the destinations file has arrived (lists show its pictures)
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripDay, setTripDay] = useState<number | null>(null);
  const [found, setFound] = useState<{ q: string; at: string; places: Found[] } | null>(null);
  const [seeking, setSeeking] = useState(false);
  const applied = useRef<StyleSpecification | null>(null); // the design the map has

  // Data for what's in view (rounded, so small moves reuse the answer).
  const near = view && view.zoom >= 12 ? `lat=${view.lat.toFixed(2)}&lon=${view.lon.toFixed(2)}&r=${Math.min(10_000, Math.round((km({ lat: view.s, lon: view.w }, { lat: view.n, lon: view.e }) ?? 4) * 500 / 100) * 100)}` : null;
  const { data: stories } = useSWR<{ stories: Story[] }>(show.stories && near ? `/travel/stories?${near}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const { data: photos } = useSWR<{ photos: Photo[]; credit: string }>(show.photos && near ? `/travel/photos?${near}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const box4 = view && view.zoom >= 11 ? `s=${view.s.toFixed(3)}&w=${view.w.toFixed(3)}&n=${view.n.toFixed(3)}&e=${view.e.toFixed(3)}` : null;
  const { data: reviewed } = useSWR<{ places: { place: string; name: string; lat: number; lon: number; average: number; count: number }[] }>(show.reviews && box4 ? `/travel/reviews/near?${box4}` : null, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const { data: savedData } = useSWR<{ saved: Saved[] }>(show.saved ? '/travel/saved' : null, fetcher, { revalidateOnFocus: false });
  const { data: tripList } = useSWR<{ trips: { id: string; name: string; cities: string[] }[] }>(layers || tripId ? '/travel/trips' : null, fetcher, { revalidateOnFocus: false });
  const { data: tripData } = useSWR<{ trip: { name: string; startDate: string | null }; stops: TripMap['stops']; items: TripMap['items'] }>(tripId ? `/travel/trips/${tripId}` : null, fetcher, { revalidateOnFocus: false });
  const tripMap = useMemo<TripMap | null>(() => (tripData ? { stops: tripData.stops, items: tripData.items, startDate: tripData.trip.startDate } : null), [tripData]);
  const tripFc = useMemo(() => tripFeatures(tripMap, tripDay), [tripMap, tripDay]);
  const tripDays = useMemo(() => tripDaysOn(tripMap), [tripMap]);
  const savedList = useMemo(() => (show.saved ? savedData?.saved ?? [] : []).filter((x) => x.lat != null && x.lon != null), [show.saved, savedData]);
  const savedFc = useMemo(() => points(savedList.map((x, i) => ({ lat: x.lat!, lon: x.lon!, props: { i, n: x.name } }))), [savedList]);
  const foundFc = useMemo(() => points((found?.places ?? []).map((f, i) => ({ lat: f.lat, lon: f.lon, props: { i, n: f.name } }))), [found]);
  // Zoomed out: the hand-picked places in view (the panel's list there).
  const destList = useMemo(() => {
    if (!show.world || !view || view.zoom >= WORLD_ZOOM) return [];
    const inLon = (lon: number) => (view.w <= view.e ? lon >= view.w && lon <= view.e : lon >= view.w || lon <= view.e);
    // The nearest the middle first; on the globe only the side facing you (the box there spans the world).
    const far = view.zoom < 4 ? 7000 : Infinity;
    return IDEAS.flatMap((i) => (i.lat != null && i.lon != null && i.lat >= view.s && i.lat <= view.n && inLon(i.lon) ? [{ i, d: km(view, { lat: i.lat, lon: i.lon }) ?? 0 }] : []))
      .filter((x) => x.d < far).sort((a, z) => a.d - z.d).slice(0, 40).map((x) => x.i);
  }, [show.world, view]);
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
    showClasses(m, classesOf(cat), `uv-pin-${cat}`, labelColor(cat, dark));
    setData(m, 'uv-stories', points(storyList.map((st, i) => ({ lat: st.lat, lon: st.lon, props: { i } }))));
    setData(m, 'uv-reviews', reviewFc);
    drawWalk(m, walk);
    drawPicked(m, picked);
    applyLook(m, show);
    focusWalk(m, !!walk, true);
    if (me.current) setData(m, 'uv-me', me.current);
    setData(m, 'uv-route', routeFeatures(dir, routes));
    setData(m, 'uv-measure', measureFeatures(measure));
    showWorld(m, show.world);
    if (show.world) void loadWorld().then((w) => { setWorld(m, 'uv-dest', w.dest); setWorld(m, 'uv-ideas', w.ideas); }).catch(() => {});
    setWorld(m, 'uv-saved', savedFc);
    setWorld(m, 'uv-trip', tripFc);
    setWorld(m, 'uv-found', foundFc);
    setReady(true);
  });
  const onPick = useEffectEvent((p: Picked) => pick(p));
  const onHere = useEffectEvent((lat: number, lon: number, x: number, y: number) => { if (!measure) setHere({ lat, lon, x, y }); });
  const onMoved = useEffectEvent(() => setHere(null));
  const firstView = useEffectEvent(() => ({ start: startAt(at), style: STYLE[dark ? 'dark' : 'light'] }));
  const onClick = useEffectEvent((m: MLMap, x: number, y: number, lat: number, lon: number) => {
    setHere(null);
    if (measure) { setMeasure([...measure, { lat, lon }]); return; }
    const hits = m.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]]);
    const alt = dir && hits.find((f) => f.layer.id === 'uv-route-alt');
    if (alt && dir) { setDir({ ...dir, chosen: Number(alt.properties.i) || 0 }); return; }
    if (show.street && hits.some((f) => f.layer.id === 'uv-street') && !hits.some((f) => f.layer.id === 'uv-stories' || f.layer.id === 'uv-reviews')) { void lookAround(lat, lon); return; }
    // M259: your own pins first (they sit on top), then a trip's city, then the world's destinations.
    const mine = hits.find((f) => f.layer.id === 'uv-found' || f.layer.id === 'uv-saved' || f.layer.id === 'uv-trip-item');
    if (mine) {
      const [lon2, lat2] = (mine.geometry as GeoJSON.Point).coordinates, i = Number(mine.properties.i);
      const f = mine.layer.id === 'uv-found' ? found?.places[i] : undefined;
      if (f) pick({ type: 'place', key: f.key, name: f.name, kind: kindOf(f.cls, f.sub), cls: f.sub, lat: f.lat, lon: f.lon });
      else pick({ type: 'place', key: null, name: String(mine.properties.n), kind: mine.layer.id === 'uv-saved' ? 'One of your saved places' : `On your trip · ${mine.properties.label}`, lat: lat2, lon: lon2 });
      return;
    }
    const stop = hits.find((f) => f.layer.id === 'uv-trip-stop');
    if (stop) { const [lon2, lat2] = (stop.geometry as GeoJSON.Point).coordinates; m.flyTo({ center: [lon2, lat2], zoom: Math.max(m.getZoom(), 12.5), duration: calm() ? 0 : 1400, essential: true, easing: ease }); return; }
    const place = hits.find((f) => f.layer.id === 'uv-ideas' || f.layer.id === 'uv-dest-city' || f.layer.id === 'uv-dest-town');
    if (place) { const [lon2, lat2] = (place.geometry as GeoJSON.Point).coordinates; openDest(destOf(place.properties, lat2, lon2)); return; }
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
        container: box.current, style, center: [s.lon, s.lat], zoom: s.zoom, pitch: 0, maxPitch: 75,
        transformRequest: mapRequest, attributionControl: false, pixelRatio: Math.min(2, window.devicePixelRatio || 1), fadeDuration: 150, maplibreLogo: false,
        // M259: smoother on every device: no second fetch of tiles that only aged, more tiles kept while moving about.
        refreshExpiredTiles: false, maxTileCacheZoomLevels: 6, cancelPendingTileRequestsWhileZooming: true,
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
      map.on('rotate', () => { if (compass.current) compass.current.style.transform = `rotate(${-map!.getBearing() - 45}deg)`; });
      watchPhotos(map);
      map.on('idle', () => readList(map!));
      // M236: the first 'idle' could pass before the list was listening for it (the list stayed empty until the map
      // was moved): also read it once the places' tiles have loaded, a moment after the last one.
      let soon: ReturnType<typeof setTimeout> | undefined;
      map.on('sourcedata', (e) => {
        if (e.sourceId !== 'openmaptiles' || !e.isSourceLoaded) return;
        clearTimeout(soon); soon = setTimeout(() => { if (!gone && map && !map.isMoving()) readList(map); }, 250);
      });
      map.on('click', (e) => onClick(map!, e.point.x, e.point.y, e.lngLat.lat, e.lngLat.lng));
      // M237: "what's here": a right-click, or a press and hold on a touch screen.
      map.on('contextmenu', (e) => onHere(e.lngLat.lat, e.lngLat.lng, e.point.x, e.point.y));
      let hold: ReturnType<typeof setTimeout> | undefined;
      map.on('touchstart', (e) => { clearTimeout(hold); if (e.originalEvent.touches.length === 1) hold = setTimeout(() => onHere(e.lngLat.lat, e.lngLat.lng, e.point.x, e.point.y), 550); });
      for (const ev of ['touchend', 'touchmove', 'movestart'] as const) map.on(ev, () => clearTimeout(hold));
      map.on('movestart', (e) => { if ((e as { originalEvent?: Event }).originalEvent) onMoved(); });
      for (const id of ['uv-stories', 'uv-reviews', 'uv-street', 'uv-hit', ...WORLD_LAYERS]) {
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
  // M237: the directions and the measurement on the map; a new route framed (clear of the panel on a computer).
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-route', routeFeatures(dir, routes)); }, [dir, routes, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-measure', measureFeatures(measure)); }, [measure, ready]);
  useEffect(() => {
    const m = mapRef.current, r = routes[0];
    if (!m || !r) return;
    const xs = r.path.map((c) => c[0]), ys = r.path.map((c) => c[1]), wide = m.getContainer().clientWidth >= 640;
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: wide ? { top: 60, bottom: 60, left: 420, right: 80 } : { top: 70, bottom: 300, left: 40, right: 70 }, duration: calm() ? 0 : 900, maxZoom: 17 });
  }, [routes]);
  // A shared spot (…&pin=1): its "what's here" card, once the map is ready.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !pin || pinned.current) return;
    pinned.current = true;
    const c = m.getCenter(), at2 = m.project(c);
    requestAnimationFrame(() => setHere({ lat: c.lat, lon: c.lng, x: at2.x, y: at2.y }));
  }, [ready, pin]);
  useEffect(() => { const m = mapRef.current; if (m && ready) { showClasses(m, classesOf(cat), `uv-pin-${cat}`, labelColor(cat, dark)); readList(m); } }, [cat, ready, dark]);
  // M259: the world's destinations (loaded the first time they show), your saved places, a trip, what was found.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    showWorld(m, show.world);
    if (!show.world) return;
    let gone = false;
    loadWorld().then((w) => { const m2 = mapRef.current; if (gone || !m2) return; setWorld(m2, 'uv-dest', w.dest); setWorld(m2, 'uv-ideas', w.ideas); setWorldIn(true); })
      .catch(() => { if (!gone) toast.error('The world’s destinations couldn’t load: try again in a moment.'); });
    return () => { gone = true; };
  }, [show.world, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) setWorld(m, 'uv-saved', savedFc); }, [savedFc, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) setWorld(m, 'uv-found', foundFc); }, [foundFc, ready]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    setWorld(m, 'uv-trip', tripFc);
    const b = tripBox(tripFc); // the trip (or the day chosen) framed, clear of the panel
    if (b) m.fitBounds(b, { padding: clearOfPanel(m), maxZoom: 14, duration: calm() ? 0 : 1400, easing: ease });
  }, [tripFc, ready]);
  // Where the sun is, for the hour chosen, lights the buildings.
  useEffect(() => { const m = mapRef.current; if (m && ready && view) skyFor(m, sunlight(m, view.lat, view.lon, when).altitude, dark); }, [ready, view, when, dark]);
  // Wikipedia's stories and UniVerse's reviews on the map.
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-stories', points(storyList.map((st, i) => ({ lat: st.lat, lon: st.lon, props: { i } })))); }, [storyList, ready]);
  useEffect(() => { const m = mapRef.current; if (m && ready) setData(m, 'uv-reviews', reviewFc); }, [reviewFc, ready]);
  // The walk on the map, and everything else stepping back while it is shown (M233).
  useEffect(() => { const m = mapRef.current; if (m && ready) { drawWalk(m, walk); focusWalk(m, !!walk); } }, [walk, ready]);
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
    // After the layers, the walk's focus again: the 3D switch would otherwise bring buildings over the walk (M233).
    if (m && ready) { applyLook(m, show); focusWalk(m, walking); }
  }, [show, ready, walking]);
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

  /** M259: a destination tapped: its card, and a glide over to it (a city's streets come into view). */
  function openDest(d: Dest) {
    setPicked(null); setDir(null); endWalk(); setDest(d); setOpen(true);
    const m = mapRef.current;
    if (!m) return;
    drawPicked(m, null);
    const to = Math.max(m.getZoom(), d.idea ? 8.5 : 10), offset: [number, number] = window.innerWidth >= 640 ? [190, 0] : [0, -140];
    if (calm()) m.jumpTo({ center: [d.lon, d.lat], zoom: to });
    else m.flyTo({ center: [d.lon, d.lat], zoom: to, offset, speed: 1.1, curve: 1.42, maxDuration: 2600, essential: true, easing: ease });
  }
  /** M259: "Search this area": what OpenStreetMap knows by that name in the map's view (one search a press). */
  async function searchArea(q: string) {
    const m = mapRef.current, t = q.trim().slice(0, 80);
    if (!m || t.length < 2 || seeking) return;
    const b = m.getBounds(), c = m.getCenter();
    setSeeking(true);
    try {
      const res = await fetch(areaSearchUrl(t, { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }));
      const places = res.ok ? foundOf(await res.json()) : [];
      setFound({ q: t, at: `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${m.getZoom().toFixed(1)}`, places });
      setFilter(''); pick(null); setOpen(true);
      if (!places.length) toast(`Nothing called “${t}” in view: move the map or zoom out a little.`);
    } catch { toast.error('Couldn’t search just now.'); } finally { setSeeking(false); }
  }
  function pick(p: Picked | null) {
    setPicked(p);
    setDest(null);
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
      else m.flyTo({ center: [at2.lon, at2.lat], zoom: to, pitch: show.d3 ? 58 : 0, offset, speed: 0.9, curve: 1.3, maxDuration: 1600, essential: true, easing: ease });
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
    const start = { lat: c.lat, lon: c.lng };
    setWalk({ ...w, start, path: null, routing: true }); setPicked(null); setOpen(true);
    // The path along the streets and the true walking minutes, from the walking router (straight lines until then, or if it fails).
    routeAbort.current?.abort();
    const ask = new AbortController(); routeAbort.current = ask;
    fetch(routeUrl(start, w.stops), { signal: ask.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((answer) => { const r = routeOf(answer, w.stops.length); setWalk((now) => (now && now.start === start ? (r ? { ...withLegs(now, r.legs), path: r.path, routing: false } : { ...now, routing: false }) : now)); })
      .catch(() => { if (!ask.signal.aborted) setWalk((now) => (now && now.start === start ? { ...now, routing: false } : now)); });
    const lons = [c.lng, ...w.stops.map((s) => s.lon)], lats = [c.lat, ...w.stops.map((s) => s.lat)];
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { pitch: 0, bearing: 0, padding: { top: 120, bottom: 120, left: window.innerWidth >= 640 ? 420 : 40, right: 80 }, maxZoom: 16.5, duration: calm() ? 0 : 1200 });
  };
  const myPlace = (): Spot | null => {
    const pt = me.current?.features.find((f) => f.geometry.type === 'Point')?.geometry as GeoJSON.Point | undefined;
    if (pt) return { lon: pt.coordinates[0], lat: pt.coordinates[1], name: 'Your location' };
    const c = mapRef.current?.getCenter();
    return c ? { lat: c.lat, lon: c.lng, name: 'Middle of the map' } : null;
  };
  const directionsTo = (to: Spot | null, from: Spot | null = myPlace()) => { pick(null); endWalk(); setHere(null); setMeasure(null); setDir({ from, to, mode: dir?.mode ?? 'foot', chosen: 0 }); };
  const endWalk = () => { routeAbort.current?.abort(); setWalk(null); };
  /** The walk to someone else (or another app): the phone's share sheet, else its directions link copied. */
  const shareWalk = async () => {
    if (!walk) return;
    const url = walkInGoogle(walk.start, walk.stops), title = `A ${Math.round(walk.total / 6) / 10} h walk: ${walk.stops.map((x) => x.name).join(', ')}`;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast.success('Link to the walk copied'); }
    } catch { /* closed the share sheet */ }
  };
  const toggle = (k: keyof Show) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const shown = filter.trim() ? list.filter((p) => fold(p.name).includes(fold(filter.trim()))) : list;

  const startClock = clockText(zone, when), sunTxt = sun ? `Sunrise ${clockText(zone, sun.rise)} · golden hour ${clockText(zone, sun.goldenEvening)} · sunset ${clockText(zone, sun.set)}` : 'No sunrise or sunset today';
  const dests = !walk && !found && show.world && !!view && view.zoom < WORLD_ZOOM; // zoomed out: the destinations in view
  const panelTitle = picked ? null : walk ? `A ${Math.round(walk.total / 6) / 10} h walk` : found ? `“${found.q}” in this area` : dests ? 'Destinations in view' : `${CATEGORIES.find((c) => c.id === cat)!.label} here`;
  const moved = !!found && !!view && found.at !== `${view.lat.toFixed(3)},${view.lon.toFixed(3)},${view.zoom.toFixed(1)}`;
  return (
    <div className={cn('overflow-hidden bg-zinc-200 dark:bg-zinc-900', full ? 'fixed inset-0 z-[70]' : 'relative h-[calc(100dvh-12rem)] min-h-[32rem] rounded-[var(--radius-card)] ring-1 ring-black/5 dark:ring-white/10 sm:-mx-8 sm:-mb-8 sm:h-[calc(100dvh-9.25rem)] sm:rounded-none sm:ring-0')}
      data-no-arrange data-no-motion onKeyDown={(e) => { if (e.key === 'Escape' && full) setFull(false); }}>
      <PinSource ref={pinBox} />
      {/* Inline: MapLibre's own stylesheet makes its container position: relative. */}
      <div ref={box} style={{ position: 'absolute', inset: 0 }} role="region" aria-label="Map" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200/80 dark:bg-white/[0.04]" aria-busy="true" />}

      {/* Controls. */}
      {/* A row under the kinds of place on a phone (pinch to zoom there), a column on the right on a computer. */}
      <div className="absolute end-3 top-3 z-20 flex flex-col items-end gap-2">
        <div className={cn(group, 'hidden flex-col divide-y divide-zinc-200 sm:flex dark:divide-white/10')}>
          <button type="button" className={ctl} aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="h-5 w-5" aria-hidden /></button>
          <button type="button" className={ctl} aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="h-5 w-5" aria-hidden /></button>
        </div>
        <button type="button" className={cn(group, ctl)} aria-label={full ? 'Leave full screen' : 'Full screen'} aria-pressed={full} onClick={() => setFull((f) => !f)}>{full ? <Minimize2 className="h-5 w-5" aria-hidden /> : <Maximize2 className="h-5 w-5" aria-hidden />}</button>
        <div className={cn(group, 'flex-col divide-y divide-zinc-200 dark:divide-white/10')}>
          <button type="button" className={ctl} aria-label="Face north" onClick={() => mapRef.current?.resetNorthPitch({ duration: calm() ? 0 : 500 })}><Compass ref={compass} className="h-5 w-5" style={{ transform: 'rotate(-45deg)' }} aria-hidden /></button>
          <button type="button" className={cn(ctl, measure && 'bg-indigo-700 text-white hover:bg-indigo-700 dark:text-white')} aria-label="Measure distance" aria-pressed={!!measure} onClick={() => { setHere(null); setMeasure((x) => (x ? null : [])); }}><Ruler className="h-5 w-5" aria-hidden /></button>
          <button type="button" className={ctl} aria-label="Where I am" onClick={findMe}><LocateFixed className="h-5 w-5" aria-hidden /></button>
          <button type="button" className={cn(ctl, layers && 'bg-indigo-700 text-white hover:bg-indigo-700 dark:text-white')} aria-label="Layers" aria-expanded={layers} aria-controls="map-layers" onClick={() => setLayers((o) => !o)}><Layers className="h-5 w-5" aria-hidden /></button>
        </div>
      </div>
      {/* M259: a trip on the map (its days to pick from) and "Search this area" again once the map has moved. */}
      {(tripId || moved) && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex flex-col items-center gap-2 px-16 sm:top-3 sm:ps-[25rem]">
          {moved && found && (
            <button type="button" disabled={seeking} onClick={() => void searchArea(found.q)} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0b55c4] shadow-lg ring-1 ring-black/5 transition-transform duration-150 active:scale-95 dark:bg-[#1f232b] dark:text-[#8cc0ff] dark:ring-white/10">
              {seeking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}Search this area
            </button>
          )}
          {tripId && (
            <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl bg-white/95 py-1.5 pe-1.5 ps-3 shadow-lg ring-1 ring-black/5 dark:bg-[#1f232b]/95 dark:ring-white/10">
              <Luggage className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
              <Link href={`/travel/trip?id=${tripId}`} className="max-w-[10rem] truncate text-sm font-semibold text-zinc-900 hover:underline dark:text-white" translate="no">{tripData?.trip.name ?? 'Your trip'}</Link>
              {tripDays.length > 0 && (
                <div className="flex max-w-[50vw] gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Day of the trip">
                  <button type="button" aria-pressed={tripDay == null} onClick={() => setTripDay(null)} className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', tripDay == null ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200')}>All</button>
                  {tripDays.map((d) => (
                    <button key={d} type="button" aria-pressed={tripDay === d} onClick={() => setTripDay(d)} className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', tripDay === d ? 'text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200')} style={tripDay === d ? { background: DAY_COLORS[(d - 1) % DAY_COLORS.length] } : undefined}>Day {d}</button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setTripId(null); setTripDay(null); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Hide the trip"><X className="h-4 w-4" aria-hidden /></button>
            </div>
          )}
        </div>
      )}
      {layers && (
        <div id="map-layers" role="dialog" aria-label="Map layers" onKeyDown={(e) => { if (e.key === 'Escape') setLayers(false); }}
          className="absolute end-16 top-3 z-40 w-[min(18rem,calc(100%-5.5rem))] origin-top-right rounded-2xl bg-[var(--card-bg)] p-3 shadow-2xl ring-1 ring-black/5 animate-[layers-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none dark:ring-white/10 rtl:origin-top-left">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-zinc-900 dark:text-white">Layers</h3><button type="button" onClick={() => setLayers(false)} className="btn-ghost btn-sm p-1" aria-label="Close layers"><X className="h-4 w-4" aria-hidden /></button></div>
          <Segmented<'map' | 'sat'> label="Map" className="mb-3" value={show.satellite ? 'sat' : 'map'} onChange={(v) => setShow((x) => ({ ...x, satellite: v === 'sat' }))} segments={[{ value: 'map', label: 'Map' }, { value: 'sat', label: 'Satellite' }]} />
          {show.satellite && <p className="-mt-1 mb-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">Pictures from the Sentinel-2 satellites: clear for cities, coasts and nature, soft close up.</p>}
          <ul className="space-y-0.5">
            {([['world', 'Destinations of the world', Globe2], ['saved', 'My saved places', Heart], ['d3', '3D hills and buildings', Box], ['transit', 'Trains, metro and ferries', TrainFront], ['street', 'Street photos (look around)', ScanEye], ['rings', 'Walking distance', Footprints], ['photos', 'Photos people took', Camera], ['stories', 'Stories of places', BookOpen], ['reviews', 'UniVerse reviews', Star]] as const).map(([k, label, Icon]) => (
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
          {/* M259: one of your trips drawn on the map: its cities in order, its places by day. */}
          <label className="mt-2 block border-t border-zinc-200/70 px-2 pt-3 dark:border-white/10">
            <span className="mb-1 flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100"><Luggage className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden />A trip on the map</span>
            <select value={tripId ?? ''} onChange={(e) => { setTripId(e.target.value || null); setTripDay(null); }} className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100">
              <option value="">None</option>
              {(tripList?.trips ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.cities.length ? ` (${t.cities.slice(0, 3).join(', ')})` : ''}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* M236: one panel as Apple Maps' sidebar: search on top, the kinds of place as round icons, the places (or a
          place, or a walk), the hour and the sun as a quiet footer. On a phone it is a sheet at the bottom with a grab
          handle (as Apple Maps on an iPhone): the search and kinds always, the rest when pulled up. */}
      <aside aria-label="Places" className="absolute inset-x-2 bottom-2 z-30 flex max-h-[62%] flex-col overflow-hidden rounded-[1.375rem] bg-[var(--card-bg)] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.06] dark:ring-white/10 sm:inset-x-auto sm:bottom-3 sm:start-3 sm:top-3 sm:max-h-none sm:w-[23rem]">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full justify-center pb-2 pt-2.5 sm:hidden" aria-expanded={open} aria-label={open ? 'Show less' : 'Show more'}>
          <span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-white/25" aria-hidden />
        </button>
        <div className="px-3 pb-2 sm:pt-3">
          <div className="flex items-center gap-2"><PlaceSearch className="min-w-0 flex-1" label="Find a place on the map" placeholder="Search a city, island or park…" onPick={(t) => void api.get<{ lat: number; lon: number; box: [number, number, number, number] | null }>(`/travel/where?q=${encodeURIComponent(t)}`).then(({ data }) => { if (mapRef.current) fly(mapRef.current, data); }).catch(() => toast.error('That place isn’t on the map.'))} /><button type="button" onClick={() => directionsTo(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1f87ff] text-white shadow-sm transition-transform duration-150 hover:bg-[#1a78e0] active:scale-95" aria-label="Directions"><Navigation className="h-[18px] w-[18px]" aria-hidden /></button></div>
          <div className="-mx-3 mt-3 flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" role="group" aria-label="Kind of place">
            {CATEGORIES.map((c) => {
              const Icon = PINS[c.id].icon, on = cat === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => { setCat(c.id); setFilter(''); endWalk(); pick(null); }}
                  className="group flex w-[3.9rem] shrink-0 flex-col items-center gap-1 rounded-xl py-1 transition-transform duration-150 active:scale-95">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition-[box-shadow] duration-200', on ? 'ring-[3px] ring-offset-2 ring-offset-[var(--card-bg)]' : 'opacity-90 group-hover:opacity-100')} style={{ background: PINS[c.id].color, ...(on ? { '--tw-ring-color': PINS[c.id].color } as React.CSSProperties : {}) }} aria-hidden><Icon className="h-5 w-5" /></span>
                  <span className={cn('max-w-full truncate text-[11.5px]', on ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300')}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={cn('min-h-0 flex-1 flex-col border-t border-zinc-200/70 px-3 pt-3 dark:border-white/10', open ? 'flex' : 'hidden sm:flex')}>
          {picked ? <PlaceCard key={JSON.stringify(picked).slice(0, 200)} picked={picked} at={when} onClose={() => pick(null)} onDirections={(to) => directionsTo(to)} /> : dest ? (
            <DestCard key={`${dest.name}@${dest.lat}`} d={dest} at={when} onClose={() => setDest(null)} onDirections={() => directionsTo({ lat: dest.lat, lon: dest.lon, name: dest.name })}
              onZoom={() => { const m = mapRef.current; if (m) m.flyTo({ center: [dest.lon, dest.lat], zoom: 14.5, offset: window.innerWidth >= 640 ? [190, 0] : [0, -140], duration: calm() ? 0 : 2200, essential: true, easing: ease }); }} />
          ) : dir ? <DirectionsCard d={dir} set={setDir} routes={routes} loading={routing} failed={noRoute} myPlace={myPlace} onClose={() => setDir(null)} /> : (
            <>
              {walk ? (
                // M233: the walk's card heads like Apple Maps' directions: Share, the walk, close.
                <div className="mb-3 flex items-center gap-2">
                  <button type="button" onClick={() => void shareWalk()} className={round} aria-label="Share this walk"><Share className="h-[18px] w-[18px]" aria-hidden /></button>
                  <div className="min-w-0 flex-1 text-center">
                    <h3 className="truncate text-[17px] font-semibold text-zinc-900 dark:text-white">{panelTitle}</h3>
                    <span className="mt-0.5 inline-block rounded-full bg-[#1f87ff]/[0.12] px-2.5 py-0.5 text-xs font-semibold text-[#0b55c4] dark:bg-[#1f87ff]/20 dark:text-[#8cc0ff]">{walk.stops.length} stops · {walk.km} km on foot</span>
                  </div>
                  <button type="button" onClick={endWalk} className={round} aria-label="End walk"><X className="h-5 w-5" aria-hidden /></button>
                </div>
              ) : (
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold text-zinc-900 dark:text-white">{panelTitle}</h3>
                {found ? <button type="button" onClick={() => setFound(null)} className="btn-ghost btn-sm p-1" aria-label="Clear the search"><X className="h-4 w-4" aria-hidden /></button> : !dests && (
                  <span className="flex items-center gap-1">
                    <label className="sr-only" htmlFor="walk-for">How long a walk</label>
                    <select id="walk-for" value={walkFor} onChange={(e) => setWalkFor(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200">
                      {[60, 120, 180, 240].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
                    </select>
                    <button type="button" onClick={startWalk} disabled={!ready} className="btn-primary btn-sm inline-flex items-center gap-1"><Footprints className="h-4 w-4" aria-hidden />Walk from here</button>
                  </span>
                )}
              </div>
              )}
              {/* M259: filter the places in view as you type; Search (or Enter) asks OpenStreetMap for anything by that name in view. */}
              {!walk && !found && !dests && view && view.zoom >= 12 && (
                <form className="mb-2 flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void searchArea(filter); }}>
                  <label className="relative block min-w-0 flex-1">
                    <span className="sr-only">Filter these places, or search this area</span>
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                    <input type="search" value={filter} onChange={(e) => setFilter(e.target.value.slice(0, 60))} placeholder={list.length > 6 ? `Filter ${list.length} places, or search here…` : 'Search this area: pizza, ATM, beach…'} className="w-full rounded-xl border border-zinc-200 bg-white py-1.5 pe-3 ps-8 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
                  </label>
                  {filter.trim().length >= 2 && <button type="submit" disabled={seeking} className="btn-secondary btn-sm inline-flex shrink-0 items-center gap-1">{seeking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}Search</button>}
                </form>
              )}
              <ol className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                {walk ? walk.stops.map((s, i) => (
                  <li key={s.key}>
                    <p className="ps-9 text-xs text-zinc-500 dark:text-zinc-400"><Footprints className="me-1 inline h-3.5 w-3.5" aria-hidden />{s.walk} min walk</p>
                    <button type="button" onClick={() => pick({ type: 'place', key: s.key, name: s.name, kind: kindOf(s.cls, s.sub), cls: s.cls, lat: s.lat, lon: s.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white" aria-hidden>{i + 1}</span>
                      <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900 dark:text-white" translate="no">{s.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(s.cls, s.sub)} · at {clockText(zone, new Date(when.getTime() + s.at * 60_000))}, about {s.stay} min</span></span>
                    </button>
                  </li>
                )) : found ? found.places.map((f, i) => (
                  <li key={f.key ?? `${f.name}-${i}`}>
                    <button type="button" onClick={() => pick({ type: 'place', key: f.key, name: f.name, kind: kindOf(f.cls, f.sub), cls: f.sub, lat: f.lat, lon: f.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white shadow-sm dark:ring-zinc-900" style={{ background: PINS.found.color }} aria-hidden><Search className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{f.name}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{kindOf(f.cls, f.sub)}{f.address ? ` · ${f.address}` : ''}</span></span>
                      {view && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{metres(km(view, f) ?? 0)}</span>}
                    </button>
                  </li>
                )) : dests ? destList.map((d) => {
                  const thumb = worldIn ? thumbOf(d.title) : null;
                  return (
                    <li key={d.title}>
                      <button type="button" onClick={() => openDest({ name: d.title.replace(/ \(.*\)$/, ''), cc: d.cc, lat: d.lat!, lon: d.lon!, pop: 0, idea: d })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-sky-300 to-sky-600 ring-2 ring-white shadow-sm dark:ring-zinc-900" aria-hidden>
                          {thumb && <Pic src={thumb} shown={44} loading="lazy" className="h-full w-full object-cover" />}
                        </span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{d.title.replace(/ \(.*\)$/, '')}</span><span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{d.country} · {d.blurb}</span></span>
                      </button>
                    </li>
                  );
                }) : shown.map((p) => (
                  <li key={p.key}>
                    <button type="button" onClick={() => pick({ type: 'place', key: /^[NWR]\d+$/.test(p.key) ? p.key : null, name: p.name, kind: kindOf(p.cls, p.sub), cls: p.cls, lat: p.lat, lon: p.lon })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white shadow-sm dark:ring-zinc-900" style={{ background: PINS[cat].color }} aria-hidden>{(() => { const Icon = PINS[cat].icon; return <Icon className="h-4 w-4" />; })()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-white" translate="no">{p.name}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{kindOf(p.cls, p.sub)}</span></span>
                      {view && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{metres(km(view, p) ?? 0)}</span>}
                    </button>
                  </li>
                ))}
                {dests && !destList.length && (
                  <li className="flex flex-col items-center px-4 py-8 text-center">
                    <Globe2 className="mb-3 h-10 w-10 text-sky-500" aria-hidden />
                    <span className="font-semibold text-zinc-900 dark:text-white">No hand-picked places here</span>
                    <span className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tap any town on the map for its guide, or zoom out.</span>
                  </li>
                )}
                {!walk && !found && !dests && !shown.length && (
                  <li className="flex flex-col items-center px-4 py-8 text-center">
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full text-white opacity-90" style={{ background: PINS[cat].color }} aria-hidden>{(() => { const Icon = PINS[cat].icon; return <Icon className="h-6 w-6" />; })()}</span>
                    <span className="font-semibold text-zinc-900 dark:text-white">{list.length ? 'No match' : view && view.zoom < 12 ? 'Zoom in a little' : `No ${CATEGORIES.find((c) => c.id === cat)!.label.toLowerCase()} in view`}</span>
                    <span className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{list.length ? `Nothing here matches “${filter.trim()}”.` : view && view.zoom < 12 ? 'Places show up once you’re closer in.' : 'Move the map, or pick another kind above.'}</span>
                  </li>
                )}
              </ol>
              {walk && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-2 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                  <span>{walk.stops.length} stops · {walk.km} km on foot · back by {clockText(zone, new Date(when.getTime() + walk.total * 60_000))}</span>
                  {!walk.path && <span className="w-full text-zinc-500 dark:text-zinc-400" role="status">{walk.routing ? 'Finding the way along the streets…' : 'Straight lines between stops: the street route couldn’t load.'}</span>}
                  <a href={walkInGoogle(walk.start, walk.stops)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm inline-flex items-center gap-1"><Footprints className="h-4 w-4" aria-hidden />Directions in Google Maps</a>
                  <TripPicker items={walk.stops.map((s) => ({ name: s.name, kind: listingKind(s.cls), lat: s.lat, lon: s.lon }))} city={null} cc={null} />
                </div>
              )}
            </>
          )}
        </div>
        {/* The hour there (the buildings are lit from where the sun is), quietly at the foot. */}
        <div className={cn('items-center gap-2.5 border-t border-zinc-200/70 px-3.5 py-2.5 dark:border-white/10', open ? 'flex' : 'hidden sm:flex')}>
          <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <label className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">{shift ? `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][clock.day]} ${startClock}` : `Now ${startClock}`} <span className="font-normal text-zinc-500 dark:text-zinc-400">their time</span></span>
              {shift > 0 && <button type="button" onClick={() => setShift(0)} className="font-semibold text-indigo-700 dark:text-indigo-300">Now</button>}
            </span>
            <input type="range" min={0} max={47} step={1} value={shift} onChange={(e) => setShift(Number(e.target.value))} aria-label="The hour at this place" className="mt-1 h-1 w-full accent-indigo-600" />
            <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={sunTxt}>{sunTxt}</span>
          </label>
        </div>
      </aside>
      {here && <HereCard p={here} zoom={view?.zoom ?? 16} x={Math.min(here.x, (box.current?.clientWidth ?? 400) - 264)} y={Math.min(here.y, (box.current?.clientHeight ?? 600) - 300)} onClose={() => setHere(null)}
        onFrom={(s) => directionsTo(dir?.to ?? null, s)} onTo={(s) => directionsTo(s, dir?.from ?? myPlace())} onMeasure={() => { setMeasure([{ lat: here.lat, lon: here.lon }]); setHere(null); }} />}
      {measure && <MeasureBar pts={measure} onUndo={() => setMeasure(measure.slice(0, -1))} onClear={() => setMeasure([])} onDone={() => setMeasure(null)} />}
      {/* M236: the credits the map's licences ask for (OpenStreetMap, OpenMapTiles), small as Apple Maps' "Legal": a short
          line, the rest behind the (i). On a phone at the top, clear of the sheet. */}
      <div className="absolute start-2 top-2 z-10 max-w-[calc(100%-5rem)] sm:bottom-1 sm:end-1 sm:start-auto sm:top-auto">
        {credits ? (
          <p className="relative rounded-lg bg-white/90 px-2 py-1 pe-7 text-[11px] leading-snug text-zinc-600 shadow-sm dark:bg-black/70 dark:text-zinc-300">
            Map <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="underline">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a> · Relief <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer" className="underline">Terrain Tiles</a>{show.satellite && <> · <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer" className="underline">Sentinel-2 cloudless 2016 by EOX</a> (CC BY 4.0, modified Copernicus data)</>}{show.street && <> · Street photos <a href="https://panoramax.fr" target="_blank" rel="noopener noreferrer" className="underline">Panoramax</a> (CC BY-SA 4.0)</>}{show.photos && photos?.credit ? ` · ${photos.credit}` : ''}{show.world && <> · Destinations <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" className="underline">GeoNames</a> (CC BY 4.0), photos Wikimedia Commons</>}{found && <> · Search <a href="https://nominatim.org" target="_blank" rel="noopener noreferrer" className="underline">Nominatim</a></>}{walk?.path && <> · Walking route <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer" className="underline">FOSSGIS</a> (OSRM)</>}
            <button type="button" onClick={() => setCredits(false)} className="absolute end-1 top-1 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Hide the map credits"><X className="h-3.5 w-3.5" aria-hidden /></button>
          </p>
        ) : (
          <button type="button" onClick={() => setCredits(true)} className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[11px] text-zinc-600 shadow-sm hover:bg-white dark:bg-black/60 dark:text-zinc-300" aria-label="Map credits: © OpenStreetMap and others">
            © OpenStreetMap <Info className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
