import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { review, type ReviewGrade } from '@/lib/fsrs';
import { reanchorReminder } from '@/server/tutor-plus';
import { recordStudy } from '@/server/streaks';
import { recordSignal } from '@/server/learning-dna';

const GRADES = ['again', 'hard', 'good', 'easy'];

// POST { grade, tz? } records a review, scheduled with FSRS (Stage 5 · Q13; the evening reminder, if
// on, moves to the next 6 pm in that time zone); a course card's review also counts, lightly, toward
// the mastery map for the concept its words match (Q22). DELETE removes the card.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!GRADES.includes(b.grade)) return NextResponse.json({ error: 'Unknown answer.' }, { status: 400 });
  const card = await prisma.studyCard.findFirst({ where: { id, userId: user.id } });
  if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
  const next = review(card, b.grade as ReviewGrade);
  const conceptId = card.courseId && user.role === 'STUDENT'
    ? await recordSignal({ courseId: card.courseId, studentId: user.id, kind: 'CARD', text: `${card.front} ${card.back}`, grade: b.grade, cardId: card.id, conceptId: card.conceptId })
    : null;
  await prisma.studyCard.update({ where: { id }, data: conceptId && conceptId !== card.conceptId ? { ...next, conceptId } : next });
  await reanchorReminder(user.id, b.tz);
  if (user.role === 'STUDENT') recordStudy(user.id, req);
  return NextResponse.json(next);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  await prisma.studyCard.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
