import { km } from './travel-plan';

// M249: a day's rain plan, pure and tested (travel-rain.test.ts): when the forecast says rain, which of the day's places
// are outdoors, and indoor places from the city's guide to swap in, the nearest to the day's places first.

export interface Weather { date: string; rain: number; symbol: string | null }
export interface Place { name: string; kind: string; note?: string | null; text?: string | null; lat?: number | null; lon?: number | null }

const OUT = /\b(parks?|gardens?|beach(es)?|viewpoints?|miradouros?|lookouts?|hikes?|hiking|trails?|walks?|walking tour|squares?|plazas?|zoo|harbou?r|bridges?|castles?|forts?|fortress|ruins|islands?|lakes?|rivers?|cruises?|boat|promenade|terrace|mountains?|hills?|waterfalls?|cliffs?|bay|dunes?)\b/i;
const IN = /\b(museums?|galler(y|ies)|aquarium|churche?s?|cathedral|basilica|chapel|palace|library|cinema|theat(re|er)|spa|baths|hammam|mall|shopping cent(re|er)|market hall|indoors?|exhibitions?|planetarium|opera|concert hall|bookshops?|bookstores?|monastery|mosque|temple|synagogue)\b/i;

/** Rain (or snow, sleet, thunder) in the day's forecast. */
export const wet = (w: Weather | null | undefined) => !!w && (w.rain >= 2 || /rain|sleet|snow|thunder/.test(w.symbol ?? ''));

/** A place that's mostly outdoors (by its name and words), and not an indoor one. */
export function outdoors(p: Place) {
  if (!['see', 'do', 'go', 'other'].includes(p.kind)) return false;
  const words = `${p.name} ${p.note ?? ''} ${p.text ?? ''}`;
  return OUT.test(p.name) ? !IN.test(p.name) : OUT.test(words) && !IN.test(words);
}

/** Indoor places from a guide's listings, not already planned, nearest to the day's places first. */
export function indoorIdeas(listings: Place[], day: Place[], n = 4): Place[] {
  const planned = new Set(day.map((p) => p.name.toLowerCase()));
  const at = day.filter((p) => p.lat != null && p.lon != null);
  const centre = at.length ? { lat: at.reduce((s, p) => s + p.lat!, 0) / at.length, lon: at.reduce((s, p) => s + p.lon!, 0) / at.length } : null;
  const dist = (p: Place) => (centre && p.lat != null && p.lon != null ? km(centre, { lat: p.lat, lon: p.lon }) ?? 999 : 999);
  return listings
    .filter((l) => (l.kind === 'see' || l.kind === 'do') && !planned.has(l.name.toLowerCase()) && IN.test(`${l.name} ${l.text ?? ''}`))
    .sort((a, b) => dist(a) - dist(b)).slice(0, n);
}
