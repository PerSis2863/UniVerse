// M240: a trip saved for offline use. Pure parts (tested in trip-offline.test.ts): which map tiles cover a
// trip's cities and places (OpenFreeMap's vector tiles, zoom 5 to 14, its deepest; the map draws closer zooms from
// those), within a cap; the pack's size in words. The saving itself (trip-offline-save.ts) runs in the browser into
// Cache Storage; the service worker (src/worker/index.ts) answers the map's tile and font requests from it.

export const MAX_TILES = 500;
/** One cache per trip, so Remove takes out exactly that trip. The service worker looks in every `uv-trip-` cache. */
export const cacheFor = (tripId: string) => `uv-trip-${tripId}`;
/** The trip's own data in its cache (the page reads it when there's no signal). */
export const dataKey = (tripId: string) => `/offline/trip/${encodeURIComponent(tripId)}.json`;

type Pt = { lat: number; lon: number };
export interface Tile { z: number; x: number; y: number }

/** The tile at a position and zoom (Web Mercator, as every web map). */
export function tileAt(p: Pt, z: number): Tile {
  const n = 2 ** z, lat = Math.max(-85.0511, Math.min(85.0511, p.lat)) * (Math.PI / 180);
  const x = Math.floor(((p.lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Every tile within `km` of a position at zoom `z`. */
function around(p: Pt, km: number, z: number): Tile[] {
  const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
  const a = tileAt({ lat: p.lat + dLat, lon: p.lon - dLon }, z), b = tileAt({ lat: p.lat - dLat, lon: p.lon + dLon }, z);
  const out: Tile[] = [];
  for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y });
  return out;
}

/** The tiles for a trip: around each city (6 km, zoom 5–14) and each planned place (1 km, zoom 12–14), the
 *  coarse ones first, at most `cap` (closer zooms are left out first when there's too much). */
export function tripTiles(cities: Pt[], places: Pt[], cap = MAX_TILES): { tiles: Tile[]; capped: boolean } {
  const seen = new Set<string>(), all: Tile[] = [];
  const add = (t: Tile) => { const k = `${t.z}/${t.x}/${t.y}`; if (!seen.has(k)) { seen.add(k); all.push(t); } };
  for (let z = 5; z <= 14; z++) {
    for (const c of cities) around(c, z < 9 ? 30 : 6, z).forEach(add);
    if (z >= 12) for (const p of places) around(p, 1, z).forEach(add);
  }
  return { tiles: all.slice(0, cap), capped: all.length > cap };
}

/** "12.4 MB". */
export const size = (bytes: number) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toFixed(1)} MB`);
