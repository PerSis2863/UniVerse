import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { distanceM } from '@/lib/attendance-rules';
import { MARKET_MIN, cellOf, toBase32 } from '@/lib/trace';
import { BadRequestException, NotFoundException } from './http';
import { oneOf, type Body } from './body';
import { brandOf, isPro, num, ownBatch, short } from './trace';

// The UniVerse Trace live maps (the owner, 24 Oct 2026: "make the live map in detail like very
// detail… ultra smooth", "add 2d real time product tracking map").
// · Market map: where a brand's products are scanned, snapped to a 0.1° grid (≈ 11 km) so no shop or
//   person can be found, with a timeline to replay; PRO brands also see their category across every
//   brand, snapped to 0.5° and only where at least MARKET_MIN scans fall (the anonymised data product).
// · Tracking map: each batch's journey and, while a phone carries it (/carry/<key>), where it is now,
//   its trail, speed, the next stop and a rough arrival time.

const iso = (sec: number) => new Date(sec * 1000).toISOString().replace('Z', '+00:00');
type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;

/** Bucket length for the replay timeline: an hour for a day, 3 h for a week, 12 h for a month, a day beyond. */
export const bucketHours = (days: number) => (days <= 1 ? 1 : days <= 7 ? 3 : days <= 31 ? 12 : 24);

/** A stable pseudo-random number in [0, 1) for a key (the sample market is the same on every refresh). */
const seeded = (key: string) => crypto.createHash('sha256').update(key).digest().readUInt32BE(0) / 2 ** 32;

/** GET /trace/map/market?days=&product=: the brand's scans on the map, the timeline and (PRO) the market. */
export async function marketMap(u: SessionUser, daysRaw: number, productId: string | null) {
  const brand = await brandOf(u);
  const days = Math.min(90, Math.max(1, Math.round(daysRaw) || 30));
  const now = Math.floor(Date.now() / 1000), start = now - days * 86_400;
  const bh = bucketHours(days), bins = Math.ceil((days * 24) / bh);
  const where = `"brandId" = ? AND "createdAt" >= ?${productId ? ' AND "productId" = ?' : ''} AND COALESCE("lat", "geoLat") IS NOT NULL`;
  const args = [brand.id, iso(start), ...(productId ? [productId] : [])];
  const lat = `ROUND(COALESCE("lat", "geoLat") * 10) / 10.0`, lng = `ROUND(COALESCE("lng", "geoLng") * 10) / 10.0`;
  const [cellRows, prodRows, eventRows, products, sample, made] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${lat} AS "lat", ${lng} AS "lng", COUNT(*) AS "scans", SUM(CASE WHEN "verdict" = 'SUSPECT' THEN 1 ELSE 0 END) AS "suspect",
         SUM(CASE WHEN "verdict" = 'FIRST' THEN 1 ELSE 0 END) AS "first", MAX("place") AS "place", MAX("country") AS "country", MAX("createdAt") AS "last"
       FROM "trace_scans" WHERE ${where} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 1500`, ...args).catch(() => []),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${lat} AS "lat", ${lng} AS "lng", "productId" AS "p", COUNT(*) AS "n" FROM "trace_scans" WHERE ${where} GROUP BY 1, 2, 3 LIMIT 6000`, ...args).catch(() => []),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${lat} AS "lat", ${lng} AS "lng", CAST((CAST(strftime('%s', "createdAt") AS INTEGER) - ?) / ? AS INTEGER) AS "bin", "verdict" AS "v", "productId" AS "p"
       FROM "trace_scans" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 6000`, start, bh * 3600, ...args).catch(() => []),
    prisma.traceProduct.findMany({ where: { brandId: brand.id }, select: { id: true, name: true, category: true, sample: true }, orderBy: { createdAt: 'asc' } }),
    prisma.traceProduct.count({ where: { brandId: brand.id, sample: true } }),
    prisma.traceBatch.findMany({ where: { brandId: brand.id, lat: { not: null }, lng: { not: null }, ...(productId && { productId }) }, select: { lat: true, lng: true, origin: true }, take: 200 }),
  ]);
  // Where the products are made (the map draws flows from there to where they're scanned).
  const origins = [...new Map(made.map((b) => { const [la, ln] = cellOf(b.lat!, b.lng!, 0.1); return [`${la},${ln}`, { lat: la, lng: ln, place: b.origin }] as const; })).values()].slice(0, 12);
  const key = (r: Row) => `${N(r.lat)},${N(r.lng)}`;
  const cells = cellRows.map((r) => ({ lat: N(r.lat), lng: N(r.lng), scans: N(r.scans), suspect: N(r.suspect), first: N(r.first), place: (r.place as string | null) ?? null, country: (r.country as string | null) ?? null, last: r.last as string, products: {} as Record<string, number> }));
  const index = new Map(cells.map((c, i) => [`${c.lat},${c.lng}`, i]));
  for (const r of prodRows) { const i = index.get(key(r)); if (i !== undefined && r.p) cells[i].products[r.p as string] = N(r.n); }
  const timeline = Array.from({ length: bins }, () => [0, 0]);
  const events: [number, number, number, number][] = [];
  const pIndex = new Map(products.map((p, i) => [p.id, i]));
  for (const r of eventRows) {
    const c = index.get(key(r)), b = N(r.bin);
    if (c === undefined || b < 0 || b >= bins) continue;
    timeline[b][0]++; if (r.v === 'SUSPECT') timeline[b][1]++;
    events.push([c, b, r.v === 'SUSPECT' ? 2 : r.v === 'FIRST' ? 1 : 0, pIndex.get(r.p as string) ?? -1]);
  }
  return {
    days, bucketHours: bh, bins, start: iso(start), now: iso(now),
    brand: { name: brand.name, color: brand.color, category: brand.category },
    products: products.map((p) => ({ id: p.id, name: p.name })),
    cells, timeline, events: events.reverse(), sample: sample > 0, origins,
    market: await market(u, brand, days, start, cells, sample > 0),
  };
}

async function market(u: SessionUser, brand: Awaited<ReturnType<typeof brandOf>>, days: number, start: number, mine: { lat: number; lng: number; scans: number; place: string | null }[], sample: boolean) {
  const category = brand.category ?? (await prisma.traceProduct.findFirst({ where: { brandId: brand.id, category: { not: null } }, select: { category: true } }))?.category ?? null;
  if (!isPro(brand, u)) return { locked: true as const, category };
  if (!category) return { locked: false as const, category: null, cells: [], total: 0, yours: 0, opportunities: [] };
  const lat = `ROUND(COALESCE("lat", "geoLat") * 2) / 2.0`, lng = `ROUND(COALESCE("lng", "geoLng") * 2) / 2.0`;
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${lat} AS "lat", ${lng} AS "lng", COUNT(*) AS "total", SUM(CASE WHEN "brandId" = ? THEN 1 ELSE 0 END) AS "yours", MAX("place") AS "place"
     FROM "trace_scans" WHERE "category" = ? AND "createdAt" >= ? AND COALESCE("lat", "geoLat") IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) >= ? ORDER BY 3 DESC LIMIT 800`,
    brand.id, category, iso(start), MARKET_MIN).catch(() => []);
  let cells = rows.map((r) => ({ lat: N(r.lat), lng: N(r.lng), total: N(r.total), yours: N(r.yours), place: (r.place as string | null) ?? null }));
  // A brand trying the sample product has no competitors yet: show a made-up but stable market around
  // its sample scans, plus a few cities it doesn't reach, clearly marked as sample data.
  if (sample) cells = sampleMarket(mine, days);
  const total = cells.reduce((a, c) => a + c.total, 0), yours = cells.reduce((a, c) => a + c.yours, 0);
  const opportunities = cells.filter((c) => c.total >= 20).map((c) => ({ ...c, share: c.total ? c.yours / c.total : 0 })).sort((a, b) => a.share - b.share || b.total - a.total).slice(0, 6);
  return { locked: false as const, category, cells, total, yours, opportunities, sample };
}

const EXTRA: [string, number, number][] = [['Bordeaux, FR', 44.84, -0.58], ['Nantes, FR', 47.22, -1.55], ['Seville, ES', 37.39, -5.98], ['Valencia, ES', 39.47, -0.38], ['Turin, IT', 45.07, 7.69], ['Hamburg, DE', 53.55, 9.99], ['Copenhagen, DK', 55.68, 12.57], ['Dublin, IE', 53.35, -6.26], ['Porto, PT', 41.15, -8.61], ['Athens, GR', 37.98, 23.73], ['Riyadh, SA', 24.71, 46.68], ['Pune, IN', 18.52, 73.86]];
function sampleMarket(mine: { lat: number; lng: number; scans: number; place: string | null }[], days: number) {
  const out = new Map<string, { lat: number; lng: number; total: number; yours: number; place: string | null }>();
  for (const c of mine) {
    const [la, ln] = cellOf(c.lat, c.lng, 0.5), k = `${la},${ln}`;
    const cur = out.get(k) ?? { lat: la, lng: ln, total: 0, yours: 0, place: c.place };
    cur.yours += c.scans; out.set(k, cur);
  }
  for (const [k, c] of out) c.total = Math.max(MARKET_MIN, Math.round(c.yours * (1.8 + seeded(k) * 4)));
  for (const [place, la, ln] of EXTRA) {
    const [a, b] = cellOf(la, ln, 0.5);
    if (!out.has(`${a},${b}`)) out.set(`${a},${b}`, { lat: a, lng: b, total: Math.round((20 + seeded(place) * 140) * Math.min(1, days / 30) + MARKET_MIN), yours: 0, place });
  }
  return [...out.values()];
}

/** GET /trace/map/live?since=: the brand's scans since a moment (≤ 100), snapped like the map, for the live pulses. */
export async function liveScans(u: SessionUser, sinceRaw: string | undefined) {
  const brand = await brandOf(u);
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : new Date(Date.now() - 60_000);
  const rows = await prisma.traceScan.findMany({
    where: { brandId: brand.id, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, take: 100,
    select: { id: true, lat: true, lng: true, geoLat: true, geoLng: true, verdict: true, productId: true, place: true, createdAt: true },
  });
  return {
    now: new Date().toISOString(),
    scans: rows.flatMap((s) => {
      const la = s.lat ?? s.geoLat, ln = s.lng ?? s.geoLng;
      if (la === null || ln === null) return [];
      const [lat, lng] = cellOf(la, ln, 0.1);
      return [{ id: s.id, lat, lng, verdict: s.verdict, productId: s.productId, place: s.place, at: s.createdAt }];
    }),
  };
}

// ─── Shipment tracking ───

const STALE_MS = 2 * 3600_000;

/** Distance along a list of points, in metres. */
const pathLength = (pts: { lat: number; lng: number }[]) => pts.slice(1).reduce((a, p, i) => a + distanceM(pts[i], p), 0);
/** The point a fraction of the way along a path (straight lines between points). */
export function along(pts: { lat: number; lng: number }[], t: number) {
  if (pts.length === 1) return pts[0];
  const total = pathLength(pts), goal = Math.max(0, Math.min(1, t)) * total;
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = distanceM(pts[i - 1], pts[i]);
    if (done + seg >= goal) { const f = seg ? (goal - done) / seg : 0; return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * f, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * f }; }
    done += seg;
  }
  return pts[pts.length - 1];
}
const bearing = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

/** GET /trace/map/tracking: every batch's stops and, for those on the move, the live position and trail. */
export async function tracking(u: SessionUser) {
  const brand = await brandOf(u);
  const batches = await prisma.traceBatch.findMany({
    where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 60,
    select: { id: true, label: true, status: true, quantity: true, destPlace: true, destLat: true, destLng: true, carrierKey: true, createdAt: true, product: { select: { id: true, name: true, sample: true } }, events: { orderBy: { createdAt: 'asc' }, select: { stage: true, place: true, lat: true, lng: true, createdAt: true } } },
  });
  const moving = batches.filter((b) => b.status === 'IN_TRANSIT').map((b) => b.id);
  const pings = moving.length ? await prisma.tracePing.findMany({ where: { batchId: { in: moving }, createdAt: { gt: new Date(Date.now() - STALE_MS) } }, orderBy: { createdAt: 'asc' }, take: 3000 }) : [];
  const nowMs = Date.now();
  return {
    now: new Date(nowMs).toISOString(),
    shipments: batches.map((b) => {
      const stops = b.events.filter((e) => e.lat !== null && e.lng !== null).map((e) => ({ stage: e.stage, place: e.place, lat: e.lat!, lng: e.lng!, at: e.createdAt }));
      const dest = b.destLat !== null && b.destLng !== null ? { lat: b.destLat, lng: b.destLng, place: b.destPlace } : null;
      let trail = pings.filter((p) => p.batchId === b.id).slice(-80).map((p) => ({ lat: p.lat, lng: p.lng, at: p.createdAt, speed: p.speedKmh }));
      let simulated = false;
      // A sample shipment with nobody carrying it moves on its own along its route (the demo stays alive).
      if (b.status === 'IN_TRANSIT' && !trail.length && b.product.sample && stops.length && dest) {
        simulated = true;
        const route = [stops[stops.length - 1], dest], period = 40 * 60_000;
        trail = Array.from({ length: 30 }, (_, i) => {
          const at = nowMs - (29 - i) * 20_000, t = ((at - b.createdAt.getTime()) % period) / period;
          return { ...along(route, t), at: new Date(at), speed: 78 + 6 * Math.sin(at / 60_000) };
        });
      }
      const last = trail[trail.length - 1] ?? null;
      const here = last ?? (stops.length ? stops[stops.length - 1] : null);
      const recent = trail.slice(-6);
      const avgSpeed = recent.length ? recent.reduce((a, p) => a + (p.speed ?? 0), 0) / recent.length : null;
      const left = here && dest ? distanceM(here, dest) : null;
      return {
        id: b.id, label: b.label, status: b.status, quantity: b.quantity, product: b.product.name, productId: b.product.id, sample: b.product.sample, simulated,
        stops, dest, trail, position: here ? { lat: here.lat, lng: here.lng } : null,
        heading: trail.length >= 2 ? bearing(trail[trail.length - 2], trail[trail.length - 1]) : null,
        speedKmh: last?.speed ?? null, lastPingAt: last?.at ?? null, carrierPath: b.carrierKey ? `/carry/${b.carrierKey}` : null,
        kmLeft: left !== null ? Math.round(left / 100) / 10 : null,
        etaMinutes: left !== null && avgSpeed && avgSpeed > 5 ? Math.round((left / 1000 / avgSpeed) * 60) : null,
      };
    }),
  };
}

/** POST /trace/batches/:id/carrier { destPlace, destLat, destLng }: a sharing link for whoever carries the batch. */
export async function carrierLink(u: SessionUser, batchId: string, body: Body) {
  const brand = await brandOf(u);
  const b = await ownBatch(brand, batchId);
  const lat = num(body.destLat, -90, 90), lng = num(body.destLng, -180, 180);
  const updated = await prisma.traceBatch.update({
    where: { id: b.id },
    data: {
      carrierKey: b.carrierKey ?? toBase32(crypto.randomBytes(16), 24),
      ...(short(body.destPlace, 160) && { destPlace: short(body.destPlace, 160) }),
      ...(lat !== null && lng !== null && { destLat: lat, destLng: lng }),
    },
    select: { carrierKey: true, destPlace: true },
  });
  return { key: updated.carrierKey, path: `/carry/${updated.carrierKey}`, destPlace: updated.destPlace };
}

async function byKey(key: string) {
  const b = key && /^[0-9A-Z]{24}$/.test(key) ? await prisma.traceBatch.findUnique({ where: { carrierKey: key }, select: { id: true, label: true, status: true, brandId: true, destPlace: true, destLat: true, destLng: true, product: { select: { name: true } } } }) : null;
  if (!b) throw new NotFoundException('This sharing link no longer works. Ask the brand for a new one.');
  return b;
}

/** GET /trace/carry/:key (no sign-in): what the driver is carrying and where it's going. */
export async function carryInfo(key: string) {
  const b = await byKey(key);
  const [brand, last] = await Promise.all([
    b.brandId ? prisma.traceBrand.findUnique({ where: { id: b.brandId }, select: { name: true, color: true } }) : null,
    prisma.tracePing.findFirst({ where: { batchId: b.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  return { label: b.label, product: b.product.name, status: b.status, destPlace: b.destPlace, brand: brand?.name ?? 'UniVerse', color: brand?.color ?? null, lastPingAt: last?.createdAt ?? null };
}

/** POST /trace/carry/:key/ping { lat, lng, speedKmh?, heading?, accuracyM? }: one live position (at most one per 5 s). */
export async function carryPing(key: string, body: Body) {
  const b = await byKey(key);
  const lat = num(body.lat, -90, 90), lng = num(body.lng, -180, 180);
  if (lat === null || lng === null) throw new BadRequestException('No position.');
  const last = await prisma.tracePing.findFirst({ where: { batchId: b.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  if (last && Date.now() - last.createdAt.getTime() < 5000) return { ok: true, skipped: true };
  await prisma.tracePing.create({ data: { batchId: b.id, brandId: b.brandId, lat, lng, speedKmh: num(body.speedKmh, 0, 1200), heading: num(body.heading, 0, 360), accuracyM: num(body.accuracyM, 0, 100_000) } });
  if (b.status !== 'IN_TRANSIT') await prisma.traceBatch.update({ where: { id: b.id }, data: { status: 'IN_TRANSIT' } });
  return { ok: true };
}

/** POST /trace/carry/:key/arrive { stage, place?, lat?, lng? }: the driver marks a stop (SHOP = delivered). */
export async function carryArrive(key: string, body: Body) {
  const b = await byKey(key);
  if (!oneOf(['SHIPPED', 'WAREHOUSE', 'DISTRIBUTOR', 'SHOP'] as const, body.stage)) throw new BadRequestException('Pick where you are.');
  const lat = num(body.lat, -90, 90), lng = num(body.lng, -180, 180);
  await prisma.traceEvent.create({ data: { batchId: b.id, brandId: b.brandId, stage: body.stage, place: short(body.place, 160), lat, lng } });
  await prisma.traceBatch.update({ where: { id: b.id }, data: { status: body.stage === 'SHOP' ? 'DELIVERED' : 'IN_TRANSIT' } });
  return { ok: true };
}
