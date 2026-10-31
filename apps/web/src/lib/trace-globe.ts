import type { Place } from '@/components/live/Planet';

// The Live globe view turns the brand's shipments (GET /trace/map/tracking) into points and arcs on
// the 3D globe (src/components/live/Planet.tsx). A shipment on the move is a pink point where it is
// now; its destination is an aqua point; an arc joins the two. A cold-chain shipment over its limit
// turns its point aqua-free — pink stays, but we flag it in the label so it reads on the globe.

export interface GlobeShipment {
  label: string; product: string; status: string;
  position: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number; place: string | null } | null;
  kmLeft?: number | null; etaMinutes?: number | null; tempC?: number | null; maxTempC?: number | null;
}

/** Places (current positions + destinations) and the arcs between each position and its destination. */
export function globeFromShipments(ships: GlobeShipment[]): { places: Place[]; arcs: [number, number][] } {
  const places: Place[] = [];
  const arcs: [number, number][] = [];
  for (const s of ships) {
    if (!s.position) continue;
    const hot = s.maxTempC != null && s.tempC != null && s.tempC > s.maxTempC;
    const eta = s.etaMinutes != null ? `${Math.round(s.etaMinutes)} min away` : s.status === 'DELIVERED' ? 'delivered' : s.status === 'IN_TRANSIT' ? 'on the move' : 'at the depot';
    const here = places.push({ label: s.product, lat: s.position.lat, lon: s.position.lng, tone: hot ? 'pink' : s.status === 'IN_TRANSIT' ? 'pink' : 'aqua', value: hot ? 'over temperature' : eta }) - 1;
    if (s.dest) {
      const to = places.push({ label: s.dest.place || 'Destination', lat: s.dest.lat, lon: s.dest.lng, tone: 'aqua' }) - 1;
      arcs.push([here, to]);
    }
  }
  return { places, arcs };
}
