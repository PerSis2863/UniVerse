import type { Listing } from './travel-guide';
import { daySchedule, dayOrder, km, minutesFor } from './travel-plan';

// M329 (the owner, 18 Nov 2026: "apply the way tripist make a itinerary based on where you are visiting… if user had
// already booked the hotel somewhere… it will give you automated itinerary based on where you are staying and it
// should be a detailed one"): a city's days planned from its guide (and its districts'). The best places for the
// traveller's interests and pace, near where they sleep (else the centre), spread over the days by direction from
// the stay so each day stays in one part of town, each day a round from the stay and back (the shortest order),
// with lunch near where they are at midday, an afternoon café on gentler days, dinner near the last place, and a bar
// after it for night owls. Places already on the trip in that city stay (unplanned ones are fitted in first).
// Everything runs in the browser from the guides it already reads: no Worker time, no AI.

type Pos = { lat: number | null; lon: number | null };
type Located = { lat: number; lon: number };

export const PACES = {
  // `most`: the longest stay at one place, so the day's places end near six and dinner falls in the evening.
  relaxed: { label: 'Relaxed', sights: 3, start: 10 * 60, cafe: true, most: 120 },
  balanced: { label: 'Balanced', sights: 4, start: 9 * 60, cafe: true, most: 100 },
  packed: { label: 'Packed', sights: 6, start: 8.5 * 60, cafe: false, most: 75 },
} as const;
export type Pace = keyof typeof PACES;
export const isPace = (v: unknown): v is Pace => typeof v === 'string' && v in PACES;

export const INTERESTS = [
  { id: 'famous', label: 'Famous sights', words: /\b(famous|iconic|landmark|monument|unesco|symbol|best[- ]known|most visited|must)\b/i },
  { id: 'history', label: 'History', words: /\b(castle|palace|cathedral|church|temple|shrine|mosque|monastery|fort(ress)?|ruins?|old town|historic|tower|abbey|basilica|synagogue|medieval|roman)\b/i },
  { id: 'art', label: 'Museums and art', words: /\b(museum|gallery|galleries|art|exhibition|collection)\b/i },
  { id: 'nature', label: 'Parks and views', words: /\b(park|garden|beach|lake|river|views?|viewpoint|miradouro|lookout|hill|mountain|forest|nature|botanic)\b/i },
  { id: 'food', label: 'Food', words: /\b(market|food|tasting|cuisine)\b/i, kinds: ['eat'] },
  { id: 'shopping', label: 'Shopping', words: /\b(market|shops?|shopping|mall|bazaar|souk|boutiques?)\b/i, kinds: ['buy'] },
  { id: 'night', label: 'Nightlife', words: /\b(bar|club|night|live music|fado|jazz)\b/i, kinds: ['drink'] },
  { id: 'family', label: 'With children', words: /\b(zoo|aquarium|children|kids|family|playground|theme park|science|oceanarium)\b/i },
] as const;
export type Interest = (typeof INTERESTS)[number]['id'];

export interface Have extends Pos { id: string; name: string; kind: string; day: number | null; position: number; minutes: number }
export interface NewStop extends Located {
  day: number; position: number; name: string; kind: string; minutes: number;
  hours?: string; price?: string; note?: string; address?: string; url?: string; photo?: string;
}
export interface Planned {
  add: NewStop[];
  move: { id: string; day: number; position: number }[];
  /** Per planned day: the part of town it keeps to (a district's name), when the guide says. */
  areas: (string | null)[];
  /** When each planned day starts (minutes after midnight): the pace's hour; an arrival day at 14:00. */
  starts: Record<number, number>;
}

const located = (p: Pos): p is Located => p.lat !== null && p.lon !== null && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const nameKey = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const closed = /\b(closed|temporarily|permanently|demolished|under renovation)\b/i;
const sentence = (t?: string) => { const s = (t ?? '').replace(/\s+/g, ' ').trim(); const m = /^(.{40,220}?[.!?])\s/.exec(`${s} `); return (m ? m[1] : s.slice(0, 220)).trim(); };
const bearing = (from: Located, to: Located) => Math.atan2(to.lon - from.lon, to.lat - from.lat);
const area = (l: Listing) => (l.guide?.includes('/') ? l.guide.split('/').pop()!.replace(/\s*\([^)]*\)/, '') : null);

/** How strongly a guide's place fits the traveller (higher first). `rank` is its place in the guide, 0..1. */
export function fit(l: Listing, interests: readonly string[], rank: number, from: Located | null) {
  const words = `${l.name} ${l.alt ?? ''} ${l.text ?? ''} ${l.group ?? ''}`;
  let s = l.kind === 'see' ? 1 : 0.6;
  for (const i of INTERESTS) if (interests.includes(i.id) && (i.words.test(words) || ('kinds' in i && (i.kinds as readonly string[]).includes(l.kind)))) s += 2;
  if (!interests.length || interests.includes('famous')) s += INTERESTS[0].words.test(words) ? 1 : 0;
  s += 1.5 * (1 - rank) + (l.image ? 0.5 : 0) + (l.wikidata ? 0.5 : 0) + Math.min(1, (l.text?.length ?? 0) / 400);
  const d = from && located(l as Pos) ? km(from, l as Located) ?? 0 : 0;
  return s - d / 4;
}

/** Splits points into consecutive runs by direction from `from` (starting after the widest empty angle), one run
 *  per day with its room, so each day keeps to one side of town. */
function byDirection<T extends Located>(points: T[], from: Located, rooms: number[]): T[][] {
  const sorted = [...points].sort((a, b) => bearing(from, a) - bearing(from, b));
  if (sorted.length > 1) {
    let gap = -1, at = 0;
    sorted.forEach((p, i) => { const next = sorted[(i + 1) % sorted.length]; const g = (bearing(from, next) - bearing(from, p) + 2 * Math.PI) % (2 * Math.PI); if (g > gap) { gap = g; at = (i + 1) % sorted.length; } });
    sorted.push(...sorted.splice(0, at));
  }
  const out: T[][] = [];
  let i = 0;
  for (const room of rooms) { out.push(sorted.slice(i, i + room)); i += room; }
  return out;
}

/**
 * The plan for one city: which guide places to add on which day and in what order, and where the places already
 * there move. `days` is the city's number of days; `only` the days to plan (default all); `light` days get half as
 * many places (arriving and leaving).
 */
export function makeItinerary(input: {
  listings: Listing[]; days: number; stay: Pos | null; centre: Pos | null; pace: Pace; interests: readonly string[];
  have: Have[]; only?: number[]; light?: number[];
}): Planned {
  const { listings, days, pace, interests, have } = input;
  const p = PACES[pace];
  const pool = listings.filter((l) => l.name && located(l as Pos) && !closed.test(l.text ?? ''));
  const home: Located | null = input.stay && located(input.stay) ? input.stay : input.centre && located(input.centre) ? input.centre
    : pool.length ? { lat: pool.reduce((n, l) => n + l.lat!, 0) / pool.length, lon: pool.reduce((n, l) => n + l.lon!, 0) / pool.length } : null;
  const used = new Set(have.map((h) => nameKey(h.name)));
  const plannable = (input.only ?? Array.from({ length: days }, (_, d) => d)).filter((d) => d >= 0 && d < days);
  const kept = have.filter((h) => h.kind !== 'sleep');
  const keptOn = (d: number) => kept.filter((h) => h.day === d).sort((a, b) => a.position - b.position);
  const loose = kept.filter((h) => h.day === null || h.day >= days);

  // How many sights each day still has room for.
  const want = (d: number) => (input.light?.includes(d) ? Math.ceil(p.sights / 2) : p.sights);
  const rooms = plannable.map((d) => Math.max(0, want(d) - keptOn(d).filter((h) => h.kind !== 'eat' && h.kind !== 'drink').length));
  const free = rooms.reduce((n, r) => n + r, 0);

  // The places that fit best, near the stay (within 15 km, or the nearest when none are).
  const sights = pool.filter((l) => l.kind === 'see' || l.kind === 'do' || (l.kind === 'buy' && interests.includes('shopping')));
  const near = home ? sights.filter((l) => (km(home, l as Located) ?? 99) <= 15) : sights;
  const ranked = (near.length >= Math.min(free, 6) ? near : sights)
    .map((l) => ({ l, s: fit(l, interests, sights.indexOf(l) / Math.max(1, sights.length), home) }))
    .sort((a, b) => b.s - a.s);
  const mustSee = loose.filter(located);
  const picks: Listing[] = [];
  for (const { l } of ranked) {
    if (picks.length >= Math.max(0, free - mustSee.length)) break;
    const k = nameKey(l.name);
    if (used.has(k)) continue;
    used.add(k); picks.push(l);
  }

  type Point = Located & { ref: Have | Listing; isNew: boolean };
  const points: Point[] = [...mustSee.map((h) => ({ lat: h.lat!, lon: h.lon!, ref: h, isNew: false })), ...picks.map((l) => ({ lat: l.lat!, lon: l.lon!, ref: l, isNew: true }))];
  const groups = home ? byDirection(points, home, rooms) : rooms.map((r, i) => points.slice(rooms.slice(0, i).reduce((n, x) => n + x, 0), rooms.slice(0, i).reduce((n, x) => n + x, 0) + r));

  const add: NewStop[] = [], move: Planned['move'] = [], areas: (string | null)[] = [], starts: Record<number, number> = {};
  // An arrival day (the first light one) starts after check-in; the others at the pace's hour.
  const startOf = (d: number) => (d === 0 && input.light?.includes(0) ? 14 * 60 : p.start);
  const eats = pool.filter((l) => l.kind === 'eat'), drinks = pool.filter((l) => l.kind === 'drink');
  /** The nearest unused place of a list to `at` (within `max` km), taken. */
  const nearest = (list: Listing[], at: Located, max: number) => {
    let best: Listing | null = null, d = max;
    for (const l of list) { const k = nameKey(l.name); if (used.has(k)) continue; const x = km(at, l as Located) ?? 99; if (x < d) { d = x; best = l; } }
    if (best) used.add(nameKey(best.name));
    return best;
  };
  const stop = (l: Listing, minutes?: number, label?: string): NewStop => ({
    day: 0, position: 0, name: l.name.slice(0, 120), kind: l.kind === 'other' || l.kind === 'go' ? 'see' : l.kind, lat: l.lat!, lon: l.lon!,
    minutes: minutes ?? Math.min(p.most, minutesFor(l.kind, l.name, l.text ?? '')),
    hours: l.hours?.slice(0, 160), price: l.price?.slice(0, 120), address: l.address?.slice(0, 200), url: l.url, photo: l.image,
    note: [label, sentence(l.text)].filter(Boolean).join(' · ').slice(0, 600) || undefined,
  });

  plannable.forEach((d, gi) => {
    const begin = startOf(d);
    starts[d] = begin;
    type Slot = { id?: string; s?: NewStop; kind: string; lat: number | null; lon: number | null; minutes: number };
    const slot = (s: NewStop): Slot => ({ s, kind: s.kind, lat: s.lat, lon: s.lon, minutes: s.minutes });
    const fresh = (groups[gi] ?? []).map((pt): Slot => (pt.isNew ? slot(stop(pt.ref as Listing)) : { id: (pt.ref as Have).id, kind: (pt.ref as Have).kind, lat: pt.lat, lon: pt.lon, minutes: (pt.ref as Have).minutes }));
    const already = keptOn(d).map((h): Slot => ({ id: h.id, kind: h.kind, lat: h.lat, lon: h.lon, minutes: h.minutes }));
    let day: Slot[] = dayOrder([...already, ...fresh], home);
    if (day.length && day.some(located)) {
      // Lunch where you are at half past twelve, a café mid-afternoon, dinner near the last place, then a bar.
      const at = (i: number) => (located(day[Math.max(0, Math.min(day.length - 1, i))]) ? day[Math.max(0, Math.min(day.length - 1, i))] as Located : home);
      const clock = daySchedule(day, begin, home).stops;
      const noon = clock.findIndex((c) => c.to >= 12.5 * 60), lunchAt = noon >= 0 ? at(noon) : null;
      const lunch = lunchAt && !day.some((x) => x.kind === 'eat') ? nearest(eats, lunchAt, 1.5) : null;
      if (lunch) day.splice(noon + 1, 0, slot(stop(lunch, 60, 'Lunch')));
      const withLunch = daySchedule(day, begin, home).stops;
      const tea = withLunch.findIndex((c) => c.to >= 15.5 * 60);
      const teaAt = p.cafe && tea >= 0 && tea < day.length - 1 ? at(tea) : null, cafe = teaAt ? nearest(drinks, teaAt, 0.8) : null;
      if (cafe) day.splice(tea + 1, 0, slot(stop(cafe, 30, 'Coffee break')));
      // Dinner when the day runs into the evening, near the last place (else near the stay).
      const last = at(day.length - 1), late = daySchedule(day, begin, home).stops.at(-1)!.to >= 16.5 * 60;
      const dinner = late && last ? nearest(eats, last, 1.5) ?? (home ? nearest(eats, home, 1.5) : null) : null;
      if (dinner) day.push(slot(stop(dinner, 90, 'Dinner')));
      const bar = dinner && interests.includes('night') ? nearest(drinks, dinner as Located, 1) : null;
      if (bar) day.push(slot(stop(bar, 60, 'Evening')));
    }
    day = day.slice(0, 12);
    day.forEach((x, position) => {
      if (x.s) add.push({ ...x.s, day: d, position });
      else if (x.id) { const h = have.find((y) => y.id === x.id)!; if (h.day !== d || h.position !== position) move.push({ id: x.id, day: d, position }); }
    });
    // The part of town most of the day's new places are in.
    const counts = new Map<string, number>();
    for (const pt of groups[gi] ?? []) if (pt.isNew) { const a = area(pt.ref as Listing); if (a) counts.set(a, (counts.get(a) ?? 0) + 1); }
    areas.push([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  });
  return { add, move, areas, starts };
}
