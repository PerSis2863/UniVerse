import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireFeature } from '@/lib/billing';

type MonthRow = { month: Date; value: bigint | number };

function lastTwelveMonths(rows: MonthRow[]) {
  const byKey = new Map(rows.map((r) => [r.month.toISOString().slice(0, 7), Number(r.value)]));
  const out: { month: string; value: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({ month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), value: byKey.get(key) ?? 0 });
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireFeature(req, 'advanced_analytics');
  if (auth instanceof NextResponse) return auth;

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 11, 1);
  since.setUTCHours(0, 0, 0, 0);

  const [roles, activeUsers, courses, enrollments, impactTotal, applications, signups, impact, topContributors] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.course.count(),
    prisma.enrollment.count(),
    prisma.impactPoint.aggregate({ _sum: { points: true } }),
    prisma.nGOProjectApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.$queryRaw<MonthRow[]>`
      SELECT date_trunc('month', "createdAt") AS month, COUNT(*) AS value
      FROM "users" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT date_trunc('month', "awardedAt") AS month, COALESCE(SUM("points"), 0) AS value
      FROM "impact_points" WHERE "awardedAt" >= ${since} GROUP BY 1`,
    prisma.user.findMany({
      where: { role: 'STUDENT', impactXP: { gt: 0 } },
      orderBy: { impactXP: 'desc' },
      take: 5,
      select: { id: true, name: true, impactXP: true, impactLevel: true },
    }),
  ]);

  return NextResponse.json({
    totals: {
      members: roles.reduce((n, r) => n + r._count._all, 0),
      activeMembers: activeUsers,
      courses,
      enrollments,
      impactPoints: impactTotal._sum.points ?? 0,
    },
    roles: roles.map((r) => ({ role: r.role, count: r._count._all })),
    applications: applications.map((a) => ({ status: a.status, count: a._count._all })),
    signupsByMonth: lastTwelveMonths(signups),
    impactByMonth: lastTwelveMonths(impact),
    topContributors,
  });
}
