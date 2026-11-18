import { kmBetween } from './relief';

// Relief's delivery route (M312): the order to visit the requests a helper took, from where they start:
// nearest first, then improved by swapping legs (2-opt) while it gets shorter. Positions are rounded to
// about 500 m (relief.ts), so distances and times are close, not exact. Pure, run in the browser.

export type Pt = { lat: number; lng: number };
export const SPEED_KMH = { walk: 4.5, bike: 14, drive: 25 } as const;
export type Mode = keyof typeof SPEED_KMH;

const pathKm = (start: Pt, order: Pt[]) => order.reduce((s, p, i) => s + kmBetween(i ? order[i - 1] : start, p), 0);

export function orderStops<T extends Pt>(start: Pt, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at: Pt = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (kmBetween(at, left[i]) < kmBetween(at, left[best])) best = i;
    at = left.splice(best, 1)[0];
    out.push(at as T);
  }
  // 2-opt: reverse a stretch whenever that shortens the whole path (a handful of stops: cheap).
  let better = true;
  for (let round = 0; better && round < 20; round++) {
    better = false;
    for (let i = 0; i < out.length - 1; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const next = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
        if (pathKm(start, next) + 1e-9 < pathKm(start, out)) { out.splice(0, out.length, ...next); better = true; }
      }
    }
  }
  return out;
}

export function routeSummary(start: Pt, order: Pt[], mode: Mode) {
  const legs = order.map((p, i) => kmBetween(i ? order[i - 1] : start, p) * 1.3); // streets are longer than the straight line
  const km = legs.reduce((a, b) => a + b, 0);
  return { legs: legs.map((k) => Math.round(k * 10) / 10), km: Math.round(km * 10) / 10, minutes: Math.round((km / SPEED_KMH[mode]) * 60) };
}

/** Google Maps directions through every stop (up to 9 waypoints, Google's limit for links). */
export function mapsLink(start: Pt, order: Pt[], mode: Mode) {
  const f = (p: Pt) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const stops = order.slice(0, 10);
  const last = stops[stops.length - 1];
  const params = new URLSearchParams({ api: '1', origin: f(start), destination: last ? f(last) : f(start), travelmode: mode === 'drive' ? 'driving' : mode === 'bike' ? 'bicycling' : 'walking' });
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(f).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
