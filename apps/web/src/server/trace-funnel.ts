import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { biggestDrop, FUNNEL_DAYS, funnelSteps, type FunnelCounts } from '@/lib/trace-funnel';
import { brandOf } from './trace';
import { str } from './body';

// M307: a brand's scan funnel (Trace → Insights): of the units scanned in the last 30, 90 or 365 days,
// how many were sold in a shop (a shop claimed the code), got an owner, a warranty and a review; for
// the whole brand, one product, and the top products side by side. Counts only: never who scanned.

type Row = FunnelCounts & { productId?: string };
const N = (v: unknown) => Number(v ?? 0) || 0;
const SELECT = `COUNT(DISTINCT s.codeId) AS scanned,
  COUNT(DISTINCT CASE WHEN c.claimedAt IS NOT NULL THEN s.codeId END) AS sold,
  COUNT(DISTINCT o.codeId) AS owned, COUNT(DISTINCT w.codeId) AS warranted, COUNT(DISTINCT r.codeId) AS reviewed`;
const FROM = `FROM trace_scans s JOIN trace_codes c ON c.id = s.codeId
  LEFT JOIN trace_owners o ON o.codeId = s.codeId LEFT JOIN trace_warranties w ON w.codeId = s.codeId LEFT JOIN trace_reviews r ON r.codeId = s.codeId
  WHERE s.brandId = ? AND s.createdAt > ?`;
const counts = (r: Partial<Row> | undefined): FunnelCounts => ({ scanned: N(r?.scanned), sold: N(r?.sold), owned: N(r?.owned), warranted: N(r?.warranted), reviewed: N(r?.reviewed) });

/** GET /trace/funnel?days=30|90|365&product=<id> */
export async function scanFunnel(u: SessionUser, q: Record<string, unknown>) {
  const brand = await brandOf(u);
  const days = (FUNNEL_DAYS as readonly number[]).includes(Number(q.days)) ? Number(q.days) : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().replace('Z', '+00:00');
  const product = str(q.product)?.slice(0, 40) || null;
  const [all, byProduct, products] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`SELECT ${SELECT} ${FROM}${product ? ' AND s.productId = ?' : ''}`, ...[brand.id, since, ...(product ? [product] : [])]),
    prisma.$queryRawUnsafe<Row[]>(`SELECT s.productId AS productId, ${SELECT} ${FROM} GROUP BY s.productId ORDER BY scanned DESC LIMIT 8`, brand.id, since),
    prisma.traceProduct.findMany({ where: { brandId: brand.id }, select: { id: true, name: true }, take: 200 }),
  ]);
  const steps = funnelSteps(counts(all[0]));
  const name = (id?: string) => products.find((p) => p.id === id)?.name ?? 'A product';
  return {
    days, product, products,
    steps, drop: biggestDrop(steps)?.key ?? null,
    byProduct: byProduct.map((r) => ({ productId: r.productId, name: name(r.productId), steps: funnelSteps(counts(r)) })),
  };
}
