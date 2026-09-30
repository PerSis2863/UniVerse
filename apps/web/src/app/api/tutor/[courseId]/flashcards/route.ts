import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { makeFlashcards, tutorAccess } from '@/server/tutor';

// POST { topic? } → makes flashcards from the course and adds them to my deck.
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const a = await tutorAccess(user, (await params).courseId);
  if (!a) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'The AI tutor isn’t set up yet.' }, { status: 503 });
  if ((await prisma.studyCard.count({ where: { userId: user.id } })) >= 1000) return NextResponse.json({ error: 'Your deck is full (1,000 cards). Delete some first.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const r = await makeFlashcards(a, typeof b.topic === 'string' ? b.topic : '');
  if (r.reason === 'no-sources') return NextResponse.json({ error: 'This course has no materials the tutor can read yet.', code: 'no-sources' }, { status: 409 });
  if (!r.cards?.length) return NextResponse.json({ error: 'Couldn’t make flashcards right now. Please try again.' }, { status: 503 });
  await prisma.studyCard.createMany({ data: r.cards.map((c) => ({ userId: user.id, courseId: a.courseId, front: c.front, back: c.back, sourceTitle: c.sourceTitle })) });
  return NextResponse.json({ added: r.cards.length });
}
