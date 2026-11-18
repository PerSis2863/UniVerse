// M237: the Google Maps features of Travel's map, the parts that are plain logic (tested in map-tools.test.ts):
// directions between two points by walking, cycling or driving (FOSSGIS's free OSRM routers, OpenStreetMap data),
// "what's here" (Nominatim's address for a point) and measuring a distance or an area. (A place's details, hours and
// "open now" were already in the place card, through /travel/place.) Every answer comes straight
// to the browser from those free services (no Worker CPU, no account).

export type Pt = { lat: number; lon: number };
export type Mode = 'foot' | 'bike' | 'car';
export const MODES: { id: Mode; label: string }[] = [{ id: 'foot', label: 'Walk' }, { id: 'bike', label: 'Cycle' }, { id: 'car', label: 'Drive' }];

const at = (p: Pt) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`;
/** M260: what a drive can leave out (the routers' OSRM "exclude" classes; one at a time, as their car profile allows). */
export type Avoid = '' | 'toll' | 'motorway' | 'ferry';
export const AVOIDS: { id: Avoid; label: string }[] = [{ id: '', label: 'Nothing' }, { id: 'toll', label: 'Tolls' }, { id: 'motorway', label: 'Motorways' }, { id: 'ferry', label: 'Ferries' }];
/** The router's question for a route from `a` to `b` (with other ways there, and the turns); M260: through stops on
 *  the way (`via`, then without other ways: the router gives those only between two points) and leaving one kind of
 *  road out when driving. */
export const directionsUrl = (mode: Mode, a: Pt, b: Pt, o: { via?: Pt[]; avoid?: Avoid } = {}) =>
  `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${[a, ...(o.via ?? []), b].map(at).join(';')}?overview=full&geometries=geojson&steps=true&alternatives=${o.via?.length ? 'false' : 'true'}${mode === 'car' && o.avoid ? `&exclude=${o.avoid}` : ''}`;

/** A turn of a route: its words and length, and (M260, for live navigation) its kind, side, road, where it is and how long it takes. */
export interface Step { text: string; km: number; sec: number; type: string; mod: string; name: string; at: [number, number] | null; exit?: number }
export interface Route { path: [number, number][]; minutes: number; km: number; steps: Step[] }

type RawStep = { name?: unknown; distance?: unknown; duration?: unknown; maneuver?: { type?: unknown; modifier?: unknown; location?: unknown; exit?: unknown } };
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
/** A turn in words ("Turn left onto Kaivokatu"), from the router's step. `last`: the end of the whole route (else a stop on the way). */
export function stepText(s: RawStep, last = true): string {
  const type = String(s.maneuver?.type ?? ''), mod = String(s.maneuver?.modifier ?? ''), name = typeof s.name === 'string' && s.name ? s.name.slice(0, 80) : '';
  const onto = name ? ` onto ${name}` : '', exit = Number(s.maneuver?.exit);
  const side = mod.replace('sharp ', 'sharply ').replace('slight ', 'slightly ');
  if (type === 'depart') return name ? `Head off along ${name}` : 'Head off';
  if (type === 'arrive') return last ? 'You have arrived' : 'You have reached your stop';
  if (type === 'roundabout' || type === 'rotary') return `At the roundabout, take the ${ORDINAL[exit - 1] ? `${ORDINAL[exit - 1]} ` : ''}exit${onto}`;
  if (type === 'exit roundabout' || type === 'exit rotary') return name ? `Leave the roundabout onto ${name}` : 'Leave the roundabout';
  if (mod === 'uturn') return `Turn around${onto}`;
  if (type === 'on ramp') return `Take the ramp${mod && mod !== 'straight' ? ` on the ${mod.replace(/^(sharp|slight) /, '')}` : ''}${onto}`;
  if (type === 'off ramp') return `Take the exit${onto}`;
  if (type === 'new name') return name ? `Continue onto ${name}` : 'Continue straight';
  if (!mod || mod === 'straight') return name ? `Continue on ${name}` : 'Continue straight';
  if (type === 'end of road') return `At the end of the road, turn ${side}${onto}`;
  return `${type === 'fork' ? 'Keep' : type === 'merge' ? 'Merge' : 'Turn'} ${side}${onto}`;
}

/** The routes in the router's answer (the first is the best), or [] when it isn't a usable one. */
export function routesOf(answer: unknown): Route[] {
  const r = answer as { code?: string; routes?: { geometry?: { coordinates?: unknown }; duration?: unknown; distance?: unknown; legs?: { steps?: RawStep[] }[] }[] } | null;
  if (r?.code !== 'Ok' || !Array.isArray(r.routes)) return [];
  const out: Route[] = [];
  for (const x of r.routes.slice(0, 3)) {
    const coords = Array.isArray(x.geometry?.coordinates) ? (x.geometry.coordinates as unknown[]) : [];
    const path = coords.filter((c): c is [number, number] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map(([lon, lat]) => [lon, lat] as [number, number]);
    const minutes = Math.max(1, Math.round(Number(x.duration) / 60) || 1), km = Math.max(0, Number(x.distance) / 1000 || 0);
    if (path.length < 2) continue;
    // M260: every leg's turns (a route through stops has one leg per stretch); a stretch's "depart" after a stop is left out.
    const legs = Array.isArray(x.legs) ? x.legs : [];
    const steps: Step[] = legs.flatMap((leg, li) => (Array.isArray(leg?.steps) ? leg.steps : []).filter((s) => li === 0 || s?.maneuver?.type !== 'depart').map((s) => {
      const loc = s.maneuver?.location, type = String(s.maneuver?.type ?? ''), last = li === legs.length - 1, exit = Number(s.maneuver?.exit);
      return {
        text: stepText(s, last), km: Math.max(0, Number(s.distance) / 1000 || 0), sec: Math.max(0, Number(s.duration) || 0),
        type: type === 'arrive' && !last ? 'stop' : type, mod: String(s.maneuver?.modifier ?? ''), name: typeof s.name === 'string' ? s.name.slice(0, 80) : '',
        at: Array.isArray(loc) && Number.isFinite(loc[0]) && Number.isFinite(loc[1]) ? [Number(loc[0]), Number(loc[1])] as [number, number] : null,
        ...(Number.isFinite(exit) && exit > 0 ? { exit } : {}),
      };
    })).slice(0, 400);
    out.push({ path, minutes, km, steps });
  }
  return out;
}

/** "12 min", "1 h 05 min". */
export const duration = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`);
/** "350 m", "1.2 km", "24 km". */
export const distance = (km: number) => (km < 1 ? `${Math.round((km * 1000) / 10) * 10} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
/** Along the ground between two points, in km. */
export function haversine(a: Pt, b: Pt) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** A measured line's length, in km. */
export const lengthOf = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);
/** The area inside the points (closed back to the first), in km² (a sphere's polygon area). */
export function areaOf(pts: Pt[]) {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += rad(b.lon - a.lon) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat))); }
  return Math.abs((s * R * R) / 2);
}
/** "4,200 m²", "3.4 ha", "12 km²". */
export const area = (km2: number) => (km2 < 0.01 ? `${Math.round(km2 * 1e6).toLocaleString('en')} m²` : km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2 < 10 ? km2.toFixed(1) : Math.round(km2)} km²`);

/** Nominatim's question for the address at a point. */
export const reverseUrl = (p: Pt) => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${p.lat.toFixed(6)}&lon=${p.lon.toFixed(6)}`;
/** The address in Nominatim's answer, or null. */
export function addressOf(answer: unknown): string | null {
  const n = (answer as { display_name?: unknown } | null)?.display_name;
  return typeof n === 'string' && n ? n.split(', ').slice(0, 4).join(', ').slice(0, 160) : null;
}

/** A link to this spot on Travel's map (shared or copied). */
export const spotLink = (origin: string, p: Pt, zoom: number) => `${origin}/travel?view=map&at=${p.lat.toFixed(5)},${p.lon.toFixed(5)},${Math.round(zoom * 10) / 10}&pin=1`;
/** Google Maps' directions between two points (for public transport, which these routers don't do). */
export const googleDirections = (a: Pt, b: Pt, mode: Mode | 'transit') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat.toFixed(5)},${a.lon.toFixed(5)}&destination=${b.lat.toFixed(5)},${b.lon.toFixed(5)}&travelmode=${{ foot: 'walking', bike: 'bicycling', car: 'driving', transit: 'transit' }[mode]}`;


/** A place for directions: where it is and what it's called. */
export type Spot = Pt & { name: string };
/** M260: Home, Work and the places looked up last (kept on this device only, as Apple Maps and Google Maps offer them). */
export type Kept = { home?: Spot; work?: Spot; recent: Spot[] };
const same = (a: Spot, b: Spot) => a.name === b.name && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
/** The places looked up, the newest first, each once, at most six ("Your location" and the map's middle aren't kept). */
export function withRecent(k: Kept, s: Spot): Kept {
  if (/^(Your location|Middle of the map)$/.test(s.name)) return k;
  return { ...k, recent: [{ lat: s.lat, lon: s.lon, name: s.name.slice(0, 80) }, ...k.recent.filter((x) => !same(x, s))].slice(0, 6) };
}
/** What was kept, from its stored form (anything odd left out). */
export function keptOf(v: unknown): Kept {
  const spot = (x: unknown): Spot | undefined => {
    const o = x as Partial<Spot> | null;
    return o && typeof o.name === 'string' && Number.isFinite(o.lat) && Number.isFinite(o.lon) && Math.abs(o.lat!) <= 90 && Math.abs(o.lon!) <= 180 ? { lat: o.lat!, lon: o.lon!, name: o.name.slice(0, 80) } : undefined;
  };
  const o = (v ?? {}) as { home?: unknown; work?: unknown; recent?: unknown };
  return { home: spot(o.home), work: spot(o.work), recent: (Array.isArray(o.recent) ? o.recent : []).map(spot).filter((x): x is Spot => !!x).slice(0, 6) };
}
