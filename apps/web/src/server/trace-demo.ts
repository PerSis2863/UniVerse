import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { brandOf, codeFor, createBatch, createProduct } from './trace';

// "Try it with a sample product" (UniVerse Trace): a sample olive oil with three shipments (one
// delivered, two on the move: they glide along their routes on the tracking map until a real phone
// shares a position), ~900 scans over 30 days across 28 cities (copied labels turning up in Istanbul
// and Casablanca), and a running campaign in Paris. Everything hangs off one product marked `sample`,
// so deleting that product removes all of it.

const CITIES: [string, string, number, number, number][] = [
  ['Paris', 'FR', 48.8566, 2.3522, 14], ['Lyon', 'FR', 45.764, 4.8357, 7], ['Marseille', 'FR', 43.2965, 5.3698, 6], ['Lille', 'FR', 50.6292, 3.0573, 3],
  ['Toulouse', 'FR', 43.6047, 1.4442, 4], ['Nice', 'FR', 43.7102, 7.262, 3], ['Madrid', 'ES', 40.4168, -3.7038, 9], ['Barcelona', 'ES', 41.3874, 2.1686, 8],
  ['Jaén', 'ES', 37.7796, -3.7849, 2], ['Lisbon', 'PT', 38.7223, -9.1393, 4], ['Milan', 'IT', 45.4642, 9.19, 7], ['Rome', 'IT', 41.9028, 12.4964, 5],
  ['Berlin', 'DE', 52.52, 13.405, 6], ['Munich', 'DE', 48.1351, 11.582, 4], ['Amsterdam', 'NL', 52.3676, 4.9041, 5], ['Brussels', 'BE', 50.8503, 4.3517, 4],
  ['London', 'GB', 51.5072, -0.1276, 8], ['Zurich', 'CH', 47.3769, 8.5417, 3], ['Vienna', 'AT', 48.2082, 16.3738, 3], ['Warsaw', 'PL', 52.2297, 21.0122, 2],
  ['Dubai', 'AE', 25.2048, 55.2708, 4], ['Mumbai', 'IN', 19.076, 72.8777, 4], ['Delhi', 'IN', 28.6139, 77.209, 3], ['Bengaluru', 'IN', 12.9716, 77.5946, 2],
  ['New York', 'US', 40.7128, -74.006, 3], ['Montreal', 'CA', 45.5019, -73.5674, 2],
];
const COPIES: [string, string, number, number][] = [['Istanbul', 'TR', 41.0082, 28.9784], ['Casablanca', 'MA', 33.5731, -7.5898]];

/** A small seeded random generator, so the sample looks the same for everyone. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');

/** Inserts rows in chunks that stay under D1's 100 bound values per statement. */
async function insert(table: string, cols: string[], rows: unknown[][]) {
  const per = Math.max(1, Math.floor(96 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    await prisma.$executeRawUnsafe(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ')}`, ...chunk.flat());
  }
}

export async function demo(u: SessionUser) {
  const brand = await brandOf(u);
  const product = await createProduct(u, {
    name: 'Aurora cold-pressed olive oil', sku: 'AUR-500', category: brand.category ?? 'food', rewardPoints: 25, warrantyMonths: 0,
    description: '500 ml, extra virgin, first cold press.',
    story: 'Picked by hand on the Ortega family’s hillside groves outside Jaén, pressed within six hours and bottled the same week. Olive oil is one of the most copied foods in the world: this label proves the bottle in your hand is the real one.',
  }, { sample: true });
  const day = 86_400_000, now = Date.now();
  const routes: { label: string; qty: number; stops: [string, string, number, number, number][]; dest?: [string, number, number] }[] = [
    { label: 'Harvest 2026 · press 3', qty: 2000, stops: [['MADE', 'Jaén, Spain', 37.7796, -3.7849, 28], ['SHIPPED', 'Port of Valencia', 39.4467, -0.3237, 24], ['WAREHOUSE', 'Lyon', 45.764, 4.8357, 20], ['DISTRIBUTOR', 'Paris, Rungis', 48.7584, 2.3503, 17], ['SHOP', 'Paris 11e', 48.8649, 2.38, 15]] },
    { label: 'Harvest 2026 · press 4', qty: 1500, stops: [['MADE', 'Jaén, Spain', 37.7796, -3.7849, 3], ['SHIPPED', 'Barcelona', 41.3874, 2.1686, 1]], dest: ['Milan distribution centre', 45.4642, 9.19] },
    { label: 'Harvest 2026 · press 5', qty: 1200, stops: [['MADE', 'Jaén, Spain', 37.7796, -3.7849, 2], ['SHIPPED', 'Port of Algeciras', 36.1408, -5.4562, 1]], dest: ['Lisbon warehouse', 38.7223, -9.1393] },
  ];
  const batchIds: string[] = [];
  for (const r of routes) {
    const made = await createBatch(u, product.id, { quantity: r.qty, label: r.label, origin: r.stops[0][1], lat: r.stops[0][2], lng: r.stops[0][3], madeAt: new Date(now - r.stops[0][4] * day).toISOString() });
    batchIds.push(made.id);
    for (const [stage, place, lat, lng, ago] of r.stops.slice(1)) await prisma.traceEvent.create({ data: { batchId: made.id, brandId: brand.id, stage, place, lat, lng, actorId: u.id, createdAt: new Date(now - ago * day) } });
    await prisma.traceBatch.update({ where: { id: made.id }, data: r.dest ? { status: 'IN_TRANSIT', destPlace: r.dest[0], destLat: r.dest[1], destLng: r.dest[2] } : { status: 'DELIVERED' } });
  }

  // Scans: more lately (growth), more in the day than at night, a little jitter so cells differ.
  const first = await prisma.traceBatch.findUnique({ where: { id: batchIds[0] } });
  const rand = rng(20261024);
  const weights = CITIES.reduce((a, c) => a + c[4], 0);
  const pick = () => { let x = rand() * weights; for (const c of CITIES) { x -= c[4]; if (x <= 0) return c; } return CITIES[0]; };
  const codes: unknown[][] = [], scans: unknown[][] = [];
  const devices = ['iPhone', 'Android', 'Android', 'iPhone', 'Windows', 'Mac'];
  for (let serial = 0; serial < 720; serial++) {
    const id = codeFor(first!, serial);
    const [city, cc, la, ln] = pick();
    const age = Math.pow(rand(), 1.7) * 29.5; // days ago, skewed to recent
    const hour = 8 + rand() * 13;
    const at = now - age * day - (now % day) + hour * 3600_000 - 12 * 3600_000;
    const when = Math.min(now - 60_000, at);
    const lat = la + (rand() - 0.5) * 0.16, lng = ln + (rand() - 0.5) * 0.16;
    const again = rand() < 0.2;
    const copied = serial % 29 === 0 && serial > 0;
    const count = 1 + (again ? 1 : 0) + (copied ? 1 : 0);
    codes.push([id, first!.id, product.id, brand.id, serial, count, iso(when), `${city}, ${cc}`, cc, iso(when)]);
    scans.push([crypto.randomUUID(), id, brand.id, product.id, product.category, 'FIRST', lat, lng, `${city}, ${cc}`, cc, devices[serial % devices.length], iso(when)]);
    if (again) { const w = Math.min(now - 30_000, when + rand() * 3 * day); scans.push([crypto.randomUUID(), id, brand.id, product.id, product.category, 'SEEN', lat, lng, `${city}, ${cc}`, cc, devices[(serial + 1) % devices.length], iso(w)]); }
    if (copied) {
      const [cCity, cCc, cLa, cLn] = COPIES[serial % 2];
      const w = Math.min(now - 20_000, when + (0.5 + rand() * 4) * day);
      scans.push([crypto.randomUUID(), id, brand.id, product.id, product.category, 'SUSPECT', cLa + (rand() - 0.5) * 0.1, cLn + (rand() - 0.5) * 0.1, `${cCity}, ${cCc}`, cCc, 'Android', iso(w)]);
    }
  }
  await insert('trace_codes', ['id', 'batchId', 'productId', 'brandId', 'serial', 'scanCount', 'firstScanAt', 'firstPlace', 'firstCountry', 'createdAt'], codes);
  await insert('trace_scans', ['id', 'codeId', 'brandId', 'productId', 'category', 'verdict', 'geoLat', 'geoLng', 'place', 'country', 'device', 'createdAt'], scans);

  await prisma.traceCampaign.create({
    data: { brandId: brand.id, productId: product.id, title: 'Paris launch: +50 points per genuine bottle', bonusPoints: 50, budgetPoints: 20_000, spentPoints: 4350, scans: 87, feeCents: 5, lat: 48.8566, lng: 2.3522, radiusKm: 30, place: 'Paris (30 km)', createdById: u.id },
  });
  return { productId: product.id, batchId: batchIds[0], code: codeFor(first!, 0) };
}
