import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { KEY_LEN, MAX_BATCH, PLAN_UNITS, SIG_LEN, STAGES, encodeSerial, formatCode, splitCode, toBase32, verdictFor, type Verdict } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { requestCf } from './request-cf';
import { award, brandBalance } from './trace-wallet';
import { applyCampaigns } from './trace-campaigns';
import { divertedScan, passportExtras, shopTier } from './trace-plus';

// UniVerse Trace: every product gets a passport (migrations 0177, 0178). Anyone can start a brand
// for free (trace_brands; no school needed) and add its products and batches; every unit carries a
// printed code (codeKey + serial + a signature made with the batch's own secret), so codes can't be
// guessed or forged and none is stored until its first scan. Each scan is a supply-chain record
// (where the product really is, kept on the live maps) and a marketing moment: the buyer sees it's
// genuine and the product's story, and a shop or installer who claims it earns the brand's points
// in the shared wallet (src/server/trace-wallet.ts), plus any campaign bonus (trace-campaigns.ts). A
// label seen far from its first scan, or too often, is flagged as a likely copy (src/lib/trace.ts).

const sign = (secret: string, key: string, serial: number) => toBase32(crypto.createHmac('sha256', secret).update(`${key}${encodeSerial(serial)}`).digest(), SIG_LEN);
/** The printed code for one unit of a batch. */
export const codeFor = (b: { codeKey: string; secret: string }, serial: number) => `${b.codeKey}${encodeSerial(serial)}${sign(b.secret, b.codeKey, serial)}`;
/** A code as stored (no dashes, typos fixed), or null when it isn't one. */
export const idOf = (raw: string) => { const p = splitCode(raw); return p ? `${p.key}${encodeSerial(p.serial)}${p.sig}` : null; };
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
export const short = (v: unknown, max: number) => (str(v)?.trim().slice(0, max) || null);
const httpsUrl = (v: unknown) => { const s = short(v, 500); return s && /^https:\/\//i.test(s) ? s : null; };
export const position = (b: Body) => {
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  return lat !== null && lng !== null ? { lat, lng } : null;
};
/** Cloudflare's estimate of where a request came from (city level), when it has one. */
export function cfPosition(req: Request) {
  const cf = requestCf(req);
  const lat = num(cf?.latitude, -90, 90), lng = num(cf?.longitude, -180, 180);
  return { cf, geo: lat !== null && lng !== null ? { lat, lng } : null };
}

// ─── Brands ───

type Brand = NonNullable<Awaited<ReturnType<typeof prisma.traceBrand.findUnique>>>;

/** The brand this person runs (one per account for now), or null. */
export async function myBrand(u: SessionUser): Promise<Brand | null> {
  const m = await prisma.traceBrandMember.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'asc' }, include: { brand: true } });
  return m?.brand ?? null;
}
export async function brandOf(u: SessionUser): Promise<Brand> {
  const b = await myBrand(u);
  if (!b) throw new ForbiddenException('Start your brand first.');
  return b;
}
/** PRO features (the market layer, more units) for PRO brands, and for the platform owner to try them. */
export const isPro = (b: Brand, u: SessionUser) => b.plan === 'PRO' || !!u.owner;

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40) || 'brand';
const COLORS = ['#fe81d1', '#e46bdb', '#ff9fdc', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

export async function brandInfo(u: SessionUser) {
  const b = await myBrand(u);
  if (!b) return { brand: null };
  const units = await prisma.traceBatch.aggregate({ where: { brandId: b.id }, _sum: { quantity: true } });
  return { brand: b, pro: isPro(b, u), units: units._sum.quantity ?? 0, unitLimit: PLAN_UNITS[b.plan] ?? PLAN_UNITS.FREE };
}

/** POST /trace/brand: start a brand, free. One per account; asking again returns the same one. */
export async function createBrand(u: SessionUser, body: Body) {
  const existing = await myBrand(u);
  if (existing) return existing;
  const name = short(body.name, 80);
  if (!name) throw new BadRequestException('What is your brand called?');
  const slug = `${slugify(name)}-${toBase32(crypto.randomBytes(4), 4).toLowerCase()}`;
  const brand = await prisma.traceBrand.create({
    data: { name, slug, category: short(body.category, 60)?.toLowerCase() ?? null, color: COLORS[crypto.randomBytes(1)[0] % COLORS.length], createdById: u.id },
  });
  await prisma.traceBrandMember.create({ data: { brandId: brand.id, userId: u.id, role: 'OWNER' } });
  return brand;
}

export async function updateBrand(u: SessionUser, body: Body) {
  const b = await brandOf(u);
  const color = short(body.color, 9);
  return prisma.traceBrand.update({
    where: { id: b.id },
    data: {
      ...(short(body.name, 80) && { name: short(body.name, 80)! }),
      ...(body.category !== undefined && { category: short(body.category, 60)?.toLowerCase() ?? null }),
      ...(color && /^#[0-9a-f]{6}$/i.test(color) && { color }),
      ...(body.logoUrl !== undefined && { logoUrl: httpsUrl(body.logoUrl) }),
      ...(num(body.pointValue, 0, 100) !== null && { pointValue: num(body.pointValue, 0, 100)! }),
      ...(oneOf(['EUR', 'USD', 'GBP', 'INR', 'AED', 'CHF'] as const, body.currency) && { currency: body.currency }),
      ...(num(body.minCashout, 1, 1_000_000) !== null && { minCashout: Math.round(num(body.minCashout, 1, 1_000_000)!) }),
    },
  });
}

/** The platform owner's list of every brand, with its plan and size. */
export async function allBrands() {
  const brands = await prisma.traceBrand.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
  const [units, scans] = await Promise.all([
    prisma.traceBatch.groupBy({ by: ['brandId'], _sum: { quantity: true } }),
    prisma.traceScan.groupBy({ by: ['brandId'], _count: { _all: true } }),
  ]);
  return brands.map((b) => ({ ...b, units: units.find((x) => x.brandId === b.id)?._sum.quantity ?? 0, scans: scans.find((x) => x.brandId === b.id)?._count._all ?? 0 }));
}
export async function setPlan(brandId: string, plan: unknown) {
  if (!oneOf(['FREE', 'PRO'] as const, plan)) throw new BadRequestException('Plan is FREE or PRO.');
  return prisma.traceBrand.update({ where: { id: brandId }, data: { plan } });
}

// ─── Products, batches, journeys ───

async function ownProduct(b: Brand, id: string) {
  const p = await prisma.traceProduct.findUnique({ where: { id } });
  if (!p || p.brandId !== b.id) throw new NotFoundException('Product not found');
  return p;
}
export async function ownBatch(b: Brand, id: string) {
  const x = await prisma.traceBatch.findUnique({ where: { id }, include: { product: { select: { id: true, name: true, rewardPoints: true } } } });
  if (!x || x.brandId !== b.id) throw new NotFoundException('Batch not found');
  return x;
}

export async function listProducts(u: SessionUser) {
  const b = await brandOf(u);
  const [products, recalls] = await Promise.all([
    prisma.traceProduct.findMany({
      where: { brandId: b.id },
      orderBy: { createdAt: 'desc' },
      include: { batches: { orderBy: { createdAt: 'desc' }, select: { id: true, label: true, quantity: true, origin: true, madeAt: true, createdAt: true, status: true, destPlace: true, carrierKey: true, allowedCountries: true, blockedAt: true } }, _count: { select: { codes: true } } },
    }),
    prisma.traceRecall.findMany({ where: { brandId: b.id, status: 'ACTIVE' }, select: { id: true, batchId: true, reason: true, severity: true } }),
  ]);
  return products.map((p) => ({ ...p, batches: p.batches.map((x) => ({ ...x, recall: recalls.find((r) => r.batchId === x.id) ?? null })) }));
}

function productData(b: Body) {
  return {
    sku: short(b.sku, 60), category: short(b.category, 60)?.toLowerCase() ?? null, description: short(b.description, 2000), story: short(b.story, 4000), imageUrl: httpsUrl(b.imageUrl),
    rewardPoints: num(b.rewardPoints, 0, 10_000) ?? 10, warrantyMonths: num(b.warrantyMonths, 0, 120) ?? 0,
    ...extrasData(b),
  };
}
/** The product's extras (migration 0179), only those sent: an instant win (1 in `winOdds` units), cold chain and weight. */
function extrasData(b: Body) {
  const odds = num(b.winOdds, 2, 1_000_000);
  return {
    ...('winOdds' in b && { winOdds: odds === null ? null : Math.round(odds) }),
    ...('winPrize' in b && { winPrize: short(b.winPrize, 120) }),
    ...('maxTempC' in b && { maxTempC: num(b.maxTempC, -80, 80) }),
    ...('weightKg' in b && { weightKg: num(b.weightKg, 0.001, 100_000) ?? 1 }),
  };
}

export async function createProduct(u: SessionUser, body: Body, extra: { sample?: boolean } = {}) {
  const b = await brandOf(u);
  const name = short(body.name, 120);
  if (!name) throw new BadRequestException('Give the product a name.');
  const data = productData(body);
  return prisma.traceProduct.create({ data: { brandId: b.id, name, createdById: u.id, ...data, category: data.category ?? b.category, sample: !!extra.sample } });
}

export async function updateProduct(u: SessionUser, id: string, body: Body) {
  await ownProduct(await brandOf(u), id);
  const name = short(body.name, 120);
  // Only the extras (the product's settings panel), or the whole product.
  const onlyExtras = Object.keys(body).every((k) => ['winOdds', 'winPrize', 'maxTempC', 'weightKg'].includes(k));
  return prisma.traceProduct.update({ where: { id }, data: onlyExtras ? extrasData(body) : { ...(name && { name }), ...productData(body) } });
}

export async function deleteProduct(u: SessionUser, id: string) {
  await ownProduct(await brandOf(u), id);
  await prisma.traceProduct.delete({ where: { id } });
  return { ok: true };
}

export async function createBatch(u: SessionUser, productId: string, body: Body) {
  const brand = await brandOf(u);
  await ownProduct(brand, productId);
  const quantity = num(body.quantity, 1, MAX_BATCH - 1);
  if (quantity === null || !Number.isInteger(quantity)) throw new BadRequestException(`How many units? A whole number from 1 to ${(MAX_BATCH - 1).toLocaleString()}.`);
  const used = (await prisma.traceBatch.aggregate({ where: { brandId: brand.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const limit = isPro(brand, u) ? PLAN_UNITS.PRO : PLAN_UNITS[brand.plan] ?? PLAN_UNITS.FREE;
  if (used + quantity > limit) throw new BadRequestException(`The free plan covers ${limit.toLocaleString()} units and you have ${(limit - used).toLocaleString()} left. Ask us about PRO for more.`);
  const pos = position(body);
  const madeAt = str(body.madeAt) && !Number.isNaN(Date.parse(str(body.madeAt)!)) ? new Date(str(body.madeAt)!) : new Date();
  const origin = short(body.origin, 160);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const batch = await prisma.traceBatch.create({
        data: {
          productId, brandId: brand.id, label: short(body.label, 80) ?? `Batch ${madeAt.toISOString().slice(0, 10)}`, quantity,
          codeKey: toBase32(crypto.randomBytes(8), KEY_LEN), secret: crypto.randomBytes(32).toString('hex'), origin, lat: pos?.lat, lng: pos?.lng, madeAt, createdById: u.id,
        },
      });
      await prisma.traceEvent.create({ data: { batchId: batch.id, brandId: brand.id, stage: 'MADE', place: origin, lat: pos?.lat, lng: pos?.lng, actorId: u.id, createdAt: madeAt } });
      return { id: batch.id, label: batch.label, quantity: batch.quantity, firstCode: formatCode(codeFor(batch, 0)) };
    } catch (e) {
      // Two batches drew the same short key (one chance in a billion): draw again.
      if (!String(e).includes('UNIQUE') || attempt === 3) throw e;
    }
  }
  throw new BadRequestException('Could not create the batch. Try again.');
}

export async function batchDetail(u: SessionUser, id: string) {
  const b = await ownBatch(await brandOf(u), id);
  const [events, scanned, claimed, suspect] = await Promise.all([
    prisma.traceEvent.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.traceCode.count({ where: { batchId: id } }),
    prisma.traceCode.count({ where: { batchId: id, claimedById: { not: null } } }),
    prisma.traceScan.count({ where: { code: { batchId: id }, verdict: 'SUSPECT' } }),
  ]);
  // Never the batch's secret.
  return { id: b.id, label: b.label, quantity: b.quantity, origin: b.origin, lat: b.lat, lng: b.lng, madeAt: b.madeAt, createdAt: b.createdAt, status: b.status, destPlace: b.destPlace, product: b.product, events, scanned, claimed, suspect };
}

/** The printed codes of a batch, a page at a time (for the print sheet and the CSV for printers). */
export async function batchCodes(u: SessionUser, id: string, from: number, count: number) {
  const b = await ownBatch(await brandOf(u), id);
  const start = Math.max(0, Math.floor(from)), n = Math.max(0, Math.min(1000, Math.floor(count), b.quantity - start));
  return { batch: { id: b.id, label: b.label, quantity: b.quantity, product: b.product.name }, codes: Array.from({ length: n }, (_, i) => ({ serial: start + i + 1, code: codeFor(b, start + i) })) };
}

export async function addEvent(u: SessionUser, batchId: string, body: Body) {
  const brand = await brandOf(u);
  await ownBatch(brand, batchId);
  if (!oneOf(STAGES, body.stage)) throw new BadRequestException('Pick a stage.');
  const pos = position(body);
  const event = await prisma.traceEvent.create({ data: { batchId, brandId: brand.id, stage: body.stage, place: short(body.place, 160), lat: pos?.lat, lng: pos?.lng, note: short(body.note, 500), actorId: u.id } });
  if (body.stage === 'SHOP') await prisma.traceBatch.update({ where: { id: batchId }, data: { status: 'DELIVERED' } });
  return event;
}

/** Blocks a copied code (every later scan says "suspect") or lets it through again. */
export async function flagCode(u: SessionUser, raw: string, flagged: boolean) {
  const brand = await brandOf(u);
  const id = idOf(raw);
  const c = id ? await prisma.traceCode.findUnique({ where: { id } }) : null;
  if (!c || c.brandId !== brand.id) throw new NotFoundException('Code not found');
  return prisma.traceCode.update({ where: { id: c.id }, data: { status: flagged ? 'FLAGGED' : 'ACTIVE' }, select: { id: true, status: true } });
}

/** The brand's live board: scans per day, genuine against suspect, where, points, campaigns and fees. */
export async function overview(u: SessionUser, days = 30) {
  const brand = await brandOf(u);
  const now = Date.now(), start = Math.floor(now / 1000) - days * 86_400;
  const startText = new Date(start * 1000).toISOString().replace('Z', '+00:00');
  const where = { brandId: brand.id };
  const [products, batches, units, scanned, claimed, perDay, verdicts, places, recent, suspects, points, campaigns, pendingCashouts] = await Promise.all([
    prisma.traceProduct.count({ where }),
    prisma.traceBatch.count({ where }),
    prisma.traceBatch.aggregate({ where, _sum: { quantity: true } }),
    prisma.traceCode.count({ where }),
    prisma.traceCode.count({ where: { ...where, claimedById: { not: null } } }),
    prisma.$queryRawUnsafe<{ b: unknown; n: unknown; suspect: unknown }[]>(
      `SELECT CAST((CAST(strftime('%s', "createdAt") AS INTEGER) - ?) / 86400 AS INTEGER) AS "b", COUNT(*) AS "n", SUM(CASE WHEN "verdict" = 'SUSPECT' THEN 1 ELSE 0 END) AS "suspect"
       FROM "trace_scans" WHERE "createdAt" >= ? AND "brandId" = ? GROUP BY "b"`, start, startText, brand.id,
    ).catch(() => []),
    prisma.traceScan.groupBy({ by: ['verdict'], where: { ...where, createdAt: { gte: new Date(start * 1000) } }, _count: { _all: true } }),
    prisma.traceScan.groupBy({ by: ['place'], where: { ...where, createdAt: { gte: new Date(start * 1000) }, place: { not: null } }, _count: { _all: true } }),
    prisma.traceScan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, verdict: true, place: true, createdAt: true, code: { select: { id: true, serial: true, product: { select: { name: true } }, batch: { select: { label: true } } } } } }),
    prisma.traceScan.findMany({ where: { ...where, verdict: 'SUSPECT' }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, place: true, createdAt: true, code: { select: { id: true, status: true, firstPlace: true, scanCount: true, product: { select: { name: true } } } } } }),
    prisma.tracePoint.aggregate({ where: { brandId: brand.id, kind: { in: ['SCAN', 'CAMPAIGN'] } }, _sum: { points: true } }),
    prisma.traceCampaign.findMany({ where, select: { scans: true, feeCents: true, status: true } }),
    prisma.traceCashout.count({ where: { brandId: brand.id, status: 'PENDING' } }),
  ]);
  const scans = Array<number>(days).fill(0), suspect = Array<number>(days).fill(0);
  for (const r of perDay) { const b = Number(r.b); if (b >= 0 && b < days) { scans[b] = Number(r.n) || 0; suspect[b] = Number(r.suspect) || 0; } }
  const count = (v: Verdict) => verdicts.find((x) => x.verdict === v)?._count._all ?? 0;
  return {
    days, products, batches, units: units._sum.quantity ?? 0, scanned, claimed, points: points._sum.points ?? 0,
    scans, suspect, first: count('FIRST'), seen: count('SEEN'), suspects: count('SUSPECT'),
    places: places.map((p) => ({ place: p.place ?? '', scans: p._count._all })).sort((a, b) => b.scans - a.scans).slice(0, 6),
    recent: recent.map((s) => ({ ...s, code: { ...s.code, label: formatCode(s.code.id) } })),
    suspectList: suspects.map((s) => ({ ...s, code: { ...s.code, label: formatCode(s.code.id) } })),
    campaigns: { active: campaigns.filter((c) => c.status === 'ACTIVE').length, scans: campaigns.reduce((a, c) => a + c.scans, 0), fees: campaigns.reduce((a, c) => a + c.scans * c.feeCents, 0) / 100 },
    pendingCashouts, currency: brand.currency,
  };
}

// ─── Anyone who scans ───

const deviceOf = (req: Request) => {
  const ua = req.headers.get('user-agent') ?? '';
  return /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : null;
};

/**
 * POST /api/core/trace/scan/:code (no sign-in): checks the code, records the scan (unless this
 * browser already scanned it: `again`) and returns the product's passport.
 */
export async function scan(raw: string, b: Body, user: SessionUser | null, req: Request) {
  if (raw.trim().toLowerCase() === 'demo') return demoPassport();
  const parts = splitCode(raw);
  const batch = parts ? await prisma.traceBatch.findUnique({ where: { codeKey: parts.key }, include: { product: true } }) : null;
  if (!parts || !batch || parts.serial >= batch.quantity || !same(parts.sig, sign(batch.secret, batch.codeKey, parts.serial))) return { result: 'UNKNOWN' as const };
  const id = idOf(raw)!;
  const existing = await prisma.traceCode.upsert({ where: { id }, create: { id, batchId: batch.id, productId: batch.productId, brandId: batch.brandId, serial: parts.serial }, update: {} });
  const here = position(b);
  const again = b.again === true;
  const { cf, geo } = cfPosition(req);
  let verdict = verdictFor(existing, here, { first: existing.firstCountry, now: cf?.country ?? null });
  let code = existing;
  if (again) {
    if (verdict === 'FIRST') verdict = 'SEEN';
  } else {
    const place = [cf?.city, cf?.country].filter(Boolean).join(', ') || null;
    const first = existing.scanCount === 0;
    [code] = await Promise.all([
      prisma.traceCode.update({
        where: { id },
        data: { scanCount: { increment: 1 }, ...(first && { firstScanAt: new Date(), firstLat: here?.lat ?? null, firstLng: here?.lng ?? null, firstPlace: place, firstCountry: cf?.country ?? null }) },
      }),
      prisma.traceScan.create({
        data: { codeId: id, brandId: batch.brandId, productId: batch.productId, category: batch.product.category, userId: user?.id ?? null, verdict, lat: here?.lat, lng: here?.lng, geoLat: geo?.lat, geoLng: geo?.lng, place, country: cf?.country ?? null, device: deviceOf(req), diverted: divertedScan(batch, cf?.country) },
      }),
    ]);
  }
  const [events, brand, extras] = await Promise.all([
    prisma.traceEvent.findMany({ where: { batchId: batch.id }, orderBy: { createdAt: 'asc' }, select: { stage: true, place: true, createdAt: true } }),
    batch.brandId ? prisma.traceBrand.findUnique({ where: { id: batch.brandId }, select: { name: true, logoUrl: true, slug: true } }) : null,
    passportExtras(batch, id, { first: !again && existing.scanCount === 0, genuine: verdict === 'FIRST', place: code.firstPlace, user }),
  ]);
  const p = batch.product;
  return {
    result: verdict,
    code: formatCode(id), serial: parts.serial + 1,
    brand: { name: brand?.name ?? 'UniVerse', logoUrl: brand?.logoUrl ?? null, slug: brand?.slug ?? null },
    product: { name: p.name, category: p.category, description: p.description, story: p.story, imageUrl: p.imageUrl, warrantyMonths: p.warrantyMonths, rewardPoints: p.rewardPoints },
    batch: { label: batch.label, origin: batch.origin, madeAt: batch.madeAt, quantity: batch.quantity },
    journey: events,
    scans: code.scanCount, firstScanAt: code.firstScanAt, firstPlace: code.firstPlace,
    claimed: !!code.claimedById, claimedByYou: !!user && code.claimedById === user.id,
    canClaim: !!user && !code.claimedById && verdict !== 'SUSPECT' && !extras.blocked && p.rewardPoints > 0,
    ...extras,
  };
}

/** /t/demo: a sample passport for the landing page and for pitching (nothing is stored). */
function demoPassport() {
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  return {
    result: 'FIRST' as const, code: 'DEMO', serial: 1204,
    brand: { name: 'Aurora (sample)', logoUrl: null },
    product: {
      name: 'Aurora cold-pressed olive oil', category: 'Food', description: '500 ml, extra virgin, first cold press.', imageUrl: null, warrantyMonths: 0, rewardPoints: 25,
      story: 'Picked by hand on the Ortega family’s hillside groves outside Jaén, pressed within six hours and bottled the same week. Olive oil is one of the most copied foods in the world: this label proves the bottle in your hand is the real one. (This is a sample passport: give your own products one with UniVerse Trace.)',
    },
    batch: { label: 'Harvest 2026 · press 3', origin: 'Jaén, Spain', madeAt: ago(20), quantity: 5000 },
    journey: [{ stage: 'MADE', place: 'Jaén, Spain', createdAt: ago(20) }, { stage: 'SHIPPED', place: 'Port of Valencia', createdAt: ago(9) }, { stage: 'WAREHOUSE', place: 'Lyon', createdAt: ago(6) }, { stage: 'DISTRIBUTOR', place: 'Paris, Rungis', createdAt: ago(3) }, { stage: 'SHOP', place: 'Paris 11e', createdAt: ago(1) }],
    scans: 1, firstScanAt: new Date().toISOString(), firstPlace: null, claimed: false, claimedByYou: false, canClaim: false,
    recall: null, blocked: false, win: null, warranty: null, owner: null,
    reviews: { avg: 4.8, count: 312, mine: null, recent: [
      { stars: 5, text: 'You can taste the difference. Good to know it’s the real one.', place: 'Lyon, FR', createdAt: ago(2) },
      { stars: 5, text: 'Bought it as a gift, the story on the passport was a nice touch.', place: 'Paris, FR', createdAt: ago(5) },
      { stars: 4, text: 'Great oil, the bottle could pour better.', place: 'Brussels, BE', createdAt: ago(8) },
    ] },
  };
}

/**
 * POST /api/core/trace/scan/:code/claim: the first signed-in person to claim a genuine unit earns its
 * points with that brand, plus the bonus of every campaign running where they are.
 */
export async function claim(raw: string, user: SessionUser, body: Body, req: Request) {
  const id = idOf(raw);
  const code = id ? await prisma.traceCode.findUnique({ where: { id }, include: { product: { select: { id: true, name: true, rewardPoints: true } } } }) : null;
  if (!code || !code.brandId) throw new NotFoundException('Scan the code first.');
  if (code.status === 'FLAGGED') throw new ForbiddenException('This code was reported as a copy, so it can’t earn points.');
  if ((await prisma.traceBatch.findUnique({ where: { id: code.batchId }, select: { blockedAt: true } }))?.blockedAt) throw new ForbiddenException('The brand blocked this batch (reported stolen), so it can’t earn points. Please tell the brand where you got it.');
  if (await prisma.traceScan.count({ where: { codeId: code.id, verdict: 'SUSPECT' } })) throw new ForbiddenException('This code was also scanned far from here, so it may be a copy. Points are paused until the brand checks it.');
  const won = await prisma.traceCode.updateMany({ where: { id: code.id, claimedById: null }, data: { claimedById: user.id, claimedAt: new Date() } });
  if (!won.count) throw new BadRequestException(code.claimedById === user.id ? 'You already earned the points for this one.' : 'Someone already earned the points for this one.');
  // Shops that sell more of the brand earn more per unit (Bronze, Silver ×1.25, Gold ×1.5; src/lib/trace.ts TIERS).
  const tier = await shopTier(user.id, code.brandId);
  const base = Math.round(code.product.rewardPoints * tier.multiplier);
  if (base > 0) await award(user.id, code.brandId, 'SCAN', base, { codeId: code.id, note: `Scanned ${code.product.name}${tier.multiplier > 1 ? ` (${tier.label} ×${tier.multiplier})` : ''}` });
  const { cf, geo } = cfPosition(req);
  const bonuses = await applyCampaigns({ brandId: code.brandId, productId: code.product.id, userId: user.id, codeId: code.id, here: position(body) ?? geo, country: cf?.country ?? null });
  const extra = bonuses.reduce((a, x) => a + x.points, 0);
  return { points: base + extra, base, bonuses, tier: { label: tier.label, multiplier: tier.multiplier, next: tier.next }, balance: await brandBalance(user.id, code.brandId) };
}
