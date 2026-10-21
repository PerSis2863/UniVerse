import { NextResponse } from 'next/server';
import { cleanPools, drawnOf } from '@/lib/quiz-draw';
import prisma from '@/lib/db';
import type { Given } from '@/lib/question-types';
import { getSessionUser } from '@/lib/server-auth';
import { manageableQuiz } from '@/lib/quizzes';
import { analyseQuiz } from '@/lib/item-analysis';
import { isAiPolicy, parseReceipt, type AiPolicy } from '@/lib/ai-receipt';

type Ctx = { params: Promise<{ id: string }> };

// GET: quiz with questions (incl. answers) for its teacher. PATCH: status / due date / time limit /
// shuffle / exam mode / reading help / AI rule.
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
      select: { id: true, studentId: true, drawn: true, score: true, maxScore: true, submittedAt: true, answers: true, integrity: true, aiReceipt: true, student: { select: { name: true } } },
    }),
  ]);
  // How each question worked (item analysis, Stage 5 · B4.6); the answers themselves stay here.
  const analysis = analyseQuiz(
    questions.map((q) => ({ id: q.id, options: Array.isArray(q.options) ? (q.options as string[]) : [], correctAnswer: q.correctAnswer, type: q.type, meta: q.meta })),
    submissions.map((sub) => ({ answers: (sub.answers && typeof sub.answers === 'object' ? sub.answers : {}) as Record<string, Given>, who: sub.studentId, drawn: drawnOf(sub.drawn) })),
  );
  return NextResponse.json({ ...quiz, questions, submissions: submissions.map((x) => ({ id: x.id, score: x.score, maxScore: x.maxScore, submittedAt: x.submittedAt, integrity: x.integrity, aiReceipt: parseReceipt(x.aiReceipt), student: x.student })), analysis }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;
  const quiz = await manageableQuiz(id, user);
  if (!quiz) return NextResponse.json({ error: 'Quiz not found.' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: { status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; dueDate?: Date | null; timeLimit?: number | null; shuffle?: boolean; examMode?: boolean; plainWords?: boolean; pools?: string | null; oneWay?: boolean; hardStop?: boolean; practice?: boolean; aiPolicy?: AiPolicy } = {};
  // Question pools (Stage 5 · B4.2): { pool: how many each student gets }; null for none.
  if (b.pools === null) data.pools = null;
  else if (b.pools !== undefined) { const p = cleanPools(b.pools); data.pools = p ? JSON.stringify(p) : null; }
  if (typeof b.shuffle === 'boolean') data.shuffle = b.shuffle;
  if (typeof b.examMode === 'boolean') data.examMode = b.examMode;
  // Reading help (Stage 5 · D9): simpler words, translation and listening for the questions.
  if (typeof b.plainWords === 'boolean') data.plainWords = b.plainWords;
  // Exam mode extras (B4.3).
  if (typeof b.oneWay === 'boolean') data.oneWay = b.oneWay;
  if (typeof b.hardStop === 'boolean') data.hardStop = b.hardStop;
  // A practice set (B4.4): never graded, practised under Mastery.
  if (typeof b.practice === 'boolean') data.practice = b.practice;
  // AI receipts (Stage 5 · Q22): the same three rules as assignments.
  if (isAiPolicy(b.aiPolicy)) data.aiPolicy = b.aiPolicy;
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
