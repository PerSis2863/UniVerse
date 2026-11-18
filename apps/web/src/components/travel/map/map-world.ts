import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { IDEAS, type Idea } from '@/lib/travel-ideas';
import { stopDates, type PlanItem, type PlanStop } from '@/lib/travel-plan';

// M259 (the owner, 17 Nov: "add all the destinations and upgrade the map and add more features"): the world on
// Travel's map. Zoomed out, every town and city of 15,000 people or more (GeoNames, ~24,000, public/geo/
// destinations.json, made by scripts/gen-destinations.mts) is a dot you can tap, and the hand-picked places
// (src/lib/travel-ideas.ts) are round photos; your saved places are hearts; a trip is drawn with its cities in
// order and its places by day; "Search this area" pins what it found. All of it from this site or straight
// from its free source to the browser: no Worker CPU.

export const WORLD_SOURCES = ['uv-dest', 'uv-ideas', 'uv-saved', 'uv-trip', 'uv-found'] as const;
type WorldSource = (typeof WORLD_SOURCES)[number];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
/** The base map's own city and town names step aside for the destinations while those show (map-style.ts). */
const BASE_NAMES: [string, number, number][] = [['city-names', 3, 15], ['town-names', 6, 24]];
/** Below this zoom the destinations show; closer in, the base map's names and places take over. */
export const WORLD_ZOOM = 10.5;
/** The days of a trip in turn (a ninth day takes the first colour again). */
export const DAY_COLORS = ['#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export interface Dest { name: string; cc: string; lat: number; lon: number; pop: number; idea: Idea | null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ \(.*\)$/, '');
const ideaAt = new Map(IDEAS.map((i, n) => [n, i]));
const thumbs = new Map<string, string>(); // a hand-picked place's small Commons picture, once the world has loaded
const thumbUrl = (path: string, w = 120) => { const [a, b, file = ''] = path.split('/'); return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${b}/${encodeURIComponent(file)}/${w}px-${encodeURIComponent(file)}`; };
/** A hand-picked place's small round picture for lists (null until the world has loaded, or without one). */
export const thumbOf = (title: string) => thumbs.get(title) ?? null;
let world: Promise<{ dest: GeoJSON.FeatureCollection; ideas: GeoJSON.FeatureCollection }> | null = null;

/** The world's destinations, loaded once (about 350 kB over the wire), the first time they are shown. */
export function loadWorld() {
  world ??= fetch('/geo/destinations.json')
    .then((r) => { if (!r.ok) throw new Error(`destinations: ${r.status}`); return r.json() as Promise<{ places: [string, string, number, number, number][]; photos: Record<string, string> }>; })
    .then(({ places, photos }) => {
      for (const [t, path] of Object.entries(photos)) thumbs.set(t, thumbUrl(path));
      // A hand-picked place is drawn as its photo, so the same city isn't a dot under it too.
      const picked = new Set(IDEAS.map((i) => `${fold(i.title)}|${i.cc}`));
      const dest: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
      for (const [n, c, lat, lon, p] of places) {
        if (picked.has(`${fold(n)}|${c}`)) continue;
        dest.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { n, c, p } });
      }
      const ideas: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: IDEAS.flatMap((i, n) => (i.lat == null || i.lon == null ? [] : [{
        type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [i.lon, i.lat] },
        properties: { i: n, n: i.title.replace(/ \(.*\)$/, ''), img: photos[i.title] ? `uv-photo-${n}|${photos[i.title]}` : 'uv-idea' },
      }])) };
      return { dest, ideas };
    });
  world.catch(() => { world = null; }); // a failed download can be tried again
  return world;
}

/** What a tapped destination is. */
export function destOf(props: Record<string, unknown>, lat: number, lon: number): Dest {
  if (typeof props.i === 'number' || typeof props.i === 'string') {
    const idea = ideaAt.get(Number(props.i)) ?? null;
    if (idea) return { name: idea.title.replace(/ \(.*\)$/, ''), cc: idea.cc, lat: idea.lat ?? lat, lon: idea.lon ?? lon, pop: 0, idea };
  }
  return { name: String(props.n ?? ''), cc: String(props.c ?? ''), lat, lon, pop: Number(props.p) || 0, idea: null };
}

const R = 2; // drawn at twice the size
function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size * R; c.height = size * R;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}
/** A town's dot: white with a dark rim, as Apple Maps marks a city. */
function dot(dark: boolean) {
  const { c, g } = canvas(12);
  g.beginPath(); g.arc(6 * R, 6 * R, 4.2 * R, 0, Math.PI * 2);
  g.fillStyle = dark ? '#e5e7eb' : '#ffffff'; g.fill();
  g.lineWidth = 1.8 * R; g.strokeStyle = dark ? '#0b0c0e' : '#3f4652'; g.stroke();
  return g.getImageData(0, 0, c.width, c.height);
}
const PHOTO = 46; // a photo pin's size in px
/** A photo pin: the picture in a white ring with a soft shadow (or Travel's sky while it loads). */
function photoPin(img: HTMLImageElement | null) {
  const { c, g } = canvas(PHOTO), mid = (PHOTO / 2) * R, r = (PHOTO / 2 - 4) * R;
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 4 * R; g.shadowOffsetY = 1.5 * R;
  g.beginPath(); g.arc(mid, mid, r + 2.5 * R, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.shadowColor = 'transparent';
  g.save(); g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.clip();
  if (img) {
    const s = Math.min(img.naturalWidth, img.naturalHeight); // the middle square, covering the circle
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, mid - r, mid - r, r * 2, r * 2);
  } else {
    const grad = g.createLinearGradient(0, 0, 0, PHOTO * R);
    grad.addColorStop(0, '#7dd3fc'); grad.addColorStop(1, '#0284c7');
    g.fillStyle = grad; g.fillRect(0, 0, PHOTO * R, PHOTO * R);
  }
  g.restore();
  return g.getImageData(0, 0, c.width, c.height);
}
const photos = new Map<string, ImageData>(); // loaded once a session, put back after every style change
const asking = new Set<string>();
/** A photo pin the map asked for: the placeholder now, the picture (a 120 px Commons thumbnail) once it arrives. */
function askPhoto(map: MLMap, id: string) {
  const ready = photos.get(id);
  if (ready) { if (!map.hasImage(id)) map.addImage(id, ready, { pixelRatio: R }); return; }
  if (!map.hasImage(id)) map.addImage(id, photoPin(null), { pixelRatio: R });
  if (asking.has(id)) return;
  asking.add(id);
  const img = new Image();
  img.crossOrigin = 'anonymous'; // drawn on a canvas: upload.wikimedia.org allows it
  img.decoding = 'async';
  img.onload = () => {
    try { const data = photoPin(img); photos.set(id, data); if (map.hasImage(id)) map.updateImage(id, data); } catch { /* a picture the canvas refused: the placeholder stays */ }
  };
  img.onerror = () => { asking.delete(id); };
  img.src = thumbUrl(id.split('|')[1] ?? '');
}
/** Listen for photo pins the map needs (once, when the map is made). */
export function watchPhotos(map: MLMap) {
  map.on('styleimagemissing', (e: { id: string }) => {
    if (e.id.startsWith('uv-photo-')) askPhoto(map, e.id);
    else if (e.id === 'uv-idea' && !map.hasImage('uv-idea')) map.addImage('uv-idea', photoPin(null), { pixelRatio: R });
  });
}

/** The world's layers, again after every style change, under the directions and the walk. */
export function addWorldLayers(map: MLMap, dark: boolean, font: string[], bold: string[]) {
  for (const id of WORLD_SOURCES) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY, ...(id === 'uv-dest' ? { maxzoom: 11, buffer: 64 } : {}) });
  if (map.hasImage('uv-dest-dot')) map.updateImage('uv-dest-dot', dot(dark)); else map.addImage('uv-dest-dot', dot(dark), { pixelRatio: R });
  const before = map.getLayer('uv-route-alt') ? 'uv-route-alt' : undefined;
  const ink = dark ? '#f4f6f8' : '#1d2129', halo = dark ? '#0b0c0e' : '#ffffff';
  const size = (small: number, big: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 2, ['step', ['get', 'p'], small, 1000, small + 1.5, 5000, small + 2.5], 9, ['step', ['get', 'p'], big, 1000, big + 2, 5000, big + 3]];
  const town = (id: string, minzoom: number, filter: ExpressionSpecification) => map.addLayer({
    id, type: 'symbol', source: 'uv-dest', minzoom, maxzoom: WORLD_ZOOM, filter,
    layout: {
      'icon-image': 'uv-dest-dot', 'symbol-sort-key': ['-', 0, ['get', 'p']], 'text-field': ['get', 'n'], 'text-font': bold, 'text-size': size(10.5, 12.5),
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.55, 'text-justify': 'auto', 'text-max-width': 8, 'text-padding': 6, 'icon-padding': 2,
    },
    paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.6, 'icon-opacity': ['interpolate', ['linear'], ['zoom'], WORLD_ZOOM - 0.6, 1, WORLD_ZOOM, 0], 'text-opacity': ['interpolate', ['linear'], ['zoom'], WORLD_ZOOM - 0.6, 1, WORLD_ZOOM, 0] },
  }, before);
  // The biggest from the globe; the rest once a country fills the screen (fewer to place: smooth on a phone).
  town('uv-dest-town', 5.5, ['<', ['get', 'p'], 300]);
  town('uv-dest-city', 1, ['>=', ['get', 'p'], 300]);
  // The hand-picked places: their photo with the name under it, placed before any town (the higher layer wins).
  map.addLayer({
    id: 'uv-ideas', type: 'symbol', source: 'uv-ideas', maxzoom: 13,
    layout: {
      'icon-image': ['get', 'img'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.62, 5, 0.85, 9, 1], 'symbol-sort-key': ['get', 'i'], 'icon-padding': 2,
      'text-field': ['get', 'n'], 'text-font': bold, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 11, 8, 13.5], 'text-anchor': 'top', 'text-offset': [0, 1.55], 'text-max-width': 8, 'text-optional': true, 'text-padding': 2,
    },
    paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 1.8, 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12.4, 1, 13, 0], 'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.4, 1, 13, 0] },
  }, before);
  // A trip: the way between its cities, its places by day, its cities numbered in order.
  // M264: the way travelled in ink, the way ahead dotted grey (the owner's recording), over a soft white edge.
  const pathOf = (done: boolean): FilterSpecification => ['all', ['==', ['get', 'role'], 'path'], ['==', ['get', 'done'], done]];
  map.addLayer({ id: 'uv-trip-edge', type: 'line', source: 'uv-trip', filter: ['==', ['get', 'role'], 'path'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#000000' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5, 10, 8], 'line-opacity': dark ? 0.35 : 0.9 } }, before);
  map.addLayer({ id: 'uv-trip-path', type: 'line', source: 'uv-trip', filter: pathOf(true), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#f4f4f5' : '#18181b', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 10, 4.5] } }, before);
  map.addLayer({ id: 'uv-trip-ahead', type: 'line', source: 'uv-trip', filter: pathOf(false), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#a1a1aa' : '#52525b', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.2, 10, 3.5], 'line-dasharray': [0.2, 2.2] } }, before);
  // M265: the chosen day's walk along the streets, the directions' blue with a darker edge (it bends at every turn).
  map.addLayer({ id: 'uv-trip-walk-edge', type: 'line', source: 'uv-trip', filter: ['==', ['get', 'role'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b5bd3', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 11] } }, before);
  map.addLayer({ id: 'uv-trip-walk', type: 'line', source: 'uv-trip', filter: ['==', ['get', 'role'], 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1f87ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 16, 7.5] } }, before);
  map.addLayer({ id: 'uv-trip-item', type: 'circle', source: 'uv-trip', filter: ['==', ['get', 'role'], 'item'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 12, 7, 16, 9], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }, before);
  map.addLayer({ id: 'uv-trip-item-name', type: 'symbol', source: 'uv-trip', minzoom: 11.5, filter: ['==', ['get', 'role'], 'item'],
    layout: { 'text-field': ['concat', ['get', 'label'], ' · ', ['get', 'n']], 'text-font': bold, 'text-size': 12, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-max-width': 10, 'text-optional': true, 'text-padding': 2 },
    paint: { 'text-color': ['get', 'color'], 'text-halo-color': halo, 'text-halo-width': 1.8 } }, before);
  // Cities as ink circles with their number (the recording's markers); the one you're in today in the sky blue with a halo.
  const now: ExpressionSpecification = ['==', ['get', 'state'], 'now'];
  map.addLayer({ id: 'uv-trip-halo', type: 'circle', source: 'uv-trip', filter: ['all', ['==', ['get', 'role'], 'stop'], now], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 20, 10, 26], 'circle-color': '#0ea5e9', 'circle-opacity': 0.2 } }, before);
  map.addLayer({ id: 'uv-trip-stop', type: 'circle', source: 'uv-trip', filter: ['==', ['get', 'role'], 'stop'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 10, 10, 14], 'circle-color': ['case', now, '#0284c7', dark ? '#f4f4f5' : '#18181b'], 'circle-opacity': ['case', ['==', ['get', 'state'], 'done'], 0.75, 1], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', now, 3, 2] } }, before);
  map.addLayer({ id: 'uv-trip-num', type: 'symbol', source: 'uv-trip', filter: ['==', ['get', 'role'], 'stop'],
    layout: { 'text-field': ['get', 'num'], 'text-font': bold, 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': ['case', now, '#ffffff', dark ? '#18181b' : '#ffffff'] } }, before);
  map.addLayer({ id: 'uv-trip-name', type: 'symbol', source: 'uv-trip', filter: ['==', ['get', 'role'], 'stop'],
    layout: { 'text-field': ['get', 'n'], 'text-font': bold, 'text-size': 14, 'text-anchor': 'top', 'text-offset': [0, 1.35], 'text-max-width': 9, 'text-optional': true },
    paint: { 'text-color': ink, 'text-halo-color': halo, 'text-halo-width': 2 } }, before);
  // Your saved places and what "Search this area" found: always shown, names close in.
  for (const [id, pin] of [['uv-saved', 'uv-pin-saved'], ['uv-found', 'uv-pin-found']] as const) {
    map.addLayer({ id, type: 'symbol', source: id,
      layout: { 'icon-image': pin, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 14, 0.85], 'icon-allow-overlap': true, 'symbol-sort-key': ['get', 'i'],
        'text-field': ['step', ['zoom'], '', 12, ['get', 'n']], 'text-font': bold, 'text-size': 12, 'text-anchor': 'left', 'text-offset': [1.15, 0], 'text-max-width': 9, 'text-optional': true, 'text-padding': 2 },
      paint: { 'text-color': id === 'uv-saved' ? (dark ? '#fb7185' : '#be123c') : (dark ? '#8cc0ff' : '#0b55c4'), 'text-halo-color': halo, 'text-halo-width': 1.8 } }, before);
  }
}

/** The destinations shown or hidden; the base map's own city and town names step aside for them. */
export function showWorld(map: MLMap, on: boolean) {
  for (const id of ['uv-dest-town', 'uv-dest-city', 'uv-ideas']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  for (const [id, min, max] of BASE_NAMES) if (map.getLayer(id)) map.setLayerZoomRange(id, on ? Math.max(min, WORLD_ZOOM - 0.6) : min, max);
}

export const setWorld = (map: MLMap, id: WorldSource, data: GeoJSON.FeatureCollection) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
export const WORLD_LAYERS = ['uv-dest-town', 'uv-dest-city', 'uv-ideas', 'uv-trip-stop', 'uv-trip-item', 'uv-saved', 'uv-found'] as const;

export interface TripMap { stops: (PlanStop & { mode?: string | null })[]; items: PlanItem[]; startDate: string | null }
/** M265: the key of the way from one city to the next (its routed path is kept under it). */
export const legKey = (a: { id: string }, b: { id: string }) => `${a.id}>${b.id}`;
/** A flight or a ferry: a gentle arc (the sea and the sky have no roads), its bow a seventh of its length. */
export function bow(a: [number, number], b: [number, number], n = 24): [number, number][] {
  const dx = b[0] - a[0], dy = b[1] - a[1], cx = (a[0] + b[0]) / 2 - dy / 7, cy = (a[1] + b[1]) / 2 + dx / 7;
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]] as [number, number]; });
}
/** The ways between a trip's cities worth asking the road router for: not flown or sailed, and under 1,500 km. */
export function roadLegs(t: TripMap | null): { key: string; a: { lat: number; lon: number }; b: { lat: number; lon: number } }[] {
  const at = (t?.stops ?? []).filter((x) => x.lat != null && x.lon != null), out: { key: string; a: { lat: number; lon: number }; b: { lat: number; lon: number } }[] = [];
  for (let i = 1; i < at.length; i++) {
    const a = at[i - 1], b = at[i], far = Math.hypot(b.lat! - a.lat!, (b.lon! - a.lon!) * Math.cos((a.lat! * Math.PI) / 180)) * 111;
    if (b.mode === 'plane' || b.mode === 'ferry' || far > 1500) continue;
    out.push({ key: legKey(a, b), a: { lat: a.lat!, lon: a.lon! }, b: { lat: b.lat!, lon: b.lon! } });
  }
  return out.slice(0, 12);
}
/** A trip on the map: the way through its cities in order, each city numbered, each place in its day's colour. */
/** `legs`: the routed path of each way between cities (by `legKey`); `walk`: the chosen day's walk along the streets. */
export function tripFeatures(t: TripMap | null, day: number | null, today: number | null = null, legs?: ReadonlyMap<string, [number, number][]>, walk?: [number, number][] | null): GeoJSON.FeatureCollection {
  if (!t) return EMPTY;
  const dates = stopDates(t.startDate, t.stops), first = new Map(t.stops.map((s, i) => [s.id, dates[i]?.offset ?? 0]));
  const stops = t.stops.map((s, i) => ({ s, from: (dates[i]?.offset ?? 0) + 1, to: (dates[i]?.offset ?? 0) + s.days })).filter((x) => x.s.lat != null && x.s.lon != null);
  const features: GeoJSON.Feature[] = [];
  // M264 (the owner's recording): the way already travelled solid, the way still ahead dotted; `today` is the trip's day
  // number today (1 = its first day), null when it isn't known. The city you're in now is `now`.
  const at = (x: (typeof stops)[number]) => (today == null || today < x.from ? 'next' : today > x.to ? 'done' : 'now');
  const cur = today == null ? -1 : stops.reduce((k, x, i) => (today >= x.from ? i : k), -1);
  // Each way between two cities: along the roads when the router answered, an arc when flown or sailed, else straight.
  const leg = (a: (typeof stops)[number], b: (typeof stops)[number]): [number, number][] => {
    const pa: [number, number] = [a.s.lon!, a.s.lat!], pb: [number, number] = [b.s.lon!, b.s.lat!];
    return legs?.get(legKey(a.s, b.s)) ?? (b.s.mode === 'plane' || b.s.mode === 'ferry' ? bow(pa, pb) : [pa, pb]);
  };
  const line = (part: typeof stops, done: boolean) => {
    if (part.length < 2) return;
    const coordinates = part.slice(1).flatMap((x, i) => leg(part[i], x).slice(i ? 1 : 0));
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { role: 'path', done } });
  };
  if (walk && walk.length > 1) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: walk }, properties: { role: 'walk' } });
  line(stops.slice(0, cur + 1), true);
  line(stops.slice(Math.max(0, cur)), false);
  stops.forEach((x, i) => features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.s.lon!, x.s.lat!] }, properties: { role: 'stop', num: String(i + 1), n: x.s.name, state: at(x) } }));
  for (const it of t.items) {
    if (it.lat == null || it.lon == null) continue;
    const d = it.day == null ? null : (first.get(it.stopId) ?? 0) + it.day + 1;
    if (day != null && d !== day) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [it.lon, it.lat] }, properties: { role: 'item', id: it.id, n: it.name, label: d == null ? 'Not planned' : `Day ${d}`, color: d == null ? '#6b7280' : DAY_COLORS[(d - 1) % DAY_COLORS.length] } });
  }
  return { type: 'FeatureCollection', features };
}
/** The trip's days that have places on the map, in order. */
export function tripDaysOn(t: TripMap | null): number[] {
  if (!t) return [];
  const dates = stopDates(t.startDate, t.stops), first = new Map(t.stops.map((s, i) => [s.id, dates[i]?.offset ?? 0])), out = new Set<number>();
  for (const it of t.items) if (it.day != null && it.lat != null) out.add((first.get(it.stopId) ?? 0) + it.day + 1);
  return [...out].sort((a, b) => a - b);
}
/** The box around a trip's cities and places, or null when nothing has a position. */
export function tripBox(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  const xs: number[] = [], ys: number[] = [];
  for (const f of fc.features) if (f.geometry.type === 'Point') { xs.push(f.geometry.coordinates[0]); ys.push(f.geometry.coordinates[1]); }
  return xs.length ? [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] : null;
}

/** "Search this area": Nominatim's search inside the map's box (from the browser, one search a press, as its rules ask). */
export function areaSearchUrl(q: string, b: { s: number; w: number; n: number; e: number }) {
  const p = new URLSearchParams({ q, format: 'jsonv2', limit: '40', bounded: '1', viewbox: [b.w, b.n, b.e, b.s].map((x) => x.toFixed(4)).join(','), 'accept-language': 'en' });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}
export interface Found { key: string | null; name: string; cls: string; sub: string; lat: number; lon: number; address: string }
/** Nominatim's answer as places on the map (only those with a name and a position). */
export function foundOf(answer: unknown): Found[] {
  if (!Array.isArray(answer)) return [];
  const out: Found[] = [], seen = new Set<string>();
  for (const r of answer as Record<string, unknown>[]) {
    const lat = Number(r.lat), lon = Number(r.lon), display = typeof r.display_name === 'string' ? r.display_name : '';
    const name = (typeof r.name === 'string' && r.name) || display.split(',')[0]?.trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const type = ({ node: 'N', way: 'W', relation: 'R' } as Record<string, string>)[String(r.osm_type)], id = Number(r.osm_id);
    const key = type && Number.isSafeInteger(id) && id > 0 ? `${type}${id}` : null;
    if (seen.has(key ?? `${name}@${lat}`)) continue;
    seen.add(key ?? `${name}@${lat}`);
    out.push({ key, name: name.slice(0, 120), cls: String(r.category ?? ''), sub: String(r.type ?? ''), lat, lon, address: display.split(',').slice(1, 3).join(',').trim().slice(0, 160) });
  }
  return out;
}
