import { api } from './api';
import { cacheFor, dataKey, tripTiles, type Tile } from './trip-offline';

// M240: saving a trip for offline use, in the browser (Cache Storage, one cache per trip; nothing on the server).
// Kept: the trip as last loaded, each city's guide, the trip page and a map page per city, the map's code, the map
// service's description, the tiles around the cities and planned places (trip-offline.ts) and the map's fonts.
// Not kept (said on the page): photos, live weather, routes, other people's later changes.

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const FONTS = ['InterRegular', 'InterBold'].flatMap((f) => ['0-255', '256-511', '8192-8447'].map((r) => `/fonts/map/${f}/${r}.pbf`));

type Pt = { lat: number; lon: number };
export interface OfflineGuide { title: string; summary: string[]; sections: { title: string; text: string[] }[] }
export interface OfflinePack<T> { trip: T; guides: OfflineGuide[]; savedAt: string; bytes: number; tiles: number; capped: boolean; maps: { name: string; href: string }[] }

export const offlineSupported = () => typeof caches !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** The pack saved for a trip, or null. */
export async function readPack<T>(tripId: string): Promise<OfflinePack<T> | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hit = await (await caches.open(cacheFor(tripId))).match(dataKey(tripId));
    return hit ? ((await hit.json()) as OfflinePack<T>) : null;
  } catch { return null; }
}

export const removePack = (tripId: string) => caches.delete(cacheFor(tripId));

/** Saves a trip; `progress(done, total)` as it goes. The parts that fail (a tile, a guide) are skipped and counted. */
export async function savePack<T>(tripId: string, trip: T, cities: (Pt & { guide: string; name: string })[], places: Pt[], progress: (done: number, total: number) => void, signal: AbortSignal): Promise<OfflinePack<T>> {
  void navigator.storage?.persist?.().catch(() => false); // ask the browser to keep it
  const cache = await caches.open(cacheFor(tripId));
  let bytes = 0;
  const keep = async (url: string, into: Cache = cache) => {
    const r = await fetch(url, { signal, mode: url.startsWith('http') ? 'cors' : 'same-origin' });
    if (!r.ok) throw new Error(String(r.status));
    bytes += (await r.clone().blob()).size;
    await into.put(url, r);
  };
  const { tiles, capped } = tripTiles(cities, places);
  const maps = cities.map((c) => ({ name: c.name, href: `/travel?view=map&at=${c.lat.toFixed(4)},${c.lon.toFixed(4)},13` }));
  const total = tiles.length + cities.length + maps.length + FONTS.length + 3;
  let done = 0;
  const step = () => progress(++done, total);

  // The pages (the trip and a map per city) where the service worker looks for pages, and the map's code.
  const pages = await caches.open('pages-v2');
  for (const href of [location.pathname + location.search, ...maps.map((m) => m.href)]) { await keep(href, pages).catch(() => {}); step(); }
  await import('@/components/travel/map/TravelMap').catch(() => null); step();

  // Each city's guide, as text.
  const guides: OfflineGuide[] = [];
  for (const c of cities) {
    signal.throwIfAborted();
    try {
      const { data } = await api.get<{ guide: { title: string; summary: string[]; sections: { title: string; text: string[] }[] } }>(`/travel/guide?d=${encodeURIComponent(c.guide)}`);
      const g = data.guide;
      guides.push({ title: g.title, summary: g.summary.slice(0, 4), sections: g.sections.filter((s) => s.text.length).map((s) => ({ title: s.title, text: s.text.slice(0, 6) })) });
    } catch { /* no guide: the rest still saves */ }
    step();
  }

  // The map: its description (which names the tiles' current version), the tiles, the fonts.
  const tj = await fetch(TILEJSON, { signal }).then((r) => r.json() as Promise<{ tiles?: string[] }>);
  await cache.put(TILEJSON, new Response(JSON.stringify(tj), { headers: { 'content-type': 'application/json' } })); step();
  const template = tj.tiles?.[0];
  if (!template) throw new Error('The map service didn’t answer.');
  const url = (t: Tile) => template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));
  for (const f of FONTS) { await keep(f).catch(() => {}); step(); }
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < tiles.length) {
      signal.throwIfAborted();
      const t = tiles[next++];
      await keep(url(t)).catch((e) => { if ((e as Error).name === 'AbortError') throw e; });
      step();
    }
  }));

  const pack: OfflinePack<T> = { trip, guides, savedAt: new Date().toISOString(), bytes, tiles: tiles.length, capped, maps };
  await cache.put(dataKey(tripId), new Response(JSON.stringify(pack), { headers: { 'content-type': 'application/json' } }));
  step();
  return pack;
}
