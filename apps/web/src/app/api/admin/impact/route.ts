import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';

type MonthRow = { month: Date; value: bigint | number };

// Live impact figures for the (free) Impact Analytics page. Deeper analytics live behind
// the Pro plan at /api/premium/analytics.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 7, 1);
  since.setUTCHours(0, 0, 0, 0);

  const [students, ngos, activeProjects, impact, sectors, byMonth] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.nGO.count(),
    prisma.nGOProject.count({ where: { isActive: true } }),
    prisma.impactPoint.aggregate({ _sum: { points: true } }),
    prisma.nGO.groupBy({ by: ['sector'], _count: { _all: true } }),
    prisma.$queryRaw<MonthRow[]>`
      SELECT date_trunc('month', "awardedAt") AS month, COALESCE(SUM("points"), 0) AS value
      FROM "impact_points" WHERE "awardedAt" >= ${since} GROUP BY 1`,
  ]);

  const byKey = new Map(byMonth.map((r) => [r.month.toISOString().slice(0, 7), Number(r.value)]));
  const months: { month: string; value: number }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), value: byKey.get(d.toISOString().slice(0, 7)) ?? 0 });
  }

  return NextResponse.json({
    kpis: { students, ngos, activeProjects, impactPoints: impact._sum.points ?? 0 },
    impactByMonth: months,
    sectors: [...sectors.reduce((m, s) => m.set(s.sector || 'Other', (m.get(s.sector || 'Other') ?? 0) + s._count._all), new Map<string, number>())]
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count),
  });
}
