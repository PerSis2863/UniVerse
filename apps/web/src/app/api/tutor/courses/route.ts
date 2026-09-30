import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Courses the signed-in person can use the AI tutor for, with how many sources are ready, and
// how many of their flashcards are due.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const where = user.role === 'ADMIN' ? { status: 'PUBLISHED' as const } : user.role === 'TEACHER' ? { teacherId: user.id } : { enrollments: { some: { studentId: user.id } } };
  const [courses, due, total] = await Promise.all([
    prisma.course.findMany({
      where, orderBy: { code: 'asc' }, take: 100,
      select: { id: true, code: true, name: true, emoji: true, color: true, _count: { select: { materials: true } }, sources: { where: { status: 'READY' }, select: { id: true } } },
    }),
    prisma.studyCard.count({ where: { userId: user.id, due: { lte: new Date() } } }),
    prisma.studyCard.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({
    courses: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, emoji: c.emoji, color: c.color, materials: c._count.materials, readySources: c.sources.length })),
    cards: { due, total },
    canManage: user.role !== 'STUDENT',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
