import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { HIDE_AT_REPORTS, SWAP_CATEGORIES, SWAP_DAYS, SWAP_KINDS, type SwapKind } from '@/lib/green-swap';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, text, type Body } from './body';
import { shortName } from './play';

// M320: a swap and repair board for neighbours (Green → Swap & repair). Posts live in the poster's 0.1°
// neighbourhood (M318) and show there and in the eight squares around it; open ones for 30 days. Only the
// poster's first name shows; people reach each other by a UniVerse message (the app's own chats), never a
// phone or address. Three reports hide a post. Kept in use (swapped, lent, repaired) counts for the area.

const MAX_OPEN = 10;
const DAY = 86_400_000;
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

async function myArea(u: SessionUser) {
  const h = await prisma.greenHome.findUnique({ where: { userId: u.id }, select: { areaLat: true, areaLng: true } });
  return h?.areaLat != null && h.areaLng != null ? { lat: h.areaLat, lng: h.areaLng } : null;
}

/** GET /green/swaps?kind=&category= */
export async function greenSwaps(u: SessionUser, q: Record<string, unknown>) {
  const area = await myArea(u);
  if (!area) return { area: null, posts: [], kept: 0 };
  const near = { areaLat: { gte: area.lat - 0.101, lte: area.lat + 0.101 }, areaLng: { gte: area.lng - 0.101, lte: area.lng + 0.101 } };
  const since = new Date(Date.now() - SWAP_DAYS * DAY);
  const [rows, kept, reported] = await Promise.all([
    prisma.greenSwap.findMany({
      where: { ...near, OR: [{ status: 'OPEN', createdAt: { gte: since }, reports: { lt: HIDE_AT_REPORTS } }, { userId: u.id, createdAt: { gte: since } }], ...(oneOf(Object.keys(SWAP_KINDS) as SwapKind[], q.kind) ? { kind: q.kind } : {}), ...(typeof q.category === 'string' && q.category in SWAP_CATEGORIES ? { category: q.category } : {}) },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
    prisma.greenSwap.count({ where: { ...near, status: 'DONE', doneAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    prisma.greenSwapReport.findMany({ where: { userId: u.id }, select: { swapId: true }, take: 500 }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))].slice(0, 90) } }, select: { id: true, name: true } });
  const mineReported = new Set(reported.map((r) => r.swapId));
  return {
    area, kept,
    posts: rows.map((r) => ({ id: r.id, kind: r.kind, category: r.category, title: r.title, details: r.details, status: r.status, createdAt: r.createdAt, mine: r.userId === u.id, by: r.userId === u.id ? 'You' : shortName(people.find((p) => p.id === r.userId)?.name), userId: r.userId === u.id ? null : r.userId, reported: mineReported.has(r.id), here: r.areaLat === area.lat && r.areaLng === area.lng })),
  };
}

/** POST /green/swaps { kind, category, title, details? } */
export async function addSwap(u: SessionUser, b: Body) {
  const area = await myArea(u);
  if (!area) throw new ForbiddenException('Choose your neighbourhood first (Green → My impact).');
  if (!oneOf(Object.keys(SWAP_KINDS) as SwapKind[], b.kind)) throw new BadRequestException('Say whether you give, swap, lend, look for or repair.');
  const title = clip(b.title, 100);
  if (title.length < 3) throw new BadRequestException('Say what it is in a few words.');
  if ((await prisma.greenSwap.count({ where: { userId: u.id, status: 'OPEN' } })) >= MAX_OPEN) throw new BadRequestException(`You have ${MAX_OPEN} open posts: close some first.`);
  const category = typeof b.category === 'string' && b.category in SWAP_CATEGORIES ? b.category : 'other';
  await prisma.greenSwap.create({ data: { userId: u.id, kind: b.kind, category, title, details: text(b.details).trim().slice(0, 600) || null, areaLat: area.lat, areaLng: area.lng } });
  return greenSwaps(u, {});
}

async function own(u: SessionUser, id: string) {
  const s = await prisma.greenSwap.findUnique({ where: { id }, select: { userId: true } });
  if (!s) throw new NotFoundException('That post is gone.');
  if (s.userId !== u.id) throw new ForbiddenException('That post isn’t yours.');
}

/** POST /green/swaps/:id/done: swapped, given, lent or repaired. */
export async function doneSwap(u: SessionUser, id: string) {
  await own(u, id);
  await prisma.greenSwap.update({ where: { id }, data: { status: 'DONE', doneAt: new Date() } });
  return greenSwaps(u, {});
}

/** DELETE /green/swaps/:id */
export async function removeSwap(u: SessionUser, id: string) {
  await own(u, id);
  await prisma.greenSwap.delete({ where: { id } });
  return greenSwaps(u, {});
}

/** POST /green/swaps/:id/report: once a person; three hide it. */
export async function reportSwap(u: SessionUser, id: string) {
  const s = await prisma.greenSwap.findUnique({ where: { id }, select: { userId: true } });
  if (!s) throw new NotFoundException('That post is gone.');
  if (s.userId === u.id) throw new BadRequestException('That’s your own post.');
  const made = await prisma.greenSwapReport.create({ data: { swapId: id, userId: u.id } }).catch(() => null);
  if (made) await prisma.greenSwap.update({ where: { id }, data: { reports: { increment: 1 } } });
  return { ok: true };
}
