import { hash, seeded } from '../seeded-shuffle';

// Spot the Fake (UniVerse Play, the Trace game): four product passports, exactly one a copy, made
// from the seed. The tells are the ones Trace really uses (src/lib/trace.ts verdictFor): a label
// seen far apart too fast, a label scanned far too often, a seal that doesn't check out, and a
// brand name that's slightly off. Each reveal says why, so players learn to read a passport.

export type FakeReason = 'journey' | 'scans' | 'seal' | 'brand';

export interface Passport {
  product: string;
  brand: string;
  serial: string;
  scans: number;
  firstCity: string;
  lastCity: string;
  /** Hours between the first and the latest scan. */
  hours: number;
  km: number;
  sealOk: boolean;
}

export interface FakeRound { cards: Passport[]; fake: number; reason: FakeReason; why: string }

const PRODUCTS: [string, string, string][] = [
  ['Olive oil, 1 L', 'Aurora Foods', 'Aurora Fods'],
  ['Running shoes', 'Stride Lab', 'Stryde Lab'],
  ['Honey, 500 g', 'Wild Meadow', 'Wild Medow'],
  ['Headphones', 'Sonex', 'Sonnex'],
  ['Face cream', 'Lumière', 'Lumiere+'],
  ['Cold brew coffee', 'TerraBrew', 'TeraBrew'],
  ['Saffron, 2 g', 'Kaveri Spices', 'Kaveri Spice Co'],
  ['Phone charger', 'VoltWay', 'VoltWey'],
  ['Basmati rice, 5 kg', 'Royal Grain', 'Royale Grain'],
  ['Kids’ medicine', 'CareWell', 'Care Well+'],
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

const REASONS: FakeReason[] = ['journey', 'scans', 'seal', 'brand'];
const WHY: Record<FakeReason, (p: Passport) => string> = {
  journey: (p) => `Scanned in ${p.firstCity} and ${p.lastCity} ${p.hours} h apart: ${p.km.toLocaleString()} km. One bottle can’t travel that fast, so someone copied its label.`,
  scans: (p) => `This one label was scanned ${p.scans} times. A real unit is scanned once or twice; a copied label gets scanned over and over.`,
  seal: () => 'The seal (the signature in the code) doesn’t match the brand’s key: the code was made up, not printed by the brand.',
  brand: (p) => `Look at the brand: “${p.brand}”. Copies often get the name slightly wrong.`,
};

/** The i-th round: four passports for the same product, one of them a copy. */
export function fakeRound(seed: number, i: number): FakeRound {
  const rand = seeded(hash(`${seed}:fakes:${i}`));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const [product, brand, wrongBrand] = pick(PRODUCTS);
  const fake = Math.floor(rand() * 4);
  const reason = REASONS[Math.floor(rand() * REASONS.length)];
  const cards: Passport[] = Array.from({ length: 4 }, (_, k) => {
    // A genuine unit: scanned once to three times, in one city or two close ones, days apart.
    const home = pick(CITIES);
    const near = CITIES.filter((c) => c !== home && km(home, c) < 1_500);
    const last = rand() < 0.5 || !near.length ? home : pick(near);
    const card: Passport = {
      product, brand, serial: `${(1000 + Math.floor(rand() * 9000))}-${String.fromCharCode(65 + Math.floor(rand() * 26))}${Math.floor(rand() * 10)}`,
      scans: 1 + Math.floor(rand() * 3), firstCity: home[0], lastCity: last[0], hours: 24 + Math.floor(rand() * 400), km: km(home, last), sealOk: true,
    };
    if (k !== fake) return card;
    if (reason === 'journey') {
      const far = CITIES.filter((c) => km(home, c) > 3_000);
      const there = pick(far);
      return { ...card, lastCity: there[0], km: km(home, there), hours: 1 + Math.floor(rand() * 5), scans: 2 + Math.floor(rand() * 2) };
    }
    if (reason === 'scans') return { ...card, scans: 60 + Math.floor(rand() * 240) };
    if (reason === 'seal') return { ...card, sealOk: false };
    return { ...card, brand: wrongBrand };
  });
  return { cards, fake, reason, why: WHY[reason](cards[fake]) };
}

export const FAKE_SECONDS_PER_ROUND = 9;
export const FAKE_LIVES = 3;

/** Points for a pick: 100 if right, up to 60 more for speed, and a streak bonus from the third in a row. */
export function fakePoints(right: boolean, msLeft: number, streak: number): number {
  if (!right) return 0;
  return 100 + Math.round(60 * Math.max(0, Math.min(1, msLeft / (FAKE_SECONDS_PER_ROUND * 1000)))) + (streak >= 3 ? 20 * Math.min(streak - 2, 5) : 0);
}
