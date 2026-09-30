import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Early-warning flags: teachers see their own courses, admins every course.
// GET ?view=open (default: open + contacted) | handled | all  &courseId=
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Only teachers and admins can see early warnings.' }, { status: 403 });
  const url = new URL(req.url);
  const view = url.searchParams.get('view') ?? 'open';
  const courseId = url.searchParams.get('courseId') || undefined;

  const scope = user.role === 'ADMIN' ? {} : { course: { teacherId: user.id } };
  const status = view === 'handled' ? { in: ['RESOLVED', 'DISMISSED'] } : view === 'all' ? undefined : { in: ['OPEN', 'CONTACTED'] };
  const [flags, counts, courses] = await Promise.all([
    prisma.studentRiskFlag.findMany({
      where: { ...scope, ...(courseId ? { courseId } : {}), ...(status ? { status } : {}), ...(view === 'open' ? { level: { not: 'OK' } } : {}) },
      orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
      take: 200,
      include: {
        student: { select: { id: true, name: true, avatar: true, studentProfile: { select: { department: true } } } },
        course: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.studentRiskFlag.groupBy({ by: ['status', 'level'], where: { ...scope, ...(courseId ? { courseId } : {}) }, _count: { _all: true } }),
    prisma.course.findMany({ where: user.role === 'ADMIN' ? { status: 'PUBLISHED' } : { teacherId: user.id }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 200 }),
  ]);
  const count = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((n, c) => n + c._count._all, 0);
  return NextResponse.json({
    flags: flags.map((f) => ({ ...f, student: { id: f.student.id, name: f.student.name, avatar: f.student.avatar, department: f.student.studentProfile?.department ?? null } })),
    summary: {
      atRisk: count((c) => (c.status === 'OPEN' || c.status === 'CONTACTED') && c.level === 'AT_RISK'),
      watch: count((c) => (c.status === 'OPEN' || c.status === 'CONTACTED') && c.level === 'WATCH'),
      contacted: count((c) => c.status === 'CONTACTED'),
      resolved: count((c) => c.status === 'RESOLVED'),
    },
    courses,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
