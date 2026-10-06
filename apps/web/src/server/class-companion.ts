import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { cachedAi, saveAi, spendAi } from './ai-budget';
import { isLanguage } from '@/lib/languages';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { publish } from './realtime';
import { pushService } from './services/push.service';

// Upgrade 1, AI class companion. The teacher turns on "Class notes" in a class call (c_<course>);
// everyone's browser captions their own speech (Chrome, Edge, Safari) and the teacher's browser
// collects the final captions with their time in the call. When notes stop (or the teacher leaves),
// the transcript comes here once: ONE AI request turns it into a study pack (summary, notes, key
// moments, flashcards, a 5-question quiz). The quiz is saved as a draft for the teacher to check
// and publish; students add the flashcards to their own deck when they want them. Enrolled
// students are told in the app and by push (never by email).

const MAX_LINES = 3000;
const MAX_CHARS = 60_000;

export interface TranscriptLine { t: number; who: string; text: string }
interface Pack {
  summary: string;
  notes: string[];
  keyMoments: { t: number; text: string }[];
  flashcards: { front: string; back: string }[];
  quiz: { question: string; options: string[]; answer: string }[];
}

const SYSTEM = [
  'You turn the transcript of a university class into a study pack for the students who attended (or missed) it.',
  'The transcript comes from automatic captions: expect missing words and mistakes, and ignore small talk, greetings and technical problems ("can you hear me").',
  'Write in the language the class was taught in. Be accurate: only use what was said in the class; never invent facts, dates or numbers.',
  'summary: 3 to 5 sentences on what the class covered. notes: 5 to 12 short bullet points a student would write down.',
  'keyMoments: 3 to 8 moments worth going back to, each with t = the seconds value of the line where it starts (copy it from the transcript) and a short description.',
  'flashcards: 6 to 12 cards, a question or term on the front and a short answer on the back.',
  'quiz: exactly 5 multiple-choice questions, each with 4 options, and answer = the exact text of the correct option. Test understanding, not trivia.',
  'If the transcript is too short or empty of teaching content, return short honest content (e.g. a one-sentence summary) and fewer items.',
].join(' ');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
    keyMoments: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, text: { type: 'STRING' } }, required: ['t', 'text'] } },
    flashcards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } },
    quiz: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'STRING' } }, required: ['question', 'options', 'answer'] } },
  },
  required: ['summary', 'notes', 'keyMoments', 'flashcards', 'quiz'],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Accepts what the teacher's browser sends, keeping it within size limits. */
export function cleanTranscript(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptLine[] = [];
  let chars = 0;
  for (const x of raw.slice(0, MAX_LINES)) {
    const line = x as Partial<TranscriptLine>;
    const text = str(line?.text, 500);
    if (!text) continue;
    const t = Math.max(0, Math.min(6 * 3600, Math.round(Number(line.t) || 0)));
    const who = str(line.who, 60) || 'Someone';
    if (chars + text.length > MAX_CHARS) break;
    chars += text.length;
    out.push({ t, who, text });
  }
  return out;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function cleanPack(raw: Partial<Pack> | null, durationSec: number): Pack | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  const summary = str(raw.summary, 2000);
  if (!summary) return null;
  return {
    summary,
    notes: list(raw.notes, 15, 400),
    keyMoments: (Array.isArray(raw.keyMoments) ? raw.keyMoments : [])
      .map((m) => ({ t: Math.max(0, Math.min(durationSec || 6 * 3600, Math.round(Number(m?.t) || 0))), text: str(m?.text, 300) }))
      .filter((m) => m.text).sort((a, b) => a.t - b.t).slice(0, 10),
    flashcards: (Array.isArray(raw.flashcards) ? raw.flashcards : [])
      .map((c) => ({ front: str(c?.front, 300), back: str(c?.back, 600) }))
      .filter((c) => c.front && c.back).slice(0, 15),
    quiz: (Array.isArray(raw.quiz) ? raw.quiz : [])
      .map((q) => {
        const options = [...new Set(list(q?.options, 4, 200))];
        const answer = str(q?.answer, 200);
        return { question: str(q?.question, 500), options, answer: options.find((o) => o.toLowerCase() === answer.toLowerCase()) ?? '' };
      })
      .filter((q) => q.question && q.options.length === 4 && q.answer).slice(0, 5),
  };
}

async function teacherCourse(courseId: string, user: SessionUser) {
  const access = await courseAccess(courseId, user);
  if (!access) throw new NotFoundException('Course not found.');
  if (!access.canManage) throw new ForbiddenException('Only the class’s teacher can make study packs.');
  return access.course;
}

/** One AI request. Returns null when AI isn't available (the session is kept as PENDING to retry). */
async function makePack(lines: TranscriptLine[], courseName: string, durationSec: number, user: SessionUser): Promise<Pack | null> {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return null;
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const prompt = `Course: ${courseName}\nClass length: ${clock(durationSec)}\n\nTranscript (seconds · speaker · words):\n${lines.map((l) => `${l.t} · ${l.who} · ${l.text}`).join('\n')}`;
  const raw = await geminiJson<Partial<Pack>>(SYSTEM, prompt, SCHEMA, 4000);
  return cleanPack(raw, durationSec);
}

/** Saves the pack's quiz as a draft the teacher reviews and publishes (students can't see drafts). */
async function draftQuiz(courseId: string, pack: Pack, startedAt: Date) {
  if (!pack.quiz.length) return null;
  const day = startedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const quiz = await prisma.quiz.create({
    data: {
      courseId, status: 'DRAFT', title: `Class quiz · ${day}`,
      description: 'Made from the class notes by AI. Check the questions and answers before publishing.',
      questions: { create: pack.quiz.map((q, i) => ({ question: q.question, options: q.options, correctAnswer: q.answer, points: 1, order: i })) },
    },
    select: { id: true },
  });
  return quiz.id;
}

/** A class recording saved around the same time (the teacher may record and take notes together). */
async function recordingNear(courseId: string, startedAt: Date) {
  const m = await prisma.material.findFirst({
    where: { courseId, type: 'VIDEO', fileUrl: { contains: `/recordings/${courseId}/` }, createdAt: { gte: startedAt, lte: new Date(Date.now() + 60_000) } },
    orderBy: { createdAt: 'desc' }, select: { id: true },
  });
  return m?.id ?? null;
}

async function tellClass(course: { id: string; code: string }, sessionId: string) {
  const students = await prisma.enrollment.findMany({ where: { courseId: course.id }, select: { studentId: true }, take: 500 });
  if (!students.length) return;
  const ids = students.map((s) => s.studentId);
  const title = `Study pack ready: ${course.code}`;
  const body = 'Summary, notes, key moments and flashcards from today’s class.';
  const link = `/student/blackboard?course=${course.id}&tab=sessions&session=${sessionId}`;
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body, type: 'announcement', link })) });
  publish(ids.slice(0, planLimits().livePushes), { type: 'notification' });
  await pushService.sendToMany(ids, { title, body, url: link, tag: `pack-${sessionId}` }).catch(() => 0);
}

const packData = (pack: Pack) => ({
  status: 'READY', summary: pack.summary, notes: JSON.stringify(pack.notes), keyMoments: JSON.stringify(pack.keyMoments), flashcards: JSON.stringify(pack.flashcards),
});

/** POST /api/calls/c_<course>/companion { transcript: [{ t, who, text }], durationSec }. */
export async function createClassSession(callId: string, user: SessionUser, body: Record<string, unknown>) {
  if (!callId.startsWith('c_')) throw new BadRequestException('Class notes are for class calls.');
  const course = await teacherCourse(callId.slice(2), user);
  const lines = cleanTranscript(body.transcript);
  if (!lines.length) throw new BadRequestException('No transcript: captions need Chrome, Edge or Safari, and someone has to speak while class notes are on.');
  const durationSec = Math.max(lines[lines.length - 1].t, Math.min(6 * 3600, Math.round(Number(body.durationSec) || 0)));
  const startedAt = new Date(Date.now() - durationSec * 1000);

  const pack = await makePack(lines, `${course.code} ${course.name}`, durationSec, user);
  const quizId = pack ? await draftQuiz(course.id, pack, startedAt) : null;
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id, createdById: user.id, startedAt, durationSec, transcript: JSON.stringify(lines), quizId,
      recordingMaterialId: await recordingNear(course.id, startedAt),
      ...(pack ? packData(pack) : { status: 'PENDING' }),
    },
    select: { id: true, status: true },
  });
  if (pack) await tellClass(course, session.id);
  return { ...session, quizId, message: pack ? 'Study pack ready. The quiz is a draft: check it, then publish it.' : 'The class notes are saved. AI isn’t available right now: open Class sessions and tap Make study pack later.' };
}

/** POST /api/class-sessions/[id]/retry: make the pack for a session saved while AI was unavailable. */
export async function retryClassSession(sessionId: string, user: SessionUser) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!s) throw new NotFoundException('Class session not found.');
  const course = await teacherCourse(s.courseId, user);
  if (s.status === 'READY') return { id: s.id, status: s.status };
  const lines = cleanTranscript(s.transcript ? JSON.parse(s.transcript) : []);
  if (!lines.length) throw new BadRequestException('This session’s transcript is no longer kept.');
  const pack = await makePack(lines, `${course.code} ${course.name}`, s.durationSec, user);
  if (!pack) throw new HttpException('AI isn’t available right now. Please try again later.', 503);
  const quizId = s.quizId ?? (await draftQuiz(course.id, pack, s.startedAt));
  await prisma.classSession.update({ where: { id: s.id }, data: { ...packData(pack), quizId } });
  await tellClass(course, s.id);
  return { id: s.id, status: 'READY', quizId };
}

/** DELETE: the teacher removes a session (its draft quiz stays in Quizzes, to delete there if wanted). */
export async function deleteClassSession(sessionId: string, user: SessionUser) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true } });
  if (!s) throw new NotFoundException('Class session not found.');
  await teacherCourse(s.courseId, user);
  await prisma.classSession.delete({ where: { id: s.id } });
  return { ok: true };
}

/** POST /api/class-sessions/[id]/flashcards: an enrolled student copies the pack's cards into their own deck. */
export async function addSessionFlashcards(sessionId: string, user: SessionUser) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true, status: true, flashcards: true, startedAt: true, course: { select: { code: true } } } });
  if (!s || s.status !== 'READY') throw new NotFoundException('Study pack not found.');
  const access = await courseAccess(s.courseId, user);
  if (!access) throw new NotFoundException('Study pack not found.');
  let cards: { front: string; back: string }[] = [];
  try { cards = JSON.parse(s.flashcards); } catch { /* none */ }
  if (!cards.length) throw new BadRequestException('This study pack has no flashcards.');
  const sourceTitle = `${s.course.code} class · ${s.startedAt.toISOString().slice(0, 10)}`;
  const have = new Set((await prisma.studyCard.findMany({ where: { userId: user.id, sourceTitle }, select: { front: true } })).map((c) => c.front));
  const fresh = cards.filter((c) => !have.has(c.front));
  if (fresh.length) await prisma.studyCard.createMany({ data: fresh.map((c) => ({ userId: user.id, courseId: s.courseId, front: c.front, back: c.back, sourceTitle })) });
  return { added: fresh.length, already: cards.length - fresh.length };
}

/** For the course board: newest first. Students see finished packs only; transcripts never leave the server. */
export async function sessionsForBoard(courseId: string, canManage: boolean) {
  const rows = await prisma.classSession.findMany({
    where: { courseId, ...(canManage ? {} : { status: 'READY' }) },
    orderBy: { startedAt: 'desc' }, take: 20,
    select: { id: true, startedAt: true, durationSec: true, status: true, summary: true, notes: true, keyMoments: true, flashcards: true, quizId: true, recordingMaterialId: true },
  });
  const parse = <T,>(v: string): T[] => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
  const quizIds = rows.map((r) => r.quizId).filter((x): x is string => !!x);
  const quizzes = quizIds.length ? await prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, status: true } }) : [];
  const quizStatus = new Map(quizzes.map((q) => [q.id, q.status]));
  return rows.map((r) => {
    const status = r.quizId ? quizStatus.get(r.quizId) ?? null : null;
    // Students only learn about the quiz once the teacher has published it.
    const quiz = r.quizId && status && (canManage || status !== 'DRAFT') ? { id: r.quizId, status } : null;
    return { ...r, quizId: undefined, quiz, notes: parse<string>(r.notes), keyMoments: parse<{ t: number; text: string }>(r.keyMoments), flashcards: parse<{ front: string; back: string }>(r.flashcards) };
  });
}

// ─── The study pack in my language (Stage 4 · 4.1) ──────────────────────────────────────────────

export interface PackText { summary: string; notes: string[]; keyMoments: { t: number; text: string }[]; flashcards: { front: string; back: string }[] }

const TR_SYSTEM = [
  'You translate a study pack made from a university class into the target language, for a student who reads that language best.',
  'Translate every text field faithfully; keep technical terms (add the original term in brackets when it helps), names, numbers, formulas and code unchanged.',
  'Keep the same number of items in the same order, and copy every t value unchanged.',
  'from: the ISO 639-1 code of the language the pack is written in.',
].join(' ');
const TR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    from: { type: 'STRING' },
    summary: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
    keyMoments: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, text: { type: 'STRING' } }, required: ['t', 'text'] } },
    flashcards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } },
  },
  required: ['from', 'summary', 'notes', 'keyMoments', 'flashcards'],
};

/**
 * GET /api/class-sessions/[id]/translation?to=fr: the study pack in another language, for anyone in
 * the course. Made once per language (one AI request, counted for whoever asks first) and kept for
 * everyone else who reads that language. `same`: the pack is already in that language.
 */
export async function translatePack(sessionId: string, user: SessionUser, to: string): Promise<{ same: boolean; pack: PackText | null }> {
  if (!isLanguage(to)) throw new BadRequestException('Unknown language.');
  const s = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true, status: true, summary: true, notes: true, keyMoments: true, flashcards: true } });
  if (!s || s.status !== 'READY' || !(await courseAccess(s.courseId, user))) throw new NotFoundException('Study pack not found.');
  const key = ['pack-tr', s.id, to, s.summary ?? ''];
  const saved = await cachedAi<{ same: boolean; pack: PackText | null }>(key, 30);
  if (saved) return saved;
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Translation isn’t available right now. Please try again later.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const parse = <T,>(v: string): T[] => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
  const original: PackText = { summary: s.summary ?? '', notes: parse(s.notes), keyMoments: parse(s.keyMoments), flashcards: parse(s.flashcards) };
  const raw = await geminiJson<Partial<PackText> & { from?: string }>(TR_SYSTEM, `Target language: ${to}\n\nStudy pack (JSON):\n${JSON.stringify(original)}`, TR_SCHEMA, 6000);
  if (!raw?.summary) throw new HttpException('Couldn’t translate the study pack. Please try again.', 502);
  const out = String(raw.from ?? '').toLowerCase().slice(0, 2) === to
    ? { same: true, pack: null }
    : {
        same: false,
        pack: {
          summary: str(raw.summary, 3000),
          notes: (raw.notes ?? []).map((n) => str(n, 600)).filter(Boolean).slice(0, original.notes.length),
          // Times come from the original, so links into the recording stay right.
          keyMoments: original.keyMoments.map((k, i) => ({ t: k.t, text: str(raw.keyMoments?.[i]?.text, 400) || k.text })),
          flashcards: original.flashcards.map((c, i) => ({ front: str(raw.flashcards?.[i]?.front, 400) || c.front, back: str(raw.flashcards?.[i]?.back, 800) || c.back })),
        },
      };
  await saveAi(key, out);
  return out;
}
