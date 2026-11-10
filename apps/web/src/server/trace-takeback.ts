import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { co2For } from '@/lib/green';
import { formatCode, toBase32 } from '@/lib/trace';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { notify } from './email';
import { brandOf, idOf } from './trace';
import { noCopy } from './trace-plus';
import { award } from './trace-wallet';

// M146: Trace take-back and recycling (the owner, 10 Nov 2026). A brand offers it per product
// (trace_products.takeBackHow, takeBackPoints); a unit's owner asks to return it and gets a drop-off
// code; the brand marks it received, which pays the points (the wallet's chain, kind TAKEBACK) and
// records a "recycled" action in Green, confirmed by whoever received it. One per unit.

interface Row { status: string; dropCode: string; userId: string; createdAt: Date; receivedAt: Date | null }

/** What the passport says about taking it back: the offer, and the unit's take-back if there is one (its code only to its owner). */
export function takeBackView(product: { takeBackHow: string | null; takeBackPoints: number }, row: Row | null, userId: string | null) {
  if (!product.takeBackHow && !row) return null;
  const yours = !!row && !!userId && row.userId === userId;
  return { how: product.takeBackHow, points: product.takeBackPoints, status: row?.status ?? null, at: row?.receivedAt ?? row?.createdAt ?? null, yours, dropCode: yours ? row!.dropCode : null };
}

/** POST /trace/scan/:code/takeback: its owner asks to return it for recycling and gets a drop-off code. */
export async function askTakeBack(raw: string, user: SessionUser) {
  const id = idOf(raw);
  const code = id ? await prisma.traceCode.findUnique({ where: { id }, include: { product: { select: { takeBackHow: true, takeBackPoints: true } } } }) : null;
  if (!code?.brandId || code.scanCount < 1) throw new NotFoundException('Scan the code first.');
  if (!code.product.takeBackHow) throw new BadRequestException('The brand doesn’t take this one back yet.');
  await noCopy(code.id, code.status);
  const owner = await prisma.traceOwner.findUnique({ where: { codeId: code.id }, select: { userId: true } });
  if (owner?.userId !== user.id) throw new ForbiddenException('Add it to your vault first: only its owner can return it.');
  const row = await prisma.traceTakeback.create({
    data: { codeId: code.id, brandId: code.brandId, productId: code.productId, userId: user.id, dropCode: toBase32(crypto.randomBytes(5), 6), points: code.product.takeBackPoints },
  }).catch(() => null);
  if (!row) throw new BadRequestException('It’s already on its way back.');
  return takeBackView({ takeBackHow: code.product.takeBackHow, takeBackPoints: code.product.takeBackPoints }, row, user.id);
}

/** GET /trace/takebacks: the brand's take-backs, waiting ones first (the newest 100). */
export async function brandTakebacks(u: SessionUser) {
  const b = await brandOf(u);
  const rows = await prisma.traceTakeback.findMany({ where: { brandId: b.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100 });
  const ids = [...new Set(rows.map((r) => r.productId))];
  const names = new Map((ids.length ? await prisma.traceProduct.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((p) => [p.id, p.name]));
  return rows.map((r) => ({ id: r.id, code: formatCode(r.codeId), product: names.get(r.productId) ?? '', status: r.status, dropCode: r.dropCode, points: r.points, createdAt: r.createdAt, receivedAt: r.receivedAt }));
}

/** POST /trace/takebacks/:id/receive: the brand has it: the owner's points, a confirmed recycling action in Green, a note to them. */
export async function receiveTakeBack(u: SessionUser, id: string) {
  const b = await brandOf(u);
  const row = await prisma.traceTakeback.findFirst({ where: { id, brandId: b.id } });
  if (!row) throw new NotFoundException('No such take-back.');
  // Only the first "received" goes on (D1 has no transactions: a guarded update claims it).
  const claimed = await prisma.traceTakeback.updateMany({ where: { id, status: 'ASKED' }, data: { status: 'RECEIVED', receivedById: u.id, receivedAt: new Date() } });
  if (!claimed.count) throw new BadRequestException('It’s already marked as received.');
  const product = await prisma.traceProduct.findUnique({ where: { id: row.productId }, select: { name: true, weightKg: true } });
  const what = product?.name ?? 'a product';
  const kg = Math.min(1000, Math.max(0.1, Math.round((product?.weightKg ?? 1) * 10) / 10));
  await Promise.all([
    row.points > 0 ? award(row.userId, b.id, 'TAKEBACK', row.points, { codeId: row.codeId, note: `Returned ${what} for recycling` }) : null,
    prisma.greenAction.create({ data: { userId: row.userId, kind: 'RECYCLE', amount: kg, co2Kg: co2For('RECYCLE', kg), note: `Returned ${what} to ${b.name} for recycling`, verifiedBy: u.id, verifiedAt: new Date() } }),
    notify(row.userId, { title: `${b.name} received your ${what}`, body: `Thank you for returning it for recycling${row.points > 0 ? `: ${row.points} points are in your wallet` : ''}. It also counts as a recycling action in Green.`, link: row.points > 0 ? '/trace/wallet' : '/green', email: false }),
  ]);
  return { ok: true };
}
