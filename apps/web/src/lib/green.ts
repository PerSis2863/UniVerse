// UniVerse Green (src/lib/apps.ts): climate actions and the CO2 they save, with published average
// factors (kg CO2e), badges, streaks and a weekly challenge. Shared by the server and the pages.

export const GREEN_KINDS = ['TREE', 'CYCLE', 'TRANSIT', 'WALK', 'RECYCLE', 'SOLAR', 'MEATFREE', 'CLEANUP'] as const;
export type GreenKind = (typeof GREEN_KINDS)[number];

/** Per unit: what one unit saves, and how it's worked out (shown next to every action). */
export const GREEN_FACTORS: Record<GreenKind, { label: string; unit: string; units: string; kg: number; how: string; max: number }> = {
  TREE: { label: 'Planted trees', unit: 'tree', units: 'trees', kg: 22, how: 'A young tree takes up about 22 kg of CO₂ a year', max: 1000 },
  CYCLE: { label: 'Cycled instead of driving', unit: 'km', units: 'km', kg: 0.2, how: 'About 0.2 kg less than the same distance by car', max: 500 },
  TRANSIT: { label: 'Took public transport', unit: 'km', units: 'km', kg: 0.1, how: 'About 0.1 kg less than the same distance by car', max: 2000 },
  WALK: { label: 'Walked instead of driving', unit: 'km', units: 'km', kg: 0.2, how: 'About 0.2 kg less than the same distance by car', max: 100 },
  RECYCLE: { label: 'Recycled waste', unit: 'kg', units: 'kg', kg: 1.5, how: 'About 1.5 kg less than sending the same waste to landfill', max: 1000 },
  SOLAR: { label: 'Used solar power', unit: 'kWh', units: 'kWh', kg: 0.4, how: 'About 0.4 kg less than the same energy from an average grid', max: 5000 },
  MEATFREE: { label: 'Ate meat-free', unit: 'meal', units: 'meals', kg: 1.5, how: 'About 1.5 kg less than an average meat meal', max: 100 },
  CLEANUP: { label: 'Cleaned up litter', unit: 'kg', units: 'kg', kg: 0.5, how: 'About 0.5 kg once the litter is sorted and recycled', max: 1000 },
};

export const co2For = (kind: GreenKind, amount: number) => Math.round(GREEN_FACTORS[kind].kg * amount * 100) / 100;

/** Days in a row (up to today or yesterday) with at least one action; days are YYYY-MM-DD. */
export function streak(days: string[], today: string) {
  const set = new Set(days);
  const day = (d: string, back: number) => new Date(Date.parse(`${d}T12:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
  let start = set.has(today) ? today : set.has(day(today, 1)) ? day(today, 1) : null;
  let n = 0;
  while (start && set.has(start)) { n++; start = day(start, 1); }
  return n;
}

export interface GreenTotals { actions: number; kg: number; byKind: Partial<Record<GreenKind, number>>; streak: number }
export const BADGES: { id: string; label: string; text: string; earned: (t: GreenTotals) => boolean }[] = [
  { id: 'first', label: 'First step', text: 'Logged a first action', earned: (t) => t.actions >= 1 },
  { id: 'ten', label: 'Habit', text: '10 actions', earned: (t) => t.actions >= 10 },
  { id: 'hundred-kg', label: '100 kg', text: '100 kg of CO₂ saved', earned: (t) => t.kg >= 100 },
  { id: 'tonne', label: 'One tonne', text: '1,000 kg of CO₂ saved', earned: (t) => t.kg >= 1000 },
  { id: 'streak', label: 'On a roll', text: '7 days in a row', earned: (t) => t.streak >= 7 },
  { id: 'trees', label: 'Tree planter', text: '5 trees planted', earned: (t) => (t.byKind.TREE ?? 0) >= 5 },
  { id: 'cyclist', label: 'Cyclist', text: '100 km by bike', earned: (t) => (t.byKind.CYCLE ?? 0) >= 100 },
  { id: 'recycler', label: 'Recycler', text: '50 kg recycled', earned: (t) => (t.byKind.RECYCLE ?? 0) >= 50 },
];

/** This week's challenge (changes every Monday, the same for everyone). */
const CHALLENGES: { kind: GreenKind; goal: number; title: string }[] = [
  { kind: 'CYCLE', goal: 50, title: 'Cycle 50 km' },
  { kind: 'MEATFREE', goal: 10, title: 'Eat 10 meat-free meals' },
  { kind: 'RECYCLE', goal: 20, title: 'Recycle 20 kg' },
  { kind: 'TRANSIT', goal: 100, title: 'Take 100 km of public transport' },
  { kind: 'TREE', goal: 3, title: 'Plant 3 trees' },
  { kind: 'CLEANUP', goal: 15, title: 'Clean up 15 kg of litter' },
];
export function weeklyChallenge(now: number) {
  const monday = Date.UTC(1970, 0, 5); // a Monday
  const week = Math.floor((now - monday) / (7 * 86_400_000));
  const c = CHALLENGES[((week % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
  const starts = monday + week * 7 * 86_400_000;
  return { ...c, unit: GREEN_FACTORS[c.kind].units, starts: new Date(starts).toISOString(), ends: new Date(starts + 7 * 86_400_000).toISOString() };
}
