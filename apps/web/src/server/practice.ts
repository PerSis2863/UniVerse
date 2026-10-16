import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { pickNext, type Known, type Why } from '@/lib/practice';
import { cleanGiven, forStudent, keyFor, markAnswer, metaOf } from '@/lib/question-types';
import { conceptMasteryOf } from './learning-dna';
import { ForbiddenException, NotFoundException } from './http';

// Adaptive practice (Stage 5 · B4.4, src/lib/practice.ts): a student practises the course's questions
// whose answers they may see (practice sets, and quizzes that are closed or past due), one at a time,
// picked by what they haven't mastered. Tries are unlimited; a hint after a wrong try, the answer
// after three tries or when they ask, and the teacher's explanation. The first try counts towards
// their Learning DNA (src/server/learning-dna.ts).

const MAX_QUESTIONS = 500;
const SAME_GO_MS = 15 * 60_000;

/** Questions a student may practise in a course (the answers are theirs to see). */
const practisable = (courseId: string): Prisma.QuizQuestionWhereInput => ({
  quiz: { courseId, status: { not: 'DRAFT' }, OR: [{ practice: true }, { status: 'CLOSED' }, { dueDate: { lt: new Date() } }] },
});

async function student(user: SessionUser, courseId: string) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (a.canGrade || user.role !== 'STUDENT') throw new ForbiddenException('Practice is for the course’s students.');
  return a;
}

const WHY: Record<Why, (c: string | null) => string> = {
  learning: (c) => (c ? `You’re still learning ${c}.` : 'To keep practising.'),
  new: (c) => (c ? `New to you: ${c}.` : 'Something new.'),
  missed: () => 'You missed this one before: try it again.',
  review: () => 'A question to keep your knowledge fresh.',
};

/** GET /api/courses/:id/practice?skip= — the next question, why it was picked, and today's practice.
 *  `skip`: questions the student passed over just now (comma-separated), set aside while others remain. */
export async function nextPractice(user: SessionUser, courseId: string, skipRaw: string | null = null) {
  await student(user, courseId);
  const [questions, tags, known, history] = await Promise.all([
    prisma.quizQuestion.findMany({ where: practisable(courseId), take: MAX_QUESTIONS, select: { id: true, question: true, type: true, options: true, correctAnswer: true, meta: true, points: true, quiz: { select: { title: true } } } }),
    prisma.conceptTag.findMany({ where: { kind: 'QUESTION', concept: { courseId } }, select: { refId: true, conceptId: true }, take: 5000 }),
    conceptMasteryOf(courseId, user.id),
    prisma.practiceAnswer.findMany({ where: { studentId: user.id, courseId }, orderBy: { updatedAt: 'desc' }, take: 500, select: { questionId: true, credit: true, solved: true, updatedAt: true, createdAt: true } }),
  ]);
  const conceptsOf = new Map<string, string[]>();
  for (const t of tags) conceptsOf.set(t.refId, [...(conceptsOf.get(t.refId) ?? []), t.conceptId]);
  const levels = new Map<string, Known>(known.map((c) => [c.id, { level: c.mastery.level, n: c.mastery.n }]));
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stats = { today: history.filter((h) => h.createdAt >= today).length, rightFirst: history.filter((h) => h.createdAt >= today && h.credit >= 1).length };
  const skip = new Set((skipRaw ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30));
  const pool = questions.some((q) => !skip.has(q.id)) ? questions.filter((q) => !skip.has(q.id)) : questions;
  const pick = pickNext(pool.map((q) => ({ id: q.id, concepts: conceptsOf.get(q.id) ?? [] })), levels, history.map((h) => ({ questionId: h.questionId, credit: h.credit, solved: h.solved, at: h.updatedAt.getTime() })), now, `${user.id}:${now}`);
  if (!pick) return { next: null, stats };
  const q = questions.find((x) => x.id === pick.id)!;
  const concept = pick.concept ? known.find((c) => c.id === pick.concept)?.name ?? null : null;
  const shown = forStudent(q, user.id, user.id);
  return {
    next: { id: shown.id, question: shown.question, type: shown.type, options: shown.options, ask: shown.ask, source: q.quiz.title, hasHint: !!metaOf(q).hint },
    why: WHY[pick.why](concept), concept, stats,
  };
}

/** POST /api/courses/:id/practice { questionId, answer } or { questionId, giveUp: true } — a try. */
export async function answerPractice(user: SessionUser, courseId: string, b: Record<string, unknown>) {
  await student(user, courseId);
  const q = typeof b.questionId === 'string' ? await prisma.quizQuestion.findFirst({ where: { id: b.questionId, ...practisable(courseId) }, select: { id: true, type: true, options: true, correctAnswer: true, meta: true } }) : null;
  if (!q) throw new NotFoundException('That question isn’t there to practise.');
  const m = metaOf(q);
  // This go at the question: the same one within a quarter of an hour, not solved yet.
  const go = await prisma.practiceAnswer.findFirst({ where: { studentId: user.id, questionId: q.id, solved: false, updatedAt: { gt: new Date(Date.now() - SAME_GO_MS) } }, orderBy: { updatedAt: 'desc' }, select: { id: true, tries: true } });
  if (b.giveUp === true) {
    if (go) await prisma.practiceAnswer.update({ where: { id: go.id }, data: { tries: go.tries } });
    else await prisma.practiceAnswer.create({ data: { studentId: user.id, courseId, questionId: q.id, credit: 0 } });
    return { right: false, credit: 0, tries: go?.tries ?? 1, correctAnswer: keyFor(q, user.id), explain: m.explain ?? null, done: true };
  }
  const credit = markAnswer(q, cleanGiven(q, b.answer), user.id).credit;
  const right = credit >= 1;
  // Only the first try counts towards mastery; later tries say whether it was solved in the end.
  const tries = go ? go.tries + 1 : 1;
  if (go) await prisma.practiceAnswer.update({ where: { id: go.id }, data: { tries, solved: right } });
  else await prisma.practiceAnswer.create({ data: { studentId: user.id, courseId, questionId: q.id, credit, solved: right } });
  const showAnswer = !right && tries >= 3;
  return {
    right, credit, tries,
    hint: !right && !showAnswer ? m.hint ?? null : null,
    correctAnswer: showAnswer ? keyFor(q, user.id) : null,
    explain: right || showAnswer ? m.explain ?? null : null,
    done: right || showAnswer,
  };
}
