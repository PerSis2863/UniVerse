import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { cleanTimeZone } from '@/lib/home-time';
import { nextDigestAt } from '@/lib/notify-prefs';
import { planLimits } from '@/lib/plan-limits';
import { cleanRule, groupQuestions, MATH_RULE, tutorOff, type TutorMode } from '@/lib/tutor-rules';
import { words } from '@/lib/text-search';
import { cachedAi, saveAi, spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { geminiJson, geminiJsonImage } from './gemini';
import { BadRequestException, ForbiddenException, HttpException } from './http';
import { indexClassSession } from './semester';
import { aiOn, tutorClosed, type Access } from './tutor';

// The course tutor's study tools (Stage 5 · Q13): help with a photo of a homework problem (hints
// first, one at a time; the worked answer only when asked, never in a hints-only course), practice
// questions from what was said in class (each with a link to that moment of the class), the
// teacher's rule for the tutor (hints only, their own instruction, off before an exam), the course's
// common questions for the teacher (no names), and the evening flashcard reminder.

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
const portalOf = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');

/** Refuses when AI is off, or the teacher has turned the tutor off for students. */
export async function assertTutorOpen(a: Access) {
  if (!(await aiOn())) throw new HttpException('The AI tutor isn’t available right now.', 503);
  const closed = tutorClosed(a);
  if (closed) throw new HttpException(closed, 423);
}

// ── A photo of a homework problem ────────────────────────────────────────────────────────────────

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PHOTO = 5_600_000; // base64 characters, about 4 MB
interface Homework { readable: boolean; problem: string; topic: string; hints: string[]; answer: string }

const homeworkSystem = (a: Access) => `You are a patient tutor for the course ${a.courseCode} "${a.courseName}". The student sends a photo of a homework problem.
- "problem": the problem exactly as written in the photo (its own language). If there's no readable problem in the photo, set "readable" to false and leave the rest empty.
- "topic": the topic in a few words.
- "hints": three hints that get gradually stronger. The first only points to the idea or method to use; the second sets up the first step; the third does most of the work and leaves the last step to the student. A hint never gives the final answer. Under 60 words each.
- "answer": the full worked solution, step by step, with the final answer, under 250 words.
${MATH_RULE}`;

async function photoRef(data: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const homeworkKey = (a: Access, user: SessionUser, ref: string) => ['homework', a.courseId, user.id, ref];
const firstStep = (ref: string, h: Homework, a: Access, mode: TutorMode) => ({
  ref, readable: h.readable, problem: h.problem, topic: h.topic, hints: h.hints.slice(0, 1), total: h.hints.length,
  answerAllowed: !a.rule.hintsOnly && mode !== 'hints',
});

/** POST { image: { mimeType, data } }: reads the problem and gives the first hint (one AI request; the same photo again is free). */
export async function homeworkPhoto(a: Access, user: SessionUser, b: Record<string, unknown>, mode: TutorMode) {
  await assertTutorOpen(a);
  const img = (b.image ?? {}) as Record<string, unknown>;
  const mimeType = typeof img.mimeType === 'string' ? img.mimeType.toLowerCase() : '';
  const data = typeof img.data === 'string' ? img.data.replace(/^data:[^,]+,/, '') : '';
  if (!PHOTO_TYPES.includes(mimeType) || !data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) throw new BadRequestException('Send a photo (JPEG, PNG or WebP).');
  if (data.length > MAX_PHOTO) throw new BadRequestException('That photo is too big. Try again a little further away.');
  const ref = await photoRef(data);
  const saved = await cachedAi<Homework>(homeworkKey(a, user, ref));
  if (saved) return firstStep(ref, saved, a, mode);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const out = await geminiJsonImage<Homework>(homeworkSystem(a), 'The photo of the homework problem.', { mimeType, data }, {
    type: 'OBJECT',
    properties: { readable: { type: 'BOOLEAN' }, problem: { type: 'STRING' }, topic: { type: 'STRING' }, hints: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'STRING' } },
    required: ['readable', 'problem', 'topic', 'hints', 'answer'],
  }, 2000);
  if (!out) throw new HttpException('The tutor couldn’t look at the photo right now. Please try again.', 503);
  const h: Homework = {
    readable: out.readable !== false && !!out.problem?.trim(),
    problem: (out.problem ?? '').slice(0, 2000), topic: (out.topic ?? '').slice(0, 120),
    hints: (Array.isArray(out.hints) ? out.hints : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 4).map((x) => x.slice(0, 600)),
    answer: (out.answer ?? '').slice(0, 3000),
  };
  if (!h.readable) h.hints = [];
  await saveAi(homeworkKey(a, user, ref), h);
  if (h.readable) await logAiUse(user.id, { kind: 'homework', detail: `Photo: ${h.problem}`, courseId: a.courseId });
  return firstStep(ref, h, a, mode);
}

/** POST { ref, hints: n } → the first n hints; { ref, answer: true } → the worked answer (not in a hints-only course). No AI request. */
export async function homeworkMore(a: Access, user: SessionUser, b: Record<string, unknown>, mode: TutorMode) {
  await assertTutorOpen(a);
  const ref = typeof b.ref === 'string' && /^[0-9a-f]{32}$/.test(b.ref) ? b.ref : '';
  const h = ref ? await cachedAi<Homework>(homeworkKey(a, user, ref)) : null;
  if (!h) throw new HttpException('That photo has gone; send it again.', 404);
  if (b.answer === true) {
    if (a.rule.hintsOnly) throw new ForbiddenException('Your teacher has set this course’s tutor to hints only.');
    if (mode === 'hints') throw new BadRequestException('You chose hints only. Switch the mode to see the answer.');
    await logAiUse(user.id, { kind: 'homework', detail: `Answer shown: ${h.problem}`, courseId: a.courseId });
    return { ref, hints: h.hints, total: h.hints.length, answer: h.answer };
  }
  const n = Math.max(1, Math.min(h.hints.length, Math.floor(Number(b.hints)) || 1));
  return { ref, hints: h.hints.slice(0, n), total: h.hints.length };
}

// ── Practice from the classes ────────────────────────────────────────────────────────────────────

interface ClassPassage { title: string; body: string; link: string; at: number | null; day: string | null }

/** What was said in the course's classes (and their study packs), best matching the topic or the latest. */
export async function classPassages(courseId: string, topic: string, k = 8): Promise<ClassPassage[]> {
  const scope = `course:${courseId}`;
  const terms = [...new Set(words(topic))].slice(0, 10);
  const search = async () => {
    if (terms.length) {
      const hit = await prisma.$queryRawUnsafe<ClassPassage[]>(
        `SELECT p."title", p."body", p."link", p."at", p."day" FROM "memory_fts" JOIN "memory_passages" p ON p."id" = "memory_fts".rowid
         WHERE "memory_fts" MATCH ? AND p."scope" = ? AND p."kind" IN ('transcript', 'pack') ORDER BY bm25("memory_fts", 2.0, 1.0) LIMIT ?`,
        terms.map((t) => `"${t}"`).join(' OR '), scope, k,
      );
      if (hit.length) return hit;
    }
    const recent = await prisma.$queryRawUnsafe<ClassPassage[]>(
      `SELECT p."title", p."body", p."link", p."at", p."day" FROM "memory_passages" p WHERE p."scope" = ? AND p."kind" IN ('transcript', 'pack') ORDER BY p."day" DESC, p."id" DESC LIMIT 40`,
      scope,
    );
    const step = Math.max(1, Math.floor(recent.length / k));
    return recent.filter((_, i) => i % step === 0).slice(0, k);
  };
  let found = await search();
  if (!found.length) {
    // Classes not in the index yet: the latest few, then look again.
    const sessions = await prisma.classSession.findMany({ where: { courseId, status: 'READY' }, orderBy: { startedAt: 'desc' }, take: 4, select: { id: true } });
    for (const s of sessions) await indexClassSession(s.id).catch((e) => console.error('class index:', e));
    if (sessions.length) found = await search();
  }
  return found.map((p) => ({ ...p, at: p.at == null ? null : Number(p.at) }));
}

/** POST practice { from: 'classes' }: questions from what was said in class, each linked to its moment (one AI request). */
export async function practiceFromClasses(a: Access, user: SessionUser, topic: string, count: number) {
  await assertTutorOpen(a);
  const ps = await classPassages(a.courseId, topic, 8);
  if (!ps.length) throw new HttpException('There are no class recordings with notes for this course yet. Try the materials instead.', 409);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  await logAiUse(user.id, { kind: 'study', detail: `Practice from the classes${topic.trim() ? `: ${topic}` : ''}`, courseId: a.courseId });
  const cite = ps.map((p, i) => `[${i + 1}] (${p.title})\n${p.body}`).join('\n\n');
  const out = await geminiJson<{ questions: { question: string; options: string[]; answer: number; explanation: string; source: number }[] }>(
    `You write practice questions for students from what their teacher said in class. Make ${count} multiple-choice questions that test understanding of what was taught (not trivia about the class itself), each with 4 plausible options and exactly one correct answer, and a one- or two-sentence explanation. "source" is the number of the passage the question comes from. Use the language of the passages. ${MATH_RULE}`,
    `Course: ${a.courseCode} — ${a.courseName}${topic ? `\nTopic: ${topic.slice(0, 200)}` : ''}\n\nFrom the classes:\n${cite}`,
    {
      type: 'OBJECT',
      properties: { questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'INTEGER' }, explanation: { type: 'STRING' }, source: { type: 'INTEGER' } }, required: ['question', 'options', 'answer', 'explanation', 'source'] } } },
      required: ['questions'],
    },
    2500,
  );
  if (!out?.questions) throw new HttpException('Couldn’t make questions right now. Please try again.', 503);
  const portal = portalOf(user.role);
  return {
    questions: out.questions
      .filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, count)
      .map((q) => {
        const p = ps[q.source - 1];
        return { question: q.question, options: q.options.slice(0, 5), answer: q.answer, explanation: q.explanation, sourceTitle: p?.title ?? null, moment: p ? { title: p.title, link: p.link.replace('{portal}', portal), at: p.at } : null };
      }),
  };
}

// ── The teacher's rule, and the course's common questions ────────────────────────────────────────

/** GET: the rule (staff see the instruction too). */
export function readRule(a: Access) {
  const r = a.rule;
  return { hintsOnly: r.hintsOnly, off: tutorOff(r), offUntil: r.offUntil, whisperOff: r.whisperOff, ...(a.role === 'STUDENT' ? {} : { note: r.note }) };
}

/** PUT { hintsOnly, note, off, offUntil }: the course's teaching team. */
export async function saveRule(a: Access, b: Record<string, unknown>) {
  if (a.role === 'STUDENT') throw new ForbiddenException('Only the course’s teachers set the tutor’s rules.');
  const rule = cleanRule(b);
  if (rule.offUntil && Date.parse(rule.offUntil) <= Date.now()) throw new BadRequestException('Pick a time in the future, or turn it off with no end.');
  await prisma.course.update({ where: { id: a.courseId }, data: { tutorRule: JSON.stringify(rule) } });
  return readRule({ ...a, rule });
}

/** GET: the questions the course's students asked its tutor in the last 90 days, grouped, with no names. */
export async function commonQuestions(a: Access) {
  if (a.role === 'STUDENT') throw new ForbiddenException('Only the course’s teachers see this.');
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [rows, enrolled] = await Promise.all([
    prisma.aiUse.findMany({ where: { courseId: a.courseId, kind: { in: ['tutor', 'homework'] }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 2000, select: { userId: true, detail: true, createdAt: true } }),
    prisma.enrollment.findMany({ where: { courseId: a.courseId }, select: { studentId: true } }),
  ]);
  const students = new Set(enrolled.map((e) => e.studentId));
  // Students' own questions (not the teacher trying it), and not "Answer shown" records.
  const items = rows.filter((r) => students.has(r.userId) && !r.detail.startsWith('Answer shown: ')).map((r) => ({ userId: r.userId, text: r.detail.replace(/^Photo: /, ''), at: r.createdAt.toISOString() }));
  return { since: since.toISOString(), asked: items.length, students: new Set(items.map((i) => i.userId)).size, groups: groupQuestions(items).slice(0, 30) };
}

// ── The evening flashcard reminder ───────────────────────────────────────────────────────────────

export const REMIND_HOUR = 18;

/** PUT { on, tz }: a push at 6 pm (your time) on days when flashcards are due. */
export async function setCardReminder(user: SessionUser, b: Record<string, unknown>) {
  const tz = cleanTimeZone(b.tz);
  const at = b.on === true ? nextDigestAt(tz, REMIND_HOUR) : null;
  await prisma.user.update({ where: { id: user.id }, data: { cardsRemindAt: at } });
  return { reminder: !!at, next: at };
}

/** After a review: the reminder (if it's on) moves to the next 6 pm in the reviewer's time zone. */
export async function reanchorReminder(userId: string, tzRaw: unknown) {
  const tz = cleanTimeZone(tzRaw);
  if (!tz) return;
  await prisma.user.updateMany({ where: { id: userId, cardsRemindAt: { not: null } }, data: { cardsRemindAt: nextDigestAt(tz, REMIND_HOUR) } }).catch(() => {});
}

/** The 15-minute cron: people whose reminder time has come, told when they have cards due; then a day later. */
export async function sendCardReminders(now = new Date()) {
  const budget = planLimits().pushes;
  const due = await prisma.user.findMany({ where: { cardsRemindAt: { lte: now }, status: { not: 'SUSPENDED' } }, orderBy: { cardsRemindAt: 'asc' }, take: Math.min(30, budget), select: { id: true, cardsRemindAt: true } });
  if (!due.length) return { due: 0, told: 0, sent: 0 };
  const counts = (await Promise.all(chunks(due.map((u) => u.id), 90).map((ids) => prisma.studyCard.groupBy({ by: ['userId'], where: { userId: { in: ids }, due: { lte: now } }, _count: { _all: true } })))).flat();
  const tell = counts.filter((c) => c._count._all > 0);
  let sent = 0;
  if (tell.length) {
    const body = (n: number) => `${n} flashcard${n === 1 ? '' : 's'} to review. A few minutes now keeps them fresh.`;
    await prisma.notification.createMany({ data: tell.map((c) => ({ userId: c.userId, title: 'Flashcards to review', body: body(c._count._all), type: 'reminder', link: '/student/tutor?tab=cards' })) });
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: tell.map((t) => t.userId) } }, orderBy: { createdAt: 'desc' }, select: { userId: true, endpoint: true, p256dh: true, auth: true } });
    const items = tell.flatMap((c) => subs.filter((s) => s.userId === c.userId).slice(0, 2).map((subscription) => ({ subscription, payload: { title: 'Flashcards to review', body: body(c._count._all), url: '/student/tutor?tab=cards', tag: 'remind-cards' } })));
    const { pushService } = await import('./services/push.service');
    sent = await pushService.sendEach(items.slice(0, budget));
  }
  // Tomorrow at the same time, in one statement (3 values a person).
  const next = due.map((u) => [u.id, dbDate(new Date(Math.max(u.cardsRemindAt!.getTime() + 86_400_000, now.getTime() + 3_600_000)))] as const);
  await prisma.$executeRawUnsafe(
    `UPDATE users SET "cardsRemindAt" = CASE "id" ${next.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE "id" IN (${next.map(() => '?').join(',')})`,
    ...next.flatMap(([id, at]) => [id, at]), ...next.map(([id]) => id),
  );
  return { due: due.length, told: tell.length, sent };
}
