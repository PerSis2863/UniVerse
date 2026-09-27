import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

type Ctx = { params: Promise<{ id: string }> };

// GET: the signed-in student's own submission for a quiz, question by question.
// Correct answers are revealed only once the quiz is closed or past its due date, so they can't be shared while it's open.
export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const { id } = await params;

  const submission = await prisma.quizSubmission.findUnique({
    where: { quizId_studentId: { quizId: id, studentId: user.id } },
    select: {
      score: true, maxScore: true, submittedAt: true, answers: true,
      quiz: { select: { title: true, status: true, dueDate: true, questions: { orderBy: { order: 'asc' }, select: { id: true, question: true, options: true, correctAnswer: true, points: true } } } },
    },
  });
  if (!submission) return NextResponse.json({ error: 'You haven’t submitted this quiz.' }, { status: 404 });

  const { quiz } = submission;
  const reveal = quiz.status === 'CLOSED' || (!!quiz.dueDate && quiz.dueDate.getTime() < Date.now());
  const answers = (submission.answers ?? {}) as Record<string, string>;

  return NextResponse.json({
    title: quiz.title,
    score: submission.score,
    maxScore: submission.maxScore,
    submittedAt: submission.submittedAt,
    revealed: reveal,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      points: q.points,
      yourAnswer: answers[q.id] ?? null,
      correct: reveal ? answers[q.id] === q.correctAnswer : undefined,
      correctAnswer: reveal ? q.correctAnswer : undefined,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
