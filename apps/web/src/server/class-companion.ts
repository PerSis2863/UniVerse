import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { cachedAi, saveAi, spendAi } from './ai-budget';
import { isLanguage } from '@/lib/languages';
import { indexClassSession, indexLater } from './semester';
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
  /** For the teacher only: what to re-explain, from the classroom pulse (Stage 4 · 4.4). */
  reexplain: { t: number; topic: string; why: string }[];
  /** Smart replay (Stage 4 · 4.6): chapters, a two-minute recap, practice questions linked to the class moment. */
  chapters: { t: number; title: string }[];
  recap: string;
  practice: Practice[];
}
export interface Practice { question: string; options: string[]; answer: number; explain: string; t: number }
/** Classroom pulse counts over the class (never names): seconds from the start, lost, following, students. */
export interface PulsePoint { t: number; lost: number; got: number; total: number }
const MAX_PULSE = 2000;

const SYSTEM = [
  'You turn the transcript of a university class into a study pack for the students who attended (or missed) it.',
  'The transcript comes from automatic captions: expect missing words and mistakes, and ignore small talk, greetings and technical problems ("can you hear me").',
  'Write in the language the class was taught in. Be accurate: only use what was said in the class; never invent facts, dates or numbers.',
  'summary: 3 to 5 sentences on what the class covered. notes: 5 to 12 short bullet points a student would write down.',
  'keyMoments: 3 to 8 moments worth going back to, each with t = the seconds value of the line where it starts (copy it from the transcript) and a short description.',
  'flashcards: 6 to 12 cards, a question or term on the front and a short answer on the back.',
  'quiz: exactly 5 multiple-choice questions, each with 4 options, and answer = the exact text of the correct option. Test understanding, not trivia.',
  'If the transcript is too short or empty of teaching content, return short honest content (e.g. a one-sentence summary) and fewer items.',
  'chapters: 4 to 10 chapters splitting the whole class into its parts, in order, each with t = the seconds value of the line where it starts (the first one at the first line) and a short title.',
  'recap: a recap a student can read in about two minutes (220 to 320 words): what was taught, in order, with the key points and examples, in plain sentences.',
  'practice: exactly 5 practice questions for students (different from the quiz), each with 4 options, answer = the index (0 to 3) of the correct option, explain = one or two sentences on why it is right, and t = the seconds value where that point was explained in the class.',
  'reexplain (for the teacher only): when a "Class pulse" is given (how many students tapped "I\'m lost" or "Got it" over time), 0 to 4 topics worth re-explaining next class, where many students were lost: t = the seconds where the confusion started, topic = what to go over again, why = one short sentence on what seemed unclear, from what was being said at that moment. Leave it empty when there is no pulse or no clear confusion.',
].join(' ');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
    keyMoments: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, text: { type: 'STRING' } }, required: ['t', 'text'] } },
    flashcards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } },
    quiz: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'STRING' } }, required: ['question', 'options', 'answer'] } },
    reexplain: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, topic: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['t', 'topic', 'why'] } },
    chapters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, title: { type: 'STRING' } }, required: ['t', 'title'] } },
    recap: { type: 'STRING' },
    practice: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'NUMBER' }, explain: { type: 'STRING' }, t: { type: 'NUMBER' } }, required: ['question', 'options', 'answer', 'explain', 't'] } },
  },
  required: ['summary', 'notes', 'keyMoments', 'flashcards', 'quiz', 'reexplain', 'chapters', 'recap', 'practice'],
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

/** The pulse the teacher's browser sends with the transcript (counts only), within size limits. */
export function cleanPulse(raw: unknown): PulsePoint[] {
  if (!Array.isArray(raw)) return [];
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  return raw.slice(0, MAX_PULSE).map((x) => {
    const p = x as Partial<PulsePoint>;
    const total = n(p?.total, 5000);
    return { t: n(p?.t, 6 * 3600), lost: Math.min(n(p?.lost, 5000), total), got: Math.min(n(p?.got, 5000), total), total };
  }).filter((p) => p.total > 0).sort((a, b) => a.t - b.t);
}

/** The pulse for the AI: the most students lost in each half minute where anyone was. */
function pulseText(pulse: PulsePoint[]) {
  const buckets = new Map<number, PulsePoint>();
  for (const p of pulse) {
    const k = Math.floor(p.t / 30) * 30;
    const b = buckets.get(k);
    if (!b || p.lost > b.lost) buckets.set(k, { ...p, t: k });
  }
  return [...buckets.values()].filter((b) => b.lost > 0).slice(0, 60).map((b) => `${b.t} · ${b.lost} of ${b.total} lost, ${b.got} got it`).join('\n');
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
    chapters: (Array.isArray(raw.chapters) ? raw.chapters : [])
      .map((c) => ({ t: Math.max(0, Math.min(durationSec || 6 * 3600, Math.round(Number(c?.t) || 0))), title: str(c?.title, 120) }))
      .filter((c) => c.title).sort((a, b) => a.t - b.t).filter((c, i, all) => i === 0 || c.t > all[i - 1].t).slice(0, 12),
    recap: typeof raw.recap === 'string' ? raw.recap.trim().slice(0, 4000) : '',
    practice: (Array.isArray(raw.practice) ? raw.practice : [])
      .map((q) => {
        const options = (Array.isArray(q?.options) ? q.options : []).map((o) => str(o, 200)).filter(Boolean);
        const answer = Math.round(Number(q?.answer));
        return { question: str(q?.question, 500), options, answer, explain: str(q?.explain, 600), t: Math.max(0, Math.min(durationSec || 6 * 3600, Math.round(Number(q?.t) || 0))) };
      })
      .filter((q) => q.question && q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0 && q.answer <= 3).slice(0, 5),
    reexplain: (Array.isArray(raw.reexplain) ? raw.reexplain : [])
      .map((r) => ({ t: Math.max(0, Math.min(durationSec || 6 * 3600, Math.round(Number(r?.t) || 0))), topic: str(r?.topic, 200), why: str(r?.why, 400) }))
      .filter((r) => r.topic).sort((a, b) => a.t - b.t).slice(0, 4),
  };
}

async function teacherCourse(courseId: string, user: SessionUser) {
  const access = await courseAccess(courseId, user);
  if (!access) throw new NotFoundException('Course not found.');
  if (!access.canManage) throw new ForbiddenException('Only the class’s teacher can make study packs.');
  return access.course;
}

/** One AI request. Returns null when AI isn't available (the session is kept as PENDING to retry). */
async function makePack(lines: TranscriptLine[], courseName: string, durationSec: number, user: SessionUser, pulse: PulsePoint[] = []): Promise<Pack | null> {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return null;
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const lost = pulseText(pulse);
  const prompt = `Course: ${courseName}\nClass length: ${clock(durationSec)}\n\nTranscript (seconds · speaker · words):\n${lines.map((l) => `${l.t} · ${l.who} · ${l.text}`).join('\n')}`
    + (lost ? `\n\nClass pulse (seconds · students who tapped "I'm lost" / "Got it"; counts only):\n${lost}` : '');
  const raw = await geminiJson<Partial<Pack>>(SYSTEM, prompt, SCHEMA, 8000);
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
  reexplain: JSON.stringify(pack.reexplain),
  chapters: JSON.stringify(pack.chapters), recap: pack.recap || null, practice: JSON.stringify(pack.practice),
});

/** POST /api/calls/c_<course>/companion { transcript: [{ t, who, text }], durationSec, pulse?: [{ t, lost, got, total }] }. */
export async function createClassSession(callId: string, user: SessionUser, body: Record<string, unknown>) {
  if (!callId.startsWith('c_')) throw new BadRequestException('Class notes are for class calls.');
  const course = await teacherCourse(callId.slice(2), user);
  const lines = cleanTranscript(body.transcript);
  if (!lines.length) throw new BadRequestException('No transcript: captions need Chrome, Edge or Safari, and someone has to speak while class notes are on.');
  const durationSec = Math.max(lines[lines.length - 1].t, Math.min(6 * 3600, Math.round(Number(body.durationSec) || 0)));
  const startedAt = new Date(Date.now() - durationSec * 1000);

  const pulse = cleanPulse(body.pulse);
  const pack = await makePack(lines, `${course.code} ${course.name}`, durationSec, user, pulse);
  const quizId = pack ? await draftQuiz(course.id, pack, startedAt) : null;
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id, createdById: user.id, startedAt, durationSec, transcript: JSON.stringify(lines), quizId, pulse: JSON.stringify(pulse),
      recordingMaterialId: await recordingNear(course.id, startedAt),
      ...(pack ? packData(pack) : { status: 'PENDING' }),
    },
    select: { id: true, status: true },
  });
  if (pack) { await tellClass(course, session.id); indexLater(() => indexClassSession(session.id)); }
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
  const pack = await makePack(lines, `${course.code} ${course.name}`, s.durationSec, user, cleanPulse(JSON.parse(s.pulse || '[]')));
  if (!pack) throw new HttpException('AI isn’t available right now. Please try again later.', 503);
  const quizId = s.quizId ?? (await draftQuiz(course.id, pack, s.startedAt));
  await prisma.classSession.update({ where: { id: s.id }, data: { ...packData(pack), quizId } });
  await tellClass(course, s.id);
  indexLater(() => indexClassSession(s.id));
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
    select: { id: true, startedAt: true, durationSec: true, status: true, summary: true, notes: true, keyMoments: true, flashcards: true, quizId: true, recordingMaterialId: true, pulse: true, reexplain: true, chapters: true, recap: true, practice: true, transcript: true },
  });
  const parse = <T,>(v: string): T[] => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
  const quizIds = rows.map((r) => r.quizId).filter((x): x is string => !!x);
  const quizzes = quizIds.length ? await prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, status: true } }) : [];
  const quizStatus = new Map(quizzes.map((q) => [q.id, q.status]));
  return rows.map((r) => {
    const status = r.quizId ? quizStatus.get(r.quizId) ?? null : null;
    // Students only learn about the quiz once the teacher has published it.
    const quiz = r.quizId && status && (canManage || status !== 'DRAFT') ? { id: r.quizId, status } : null;
    return {
      ...r, quizId: undefined, quiz, transcript: undefined, notes: parse<string>(r.notes),
      chapters: parse<Pack['chapters'][number]>(r.chapters), practice: parse<Practice>(r.practice),
      // The teacher can make the replay for a class from before smart replay, while its transcript is kept.
      canMakeReplay: canManage && r.status === 'READY' && !r.recap && !!r.transcript, keyMoments: parse<{ t: number; text: string }>(r.keyMoments), flashcards: parse<{ front: string; back: string }>(r.flashcards),
      // The classroom pulse and what to re-explain are for the teacher only.
      pulse: canManage ? parse<PulsePoint>(r.pulse) : [], reexplain: canManage ? parse<Pack['reexplain'][number]>(r.reexplain) : [],
    };
  });
}

// ─── The study pack in my language (Stage 4 · 4.1) ──────────────────────────────────────────────

export interface PackText {
  summary: string; notes: string[]; keyMoments: { t: number; text: string }[]; flashcards: { front: string; back: string }[];
  chapters: { t: number; title: string }[]; recap: string; practice: Practice[];
}

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
    chapters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, title: { type: 'STRING' } }, required: ['t', 'title'] } },
    recap: { type: 'STRING' },
    practice: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, explain: { type: 'STRING' } }, required: ['question', 'options', 'explain'] } },
  },
  required: ['from', 'summary', 'notes', 'keyMoments', 'flashcards', 'chapters', 'recap', 'practice'],
};

/**
 * GET /api/class-sessions/[id]/translation?to=fr: the study pack in another language, for anyone in
 * the course. Made once per language (one AI request, counted for whoever asks first) and kept for
 * everyone else who reads that language. `same`: the pack is already in that language.
 */
export async function translatePack(sessionId: string, user: SessionUser, to: string): Promise<{ same: boolean; pack: PackText | null }> {
  if (!isLanguage(to)) throw new BadRequestException('Unknown language.');
  const s = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true, status: true, summary: true, notes: true, keyMoments: true, flashcards: true, chapters: true, recap: true, practice: true } });
  if (!s || s.status !== 'READY' || !(await courseAccess(s.courseId, user))) throw new NotFoundException('Study pack not found.');
  // Made again once the class gets its replay (a recap to translate too).
  const key = ['pack-tr', s.id, to, s.summary ?? '', s.recap ? 'replay' : ''];
  const saved = await cachedAi<{ same: boolean; pack: PackText | null }>(key, 30);
  if (saved) return saved;
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('Translation isn’t available right now. Please try again later.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const parse = <T,>(v: string): T[] => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
  const original: PackText = { summary: s.summary ?? '', notes: parse(s.notes), keyMoments: parse(s.keyMoments), flashcards: parse(s.flashcards), chapters: parse(s.chapters), recap: s.recap ?? '', practice: parse(s.practice) };
  const forAi = { ...original, practice: original.practice.map(({ question, options, explain }) => ({ question, options, explain })) };
  const raw = await geminiJson<Partial<PackText> & { from?: string }>(TR_SYSTEM, `Target language: ${to}\n\nStudy pack (JSON):\n${JSON.stringify(forAi)}`, TR_SCHEMA, 8000);
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
          chapters: original.chapters.map((c, i) => ({ t: c.t, title: str(raw.chapters?.[i]?.title, 160) || c.title })),
          recap: typeof raw.recap === 'string' && raw.recap.trim() ? raw.recap.trim().slice(0, 5000) : original.recap,
          // The right answer and the class moment stay those of the original.
          practice: original.practice.map((q, i) => {
            const t = raw.practice?.[i];
            const options = Array.isArray(t?.options) && t.options.length === 4 ? t.options.map((o, k) => str(o, 240) || q.options[k]) : q.options;
            return { ...q, question: str(t?.question, 600) || q.question, options, explain: str(t?.explain, 700) || q.explain };
          }),
        },
      };
  await saveAi(key, out);
  return out;
}

// ─── Smart replay (Stage 4 · 4.6) ───────────────────────────────────────────────────────────────

/** POST /api/class-sessions/[id]/replay: the teacher makes the replay for a class from before it existed. */
export async function makeReplay(sessionId: string, user: SessionUser) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!s) throw new NotFoundException('Class session not found.');
  const course = await teacherCourse(s.courseId, user);
  if (s.recap) return { ok: true };
  const lines = cleanTranscript(s.transcript ? JSON.parse(s.transcript) : []);
  if (!lines.length) throw new BadRequestException('This class’s transcript is no longer kept, so its replay can’t be made.');
  const pack = await makePack(lines, `${course.code} ${course.name}`, s.durationSec, user, cleanPulse(JSON.parse(s.pulse || '[]')));
  if (!pack) throw new HttpException('AI isn’t available right now. Please try again later.', 503);
  await prisma.classSession.update({ where: { id: s.id }, data: { chapters: JSON.stringify(pack.chapters), recap: pack.recap || null, practice: JSON.stringify(pack.practice) } });
  indexLater(() => indexClassSession(s.id));
  return { ok: true };
}

const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * GET /api/class-sessions/[id]/replay?q=: "find where it was explained". Searches what the teacher
 * said (students' own words in the class aren't shown), the chapters and the key moments; every
 * word of the search has to appear within a line and the one after it. No AI.
 */
export async function searchReplay(sessionId: string, user: SessionUser, q: string) {
  const s = await prisma.classSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true, status: true, createdById: true, transcript: true, chapters: true, keyMoments: true } });
  if (!s || s.status !== 'READY' || !(await courseAccess(s.courseId, user))) throw new NotFoundException('Class session not found.');
  const words = fold(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1).slice(0, 8);
  if (!words.length) return { results: [] };
  const has = (text: string) => { const f = fold(text); return words.every((w) => f.includes(w)); };
  const parse = <T,>(v: string | null): T[] => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const teacher = (await prisma.user.findUnique({ where: { id: s.createdById }, select: { name: true } }))?.name;
  const said = cleanTranscript(parse(s.transcript)).filter((l) => l.who === teacher);
  const results: { t: number; text: string; kind: 'said' | 'chapter' | 'moment' }[] = [
    ...parse<{ t: number; title: string }>(s.chapters).filter((c) => has(c.title)).map((c) => ({ t: c.t, text: c.title, kind: 'chapter' as const })),
    ...parse<{ t: number; text: string }>(s.keyMoments).filter((k) => has(k.text)).map((k) => ({ t: k.t, text: k.text, kind: 'moment' as const })),
  ];
  for (let i = 0; i < said.length && results.length < 30; i++) {
    const text = said[i + 1] && said[i + 1].t - said[i].t < 60 ? `${said[i].text} ${said[i + 1].text}` : said[i].text;
    // A match that spans two lines is shown once, at the first.
    if (has(text) && !results.some((r) => r.kind === 'said' && Math.abs(r.t - said[i].t) < 20)) results.push({ t: said[i].t, text: text.slice(0, 240), kind: 'said' });
  }
  return { results: results.sort((a, b) => a.t - b.t).slice(0, 20) };
}
