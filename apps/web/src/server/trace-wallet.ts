import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';

// The UniVerse Trace wallet (migration 0178): one place for a person's points with every brand. Each
// entry is chained to the person's previous one by a SHA-256 hash (like the Impact Credits ledger),
// so a balance can't be quietly changed. Points come from scans (SCAN) and campaign bonuses
// (CAMPAIGN); a cash-out request takes them out at once (CASHOUT) and gives them back if the brand
// refuses it (REFUND). The brand pays outside UniVerse and marks the request paid.

export type PointKind = 'SCAN' | 'CAMPAIGN' | 'CASHOUT' | 'REFUND';

export function pointHash(e: { userId: string; brandId: string; kind: string; points: number; balanceAfter: number; previousHash: string; at: string }) {
  return crypto.createHash('sha256').update(`${e.userId}:${e.brandId}:${e.kind}:${e.points}:${e.balanceAfter}:${e.previousHash}:${e.at}`).digest('hex');
}

/** A person's balance with one brand. */
export async function brandBalance(userId: string, brandId: string) {
  const r = await prisma.tracePoint.aggregate({ where: { userId, brandId }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

/** Adds (or, negative, takes) points with a brand, chained to the person's last entry. */
export async function award(userId: string, brandId: string, kind: PointKind, points: number, refs: { codeId?: string; campaignId?: string; cashoutId?: string; note?: string } = {}) {
  const [last, balance] = await Promise.all([
    prisma.tracePoint.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { hash: true } }),
    brandBalance(userId, brandId),
  ]);
  const balanceAfter = balance + points;
  if (balanceAfter < 0) throw new BadRequestException(`You have ${balance.toLocaleString()} points with this brand.`);
  const previousHash = last?.hash ?? 'GENESIS';
  const now = new Date();
  const hash = pointHash({ userId, brandId, kind, points, balanceAfter, previousHash, at: now.toISOString() });
  return prisma.tracePoint.create({ data: { userId, brandId, kind, points, balanceAfter, previousHash, hash, createdAt: now, ...refs } });
}

/** Checks a person's whole chain (oldest first): each entry points at the one before and its hash matches. */
export function chainIntact(entries: { userId: string; brandId: string; kind: string; points: number; balanceAfter: number; previousHash: string; hash: string; createdAt: Date }[]) {
  return entries.every((e, i) => e.previousHash === (i ? entries[i - 1].hash : 'GENESIS') && e.hash === pointHash({ ...e, at: e.createdAt.toISOString() }));
}

/** GET /trace/wallet: balances with every brand, what they're worth, history, cash-outs and live offers. */
export async function wallet(u: SessionUser) {
  const [sums, history, cashouts, chain, offers] = await Promise.all([
    prisma.tracePoint.groupBy({ by: ['brandId'], where: { userId: u.id }, _sum: { points: true } }),
    prisma.tracePoint.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, brandId: true, kind: true, points: true, note: true, createdAt: true } }),
    prisma.traceCashout.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.tracePoint.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' }, take: 2000 }),
    prisma.traceCampaign.findMany({ where: { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  const brandIds = [...new Set([...sums.map((s) => s.brandId), ...offers.map((o) => o.brandId), ...cashouts.map((c) => c.brandId)])];
  const productIds = offers.map((o) => o.productId).filter((x): x is string => !!x);
  const [brands, products] = await Promise.all([
    prisma.traceBrand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true, color: true, logoUrl: true, pointValue: true, currency: true, minCashout: true } }),
    prisma.traceProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
  ]);
  const brand = (id: string) => brands.find((b) => b.id === id);
  const balances = sums.map((s) => ({ brand: brand(s.brandId)!, points: s._sum.points ?? 0 })).filter((x) => x.brand).sort((a, b) => b.points - a.points);
  return {
    total: balances.reduce((a, b) => a + b.points, 0),
    worth: balances.map((b) => ({ currency: b.brand.currency, amount: b.points * b.brand.pointValue })).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.currency]: (acc[x.currency] ?? 0) + x.amount }), {}),
    balances,
    verified: chainIntact(chain),
    history: history.map((h) => ({ ...h, brand: brand(h.brandId)?.name ?? '' })),
    cashouts: cashouts.map((c) => ({ ...c, brand: brand(c.brandId)?.name ?? '' })),
    offers: offers.filter((o) => o.spentPoints + o.bonusPoints <= o.budgetPoints).slice(0, 12).map((o) => ({
      id: o.id, title: o.title, bonusPoints: o.bonusPoints, left: Math.floor((o.budgetPoints - o.spentPoints) / Math.max(1, o.bonusPoints)), area: o.place ?? o.country ?? 'Everywhere', endsAt: o.endsAt,
      brand: brand(o.brandId)?.name ?? '', color: brand(o.brandId)?.color ?? null, product: products.find((p) => p.id === o.productId)?.name ?? null,
    })),
  };
}

/** POST /trace/wallet/cashouts { brandId, points, payTo }: asks a brand to pay points out. */
export async function requestCashout(u: SessionUser, body: Body) {
  const brandId = str(body.brandId) ?? '';
  const brand = await prisma.traceBrand.findUnique({ where: { id: brandId } });
  if (!brand) throw new NotFoundException('Brand not found');
  const points = Math.floor(Number(body.points));
  const payTo = str(body.payTo)?.trim().slice(0, 200);
  if (!Number.isFinite(points) || points < brand.minCashout) throw new BadRequestException(`${brand.name} pays out from ${brand.minCashout.toLocaleString()} points.`);
  if (!payTo) throw new BadRequestException('Where should the money go? (Bank, UPI or PayPal details.)');
  if ((await brandBalance(u.id, brand.id)) < points) throw new BadRequestException('You don’t have that many points with this brand.');
  const cashout = await prisma.traceCashout.create({ data: { userId: u.id, brandId: brand.id, points, amount: Math.round(points * brand.pointValue * 100) / 100, currency: brand.currency, payTo } });
  await award(u.id, brand.id, 'CASHOUT', -points, { cashoutId: cashout.id, note: 'Cash-out requested' });
  return cashout;
}

/** The brand's cash-out requests (pending first). */
export async function brandCashouts(brandId: string) {
  const rows = await prisma.traceCashout.findMany({ where: { brandId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } });
  return rows.map((r) => ({ ...r, user: users.find((x) => x.id === r.userId) ?? null }));
}

/** PATCH /trace/cashouts/:id { status: PAID | REJECTED, note }: a refused request gives the points back. */
export async function decideCashout(brandId: string, actor: SessionUser, id: string, body: Body) {
  const c = await prisma.traceCashout.findUnique({ where: { id } });
  if (!c || c.brandId !== brandId) throw new NotFoundException('Request not found');
  if (c.status !== 'PENDING') throw new BadRequestException('This request was already decided.');
  if (!oneOf(['PAID', 'REJECTED'] as const, body.status)) throw new BadRequestException('Mark it paid or refused.');
  const moved = await prisma.traceCashout.updateMany({ where: { id, status: 'PENDING' }, data: { status: body.status, note: str(body.note)?.slice(0, 300) ?? null, decidedById: actor.id, decidedAt: new Date() } });
  if (!moved.count) throw new BadRequestException('This request was already decided.');
  if (body.status === 'REJECTED') await award(c.userId, c.brandId, 'REFUND', c.points, { cashoutId: c.id, note: 'Cash-out refused: points returned' });
  return { ok: true };
}
