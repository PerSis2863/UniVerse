import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { forecast, isDiverted, journeyCarbon, tierFor, toBase32, trustScore } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { brandOf, cfPosition, idOf, num, ownBatch, short } from './trace';

// UniVerse Trace, the second wave (migration 0179). On the passport: recalls the brand issued for the
// batch, a blocked (stolen) batch, an instant win on the first check, warranty registration, buyer
// reviews (one per unit, so only someone holding it can rate it) and an ownership vault with
// transfers to the next owner. For the brand: grey-market alerts (a batch scanned outside the
// countries it was sold to), recalls and blocks, the Radar (everything that needs a look) and
// Insights (a 14-day forecast, the busiest hours, each shipment's CO₂, reviews, the best shops with
// their tiers, prizes and warranties). And a public brand page with a trust score.

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;
const q = <T = Row,>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args).catch(() => [] as T[]);
const claimCode = () => toBase32(crypto.randomBytes(8), 10);

type BatchWithProduct = { id: string; brandId: string | null; productId: string; secret: string; allowedCountries: string | null; blockedAt: Date | null; product: { id: string; name: string; warrantyMonths: number; winOdds: number | null; winPrize: string | null } };

/** True when this unit wins: decided by the batch's secret, so it's fixed per unit and can't be farmed by rescanning. */
export const wins = (secret: string, codeId: string, odds: number | null) =>
  !!odds && odds >= 2 && crypto.createHmac('sha256', secret).update(`win:${codeId}`).digest().readUInt32BE(0) % odds === 0;

/** Whether a scan from this country is outside the batch's markets (stored on the scan for the Radar). */
export const divertedScan = (batch: { allowedCountries: string | null }, country: string | null | undefined) => isDiverted(batch.allowedCountries, country);

/** What the passport adds for this unit: recall, block, prize, warranty, reviews, owner. */
export async function passportExtras(batch: BatchWithProduct, codeId: string, opts: { first: boolean; genuine: boolean; place: string | null; user: SessionUser | null }) {
  const brandId = batch.brandId;
  const [recall, warranty, owner, rating, myReview, existingWin] = await Promise.all([
    prisma.traceRecall.findFirst({ where: { batchId: batch.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, select: { reason: true, advice: true, severity: true, createdAt: true } }),
    prisma.traceWarranty.findUnique({ where: { codeId }, select: { endsAt: true, name: true } }),
    prisma.traceOwner.findUnique({ where: { codeId }, select: { userId: true, owners: true, since: true } }),
    q(`SELECT AVG(stars) AS avg, COUNT(*) AS n FROM trace_reviews WHERE productId = ?`, batch.productId),
    prisma.traceReview.findUnique({ where: { codeId }, select: { stars: true, text: true } }),
    prisma.traceWin.findUnique({ where: { codeId }, select: { prize: true, redeemedAt: true } }),
  ]);
  // The first genuine check of a winning unit creates the prize and shows its claim code (only now).
  let win: { prize: string; claimCode: string | null; redeemed: boolean } | null = existingWin ? { prize: existingWin.prize, claimCode: null, redeemed: !!existingWin.redeemedAt } : null;
  if (!existingWin && opts.first && opts.genuine && !batch.blockedAt && brandId && batch.product.winPrize && wins(batch.secret, codeId, batch.product.winOdds)) {
    const created = await prisma.traceWin.create({ data: { codeId, brandId, productId: batch.productId, prize: batch.product.winPrize, claimCode: claimCode(), place: opts.place } }).catch(() => null);
    if (created) win = { prize: created.prize, claimCode: created.claimCode, redeemed: false };
  }
  const reviews = await prisma.traceReview.findMany({ where: { productId: batch.productId, text: { not: null } }, orderBy: { createdAt: 'desc' }, take: 3, select: { stars: true, text: true, place: true, createdAt: true } });
  return {
    recall, blocked: !!batch.blockedAt,
    win,
    warranty: batch.product.warrantyMonths > 0 ? { months: batch.product.warrantyMonths, registered: !!warranty, endsAt: warranty?.endsAt ?? null } : null,
    reviews: { avg: rating[0]?.n ? Math.round(N(rating[0].avg) * 10) / 10 : null, count: N(rating[0]?.n), mine: myReview, recent: reviews },
    owner: owner ? { owners: owner.owners, since: owner.since, you: !!opts.user && owner.userId === opts.user.id } : null,
  };
}

/** The unit behind a printed code (it must have been checked at least once). */
async function unit(raw: string) {
  const id = idOf(raw);
  const code = id ? await prisma.traceCode.findUnique({ where: { id }, include: { product: { select: { id: true, name: true, warrantyMonths: true } }, batch: { select: { id: true, blockedAt: true } } } }) : null;
  if (!code || !code.brandId || code.scanCount < 1) throw new NotFoundException('Scan the code first.');
  return code as typeof code & { brandId: string };
}
async function noCopy(codeId: string, status: string) {
  if (status === 'FLAGGED' || (await prisma.traceScan.count({ where: { codeId, verdict: 'SUSPECT' } }))) throw new ForbiddenException('This label may be a copy, so it can’t be used for this.');
}

/** POST /trace/scan/:code/warranty { name, email }: registers the unit's warranty (once; no account needed). */
export async function registerWarranty(raw: string, body: Body, user: SessionUser | null, req: Request) {
  const code = await unit(raw);
  if (code.product.warrantyMonths <= 0) throw new BadRequestException('This product has no warranty to register.');
  await noCopy(code.id, code.status);
  const name = short(body.name, 80) ?? user?.name ?? null, email = short(body.email, 160)?.toLowerCase() ?? user?.email ?? null;
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Your name and email, so the brand can find your warranty.');
  const endsAt = new Date(Date.now() + code.product.warrantyMonths * 30.44 * DAY);
  const { cf } = cfPosition(req);
  const made = await prisma.traceWarranty.create({ data: { codeId: code.id, brandId: code.brandId, productId: code.product.id, userId: user?.id ?? null, name, email, country: cf?.country ?? null, endsAt } }).catch(() => null);
  if (!made) throw new BadRequestException('This unit’s warranty is already registered.');
  return { endsAt: made.endsAt };
}

/** POST /trace/scan/:code/review { stars, text? }: one review per unit, from whoever holds it. */
export async function reviewUnit(raw: string, body: Body, user: SessionUser | null, req: Request) {
  const code = await unit(raw);
  await noCopy(code.id, code.status);
  const stars = num(body.stars, 1, 5);
  if (stars === null || !Number.isInteger(stars)) throw new BadRequestException('Pick 1 to 5 stars.');
  const { cf } = cfPosition(req);
  const place = [cf?.city, cf?.country].filter(Boolean).join(', ') || null;
  const made = await prisma.traceReview.create({ data: { codeId: code.id, brandId: code.brandId, productId: code.product.id, userId: user?.id ?? null, stars, text: short(body.text, 500), place, country: cf?.country ?? null } }).catch(() => null);
  if (!made) throw new BadRequestException('This unit was already reviewed.');
  return { stars: made.stars, text: made.text };
}

// ─── Ownership vault ───

/** POST /trace/scan/:code/own: puts the unit in my vault (the first owner, or nobody has it yet). */
export async function ownUnit(raw: string, user: SessionUser) {
  const code = await unit(raw);
  await noCopy(code.id, code.status);
  const has = await prisma.traceOwner.findUnique({ where: { codeId: code.id } });
  if (has) throw new BadRequestException(has.userId === user.id ? 'It’s already in your vault.' : 'Someone already owns this unit. Ask them to transfer it to you.');
  return prisma.traceOwner.create({ data: { codeId: code.id, brandId: code.brandId, productId: code.product.id, userId: user.id } });
}

/** GET /trace/vault: the things I own, with their warranty and whether a transfer is waiting. */
export async function vault(user: SessionUser) {
  const mine = await prisma.traceOwner.findMany({ where: { userId: user.id }, orderBy: { since: 'desc' }, take: 200 });
  const [products, brands, warranties] = await Promise.all([
    prisma.traceProduct.findMany({ where: { id: { in: [...new Set(mine.map((o) => o.productId))] } }, select: { id: true, name: true, imageUrl: true, category: true } }),
    prisma.traceBrand.findMany({ where: { id: { in: [...new Set(mine.map((o) => o.brandId))] } }, select: { id: true, name: true, color: true, slug: true } }),
    prisma.traceWarranty.findMany({ where: { codeId: { in: mine.map((o) => o.codeId) } }, select: { codeId: true, endsAt: true } }),
  ]);
  const now = Date.now();
  return mine.map((o) => ({
    id: o.id, code: o.codeId, since: o.since, owners: o.owners,
    product: products.find((p) => p.id === o.productId) ?? null, brand: brands.find((b) => b.id === o.brandId) ?? null,
    warrantyEnds: warranties.find((w) => w.codeId === o.codeId)?.endsAt ?? null,
    transfer: o.transferCode && o.transferUntil && o.transferUntil.getTime() > now ? { code: o.transferCode, until: o.transferUntil } : null,
  }));
}

/** POST /trace/vault/:id/transfer: a one-time code (valid 7 days) the next owner types to receive it. */
export async function startTransfer(user: SessionUser, id: string) {
  const o = await prisma.traceOwner.findUnique({ where: { id } });
  if (!o || o.userId !== user.id) throw new NotFoundException('Not in your vault.');
  const transferCode = toBase32(crypto.randomBytes(6), 8);
  await prisma.traceOwner.update({ where: { id }, data: { transferCode, transferUntil: new Date(Date.now() + 7 * DAY) } });
  return { code: transferCode };
}

/** POST /trace/vault/receive { code }: takes over a unit someone is transferring to me. */
export async function receiveTransfer(user: SessionUser, body: Body) {
  const transferCode = str(body.code)?.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  const o = transferCode ? await prisma.traceOwner.findUnique({ where: { transferCode } }) : null;
  if (!o || !o.transferUntil || o.transferUntil.getTime() < Date.now()) throw new NotFoundException('That transfer code is wrong or has expired.');
  if (o.userId === user.id) throw new BadRequestException('You already own it.');
  const moved = await prisma.traceOwner.updateMany({ where: { id: o.id, transferCode }, data: { userId: user.id, owners: o.owners + 1, since: new Date(), transferCode: null, transferUntil: null } });
  if (!moved.count) throw new BadRequestException('Someone else just received it.');
  return { ok: true };
}

// ─── The brand's controls ───

/** POST /trace/batches/:id/recall { reason, advice?, severity }: every passport of the batch shows it. */
export async function recallBatch(u: SessionUser, batchId: string, body: Body) {
  const brand = await brandOf(u);
  await ownBatch(brand, batchId);
  const reason = short(body.reason, 300);
  if (!reason) throw new BadRequestException('Say why it’s recalled, in words a buyer understands.');
  const severity = oneOf(['MEDIUM', 'HIGH', 'CRITICAL'] as const, body.severity) ? body.severity : 'HIGH';
  await prisma.traceRecall.updateMany({ where: { batchId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
  return prisma.traceRecall.create({ data: { brandId: brand.id, batchId, reason, advice: short(body.advice, 500), severity, createdById: u.id } });
}

/** POST /trace/recalls/:id/end */
export async function endRecall(u: SessionUser, id: string) {
  const brand = await brandOf(u);
  const r = await prisma.traceRecall.findUnique({ where: { id } });
  if (!r || r.brandId !== brand.id) throw new NotFoundException('Recall not found');
  await prisma.traceRecall.update({ where: { id }, data: { status: 'ENDED', endedAt: new Date() } });
  return { ok: true };
}

/** PATCH /trace/batches/:id { allowedCountries?, blocked? }: where it may be sold, and blocking a stolen batch. */
export async function protectBatch(u: SessionUser, batchId: string, body: Body) {
  const brand = await brandOf(u);
  await ownBatch(brand, batchId);
  const data: { allowedCountries?: string | null; blockedAt?: Date | null } = {};
  if ('allowedCountries' in body) {
    const list = [...new Set((str(body.allowedCountries) ?? '').toUpperCase().split(/[\s,;]+/).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 60);
    data.allowedCountries = list.length ? list.join(',') : null;
  }
  if ('blocked' in body) data.blockedAt = body.blocked === true ? new Date() : null;
  return prisma.traceBatch.update({ where: { id: batchId }, data, select: { id: true, allowedCountries: true, blockedAt: true } });
}

/** POST /trace/wins/:claimCode/redeem: the brand (or its shop) hands over a prize. */
export async function redeemWin(u: SessionUser, raw: string) {
  const brand = await brandOf(u);
  const code = raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  const w = await prisma.traceWin.findUnique({ where: { claimCode: code } });
  if (!w || w.brandId !== brand.id) throw new NotFoundException('No prize of yours has that code.');
  if (w.redeemedAt) throw new BadRequestException(`Already handed over on ${w.redeemedAt.toLocaleDateString()}.`);
  await prisma.traceWin.update({ where: { id: w.id }, data: { redeemedAt: new Date() } });
  return { prize: w.prize };
}

/** GET /trace/radar: everything that needs a look, newest first. */
export async function radar(u: SessionUser) {
  const brand = await brandOf(u);
  const since = new Date(Date.now() - 30 * DAY);
  const [suspect, diverted, blocked, recalls, flagged, cold] = await Promise.all([
    prisma.traceScan.findMany({ where: { brandId: brand.id, verdict: 'SUSPECT', createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, codeId: true, place: true, country: true, createdAt: true, productId: true } }),
    prisma.traceScan.findMany({ where: { brandId: brand.id, diverted: true, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, codeId: true, place: true, country: true, createdAt: true, productId: true } }),
    prisma.traceBatch.findMany({ where: { brandId: brand.id, blockedAt: { not: null } }, select: { id: true, label: true, blockedAt: true, product: { select: { name: true } } } }),
    prisma.traceRecall.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.traceCode.count({ where: { brandId: brand.id, status: 'FLAGGED' } }),
    q(`SELECT p.batchId AS batchId, MAX(p.tempC) AS maxT, COUNT(*) AS n, MAX(p.createdAt) AS last, pr.maxTempC AS limitT, b.label AS label, pr.name AS product
       FROM trace_pings p JOIN trace_batches b ON b.id = p.batchId JOIN trace_products pr ON pr.id = b.productId
       WHERE p.brandId = ? AND p.tempC IS NOT NULL AND pr.maxTempC IS NOT NULL AND p.tempC > pr.maxTempC AND p.createdAt > ?
       GROUP BY p.batchId ORDER BY last DESC LIMIT 30`, brand.id, iso(since.getTime())),
  ]);
  const productIds = [...new Set([...suspect, ...diverted].map((s) => s.productId).filter((x): x is string => !!x))];
  const batchIds = [...new Set(recalls.map((r) => r.batchId))];
  const [products, batches] = await Promise.all([
    prisma.traceProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
    prisma.traceBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, label: true, product: { select: { name: true } } } }),
  ]);
  const pname = (id: string | null) => products.find((p) => p.id === id)?.name ?? 'A product';
  const scanRow = (s: (typeof suspect)[number]) => ({ id: s.id, code: s.codeId, place: s.place, country: s.country, at: s.createdAt, product: pname(s.productId) });
  return {
    counts: { suspect: suspect.length, diverted: diverted.length, blocked: blocked.length, recalls: recalls.filter((r) => r.status === 'ACTIVE').length, flagged, cold: cold.length },
    suspect: suspect.map(scanRow), diverted: diverted.map(scanRow),
    blocked: blocked.map((b) => ({ id: b.id, label: b.label, product: b.product.name, at: b.blockedAt })),
    recalls: recalls.map((r) => { const b = batches.find((x) => x.id === r.batchId); return { id: r.id, batchId: r.batchId, batch: b?.label ?? 'A batch', product: b?.product.name ?? '', reason: r.reason, advice: r.advice, severity: r.severity, status: r.status, at: r.createdAt, endedAt: r.endedAt }; }),
    cold: cold.map((c) => ({ batchId: c.batchId as string, label: c.label as string, product: c.product as string, maxT: N(c.maxT), limit: N(c.limitT), readings: N(c.n), last: c.last as string })),
  };
}

/** GET /trace/insights: forecast, busiest hours, CO₂ per shipment, reviews, best shops, prizes, warranties, trust. */
export async function insights(u: SessionUser) {
  const brand = await brandOf(u);
  const now = Date.now(), since60 = iso(now - 60 * DAY), since90 = iso(now - 90 * DAY);
  const [perDay, heat, batches, ratings, recentReviews, shops, winRows, warranties, genuine, recallRows] = await Promise.all([
    q(`SELECT substr(createdAt, 1, 10) AS d, COUNT(*) AS n FROM trace_scans WHERE brandId = ? AND createdAt > ? GROUP BY 1`, brand.id, since60),
    q(`SELECT CAST(strftime('%w', createdAt) AS INTEGER) AS wd, CAST(strftime('%H', createdAt) AS INTEGER) AS h, COUNT(*) AS n FROM trace_scans WHERE brandId = ? AND createdAt > ? GROUP BY 1, 2`, brand.id, since60),
    prisma.traceBatch.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, label: true, quantity: true, product: { select: { name: true, weightKg: true } }, events: { orderBy: { createdAt: 'asc' }, select: { place: true, lat: true, lng: true } } } }),
    q(`SELECT stars, COUNT(*) AS n FROM trace_reviews WHERE brandId = ? GROUP BY stars`, brand.id),
    prisma.traceReview.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, stars: true, text: true, place: true, createdAt: true, productId: true } }),
    q(`SELECT u.id AS id, u.name AS name, COUNT(*) AS sales FROM trace_codes c JOIN users u ON u.id = c.claimedById WHERE c.brandId = ? AND c.claimedAt > ? GROUP BY u.id ORDER BY sales DESC LIMIT 10`, brand.id, since90),
    prisma.traceWin.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, prize: true, claimCode: true, place: true, redeemedAt: true, createdAt: true } }),
    q(`SELECT COUNT(*) AS n, SUM(CASE WHEN endsAt > ? THEN 1 ELSE 0 END) AS active FROM trace_warranties WHERE brandId = ?`, iso(now), brand.id),
    q(`SELECT COUNT(*) AS n, SUM(CASE WHEN verdict = 'SUSPECT' THEN 1 ELSE 0 END) AS s FROM trace_scans WHERE brandId = ? AND createdAt > ?`, brand.id, since90),
    q(`SELECT COUNT(*) AS n, SUM(CASE WHEN advice IS NOT NULL THEN 1 ELSE 0 END) AS a FROM trace_recalls WHERE brandId = ?`, brand.id),
  ]);
  const days = Array.from({ length: 60 }, (_, i) => iso(now - (59 - i) * DAY).slice(0, 10));
  const series = days.map((d) => N(perDay.find((r) => r.d === d)?.n));
  const grid = Array.from({ length: 7 }, (_, wd) => Array.from({ length: 24 }, (_, h) => N(heat.find((r) => N(r.wd) === wd && N(r.h) === h)?.n)));
  const best = grid.flatMap((row, wd) => row.map((n, h) => ({ wd, h, n }))).sort((a, b) => b.n - a.n).slice(0, 3);
  const stars = [1, 2, 3, 4, 5].map((s) => N(ratings.find((r) => N(r.stars) === s)?.n));
  const reviewCount = stars.reduce((a, b) => a + b, 0);
  const avg = reviewCount ? Math.round((stars.reduce((a, n, i) => a + n * (i + 1), 0) / reviewCount) * 10) / 10 : null;
  const products = await prisma.traceProduct.findMany({ where: { brandId: brand.id }, select: { id: true, name: true } });
  const total = N(genuine[0]?.n), suspect = N(genuine[0]?.s);
  const genuinePct = total ? ((total - suspect) / total) * 100 : 100;
  const carbon = batches.map((b) => { const c = journeyCarbon(b.events, b.product.weightKg * b.quantity); return { id: b.id, label: b.label, product: b.product.name, stops: b.events.length, km: c.km, kg: c.kg, perUnitG: b.quantity ? Math.round((c.kg / b.quantity) * 1000 * 10) / 10 : 0 }; }).filter((b) => b.stops > 1);
  return {
    forecast: { days, series, next: forecast(series, 14) },
    heat: grid, best,
    carbon: { batches: carbon, kg: Math.round(carbon.reduce((a, b) => a + b.kg, 0) * 10) / 10 },
    reviews: { avg, count: reviewCount, stars, recent: recentReviews.map((r) => ({ ...r, product: products.find((p) => p.id === r.productId)?.name ?? '' })) },
    shops: shops.map((s, i) => ({ rank: i + 1, name: String(s.name ?? 'A shop'), sales: N(s.sales), tier: tierFor(N(s.sales)) })),
    wins: { list: winRows, total: winRows.length, redeemed: winRows.filter((w) => w.redeemedAt).length },
    warranties: { total: N(warranties[0]?.n), active: N(warranties[0]?.active) },
    trust: { score: trustScore({ genuinePct, rating: avg, recalls: N(recallRows[0]?.n), recallsWithAdvice: N(recallRows[0]?.a) }), genuinePct: Math.round(genuinePct * 10) / 10 },
  };
}

/** GET /trace/public/:slug (no sign-in): the brand's public page and trust score. */
export async function publicBrand(slug: string) {
  const brand = await prisma.traceBrand.findUnique({ where: { slug: slug.toLowerCase() }, select: { id: true, name: true, slug: true, category: true, color: true, logoUrl: true, plan: true, createdAt: true } });
  if (!brand) throw new NotFoundException('No brand has that page.');
  const since = iso(Date.now() - 90 * DAY);
  const [products, scans, countries, ratings, reviews, recalls] = await Promise.all([
    prisma.traceProduct.findMany({ where: { brandId: brand.id, sample: false }, select: { id: true, name: true, category: true, description: true, imageUrl: true, warrantyMonths: true }, take: 40 }),
    q(`SELECT COUNT(*) AS n, SUM(CASE WHEN verdict = 'SUSPECT' THEN 1 ELSE 0 END) AS s FROM trace_scans WHERE brandId = ? AND createdAt > ?`, brand.id, since),
    q(`SELECT COUNT(DISTINCT country) AS n FROM trace_scans WHERE brandId = ? AND country IS NOT NULL`, brand.id),
    q(`SELECT productId, AVG(stars) AS avg, COUNT(*) AS n FROM trace_reviews WHERE brandId = ? GROUP BY productId`, brand.id),
    prisma.traceReview.findMany({ where: { brandId: brand.id, text: { not: null } }, orderBy: { createdAt: 'desc' }, take: 6, select: { stars: true, text: true, place: true, createdAt: true } }),
    prisma.traceRecall.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: 'desc' }, take: 10, select: { reason: true, advice: true, severity: true, status: true, createdAt: true, endedAt: true } }),
  ]);
  const total = N(scans[0]?.n), suspect = N(scans[0]?.s), genuinePct = total ? ((total - suspect) / total) * 100 : 100;
  const count = ratings.reduce((a, r) => a + N(r.n), 0);
  const avg = count ? Math.round((ratings.reduce((a, r) => a + N(r.avg) * N(r.n), 0) / count) * 10) / 10 : null;
  return {
    brand: { name: brand.name, slug: brand.slug, category: brand.category, color: brand.color, logoUrl: brand.logoUrl, pro: brand.plan === 'PRO', since: brand.createdAt },
    trust: { score: trustScore({ genuinePct, rating: avg, recalls: recalls.length, recallsWithAdvice: recalls.filter((r) => r.advice).length }), genuinePct: Math.round(genuinePct * 10) / 10, checks: total, countries: N(countries[0]?.n), rating: avg, reviews: count },
    products: products.map((p) => { const r = ratings.find((x) => x.productId === p.id); return { ...p, rating: r ? Math.round(N(r.avg) * 10) / 10 : null, reviews: N(r?.n) }; }),
    reviews, recalls,
  };
}

/** A shop's tier with a brand (verified sales in 90 days) and the points multiplier it gives. */
export async function shopTier(userId: string, brandId: string) {
  const sales = await prisma.traceCode.count({ where: { brandId, claimedById: userId, claimedAt: { gt: new Date(Date.now() - 90 * DAY) } } });
  return tierFor(sales);
}
