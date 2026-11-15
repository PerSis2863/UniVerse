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

/** A map for one place: OpenStreetMap at its position, otherwise a search for its name and address. */
export function mapLink(name: string, { lat, lon, address, near }: { lat?: number; lon?: number; address?: string; near?: string }) {
  if (lat !== undefined && lon !== undefined) return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent([name, address, near].filter(Boolean).join(', '))}`;
}

/** M204: a table at a restaurant (OpenTable's search for it near the place). */
export const tableLink = (name: string, near: string) => `https://www.opentable.com/s?term=${encodeURIComponent(`${name} ${near}`)}`;
