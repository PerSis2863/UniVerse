import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { isLanguage, LANGUAGES } from '@/lib/languages';
import { isAppFileUrl, deleteFile } from '@/lib/storage';
import {
  ORAL_KINDS, cleanScores, cleanTranscript, defaultRubric, examinerPrompt, isOralKind, maxOf, parseRubric, studentWords, totalOf, transcriptForScoring,
  type Criterion, type Line, type OralKind, type Score,
} from '@/lib/oral';
import type { Body } from './body';
import { spendAi } from './ai-budget';
import { notify, notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ConflictException, HttpException, NotFoundException } from './http';
import { liveToken } from './live-token';
import { featureOff } from './moderation';
import { publish } from './realtime';

// AI viva and oral-exam coach (Stage 5 · D11). Students practise vivas, debates, language orals and
// interviews by voice with an AI examiner (Gemini Live, src/server/live-token.ts) that asks
// follow-ups; afterwards the AI scores the transcript on a rubric (clarity, depth, evidence…) with
// quotes as evidence. A teacher can set a low-stakes oral check for a course: each student does it
// once, their voice is recorded with the transcript, the AI suggests scores, and the teacher
// confirms them (students see the result only then). Practice counts as AI requests for the
// student (the voice session and the scoring); an oral check counts for the site only, so a student's
// daily allowance never stops them doing what their teacher set.

const PRACTICE_MINUTES = [5, 8, 10];
/** Fewer words than this from the student can't be scored fairly. */
const MIN_WORDS_TO_SCORE = 40;

const ai = async () => !!process.env.GEMINI_API_KEY && !(await featureOff('ai'));
const json = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };
const rubricOf = (s: string, kind: string) => parseRubric(json(s, null)) ?? defaultRubric(isOralKind(kind) ? kind : 'VIVA');
type Summary = { summary: string; strengths: string[]; nextSteps: string[] };

const SCORE_SYSTEM = `You score a student's oral exam from its transcript, for UniVerse, a learning platform. The transcript comes from automatic speech recognition: ignore small recognition errors and judge what the student meant.
Score only the student's answers, never the examiner's questions. For each rubric criterion give a whole-number score from 0 to its maximum, a one-sentence reason, and a short quote of the student's own words (copied exactly from the transcript) as evidence, or an empty quote. If the student said too little to judge a criterion, give a low score and say so.
Then write a two-sentence summary, up to 3 strengths and up to 3 next steps, speaking to the student kindly and specifically. Write in the language the student spoke.`;
const SCORE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scores: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, score: { type: 'NUMBER' }, reason: { type: 'STRING' }, quote: { type: 'STRING' } }, required: ['id', 'score', 'reason', 'quote'] } },
    summary: { type: 'STRING' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    nextSteps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['scores', 'summary', 'strengths', 'nextSteps'],
};

/** The AI's suggested scores for a transcript; null when there's too little to score or the AI didn't answer. */
export async function scoreOral(o: { kind: OralKind; topic: string; lang: string; rubric: Criterion[]; lines: Line[] }): Promise<{ scores: Score[]; summary: Summary } | null> {
  const said = studentWords(o.lines);
  if (said.split(/\s+/).filter(Boolean).length < MIN_WORDS_TO_SCORE) return null;
  const prompt = `Kind of oral: ${ORAL_KINDS[o.kind].label}. Topic: ${o.topic || '(chosen by the student)'}.${o.lang && isLanguage(o.lang) ? ` Spoken in ${LANGUAGES[o.lang].name}: judge the language too.` : ''}
Rubric (JSON): ${JSON.stringify(o.rubric)}
Transcript:
${transcriptForScoring(o.lines)}`;
  const out = await geminiJson<{ scores: unknown; summary: unknown; strengths: unknown; nextSteps: unknown }>(SCORE_SYSTEM, prompt, SCORE_SCHEMA, 2500);
  if (!out) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 3).map((x) => x.trim().slice(0, 300));
  return {
    scores: cleanScores(out.scores, o.rubric, said),
    summary: { summary: typeof out.summary === 'string' ? out.summary.trim().slice(0, 800) : '', strengths: list(out.strengths), nextSteps: list(out.nextSteps) },
  };
}

/** A session as the student or teacher sees it. `ai`: include the AI's draft (a check's draft stays hidden from the student until confirmed). */
function view(s: { id: string; kind: string; topic: string; lang: string; rubric: string; transcript: string; durationSec: number; audioUrl: string | null; aiScores: string | null; aiSummary: string | null; status: string; finalScores: string | null; teacherComment: string | null; confirmedAt: Date | null; createdAt: Date; checkId: string | null; courseId: string | null }, ai: boolean, transcript = true) {
  const rubric = rubricOf(s.rubric, s.kind);
  const aiScores = ai && s.aiScores ? cleanScores(json(s.aiScores, []), rubric) : null;
  const final = s.finalScores ? cleanScores(json(s.finalScores, []), rubric) : null;
  const shown = final ?? (s.status === 'PRACTICE' ? aiScores : null);
  return {
    id: s.id, kind: s.kind, topic: s.topic, lang: s.lang, checkId: s.checkId, courseId: s.courseId, status: s.status, durationSec: s.durationSec, createdAt: s.createdAt, confirmedAt: s.confirmedAt,
    rubric, max: maxOf(rubric), scores: shown, total: shown ? totalOf(shown) : null,
    aiScores, aiTotal: aiScores ? totalOf(aiScores) : null,
    summary: ai || s.status === 'CONFIRMED' ? json<Summary | null>(s.aiSummary, null) : null,
    teacherComment: s.teacherComment, audioUrl: s.audioUrl,
    ...(transcript ? { transcript: json<Line[]>(s.transcript, []) } : {}),
  };
}

// ── Students ───────────────────────────────────────────────────────────────────────────────────

/** GET /api/orals: oral checks set in my courses (and how I did), and my recent practice. */
export async function oralOverview(user: SessionUser) {
  const courseIds = (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true }, take: 90 })).map((e) => e.courseId);
  const [checks, practice] = await Promise.all([
    courseIds.length ? prisma.oralCheck.findMany({
      where: { courseId: { in: courseIds }, OR: [{ status: 'OPEN' }, { sessions: { some: { userId: user.id } } }] },
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, title: true, kind: true, topic: true, minutes: true, dueAt: true, status: true, rubric: true, course: { select: { id: true, code: true, name: true } }, sessions: { where: { userId: user.id }, select: { id: true, status: true, finalScores: true, rubric: true, kind: true, createdAt: true } } },
    }) : Promise.resolve([]),
    prisma.oralSession.findMany({ where: { userId: user.id, checkId: null }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, topic: true, rubric: true, aiScores: true, durationSec: true, createdAt: true, courseId: true } }),
  ]);
  const now = Date.now();
  return {
    checks: checks.map((c) => {
      const mine = c.sessions[0];
      const rubric = rubricOf(c.rubric, c.kind);
      const final = mine?.finalScores ? cleanScores(json(mine.finalScores, []), rubric) : null;
      return {
        id: c.id, title: c.title, kind: c.kind, topic: c.topic, minutes: c.minutes, dueAt: c.dueAt, course: c.course,
        open: c.status === 'OPEN' && (!c.dueAt || c.dueAt.getTime() > now),
        mine: mine ? { id: mine.id, status: mine.status, total: final ? totalOf(final) : null, max: maxOf(rubric) } : null,
      };
    }),
    practice: practice.map((p) => {
      const rubric = rubricOf(p.rubric, p.kind);
      const scores = p.aiScores ? cleanScores(json(p.aiScores, []), rubric) : null;
      return { id: p.id, kind: p.kind, topic: p.topic, durationSec: p.durationSec, createdAt: p.createdAt, courseId: p.courseId, total: scores ? totalOf(scores) : null, max: maxOf(rubric) };
    }),
  };
}

/** POST /api/orals { action: 'start', checkId } or { action: 'start', kind, topic, courseId?, lang?, minutes }: a voice session with the examiner. */
export async function startOral(user: SessionUser, b: Body) {
  if (!(await ai())) throw new HttpException('Oral practice isn’t available right now.', 503);
  const first = (user.name || '').split(' ')[0];
  let setup: { kind: OralKind; topic: string; questions?: string; lang: string; minutes: number; course?: string; rubric: Criterion[]; title: string; checkId?: string };
  if (typeof b.checkId === 'string' && b.checkId) {
    const check = await prisma.oralCheck.findUnique({ where: { id: b.checkId }, include: { course: { select: { code: true, name: true } } } });
    const access = check && (await courseAccess(check.courseId, user));
    if (!check || !access) throw new NotFoundException('Oral check not found.');
    const kind = isOralKind(check.kind) ? check.kind : 'VIVA';
    setup = { kind, topic: check.topic, questions: check.questions, lang: check.lang, minutes: check.minutes, course: `${check.course.code} ${check.course.name}`, rubric: rubricOf(check.rubric, kind), title: check.title };
    // The teacher (or an admin) can try their own check; that's practice, not an attempt.
    if (!access.canManage) {
      if (check.status !== 'OPEN' || (check.dueAt && check.dueAt.getTime() < Date.now())) throw new BadRequestException('This oral check is closed.');
      const had = await prisma.oralSession.findUnique({ where: { checkId_userId: { checkId: check.id, userId: user.id } }, select: { status: true } });
      if (had) throw new ConflictException(had.status === 'STARTED' ? 'You’ve started this oral check already. If it stopped part way, ask your teacher to let you try again.' : 'You’ve done this oral check already.');
      // Counted for the site only: an assigned oral never waits on the student's own allowance.
      const spend = await spendAi(null);
      if (!spend.ok) throw new HttpException(spend.message, 429);
      await prisma.oralSession.create({ data: { userId: user.id, courseId: check.courseId, checkId: check.id, kind, topic: check.topic, lang: check.lang, rubric: JSON.stringify(setup.rubric), status: 'STARTED' } });
      setup.checkId = check.id;
    } else {
      const spend = await spendAi(user);
      if (!spend.ok) throw new HttpException(spend.message, 429);
    }
  } else {
    if (!isOralKind(b.kind)) throw new BadRequestException('Choose the kind of oral.');
    const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 200) : '';
    if (b.kind !== 'INTERVIEW' && topic.length < 3) throw new BadRequestException('Say what the oral is about.');
    const lang = typeof b.lang === 'string' && isLanguage(b.lang) ? b.lang : '';
    if (b.kind === 'LANGUAGE' && !lang) throw new BadRequestException('Choose the language you’re learning.');
    const minutes = PRACTICE_MINUTES.includes(Number(b.minutes)) ? Number(b.minutes) : 8;
    let course: string | undefined;
    if (typeof b.courseId === 'string' && b.courseId) {
      const access = await courseAccess(b.courseId, user);
      if (!access) throw new NotFoundException('Course not found.');
      course = `${access.course.code} ${access.course.name}`;
    }
    const spend = await spendAi(user);
    if (!spend.ok) throw new HttpException(spend.message, 429);
    setup = { kind: b.kind, topic, lang, minutes, course, rubric: defaultRubric(b.kind), title: `${ORAL_KINDS[b.kind].label} practice` };
  }
  try {
    // A minute more than the exam, so the examiner can finish its sentence.
    const { token, model } = await liveToken(examinerPrompt({ ...setup, name: first }), setup.minutes + 1);
    return { token, model, minutes: setup.minutes, rubric: setup.rubric, kind: setup.kind, topic: setup.topic, lang: setup.lang, title: setup.title, attempt: !!setup.checkId };
  } catch (e) {
    console.error('oral examiner token failed:', e);
    // The attempt never began: it can be started again.
    if (setup.checkId) await prisma.oralSession.deleteMany({ where: { checkId: setup.checkId, userId: user.id, status: 'STARTED' } });
    throw new HttpException('The examiner is busy right now. Please try again in a moment.', 503);
  }
}

/** POST /api/orals { action: 'finish', … }: the oral ended. Practice is scored now; a check goes to the teacher. */
export async function finishOral(user: SessionUser, b: Body) {
  const lines = cleanTranscript(b.lines);
  const durationSec = Math.max(0, Math.min(3600, Math.round(Number(b.durationSec) || 0)));
  if (b.audioUrl != null && b.audioUrl !== '' && !isAppFileUrl(b.audioUrl)) throw new BadRequestException('Upload the recording first.');
  const audioUrl = typeof b.audioUrl === 'string' && b.audioUrl ? b.audioUrl : null;

  if (typeof b.checkId === 'string' && b.checkId) {
    const session = await prisma.oralSession.findUnique({ where: { checkId_userId: { checkId: b.checkId, userId: user.id } }, include: { check: { select: { id: true, title: true, teacherId: true, courseId: true } } } });
    if (!session || !session.check) throw new NotFoundException('Oral check not found.');
    if (session.status !== 'STARTED') throw new ConflictException('You’ve sent this oral check already.');
    const kind = isOralKind(session.kind) ? session.kind : 'VIVA';
    const scored = (await spendAi(null)).ok ? await scoreOral({ kind, topic: session.topic, lang: session.lang, rubric: rubricOf(session.rubric, kind), lines }).catch(() => null) : null;
    await prisma.oralSession.update({
      where: { id: session.id },
      data: { transcript: JSON.stringify(lines), durationSec, audioUrl, status: 'SUBMITTED', aiScores: scored ? JSON.stringify(scored.scores) : null, aiSummary: scored ? JSON.stringify(scored.summary) : null },
    });
    const c = session.check;
    await notify(c.teacherId, { title: `${user.name ?? 'A student'} did the oral check “${c.title}”`, body: scored ? 'The AI has suggested scores. Check and confirm them.' : 'Score it from the recording and the transcript.', link: `/teacher/blackboard?course=${c.courseId}&tab=orals`, type: 'grade', email: false });
    publish([c.teacherId], { type: 'refresh', keys: [`/api/oral-checks/${c.id}`, `/api/courses/${c.courseId}/oral-checks`] });
    return { id: session.id, status: 'SUBMITTED' as const };
  }

  // Practice.
  if (!isOralKind(b.kind)) throw new BadRequestException('Choose the kind of oral.');
  const kind = b.kind;
  const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 200) : '';
  const lang = typeof b.lang === 'string' && isLanguage(b.lang) ? b.lang : '';
  let courseId: string | null = null;
  if (typeof b.courseId === 'string' && b.courseId && (await courseAccess(b.courseId, user))) courseId = b.courseId;
  const rubric = defaultRubric(kind);
  let scored: Awaited<ReturnType<typeof scoreOral>> = null;
  let note = '';
  if (studentWords(lines).split(/\s+/).filter(Boolean).length < MIN_WORDS_TO_SCORE) note = 'That was too short to score. Try a longer practice: answer in full sentences and say why.';
  else if (!(await ai())) note = 'Scoring isn’t available right now. Your transcript is saved.';
  else {
    const spend = await spendAi(user);
    if (!spend.ok) note = `${spend.message} Your transcript is saved.`;
    else {
      scored = await scoreOral({ kind, topic, lang, rubric, lines }).catch(() => null);
      if (!scored) note = 'The AI couldn’t score this one. Your transcript is saved.';
    }
  }
  const s = await prisma.oralSession.create({
    data: { userId: user.id, courseId, kind, topic, lang, rubric: JSON.stringify(rubric), transcript: JSON.stringify(lines), durationSec, status: 'PRACTICE', aiScores: scored ? JSON.stringify(scored.scores) : null, aiSummary: scored ? JSON.stringify(scored.summary) : null },
  });
  return { ...view(s, true), note };
}

/** GET /api/orals/:id: my oral (or, for its teacher, a student's attempt at their check). */
export async function oralSession(user: SessionUser, id: string) {
  const s = await prisma.oralSession.findUnique({ where: { id }, include: { check: { select: { title: true, courseId: true } }, user: { select: { name: true } } } });
  if (!s) throw new NotFoundException('Not found.');
  const mine = s.userId === user.id;
  const teacher = !mine && !!s.check && !!(await courseAccess(s.check.courseId, user))?.canManage;
  if (!mine && !teacher) throw new NotFoundException('Not found.');
  return { ...view(s, teacher || s.status === 'PRACTICE'), title: s.check?.title ?? null, student: teacher ? s.user.name : null };
}

/** DELETE /api/orals/:id: forget one of my practice orals. */
export async function deleteOral(user: SessionUser, id: string) {
  const n = await prisma.oralSession.deleteMany({ where: { id, userId: user.id, status: 'PRACTICE' } });
  if (!n.count) throw new NotFoundException('Not found.');
  return { ok: true };
}

// ── Teachers ───────────────────────────────────────────────────────────────────────────────────

/** GET /api/courses/:id/oral-checks: the course's oral checks (teacher: with how many did each; student: the open ones and mine). */
export async function courseOralChecks(user: SessionUser, courseId: string) {
  const access = await courseAccess(courseId, user);
  if (!access) throw new NotFoundException('Course not found.');
  if (!access.canManage) return { checks: (await oralOverview(user)).checks.filter((c) => c.course.id === courseId), canManage: false };
  const checks = await prisma.oralCheck.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, kind: true, topic: true, minutes: true, dueAt: true, status: true, createdAt: true, sessions: { select: { status: true } } } });
  const enrolled = access.course._count.enrollments;
  return {
    canManage: true, enrolled,
    checks: checks.map(({ sessions, ...c }) => ({ ...c, done: sessions.filter((x) => x.status !== 'STARTED').length, toConfirm: sessions.filter((x) => x.status === 'SUBMITTED').length, confirmed: sessions.filter((x) => x.status === 'CONFIRMED').length })),
  };
}

/** POST /api/courses/:id/oral-checks { title, kind, topic, questions, lang, rubric, minutes, dueAt }: a new oral check; students are told in the app. */
export async function createOralCheck(user: SessionUser, courseId: string, b: Body) {
  const access = await courseAccess(courseId, user);
  if (!access?.canManage) throw new NotFoundException('Course not found.');
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
  if (title.length < 3) throw new BadRequestException('Give the oral check a title.');
  if (!isOralKind(b.kind)) throw new BadRequestException('Choose the kind of oral.');
  const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 300) : '';
  if (topic.length < 3) throw new BadRequestException('Say what the oral is about.');
  const questions = typeof b.questions === 'string' ? b.questions.trim().slice(0, 2000) : '';
  const lang = typeof b.lang === 'string' && isLanguage(b.lang) ? b.lang : '';
  if (b.kind === 'LANGUAGE' && !lang) throw new BadRequestException('Choose the language students speak.');
  const minutes = Math.round(Number(b.minutes));
  if (!(minutes >= 3 && minutes <= 15)) throw new BadRequestException('Choose 3 to 15 minutes.');
  const rubric = b.rubric == null ? defaultRubric(b.kind) : parseRubric(b.rubric);
  if (!rubric) throw new BadRequestException('Give the rubric at least one criterion with a name and 1 to 10 points.');
  let dueAt: Date | null = null;
  if (b.dueAt != null && b.dueAt !== '') {
    dueAt = new Date(String(b.dueAt));
    if (isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now()) throw new BadRequestException('Choose a due date in the future.');
  }
  const check = await prisma.oralCheck.create({ data: { courseId, teacherId: user.id, title, kind: b.kind, topic, questions, lang, rubric: JSON.stringify(rubric), minutes, dueAt } });
  const students = (await prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true } })).map((e) => e.studentId);
  await notifyMany(students, { title: `New oral check: ${title}`, body: `${access.course.code}: a ${minutes}-minute ${ORAL_KINDS[b.kind].label.toLowerCase()} with the AI examiner. Your teacher confirms the score.`, link: '/student/oral-practice', type: 'reminder', email: false });
  return { id: check.id };
}

async function managed(user: SessionUser, checkId: string) {
  const check = await prisma.oralCheck.findUnique({ where: { id: checkId } });
  if (!check || !(await courseAccess(check.courseId, user))?.canManage) throw new NotFoundException('Oral check not found.');
  return check;
}

/** GET /api/oral-checks/:id: a check with every student's attempt (and who hasn't done it yet). */
export async function oralCheckDetail(user: SessionUser, checkId: string) {
  const check = await managed(user, checkId);
  const [sessions, enrolled] = await Promise.all([
    prisma.oralSession.findMany({ where: { checkId }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } }),
    prisma.enrollment.findMany({ where: { courseId: check.courseId }, select: { student: { select: { id: true, name: true } } }, take: 500 }),
  ]);
  const did = new Set(sessions.map((s) => s.userId));
  return {
    check: { ...check, rubric: rubricOf(check.rubric, check.kind) },
    sessions: sessions.map((s) => ({ ...view(s, true, false), student: s.user })),
    notYet: enrolled.map((e) => e.student).filter((u) => !did.has(u.id)),
  };
}

/** POST /api/oral-checks/:id { action: 'confirm', sessionId, scores, comment } | 'retry' (sessionId) | 'close' | 'open'. */
export async function oralCheckAction(user: SessionUser, checkId: string, b: Body) {
  const check = await managed(user, checkId);
  if (b.action === 'close' || b.action === 'open') {
    await prisma.oralCheck.update({ where: { id: check.id }, data: { status: b.action === 'close' ? 'CLOSED' : 'OPEN' } });
    return { ok: true };
  }
  const s = typeof b.sessionId === 'string' ? await prisma.oralSession.findFirst({ where: { id: b.sessionId, checkId } }) : null;
  if (!s) throw new NotFoundException('Attempt not found.');
  if (b.action === 'retry') {
    // Lets the student do it again (e.g. their connection dropped); the old attempt and recording go.
    if (s.audioUrl) await deleteFile(s.audioUrl).catch(() => {});
    await prisma.oralSession.delete({ where: { id: s.id } });
    await notify(s.userId, { title: `You can do the oral check “${check.title}” again`, body: 'Your teacher has given you another try.', link: '/student/oral-practice', type: 'reminder', email: false });
    publish([s.userId], { type: 'refresh', keys: ['/api/orals'] });
    return { ok: true };
  }
  if (b.action !== 'confirm') throw new BadRequestException('Unknown action.');
  if (s.status === 'STARTED') throw new BadRequestException('The student hasn’t finished this oral yet.');
  const rubric = rubricOf(s.rubric, s.kind);
  const ai = cleanScores(json(s.aiScores, []), rubric);
  const sent = Array.isArray(b.scores) ? (b.scores as { id?: unknown; score?: unknown }[]) : [];
  if (rubric.some((c) => !Number.isFinite(Number(sent.find((x) => x?.id === c.id)?.score)))) throw new BadRequestException('Give a score for every criterion.');
  // The teacher's numbers, with the AI's reasons and quotes kept as the evidence.
  const final = cleanScores(rubric.map((c) => ({ ...ai.find((a) => a.id === c.id), id: c.id, score: Number(sent.find((x) => x?.id === c.id)?.score) })), rubric);
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 2000) : '';
  await prisma.oralSession.update({ where: { id: s.id }, data: { status: 'CONFIRMED', finalScores: JSON.stringify(final), teacherComment: comment || null, confirmedById: user.id, confirmedAt: new Date() } });
  await notify(s.userId, { title: `Your oral check “${check.title}” is marked`, body: `${totalOf(final)} / ${maxOf(rubric)}${comment ? `: ${comment.slice(0, 200)}` : ''}`, link: '/student/oral-practice', type: 'grade', email: false });
  publish([s.userId], { type: 'refresh', keys: ['/api/orals', `/api/orals/${s.id}`] });
  return { ok: true, total: totalOf(final), max: maxOf(rubric) };
}

/** DELETE /api/oral-checks/:id: the check, every attempt and their recordings. */
export async function deleteOralCheck(user: SessionUser, checkId: string) {
  const check = await managed(user, checkId);
  const audio = await prisma.oralSession.findMany({ where: { checkId, audioUrl: { not: null } }, select: { audioUrl: true } });
  await Promise.all(audio.map((a) => deleteFile(a.audioUrl!).catch(() => {})));
  await prisma.oralCheck.delete({ where: { id: check.id } });
  return { ok: true };
}
