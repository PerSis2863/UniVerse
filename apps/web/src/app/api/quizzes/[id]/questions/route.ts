import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { manageableQuiz } from '@/lib/quizzes';

type Ctx = { params: Promise<{ id: string }> };

// POST: add a multiple-choice question. DELETE ?qid= : remove one.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await manageableQuiz(id, user))) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const question = String(b.question ?? '').trim().slice(0, 1000);
  const options: string[] = Array.isArray(b.options)
    ? [...new Set<string>(b.options.map((o: unknown) => String(o ?? '').trim().slice(0, 300)).filter(Boolean))].slice(0, 6)
    : [];
  const correctAnswer = String(b.correctAnswer ?? '').trim();
  const points = Math.max(0.5, Math.min(100, Number(b.points) || 1));
  if (!question) return NextResponse.json({ error: 'Write the question.' }, { status: 400 });
  if (options.length < 2) return NextResponse.json({ error: 'Add at least two answer options.' }, { status: 400 });
  if (!options.includes(correctAnswer)) return NextResponse.json({ error: 'Pick which option is correct.' }, { status: 400 });

  const order = await prisma.quizQuestion.count({ where: { quizId: id } });
  const created = await prisma.quizQuestion.create({ data: { quizId: id, question, options, correctAnswer, points, order } });
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await manageableQuiz(id, user))) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
  const qid = new URL(req.url).searchParams.get('qid');
  if (!qid) return NextResponse.json({ error: 'Missing question.' }, { status: 400 });
  await prisma.quizQuestion.deleteMany({ where: { id: qid, quizId: id } });
  return NextResponse.json({ ok: true });
}
