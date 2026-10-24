import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { KEY_LEN, MAX_BATCH, SIG_LEN, STAGES, encodeSerial, formatCode, splitCode, toBase32, verdictFor, type Verdict } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { requestCf } from './request-cf';
import { getImpactCreditBalance, mintImpactCredits } from './impact-scholarships';

// UniVerse Trace (migration 0177): every product gets a passport. A brand adds its products and the
// batches it makes; every unit carries a printed code (codeKey + serial + a signature made with the
// batch's own secret), so codes can't be guessed or forged and none is stored until its first scan.
// Each scan is both a supply-chain record (where the product really is) and a marketing moment: the
// buyer sees it's genuine and the product's story, and a shop or installer who scans it earns points
// in the Impact Credits ledger (hash-chained, src/server/impact-scholarships.ts). A label seen far
// from its first scan, or too often, is flagged as a likely copy (src/lib/trace.ts).

const orgOf = (u: SessionUser | null) => u?.organizationId ?? null;
const sign = (secret: string, key: string, serial: number) => toBase32(crypto.createHmac('sha256', secret).update(`${key}${encodeSerial(serial)}`).digest(), SIG_LEN);
/** The printed code for one unit of a batch. */
export const codeFor = (b: { codeKey: string; secret: string }, serial: number) => `${b.codeKey}${encodeSerial(serial)}${sign(b.secret, b.codeKey, serial)}`;
/** A code as stored (no dashes, typos fixed), or null when it isn't one. */
const idOf = (raw: string) => { const p = splitCode(raw); return p ? `${p.key}${encodeSerial(p.serial)}${p.sig}` : null; };
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const short = (v: unknown, max: number) => (str(v)?.trim().slice(0, max) || null);
const httpsUrl = (v: unknown) => { const s = short(v, 500); return s && /^https:\/\//i.test(s) ? s : null; };
const position = (b: Body) => {
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

async function ownProduct(u: SessionUser, id: string) {
  const p = await prisma.traceProduct.findUnique({ where: { id } });
  if (!p || p.organizationId !== orgOf(u)) throw new NotFoundException('Product not found');
  return p;
}
async function ownBatch(u: SessionUser, id: string) {
  const b = await prisma.traceBatch.findUnique({ where: { id }, include: { product: { select: { id: true, name: true, rewardPoints: true } } } });
  if (!b || b.organizationId !== orgOf(u)) throw new NotFoundException('Batch not found');
  return b;
}

// ─── The brand ───

export function listProducts(u: SessionUser) {
  return prisma.traceProduct.findMany({
    where: { organizationId: orgOf(u) },
    orderBy: { createdAt: 'desc' },
    include: { batches: { orderBy: { createdAt: 'desc' }, select: { id: true, label: true, quantity: true, origin: true, madeAt: true, createdAt: true } }, _count: { select: { codes: true } } },
  });
}

function productData(b: Body) {
  return {
    sku: short(b.sku, 60), category: short(b.category, 60), description: short(b.description, 2000), story: short(b.story, 4000), imageUrl: httpsUrl(b.imageUrl),
    rewardPoints: num(b.rewardPoints, 0, 10_000) ?? 10, warrantyMonths: num(b.warrantyMonths, 0, 120) ?? 0,
  };
}

export async function createProduct(u: SessionUser, b: Body) {
  const name = short(b.name, 120);
  if (!name) throw new BadRequestException('Give the product a name.');
  return prisma.traceProduct.create({ data: { organizationId: orgOf(u), name, createdById: u.id, ...productData(b) } });
}

export async function updateProduct(u: SessionUser, id: string, b: Body) {
  await ownProduct(u, id);
  const name = short(b.name, 120);
  return prisma.traceProduct.update({ where: { id }, data: { ...(name && { name }), ...productData(b) } });
}

export async function createBatch(u: SessionUser, productId: string, b: Body) {
  const product = await ownProduct(u, productId);
  const quantity = num(b.quantity, 1, MAX_BATCH - 1);
  if (quantity === null || !Number.isInteger(quantity)) throw new BadRequestException(`How many units? A whole number from 1 to ${(MAX_BATCH - 1).toLocaleString()}.`);
  const pos = position(b);
  const madeAt = str(b.madeAt) && !Number.isNaN(Date.parse(str(b.madeAt)!)) ? new Date(str(b.madeAt)!) : new Date();
  const origin = short(b.origin, 160);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const batch = await prisma.traceBatch.create({
        data: {
          productId, organizationId: product.organizationId, label: short(b.label, 80) ?? `Batch ${madeAt.toISOString().slice(0, 10)}`, quantity,
          codeKey: toBase32(crypto.randomBytes(8), KEY_LEN), secret: crypto.randomBytes(32).toString('hex'), origin, lat: pos?.lat, lng: pos?.lng, madeAt, createdById: u.id,
        },
      });
      await prisma.traceEvent.create({ data: { batchId: batch.id, organizationId: batch.organizationId, stage: 'MADE', place: origin, lat: pos?.lat, lng: pos?.lng, actorId: u.id, createdAt: madeAt } });
      return { id: batch.id, label: batch.label, quantity: batch.quantity, firstCode: formatCode(codeFor(batch, 0)) };
    } catch (e) {
      // Two batches drew the same short key (one chance in a billion): draw again.
      if (!String(e).includes('UNIQUE') || attempt === 3) throw e;
    }
  }
  throw new BadRequestException('Could not create the batch. Try again.');
}

export async function batchDetail(u: SessionUser, id: string) {
  const b = await ownBatch(u, id);
  const [events, scanned, claimed, suspect] = await Promise.all([
    prisma.traceEvent.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.traceCode.count({ where: { batchId: id } }),
    prisma.traceCode.count({ where: { batchId: id, claimedById: { not: null } } }),
    prisma.traceScan.count({ where: { code: { batchId: id }, verdict: 'SUSPECT' } }),
  ]);
  // Never the batch's secret.
  return { id: b.id, label: b.label, quantity: b.quantity, origin: b.origin, lat: b.lat, lng: b.lng, madeAt: b.madeAt, createdAt: b.createdAt, product: b.product, events, scanned, claimed, suspect };
}

/** The printed codes of a batch, a page at a time (for the print sheet and the CSV for printers). */
export async function batchCodes(u: SessionUser, id: string, from: number, count: number) {
  const b = await ownBatch(u, id);
  const start = Math.max(0, Math.floor(from)), n = Math.max(0, Math.min(1000, Math.floor(count), b.quantity - start));
  return { batch: { id: b.id, label: b.label, quantity: b.quantity, product: b.product.name }, codes: Array.from({ length: n }, (_, i) => ({ serial: start + i + 1, code: codeFor(b, start + i) })) };
}

export async function addEvent(u: SessionUser, batchId: string, b: Body) {
  const batch = await ownBatch(u, batchId);
  if (!oneOf(STAGES, b.stage)) throw new BadRequestException('Pick a stage.');
  const pos = position(b);
  return prisma.traceEvent.create({ data: { batchId, organizationId: batch.organizationId, stage: b.stage, place: short(b.place, 160), lat: pos?.lat, lng: pos?.lng, note: short(b.note, 500), actorId: u.id } });
}

/** Blocks a copied code (every later scan says "suspect") or lets it through again. */
export async function flagCode(u: SessionUser, raw: string, flagged: boolean) {
  const id = idOf(raw);
  const c = id ? await prisma.traceCode.findUnique({ where: { id } }) : null;
  if (!c || c.organizationId !== orgOf(u)) throw new NotFoundException('Code not found');
  return prisma.traceCode.update({ where: { id: c.id }, data: { status: flagged ? 'FLAGGED' : 'ACTIVE' }, select: { id: true, status: true } });
}

/** The brand's live board: scans per day, genuine against suspect, where, and the points paid. */
export async function overview(u: SessionUser, days = 30) {
  const org = orgOf(u);
  const now = Date.now(), start = Math.floor(now / 1000) - days * 86_400;
  const startText = new Date(start * 1000).toISOString().replace('Z', '+00:00');
  const where = { organizationId: org };
  const [products, batches, units, scanned, claimed, perDay, verdicts, places, recent, suspects, points] = await Promise.all([
    prisma.traceProduct.count({ where }),
    prisma.traceBatch.count({ where }),
    prisma.traceBatch.aggregate({ where, _sum: { quantity: true } }),
    prisma.traceCode.count({ where }),
    prisma.traceCode.count({ where: { ...where, claimedById: { not: null } } }),
    prisma.$queryRawUnsafe<{ b: unknown; n: unknown; suspect: unknown }[]>(
      `SELECT CAST((CAST(strftime('%s', "createdAt") AS INTEGER) - ?) / 86400 AS INTEGER) AS "b", COUNT(*) AS "n", SUM(CASE WHEN "verdict" = 'SUSPECT' THEN 1 ELSE 0 END) AS "suspect"
       FROM "trace_scans" WHERE "createdAt" >= ? AND "organizationId" IS ? GROUP BY "b"`, start, startText, org,
    ).catch(() => []),
    prisma.traceScan.groupBy({ by: ['verdict'], where: { ...where, createdAt: { gte: new Date(start * 1000) } }, _count: { _all: true } }),
    prisma.traceScan.groupBy({ by: ['place'], where: { ...where, createdAt: { gte: new Date(start * 1000) }, place: { not: null } }, _count: { _all: true } }),
    prisma.traceScan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, verdict: true, place: true, createdAt: true, code: { select: { id: true, serial: true, product: { select: { name: true } }, batch: { select: { label: true } } } } } }),
    prisma.traceScan.findMany({ where: { ...where, verdict: 'SUSPECT' }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, place: true, createdAt: true, code: { select: { id: true, status: true, firstPlace: true, scanCount: true, product: { select: { name: true } } } } } }),
    prisma.impactCredit.aggregate({ where: { actionType: 'PRODUCT_SCAN', organizationId: org }, _sum: { credits: true } }),
  ]);
  const scans = Array<number>(days).fill(0), suspect = Array<number>(days).fill(0);
  for (const r of perDay) { const b = Number(r.b); if (b >= 0 && b < days) { scans[b] = Number(r.n) || 0; suspect[b] = Number(r.suspect) || 0; } }
  const count = (v: Verdict) => verdicts.find((x) => x.verdict === v)?._count._all ?? 0;
  return {
    days, products, batches, units: units._sum.quantity ?? 0, scanned, claimed, points: points._sum.credits ?? 0,
    scans, suspect, first: count('FIRST'), seen: count('SEEN'), suspects: count('SUSPECT'),
    places: places.map((p) => ({ place: p.place ?? '', scans: p._count._all })).sort((a, b) => b.scans - a.scans).slice(0, 6),
    recent: recent.map((s) => ({ ...s, code: { ...s.code, label: formatCode(s.code.id) } })),
    suspectList: suspects.map((s) => ({ ...s, code: { ...s.code, label: formatCode(s.code.id) } })),
  };
}

/** A ready-made product, batch and journey, so the brand can try a scan straight away. */
export async function demo(u: SessionUser) {
  const product = await createProduct(u, {
    name: 'Aurora cold-pressed olive oil', sku: 'AUR-500', category: 'Food', rewardPoints: 25, warrantyMonths: 0,
    description: '500 ml, extra virgin, first cold press.',
    story: 'Picked by hand on the Ortega family’s hillside groves outside Jaén, pressed within six hours and bottled the same week. Olive oil is one of the most copied foods in the world: this label proves the bottle in your hand is the real one.',
  });
  const batch = await createBatch(u, product.id, { quantity: 120, label: 'Harvest 2026 · press 3', origin: 'Jaén, Spain', lat: 37.7796, lng: -3.7849 });
  const steps: [string, string, number, number, number][] = [['SHIPPED', 'Port of Valencia', 39.4467, -0.3237, 9], ['WAREHOUSE', 'Lyon', 45.764, 4.8357, 6], ['DISTRIBUTOR', 'Paris, Rungis', 48.7584, 2.3503, 3], ['SHOP', 'Paris 11e, Épicerie Oberkampf', 48.8649, 2.3800, 1]];
  for (const [stage, place, lat, lng, daysAgo] of steps) {
    await prisma.traceEvent.create({ data: { batchId: batch.id, organizationId: product.organizationId, stage, place, lat, lng, actorId: u.id, createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
  }
  return { productId: product.id, batchId: batch.id, code: batch.firstCode };
}

// ─── Anyone who scans ───

const deviceOf = (req: Request) => {
  const ua = req.headers.get('user-agent') ?? '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : null;
  return os;
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
  const existing = await prisma.traceCode.upsert({ where: { id }, create: { id, batchId: batch.id, productId: batch.productId, organizationId: batch.organizationId, serial: parts.serial }, update: {} });
  const here = position(b);
  const again = b.again === true;
  const cf = requestCf(req);
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
      prisma.traceScan.create({ data: { codeId: id, organizationId: batch.organizationId, userId: user?.id ?? null, verdict, lat: here?.lat, lng: here?.lng, place, country: cf?.country ?? null, device: deviceOf(req) } }),
    ]);
  }
  const [events, org] = await Promise.all([
    prisma.traceEvent.findMany({ where: { batchId: batch.id }, orderBy: { createdAt: 'asc' }, select: { stage: true, place: true, createdAt: true } }),
    batch.organizationId ? prisma.organization.findUnique({ where: { id: batch.organizationId }, select: { name: true, logoUrl: true } }) : null,
  ]);
  const p = batch.product;
  return {
    result: verdict,
    code: formatCode(id), serial: parts.serial + 1,
    brand: { name: org?.name ?? 'UniVerse', logoUrl: org?.logoUrl ?? null },
    product: { name: p.name, category: p.category, description: p.description, story: p.story, imageUrl: p.imageUrl, warrantyMonths: p.warrantyMonths, rewardPoints: p.rewardPoints },
    batch: { label: batch.label, origin: batch.origin, madeAt: batch.madeAt, quantity: batch.quantity },
    journey: events,
    scans: code.scanCount, firstScanAt: code.firstScanAt, firstPlace: code.firstPlace,
    claimed: !!code.claimedById, claimedByYou: !!user && code.claimedById === user.id,
    canClaim: !!user && !code.claimedById && verdict !== 'SUSPECT' && p.rewardPoints > 0,
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
  };
}

/** POST /api/core/trace/scan/:code/claim: the first signed-in person to claim a genuine unit earns its points. */
export async function claim(raw: string, user: SessionUser) {
  const id = idOf(raw);
  const code = id ? await prisma.traceCode.findUnique({ where: { id }, include: { product: { select: { name: true, rewardPoints: true } } } }) : null;
  if (!code) throw new NotFoundException('Scan the code first.');
  if (code.status === 'FLAGGED') throw new ForbiddenException('This code was reported as a copy, so it can’t earn points.');
  if (await prisma.traceScan.count({ where: { codeId: id!, verdict: 'SUSPECT' } })) throw new ForbiddenException('This code was also scanned far from here, so it may be a copy. Points are paused until the brand checks it.');
  const won = await prisma.traceCode.updateMany({ where: { id, claimedById: null }, data: { claimedById: user.id, claimedAt: new Date() } });
  if (!won.count) throw new BadRequestException(code.claimedById === user.id ? 'You already earned the points for this one.' : 'Someone already earned the points for this one.');
  if (code.product.rewardPoints > 0) {
    await mintImpactCredits({ userId: user.id, organizationId: code.organizationId ?? undefined, actionType: 'PRODUCT_SCAN', credits: code.product.rewardPoints, description: `Scanned ${code.product.name}`, sourceReferenceId: id }, user);
  }
  return { points: code.product.rewardPoints, balance: await getImpactCreditBalance(user.id) };
}

/** GET /api/core/trace/me: my points and the products I scanned. */
export async function mine(user: SessionUser) {
  const [balance, codes] = await Promise.all([
    getImpactCreditBalance(user.id),
    prisma.traceCode.findMany({ where: { claimedById: user.id }, orderBy: { claimedAt: 'desc' }, take: 30, select: { id: true, claimedAt: true, product: { select: { name: true, rewardPoints: true } } } }),
  ]);
  return { balance, claims: codes.map((c) => ({ code: formatCode(c.id), at: c.claimedAt, product: c.product.name, points: c.product.rewardPoints })) };
}

