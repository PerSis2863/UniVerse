import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// My flashcards. GET ?due=1&courseId= → cards to review now (oldest due first) and deck counts.
// POST { courseId?, front, back } adds a card by hand.
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId') || undefined;
  const dueOnly = url.searchParams.get('due') === '1';
  const where = { userId: user.id, ...(courseId ? { courseId } : {}) };
  const [cards, due, total] = await Promise.all([
    prisma.studyCard.findMany({ where: { ...where, ...(dueOnly ? { due: { lte: new Date() } } : {}) }, orderBy: dueOnly ? { due: 'asc' } : { createdAt: 'desc' }, take: dueOnly ? 50 : 300, select: { id: true, courseId: true, front: true, back: true, sourceTitle: true, due: true, interval: true, reps: true } }),
    prisma.studyCard.count({ where: { ...where, due: { lte: new Date() } } }),
    prisma.studyCard.count({ where }),
  ]);
  return NextResponse.json({ cards, due, total }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const front = typeof b.front === 'string' ? b.front.trim().slice(0, 300) : '';
  const back = typeof b.back === 'string' ? b.back.trim().slice(0, 600) : '';
  if (!front || !back) return NextResponse.json({ error: 'Fill in both sides.' }, { status: 400 });
  const courseId = typeof b.courseId === 'string' && (await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: b.courseId } } })) ? b.courseId : null;
  const c = await prisma.studyCard.create({ data: { userId: user.id, courseId, front, back } });
  return NextResponse.json({ id: c.id });
}
