import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { manageableQuiz } from '@/lib/quizzes';

type Ctx = { params: Promise<{ id: string }> };

// GET: quiz with questions (incl. answers) for its teacher. PATCH: status / due date / time limit.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const quiz = await manageableQuiz(id, user);
  if (!quiz) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });
  const [questions, submissions] = await Promise.all([
    prisma.quizQuestion.findMany({ where: { quizId: id }, orderBy: { order: 'asc' } }),
    prisma.quizSubmission.findMany({
      where: { quizId: id },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, score: true, maxScore: true, submittedAt: true, student: { select: { name: true } } },
    }),
  ]);
  return NextResponse.json({ ...quiz, questions, submissions }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const quiz = await manageableQuiz(id, user);
  if (!quiz) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: { status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; dueDate?: Date | null; timeLimit?: number | null } = {};
  if (['DRAFT', 'PUBLISHED', 'CLOSED'].includes(b.status)) {
    if (b.status === 'PUBLISHED' && (await prisma.quizQuestion.count({ where: { quizId: id } })) === 0) {
      return NextResponse.json({ error: 'Add at least one question before publishing.' }, { status: 400 });
    }
    data.status = b.status;
  }
  if (b.dueDate === null) data.dueDate = null;
  else if (typeof b.dueDate === 'string' && !isNaN(Date.parse(b.dueDate))) data.dueDate = new Date(b.dueDate);
  if (b.timeLimit === null) data.timeLimit = null;
  else if (Number.isInteger(b.timeLimit) && b.timeLimit > 0 && b.timeLimit <= 600) data.timeLimit = b.timeLimit;

  const updated = await prisma.quiz.update({ where: { id }, data });
  return NextResponse.json(updated);
}
