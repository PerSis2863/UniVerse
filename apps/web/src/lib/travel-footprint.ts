import { TRAVEL_FACTORS, TRAVEL_MODES, type TravelMode } from './green';
import { ferryLikely } from './travel-book';
import { leg, type PlanStop } from './travel-plan';

// M247: a trip's footprint, pure and tested (travel-footprint.test.ts): the CO₂ of getting between its cities by the
// way chosen for each leg (or the likely one), for all its travellers, against the greenest way that works there.
// Factors only from src/lib/green.ts.

export const isMode = (v: unknown): v is TravelMode => typeof v === 'string' && (TRAVEL_MODES as readonly string[]).includes(v);

/** kg CO₂e for a leg of `km` by `mode` for `people` travellers. Roads and rails run longer than the straight line. */
export function legKg(km: number, mode: TravelMode, people: number) {
  const f = TRAVEL_FACTORS[mode];
  const dist = mode === 'plane' ? km : km * 1.2;
  const each = mode === 'plane' && km < 500 ? f.short ?? f.kg : f.kg;
  return Math.round((f.perCar ? each * dist * Math.ceil(people / 4) : each * dist * people) * 10) / 10;
}

/** The ways that make sense for a leg: no road or rail over sea, nothing but a plane past 2,000 km. */
export function modesFor(km: number, sea: boolean): TravelMode[] {
  if (km > 2000) return ['plane'];
  return sea ? ['plane', 'ferry'] : ['plane', 'train', 'bus', 'car'];
}

/** M357: door-to-door minutes for a leg by `mode` (the same estimates as Directions' public transport, M356): getting to
 *  and waiting at the station, port or airport included, roads and rails longer than the straight line. */
export function legMinutes(km: number, mode: TravelMode) {
  const h = mode === 'plane' ? 2.5 + km / 750
    : mode === 'train' ? (km > 250 ? 25 : 35) / 60 + (km * 1.12) / (km > 250 ? 230 : 85)
    : mode === 'bus' ? 25 / 60 + (km * 1.25) / 70
    : mode === 'ferry' ? 1 + (km * 1.1) / 35
    : (km * 1.25) / 80;
  return Math.max(5, Math.round((h * 60) / 5) * 5);
}

export interface LegWay { mode: TravelMode; minutes: number; kg: number; fastest: boolean; greenest: boolean }
export interface FootLeg { stopId: string; from: string; to: string; km: number; mode: TravelMode; chosen: boolean; kg: number; minutes: number; best: TravelMode; bestKg: number; modes: TravelMode[]; ways: LegWay[] }

/** Each leg between the trip's cities (`mode` on the arriving stop, else the likely way) and the totals. */
export function tripFootprint(stops: (PlanStop & { mode?: string | null })[], people: number) {
  const legs: FootLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], l = leg(a, b);
    if (!l) continue;
    const sea = ferryLikely(a.cc, b.cc), modes = modesFor(l.km, sea);
    const chosen = isMode(b.mode) && modes.includes(b.mode);
    const mode: TravelMode = chosen ? (b.mode as TravelMode) : l.flight || sea ? 'plane' : 'train';
    const best = modes.reduce((x, m) => (legKg(l.km, m, people) < legKg(l.km, x, people) ? m : x), modes[0]);
    const quick = Math.min(...modes.map((m) => legMinutes(l.km, m)));
    const ways = modes.map((m) => ({ mode: m, minutes: legMinutes(l.km, m), kg: legKg(l.km, m, people), fastest: modes.length > 1 && legMinutes(l.km, m) === quick, greenest: modes.length > 1 && m === best }))
      .sort((x, y) => x.minutes - y.minutes);
    legs.push({ stopId: b.id, from: a.name, to: b.name, km: l.km, mode, chosen, kg: legKg(l.km, mode, people), minutes: legMinutes(l.km, mode), best, bestKg: legKg(l.km, best, people), modes, ways });
  }
  const total = Math.round(legs.reduce((s, x) => s + x.kg, 0) * 10) / 10, greenest = Math.round(legs.reduce((s, x) => s + x.bestKg, 0) * 10) / 10;
  return { legs, total, greenest, perPerson: Math.round((total / Math.max(1, people)) * 10) / 10, minutes: legs.reduce((s, x) => s + x.minutes, 0) };
}
