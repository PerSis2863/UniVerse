import type { SessionUser } from '@/lib/server-auth';
import { factIds, factsFromWikidata, funFactFrom, fromWikidata, photosFromCommons, placeFromNominatim, storiesFromWikipedia, type PlaceInfo } from '@/lib/travel-place';
import { BadRequestException, NotFoundException } from './http';
import { first, type Query } from './body';
import { cached, fetchJson } from './travel';

// Travel's map (M209): a place's real facts (OpenStreetMap through Nominatim, Wikidata and Wikipedia),
// the photos people took near a spot (Wikimedia Commons) and the Wikipedia articles about places near
// it. Each answer is kept in travel_cache (places 30 days, photos and stories 7) so the sources are asked
// rarely, and only a place's id or a rounded position is sent. When a source is busy the map carries on
// without that layer.

const DAY = 86_400_000, HOUR = 3_600_000;
const coord = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= max ? n : null; };
const radius = (v: unknown) => Math.max(200, Math.min(10_000, Math.round((Number(v) || 1500) / 100) * 100));

/** GET /travel/place?osm=N123 (a map place) or ?name=&lat=&lon= (a guide's listing): its card. */
export async function travelPlace(_u: SessionUser, q: Query) {
  const osm = first(q.osm) ?? '', name = (first(q.name) ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const lat = coord(first(q.lat), 90), lon = coord(first(q.lon), 180);
  let key: string, ask: string;
  if (/^[NWR]\d{1,12}$/.test(osm)) { key = `place2:${osm}`; ask = `lookup?osm_ids=${osm}`; }
  else if (name && lat !== null && lon !== null) {
    key = `place2:${name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    const d = 0.004; // about 400 m round the point
    ask = `search?q=${encodeURIComponent(name)}&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}&bounded=1&limit=1`;
  } else throw new BadRequestException('Pick a place.');
  const make = async (): Promise<PlaceInfo | null> => {
    const rows = await fetchJson<Parameters<typeof placeFromNominatim>[0][]>(`https://nominatim.openstreetmap.org/${ask}&format=jsonv2&extratags=1&addressdetails=1&accept-language=en`);
    if (!rows?.[0]) return null;
    const p = placeFromNominatim(rows[0]);
    if (p.wikidata) {
      const e = await fetchJson<{ entities: Record<string, Parameters<typeof fromWikidata>[0]> }>(`https://www.wikidata.org/wiki/Special:EntityData/${p.wikidata}.json`).catch(() => null);
      const item = e ? Object.values(e.entities)[0] : undefined;
      const w = fromWikidata(item);
      Object.assign(p, { about: w.about, image: w.image, wiki: w.wiki ? `https://en.wikipedia.org/wiki/${encodeURIComponent(w.wiki.replace(/ /g, '_'))}` : null });
      // M270: what's known about it, with the names of what it points to (an architect, a style, a listing).
      const want = factIds(item);
      const named = want.length ? await fetchJson<{ entities?: Record<string, { labels?: { en?: { value: string } } }> }>(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${want.join('|')}&props=labels&languages=en&format=json`).catch(() => null) : null;
      type Labels = { labels?: { en?: { value: string } } };
      const names: Record<string, string> = {};
      for (const [q, v] of Object.entries(named?.entities ?? {}) as [string, Labels][]) if (v.labels?.en?.value) names[q] = v.labels.en.value;
      p.known = [...new Set([...factsFromWikidata(item, names), ...(p.known ?? [])])].slice(0, 8);
      if (w.wiki) {
        const t = encodeURIComponent(w.wiki.replace(/ /g, '_'));
        const s = await fetchJson<{ extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${t}`).catch(() => null);
        if (s?.extract) p.about = s.extract.slice(0, 600);
        // A fun fact from further in the article (its first few thousand characters, plain text).
        const more = await fetchJson<{ query?: { pages?: { extract?: string }[] } }>(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&exchars=5000&redirects=1&format=json&formatversion=2&titles=${t}`).catch(() => null);
        p.funFact = funFactFrom(more?.query?.pages?.[0]?.extract, p.about);
        if (!s || !more) p.partial = true; // Wikipedia busy: kept, but asked again within the hour
      }
    }
    return p;
  };
  let place = await cached<PlaceInfo>(key, 30 * DAY, make);
  // M270: a card kept while a source was busy is made again once it's an hour old (not after 30 days).
  if (place?.partial) place = (await cached<PlaceInfo>(key, HOUR, make).catch(() => null)) ?? place;
  if (!place) throw new NotFoundException('There are no details for this place yet.');
  // M270: no credit line under the card (the owner): Wikipedia is linked beside its text, the map credits OpenStreetMap.
  return { place };
}

/** GET /travel/photos?lat=&lon=&r=: photos people took near a spot (Commons), each with its author and licence. */
export async function travelPhotos(_u: SessionUser, q: Query) {
  const lat = coord(first(q.lat), 90), lon = coord(first(q.lon), 180), r = radius(first(q.r));
  if (lat === null || lon === null) throw new BadRequestException('Pick a place.');
  const photos = await cached(`photos:${lat.toFixed(2)},${lon.toFixed(2)},${r}`, 7 * DAY, async () => photosFromCommons(await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat.toFixed(3)}%7C${lon.toFixed(3)}&ggsradius=${r}&ggslimit=40&ggsnamespace=6&prop=imageinfo%7Ccoordinates&iiprop=url%7Cextmetadata&iiurlwidth=400&iiextmetadatafilter=Artist%7CLicenseShortName%7CObjectName&format=json&formatversion=2`,
  ))).catch(() => null);
  return { photos: photos ?? [], credit: 'Photos: Wikimedia Commons (each by its author, under its licence)' };
}

/** GET /travel/stories?lat=&lon=&r=: the Wikipedia articles about places near a spot, with their first lines. */
export async function travelStories(_u: SessionUser, q: Query) {
  const lat = coord(first(q.lat), 90), lon = coord(first(q.lon), 180), r = radius(first(q.r));
  if (lat === null || lon === null) throw new BadRequestException('Pick a place.');
  const stories = await cached(`stories:${lat.toFixed(2)},${lon.toFixed(2)},${r}`, 7 * DAY, async () => storiesFromWikipedia(await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat.toFixed(3)}%7C${lon.toFixed(3)}&ggsradius=${r}&ggslimit=30&prop=coordinates%7Cpageimages%7Cextracts&exintro=1&explaintext=1&exsentences=2&exlimit=30&piprop=thumbnail&pithumbsize=320&format=json&formatversion=2`,
  ))).catch(() => null);
  return { stories: stories ?? [], credit: 'Stories: Wikipedia (CC BY-SA 4.0)' };
}

/** GET /travel/where?q=: where a place (a guide's title) is on the map: its middle and its box, kept 90 days. */
export async function travelWhere(_u: SessionUser, q: Query) {
  const term = (first(q.q) ?? '').replace(/\//g, ' ').replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (term.length < 2) throw new BadRequestException('Pick a place.');
  // M268: also the town it's in (a hotel typed in finds its city's guide), and the name OpenStreetMap gives it.
  type Row = { lat: string; lon: string; boundingbox?: string[]; name?: string; address?: Record<string, string> };
  const at = await cached<{ lat: number; lon: number; box: [number, number, number, number] | null; city: string | null; name: string | null }>(`where3:${term.toLowerCase()}`, 90 * DAY, async () => {
    const rows = await fetchJson<Row[]>(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}&format=jsonv2&limit=1&addressdetails=1&accept-language=en`);
    const r = rows?.[0];
    if (!r) return null;
    const b = r.boundingbox?.map(Number); // [south, north, west, east]
    const a = r.address ?? {};
    return { lat: Number(r.lat), lon: Number(r.lon), box: b && b.length === 4 && b.every(Number.isFinite) ? [b[2], b[0], b[3], b[1]] : null, city: a.city ?? a.town ?? a.village ?? a.municipality ?? null, name: r.name || null };
  });
  if (!at) throw new NotFoundException('That place isn’t on the map.');
  return at;
}
