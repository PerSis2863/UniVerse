import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { schedule, type ReviewGrade } from '@/server/tutor';

const GRADES = ['again', 'hard', 'good', 'easy'];

// POST { grade } records a review (spaced repetition); DELETE removes the card.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (!GRADES.includes(b.grade)) return NextResponse.json({ error: 'Unknown answer.' }, { status: 400 });
  const card = await prisma.studyCard.findFirst({ where: { id, userId: user.id } });
  if (!card) return NextResponse.json({ error: 'Card not found.' }, { status: 404 });
  const next = schedule(card, b.grade as ReviewGrade);
  await prisma.studyCard.update({ where: { id }, data: next });
  return NextResponse.json(next);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  await prisma.studyCard.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
