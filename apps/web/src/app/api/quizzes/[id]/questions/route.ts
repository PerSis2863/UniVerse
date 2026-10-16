import { NextResponse } from 'next/server';
import { cleanPoolName } from '@/lib/quiz-draw';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { manageableQuiz } from '@/lib/quizzes';
import { cleanQuestionInput, type QuestionInput } from '@/lib/question-types';

type Ctx = { params: Promise<{ id: string }> };

// POST: add a question of any type (Stage 5 · B4.1, src/lib/question-types.ts):
// { type, question, points, pool?, … the type's fields }. PATCH { qid, pool } : puts a question in a pool
// (B4.2; empty: everyone gets it). DELETE ?qid= : remove one.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await manageableQuiz(id, user))) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });

  const b = ((await req.json().catch(() => ({}))) ?? {}) as QuestionInput & { points?: unknown; pool?: unknown };
  const q = cleanQuestionInput(b);
  if (typeof q === 'string') return NextResponse.json({ error: q }, { status: 400 });
  const points = Math.max(0.5, Math.min(100, Math.round((Number(b.points) || 1) * 2) / 2));
  const order = await prisma.quizQuestion.count({ where: { quizId: id } });
  const created = await prisma.quizQuestion.create({ data: { quizId: id, ...q, points, order, pool: cleanPoolName(b.pool) || null } });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  if (!(await manageableQuiz(id, user))) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { qid?: unknown; pool?: unknown };
  const done = await prisma.quizQuestion.updateMany({ where: { id: typeof b.qid === 'string' ? b.qid : '', quizId: id }, data: { pool: cleanPoolName(b.pool) || null } });
  if (!done.count) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
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
