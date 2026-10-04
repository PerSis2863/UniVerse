import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { later, notifyMany } from './email';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';

// Live polls during class: the teacher asks a question, students answer on their phones, and
// results update live. Open tabs refresh through the live-updates connection ('refresh' events
// for the /api/live keys); pages also re-check every few seconds while a poll is open, in case
// live updates aren't connected.

const KEY = ['/api/live*'];
const optionsOf = (p: { options: Prisma.JsonValue }) => (Array.isArray(p.options) ? (p.options as string[]) : []);

/** The course's teacher and its students. `online`: only students active in the last 15 minutes
 *  (the ones with UniVerse open), at most 40: each live push is a request to that person's hub, and
 *  Workers Free allows 50 per request. Everyone else's page re-checks on its own. */
async function members(courseId: string, online = true) {
  const [course, students] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true, code: true } }),
    prisma.enrollment.findMany({
      where: { courseId, ...(online ? { student: { lastSeenAt: { gt: new Date(Date.now() - 15 * 60_000) } } } : {}) },
      select: { studentId: true },
      take: online ? 40 : 1000,
    }),
  ]);
  return { teacherId: course?.teacherId ?? null, code: course?.code ?? '', students: students.map((s) => s.studentId) };
}

async function managed(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can run live polls.');
  return a;
}

function tally(options: string[], votes: { option: number }[]) {
  const counts = options.map(() => 0);
  for (const v of votes) if (v.option >= 0 && v.option < counts.length) counts[v.option]++;
  return counts;
}

/** Teachers: a course's recent polls with results. Students: open polls (and recently closed ones) in their courses. */
export async function listPolls(user: SessionUser, courseId: string | null) {
  if (user.role === 'STUDENT') {
    const enrolled = (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true } })).map((e) => e.courseId);
    const polls = await prisma.livePoll.findMany({
      where: { courseId: { in: courseId ? enrolled.filter((c) => c === courseId) : enrolled }, OR: [{ status: 'OPEN' }, { closedAt: { gte: new Date(Date.now() - 3 * 3600_000) } }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, question: true, options: true, status: true, showResults: true, createdAt: true, course: { select: { code: true, name: true } }, votes: { select: { option: true, userId: true } } },
    });
    return polls.map(({ votes, ...p }) => {
      const mine = votes.find((v) => v.userId === user.id);
      const visible = p.status === 'CLOSED' || p.showResults;
      return { ...p, options: optionsOf(p), myVote: mine ? mine.option : null, results: visible ? tally(optionsOf(p), votes) : null, total: visible ? votes.length : null };
    });
  }
  if (!courseId) throw new BadRequestException('Choose a course.');
  await managed(courseId, user);
  const [polls, enrolled] = await Promise.all([
    prisma.livePoll.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, question: true, options: true, status: true, showResults: true, createdAt: true, closedAt: true, votes: { select: { option: true } } } }),
    prisma.enrollment.count({ where: { courseId } }),
  ]);
  return { enrolled, polls: polls.map(({ votes, ...p }) => ({ ...p, options: optionsOf(p), results: tally(optionsOf(p), votes), total: votes.length })) };
}

export async function createPoll(user: SessionUser, body: Record<string, unknown>) {
  const courseId = typeof body.courseId === 'string' ? body.courseId : '';
  const a = await managed(courseId, user);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : '';
  const options = (Array.isArray(body.options) ? body.options : []).map((o) => (typeof o === 'string' ? o.trim().slice(0, 120) : '')).filter(Boolean);
  if (!question) throw new BadRequestException('Type a question.');
  if (options.length < 2 || options.length > 6) throw new BadRequestException('Give 2 to 6 answers.');
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new BadRequestException('Each answer must be different.');
  const poll = await prisma.livePoll.create({ data: { courseId, createdById: user.id, question, options, showResults: body.showResults === true } });
  publish((await members(courseId)).students, { type: 'refresh', keys: KEY });
  // The bell for everyone in the course (no email: it's happening now).
  const all = await members(courseId, false);
  later(() => notifyMany(all.students, { type: 'live', title: `Live poll in ${a.course.code}`, body: question, link: '/student/live', email: false }));
  return poll;
}

export async function updatePoll(user: SessionUser, pollId: string, body: Record<string, unknown>) {
  const poll = await prisma.livePoll.findUnique({ where: { id: pollId }, select: { courseId: true, status: true } });
  if (!poll) throw new NotFoundException('Poll not found.');
  await managed(poll.courseId, user);
  const data: Prisma.LivePollUpdateInput = {};
  if (body.status === 'CLOSED' && poll.status !== 'CLOSED') Object.assign(data, { status: 'CLOSED', closedAt: new Date() });
  if (body.status === 'OPEN' && poll.status !== 'OPEN') Object.assign(data, { status: 'OPEN', closedAt: null });
  if (typeof body.showResults === 'boolean') data.showResults = body.showResults;
  const saved = await prisma.livePoll.update({ where: { id: pollId }, data });
  publish((await members(poll.courseId)).students, { type: 'refresh', keys: KEY });
  return saved;
}

export async function deletePoll(user: SessionUser, pollId: string) {
  const poll = await prisma.livePoll.findUnique({ where: { id: pollId }, select: { courseId: true } });
  if (!poll) throw new NotFoundException('Poll not found.');
  await managed(poll.courseId, user);
  await prisma.livePoll.delete({ where: { id: pollId } });
  publish((await members(poll.courseId)).students, { type: 'refresh', keys: KEY });
  return { ok: true };
}

export async function vote(user: SessionUser, pollId: string, body: Record<string, unknown>) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Only students answer polls.');
  const poll = await prisma.livePoll.findUnique({ where: { id: pollId }, select: { courseId: true, status: true, options: true, showResults: true } });
  const a = poll ? await courseAccess(poll.courseId, user) : null;
  if (!poll || !a) throw new NotFoundException('Poll not found.');
  if (poll.status !== 'OPEN') throw new BadRequestException('This poll has closed.');
  const option = Number(body.option);
  if (!Number.isInteger(option) || option < 0 || option >= optionsOf(poll).length) throw new BadRequestException('Choose one of the answers.');
  await prisma.livePollVote.upsert({ where: { pollId_userId: { pollId, userId: user.id } }, create: { pollId, userId: user.id, option }, update: { option } });
  // The teacher's screen updates now; classmates only when they can see results.
  const m = await members(poll.courseId);
  publish(poll.showResults ? [...(m.teacherId ? [m.teacherId] : []), ...m.students] : m.teacherId ? [m.teacherId] : [], { type: 'refresh', keys: KEY });
  return { ok: true, option };
}
