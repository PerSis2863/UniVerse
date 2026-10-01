import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Early-warning flags: teachers see their own courses, admins every course.
// GET ?view=open (default: open + contacted) | handled | all  &courseId=  &q=
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Only teachers and admins can see early warnings.' }, { status: 403 });
  const url = new URL(req.url);
  const view = url.searchParams.get('view') ?? 'open';
  const courseId = url.searchParams.get('courseId') || undefined;
  // ?q= narrows the list to a student (name or email) or a course (code or name).
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const search = q ? { OR: [{ student: { name: { contains: q } } }, { student: { email: { contains: q } } }, { course: { code: { contains: q } } }, { course: { name: { contains: q } } }] } : {};

  const scope = user.role === 'ADMIN' ? {} : { course: { teacherId: user.id } };
  const status = view === 'handled' ? { in: ['RESOLVED', 'DISMISSED'] } : view === 'all' ? undefined : { in: ['OPEN', 'CONTACTED'] };
  const [flags, counts, courses] = await Promise.all([
    prisma.studentRiskFlag.findMany({
      where: { ...scope, ...(courseId ? { courseId } : {}), ...(status ? { status } : {}), ...(view === 'open' ? { level: { not: 'OK' } } : {}), ...search },
      orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
      take: 200,
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true, lastSeenAt: true, studentProfile: { select: { department: true, year: true } } } },
        course: { select: { id: true, code: true, name: true, teacher: { select: { id: true, name: true, email: true } } } },
      },
    }),
    prisma.studentRiskFlag.groupBy({ by: ['status', 'level'], where: { ...scope, ...(courseId ? { courseId } : {}) }, _count: { _all: true } }),
    prisma.course.findMany({ where: user.role === 'ADMIN' ? { status: 'PUBLISHED' } : { teacherId: user.id }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, take: 200 }),
  ]);
  const count = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((n, c) => n + c._count._all, 0);
  return NextResponse.json({
    // Email and year help whoever follows up; admins also see when the student was last active and who teaches the course.
    flags: flags.map((f) => ({
      ...f,
      student: {
        id: f.student.id, name: f.student.name, email: f.student.email, avatar: f.student.avatar,
        department: f.student.studentProfile?.department ?? null, year: f.student.studentProfile?.year ?? null,
        ...(user.role === 'ADMIN' ? { lastSeenAt: f.student.lastSeenAt } : {}),
      },
      course: user.role === 'ADMIN' ? f.course : { id: f.course.id, code: f.course.code, name: f.course.name },
    })),
    summary: {
      atRisk: count((c) => (c.status === 'OPEN' || c.status === 'CONTACTED') && c.level === 'AT_RISK'),
      watch: count((c) => (c.status === 'OPEN' || c.status === 'CONTACTED') && c.level === 'WATCH'),
      contacted: count((c) => c.status === 'CONTACTED'),
      resolved: count((c) => c.status === 'RESOLVED'),
    },
    courses,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
