import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { readDpp } from '@/lib/dpp';
import { bestOf, type CompareRow } from '@/lib/trace-compare';
import { strings } from './body';

// M311: compare products side by side (Trace → Vault → Compare). A buyer picks two to four of the products
// they own or have checked (their vault and their scans), and sees each one's passport facts in a row:
// price, warranty, rating, carbon, recycled and recyclable shares, expected life, repairability, where made.

/** GET /trace/compare?ids=a,b,c: with no ids, the products I can compare; with ids, the comparison. */
export async function compareProducts(u: SessionUser, q: Record<string, unknown>) {
  const [owned, scanned] = await Promise.all([
    prisma.traceOwner.findMany({ where: { userId: u.id }, select: { productId: true }, take: 200 }),
    prisma.traceScan.findMany({ where: { userId: u.id, productId: { not: null } }, select: { productId: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const mine = [...new Set([...owned.map((o) => o.productId), ...scanned.map((s) => s.productId!)])].slice(0, 90);
  const products = mine.length ? await prisma.traceProduct.findMany({ where: { id: { in: mine } }, select: { id: true, name: true, category: true, imageUrl: true, price: true, currency: true, warrantyMonths: true, dpp: true, brandId: true } }) : [];
  const asked = [...new Set(String(q.ids ?? '').split(',').concat(strings(q.ids)).map((s) => s.trim()).filter((id) => products.some((p) => p.id === id)))].slice(0, 4);
  const choices = products.map((p) => ({ id: p.id, name: p.name, category: p.category }));
  if (asked.length < 2) return { choices, rows: [], best: {} };
  const picked = products.filter((p) => asked.includes(p.id));
  const [brands, ratings] = await Promise.all([
    prisma.traceBrand.findMany({ where: { id: { in: [...new Set(picked.map((p) => p.brandId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    prisma.traceReview.groupBy({ by: ['productId'], where: { productId: { in: asked } }, _avg: { stars: true }, _count: { _all: true } }),
  ]);
  const rows: CompareRow[] = asked.map((id) => {
    const p = picked.find((x) => x.id === id)!;
    const d = readDpp(p.dpp), r = ratings.find((x) => x.productId === id);
    return {
      id, name: p.name, brand: brands.find((b) => b.id === p.brandId)?.name ?? '', category: p.category, imageUrl: p.imageUrl,
      price: p.price, currency: p.currency, warrantyMonths: p.warrantyMonths,
      stars: r?._avg.stars != null ? Math.round(r._avg.stars * 10) / 10 : null, reviews: r?._count._all ?? 0,
      carbonKg: d.carbonKg, recycledContent: d.recycledContent, recyclable: d.recyclable, durabilityYears: d.durabilityYears, repairScore: d.repairScore, madeIn: d.madeIn,
    };
  });
  return { choices, rows, best: bestOf(rows) };
}
