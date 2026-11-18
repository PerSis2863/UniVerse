// Neighbourhood challenges (M318): a neighbourhood is the 0.1° square a place falls in (about 11 km, as
// Green's map rounds positions), named by its south-west corner; totals show only once enough people
// share it, so nobody's own actions can be told apart.

export const MIN_NEIGHBOURS = 3;
export const CHALLENGE_DAYS = [7, 14, 30] as const;

export function areaOf(lat: number, lng: number) {
  const f = (v: number) => Math.round(Math.floor(v * 10 + 1e-9)) / 10;
  return { lat: f(lat), lng: f(lng) };
}

export const areaName = (a: { lat: number; lng: number }) => `${Math.abs(a.lat).toFixed(1)}°${a.lat >= 0 ? 'N' : 'S'} ${Math.abs(a.lng).toFixed(1)}°${a.lng >= 0 ? 'E' : 'W'}`;

/** A challenge's share done (0–1) and whether the area is on pace for it at this point of its weeks. */
export function pace(progress: number, goal: number, start: number, end: number, now = Date.now()) {
  const done = goal > 0 ? Math.min(1, progress / goal) : 0;
  const time = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  return { done, time, onPace: done >= time };
}
