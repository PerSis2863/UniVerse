import { currencyOf } from './travel-find';
import { IDEAS } from './travel-ideas';

// A trip's packing list (M215): what to take, worked out from the trip itself: how long it is, each place's
// weather in the months you're there (its guide's climate chart, where known), what the places are good for
// (beaches, mountains, temples), the plugs there against yours and the money you'll need. Suggestions
// only: the list people keep is theirs to change (src/server/travel-trip-extras.ts).

export interface PackStop { guide: string; cc: string | null; days: number }
export interface PackAsk { stops: PackStop[]; start: string | null; home: string | null; plugs: Record<string, string> }
export interface PackItem { grp: string; item: string; why?: string }
export const PACK_GROUPS = ['Documents', 'Money', 'Clothes', 'Weather', 'Power', 'Health', 'Wash bag', 'For what you’ll do'] as const;

const month = (start: string | null, offsetDays: number) => {
  const d = start ? new Date(`${start}T12:00:00Z`) : new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.getUTCMonth();
};
const list = (w: string[]) => (w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`);

export function packingFor({ stops, start, home, plugs }: PackAsk): PackItem[] {
  const days = Math.max(1, stops.reduce((n, s) => n + Math.max(1, s.days), 0));
  const out: PackItem[] = [];
  const add = (grp: (typeof PACK_GROUPS)[number], item: string, why?: string) => { if (!out.some((x) => x.item === item)) out.push({ grp, item, ...(why ? { why } : {}) }); };
  const abroad = stops.some((s) => s.cc && s.cc !== home);

  add('Documents', abroad ? 'Passport (valid six months past the trip)' : 'ID card or passport');
  add('Documents', 'Travel insurance details');
  add('Documents', 'Bookings and tickets, saved offline');
  add('Money', 'A bank card that works abroad, and a spare');
  const homeMoney = home ? currencyOf(home) : null;
  const monies = [...new Set(stops.filter((s) => s.cc).map((s) => currencyOf(s.cc!)))].filter((c) => c !== homeMoney);
  if (monies.length) add('Money', `Some cash in ${list(monies)}`, 'For small shops, markets and tips');

  add('Clothes', `${Math.min(days, 7)} sets of underwear and socks`, days > 7 ? 'Wash halfway through' : undefined);
  add('Clothes', `${Math.min(Math.ceil(days * 0.7), 6)} tops`);
  add('Clothes', `${days > 4 ? 2 : 1} trousers, skirts or shorts`);
  add('Clothes', 'Comfortable walking shoes');
  add('Clothes', 'Something to sleep in');

  // The weather where you'll be, in the month you'll be there.
  let offset = 0, hot = false, cold = false, freezing = false, wet = false, tropical = false;
  const where = { hot: [] as string[], cold: [] as string[], wet: [] as string[] };
  for (const s of stops) {
    const idea = IDEAS.find((i) => i.title === s.guide), m = month(start, offset + Math.floor(s.days / 2)), c = idea?.climate;
    offset += Math.max(1, s.days);
    const name = (idea?.title ?? s.guide).split('/').pop()!;
    if (c) {
      if (c.high[m] >= 26) { hot = true; where.hot.push(name); }
      if (c.low[m] <= 8) { cold = true; where.cold.push(name); }
      if (c.low[m] <= 1) freezing = true;
      if (c.rain[m] >= 100) { wet = true; where.wet.push(name); }
      if (idea?.lat !== undefined && Math.abs(idea.lat) < 23.5 && c.high[m] >= 25) tropical = true;
    }
    for (const t of idea?.themes ?? []) {
      if (t === 'Beaches') { add('For what you’ll do', 'Swimwear'); add('For what you’ll do', 'Flip-flops'); }
      if (t === 'Mountains') { add('For what you’ll do', 'Hiking shoes'); add('For what you’ll do', 'A small day pack and a water bottle'); }
      if (t === 'Culture') add('For what you’ll do', 'Clothes that cover shoulders and knees', 'For temples, churches and mosques');
    }
    if (idea?.tags.includes('night')) add('For what you’ll do', 'One smarter outfit for the evening');
  }
  if (hot) { add('Weather', 'Light, airy clothes', `Warm in ${list(where.hot)}`); add('Weather', 'Sun hat and sunglasses'); add('Health', 'Sunscreen'); }
  if (cold) { add('Weather', 'A warm jacket and a jumper', `Cool in ${list(where.cold)}`); if (freezing) add('Weather', 'Hat, gloves and a scarf', 'Freezing at night'); }
  if (wet) add('Weather', 'Rain jacket or a small umbrella', `Rainy in ${list(where.wet)}`);
  if (!hot && !cold && !wet) add('Weather', 'A light jacket for the evenings');
  if (tropical) add('Health', 'Insect repellent', 'Mosquitoes in the tropics');

  // Plugs: an adapter when none of the places takes yours.
  const theirs = [...new Set(stops.flatMap((s) => [...(s.cc ? plugs[s.cc] ?? '' : '')]))];
  const mine = home ? [...(plugs[home] ?? '')] : [];
  const fits = (p: string) => mine.includes(p) || (p === 'C' && mine.some((x) => 'EFJKLN'.includes(x)));
  const need = theirs.filter((p) => !fits(p));
  if (theirs.length && (!mine.length || need.length === theirs.length)) add('Power', `A plug adapter for Type ${list((mine.length ? need : theirs).sort())}`, mine.length ? 'Your plugs don’t fit there' : undefined);
  add('Power', 'Phone charger and cable');
  add('Power', 'A power bank');

  add('Health', 'Your medicines, and a copy of the prescriptions');
  add('Health', 'A small first-aid kit (plasters, painkillers)');
  add('Wash bag', 'Toothbrush and toothpaste');
  add('Wash bag', 'Travel-size shampoo and soap');
  return out;
}
