import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { assessCourses } from '@/server/early-warning';

// Re-checks now instead of waiting for the daily run: a teacher's own courses, or all for admins.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const ids = user.role === 'ADMIN' ? undefined : (await prisma.course.findMany({ where: { teacherId: user.id }, select: { id: true } })).map((c) => c.id);
  return NextResponse.json(await assessCourses(ids));
}
