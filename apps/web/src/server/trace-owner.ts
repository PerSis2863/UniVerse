import prisma from '@/lib/db';

// The owner console's "Business" section (UniVerse Trace across every brand): how big the network
// is, what it earns (PRO plans and campaign fees), scans and likely copies per day, the busiest
// brands, countries and categories, and what needs the owner (cash-outs waiting, active recalls).

type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
const DAY = 86_400_000;
/** What a PRO brand pays a month (euros): an estimate for the console until plans are billed. */
export const PRO_MONTHLY = 49;

export async function ownerTrace() {
  const now = Date.now(), since = iso(now - 30 * DAY);
  const q = <T = Row>(sql: string, ...args: unknown[]) => prisma.$queryRawUnsafe<T[]>(sql, ...args).catch(() => [] as T[]);
  const [brands, plans, units, scans30, perDay, topBrands, countries, categories, fees, cashouts, recalls, newest, points] = await Promise.all([
    prisma.traceBrand.count(),
    q(`SELECT plan, COUNT(*) AS n FROM trace_brands GROUP BY plan`),
    q(`SELECT COALESCE(SUM(quantity), 0) AS n FROM trace_batches`),
    q(`SELECT COUNT(*) AS n, SUM(CASE WHEN verdict = 'SUSPECT' THEN 1 ELSE 0 END) AS s, COUNT(DISTINCT country) AS c FROM trace_scans WHERE createdAt > ?`, since),
    q(`SELECT substr(createdAt, 1, 10) AS d, COUNT(*) AS n, SUM(CASE WHEN verdict = 'SUSPECT' THEN 1 ELSE 0 END) AS s FROM trace_scans WHERE createdAt > ? GROUP BY d`, since),
    q(`SELECT b.id, b.name, b.plan, b.color, b.category, COUNT(s.id) AS n, SUM(CASE WHEN s.verdict = 'SUSPECT' THEN 1 ELSE 0 END) AS s
       FROM trace_brands b LEFT JOIN trace_scans s ON s.brandId = b.id AND s.createdAt > ? GROUP BY b.id ORDER BY n DESC LIMIT 12`, since),
    q(`SELECT country, COUNT(*) AS n FROM trace_scans WHERE createdAt > ? AND country IS NOT NULL GROUP BY country ORDER BY n DESC LIMIT 10`, since),
    q(`SELECT COALESCE(category, 'other') AS category, COUNT(*) AS n FROM trace_scans WHERE createdAt > ? GROUP BY category ORDER BY n DESC LIMIT 8`, since),
    q(`SELECT COALESCE(SUM(scans * feeCents), 0) AS cents, COUNT(*) AS n, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active FROM trace_campaigns`),
    q(`SELECT status, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount FROM trace_cashouts GROUP BY status`),
    q(`SELECT r.id, r.reason, r.severity, r.createdAt, b.name AS brand FROM trace_recalls r JOIN trace_brands b ON b.id = r.brandId WHERE r.status = 'ACTIVE' ORDER BY r.createdAt DESC LIMIT 8`),
    prisma.traceBrand.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, name: true, plan: true, category: true, color: true, createdAt: true } }),
    q(`SELECT COALESCE(SUM(points), 0) AS n FROM trace_points WHERE points > 0`),
  ]);
  const days = Array.from({ length: 30 }, (_, i) => iso(now - (29 - i) * DAY).slice(0, 10));
  const pro = N(plans.find((p) => p.plan === 'PRO')?.n);
  const cash = (s: string) => cashouts.find((c) => c.status === s);
  return {
    brands, pro, free: brands - pro, units: N(units[0]?.n),
    scans: N(scans30[0]?.n), suspect: N(scans30[0]?.s), countryCount: N(scans30[0]?.c), points: N(points[0]?.n),
    revenue: { mrr: pro * PRO_MONTHLY, fees: N(fees[0]?.cents) / 100, campaigns: N(fees[0]?.n), activeCampaigns: N(fees[0]?.active) },
    cashouts: { pending: N(cash('PENDING')?.n), pendingAmount: N(cash('PENDING')?.amount), paid: N(cash('PAID')?.n), paidAmount: N(cash('PAID')?.amount) },
    perDay: days.map((d) => { const r = perDay.find((x) => x.d === d); return { day: d, scans: N(r?.n), suspect: N(r?.s) }; }),
    topBrands: topBrands.map((b) => ({ id: b.id as string, name: b.name as string, plan: b.plan as string, color: b.color as string | null, category: b.category as string | null, scans: N(b.n), suspect: N(b.s) })),
    countries: countries.map((c) => ({ country: c.country as string, scans: N(c.n) })),
    categories: categories.map((c) => ({ category: c.category as string, scans: N(c.n) })),
    recalls: recalls.map((r) => ({ id: r.id as string, reason: r.reason as string, severity: r.severity as string, brand: r.brand as string, createdAt: r.createdAt as string })),
    newest,
  };
}
