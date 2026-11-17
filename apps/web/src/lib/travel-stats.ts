import { addDays, type PlanStop } from './travel-plan';
import { tripFootprint } from './travel-footprint';

// M257: my travel in numbers across all my trips, pure and tested (travel-stats.test.ts): countries, cities, days,
// the kilometres between cities and their CO₂ (one traveller, factors from green.ts through the footprint), for the
// trips done and those to come.

export interface RouteStop { name: string; cc: string | null; lat: number | null; lon: number | null; days: number; mode?: string | null }
export interface StatTrip { startDate: string | null; route: RouteStop[] }
export interface Stats { trips: number; countries: string[]; cities: number; days: number; km: number; kg: number }

function sum(trips: StatTrip[]): Stats {
  const countries = new Set<string>(), cities = new Set<string>();
  let days = 0, km = 0, kg = 0;
  for (const t of trips) {
    t.route.forEach((s) => { if (s.cc) countries.add(s.cc); cities.add(s.name.toLowerCase()); days += s.days; });
    const f = tripFootprint(t.route.map((s, i) => ({ ...s, id: String(i), guide: s.name, position: i }) as PlanStop & { mode?: string | null }), 1);
    km += f.legs.reduce((n, l) => n + l.km, 0); kg += f.total;
  }
  return { trips: trips.length, countries: [...countries].sort(), cities: cities.size, days, km: Math.round(km), kg: Math.round(kg) };
}

/** The trips done (ended before today) and to come (the rest with dates); trips without dates count as to come. */
export function travelStats(trips: StatTrip[], today: string) {
  const ended = (t: StatTrip) => !!t.startDate && addDays(t.startDate, Math.max(0, t.route.reduce((n, s) => n + s.days, 0) - 1)) < today;
  return { done: sum(trips.filter(ended)), coming: sum(trips.filter((t) => !ended(t))), all: sum(trips) };
}

/** A country's flag from its code ("PT" → 🇵🇹). */
export const flag = (cc: string) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
