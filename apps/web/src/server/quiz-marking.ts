import prisma from '@/lib/db';
import { manageableQuiz } from '@/lib/quizzes';
import type { SessionUser } from '@/lib/server-auth';
import { cleanGiven, keyText, loose, markAnswer, metaOf, typeOf, type Given, type Meta } from '@/lib/question-types';
import { logAiUse } from './ai-receipts';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, HttpException, NotFoundException } from './http';

// Short answers the key didn't expect (Stage 5 · B4.1): the teaching team sees each different answer
// that was marked wrong, accepts the ones that are right (everyone who wrote it gets the points),
// and can ask the AI which ones mean the same as the key. The teacher always decides.

const MAX_ACCEPTED = 30;

async function shortQuestion(quizId: string, questionId: unknown, user: SessionUser) {
  const quiz = await manageableQuiz(quizId, user);
  if (!quiz) throw new NotFoundException('Quiz not found.');
  const q = typeof questionId === 'string' ? await prisma.quizQuestion.findFirst({ where: { id: questionId, quizId } }) : null;
  if (!q) throw new NotFoundException('Question not found.');
  if (typeOf(q) !== 'SHORT') throw new BadRequestException('Only short-answer questions can be checked this way.');
  return { quiz, q };
}

/** Each different answer marked wrong, most common first (answers that differ only in capitals etc. together). */
async function wrongAnswers(quizId: string, q: { id: string; type: string; options: unknown; correctAnswer: string; meta: string | null }) {
  const subs = await prisma.quizSubmission.findMany({ where: { quizId }, select: { answers: true }, take: 2000 });
  const seen = new Map<string, { answer: string; count: number }>();
  for (const s of subs) {
    const given = (s.answers && typeof s.answers === 'object' ? (s.answers as Record<string, Given>)[q.id] : null) ?? null;
    const mark = markAnswer(q, given);
    if (!mark.answered || mark.credit >= 1 || typeof given !== 'string') continue;
    const key = loose(given);
    const row = seen.get(key) ?? { answer: given.trim().slice(0, 200), count: 0 };
    row.count++;
    seen.set(key, row);
  }
  return [...seen.values()].sort((a, b) => b.count - a.count).slice(0, 100);
}

/** GET /api/quizzes/:id/short-answers?questionId= — the accepted answers, and the different wrong ones. */
export async function shortAnswers(quizId: string, questionId: unknown, user: SessionUser) {
  const { q } = await shortQuestion(quizId, questionId, user);
  return { accepted: metaOf(q).accepted ?? [], wrong: await wrongAnswers(quizId, q) };
}

/** Marks every hand-in of the quiz again (after its key changed): one statement for all of them. */
async function rescore(quizId: string) {
  const [questions, subs] = await Promise.all([
    prisma.quizQuestion.findMany({ where: { quizId }, select: { id: true, type: true, options: true, correctAnswer: true, meta: true, points: true } }),
    prisma.quizSubmission.findMany({ where: { quizId }, select: { id: true, answers: true }, take: 2000 }),
  ]);
  const rows = subs.map((s) => {
    const answers = (s.answers && typeof s.answers === 'object' ? s.answers : {}) as Record<string, unknown>;
    const score = questions.reduce((t, q) => { const g = cleanGiven(q, answers[q.id]); return g == null ? t : t + q.points * markAnswer(q, g).credit; }, 0);
    return { id: s.id, s: Math.round(score * 100) / 100 };
  });
  if (!rows.length) return 0;
  const data = JSON.stringify(rows);
  await prisma.$executeRawUnsafe(
    `UPDATE quiz_submissions SET score = (SELECT json_extract(value, '$.s') FROM json_each(?) WHERE json_extract(value, '$.id') = quiz_submissions.id)
     WHERE quizId = ? AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`,
    data, quizId, data,
  );
  return rows.length;
}

/** POST /api/quizzes/:id/short-answers { action: accept | unaccept, questionId, answer } */
export async function changeAccepted(quizId: string, user: SessionUser, b: Record<string, unknown>) {
  const { q } = await shortQuestion(quizId, b.questionId, user);
  const answer = typeof b.answer === 'string' ? b.answer.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!answer) throw new BadRequestException('Which answer?');
  const meta: Meta = metaOf(q);
  const accepted = meta.accepted ?? [];
  let next: string[];
  if (b.action === 'accept') {
    if (accepted.some((a) => loose(a) === loose(answer))) return { accepted, rescored: 0 };
    if (accepted.length >= MAX_ACCEPTED) throw new BadRequestException(`A question can accept up to ${MAX_ACCEPTED} answers.`);
    next = [...accepted, answer];
  } else if (b.action === 'unaccept') {
    next = accepted.filter((a) => loose(a) !== loose(answer));
    if (!next.length) throw new BadRequestException('A question needs at least one accepted answer.');
  } else throw new BadRequestException('Unknown action.');
  const m = { ...meta, accepted: next };
  await prisma.quizQuestion.update({ where: { id: q.id }, data: { meta: JSON.stringify(m), correctAnswer: keyText('SHORT', m) } });
  return { accepted: next, rescored: await rescore(quizId) };
}

const SYSTEM = `You help a teacher mark short quiz answers. You get a question, the answers the teacher accepts, and students' answers that didn't match exactly.
For each student answer, say whether it means the same as an accepted answer and would be marked right by a fair teacher (spelling slips, synonyms, an equivalent wording). Be strict about facts: a different or partly wrong answer is not right.
Return "same": the numbers of the answers that are right, each with a short reason (under 12 words).`;

/** POST /api/quizzes/:id/short-answers/suggest { questionId } — which wrong answers the AI thinks are right. */
export async function suggestAccepted(quizId: string, user: SessionUser, b: Record<string, unknown>) {
  const { quiz, q } = await shortQuestion(quizId, b.questionId, user);
  const wrong = (await wrongAnswers(quizId, q)).slice(0, 60);
  if (!wrong.length) return { suggestions: [] };
  if (!process.env.GEMINI_API_KEY) throw new HttpException('The AI isn’t set up yet, so it can’t suggest answers.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(user.id, { kind: 'marking', detail: quiz.title, courseId: quiz.courseId });
  const out = await geminiJson<{ same: { n: number; reason: string }[] }>(
    SYSTEM,
    `Question: ${q.question.slice(0, 1000)}\nAccepted: ${(metaOf(q).accepted ?? []).join(' | ').slice(0, 1000)}\nStudent answers:\n${wrong.map((w, i) => `${i + 1}. ${w.answer}`).join('\n')}`,
    { type: 'OBJECT', properties: { same: { type: 'ARRAY', items: { type: 'OBJECT', properties: { n: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['n', 'reason'] } } }, required: ['same'] },
    800,
  );
  const suggestions = (out?.same ?? []).flatMap((s) => {
    const w = wrong[Math.round(Number(s.n)) - 1];
    return w ? [{ answer: w.answer, reason: typeof s.reason === 'string' ? s.reason.replace(/\s+/g, ' ').trim().slice(0, 120) : '' }] : [];
  });
  return { suggestions: [...new Map(suggestions.map((s) => [s.answer, s])).values()] };
}
