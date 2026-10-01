import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { byMonth } from '@/lib/month-buckets';
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

  // Contact details shown for every person listed on the page.
  const person = { id: true, name: true, email: true, status: true, phone: true, lastSeenAt: true, createdAt: true } as const;

  const [roles, activeUsers, courses, enrollments, impactTotal, applications, signups, impact, topContributors, roleStatus, admins, teachers, topStudents] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.course.count(),
    prisma.enrollment.count(),
    prisma.impactPoint.aggregate({ _sum: { points: true } }),
    prisma.nGOProjectApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user
      .findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })
      .then((rows) => byMonth(rows, (r) => r.createdAt)),
    prisma.impactPoint
      .findMany({ where: { awardedAt: { gte: since } }, select: { awardedAt: true, points: true } })
      .then((rows) => byMonth(rows, (r) => r.awardedAt, (r) => r.points)),
    prisma.user.findMany({
      where: { role: 'STUDENT', impactXP: { gt: 0 } },
      orderBy: { impactXP: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, impactXP: true, impactLevel: true },
    }),
    // Per-role breakdown by account status (active / pending / suspended).
    prisma.user.groupBy({ by: ['role', 'status'], _count: { _all: true } }),
    prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, take: 100, select: person }),
    prisma.user.findMany({
      where: { role: 'TEACHER' },
      orderBy: { name: 'asc' },
      take: 200,
      select: {
        ...person,
        teacherProfile: { select: { department: true, designation: true } },
        taughtCourses: { take: 50, select: { code: true, status: true, _count: { select: { enrollments: true } } } },
      },
    }),
    // Top students by GPA (only students with a recorded GPA).
    prisma.studentProfile.findMany({
      where: { gpa: { gt: 0 }, user: { role: 'STUDENT' } },
      orderBy: [{ gpa: 'desc' }, { year: 'desc' }],
      take: 25,
      select: {
        gpa: true, year: true, department: true,
        user: { select: { ...person, impactXP: true, impactLevel: true, _count: { select: { enrollments: true } } } },
      },
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
    roleStatus: roleStatus.map((r) => ({ role: r.role, status: r.status, count: r._count._all })),
    admins,
    teachers: teachers.map(({ taughtCourses, teacherProfile, ...t }) => ({
      ...t,
      department: teacherProfile?.department ?? null,
      designation: teacherProfile?.designation ?? null,
      courses: taughtCourses.length,
      publishedCourses: taughtCourses.filter((c) => c.status === 'PUBLISHED').length,
      courseCodes: taughtCourses.map((c) => c.code),
      students: taughtCourses.reduce((n, c) => n + c._count.enrollments, 0),
    })),
    topStudents: topStudents.map(({ user, ...p }) => ({
      id: user.id, name: user.name, email: user.email, status: user.status, phone: user.phone,
      lastSeenAt: user.lastSeenAt, createdAt: user.createdAt,
      gpa: p.gpa, year: p.year, department: p.department,
      impactXP: user.impactXP, impactLevel: user.impactLevel, enrollments: user._count.enrollments,
    })),
  });
}
