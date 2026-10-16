import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { CHOICE_TYPES, answerText, forStudent, keyFor, markAnswer, metaOf, typeOf, type Given } from '@/lib/question-types';
import { drawnOf } from '@/lib/quiz-draw';

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
      score: true, maxScore: true, submittedAt: true, answers: true, drawn: true,
      quiz: { select: { courseId: true, title: true, status: true, dueDate: true, questions: { orderBy: { order: 'asc' }, select: { id: true, question: true, options: true, correctAnswer: true, points: true, type: true, meta: true } } } },
    },
  });
  if (!submission) return NextResponse.json({ error: 'You haven’t submitted this quiz.' }, { status: 404 });

  const { quiz } = submission;
  const reveal = quiz.status === 'CLOSED' || (!!quiz.dueDate && quiz.dueDate.getTime() < Date.now());
  const answers = (submission.answers ?? {}) as Record<string, Given>;

  return NextResponse.json({
    courseId: quiz.courseId,
    title: quiz.title,
    score: submission.score,
    maxScore: submission.maxScore,
    submittedAt: submission.submittedAt,
    revealed: reveal,
    // Each question as its type shows it (Stage 5 · B4.1); how much of it was right once revealed.
    // Only the questions this student got (pools, B4.2), with their own numbers.
    questions: quiz.questions.filter((q) => { const d = drawnOf(submission.drawn); return !d || d.includes(q.id); }).map((q) => {
      const given = answers[q.id] ?? null;
      const { credit } = markAnswer(q, given, user.id);
      const mine = forStudent(q, null, user.id);
      const type = typeOf(q);
      return {
        id: q.id,
        type,
        question: mine.question,
        options: mine.options,
        lefts: mine.ask.lefts,
        points: q.points,
        yourAnswer: given,
        yourText: answerText(q, given),
        correct: reveal ? credit >= 1 : undefined,
        credit: reveal ? credit : undefined,
        correctAnswer: reveal ? keyFor(q, user.id) : undefined,
        // A picture question: the picture always, the right areas once revealed.
        image: type === 'HOTSPOT' ? metaOf(q).image : undefined,
        areas: reveal && type === 'HOTSPOT' ? metaOf(q).areas ?? [] : undefined,
        // The right options of a several-answers question, to mark them in the list.
        rightOptions: reveal ? (type === 'MULTI' ? metaOf(q).correct ?? [] : CHOICE_TYPES.includes(type) ? [q.correctAnswer] : undefined) : undefined,
      };
    }),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
