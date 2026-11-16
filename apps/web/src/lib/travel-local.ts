import ZONES from './travel-zones.json';

// A place's own clock (M209): its time zone (the IANA zone of its country whose main place is nearest:
// travel-zones.json, from the public-domain tz list), the time there now, and its sunlight today (sunrise,
// sunset and the golden hours, from the sunrise equation). Pure; used by the map's "Open now" and its
// light.

const Z = ZONES as [string, string, number, number][];
const d2 = (a: number, b: number, c: number, d: number) => (a - c) ** 2 + ((b - d) * Math.cos((a * Math.PI) / 180)) ** 2;

/** The time zone at a position: within its country when known (Spain's Canary Islands, the US). */
export function zoneAt(lat: number, lon: number, cc?: string | null): string {
  const pool = cc ? Z.filter((z) => z[0] === cc.toUpperCase()) : [];
  let best: [string, string, number, number] | null = null, bd = Infinity;
  for (const z of pool.length ? pool : Z) { const d = d2(lat, lon, z[2], z[3]); if (d < bd) { bd = d; best = z; } }
  return best?.[1] ?? 'UTC';
}

/** The day of the week (Monday 0) and minutes past midnight in a zone, and the date there. */
export function localClock(zone: string, at: Date): { day: number; minutes: number; date: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}
/** "18:42" in a zone. */
export const clockText = (zone: string, at: Date) => new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(at);

// ——— Sunlight ———

const RAD = Math.PI / 180, DAY = 86_400_000, J1970 = 2440588, J2000 = 2451545, OBLIQUITY = RAD * 23.4397, J0 = 0.0009;
const toDays = (t: number) => t / DAY - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY);

/** Sunrise, sunset and the golden hours (the sun under 6° high) on a day at a place; null in polar day or night. */
export function sunTimes(lat: number, lon: number, day: Date): { rise: Date; set: Date; goldenMorning: Date; goldenEvening: Date } | null {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(day.getTime());
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const approx = (ht: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
  const ds = approx(0), M = RAD * (357.5291 + 0.98560028 * ds);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(OBLIQUITY));
  const transit = (x: number) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = transit(ds);
  const at = (h: number) => {
    const w = Math.acos((Math.sin(h * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    if (Number.isNaN(w)) return null;
    const set = transit(approx(w));
    return { set: fromJulian(set), rise: fromJulian(noon - (set - noon)) };
  };
  const horizon = at(-0.833), golden = at(6);
  if (!horizon) return null;
  return { rise: horizon.rise, set: horizon.set, goldenMorning: golden?.rise ?? horizon.rise, goldenEvening: golden?.set ?? horizon.set };
}

/** Where the sun is: its compass bearing (degrees from north, clockwise) and height above the horizon. */
export function sunPosition(lat: number, lon: number, at: Date): { azimuth: number; altitude: number } {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(at.getTime());
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(OBLIQUITY)), ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { azimuth: ((az / RAD + 180) % 360 + 360) % 360, altitude: Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD };
}
