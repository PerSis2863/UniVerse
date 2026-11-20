// UniVerse Travel's booking (M202): stays, flights, tours and trains open on partner sites with the
// place (and dates, when the trip has them) filled in. The partners pay a commission only when the
// owner has joined their affiliate programmes and set the ids (Cloudflare build variables; [owner]):
// NEXT_PUBLIC_TRAVEL_BOOKING_AID (Booking.com) and NEXT_PUBLIC_TRAVEL_GYG_PARTNER (GetYourGuide).
// Paying inside UniVerse needs partner contracts (Booking.com's or Expedia's APIs): not here yet.

export type BookKind = 'stay' | 'flight' | 'tour' | 'train';
export interface BookLink { kind: BookKind; label: string; partner: string; url: string }

const day = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

/** The partner links for a place (its guide title: "Kyoto/Central" searches "Kyoto Central"). */
export function bookingLinks(place: string, { checkin, checkout, adults = 2, from }: { checkin?: string; checkout?: string; adults?: number; from?: string } = {}): BookLink[] {
  const where = place.replace(/\//g, ' ').replace(/\s*\([^)]*\)\s*/g, ' ').trim(), q = encodeURIComponent(where);
  const ci = day(checkin), co = day(checkout), aid = process.env.NEXT_PUBLIC_TRAVEL_BOOKING_AID, gyg = process.env.NEXT_PUBLIC_TRAVEL_GYG_PARTNER;
  const stay = new URL('https://www.booking.com/searchresults.html');
  stay.searchParams.set('ss', where);
  if (ci && co && co > ci) { stay.searchParams.set('checkin', ci); stay.searchParams.set('checkout', co); }
  stay.searchParams.set('group_adults', String(Math.max(1, Math.min(30, adults))));
  if (aid) stay.searchParams.set('aid', aid);
  const tour = new URL('https://www.getyourguide.com/s/');
  tour.searchParams.set('q', where);
  if (gyg) tour.searchParams.set('partner_id', gyg);
  return [
    { kind: 'stay', label: 'Stays', partner: 'Booking.com', url: stay.toString() },
    { kind: 'flight', label: 'Flights', partner: 'Google Flights', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${where}${from ? ` from ${from}` : ''}${ci ? ` on ${ci}` : ''}`)}` },
    { kind: 'tour', label: 'Tours and tickets', partner: 'GetYourGuide', url: tour.toString() },
    { kind: 'train', label: 'Trains and buses', partner: 'Rome2Rio', url: `https://www.rome2rio.com/s/${from ? `${encodeURIComponent(from)}/` : ''}${q}` },
  ];
}

/** One place on UniVerse's own map (M347, the owner, 20 Nov: "it shows in my own map rather than going somewhere
 *  else"; it was OpenStreetMap's site, whose search often landed elsewhere): at its position with its card, otherwise
 *  found there by its name, then its address, in its city (TravelMap's `find`). `guide`: its guide, for the highlights. */
export function mapLink(name: string, { lat, lon, address, near, guide }: { lat?: number; lon?: number; address?: string; near?: string; guide?: string }) {
  const p = new URLSearchParams({ view: 'map', n: name.slice(0, 120) });
  if (lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) p.set('at', `${lat.toFixed(5)},${lon.toFixed(5)},17`);
  else {
    if (address) p.set('addr', address.slice(0, 160));
    if (near) p.set('near', near.slice(0, 80));
  }
  if (guide) p.set('d', guide);
  return `/travel?${p}`;
}

/** M204: a table at a restaurant (OpenTable's search for it near the place). */
export const tableLink = (name: string, near: string) => `https://www.opentable.com/s?term=${encodeURIComponent(`${name} ${near}`)}`;

// ——— M206/M207: between two places, and stays by price ———

/** Europe's rail and coach country codes (Omio's patch); 12Go covers South-East and East Asia. */
const EUROPE = new Set('AD AL AT BA BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC ME MK MT NL NO PL PT RO RS SE SI SK SM TR UA VA XK'.split(' '));
const ASIA = new Set('TH VN LA KH MY SG ID PH MM JP KR TW CN HK MO IN NP LK BD'.split(' '));
const place = (p: string) => p.replace(/\//g, ' ').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
const slug = (p: string) => place(p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface WayLink { label: string; partner: string; url: string }
/** How to get from one city to the next: every way compared (Rome2Rio), the exact route by public transport
 *  (Google Maps' documented directions link, M213: trains, buses and ferries with times), flights (Google
 *  Flights), trains and buses (Omio in Europe, 12Go in Asia) and ferries (Direct Ferries) where they may help.
 *  Omio's route links need its own city numbers and Direct Ferries publishes none, so those two open their
 *  search, labelled so. */
export function betweenLinks(from: { name: string; cc: string | null }, to: { name: string; cc: string | null }, { date, flight, sea }: { date?: string | null; flight?: boolean; sea?: boolean } = {}): WayLink[] {
  const a = place(from.name), b = place(to.name), d = day(date ?? undefined);
  const links: WayLink[] = [
    { label: 'Every way, with times and prices', partner: 'Rome2Rio', url: `https://www.rome2rio.com/s/${encodeURIComponent(a)}/${encodeURIComponent(b)}` },
    { label: 'This route by train, bus or ferry', partner: 'Google Maps', url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=transit` },
  ];
  if (from.cc && to.cc && EUROPE.has(from.cc) && EUROPE.has(to.cc)) links.push({ label: 'Search trains and buses', partner: 'Omio', url: 'https://www.omio.com/' });
  if (from.cc && to.cc && ASIA.has(from.cc) && ASIA.has(to.cc)) links.push({ label: 'Trains, buses and ferries', partner: '12Go', url: `https://12go.asia/en/travel/${slug(a)}/${slug(b)}` });
  if (flight !== false) links.push({ label: 'Flights', partner: 'Google Flights', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${a} to ${b}${d ? ` on ${d}` : ''}`)}` });
  if (sea) links.push({ label: 'Search ferries', partner: 'Direct Ferries', url: 'https://www.directferries.com/' });
  return links;
}

/** Hostels for a city (Hostelworld's page for it), beside the stays search (Booking.com, above). */
export const hostelLink = (city: string) => `https://www.hostelworld.com/hostels/${encodeURIComponent(place(city.split('/')[0]))}/`; // a district's city

/** Ferries may help: to or from an island country, or within a country of islands. */
const ISLANDS = new Set('GB IE IS MT CY JP ID PH LK MV SC MU FJ PF NZ TW SG CU PR TZ'.split(' ')), ISLES = new Set('GR HR IT ES TH ID PH JP NO DK SE FI EE MY'.split(' '));
export const ferryLikely = (a: string | null, b: string | null) => !!a && !!b && (a !== b ? ISLANDS.has(a) || ISLANDS.has(b) : ISLES.has(a) || ISLANDS.has(a));
