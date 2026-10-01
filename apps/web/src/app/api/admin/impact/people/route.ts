import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// The people behind the impact figures (admins only): every role's head count, the students with the most
// impact XP, the teachers with their course / project counts, and the admins. ?q= narrows the lists to
// names or emails containing it. Lists are capped so the request stays light; counts say how many matched.
const LIMIT = { STUDENT: 60, TEACHER: 60, ADMIN: 30, INDUSTRY_MENTOR: 30 } as const;
const ROLES = Object.keys(LIMIT) as (keyof typeof LIMIT)[];

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Only admins can see this.' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 80) ?? '';
  const match: Prisma.UserWhereInput = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {};
  const base = { id: true, name: true, email: true, status: true, createdAt: true, lastSeenAt: true } as const;

  const [totals, matched, students, teachers, admins, mentors] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    q ? prisma.user.groupBy({ by: ['role'], where: match, _count: { _all: true } }) : null,
    prisma.user.findMany({
      where: { role: 'STUDENT', ...match },
      select: {
        ...base,
        impactXP: true,
        impactLevel: true,
        studentProfile: { select: { department: true, year: true } },
        _count: { select: { enrollments: true, projectMemberships: true, impactCertificates: { where: { status: 'ISSUED' } } } },
      },
      orderBy: [{ impactXP: 'desc' }, { name: 'asc' }],
      take: LIMIT.STUDENT,
    }),
    prisma.user.findMany({
      where: { role: 'TEACHER', ...match },
      select: {
        ...base,
        teacherProfile: { select: { department: true, designation: true } },
        _count: { select: { taughtCourses: true, teacherProjects: true } },
      },
      orderBy: { name: 'asc' },
      take: LIMIT.TEACHER,
    }),
    prisma.user.findMany({ where: { role: 'ADMIN', ...match }, select: base, orderBy: { name: 'asc' }, take: LIMIT.ADMIN }),
    prisma.user.findMany({ where: { role: 'INDUSTRY_MENTOR', ...match }, select: base, orderBy: { name: 'asc' }, take: LIMIT.INDUSTRY_MENTOR }),
  ]);

  const count = (rows: typeof totals | null, role: string) => rows?.find((r) => r.role === role)?._count._all ?? 0;
  return NextResponse.json(
    {
      q,
      roles: ROLES.map((role) => ({ role, total: count(totals, role), matched: q ? count(matched, role) : count(totals, role), limit: LIMIT[role] })),
      students: students.map(({ _count, ...s }) => ({ ...s, courses: _count.enrollments, projects: _count.projectMemberships, credentials: _count.impactCertificates })),
      teachers: teachers.map(({ _count, ...t }) => ({ ...t, courses: _count.taughtCourses, projects: _count.teacherProjects })),
      admins,
      mentors,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
