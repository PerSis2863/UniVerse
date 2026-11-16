import type { GreenKind } from './green';

// UniVerse Green's second wave (M216, the owner: "add like 10 features … big and major upgrades"): a yearly
// footprint calculator, a journey's CO₂ by each way of going, what saved CO₂ means in everyday terms, tips
// ranked by what they save (to pledge), a year of days and the longest streak. Pure: the pages and the
// server share them. Every factor is an average, rounded, and says where it comes from.

// ——— Footprint ———
// Per person, a year, in kg CO₂e. Car and transport: the UK government's 2024 conversion factors (DESNZ), per
// km; flights: a return trip, with the extra warming of contrails (DESNZ's "with RF" factors); home: a typical
// household's energy shared by the people living there; food: Scarborough et al. 2014 (diets in the UK); things
// bought: a rough share of a European's footprint from goods (Ivanova et al. 2016).
export const CAR = { none: 0, petrol: 0.17, diesel: 0.17, hybrid: 0.12, electric: 0.05 } as const;
export const DIET = { vegan: 1050, vegetarian: 1390, pescatarian: 1430, low: 1700, medium: 2050, high: 2620 } as const;
export const HEAT = { gas: 0.18, oil: 0.25, electric: 0.2, heatpump: 0.06, wood: 0.03, none: 0 } as const;
export const SIZE = { flat: 7000, house: 12000, large: 18000 } as const;
export const STUFF = { little: 600, some: 1200, lots: 2400 } as const;
export interface FootprintAsk {
  carKmWeek: number; car: keyof typeof CAR; transitKmWeek: number; shortFlights: number; longFlights: number;
  diet: keyof typeof DIET; heat: keyof typeof HEAT; size: keyof typeof SIZE; people: number; greenPower: boolean; kwhMonth: number; stuff: keyof typeof STUFF;
}
export const FOOTPRINT_DEFAULT: FootprintAsk = { carKmWeek: 100, car: 'petrol', transitKmWeek: 30, shortFlights: 1, longFlights: 0, diet: 'medium', heat: 'gas', size: 'flat', people: 2, greenPower: false, kwhMonth: 250, stuff: 'some' };
/** Roughly 4.7 t a person in the world (Global Carbon Project, 2023); about 2.3 t is in line with 1.5 °C by 2030. */
export const WORLD_KG = 4700, TARGET_KG = 2300;
const clampN = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = <T extends object>(v: unknown, from: T, d: keyof T): keyof T => (typeof v === 'string' && v in from ? (v as keyof T) : d);

/** Answers checked and clamped (the server stores only what this gives back). */
export function readFootprint(a: Partial<Record<keyof FootprintAsk, unknown>>): FootprintAsk {
  const d = FOOTPRINT_DEFAULT;
  return {
    carKmWeek: clampN(a.carKmWeek, 0, 3000, d.carKmWeek), car: pick(a.car, CAR, d.car), transitKmWeek: clampN(a.transitKmWeek, 0, 3000, d.transitKmWeek),
    shortFlights: Math.round(clampN(a.shortFlights, 0, 50, d.shortFlights)), longFlights: Math.round(clampN(a.longFlights, 0, 30, d.longFlights)),
    diet: pick(a.diet, DIET, d.diet), heat: pick(a.heat, HEAT, d.heat), size: pick(a.size, SIZE, d.size), people: Math.round(clampN(a.people, 1, 12, d.people)),
    greenPower: a.greenPower === true, kwhMonth: clampN(a.kwhMonth, 0, 5000, d.kwhMonth), stuff: pick(a.stuff, STUFF, d.stuff),
  };
}
export interface Footprint { total: number; parts: { id: 'travel' | 'flights' | 'home' | 'food' | 'stuff'; label: string; kg: number }[] }
export function footprint(a: FootprintAsk): Footprint {
  const travel = a.carKmWeek * 52 * CAR[a.car] + a.transitKmWeek * 52 * 0.06;
  const flights = a.shortFlights * 300 + a.longFlights * 1800;
  const home = (SIZE[a.size] * HEAT[a.heat] + a.kwhMonth * 12 * (a.greenPower ? 0.03 : 0.4)) / a.people;
  const parts = [
    { id: 'travel' as const, label: 'Getting around', kg: travel }, { id: 'flights' as const, label: 'Flights', kg: flights },
    { id: 'home' as const, label: 'Home energy', kg: home }, { id: 'food' as const, label: 'Food', kg: DIET[a.diet] },
    { id: 'stuff' as const, label: 'Things you buy', kg: STUFF[a.stuff] },
  ].map((p) => ({ ...p, kg: Math.round(p.kg) }));
  return { total: parts.reduce((s, p) => s + p.kg, 0), parts };
}

// ——— A journey ———
/** kg CO₂e per passenger-km (DESNZ 2024, rounded); a car's is shared by the people in it. */
export const MODES = [
  { id: 'car', label: 'Car (petrol)', kg: 0.17, shared: true }, { id: 'ev', label: 'Electric car', kg: 0.05, shared: true },
  { id: 'train', label: 'Train', kg: 0.035, shared: false }, { id: 'coach', label: 'Coach', kg: 0.027, shared: false },
  { id: 'bus', label: 'Local bus', kg: 0.1, shared: false }, { id: 'plane', label: 'Plane', kg: 0.18, shared: false },
  { id: 'bike', label: 'Bike or on foot', kg: 0, shared: false },
] as const;
export type ModeId = (typeof MODES)[number]['id'];
/** Each way of going for a journey, cleanest first; the plane's factor falls a little on long flights. */
export function journey(km: number, people = 1): { id: ModeId; label: string; kg: number }[] {
  return MODES.filter((m) => m.id !== 'bike' || km <= 40).map((m) => {
    const f = m.id === 'plane' ? (km > 1500 ? 0.15 : 0.18) : m.kg;
    return { id: m.id, label: m.label, kg: Math.round(km * f / (m.shared ? Math.max(1, people) : 1) * 10) / 10 };
  }).sort((a, b) => a.kg - b.kg);
}
/** What to log for a journey made a cleaner way than by car (the kinds Green already counts). */
export function logFor(mode: ModeId, km: number): { kind: GreenKind; amount: number } | null {
  if (mode === 'train' || mode === 'coach' || mode === 'bus') return { kind: 'TRANSIT', amount: Math.round(km * 10) / 10 };
  if (mode === 'bike') return { kind: 'CYCLE', amount: Math.round(km * 10) / 10 };
  return null;
}

// ——— What it means ———
/** A tree takes up ~22 kg a year; a petrol car ~0.17 kg a km; a phone charge ~8 g (US EPA); a person's day in the world ~12.9 kg. */
export function equivalents(kg: number) {
  return [
    { id: 'trees', value: kg / 22, label: 'trees growing for a year' },
    { id: 'car', value: kg / 0.17, label: 'km not driven' },
    { id: 'phone', value: kg / 0.0082, label: 'phone charges' },
    { id: 'days', value: kg / (WORLD_KG / 365), label: 'days of an average person’s emissions' },
  ].map((e) => ({ ...e, value: e.value >= 10 ? Math.round(e.value) : Math.round(e.value * 10) / 10 }));
}

// ——— Tips to pledge ———
export const TIP_AREAS = ['Travel', 'Food', 'Home', 'Things'] as const;
/** kg CO₂e a year, about, for a typical person who does it (rounded; they vary a lot from home to home). */
export const TIPS: { id: string; area: (typeof TIP_AREAS)[number]; title: string; kgYear: number; how: string; log?: GreenKind }[] = [
  { id: 'no-long-flight', area: 'Travel', title: 'Skip one long-haul return flight', kgYear: 1800, how: 'A train holiday nearer home instead' },
  { id: 'car-free', area: 'Travel', title: 'Live without a car', kgYear: 1700, how: 'Bike, bus, train and car sharing' },
  { id: 'bike-commute', area: 'Travel', title: 'Cycle a 5 km commute', kgYear: 370, how: 'Instead of driving, most working days', log: 'CYCLE' },
  { id: 'transit-commute', area: 'Travel', title: 'Take the bus or train to work', kgYear: 250, how: 'Instead of driving 10 km each way', log: 'TRANSIT' },
  { id: 'plant-based', area: 'Food', title: 'Eat plant-based', kgYear: 1000, how: 'From a medium-meat diet to a vegan one', log: 'MEATFREE' },
  { id: 'meat-free-days', area: 'Food', title: 'Two meat-free days a week', kgYear: 300, how: 'Beans, lentils and veg on those days', log: 'MEATFREE' },
  { id: 'food-waste', area: 'Food', title: 'Waste less food', kgYear: 200, how: 'Plan meals, freeze leftovers' },
  { id: 'local-season', area: 'Food', title: 'Buy what’s in season', kgYear: 80, how: 'Less air-freighted and heated-greenhouse food' },
  { id: 'green-tariff', area: 'Home', title: 'Switch to renewable electricity', kgYear: 1000, how: 'A green tariff or solar panels', log: 'SOLAR' },
  { id: 'heating-down', area: 'Home', title: 'Turn the heating down 1 °C', kgYear: 300, how: 'And a jumper' },
  { id: 'line-dry', area: 'Home', title: 'Dry clothes on a line', kgYear: 150, how: 'Instead of a tumble dryer' },
  { id: 'wash-cold', area: 'Home', title: 'Wash clothes at 30 °C', kgYear: 30, how: 'Modern detergents clean well cool' },
  { id: 'second-hand', area: 'Things', title: 'Buy second-hand first', kgYear: 200, how: 'Clothes, phones and furniture' },
  { id: 'repair', area: 'Things', title: 'Repair before replacing', kgYear: 150, how: 'Repair cafés fix most things' },
  { id: 'recycle', area: 'Things', title: 'Recycle everything you can', kgYear: 150, how: 'Paper, glass, metal and plastics sorted', log: 'RECYCLE' },
  { id: 'plant-trees', area: 'Things', title: 'Plant and care for trees', kgYear: 66, how: 'Three trees, with a local group', log: 'TREE' },
];
export const tipById = (id: string) => TIPS.find((t) => t.id === id);

// ——— A year of days ———
/** The days of a year (Mondays first) with the kg saved each day, for a heatmap of 53 weeks. */
export function yearGrid(kgByDay: Record<string, number>, today: string) {
  const end = Date.parse(`${today}T12:00:00Z`), dow = (new Date(end).getUTCDay() + 6) % 7; // 0 = Monday
  const start = end - (52 * 7 + dow) * 86_400_000;
  const weeks: { day: string; kg: number }[][] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10), w = Math.floor((t - start) / (7 * 86_400_000));
    (weeks[w] ??= []).push({ day, kg: kgByDay[day] ?? 0 });
  }
  return weeks;
}
/** The longest run of days in a row with an action. */
export function longestStreak(days: string[]) {
  const s = [...new Set(days)].sort();
  let best = 0, run = 0, prev = 0;
  for (const d of s) { const t = Date.parse(`${d}T12:00:00Z`); run = t - prev === 86_400_000 ? run + 1 : 1; prev = t; best = Math.max(best, run); }
  return best;
}
