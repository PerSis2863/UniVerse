import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { tierFor } from '@/lib/trace';

// M310: a new shop's setup guide (Trace → Wallet): what the shop has really done so far, in four counts.
// Shown to shops (a brand's SHOP in its network) and to anyone who has checked a sale; others see a
// short "Run a shop?" entry. The counter sign is ticked on the device (src/lib/shop-guide.ts).

/** GET /trace/shop-guide */
export async function shopGuide(u: SessionUser) {
  const [roles, stops, sales, points] = await Promise.all([
    prisma.traceHandler.findMany({ where: { userId: u.id, role: 'SHOP' }, select: { brandId: true }, take: 20 }),
    prisma.traceEvent.count({ where: { actorId: u.id, stage: 'SHOP' } }),
    prisma.traceCode.count({ where: { claimedById: u.id } }),
    prisma.tracePoint.count({ where: { userId: u.id } }),
  ]);
  const recent = await prisma.traceCode.count({ where: { claimedById: u.id, claimedAt: { gt: new Date(Date.now() - 90 * 86_400_000) } } });
  return { shop: roles.length > 0 || sales > 0, brands: roles.length, stops, sales, points, tier: tierFor(recent) };
}
