import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { pointsFor, ranked, settle } from '@/lib/live-game';
import { CHOICE_TYPES, cleanGiven, isRight } from '@/lib/question-types';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';

// Live quiz game (Stage 5 · B4.5, scoring in src/lib/live-game.ts). The teacher runs one of the
// course's quizzes on the class screen: a lobby, then each question with a timer, the reveal with the
// leaderboard, and the podium. Students join on their phones (from Live class, or with the classroom
// code). Everyone's page refreshes through live updates ('refresh' for the /api/live/game keys).
// When the game ends, every answer is saved as practice (src/server/practice.ts), so it counts
// towards each student's Learning DNA.

const KEY = ['/api/live/game*'];
const MAX_QUESTIONS = 30;
const GRACE_MS = 2000;
const RECENT_MS = 15 * 60_000;

type Game = NonNullable<Awaited<ReturnType<typeof loadGame>>>;

const loadGame = (id: string) => prisma.liveGame.findUnique({
  where: { id },
  select: { id: true, courseId: true, quizId: true, hostId: true, status: true, questionIds: true, current: true, seconds: true, questionAt: true, endedAt: true, quiz: { select: { title: true } }, course: { select: { code: true } } },
});
const idsOf = (g: { questionIds: string }) => { try { const v = JSON.parse(g.questionIds) as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
const optionsOf = (v: unknown) => (Array.isArray(v) ? v.filter((o): o is string => typeof o === 'string') : []);

async function host(courseId: unknown, user: SessionUser) {
  const id = typeof courseId === 'string' ? courseId : '';
  const a = id ? await courseAccess(id, user) : null;
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can run a quiz game.');
  return a;
}

/** Who should see the game change: its players and the host. */
async function audience(g: { id: string; hostId: string }) {
  const players = await prisma.liveGamePlayer.findMany({ where: { gameId: g.id }, select: { userId: true }, take: 500 });
  return [g.hostId, ...players.map((p) => p.userId)];
}

/** POST /api/live/game { courseId, quizId, seconds } — the teacher starts a game (ending any other). */
export async function startGame(user: SessionUser, b: Record<string, unknown>) {
  const a = await host(b.courseId, user);
  const quiz = typeof b.quizId === 'string' ? await prisma.quiz.findFirst({ where: { id: b.quizId, courseId: a.course.id }, select: { id: true, questions: { where: { type: { in: [...CHOICE_TYPES] } }, orderBy: { order: 'asc' }, take: MAX_QUESTIONS, select: { id: true } } } }) : null;
  if (!quiz) throw new NotFoundException('Pick one of the course’s quizzes.');
  if (!quiz.questions.length) throw new BadRequestException('This quiz has no one-answer or true / false questions to play.');
  const seconds = [10, 20, 30, 60].includes(Number(b.seconds)) ? Number(b.seconds) : 20;
  await prisma.liveGame.updateMany({ where: { courseId: a.course.id, status: { not: 'DONE' } }, data: { status: 'DONE', endedAt: new Date() } });
  const game = await prisma.liveGame.create({ data: { courseId: a.course.id, quizId: quiz.id, hostId: user.id, seconds, questionIds: JSON.stringify(quiz.questions.map((q) => q.id)) }, select: { id: true } });
  // Students with UniVerse open see the lobby straight away.
  const online = await prisma.enrollment.findMany({ where: { courseId: a.course.id, student: { lastSeenAt: { gt: new Date(Date.now() - RECENT_MS) } } }, select: { studentId: true }, take: 1000 });
  publish([user.id, ...online.map((e) => e.studentId)], { type: 'refresh', keys: KEY });
  return { id: game.id };
}

/** GET /api/live/game?courseId= — the teacher's game for a course, or a student's game in their courses. */
export async function gameState(user: SessionUser, courseIdRaw: string | null) {
  const recent = new Date(Date.now() - RECENT_MS);
  let g: Game | null = null;
  let isHost = false;
  if (courseIdRaw && user.role !== 'STUDENT') {
    const a = await host(courseIdRaw, user);
    const found = await prisma.liveGame.findFirst({ where: { courseId: a.course.id, OR: [{ status: { not: 'DONE' } }, { endedAt: { gt: recent } }] }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    g = found ? await loadGame(found.id) : null;
    isHost = true;
  } else {
    const found = await prisma.liveGame.findFirst({
      where: { course: { enrollments: { some: { studentId: user.id } } }, OR: [{ status: { not: 'DONE' } }, { endedAt: { gt: recent }, players: { some: { userId: user.id } } }] },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    g = found ? await loadGame(found.id) : null;
  }
  if (!g) return { game: null };
  const ids = idsOf(g);
  const qid = g.current >= 0 ? ids[g.current] : null;
  const [players, q, answers] = await Promise.all([
    prisma.liveGamePlayer.findMany({ where: { gameId: g.id }, select: { userId: true, name: true, score: true, streak: true }, take: 500 }),
    qid ? prisma.quizQuestion.findUnique({ where: { id: qid }, select: { id: true, question: true, options: true, correctAnswer: true, type: true } }) : Promise.resolve(null),
    qid ? prisma.liveGameAnswer.findMany({ where: { gameId: g.id, questionId: qid }, select: { userId: true, answer: true, correct: true, points: true }, take: 500 }) : Promise.resolve([]),
  ]);
  const shown = g.status === 'REVEAL' || g.status === 'DONE';
  const options = q ? optionsOf(q.options) : [];
  const board = ranked(players);
  const me = board.find((p) => p.userId === user.id);
  const mine = answers.find((a) => a.userId === user.id);
  return {
    game: {
      id: g.id, courseId: g.courseId, course: g.course.code, quiz: g.quiz.title, status: g.status, current: g.current, total: ids.length, seconds: g.seconds,
      endsAt: g.status === 'QUESTION' && g.questionAt ? new Date(g.questionAt.getTime() + g.seconds * 1000).toISOString() : null,
      players: players.length, answered: answers.length,
    },
    host: isHost,
    // The question while it's played (everyone), the answer and how it went once revealed.
    question: q && (g.status === 'QUESTION' || g.status === 'REVEAL') ? { id: q.id, question: q.question, options, type: q.type } : null,
    reveal: q && shown && g.status !== 'DONE' ? { right: q.correctAnswer, counts: options.map((o) => answers.filter((a) => a.answer === o).length) } : null,
    names: isHost && g.status === 'LOBBY' ? players.map((p) => p.name).sort() : undefined,
    top: shown ? board.slice(0, g.status === 'DONE' ? 10 : 5).map((p) => ({ name: p.name, score: p.score, rank: p.rank, streak: p.streak })) : [],
    me: isHost ? null : { joined: !!me, score: me?.score ?? 0, streak: me?.streak ?? 0, rank: me?.rank ?? null, answered: !!mine, ...(shown && mine ? { correct: mine.correct, points: mine.points } : {}) },
  };
}

async function player(user: SessionUser, g: Game) {
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_courseId: { studentId: user.id, courseId: g.courseId } }, select: { id: true } });
  if (!enrolled) throw new ForbiddenException('This game is for the course’s students.');
}

/** Puts a student in a game (from Live class, or when they join the class with its code). */
export async function addPlayer(gameId: string, user: { id: string; name: string }) {
  await prisma.liveGamePlayer.upsert({ where: { gameId_userId: { gameId, userId: user.id } }, update: {}, create: { gameId, userId: user.id, name: user.name.slice(0, 60) } });
}

/** POST /api/live/game/:gid { action, … } — join and answer (students); next, reveal and end (the host). */
export async function gameAction(user: SessionUser, gameId: string, b: Record<string, unknown>) {
  const g = await loadGame(gameId);
  if (!g) throw new NotFoundException('That game has ended.');
  const ids = idsOf(g);
  switch (b.action) {
    case 'join': {
      await player(user, g);
      if (g.status === 'DONE') throw new BadRequestException('That game has ended.');
      await addPlayer(g.id, user);
      publish([g.hostId, user.id], { type: 'refresh', keys: KEY });
      return { ok: true };
    }
    case 'answer': {
      await player(user, g);
      const qid = ids[g.current];
      if (g.status !== 'QUESTION' || !qid || b.questionId !== qid || !g.questionAt) throw new BadRequestException('That question isn’t open any more.');
      const ms = Date.now() - g.questionAt.getTime();
      if (ms > g.seconds * 1000 + GRACE_MS) throw new BadRequestException('Time’s up for this question.');
      const q = await prisma.quizQuestion.findUnique({ where: { id: qid }, select: { id: true, type: true, options: true, correctAnswer: true, meta: true } });
      const given = q ? cleanGiven(q, b.answer) : null;
      if (!q || typeof given !== 'string') throw new BadRequestException('Pick an answer.');
      const correct = isRight(q, given);
      const points = pointsFor(correct, ms, g.seconds);
      await addPlayer(g.id, user);
      try {
        await prisma.liveGameAnswer.create({ data: { gameId: g.id, userId: user.id, questionId: qid, answer: given, correct, points, ms } });
      } catch {
        throw new ConflictException('You’ve answered this one.');
      }
      if (points) await prisma.liveGamePlayer.update({ where: { gameId_userId: { gameId: g.id, userId: user.id } }, data: { score: { increment: points } } });
      // Only the class screen needs to know (every phone refreshing on every answer would be a lot).
      publish([g.hostId, user.id], { type: 'refresh', keys: KEY });
      return { ok: true };
    }
    case 'next': case 'reveal': case 'end': {
      if (g.hostId !== user.id) await host(g.courseId, user);
      if (g.status === 'DONE') throw new BadRequestException('That game has ended.');
      if (b.action === 'reveal') {
        if (g.status !== 'QUESTION') throw new BadRequestException('There’s no question to reveal.');
        await reveal(g, ids);
      } else if (b.action === 'next' && g.current + 1 < ids.length) {
        if (g.status === 'QUESTION') await reveal(g, ids);
        await prisma.liveGame.update({ where: { id: g.id }, data: { status: 'QUESTION', current: g.current + 1, questionAt: new Date() } });
      } else {
        if (g.status === 'QUESTION') await reveal(g, ids);
        await prisma.liveGame.update({ where: { id: g.id }, data: { status: 'DONE', endedAt: new Date() } });
        await saveAsPractice(g);
      }
      publish(await audience(g), { type: 'refresh', keys: KEY });
      return { ok: true };
    }
    default:
      throw new BadRequestException('Unknown action.');
  }
}

/** Shows the answer and updates streaks and their bonuses (one statement for the whole class). */
async function reveal(g: Game, ids: string[]) {
  const qid = ids[g.current];
  const [players, answers] = await Promise.all([
    prisma.liveGamePlayer.findMany({ where: { gameId: g.id }, select: { userId: true, streak: true }, take: 500 }),
    prisma.liveGameAnswer.findMany({ where: { gameId: g.id, questionId: qid }, select: { userId: true, correct: true }, take: 500 }),
  ]);
  const rows = settle(players, answers).map((p) => ({ u: p.userId, s: p.streak, b: p.bonus }));
  if (rows.length) {
    const data = JSON.stringify(rows);
    await prisma.$executeRawUnsafe(
      `UPDATE live_game_players
       SET streak = (SELECT json_extract(value, '$.s') FROM json_each(?) WHERE json_extract(value, '$.u') = live_game_players.userId),
           score = score + (SELECT json_extract(value, '$.b') FROM json_each(?) WHERE json_extract(value, '$.u') = live_game_players.userId)
       WHERE gameId = ? AND userId IN (SELECT json_extract(value, '$.u') FROM json_each(?))`,
      data, data, g.id, data,
    );
  }
  await prisma.liveGame.update({ where: { id: g.id }, data: { status: 'REVEAL' } });
}

/** Every answer of the game, saved as practice (first try, right or not), in one statement. */
async function saveAsPractice(g: Game) {
  const answers = await prisma.liveGameAnswer.findMany({ where: { gameId: g.id }, select: { userId: true, questionId: true, correct: true }, take: 10_000 });
  if (!answers.length) return;
  const at = new Date().toISOString().replace('Z', '+00:00');
  await prisma.$executeRawUnsafe(
    `INSERT INTO practice_answers (id, studentId, courseId, questionId, credit, tries, solved, createdAt, updatedAt)
     SELECT lower(hex(randomblob(12))), json_extract(value, '$.u'), ?, json_extract(value, '$.q'), json_extract(value, '$.c'), 1, json_extract(value, '$.c') = 1, ?, ?
     FROM json_each(?) WHERE json_extract(value, '$.q') IN (SELECT id FROM quiz_questions)`,
    g.courseId, at, at, JSON.stringify(answers.map((a) => ({ u: a.userId, q: a.questionId, c: a.correct ? 1 : 0 }))),
  );
}
