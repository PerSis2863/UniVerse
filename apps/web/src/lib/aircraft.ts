// Live air traffic for Trace's Live globe (M69, the owner: "add aircraft globe in the app"). Shared by
// the server (src/server/aircraft.ts) and sample mode. A plane is [lat, lon, track°, speed m/s, altitude m].

export type Plane = [number, number, number, number, number];
export interface AirTraffic { at: string | null; planes: Plane[]; source: string; note?: string }

const RAD = Math.PI / 180, R = 6_371_000;
/** Where a plane is after `metres` along its track (a great circle), in degrees. */
export function ahead(lat: number, lon: number, track: number, metres: number): [number, number] {
  const p1 = lat * RAD, l1 = lon * RAD, t = track * RAD, d = metres / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / RAD, ((((l2 / RAD) + 540) % 360) - 180)];
}

/** OpenSky's "all states" answer → airborne planes with a position, at most `max`, evenly picked. */
export function planesFrom(states: unknown[][] | null | undefined, max = 4000): Plane[] {
  const out: Plane[] = [];
  for (const s of states ?? []) {
    const lon = s[5], lat = s[6], ground = s[8];
    if (ground || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    out.push([r2(lat), r2(lon), Math.round(Number(s[10]) || 0), Math.round(Number(s[9]) || 0), Math.round(Number(s[13] ?? s[7]) || 0)]);
  }
  if (out.length <= max) return out;
  const step = out.length / max;
  return Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]);
}
