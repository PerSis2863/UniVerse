import { TRAVEL_FACTORS } from './green';
import { haversine, type Pt } from './map-tools';

// M356 (the owner, 20 Nov: "why there are no public transport here?"; then "i need both and it should show all the
// transport and options just like google and apple maps does"): Directions' public transport tab. Timetables come only
// from paid services or ones whose rules don't fit UniVerse (Transitous: open-source, non-commercial apps only), so it
// shows every way to get there with a time and CO₂ estimated from the distance, and opens the exact departures, lines
// and changes in Google Maps, Apple Maps or Citymapper (their documented links), or compares and books with Rome2Rio.

export type WayKind = 'local' | 'train' | 'bus' | 'flight' | 'car';
export type Way = { kind: WayKind; label: string; minutes: number; kg: number; note: string };

const per = (km: number, kph: number) => (km / kph) * 60;
/** Every sensible way between two points, quickest first: city transport close by; trains and coaches between towns;
 *  a flight once it's far; the drive to compare. Times include getting to and waiting at the station or airport. */
export function waysBetween(a: Pt, b: Pt): Way[] {
  const d = haversine(a, b), out: Way[] = []; // km
  if (d < 0.3) return out;
  const road = d * 1.25; // roads and rails wind
  if (d < 60) out.push({ kind: 'local', label: 'Bus, tram or metro', minutes: 10 + per(d * 1.3, d < 15 ? 18 : 35), kg: d * TRAVEL_FACTORS.bus.kg, note: 'Walking to the stop and waiting included' });
  if (d >= 25 && d <= 1500) out.push({ kind: 'train', label: 'Train', minutes: (d > 250 ? 25 : 35) + per(d * 1.12, d > 250 ? 230 : 85), kg: d * TRAVEL_FACTORS.train.kg, note: d > 250 ? 'High-speed lines where they run' : 'Regional trains' });
  if (d >= 25 && d <= 2500) out.push({ kind: 'bus', label: 'Coach', minutes: 25 + per(road, 70), kg: d * TRAVEL_FACTORS.bus.kg, note: 'Long-distance buses, usually the cheapest' });
  if (d >= 350) out.push({ kind: 'flight', label: 'Flight', minutes: (2.5 + d / 750) * 60, kg: d * (d < 500 ? TRAVEL_FACTORS.plane.short! : TRAVEL_FACTORS.plane.kg), note: 'Getting to the airport and boarding included' });
  if (d >= 1.5 && d <= 3000) out.push({ kind: 'car', label: 'Drive', minutes: per(road, d < 30 ? 35 : 80), kg: d * TRAVEL_FACTORS.car.kg, note: 'To compare: the CO₂ is the car’s, shared by who rides' });
  return out.map((w) => ({ ...w, minutes: Math.max(5, Math.round(w.minutes / 5) * 5), kg: Math.round(w.kg * 10) / 10 })).sort((x, y) => x.minutes - y.minutes);
}

const ll = (p: Pt) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
/** The exact departures, lines and changes in the apps that have the timetables (their documented links). */
export const transitApps = (a: Pt & { name: string }, b: Pt & { name: string }) => [
  { name: 'Google Maps', url: `https://www.google.com/maps/dir/?api=1&origin=${ll(a)}&destination=${ll(b)}&travelmode=transit` },
  { name: 'Apple Maps', url: `https://maps.apple.com/?saddr=${ll(a)}&daddr=${ll(b)}&dirflg=r` },
  { name: 'Citymapper', url: `https://citymapper.com/directions?startcoord=${ll(a)}&endcoord=${ll(b)}&startname=${encodeURIComponent(a.name)}&endname=${encodeURIComponent(b.name)}` },
];
