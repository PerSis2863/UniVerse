import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { LISTING_KINDS, readGuide, type Guide } from '@/lib/travel-guide';
import { BadRequestException, NotFoundException, ServiceUnavailableException } from './http';
import COUNTRIES from '@/lib/travel-countries.json';
import { oneOf, str, type Body, type Query, first } from './body';

// UniVerse Travel (M183): guides, facts, the weather and search, read from public sources and kept in
// travel_cache so each is fetched rarely (Wikimedia, OpenStreetMap's Nominatim and MET Norway all ask
// apps to name themselves, cache and go gently); and a person's saved places. Nothing here sends who is
// asking to those sources: only a place's name or rounded position.
//   Wikivoyage (guides, CC BY-SA 3.0: credited and linked), Nominatim (which country a place is in,
//   ODbL), MET Norway (weather, CC BY 4.0); country facts from a table kept in the app (Wikidata, CC0).

const UA = 'UniVerseTravel/1.0 (https://github.com/PerSis2863/UniVerse; travel guides)';
const HOUR = 3_600_000, DAY = 24 * HOUR;

async function fetchJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new ServiceUnavailableException('The travel guide service is busy. Try again in a minute.');
  return (await r.json()) as T;
}

/** The answer kept for `key`, fresh enough; otherwise made again and kept (an old one if the source fails). */
async function cached<T>(key: string, maxAge: number, make: () => Promise<T | null>): Promise<T | null> {
  const row = await prisma.travelCache.findUnique({ where: { key } }).catch(() => null);
  if (row && Date.now() - row.fetchedAt.getTime() < maxAge) return JSON.parse(row.data) as T;
  try {
    const fresh = await make();
    if (fresh !== null) {
      const data = JSON.stringify(fresh), fetchedAt = new Date();
      await prisma.travelCache.upsert({ where: { key }, create: { key, data, fetchedAt }, update: { data, fetchedAt } }).catch(() => {});
    }
    return fresh;
  } catch (e) {
    if (row) return JSON.parse(row.data) as T;
    throw e;
  }
}

/** A guide's title as asked (no wiki markup; Wikivoyage's own "Kyoto/Central" form is fine). */
function titleOf(v: unknown) {
  const t = (str(v) ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120 || /[[\]{}|#<>]/.test(t)) throw new BadRequestException('Pick a place.');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** GET /travel/search?q=: places with a guide, as you type. */
export async function travelSearch(_u: SessionUser, q: Query) {
  const term = (first(q.q) ?? '').trim().slice(0, 80);
  if (term.length < 2) return { results: [] };
  const results = await cached(`search:${term.toLowerCase()}`, 7 * DAY, async () => {
    const r = await fetchJson<{ pages: { title: string; description: string | null; thumbnail: { url: string } | null }[] }>(
      `https://en.wikivoyage.org/w/rest.php/v1/search/title?q=${encodeURIComponent(term)}&limit=8`);
    return (r?.pages ?? []).map((p) => ({ title: p.title, about: p.description ?? null, thumb: p.thumbnail?.url ? `https:${p.thumbnail.url.replace(/^https?:/, '')}` : null }));
  });
  return { results: results ?? [] };
}

export interface CountryFacts {
  name: string; code: string; flag: string; capital?: string; currencies: { code: string; name: string }[];
  languages: string[]; callingCode?: string; drives?: 'left' | 'right';
  /** Numbers for the police, an ambulance, the fire service (the first is the one to remember). */
  emergency: string[];
}

const flagOf = (code: string) => String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

/** A country's facts from the table kept in the app (src/lib/travel-countries.json, from Wikidata, CC0):
 *  its capital, money, languages, which side cars drive on, its calling code and emergency numbers. */
export function countryFacts(code: string): CountryFacts | null {
  const row = (COUNTRIES as unknown as Record<string, [string, string[], string[], string, string, string[]]>)[code];
  if (!row) return null;
  const names = new Intl.DisplayNames(['en'], { type: 'region' }), money = new Intl.DisplayNames(['en'], { type: 'currency' });
  return {
    name: names.of(code) ?? code, code, flag: flagOf(code), capital: row[0] || undefined,
    currencies: row[1].map((c) => ({ code: c, name: money.of(c) ?? c })), languages: row[2],
    callingCode: row[4] || undefined, drives: row[3] === 'L' ? 'left' : row[3] === 'R' ? 'right' : undefined,
    // 112 works across Europe and on most mobile phones: first when it's one of them.
    emergency: [...row[5]].sort((a, b) => (a === '112' ? -1 : b === '112' ? 1 : 0)),
  };
}

/** The country a position is in (Nominatim, kept 90 days a tenth of a degree), and its facts. */
async function countryAt(lat: number, lon: number): Promise<CountryFacts | null> {
  const where = await cached(`where:${lat.toFixed(1)},${lon.toFixed(1)}`, 90 * DAY, async () => {
    const r = await fetchJson<{ address?: { country_code?: string } }>(`https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&format=json&zoom=3&accept-language=en`);
    return r?.address?.country_code ? { code: r.address.country_code.toUpperCase() } : null;
  }).catch(() => null);
  return where ? countryFacts(where.code) : null;
}

/** The listings a guide keeps per part (a big city's sleep list runs to hundreds). */
const MAX_LISTINGS = 60;

/** GET /travel/guide?d=: a place's guide, its country's facts, and the credit to show. */
export async function travelGuide(_u: SessionUser, q: Query) {
  let title = titleOf(first(q.d));
  const guide = await cached<Guide>(`guide:${title.toLowerCase()}`, 14 * DAY, async () => {
    for (let hop = 0; hop < 2; hop++) {
      const r = await fetch(`https://en.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}?action=raw`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new ServiceUnavailableException('The travel guide service is busy. Try again in a minute.');
      const wiki = await r.text();
      const moved = /^#REDIRECT\s*\[\[([^\]|#]+)/i.exec(wiki);
      if (moved) { title = moved[1].trim(); continue; }
      const g = readGuide(title, wiki);
      for (const s of g.sections) s.listings = s.listings.slice(0, MAX_LISTINGS);
      return g;
    }
    return null;
  });
  if (!guide) throw new NotFoundException('There’s no guide for that place yet. Try the city or country it’s in.');
  const country = guide.lat !== undefined && guide.lon !== undefined ? await countryAt(guide.lat, guide.lon) : null;
  return { guide, country, credit: { source: 'Wikivoyage', licence: 'CC BY-SA 3.0', url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(guide.title.replace(/ /g, '_'))}` } };
}

export interface WeatherDay { date: string; min: number; max: number; symbol: string | null; rain: number }

/** GET /travel/weather?lat=&lon=: the next days' highs, lows, rain and sky (MET Norway), kept an hour. */
export async function travelWeather(_u: SessionUser, q: Query) {
  const lat = Number(first(q.lat)), lon = Number(first(q.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new BadRequestException('Pick a place.');
  const days = await cached<WeatherDay[]>(`weather:${lat.toFixed(1)},${lon.toFixed(1)}`, HOUR, async () => {
    type T = { time: string; data: { instant: { details: { air_temperature: number } }; next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount?: number } }; next_1_hours?: { details: { precipitation_amount?: number } } } };
    const r = await fetchJson<{ properties: { timeseries: T[] } }>(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`);
    return weatherDays(r?.properties.timeseries ?? [], lon);
  });
  return { days: days ?? [], credit: 'Weather: MET Norway (CC BY 4.0)' };
}

/** Hourly forecast points to days: the low and high, the rain, and the sky around midday, in the place's
 *  own time (from its longitude: the sun's time, near enough to its clocks for a day's forecast). */
export function weatherDays(points: { time: string; data: { instant: { details: { air_temperature: number } }; next_6_hours?: { summary: { symbol_code: string }; details: { precipitation_amount?: number } }; next_1_hours?: { details: { precipitation_amount?: number } } } }[], lon = 0): WeatherDay[] {
  const by = new Map<string, WeatherDay & { noon: number }>();
  const shift = Math.round(lon / 15) * HOUR;
  for (const p of points) {
    const local = new Date(Date.parse(p.time) + shift).toISOString();
    const date = local.slice(0, 10), hour = Number(local.slice(11, 13)), t = p.data.instant.details.air_temperature;
    const d = by.get(date) ?? { date, min: t, max: t, symbol: null, rain: 0, noon: 99 };
    d.min = Math.min(d.min, t); d.max = Math.max(d.max, t);
    d.rain += p.data.next_1_hours?.details.precipitation_amount ?? 0;
    const sym = p.data.next_6_hours?.summary.symbol_code;
    if (sym && Math.abs(hour - 12) < d.noon) { d.symbol = sym; d.noon = Math.abs(hour - 12); }
    by.set(date, d);
  }
  return [...by.values()].slice(0, 7).map((d) => ({ date: d.date, symbol: d.symbol, min: Math.round(d.min), max: Math.round(d.max), rain: Math.round(d.rain * 10) / 10 }));
}

// ——— Saved places ———

const KINDS = [...LISTING_KINDS] as const;
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').trim(); return s ? s.slice(0, n) : null; };
const coord = (v: unknown, max: number) => { const n = Number(v); return typeof v === 'number' && Number.isFinite(n) && Math.abs(n) <= max ? n : null; };

/** GET /travel/saved: my saved places, newest first. */
export async function travelSaved(u: SessionUser) {
  const saved = await prisma.travelSaved.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 300 });
  return { saved };
}

/** POST /travel/saved: keep a place (once per guide and name). */
export async function saveTravelPlace(u: SessionUser, b: Body) {
  const guide = titleOf(b.guide), name = clip(b.name, 120);
  if (!name) throw new BadRequestException('Name the place.');
  const url = clip(b.url, 400);
  const data = {
    kind: oneOf(KINDS, b.kind) ? b.kind : 'see', lat: coord(b.lat, 90), lon: coord(b.lon, 180), note: clip(b.note, 600),
    address: clip(b.address, 200), url: url && /^https?:\/\//.test(url) ? url : null,
  };
  const count = await prisma.travelSaved.count({ where: { userId: u.id } });
  if (count >= 300) throw new BadRequestException('You’ve saved 300 places: remove a few first.');
  const saved = await prisma.travelSaved.upsert({ where: { userId_guide_name: { userId: u.id, guide, name } }, create: { userId: u.id, guide, name, ...data }, update: data });
  return { saved };
}

/** DELETE /travel/saved/:id: only my own. */
export async function removeTravelPlace(u: SessionUser, id: string) {
  const r = await prisma.travelSaved.deleteMany({ where: { id, userId: u.id } });
  if (!r.count) throw new NotFoundException('That place isn’t saved.');
  return { ok: true };
}
