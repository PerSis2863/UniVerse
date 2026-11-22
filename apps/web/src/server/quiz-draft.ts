import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { MATH_RULE } from '@/lib/tutor-rules';
import { spendAi } from './ai-budget';
import { BadRequestException, HttpException } from './http';
import { featureOff } from './moderation';
import { geminiJson } from './gemini';
import { short } from './trace';
import type { Body } from './body';

// POST /quizzes/draft { courseId, topic, count? } (M366): Ghidra writes a quiz for a teacher, as a DRAFT in their course:
// multiple choice, four options, one right. The route (modules/quizzes.ts) checks first that the asker may manage the
// course (the quiz page's own check). AI only within the daily allowance and the owner's AI switch; every question it
// gives is checked here (checkQuestions) and anything off is dropped. Students never see a draft: the teacher reads it,
// fixes what's wrong and publishes it in the quiz editor.

export interface DraftQuestion { question: string; options: string[]; answer: number }

const SYSTEM = [
  'You are Ghidra, UniVerse\'s assistant, writing a short multiple-choice quiz for a teacher.',
  'Each question: clear, one idea, suitable for the topic and level; exactly four options, one right, the others plausible',
  'but clearly wrong to someone who knows the topic; no "all of the above"; answer is the 0-based index of the right option.',
  'Vary which option is right. Use the language the topic is written in. Title: a few words.',
  MATH_RULE,
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'NUMBER' } }, required: ['question', 'options', 'answer'] } },
  },
  required: ['title', 'questions'],
};

/** The questions AI gave, checked one by one: a real question, four different options, a right answer among them. */
export function checkQuestions(raw: unknown, max: number): DraftQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftQuestion[] = [];
  for (const q of raw) {
    const r = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
    const question = short(r.question, 400) ?? '';
    const options = Array.isArray(r.options) ? r.options.map((o) => short(o, 200) ?? '').filter(Boolean) : [];
    const answer = typeof r.answer === 'number' ? Math.round(r.answer) : -1;
    if (question.length < 5 || options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4 || answer < 0 || answer > 3) continue;
    out.push({ question, options, answer });
    if (out.length >= max) break;
  }
  return out;
}

export async function draftQuiz(u: SessionUser, b: Body) {
  const courseId = short(b.courseId, 40), topic = short(b.topic, 160);
  if (!courseId || !topic || topic.length < 2) throw new BadRequestException('Say what the quiz is about.');
  const count = Math.min(15, Math.max(3, Math.round(Number(b.count) || 5)));
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new BadRequestException('Ghidra can’t write quizzes right now. You can still write one yourself.');
  const spend = await spendAi(u);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, code: true } });
  const out = await geminiJson<{ title?: unknown; questions?: unknown }>(SYSTEM, `Course: ${course?.name ?? ''} (${course?.code ?? ''})\nTopic: ${topic}\nQuestions: ${count}`, SCHEMA, 3000).catch(() => null);
  const questions = checkQuestions(out?.questions, count);
  if (questions.length < 2) throw new BadRequestException('Ghidra couldn’t write good questions on that. Try a clearer topic.');
  const title = (short(out?.title, 120) || `Quiz: ${topic}`).slice(0, 200);
  const quiz = await prisma.quiz.create({ data: { courseId, title, description: 'Drafted by Ghidra. Check every question and answer before publishing.', status: 'DRAFT' }, select: { id: true } });
  const rows = questions.map((q, order) => ({ quizId: quiz.id, question: q.question, options: q.options, correctAnswer: q.options[q.answer], points: 1, order, type: 'CHOICE', meta: null }));
  // Nine rows a statement (D1 takes 100 values; a row has 8 here), as exam-papers.ts does.
  for (let i = 0; i < rows.length; i += 9) await prisma.quizQuestion.createMany({ data: rows.slice(i, i + 9) });
  return { quiz, count: questions.length };
}
