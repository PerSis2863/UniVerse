import type { Place } from '@/components/live/Planet';

// The Live globe view turns the brand's shipments (GET /trace/map/tracking) into points and arcs on
// the 3D globe (src/components/live/Planet.tsx). A shipment on the move is a pink point where it is
// now; its destination is an aqua point; an arc joins the two. A cold-chain shipment over its limit
// turns its point aqua-free — pink stays, but we flag it in the label so it reads on the globe.

export interface GlobeShipment {
  id?: string; label: string; product: string; status: string; quantity?: number; speedKmh?: number | null;
  stops?: { place?: string | null }[];
  position: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number; place: string | null } | null;
  kmLeft?: number | null; etaMinutes?: number | null; tempC?: number | null; maxTempC?: number | null;
}

/** 206 → "3 h 26 min", 45 → "45 min". */
export const minutesText = (m: number) => { const n = Math.round(m); return n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`; };

/** Places (current positions + destinations), the arcs between each position and its destination, and
 *  for each shipment the index of its position among the places (-1: not on the globe). */
export function globeFromShipments(ships: GlobeShipment[]): { places: Place[]; arcs: [number, number][]; at: number[] } {
  const places: Place[] = [];
  const arcs: [number, number][] = [];
  const at: number[] = [];
  for (const s of ships) {
    if (!s.position) { at.push(-1); continue; }
    const hot = s.maxTempC != null && s.tempC != null && s.tempC > s.maxTempC;
    const eta = s.etaMinutes != null ? `${minutesText(s.etaMinutes)} away` : s.status === 'DELIVERED' ? 'delivered' : s.status === 'IN_TRANSIT' ? 'on the move' : 'at the depot';
    const here = places.push({ label: s.product, lat: s.position.lat, lon: s.position.lng, tone: hot ? 'pink' : s.status === 'IN_TRANSIT' ? 'pink' : 'aqua', value: hot ? 'over temperature' : eta }) - 1;
    at.push(here);
    if (s.dest) {
      const to = places.push({ label: s.dest.place || 'Destination', lat: s.dest.lat, lon: s.dest.lng, tone: 'aqua' }) - 1;
      arcs.push([here, to]);
    }
  }
  return { places, arcs, at };
}
