import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { cleanQuestion, DIFFICULTIES, type BankQuestionIn } from '@/lib/question-bank';
import { toInput, typeOf } from '@/lib/question-types';
import { cleanPoolName } from '@/lib/quiz-draw';
import { oneOf, strings, text, type Body } from '@/server/body';

// A course's question bank (Stage 5 · B4.1; rules in src/lib/question-bank.ts). Teachers only.
// GET: the questions. POST { action }: create, import (up to 200 from CSV), delete, add-to-quiz
// (copies questions into one of the course's quizzes), save-from-quiz (copies a quiz question in).

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ACTIONS = ['create', 'import', 'delete', 'add-to-quiz', 'save-from-quiz'] as const;
const MAX_BANK = 2000;
// D1 allows 100 bound values per statement: insert in small groups (bank rows have 12 columns,
// quiz questions 10).
const groups = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const row = (courseId: string, userId: string, q: BankQuestionIn) => ({ courseId, createdById: userId, question: q.question, options: q.options, correctAnswer: q.correctAnswer, points: q.points, tags: q.tags.join(','), difficulty: q.difficulty, type: q.type, meta: q.meta });

async function list(courseId: string) {
  const rows = await prisma.bankQuestion.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: MAX_BANK });
  return rows.map((r) => ({ id: r.id, question: r.question, options: Array.isArray(r.options) ? r.options as string[] : [], correctAnswer: r.correctAnswer, type: typeOf(r), points: r.points, tags: r.tags ? r.tags.split(',') : [], difficulty: r.difficulty, createdAt: r.createdAt }));
}

async function teacher(req: Request, { params }: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return { error: bad('Please sign in.', 401) } as const;
  const { id } = await params;
  const access = await courseAccess(id, user);
  if (!access) return { error: bad('Course not found.', 404) } as const;
  if (!access.canManage) return { error: bad('Only the course teacher can use its question bank.', 403) } as const;
  return { user, id } as const;
}

export async function GET(req: Request, ctx: Ctx) {
  const t = await teacher(req, ctx);
  if ('error' in t) return t.error;
  return NextResponse.json({ questions: await list(t.id), difficulties: DIFFICULTIES }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, ctx: Ctx) {
  const t = await teacher(req, ctx);
  if ('error' in t) return t.error;
  const { user, id } = t;
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;
  if (!oneOf(ACTIONS, b.action)) return bad('Unknown action.');
  const count = () => prisma.bankQuestion.count({ where: { courseId: id } });

  switch (b.action) {
    case 'create': {
      const q = cleanQuestion(b);
      if (typeof q === 'string') return bad(q);
      if ((await count()) >= MAX_BANK) return bad(`A question bank holds up to ${MAX_BANK} questions.`);
      await prisma.bankQuestion.create({ data: row(id, user.id, q) });
      return NextResponse.json({ questions: await list(id) });
    }
    case 'import': {
      const raw = Array.isArray(b.questions) ? b.questions.slice(0, 200) : [];
      const good = raw.map((x) => cleanQuestion((x ?? {}) as Body)).filter((q): q is BankQuestionIn => typeof q !== 'string');
      if (!good.length) return bad('No questions to import.');
      if ((await count()) + good.length > MAX_BANK) return bad(`A question bank holds up to ${MAX_BANK} questions.`);
      for (const part of groups(good, 8)) await prisma.bankQuestion.createMany({ data: part.map((q) => row(id, user.id, q)) });
      return NextResponse.json({ imported: good.length, skipped: raw.length - good.length, questions: await list(id) });
    }
    case 'delete': {
      await prisma.bankQuestion.deleteMany({ where: { id: text(b.questionId), courseId: id } });
      return NextResponse.json({ questions: await list(id) });
    }
    case 'add-to-quiz': {
      const quiz = await prisma.quiz.findFirst({ where: { id: text(b.quizId), courseId: id }, select: { id: true } });
      if (!quiz) return bad('Pick a quiz from this course.');
      const ids = strings(b.ids).slice(0, 50);
      // Added as a pool (Stage 5 · B4.2): each student gets some of them.
      const pool = cleanPoolName(b.pool);
      const picked = ids.length ? await prisma.bankQuestion.findMany({ where: { courseId: id, id: { in: ids } } }) : [];
      if (!picked.length) return bad('Pick questions to add.');
      const last = await prisma.quizQuestion.findFirst({ where: { quizId: quiz.id }, orderBy: { order: 'desc' }, select: { order: true } });
      const start = (last?.order ?? -1) + 1;
      const ordered = ids.map((x) => picked.find((p) => p.id === x)).filter((p): p is (typeof picked)[number] => !!p);
      for (const part of groups(ordered.map((p, i) => ({ quizId: quiz.id, question: p.question, options: p.options as string[], correctAnswer: p.correctAnswer, points: p.points, order: start + i, type: p.type, meta: p.meta, pool: pool || null })), 9)) {
        await prisma.quizQuestion.createMany({ data: part });
      }
      // The concepts a bank question tests go with it (the mastery map counts the quiz's answers).
      const bankTags = await prisma.conceptTag.findMany({ where: { kind: 'BANK', refId: { in: ordered.map((p) => p.id) } }, select: { conceptId: true, refId: true } });
      if (bankTags.length) {
        const made = await prisma.quizQuestion.findMany({ where: { quizId: quiz.id, order: { gte: start } }, select: { id: true, order: true } });
        const byOrder = new Map(made.map((m) => [m.order, m.id]));
        const rows = ordered.flatMap((p, i) => bankTags.filter((t) => t.refId === p.id).map((t) => ({ conceptId: t.conceptId, kind: 'QUESTION', refId: byOrder.get(start + i) ?? '' }))).filter((r) => r.refId);
        if (rows.length) await prisma.conceptTag.createMany({ data: rows });
      }
      return NextResponse.json({ added: ordered.length });
    }
    case 'save-from-quiz': {
      const qq = await prisma.quizQuestion.findFirst({ where: { id: text(b.questionId), quiz: { courseId: id } } });
      if (!qq) return bad('Question not found.', 404);
      const q = cleanQuestion({ ...toInput(qq), points: qq.points, tags: b.tags, difficulty: b.difficulty });
      if (typeof q === 'string') return bad(q);
      if (await prisma.bankQuestion.findFirst({ where: { courseId: id, question: q.question }, select: { id: true } })) return bad('This question is already in the bank.', 409);
      if ((await count()) >= MAX_BANK) return bad(`A question bank holds up to ${MAX_BANK} questions.`);
      await prisma.bankQuestion.create({ data: row(id, user.id, q) });
      return NextResponse.json({ ok: true });
    }
  }
}
