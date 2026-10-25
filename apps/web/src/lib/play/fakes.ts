import { hash, seeded } from '../seeded-shuffle';

// Spot the Fake (UniVerse Play, the Trace game): product passports for one product, exactly one a
// copy, made from the seed: four a round at first, six from round 5. The tells are the ones Trace
// really uses (src/lib/trace.ts verdictFor) and a shopper can check: a label seen far apart too
// fast, a label scanned far too often, a seal that doesn't check out, a brand name that's slightly
// off, a best-before date before it was made, a price far below everyone else's. Each reveal says
// why, so players learn to read a passport.

export type FakeReason = 'journey' | 'scans' | 'seal' | 'brand' | 'dates' | 'price';

export interface Passport {
  product: string;
  emoji: string;
  brand: string;
  serial: string;
  scans: number;
  firstCity: string;
  lastCity: string;
  /** Hours between the first and the latest scan. */
  hours: number;
  km: number;
  sealOk: boolean;
  /** Made and best-before, as months ("2026-03"). */
  made: string;
  bestBefore: string;
  price: number;
}

export interface FakeRound { cards: Passport[]; fake: number; reason: FakeReason; why: string; seconds: number }

/** [product, emoji, brand, misspelt brand, usual price]. */
const PRODUCTS: [string, string, string, string, number][] = [
  ['Olive oil, 1 L', '🫒', 'Aurora Foods', 'Aurora Fods', 12],
  ['Running shoes', '👟', 'Stride Lab', 'Stryde Lab', 110],
  ['Honey, 500 g', '🍯', 'Wild Meadow', 'Wild Medow', 9],
  ['Headphones', '🎧', 'Sonex', 'Sonnex', 149],
  ['Face cream', '🧴', 'Lumière', 'Lumiere+', 38],
  ['Cold brew coffee', '☕', 'TerraBrew', 'TeraBrew', 4],
  ['Saffron, 2 g', '🌼', 'Kaveri Spices', 'Kaveri Spice Co', 14],
  ['Phone charger', '🔌', 'VoltWay', 'VoltWey', 25],
  ['Basmati rice, 5 kg', '🍚', 'Royal Grain', 'Royale Grain', 11],
  ['Kids’ medicine', '💊', 'CareWell', 'Care Well+', 7],
  ['Wristwatch', '⌚', 'Halden', 'Haldan', 320],
  ['Handbag', '👜', 'Maison Vere', 'Maison Verre', 480],
  ['Sunglasses', '🕶️', 'Solace', 'Solacé', 160],
  ['Chocolate bar', '🍫', 'Cacao Rio', 'Cacoa Rio', 3],
];

/** [city, lat, lng]. */
const CITIES: [string, number, number][] = [
  ['London', 51.5, -0.1], ['Paris', 48.9, 2.4], ['Berlin', 52.5, 13.4], ['Madrid', 40.4, -3.7], ['Rome', 41.9, 12.5],
  ['Istanbul', 41, 29], ['Dubai', 25.2, 55.3], ['Mumbai', 19.1, 72.9], ['Delhi', 28.6, 77.2], ['Lagos', 6.5, 3.4],
  ['Nairobi', -1.3, 36.8], ['New York', 40.7, -74], ['São Paulo', -23.5, -46.6], ['Tokyo', 35.7, 139.7], ['Sydney', -33.9, 151.2],
  ['Toronto', 43.7, -79.4], ['Singapore', 1.35, 103.8], ['Cairo', 30, 31.2], ['Casablanca', 33.6, -7.6], ['Jakarta', -6.2, 106.8],
];

function km(a: [string, number, number], b: [string, number, number]) {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLng = (b[2] - a[2]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(12_742 * Math.asin(Math.sqrt(h)));
}
const month = (n: number) => `${2024 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
/** "2026-03" → "Mar 2026". */
export const monthName = (m: string) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

const REASONS: FakeReason[] = ['journey', 'scans', 'seal', 'brand', 'dates', 'price'];
const WHY: Record<FakeReason, (p: Passport) => string> = {
  journey: (p) => `Scanned in ${p.firstCity} and ${p.lastCity} ${p.hours} h apart: ${p.km.toLocaleString()} km. One unit can’t travel that fast, so someone copied its label.`,
  scans: (p) => `This one label was scanned ${p.scans} times. A real unit is scanned once or twice; a copied label gets scanned over and over.`,
  seal: () => 'The seal (the signature in the code) doesn’t match the brand’s key: the code was made up, not printed by the brand.',
  brand: (p) => `Look at the brand: “${p.brand}”. Copies often get the name slightly wrong.`,
  dates: (p) => `Best before ${monthName(p.bestBefore)}, but made in ${monthName(p.made)}: it “expired” before it was made. Copied labels mix up their dates.`,
  price: (p) => `$${p.price} when the others cost about ${Math.round(p.price / 0.38)}: far too cheap to be real. Too-good prices are a classic sign of a copy.`,
};

/** How many passports a round shows: four, then six from round 5. */
export const fakeCards = (i: number) => (i < 4 ? 4 : 6);

/** The i-th round: passports for the same product, one of them a copy. */
export function fakeRound(seed: number, i: number): FakeRound {
  const rand = seeded(hash(`${seed}:fakes:${i}`));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const [product, emoji, brand, wrongBrand, base] = pick(PRODUCTS);
  const n = fakeCards(i);
  const fake = Math.floor(rand() * n);
  const reason = REASONS[Math.floor(rand() * REASONS.length)];
  const cards: Passport[] = Array.from({ length: n }, (_, k) => {
    // A genuine unit: scanned once to three times, in one city or two close ones, days apart; made
    // this year or last, good for one to two years; priced within a few percent of the usual.
    const home = pick(CITIES);
    const near = CITIES.filter((c) => c !== home && km(home, c) < 1_500);
    const last = rand() < 0.5 || !near.length ? home : pick(near);
    const made = 18 + Math.floor(rand() * 14);
    const card: Passport = {
      product, emoji, brand, serial: `${(1000 + Math.floor(rand() * 9000))}-${String.fromCharCode(65 + Math.floor(rand() * 26))}${Math.floor(rand() * 10)}`,
      scans: 1 + Math.floor(rand() * 3), firstCity: home[0], lastCity: last[0], hours: 24 + Math.floor(rand() * 400), km: km(home, last), sealOk: true,
      made: month(made), bestBefore: month(made + 12 + Math.floor(rand() * 13)), price: Math.max(1, Math.round(base * (0.92 + rand() * 0.16))),
    };
    if (k !== fake) return card;
    if (reason === 'journey') {
      const there = pick(CITIES.filter((c) => km(home, c) > 3_000));
      return { ...card, lastCity: there[0], km: km(home, there), hours: 1 + Math.floor(rand() * 5), scans: 2 + Math.floor(rand() * 2) };
    }
    if (reason === 'scans') return { ...card, scans: 60 + Math.floor(rand() * 240) };
    if (reason === 'seal') return { ...card, sealOk: false };
    if (reason === 'dates') return { ...card, bestBefore: month(made - 2 - Math.floor(rand() * 8)) };
    if (reason === 'price') return { ...card, price: Math.max(1, Math.round(base * 0.38)) };
    return { ...card, brand: wrongBrand };
  });
  return { cards, fake, reason, why: WHY[reason](cards[fake]), seconds: n === 4 ? 9 : 12 };
}

export const FAKE_LIVES = 3;

/** Points for a pick: 100 if right (140 in a six-passport round), up to 60 more for speed, and a
 *  streak bonus from the third in a row. */
export function fakePoints(right: boolean, msLeft: number, streak: number, seconds = 9, cards = 4): number {
  if (!right) return 0;
  return (cards > 4 ? 140 : 100) + Math.round(60 * Math.max(0, Math.min(1, msLeft / (seconds * 1000)))) + (streak >= 3 ? 20 * Math.min(streak - 2, 5) : 0);
}

/** The inspector's rank by copies caught. */
export const RANKS: [number, string][] = [[0, 'Rookie'], [3, 'Spotter'], [6, 'Agent'], [10, 'Detective'], [15, 'Chief inspector'], [22, 'Legend']];
export const rankFor = (caught: number) => RANKS.filter(([n]) => caught >= n).at(-1)![1];
