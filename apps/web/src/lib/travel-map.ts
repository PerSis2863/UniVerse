import { hop, km } from './travel-plan';

// Travel's map (M209): what the map's places are (the OpenMapTiles `poi` layer's classes, from
// OpenStreetMap), the kinds people pick from, and "Walk from here": the most notable sights near the
// middle of the map strung into a walk that fits the time chosen. Pure and tested.

export const CATEGORIES = [
  { id: 'see', label: 'Sights', classes: ['attraction', 'monument', 'castle', 'museum', 'art_gallery', 'place_of_worship', 'theatre', 'viewpoint'] },
  { id: 'eat', label: 'Food', classes: ['restaurant', 'fast_food', 'ice_cream', 'bakery'] },
  { id: 'cafe', label: 'Cafés', classes: ['cafe'] },
  { id: 'drink', label: 'Drinks', classes: ['bar', 'beer', 'alcohol_shop'] },
  { id: 'museum', label: 'Museums', classes: ['museum', 'art_gallery'] },
  { id: 'park', label: 'Parks', classes: ['park', 'garden', 'zoo'] },
  { id: 'shop', label: 'Shops', classes: ['shop', 'clothing_store', 'grocery', 'gift', 'jewelry', 'books', 'music', 'art'] },
  { id: 'stay', label: 'Hotels', classes: ['lodging', 'campsite'] },
  { id: 'go', label: 'Transport', classes: ['railway', 'bus', 'harbor', 'ferry_terminal', 'aerialway'] },
  // M349: Apple Maps' "Find Nearby" kinds (the owner: "add whatever you can in this sections").
  { id: 'fast', label: 'Fast food', classes: ['fast_food'] },
  { id: 'bakery', label: 'Bakeries', classes: ['bakery'] },
  { id: 'grocery', label: 'Supermarkets', classes: ['grocery'] },
  { id: 'fuel', label: 'Petrol', classes: ['fuel'] },
  { id: 'parking', label: 'Parking', classes: ['parking'] },
  { id: 'health', label: 'Health', classes: ['hospital', 'pharmacy', 'doctors', 'dentist', 'clinic'] },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const classesOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.classes as readonly string[];

/** A map place's kind in words, from its class and subclass ("Café", "Museum", "Bus stop"). */
export function kindOf(cls?: string, sub?: string) {
  if (cls === 'place_of_worship') return 'Place of worship'; // its subclass is the religion
  const w = (sub && sub !== cls ? sub : cls ?? 'place').replace(/_/g, ' ');
  return { cafe: 'Café', fast_food: 'Fast food', art_gallery: 'Gallery', lodging: 'Hotel', ice_cream: 'Ice cream', alcohol_shop: 'Off-licence', beer: 'Pub' }[sub ?? cls ?? ''] ?? w.charAt(0).toUpperCase() + w.slice(1);
}
/** Which category (for its activity: how long it takes, what "Save" files it as) a class belongs to. */
export const listingKind = (cls?: string) => (['restaurant', 'fast_food', 'ice_cream', 'bakery', 'cafe'].includes(cls ?? '') ? 'eat' : ['bar', 'beer'].includes(cls ?? '') ? 'drink' : ['lodging', 'campsite'].includes(cls ?? '') ? 'sleep' : ['shop', 'clothing_store', 'grocery', 'gift'].includes(cls ?? '') ? 'buy' : 'see');

/** Time at a sight on a walk: a look, not a visit (a museum or a castle is a visit). */
export function walkStay(cls?: string, name = '', sub?: string) {
  if (sub === 'artwork' || /\b(statue|sculpture)\b/i.test(name)) return 10; // OpenMapTiles files artworks with galleries
  if (cls === 'museum' || cls === 'art_gallery' || /\b(museum|gallery)\b/i.test(name)) return 75;
  if (cls === 'castle' || /\b(palace|castle|fortress|monastery|cathedral)\b/i.test(name)) return 45;
  if (cls === 'place_of_worship' || /\b(church|chapel|temple|mosque|shrine)\b/i.test(name)) return 20;
  if (/\b(viewpoint|lookout|fountain|statue|square|monument|memorial)\b/i.test(name) || cls === 'monument') return 15;
  return 25;
}

/** One of each: OpenStreetMap often has a place twice (its outline and its point) under one name. */
export function sameOnce<T extends { name: string; lat: number; lon: number }>(list: T[]): T[] {
  const out: T[] = [];
  for (const p of list) if (!out.some((q) => q.name.toLowerCase() === p.name.toLowerCase() && (km(q, p) ?? 0) < 0.3)) out.push(p);
  return out;
}

export interface MapPlace { key: string; name: string; cls?: string; sub?: string; rank: number; lat: number; lon: number }
export interface WalkStop extends MapPlace { walk: number; stay: number; at: number }

/** A walk from a point through the most notable sights within reach, nearest next each time, for as long
 *  as the time allows (walking and visiting). Minutes are counted from the start. */
export function walkFrom(start: { lat: number; lon: number }, places: MapPlace[], minutes = 180): { stops: WalkStop[]; total: number; km: number } {
  // The notable ones nearby: the map's own rank (lower is more notable) before nearness.
  const pool = sameOnce(places.filter((p) => (km(start, p) ?? 99) <= 1.8).sort((a, b) => a.rank - b.rank || km(start, a)! - km(start, b)!)).slice(0, 12);
  const stops: WalkStop[] = [];
  let here = start, t = 0, dist = 0;
  while (pool.length) {
    let best = 0;
    for (let i = 1; i < pool.length; i++) if (km(here, pool[i])! < km(here, pool[best])!) best = i;
    const p = pool[best], h = hop(here, p), walk = h ? (h.walk ? h.minutes : Math.round(((km(here, p)! * 1.3) / 4.5) * 60)) : 0;
    const stay = walkStay(p.cls, p.name, p.sub);
    if (t + walk + stay > minutes && stops.length >= 2) break;
    pool.splice(best, 1);
    stops.push({ ...p, walk, stay, at: t + walk });
    t += walk + stay; dist += km(here, p)! * 1.3; here = p;
  }
  return { stops, total: t, km: Math.round(dist * 10) / 10 };
}

// M233: the walk along real streets. FOSSGIS's free OSRM walking router (routing.openstreetmap.de, OpenStreetMap
// data, no account; its path segment is always "driving") is asked from the browser once per walk. Its legs
// give the true walking minutes and distance; without it the walk keeps its estimate and straight lines.
type Pt = { lat: number; lon: number };
export const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
/** The router's question for a walk from `start` through its stops in order. */
export const routeUrl = (start: Pt, stops: Pt[]) => `${ROUTER}${[start, ...stops].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';')}?overview=full&geometries=geojson`;
/** The path and each leg's minutes and km from the router's answer, or null when it isn't a usable one. */
export function routeOf(answer: unknown, legsWanted: number): { path: [number, number][]; legs: { min: number; km: number }[] } | null {
  const r = (answer as { code?: string; routes?: { geometry?: { coordinates?: unknown }; legs?: { duration?: unknown; distance?: unknown }[] }[] } | null);
  const route = r?.code === 'Ok' ? r.routes?.[0] : undefined;
  const coords = route?.geometry?.coordinates, legs = route?.legs;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(legs) || legs.length !== legsWanted) return null;
  const path = coords.filter((c): c is [number, number] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map(([lon, lat]) => [lon, lat] as [number, number]);
  if (path.length < 2) return null;
  return { path, legs: legs.map((l) => ({ min: Math.max(1, Math.round(Number(l.duration) / 60) || 1), km: Math.max(0, Number(l.distance) / 1000 || 0) })) };
}
/** The walk again with the router's walking minutes (the visits keep their length). */
export function withLegs<W extends { stops: WalkStop[]; total: number; km: number }>(w: W, legs: { min: number; km: number }[]): W {
  let t = 0;
  const stops = w.stops.map((s, i) => { const walk = legs[i]?.min ?? s.walk, at = t + walk; t = at + s.stay; return { ...s, walk, at }; });
  return { ...w, stops, total: t, km: Math.round(legs.reduce((a, l) => a + l.km, 0) * 10) / 10 };
}
/** Where the walk's time bubble sits: on the path, by the middle of its longest stretch between stops (so never
 *  on a stop). */
export function bubbleAt(path: [number, number][], points: Pt[]): [number, number] {
  let a = points[0], b = points[1] ?? points[0], best = -1;
  for (let i = 1; i < points.length; i++) { const d = Math.hypot(points[i].lon - points[i - 1].lon, points[i].lat - points[i - 1].lat); if (d > best) { best = d; a = points[i - 1]; b = points[i]; } }
  const mid = { x: (a.lon + b.lon) / 2, y: (a.lat + b.lat) / 2 };
  let near: [number, number] = path[0] ?? [mid.x, mid.y], nearD = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1], [x2, y2] = path[i], dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((mid.x - x1) * dx + (mid.y - y1) * dy) / l2)) : 0;
    const p: [number, number] = [x1 + dx * t, y1 + dy * t], d = Math.hypot(p[0] - mid.x, p[1] - mid.y);
    if (d < nearD) { nearD = d; near = p; }
  }
  return near;
}
/** Walking directions for the whole walk in Google Maps (it takes up to nine stops between start and end). */
export function walkInGoogle(start: Pt, stops: Pt[]): string {
  const at = (p: Pt) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, last = stops[stops.length - 1] ?? start;
  const via = stops.slice(0, -1).slice(0, 9).map(at).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${at(start)}&destination=${at(last)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}`;
}

/** M214: a street-level photo from Panoramax (CC BY-SA 4.0), on one of the instances the site's pictures
 *  may come from (the rest are skipped: the page's security rules list where pictures load from). */
export interface StreetPhoto { id: string; thumb: string; sd: string; hd: string; at: string | null; by: string | null; lat: number; lon: number; heading: number | null }
export const STREET_HOSTS = ['panoramax.openstreetmap.fr', 'panoramax.ign.fr', 'panoramax.mapcomplete.org', 'panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net'] as const; // the last is where the first two keep their pictures (they redirect there)
const hostOk = (u: unknown): u is string => { try { const x = new URL(String(u)); return x.protocol === 'https:' && (STREET_HOSTS as readonly string[]).includes(x.hostname); } catch { return false; } };

/** The first usable picture in a Panoramax search answer (`/api/search`), or null. */
export function streetPhotoOf(answer: unknown): StreetPhoto | null {
  const features = (answer as { features?: unknown[] } | null)?.features;
  for (const f of Array.isArray(features) ? features : []) {
    const x = f as { id?: unknown; geometry?: { type?: string; coordinates?: unknown[] }; assets?: Record<string, { href?: unknown }>; properties?: Record<string, unknown>; providers?: { name?: unknown; roles?: unknown[] }[] };
    const [lon, lat] = (x.geometry?.type === 'Point' ? x.geometry.coordinates ?? [] : []).map(Number);
    const thumb = x.assets?.thumb?.href, sd = x.assets?.sd?.href, hd = x.assets?.hd?.href;
    if (typeof x.id !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon) || !hostOk(thumb) || !hostOk(sd) || !hostOk(hd)) continue;
    const by = (x.providers ?? []).filter((p) => Array.isArray(p.roles) && p.roles.includes('producer') && typeof p.name === 'string').map((p) => p.name as string).pop() ?? null;
    const at = typeof x.properties?.datetime === 'string' ? x.properties.datetime : null, h = Number(x.properties?.['view:azimuth']);
    return { id: x.id, thumb, sd, hd, at, by: by ? by.slice(0, 80) : null, lat, lon, heading: Number.isFinite(h) ? h : null };
  }
  return null;
}

// M272 (the owner, 18 Nov: "make travel app more efficient"): what a map view asks the server for, snapped to a grid
// so that panning a little asks nothing new (the answer for the grid square is reused): the middle to 0.02° (about
// 2 km) with a radius from a few steps, the box outwards to 0.05° (about 5 km).
type ViewBox = { lat: number; lon: number; s: number; w: number; n: number; e: number };
const RADII = [1500, 3000, 6000, 10_000];
export function nearKey(v: ViewBox, half: number) {
  const r = RADII.find((x) => x >= half * 1000) ?? 10_000;
  return `lat=${(Math.round(v.lat / 0.02) * 0.02).toFixed(2)}&lon=${(Math.round(v.lon / 0.02) * 0.02).toFixed(2)}&r=${r}`;
}
export function boxKey(v: ViewBox) {
  const G = 0.05, down = (x: number) => (Math.floor(x / G) * G).toFixed(2), up = (x: number) => (Math.ceil(x / G) * G).toFixed(2);
  return `s=${down(v.s)}&w=${down(v.w)}&n=${up(v.n)}&e=${up(v.e)}`;
}
