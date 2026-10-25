import { CITIES } from '@/components/trace/map/cities';
import { shuffled } from '../seeded-shuffle';

// World Pin (UniVerse Play, a Trace game): a parcel is going to a city; pin where it is on the world
// map. The closer, the more points, and quick pins earn a little extra. Fifteen cities a round, the
// same ones in the same order for everyone with the same seed.

export const PIN_TARGETS = 15;
export const PIN_SECONDS_PER = 8;
const POOL = CITIES.filter((c) => c[3] <= 2);

export interface PinTarget { name: string; lat: number; lng: number }

export function pinTarget(seed: number, i: number): PinTarget {
  const order = shuffled(POOL.map((_, k) => k), `${seed}:pin`);
  const [name, lat, lng] = POOL[order[i % POOL.length]];
  return { name, lat, lng };
}

/** Great-circle distance in km. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Up to 1,000 for a pin on the spot, nothing past 3,000 km; up to 200 more for speed. */
export function pinPoints(km: number, msLeft: number): number {
  if (km >= 3000) return 0;
  const near = km < 50 ? 1 : 1 - km / 3000;
  return Math.round(1000 * near) + Math.round(200 * Math.max(0, Math.min(1, msLeft / (PIN_SECONDS_PER * 1000))));
}
/** A word for how close it was. */
export const pinVerdict = (km: number) => (km < 100 ? 'Bullseye!' : km < 500 ? 'So close' : km < 1500 ? 'Not bad' : km < 3000 ? 'Same part of the world' : 'Far off');
