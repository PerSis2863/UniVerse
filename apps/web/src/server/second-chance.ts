import prisma from '@/lib/db';
import { bandOf, masteryOf } from '@/lib/mastery';
import { findMoments, groupMisses, hits, enough, keywords, LOW_SCORE, PRACTICE_WEIGHT, RETRY_WEIGHT, type Candidate, type Miss, type SessionText } from '@/lib/second-chance';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { cleanTranscript, type Practice } from './class-companion';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { masteryEvidence } from './learning-dna';
import { featureOff } from './moderation';
import { practiceQuestions, tutorAccess } from './tutor';

// Second chances (Stage 5 · D10). What a student missed in a course (quiz questions, once the quiz's
// answers are shown, and rubric criteria scored under 60%) becomes a short catch-up per concept (or
// per question, when it isn't tagged): the class moments where it was explained (smart replay), up
// to three practice questions (the class's own first, then the course tutor's if the student has AI
// left), the missed questions to try again and what the teacher said about a criterion, and the
// option to keep it all as flashcards. Practice answers count towards the concept's mastery (D1).
// Built when the student opens it, kept until they miss the same thing again. A quiz can't be
// retaken (one submission each), so "try again" is practice and never changes a grade.

const DAY = 86_400_000;
const LOOK_BACK = 120 * DAY;
const MAX_OPEN = 8;
const PRACTICE = 3;

interface PlanQuestion { question: string; options: string[]; answer: number; explain: string; t?: number; sessionId?: string; from: 'class' | 'tutor' | 'quiz'; source?: string }
interface Plan {
  moments: { sessionId: string; when: string; t: number; text: string }[];
  practice: PlanQuestion[];
  retry: PlanQuestion[];
  feedback: { criterion: string; source: string; score: number; points: number; comment: string }[];
  /** Why the course tutor didn't add practice questions, when it didn't. */
  noAi: 'off' | 'limit' | 'no-sources' | 'failed' | null;
}
interface Result { p: string; at: number; right: boolean; w: number; c?: number }

const parse = <T,>(v: unknown, fallback: T): T => { if (typeof v !== 'string') return (v as T) ?? fallback; try { return JSON.parse(v) as T; } catch { return fallback; } };

async function student(user: SessionUser, courseId: string) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Second chances are for students.');
  const a = await tutorAccess(user, courseId);
  if (!a) throw new NotFoundException('That course isn’t one of yours.');
  return a;
}

/** What a student missed in a course lately, grouped into catch-ups. */
async function candidates(studentId: string, courseId: string) {
  const since = new Date(Date.now() - LOOK_BACK);
  const [subs, returned, concepts] = await Promise.all([
    prisma.quizSubmission.findMany({
      where: { studentId, submittedAt: { gte: since }, quiz: { courseId } }, take: 60,
      select: { answers: true, submittedAt: true, quiz: { select: { title: true, status: true, dueDate: true, questions: { select: { id: true, question: true, correctAnswer: true } } } } },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId, status: 'RETURNED', returnedAt: { gte: since }, assignment: { courseId } }, take: 60,
      select: { assignmentId: true, criteriaScores: true, returnedAt: true, assignment: { select: { title: true, rubric: true } } },
    }),
    prisma.courseConcept.findMany({ where: { courseId }, select: { id: true, name: true, description: true, parentId: true } }),
  ]);
  const misses: Miss[] = [];
  const now = Date.now();
  for (const s of subs) {
    // Only once the quiz shows its answers (closed or past due), like the quiz review.
    if (s.quiz.status !== 'CLOSED' && !(s.quiz.dueDate && s.quiz.dueDate.getTime() < now)) continue;
    const answers = parse<Record<string, string>>(s.answers, {});
    for (const q of s.quiz.questions) {
      const given = answers[q.id];
      if (given != null && given !== '' && given !== q.correctAnswer) misses.push({ kind: 'QUESTION', refId: q.id, text: q.question, source: s.quiz.title, at: s.submittedAt.getTime() });
    }
  }
  for (const s of returned) {
    const rubric = parse<{ id: string; criterion: string; points: number }[]>(s.assignment.rubric, []);
    for (const sc of parse<{ id: string; score: number }[]>(s.criteriaScores, [])) {
      const c = rubric.find((r) => r.id === sc.id);
      if (c && c.points > 0 && Number(sc.score) / c.points < LOW_SCORE) misses.push({ kind: 'CRITERION', refId: `${s.assignmentId}:${c.id}`, text: c.criterion, source: s.assignment.title, at: (s.returnedAt ?? new Date()).getTime() });
    }
  }
  const tags = misses.length && concepts.length ? await prisma.conceptTag.findMany({ where: { conceptId: { in: concepts.map((c) => c.id) } }, select: { refId: true, conceptId: true } }) : [];
  const byRef = new Map<string, string[]>();
  for (const t of tags) byRef.set(t.refId, [...(byRef.get(t.refId) ?? []), t.conceptId]);
  return { list: groupMisses(misses, byRef, concepts), concepts };
}

const progress = (plan: Plan | null, results: Result[]) => {
  const total = plan ? plan.practice.length + plan.retry.length : 0;
  const current = results.filter((r) => r.p.startsWith('practice:') || r.p.startsWith('retry:'));
  return { answered: current.length, right: current.filter((r) => r.right).length, total };
};

/** GET /api/courses/:id/second-chances: my open catch-ups (newest miss first) and the ones I finished lately. */
export async function secondChances(user: SessionUser, courseId: string) {
  await student(user, courseId);
  const [{ list, concepts }, rows, evidence] = await Promise.all([
    candidates(user.id, courseId),
    prisma.secondChance.findMany({ where: { studentId: user.id, courseId }, select: { key: true, topic: true, conceptId: true, status: true, plan: true, results: true, watched: true, cards: true, missedAt: true, completedAt: true } }),
    masteryEvidence(courseId, user.id),
  ]);
  const row = new Map(rows.map((r) => [r.key, r]));
  const band = (conceptId: string | null) => (conceptId && concepts.some((c) => c.id === conceptId) ? bandOf(masteryOf(evidence(conceptId))) : null);
  const open = list.flatMap((c) => {
    const r = row.get(c.key);
    const current = !!r && r.missedAt.getTime() >= c.missedAt;
    if (current && r.status !== 'OPEN') return [];
    const b = band(c.conceptId);
    // Mastered since (other work shows it): nothing to catch up on, unless it's under way.
    if (b === 'mastered' && !(current && r.plan)) return [];
    const plan = current && r.plan ? parse<Plan | null>(r.plan, null) : null;
    return [{
      key: c.key, topic: c.topic, conceptId: c.conceptId, band: b, missedAt: new Date(c.missedAt).toISOString(),
      missed: c.misses.length, sources: [...new Set(c.misses.map((m) => m.source))].slice(0, 3),
      started: !!plan, watched: current ? r.watched : false, cards: current ? r.cards : false,
      ...progress(plan, current ? parse<Result[]>(r.results, []) : []),
    }];
  }).slice(0, MAX_OPEN);
  const done = rows.filter((r) => r.status === 'DONE' && r.completedAt && Date.now() - r.completedAt.getTime() < 30 * DAY)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime()).slice(0, 10)
    .map((r) => ({ key: r.key, topic: r.topic, band: band(r.conceptId), completedAt: r.completedAt!.toISOString(), ...progress(parse<Plan | null>(r.plan, null), parse<Result[]>(r.results, [])) }));
  return { open, done };
}

/** The catch-up as the student sees it: answers only for questions they've answered. */
function shown(r: { key: string; topic: string; status: string; plan: string | null; results: string | null; watched: boolean; cards: boolean }) {
  const plan = parse<Plan | null>(r.plan, null);
  const results = parse<Result[]>(r.results, []);
  const q = (part: 'practice' | 'retry') => (x: PlanQuestion, i: number) => {
    const res = results.find((y) => y.p === `${part}:${i}`);
    return { question: x.question, options: x.options, from: x.from, source: x.source ?? null, t: x.t ?? null, sessionId: x.sessionId ?? null, ...(res ? { right: res.right, answer: x.answer, explain: x.explain, chose: res.c ?? null } : {}) };
  };
  return {
    key: r.key, topic: r.topic, status: r.status, watched: r.watched, cards: r.cards,
    moments: plan?.moments ?? [], feedback: plan?.feedback ?? [], noAi: plan?.noAi ?? null,
    practice: (plan?.practice ?? []).map(q('practice')), retry: (plan?.retry ?? []).map(q('retry')),
    ...progress(plan, results),
  };
}

/** Class sessions' text for finding moments and class practice questions. */
async function sessionsOf(courseId: string) {
  const rows = await prisma.classSession.findMany({ where: { courseId, status: 'READY' }, orderBy: { startedAt: 'desc' }, take: 20, select: { id: true, startedAt: true, createdById: true, chapters: true, keyMoments: true, transcript: true, practice: true } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    text: { id: r.id, when: r.startedAt.toISOString(), teacher: names.get(r.createdById) ?? null, chapters: parse<{ t: number; title: string }[]>(r.chapters, []), keyMoments: parse<{ t: number; text: string }[]>(r.keyMoments, []), transcript: cleanTranscript(parse<unknown>(r.transcript, [])) } satisfies SessionText,
    practice: parse<Practice[]>(r.practice, []),
  }));
}

async function build(user: SessionUser, a: NonNullable<Awaited<ReturnType<typeof tutorAccess>>>, c: Candidate, concept: { name: string; description: string | null } | null): Promise<Plan> {
  const keys = keywords(concept?.name ?? c.topic);
  const sessions = await sessionsOf(a.courseId);
  const moments = findMoments(sessions.map((s) => s.text), keys).map(({ sessionId, when, t, text }) => ({ sessionId, when, t, text }));
  // The class's own practice questions on the topic first: free, and linked to the moment they're about.
  const practice: PlanQuestion[] = sessions.flatMap((s) => s.practice
    .filter((p) => Array.isArray(p.options) && p.answer >= 0 && p.answer < p.options.length && hits(`${p.question} ${p.options.join(' ')}`, keys) >= enough(keys))
    .map((p) => ({ question: p.question, options: p.options, answer: p.answer, explain: p.explain ?? '', t: p.t, sessionId: s.text.id, from: 'class' as const }))).slice(0, PRACTICE);
  let noAi: Plan['noAi'] = null;
  if (practice.length < PRACTICE) {
    if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) noAi = 'off';
    else if (!(await spendAi(user)).ok) noAi = 'limit';
    else {
      const topic = concept ? `${concept.name}${concept.description ? `: ${concept.description}` : ''}` : c.topic;
      const r = await practiceQuestions(a, topic, PRACTICE - practice.length).catch(() => ({ questions: null, reason: 'unavailable' as const }));
      if (r.reason === 'no-sources') noAi = 'no-sources';
      else if (!r.questions?.length) noAi = 'failed';
      else practice.push(...r.questions.slice(0, PRACTICE - practice.length).map((q) => ({ question: q.question, options: q.options, answer: q.answer, explain: q.explanation, from: 'tutor' as const, source: q.sourceTitle ?? undefined })));
    }
  }
  const questionIds = c.misses.filter((m) => m.kind === 'QUESTION').map((m) => m.refId).slice(0, PRACTICE);
  const criteria = c.misses.filter((m) => m.kind === 'CRITERION').slice(0, PRACTICE);
  const [questions, subs] = await Promise.all([
    questionIds.length ? prisma.quizQuestion.findMany({ where: { id: { in: questionIds }, quiz: { courseId: a.courseId } }, select: { id: true, question: true, options: true, correctAnswer: true, quiz: { select: { title: true } } } }) : Promise.resolve([]),
    criteria.length ? prisma.assignmentSubmission.findMany({ where: { studentId: user.id, assignmentId: { in: [...new Set(criteria.map((m) => m.refId.split(':')[0]))] } }, select: { assignmentId: true, criteriaScores: true, assignment: { select: { rubric: true } } } }) : Promise.resolve([]),
  ]);
  const retry = questionIds.flatMap((id) => {
    const q = questions.find((x) => x.id === id);
    const options = parse<string[]>(q?.options, []);
    const answer = q ? options.indexOf(q.correctAnswer) : -1;
    return q && answer >= 0 ? [{ question: q.question, options, answer, explain: '', from: 'quiz' as const, source: q.quiz.title }] : [];
  });
  const feedback = criteria.flatMap((m) => {
    const [assignmentId, criterionId] = m.refId.split(':');
    const s = subs.find((x) => x.assignmentId === assignmentId);
    const crit = parse<{ id: string; criterion: string; points: number }[]>(s?.assignment.rubric, []).find((r) => r.id === criterionId);
    const sc = parse<{ id: string; score: number; comment?: string }[]>(s?.criteriaScores, []).find((r) => r.id === criterionId);
    return crit && sc ? [{ criterion: crit.criterion, source: m.source, score: Number(sc.score) || 0, points: crit.points, comment: (sc.comment ?? '').slice(0, 1000) }] : [];
  });
  return { moments, practice, retry, feedback, noAi };
}

/** GET /api/courses/:id/second-chances?key=: one catch-up (built when it's started). */
export async function secondChance(user: SessionUser, courseId: string, key: string) {
  await student(user, courseId);
  const r = await prisma.secondChance.findUnique({ where: { studentId_courseId_key: { studentId: user.id, courseId, key } } });
  if (!r || !r.plan || r.status === 'DISMISSED') throw new NotFoundException('Start this second chance first.');
  return shown(r);
}

/**
 * POST /api/courses/:id/second-chances { action, key, ... }: start (builds it), answer { part, i, choice },
 * watched, cards (keeps its questions as flashcards), done, dismiss.
 */
export async function secondChanceAction(user: SessionUser, courseId: string, b: Record<string, unknown>) {
  const a = await student(user, courseId);
  const key = typeof b.key === 'string' ? b.key.slice(0, 200) : '';
  if (!key) throw new BadRequestException('Which second chance?');
  const where = { studentId_courseId_key: { studentId: user.id, courseId, key } };
  const existing = await prisma.secondChance.findUnique({ where });

  if (b.action === 'start' || b.action === 'dismiss') {
    const { list, concepts } = await candidates(user.id, courseId);
    const c = list.find((x) => x.key === key);
    if (!c) throw new NotFoundException('There’s nothing to catch up on there now.');
    const missedAt = new Date(c.missedAt);
    if (b.action === 'dismiss') {
      await prisma.secondChance.upsert({ where, create: { studentId: user.id, courseId, key, conceptId: c.conceptId, topic: c.topic, status: 'DISMISSED', missedAt }, update: { status: 'DISMISSED', missedAt } });
      return { dismissed: true };
    }
    // Already built for this miss: open it again as it was.
    if (existing?.plan && existing.status === 'OPEN' && existing.missedAt.getTime() >= c.missedAt) return shown(existing);
    const concept = c.conceptId ? concepts.find((x) => x.id === c.conceptId) ?? null : null;
    const plan = await build(user, a, c, concept);
    // Answers from an earlier round still count towards mastery, under a name the new questions don't use.
    const kept = parse<Result[]>(existing?.results, []).map((r) => ({ ...r, p: r.p.startsWith('old:') ? r.p : `old:${r.p}` }));
    const data = { conceptId: c.conceptId, topic: c.topic, status: 'OPEN', plan: JSON.stringify(plan), results: kept.length ? JSON.stringify(kept) : null, watched: false, cards: false, missedAt, completedAt: null };
    const r = await prisma.secondChance.upsert({ where, create: { studentId: user.id, courseId, key, ...data }, update: data });
    return shown(r);
  }

  if (!existing?.plan || existing.status === 'DISMISSED') throw new NotFoundException('Start this second chance first.');
  const plan = parse<Plan>(existing.plan, { moments: [], practice: [], retry: [], feedback: [], noAi: null });
  const results = parse<Result[]>(existing.results, []);
  switch (b.action) {
    case 'answer': {
      const part = b.part === 'retry' ? 'retry' : 'practice';
      const i = Number(b.i);
      const q = Number.isInteger(i) ? plan[part][i] : undefined;
      const choice = Number(b.choice);
      if (!q || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new BadRequestException('Choose an answer.');
      const p = `${part}:${i}`;
      // The first answer is the one that counts.
      const prior = results.find((r) => r.p === p);
      if (!prior) {
        results.push({ p, at: Date.now(), right: choice === q.answer, w: part === 'retry' ? RETRY_WEIGHT : PRACTICE_WEIGHT, c: choice });
        await prisma.secondChance.update({ where, data: { results: JSON.stringify(results) } });
      }
      // Progress first: its count of right answers mustn't replace whether this one was right.
      return { ...progress(plan, results), right: prior ? prior.right : choice === q.answer, chose: prior ? prior.c ?? null : choice, answer: q.answer, explain: q.explain };
    }
    case 'watched':
      await prisma.secondChance.update({ where, data: { watched: true } });
      return { watched: true };
    case 'cards': {
      if (existing.cards) return { added: 0 };
      const qs = [...plan.retry, ...plan.practice].slice(0, 6);
      if (!qs.length) throw new BadRequestException('There are no questions here to make flashcards from.');
      if ((await prisma.studyCard.count({ where: { userId: user.id } })) + qs.length > 1000) throw new BadRequestException('Your deck is full (1,000 cards). Delete some first.');
      await prisma.studyCard.createMany({ data: qs.map((q) => ({ userId: user.id, courseId, front: q.question.slice(0, 300), back: `${q.options[q.answer]}${q.explain ? `: ${q.explain}` : ''}`.slice(0, 600), sourceTitle: `Second chance · ${existing.topic}`.slice(0, 200) })) });
      await prisma.secondChance.update({ where, data: { cards: true } });
      return { added: qs.length };
    }
    case 'done':
      await prisma.secondChance.update({ where, data: { status: 'DONE', completedAt: new Date() } });
      return { done: true, ...progress(plan, results) };
    default: throw new BadRequestException('Unknown action.');
  }
}
