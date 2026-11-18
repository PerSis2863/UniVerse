// Real places on Travel's map (M209), read from public sources: a place's facts from OpenStreetMap (through
// Nominatim: its hours, phone, website, menu, cuisine, access, payment; ODbL), its photo and a line about it
// from Wikidata and Wikipedia (CC0, CC BY-SA), photos people took nearby from Wikimedia Commons (each with
// its author and licence), and the Wikipedia articles about places nearby. Pure: src/server/travel-places.ts
// fetches and keeps them.

export interface PlaceInfo {
  key: string; name: string; kind: string; lat: number; lon: number; cc: string | null; city: string | null;
  address: string | null; phone: string | null; website: string | null; menu: string | null; hours: string | null;
  cuisine: string[]; facts: string[]; wikidata: string | null; about: string | null; image: string | null; wiki: string | null;
  /** M270: what's known about it (built, heritage, designer, style, height, visitors, awards…) and a fun fact. */
  known?: string[]; funFact?: string | null;
  /** Made while a source was busy: made again sooner. */
  partial?: boolean;
}
export interface Photo { file: string; thumb: string; w: number; h: number; lat: number; lon: number; title: string; author: string | null; licence: string | null; page: string }
export interface Story { title: string; lat: number; lon: number; extract: string; thumb: string | null; url: string }

/** A map tile's place id (the OSM id ×10 plus 1 for a node, 2 a way, 3 a relation) as N123 / W123 / R123. */
export function osmKey(tileId: number | string | undefined): string | null {
  const n = Number(tileId);
  if (!Number.isSafeInteger(n) || n < 11) return null;
  const type = { 1: 'N', 2: 'W', 3: 'R' }[n % 10];
  return type ? `${type}${Math.floor(n / 10)}` : null;
}
export const isPlaceKey = (k: unknown): k is string => typeof k === 'string' && /^(?:[NWR]\d{1,12}|wp:[^\s/][^\n]{0,119})$/.test(k);

const WORDS: Record<string, string> = { fast_food: 'Fast food', ice_cream: 'Ice cream', place_of_worship: 'Place of worship', pastry: 'Pastry shop', bakery: 'Bakery', pub: 'Pub', bar: 'Bar', cafe: 'Café', viewpoint: 'Viewpoint', attraction: 'Sight', artwork: 'Artwork', guest_house: 'Guest house', hostel: 'Hostel', hotel: 'Hotel', museum: 'Museum', gallery: 'Gallery', restaurant: 'Restaurant', monument: 'Monument', memorial: 'Memorial', castle: 'Castle', park: 'Park', garden: 'Garden' };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clean = (s: unknown, n = 300) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
const url = (s: unknown) => { const u = clean(s, 400); return u && /^https?:\/\//.test(u) ? u : u && /^www\./.test(u) ? `https://${u}` : null; };
const text = (html: unknown, n = 120) => clean(typeof html === 'string' ? html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, '\'').replace(/\s+/g, ' ') : null, n);

type Nominatim = { osm_type: string; osm_id: number; lat: string; lon: string; category?: string; type?: string; name?: string; address?: Record<string, string>; extratags?: Record<string, string> | null };

/** One Nominatim row (with extratags and addressdetails) as a place card's facts. */
export function placeFromNominatim(r: Nominatim): PlaceInfo {
  const t = r.extratags ?? {}, a = r.address ?? {};
  const facts: string[] = [];
  const yes = (k: string) => t[k] === 'yes';
  if (t.wheelchair === 'yes') facts.push('Wheelchair accessible');
  else if (t.wheelchair === 'limited') facts.push('Partly wheelchair accessible');
  else if (t.wheelchair === 'no') facts.push('Not wheelchair accessible');
  if (yes('outdoor_seating')) facts.push('Outdoor seating');
  if (t.internet_access && t.internet_access !== 'no') facts.push('Wi-Fi');
  if (yes('payment:cards') || yes('payment:credit_cards') || yes('payment:debit_cards')) facts.push('Cards taken');
  if (t['payment:cash'] === 'no') facts.push('No cash');
  if (yes('takeaway') || t.takeaway === 'only') facts.push(t.takeaway === 'only' ? 'Takeaway only' : 'Takeaway');
  if (yes('delivery')) facts.push('Delivery');
  if (['yes', 'only'].includes(t['diet:vegetarian'])) facts.push('Vegetarian options');
  if (['yes', 'only'].includes(t['diet:vegan'])) facts.push('Vegan options');
  if (yes('diet:halal') || t['diet:halal'] === 'only') facts.push('Halal');
  if (t.fee === 'no') facts.push('Free to enter'); else if (t.fee === 'yes') facts.push('Entry fee');
  if (t.start_date && /^\d{3,4}$/.test(t.start_date)) facts.push(`Since ${t.start_date}`);
  // M270: what the map's own data says about its past.
  const known: string[] = [];
  if (t.historic && t.historic !== 'yes') known.push(`Historic ${t.historic.replace(/_/g, ' ')}`);
  if (t.heritage || t['heritage:operator']) known.push('A protected heritage site');
  if (clean(t.architect, 80)) known.push(`Designed by ${clean(t.architect, 80)}`);
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
  return {
    key: `${r.osm_type[0].toUpperCase()}${r.osm_id}`,
    name: clean(r.name, 160) ?? clean(t['name:en'], 160) ?? cap((r.type ?? 'place').replace(/_/g, ' ')),
    kind: WORDS[r.type ?? ''] ?? cap((t.cuisine && r.type === 'restaurant' ? `${t.cuisine.split(';')[0].replace(/_/g, ' ')} restaurant` : (r.type ?? r.category ?? 'place').replace(/_/g, ' '))),
    lat: Number(r.lat), lon: Number(r.lon), cc: a.country_code ? a.country_code.toUpperCase() : null, city,
    address: [street, a.suburb ?? a.neighbourhood ?? a.quarter, city].filter(Boolean).join(', ') || null,
    phone: clean(t.phone ?? t['contact:phone'], 40), website: url(t.website ?? t['contact:website']), menu: url(t['website:menu']),
    hours: clean(t.opening_hours, 300), cuisine: (t.cuisine ?? '').split(';').map((c) => cap(c.trim().replace(/_/g, ' '))).filter(Boolean).slice(0, 4),
    facts, wikidata: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : null, about: null, image: null, wiki: null, known, funFact: null,
  };
}

type Entity = { descriptions?: { en?: { value: string } }; claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>; sitelinks?: { enwiki?: { title: string } } };
/** What Wikidata adds: a line about it, its photo (a Commons file), its Wikipedia article. */
export function fromWikidata(e: Entity | undefined): { about: string | null; image: string | null; wiki: string | null } {
  const image = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return { about: clean(e?.descriptions?.en?.value, 200), image: typeof image === 'string' ? image : null, wiki: e?.sitelinks?.enwiki?.title ?? null };
}

type CommonsPage = { title: string; coordinates?: { lat: number; lon: number }[]; imageinfo?: { thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] };
/** Commons' photos near a place (geosearch with imageinfo, formatversion 2): pictures only, with credit. */
export function photosFromCommons(j: { query?: { pages?: CommonsPage[] } } | null): Photo[] {
  return (j?.query?.pages ?? []).flatMap((p) => {
    const i = p.imageinfo?.[0], at = p.coordinates?.[0], m = i?.extmetadata ?? {};
    if (!i?.thumburl || !at || !/\.(jpe?g|png|webp)$/i.test(p.title)) return [];
    return [{
      file: p.title.replace(/^File:/, ''), thumb: i.thumburl, w: i.thumbwidth ?? 400, h: i.thumbheight ?? 300, lat: at.lat, lon: at.lon,
      title: text(m.ObjectName?.value) ?? p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      author: text(m.Artist?.value, 80), licence: text(m.LicenseShortName?.value, 40), page: i.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
    }];
  });
}

type WikiPage = { title: string; coordinates?: { lat: number; lon: number }[]; thumbnail?: { source: string }; extract?: string };
/** Wikipedia's articles about places nearby, each with its opening lines. */
export function storiesFromWikipedia(j: { query?: { pages?: WikiPage[] } } | null): Story[] {
  return (j?.query?.pages ?? []).flatMap((p) => {
    const at = p.coordinates?.[0], extract = clean(p.extract, 320);
    if (!at || !extract) return [];
    return [{ title: p.title, lat: at.lat, lon: at.lon, extract, thumb: p.thumbnail?.source ?? null, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` }];
  });
}

// ——— M270: facts about a place (the owner, 18 Nov: "add facts of that specific place that i click on the map… historic
// or ancient or popular food place… it could be fun fact also") ———

type Snak = { mainsnak?: { datavalue?: { value?: unknown } } };
const ids = (e: Entity | undefined, prop: string, max = 3) => (e?.claims?.[prop] ?? []).map((c: Snak) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id).filter((x): x is string => !!x && /^Q\d+$/.test(x)).slice(0, max);
const amount = (e: Entity | undefined, prop: string) => {
  const vals = (e?.claims?.[prop] ?? []).map((c: Snak) => c.mainsnak?.datavalue?.value as { amount?: string; unit?: string } | undefined).filter((v) => v?.amount);
  return vals.length ? { n: Math.max(...vals.map((v) => Number(v!.amount))), unit: vals[0]!.unit ?? '' } : null;
};
/** A Wikidata date ("+1889-03-31T00:00:00Z", precision 9 year / 7 century / 6 millennium) as words. */
export function whenText(v: { time?: string; precision?: number } | undefined): string | null {
  const m = v?.time && /^([+-])0*(\d+)-/.exec(v.time);
  if (!m) return null;
  const y = Number(m[2]), bc = m[1] === '-', p = v!.precision ?? 9;
  if (p <= 6) return `the ${Math.ceil(y / 1000)}${ord(Math.ceil(y / 1000))} millennium${bc ? ' BC' : ''}`;
  if (p === 7) { const c = Math.ceil(y / 100); return `the ${c}${ord(c)} century${bc ? ' BC' : ''}`; }
  return bc ? `${y} BC` : String(y);
}
const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

/** The Q-ids whose names the facts need (one wbgetentities call). */
export const factIds = (e: Entity | undefined) => [...new Set([...ids(e, 'P1435'), ...ids(e, 'P84'), ...ids(e, 'P170'), ...ids(e, 'P149'), ...ids(e, 'P138'), ...ids(e, 'P166', 2), ...ids(e, 'P2012', 2)])].slice(0, 20);

/** Short facts from a place's Wikidata item, with the names of what it points to. */
export function factsFromWikidata(e: Entity | undefined, names: Record<string, string>): string[] {
  if (!e) return [];
  const out: string[] = [];
  const label = (q: string) => names[q];
  const built = whenText((e.claims?.P571?.[0] as Snak | undefined)?.mainsnak?.datavalue?.value as { time?: string; precision?: number });
  const opened = whenText((e.claims?.P1619?.[0] as Snak | undefined)?.mainsnak?.datavalue?.value as { time?: string; precision?: number });
  if (built) out.push(/century|millennium/.test(built) ? `Dates from ${built}` : `Built or founded in ${built}`);
  else if (opened) out.push(`Opened in ${opened}`);
  const heritage = ids(e, 'P1435').map(label).filter(Boolean);
  if (heritage.some((h) => /world heritage/i.test(h))) out.push('A UNESCO World Heritage Site');
  else if (heritage[0]) out.push(cap(heritage[0]));
  const by = ids(e, 'P84').map(label).filter(Boolean), made = ids(e, 'P170').map(label).filter(Boolean);
  if (by.length) out.push(`Designed by ${by.slice(0, 2).join(' and ')}`); else if (made.length) out.push(`Made by ${made.slice(0, 2).join(' and ')}`);
  const style = ids(e, 'P149').map(label).filter(Boolean);
  if (style.length) out.push(`${cap(style.slice(0, 2).join(' and '))} style`);
  const named = ids(e, 'P138', 1).map(label).filter(Boolean);
  if (named.length) out.push(`Named after ${named[0]}`);
  const h = amount(e, 'P2048');
  if (h && h.unit.endsWith('/Q11573') && h.n >= 10) out.push(`${Math.round(h.n)} m tall`);
  const v = amount(e, 'P1174');
  if (v && v.n >= 1000) out.push(`About ${v.n >= 1e6 ? `${Math.round(v.n / 1e5) / 10} million` : Math.round(v.n).toLocaleString('en')} visitors a year`);
  const awards = ids(e, 'P166', 2).map(label).filter(Boolean);
  if (awards.length) out.push(`Award: ${awards.join(', ')}`);
  const food = ids(e, 'P2012', 2).map(label).filter(Boolean);
  if (food.length) out.push(`Known for ${food.join(' and ')}`);
  return out;
}

const SPARK = /\b(first|oldest|largest|biggest|tallest|longest|smallest|only|famous|legend|legendary|nicknamed|secret|record|invented|originally|once|world|unique|rumou?red|said to|believed|century|ancient|ghost|hidden|million|favourite|favorite|beloved|iconic)\b/gi;
/** "Did you know?": the most surprising sentence of the article that the card doesn't already show. */
export function funFactFrom(article: string | undefined, shown: string | null): string | null {
  if (!article) return null;
  const seen = (shown ?? '').toLowerCase();
  const best = article.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((x) => x.trim()).filter((x) => x.length >= 50 && x.length <= 260 && !/[=]{2}|^\W/.test(x) && !seen.includes(x.toLowerCase().slice(0, 60)))
    .map((x, i) => ({ x, score: (x.match(SPARK)?.length ?? 0) * 2 + (/\d/.test(x) ? 1 : 0) - i * 0.02 }))
    .filter((c) => c.score >= 2).sort((a, b) => b.score - a.score)[0];
  return best?.x ?? null;
}
