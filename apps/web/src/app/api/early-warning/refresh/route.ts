import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { assessCourses } from '@/server/early-warning';
import { taughtBy } from '@/lib/course-access';
import { schoolsOf, usersIn } from '@/server/school-scope';

// Re-checks now instead of waiting for the daily run: a teacher's own courses, or for admins their
// school's published courses (all of them for the platform owner).
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const schools = user.role === 'ADMIN' ? await schoolsOf(user) : null;
  const ids = schools === 'all'
    ? undefined
    : (await prisma.course.findMany({ where: schools ? { status: 'PUBLISHED', teacher: usersIn(schools) } : taughtBy(user.id, ['CO_TEACHER']), select: { id: true } })).map((c) => c.id);
  return NextResponse.json(await assessCourses(ids));
}
