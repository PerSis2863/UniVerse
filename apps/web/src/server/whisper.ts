import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { cleanHeard, clusterTopics, heardText } from '@/lib/whisper';
import { sameQuestion, spendAi } from './ai-budget';
import { breakoutOf } from './calls';
import { later } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { publish } from './realtime';
import { coursePassages } from './tutor';

// Whisper TA (Stage 5 · D2). In a class call a student asks quietly ("what does she mean by…?");
// the TA answers from the course's materials (with citations, like the course tutor) and the last
// ten minutes of what was said, which the student's own browser sends from the captions it
// received. Nothing is said in the call. The teacher sees the questions as topics with how many
// students asked ("6 students asked about base cases"), never who or the question itself, and taps
// "Re-explain" when they've gone over it; the students who asked see that.
// Strict budget: each student's daily AI allowance, at most 10 questions an hour per student and
// 60 answers an hour per class; the same question asked again in the class within 15 minutes gets
// the answer already made (when it came from the course materials), at no cost.

const PER_STUDENT_HOUR = 10;
const PER_CLASS_HOUR = 60;
const REUSE_MS = 15 * 60_000;
const TOPICS_MS = 20 * 60_000;
const HOUR = 3_600_000;

const SYSTEM = `You are the quiet teaching assistant in a live university class on UniVerse. A student asks you privately during the class.
Answer from the numbered course passages and from what was said in the class in the last minutes (from automatic captions: expect missing words). Rules:
- Be short: at most 120 words, plain sentences, no headings. The student is listening to the class at the same time.
- Cite course passages you used with their numbers in square brackets, like [1]. Say "in class" when you rely on what was said.
- If neither covers it, say so in one sentence and suggest asking the teacher; you may add one short general hint marked as not from the course. Never make up what the teacher said.
- Answer in the language of the question.
- "topic": two to four words naming the course concept the question is about (like "base case" or "for loops"), in the language of the class; empty if the question isn't about the class.`;

type Citation = { n: number; title: string };

async function access(user: SessionUser, callId: string) {
  const parent = breakoutOf(callId)?.parent ?? callId;
  if (!/^c_[a-z0-9]+$/i.test(parent)) throw new NotFoundException('The TA is for class calls.');
  const a = await courseAccess(parent.slice(2), user);
  if (!a) throw new NotFoundException('That class isn’t one of yours.');
  return { ...a, callId: parent };
}

const mine = (q: { id: string; question: string; answer: string | null; citations: string | null; grounded: boolean; live: boolean; reused: boolean; topic: string | null; addressedAt: Date | null; createdAt: Date }) => ({
  id: q.id, question: q.question, answer: q.answer, grounded: q.grounded, live: q.live, reused: q.reused,
  citations: (() => { try { return JSON.parse(q.citations ?? '[]') as Citation[]; } catch { return []; } })(),
  // The teacher went over what this was about.
  addressed: !!q.addressedAt, at: q.createdAt.toISOString(),
});
const SELECT = { id: true, question: true, answer: true, citations: true, grounded: true, live: true, reused: true, topic: true, addressedAt: true, createdAt: true } as const;

/** GET /api/calls/:id/whisper: a student's own questions in this class call; the teacher's topics. */
export async function whisper(user: SessionUser, callId: string) {
  const a = await access(user, callId);
  if (a.canManage) {
    const rows = await prisma.whisperQuestion.findMany({ where: { callId: a.callId, createdAt: { gte: new Date(Date.now() - TOPICS_MS) }, addressedAt: null }, select: { topic: true, studentId: true, createdAt: true }, take: 300 });
    return { role: 'teacher' as const, topics: clusterTopics(rows.map((r) => ({ topic: r.topic, studentId: r.studentId, at: r.createdAt.getTime() }))).slice(0, 5).map(({ topic, students, latest, topics }) => ({ topic, students, latest: new Date(latest).toISOString(), topics })) };
  }
  if (user.role !== 'STUDENT') throw new ForbiddenException('The TA is for the class’s students.');
  const rows = await prisma.whisperQuestion.findMany({ where: { callId: a.callId, studentId: user.id }, orderBy: { createdAt: 'asc' }, take: 40, select: SELECT });
  return { role: 'student' as const, questions: rows.map(mine) };
}

/**
 * POST /api/calls/:id/whisper: a student asks { question, heard: [{ ago, who, text }] }, or the
 * teacher marks a topic re-explained { action: 'addressed', topics: [label, …] }.
 */
export async function whisperAction(user: SessionUser, callId: string, b: Record<string, unknown>) {
  const a = await access(user, callId);
  if (b.action === 'addressed') {
    if (!a.canManage) throw new ForbiddenException('Only the class’s teacher can do that.');
    const topics = (Array.isArray(b.topics) ? b.topics : []).filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase().slice(0, 60)).slice(0, 20);
    if (!topics.length) throw new BadRequestException('Which topic?');
    const rows = await prisma.whisperQuestion.findMany({ where: { callId: a.callId, createdAt: { gte: new Date(Date.now() - TOPICS_MS) }, addressedAt: null, topic: { not: null } }, select: { id: true, topic: true, studentId: true }, take: 300 });
    const hit = rows.filter((r) => topics.includes((r.topic ?? '').replace(/\s+/g, ' ').trim().toLowerCase()));
    if (hit.length) {
      await prisma.$executeRawUnsafe(`UPDATE whisper_questions SET "addressedAt" = ?1 WHERE id IN (SELECT value FROM json_each(?2))`, new Date().toISOString().replace('Z', '+00:00'), JSON.stringify(hit.map((r) => r.id)));
      publish(hit.map((r) => r.studentId), { type: 'refresh', keys: [`/api/calls/${a.callId}/whisper`] });
    }
    return { addressed: hit.length };
  }

  if (a.canManage || user.role !== 'STUDENT') throw new ForbiddenException('The TA is for the class’s students.');
  const question = typeof b.question === 'string' ? b.question.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (question.length < 3) throw new BadRequestException('Type your question.');
  const now = Date.now();
  const [mineHour, classHour] = await Promise.all([
    prisma.whisperQuestion.count({ where: { callId: a.callId, studentId: user.id, createdAt: { gte: new Date(now - HOUR) } } }),
    prisma.whisperQuestion.count({ where: { callId: a.callId, reused: false, answer: { not: null }, createdAt: { gte: new Date(now - HOUR) } } }),
  ]);
  if (mineHour >= PER_STUDENT_HOUR) throw new HttpException('That’s ten questions this hour. Ask your teacher, or the course tutor after class.', 429);
  const norm = sameQuestion(question).slice(0, 300);
  const base = { callId: a.callId, courseId: a.course.id, studentId: user.id, question, norm };
  const tell = () => publish([a.course.teacherId], { type: 'refresh', keys: [`/api/calls/${a.callId}/whisper`] });

  // Asked already in this class: the same answer, when it came from the course materials.
  const same = await prisma.whisperQuestion.findFirst({ where: { callId: a.callId, norm, grounded: true, answer: { not: null }, createdAt: { gte: new Date(now - REUSE_MS) } }, orderBy: { createdAt: 'desc' }, select: { answer: true, citations: true, live: true, topic: true } });
  if (same) {
    const q = await prisma.whisperQuestion.create({ data: { ...base, answer: same.answer, citations: same.citations, grounded: true, live: same.live, reused: true, topic: same.topic }, select: SELECT });
    if (same.topic) tell();
    return mine(q);
  }
  if (classHour >= PER_CLASS_HOUR) throw new HttpException('The TA has answered all it can for this class this hour. Ask your teacher, or the course tutor after class.', 429);
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('The TA isn’t available right now.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);

  const heard = cleanHeard(b.heard);
  const { found, text } = await coursePassages(a.course.id, `${question} ${heard.slice(-6).map((l) => l.text).join(' ')}`, 6);
  const out = await geminiJson<{ answer: string; grounded: boolean; used: number[]; topic: string }>(
    SYSTEM,
    [
      `Class: ${a.course.code} · ${a.course.name}`,
      `Course passages:\n${text || '(none matched)'}`,
      `What was said in the class in the last minutes:\n${heard.length ? heardText(heard) : '(no captions: the live transcript isn’t on)'}`,
      `The student's question: ${question}`,
    ].join('\n\n'),
    { type: 'OBJECT', properties: { answer: { type: 'STRING' }, grounded: { type: 'BOOLEAN' }, used: { type: 'ARRAY', items: { type: 'INTEGER' } }, topic: { type: 'STRING' } }, required: ['answer', 'grounded', 'used', 'topic'] },
    600,
    true,
  );
  if (!out?.answer) throw new HttpException('The TA couldn’t answer just now. Try again in a moment.', 503);
  const used = new Set([...(out.used ?? []), ...[...out.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))]);
  const citations: Citation[] = found.filter((p) => used.has(p.n)).map((p) => ({ n: p.n, title: p.title }));
  const topic = (out.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
  const q = await prisma.whisperQuestion.create({
    data: { ...base, answer: out.answer.slice(0, 2000), citations: JSON.stringify(citations), grounded: !!out.grounded && citations.length > 0, live: heard.length > 0, topic },
    select: SELECT,
  });
  if (topic) tell();
  // Questions are kept a month (for the class's records), then cleared as new ones come in.
  later(() => prisma.whisperQuestion.deleteMany({ where: { courseId: a.course.id, createdAt: { lt: new Date(now - 30 * 24 * HOUR) } } }));
  return mine(q);
}
