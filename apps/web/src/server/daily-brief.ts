import prisma from '@/lib/db';
import { SYSTEM_EMAIL } from '@/lib/chat';
import { validZone, wallClock as wall } from '@/lib/local-time';
import { planLimits } from '@/lib/plan-limits';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, HttpException } from './http';
import { featureOff } from './moderation';
import { upcomingCalls } from './scheduled-calls';
import { pushService } from './services/push.service';
import { createBoard } from './tasks';

// Daily brief (Stage 4 · 4.9). What matters today for one person, across everything: their classes
// today, what's due in the next day and a half (work, quizzes, tasks), scheduled calls, chats
// waiting for their reply (unread, or a question to them that they haven't answered), and for
// teachers, work to grade. Read from the records, no AI, on the home Overview.
// On top, once a day, an AI brief (made when they first open it, one AI request, kept for the day):
// a summary, decisions made in their group chats and channels, and up to 5 suggested tasks that one
// tap adds to the planner (a card on their "My tasks" board, which the smart planner schedules).
// Each morning (7:00 in their time zone, saved when they open the brief) the 15-minute cron sends a
// push and a bell notification with the counts, only to people with something to report.

const DAY = 86_400_000;
/** "Due soon": the next day and a half. */
const SOON_MS = 36 * 3600_000;
/** Chats: what's still waiting from the last 3 days. */
const WAITING_MS = 3 * DAY;
const PLANNER_BOARD = 'My tasks';

/** The UTC moment it's `hour`:00 on the local day `add` days after `from`'s, in this time zone. */
function localAt(tz: string, from: number, add: number, hour: number) {
  const w = wall(new Date(from), tz);
  const guess = Date.UTC(w.y, w.m - 1, w.d + add, hour, 0);
  const g = wall(new Date(guess), tz);
  const offset = Date.UTC(g.y, g.m - 1, g.d, g.hour, g.min) - Math.floor(guess / 60_000) * 60_000;
  return guess - offset;
}

/** The next time it's `hour`:00 in this time zone, after `from`. */
export function nextMorning(tz: string, hour: number, from = Date.now()): Date {
  for (let add = 0; add < 3; add++) {
    const at = localAt(tz, from, add, hour);
    if (at > from) return new Date(at);
  }
  return new Date(from + DAY);
}

/** 0 = Monday … 6 = Sunday, like TimetableSlot.dayOfWeek. */
const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
const portal = (role: string) => (role === 'ADMIN' ? 'admin' : role === 'TEACHER' ? 'teacher' : 'student');
/** Dates as the database keeps them (for comparisons in raw SQL). */
const dbDate = (d: Date) => d.toISOString().replace('Z', '+00:00');
const asDate = (v: unknown) => (v instanceof Date ? v : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(v)) ? String(v) : `${String(v).replace(' ', 'T')}Z`));
const isStaff = (role: string) => role === 'TEACHER' || role === 'ADMIN';

/** Someone's brief settings: made on first open with their time zone (and kept up to date). */
async function settings(user: SessionUser, tz: string) {
  const row = await prisma.dailyBrief.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, timeZone: tz, nextAt: nextMorning(tz, 7) } });
  if (row.timeZone === tz) return row;
  return prisma.dailyBrief.update({ where: { userId: user.id }, data: { timeZone: tz, nextAt: row.push ? nextMorning(tz, row.hour) : null, updatedAt: new Date() } });
}

interface Waiting { conversationId: string; name: string; avatar: string | null; isGroup: boolean; from: string; body: string; at: string; unread: boolean; question: boolean }

/** Chats whose last message (in the last 3 days) is someone else's (not the app's own account) and still waits for me. */
async function waitingChats(user: SessionUser): Promise<Waiting[]> {
  const rows = await prisma.$queryRawUnsafe<{ cid: string; readAt: string | null; isGroup: number; cname: string | null; cavatar: string | null; body: string; type: string; at: string; sender: string; other: string | null; otherAvatar: string | null }[]>(
    `SELECT p."conversationId" AS cid, p."lastReadAt" AS readAt, c."isGroup" AS isGroup, c."name" AS cname, c."avatarUrl" AS cavatar,
       m."body" AS body, m."type" AS type, m."createdAt" AS at, u."name" AS sender,
       (SELECT u2."name" FROM conversation_participants p2 JOIN users u2 ON u2."id" = p2."userId" WHERE p2."conversationId" = p."conversationId" AND p2."userId" != p."userId" LIMIT 1) AS other,
       (SELECT u2."avatar" FROM conversation_participants p2 JOIN users u2 ON u2."id" = p2."userId" WHERE p2."conversationId" = p."conversationId" AND p2."userId" != p."userId" LIMIT 1) AS otherAvatar
     FROM conversation_participants p
     JOIN conversations c ON c."id" = p."conversationId" AND c."communityId" IS NULL
     JOIN messages m ON m."id" = (SELECT x."id" FROM messages x WHERE x."conversationId" = p."conversationId" AND x."deletedAt" IS NULL AND x."type" != 'SYSTEM' ORDER BY x."createdAt" DESC LIMIT 1)
     JOIN users u ON u."id" = m."senderId"
     WHERE p."userId" = ? AND p."archivedAt" IS NULL AND (p."mutedUntil" IS NULL OR p."mutedUntil" < ?) AND m."senderId" != ? AND m."createdAt" >= ? AND u."email" != ?
     ORDER BY m."createdAt" DESC LIMIT 30`,
    user.id, dbDate(new Date()), user.id, dbDate(new Date(Date.now() - WAITING_MS)), SYSTEM_EMAIL,
  );
  const first = user.name.split(/\s+/)[0]?.toLowerCase() ?? '';
  return rows.flatMap((r) => {
    const at = asDate(r.at);
    const unread = !r.readAt || at > asDate(r.readAt);
    const text = r.type === 'TEXT' ? r.body : r.type === 'IMAGE' ? '📷 Photo' : r.type === 'AUDIO' ? '🎤 Voice message' : r.type === 'CALL' ? '📞 Call' : r.type === 'FILE' ? '📎 File' : r.body;
    const lower = text.toLowerCase();
    const question = text.includes('?') && (!r.isGroup || (!!first && lower.includes(`@${first}`)));
    if (!unread && !question) return [];
    return [{ conversationId: r.cid, name: (r.isGroup ? r.cname : r.other) ?? 'Chat', avatar: (r.isGroup ? r.cavatar : r.otherAvatar) ?? null, isGroup: !!r.isGroup, from: r.sender, body: text.slice(0, 160), at: at.toISOString(), unread, question }];
  }).slice(0, 6);
}

/** Work handed in that a teacher hasn't graded yet. */
async function toGrade(teacherId: string) {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM assignment_submissions s JOIN assignments a ON a."id" = s."assignmentId" JOIN courses c ON c."id" = a."courseId" WHERE c."teacherId" = ? AND s."status" IN ('SUBMITTED', 'DRAFTED')`, teacherId,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Today, from the records (no AI). */
async function briefData(user: SessionUser, tz: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + SOON_MS);
  const { day } = wall(now, tz);
  const staff = isStaff(user.role);
  const courses = staff
    ? await prisma.course.findMany({ where: { teacherId: user.id }, select: { id: true, code: true, name: true }, take: 60 })
    : (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 60 })).map((e) => e.course);
  const ids = courses.map((c) => c.id);
  const course = new Map(courses.map((c) => [c.id, c]));
  const [slots, work, quizzes, tasks, calls, waiting, grading] = await Promise.all([
    ids.length ? prisma.timetableSlot.findMany({ where: { courseId: { in: ids }, dayOfWeek: weekday(day) }, orderBy: { startTime: 'asc' }, select: { courseId: true, startTime: true, endTime: true, type: true, room: { select: { name: true } } } }) : [],
    !staff && ids.length ? prisma.assignment.findMany({ where: { courseId: { in: ids }, status: 'OPEN', dueDate: { gte: now, lte: soon }, submissions: { none: { studentId: user.id } } }, orderBy: { dueDate: 'asc' }, take: 8, select: { id: true, title: true, dueDate: true, courseId: true } }) : [],
    !staff && ids.length ? prisma.quiz.findMany({ where: { courseId: { in: ids }, status: 'PUBLISHED', dueDate: { gte: now, lte: soon }, submissions: { none: { studentId: user.id } } }, orderBy: { dueDate: 'asc' }, take: 8, select: { id: true, title: true, dueDate: true, courseId: true } }) : [],
    prisma.task.findMany({ where: { assigneeId: user.id, doneAt: null, dueAt: { gte: new Date(now.getTime() - DAY), lte: soon } }, orderBy: { dueAt: 'asc' }, take: 8, select: { id: true, title: true, dueAt: true, boardId: true } }),
    upcomingCalls(user).catch(() => []),
    waitingChats(user),
    staff ? toGrade(user.id) : Promise.resolve(0),
  ]);
  const base = `/${portal(user.role)}`;
  const due = [
    ...work.map((a) => ({ kind: 'work' as const, id: a.id, title: a.title, at: a.dueDate!, course: course.get(a.courseId)?.code ?? null, link: `${base}/assignments` })),
    ...quizzes.map((q) => ({ kind: 'quiz' as const, id: q.id, title: q.title, at: q.dueDate!, course: course.get(q.courseId)?.code ?? null, link: `${base}/quizzes` })),
    ...tasks.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, at: t.dueAt!, course: null, link: `/tasks/${t.boardId}` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const endOfDay = localAt(tz, now.getTime(), 1, 0);
  return {
    day,
    classes: slots.map((s) => ({ courseId: s.courseId, code: course.get(s.courseId)?.code ?? '', name: course.get(s.courseId)?.name ?? '', start: s.startTime, end: s.endTime, type: s.type, room: s.room?.name ?? null })),
    due,
    calls: calls.filter((c) => new Date(c.startAt).getTime() < endOfDay).map((c) => ({ id: c.id, title: c.title, startAt: c.startAt, roomName: c.roomName, path: c.path, conversationId: c.conversationId })),
    waiting,
    toGrade: grading,
  };
}
type BriefData = Awaited<ReturnType<typeof briefData>>;

export interface AiBrief { summary: string; decisions: { text: string; where: string }[]; tasks: { title: string; when: 'today' | 'tomorrow'; why: string }[] }

/** GET /api/brief?tz=: today's brief (and the AI one if it's been made today); saves the time zone for the morning push. */
export async function getBrief(user: SessionUser, tzRaw: unknown) {
  const tz = validZone(tzRaw);
  const [row, data] = await Promise.all([settings(user, tz), briefData(user, tz)]);
  const ai = row.aiDay === data.day && row.ai ? (JSON.parse(row.ai) as AiBrief) : null;
  const aiOn = !!process.env.GEMINI_API_KEY && !(await featureOff('ai'));
  return { ...data, ai, aiOn, push: row.push, hour: row.hour };
}

/** Recent messages in my group chats and community channels (for the decisions made there). */
async function chatter(user: SessionUser) {
  const rows = await prisma.message.findMany({
    where: { createdAt: { gte: new Date(Date.now() - DAY) }, deletedAt: null, type: 'TEXT', conversation: { participants: { some: { userId: user.id } }, OR: [{ isGroup: true }, { communityId: { not: null } }] } },
    orderBy: { createdAt: 'desc' }, take: 60,
    select: { body: true, sender: { select: { name: true } }, conversation: { select: { name: true, community: { select: { name: true } } } } },
  });
  return rows.reverse().map((m) => `[${m.conversation.community ? `${m.conversation.community.name} › ` : ''}${m.conversation.name ?? 'Group'}] ${m.sender.name}: ${m.body.replace(/\s+/g, ' ').slice(0, 160)}`);
}

const BRIEF_SYSTEM = `You write a short morning brief for one person using a school app, from the data given: their classes today, what's due soon, scheduled calls, chats waiting for their reply, and recent messages in their group chats and channels.
- summary: 2 or 3 friendly sentences on what matters most today. Plain words, no greetings like "Good morning".
- decisions: up to 4 decisions or agreements actually made in their group chats or channels (who decided what, and where). Leave it empty when there are none. Never count questions or plans that weren't agreed.
- tasks: up to 5 concrete things they could do today or tomorrow (reply to someone, prepare for a deadline, follow up on a decision). Each: a short title under 70 characters starting with a verb, when ("today" or "tomorrow"), and why in under 80 characters.
Use only what's in the data; never invent names, times or facts. Write in the language most of the data is in (English if unsure).`;

const AI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, where: { type: 'STRING' } }, required: ['text', 'where'] } },
    tasks: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, when: { type: 'STRING', enum: ['today', 'tomorrow'] }, why: { type: 'STRING' } }, required: ['title', 'when', 'why'] } },
  },
  required: ['summary', 'decisions', 'tasks'],
};

function prompt(data: BriefData, lines: string[], tz: string) {
  const time = (d: Date | string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
  return [
    `Today is ${data.day}.`,
    data.classes.length ? `Classes today:\n${data.classes.map((c) => `- ${c.start}–${c.end} ${c.code} ${c.name} (${c.type.toLowerCase()})${c.room ? ` in ${c.room}` : ''}`).join('\n')}` : 'No classes today.',
    data.due.length ? `Due soon:\n${data.due.map((d) => `- ${d.kind === 'work' ? 'Assignment' : d.kind === 'quiz' ? 'Quiz' : 'Task'}: ${d.title}${d.course ? ` (${d.course})` : ''}, due ${time(d.at)}`).join('\n')}` : 'Nothing due soon.',
    data.calls.length ? `Calls today:\n${data.calls.map((c) => `- ${time(c.startAt)} ${c.title} (${c.roomName})`).join('\n')}` : '',
    data.toGrade ? `Work waiting to be graded: ${data.toGrade}.` : '',
    data.waiting.length ? `Chats waiting for their reply:\n${data.waiting.map((w) => `- ${w.name}${w.isGroup ? ` (group, from ${w.from})` : ''}: "${w.body}"`).join('\n')}` : 'No chats waiting.',
    lines.length ? `Recent messages in their group chats and channels (oldest first):\n${lines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

/** POST /api/brief { action: 'ai', tz }: today's AI brief (one AI request a day, kept for the day). */
export async function makeAiBrief(user: SessionUser, tzRaw: unknown): Promise<{ ai: AiBrief | null }> {
  const tz = validZone(tzRaw);
  const row = await settings(user, tz);
  const data = await briefData(user, tz);
  if (row.aiDay === data.day && row.ai) return { ai: JSON.parse(row.ai) as AiBrief };
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI briefs aren’t available right now. Your day is still listed below.', 503);
  const lines = await chatter(user);
  // Nothing to summarize: no AI request.
  if (!lines.length && !data.waiting.length && !data.due.length && !data.classes.length && !data.calls.length && !data.toGrade) return { ai: null };
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const out = await geminiJson<AiBrief>(BRIEF_SYSTEM, prompt(data, lines, tz), AI_SCHEMA, 900);
  if (!out?.summary) throw new HttpException('Couldn’t make your brief right now. Please try again.', 502);
  const ai: AiBrief = {
    summary: String(out.summary).slice(0, 600),
    decisions: (out.decisions ?? []).slice(0, 4).map((d) => ({ text: String(d.text).slice(0, 200), where: String(d.where).slice(0, 80) })),
    tasks: (out.tasks ?? []).slice(0, 5).map((t) => ({ title: String(t.title).slice(0, 90), when: t.when === 'tomorrow' ? 'tomorrow' : 'today', why: String(t.why).slice(0, 120) })),
  };
  await prisma.dailyBrief.update({ where: { userId: user.id }, data: { aiDay: data.day, ai: JSON.stringify(ai), updatedAt: new Date() } });
  return { ai };
}

/** POST /api/brief { action: 'prefs', push?, hour?, tz }: the morning push on or off, and at what hour. */
export async function setBriefPrefs(user: SessionUser, b: Record<string, unknown>) {
  const tz = validZone(b.tz);
  const row = await settings(user, tz);
  const push = typeof b.push === 'boolean' ? b.push : row.push;
  const hour = Number.isInteger(b.hour) && Number(b.hour) >= 5 && Number(b.hour) <= 11 ? Number(b.hour) : row.hour;
  const saved = await prisma.dailyBrief.update({ where: { userId: user.id }, data: { push, hour, nextAt: push ? nextMorning(tz, hour) : null, updatedAt: new Date() } });
  return { push: saved.push, hour: saved.hour };
}

/** POST /api/brief { action: 'task', title, when, tz }: a suggested task on my "My tasks" board, due that evening. */
export async function addToPlanner(user: SessionUser, b: Record<string, unknown>) {
  const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!title) throw new BadRequestException('Give the task a title.');
  const tz = validZone(b.tz);
  const dueAt = new Date(localAt(tz, Date.now(), b.when === 'tomorrow' ? 1 : 0, 18));
  let board = await prisma.taskBoard.findFirst({ where: { ownerId: user.id, title: PLANNER_BOARD, courseId: null, groupId: null }, select: { id: true } });
  board ??= await createBoard(user, { title: PLANNER_BOARD });
  // Tapped twice: the same card.
  const same = await prisma.task.findFirst({ where: { boardId: board.id, title, doneAt: null }, select: { id: true, dueAt: true } });
  if (same) return { id: same.id, boardId: board.id, dueAt: same.dueAt, already: true };
  const list = await prisma.taskList.findFirst({ where: { boardId: board.id }, orderBy: { position: 'asc' }, select: { id: true } });
  if (!list) throw new HttpException('Your task board has no lists. Add one on the Tasks page.', 409);
  const last = await prisma.task.findFirst({ where: { listId: list.id }, orderBy: { position: 'desc' }, select: { position: true } });
  const task = await prisma.task.create({ data: { boardId: board.id, listId: list.id, title, notes: 'From your daily brief', assigneeId: user.id, dueAt, createdById: user.id, position: (last?.position ?? 0) + 1 } });
  return { id: task.id, boardId: board.id, dueAt: task.dueAt, already: false };
}

// ── The morning push (15-minute cron) ─────────────────────────────────────────────────────────

interface Counts { classes: number; due: number; waiting: number; toGrade: number }

/**
 * Each person's counts for the morning push, for many people in a few queries (D1 on Workers Free
 * allows 50 queries per request): classes on their local weekday, work/quizzes/tasks due in the next
 * day and a half, chats waiting (unread, last message someone else's, last 3 days), work to grade.
 */
async function morningCounts(people: { id: string; role: string; tz: string }[]) {
  const now = new Date();
  const out = new Map<string, Counts>(people.map((p) => [p.id, { classes: 0, due: 0, waiting: 0, toGrade: 0 }]));
  if (!people.length) return out;
  const ids = people.map((p) => p.id);
  const marks = ids.map(() => '?').join(',');
  const staff = people.filter((p) => isStaff(p.role)).map((p) => p.id);
  const [slots, work, tasks, chats, grading] = await Promise.all([
    prisma.$queryRawUnsafe<{ uid: string; wd: number; n: number }[]>(
      `SELECT e."studentId" AS uid, s."dayOfWeek" AS wd, COUNT(*) AS n FROM enrollments e JOIN timetable_slots s ON s."courseId" = e."courseId" WHERE e."studentId" IN (${marks}) GROUP BY e."studentId", s."dayOfWeek"
       UNION ALL SELECT c."teacherId" AS uid, s."dayOfWeek" AS wd, COUNT(*) AS n FROM courses c JOIN timetable_slots s ON s."courseId" = c."id" WHERE c."teacherId" IN (${marks}) GROUP BY c."teacherId", s."dayOfWeek"`,
      ...ids, ...ids,
    ),
    prisma.$queryRawUnsafe<{ uid: string; n: number }[]>(
      `SELECT e."studentId" AS uid, COUNT(*) AS n FROM enrollments e JOIN assignments a ON a."courseId" = e."courseId"
         WHERE e."studentId" IN (${marks}) AND a."status" = 'OPEN' AND a."dueDate" >= ? AND a."dueDate" <= ?
         AND NOT EXISTS (SELECT 1 FROM assignment_submissions x WHERE x."assignmentId" = a."id" AND x."studentId" = e."studentId") GROUP BY e."studentId"
       UNION ALL SELECT e."studentId" AS uid, COUNT(*) AS n FROM enrollments e JOIN quizzes q ON q."courseId" = e."courseId"
         WHERE e."studentId" IN (${marks}) AND q."status" = 'PUBLISHED' AND q."dueDate" >= ? AND q."dueDate" <= ?
         AND NOT EXISTS (SELECT 1 FROM quiz_submissions x WHERE x."quizId" = q."id" AND x."studentId" = e."studentId") GROUP BY e."studentId"`,
      ...ids, dbDate(now), dbDate(new Date(now.getTime() + SOON_MS)), ...ids, dbDate(now), dbDate(new Date(now.getTime() + SOON_MS)),
    ),
    prisma.$queryRawUnsafe<{ uid: string; n: number }[]>(
      `SELECT "assigneeId" AS uid, COUNT(*) AS n FROM tasks WHERE "assigneeId" IN (${marks}) AND "doneAt" IS NULL AND "dueAt" >= ? AND "dueAt" <= ? GROUP BY "assigneeId"`,
      ...ids, dbDate(new Date(now.getTime() - DAY)), dbDate(new Date(now.getTime() + SOON_MS)),
    ),
    prisma.$queryRawUnsafe<{ uid: string; n: number }[]>(
      `SELECT p."userId" AS uid, COUNT(*) AS n FROM conversation_participants p
         JOIN conversations c ON c."id" = p."conversationId" AND c."communityId" IS NULL
         JOIN messages m ON m."id" = (SELECT x."id" FROM messages x WHERE x."conversationId" = p."conversationId" AND x."deletedAt" IS NULL AND x."type" != 'SYSTEM' ORDER BY x."createdAt" DESC LIMIT 1)
         JOIN users u ON u."id" = m."senderId"
       WHERE p."userId" IN (${marks}) AND p."archivedAt" IS NULL AND (p."mutedUntil" IS NULL OR p."mutedUntil" < ?)
         AND m."senderId" != p."userId" AND m."createdAt" >= ? AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt") AND u."email" != ?
       GROUP BY p."userId"`,
      ...ids, dbDate(now), dbDate(new Date(now.getTime() - WAITING_MS)), SYSTEM_EMAIL,
    ),
    staff.length ? prisma.$queryRawUnsafe<{ uid: string; n: number }[]>(
      `SELECT c."teacherId" AS uid, COUNT(*) AS n FROM assignment_submissions s JOIN assignments a ON a."id" = s."assignmentId" JOIN courses c ON c."id" = a."courseId"
       WHERE c."teacherId" IN (${staff.map(() => '?').join(',')}) AND s."status" IN ('SUBMITTED', 'DRAFTED') GROUP BY c."teacherId"`,
      ...staff,
    ) : Promise.resolve([]),
  ]);
  const zone = new Map(people.map((p) => [p.id, weekday(wall(now, p.tz).day)]));
  for (const r of slots) if (Number(r.wd) === zone.get(r.uid)) out.get(r.uid)!.classes += Number(r.n);
  for (const r of work) out.get(r.uid)!.due += Number(r.n);
  for (const r of tasks) out.get(r.uid)!.due += Number(r.n);
  for (const r of chats) out.get(r.uid)!.waiting = Number(r.n);
  for (const r of grading) out.get(r.uid)!.toGrade = Number(r.n);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2 classes · 1 thing due · 3 chats waiting". */
export function countsLine(c: Counts) {
  return [
    c.classes ? plural(c.classes, 'class', 'classes') : null,
    c.due ? `${plural(c.due, 'thing')} due` : null,
    c.toGrade ? `${c.toGrade} to grade` : null,
    c.waiting ? `${plural(c.waiting, 'chat')} waiting` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * The 15-minute cron: morning briefs that are due. People with something today get a bell
 * notification and a push (up to two devices each, within the plan's pushes per run; the rest wait
 * for the next run); everyone done gets their next morning.
 */
export async function sendMorningBriefs() {
  const now = new Date();
  const budget = planLimits().pushes;
  const rows = await prisma.dailyBrief.findMany({
    // At most 30 a run: the next-morning update below binds 3 values per person (D1 takes 100).
    where: { push: true, nextAt: { lte: now } }, orderBy: { nextAt: 'asc' }, take: Math.min(30, budget * 2),
    select: { userId: true, timeZone: true, hour: true, user: { select: { name: true, role: true, status: true } } },
  });
  if (!rows.length) return { due: 0, told: 0 };
  const people = rows.filter((r) => r.user.status !== 'SUSPENDED');
  const counts = await morningCounts(people.map((p) => ({ id: p.userId, role: p.user.role, tz: p.timeZone })));
  const tell = people.filter((p) => countsLine(counts.get(p.userId)!) !== '');
  const subs = tell.length ? await prisma.pushSubscription.findMany({ where: { userId: { in: tell.map((p) => p.userId) } }, orderBy: { createdAt: 'desc' }, select: { userId: true, endpoint: true, p256dh: true, auth: true } }) : [];
  // Within the plan's pushes for this run: whoever doesn't fit waits for the next run (still due).
  const done = new Set(people.filter((p) => !tell.includes(p)).map((p) => p.userId));
  const sends: { sub: (typeof subs)[number]; title: string; body: string; url: string }[] = [];
  const told: typeof tell = [];
  for (const p of tell) {
    const mine = subs.filter((s) => s.userId === p.userId).slice(0, 2);
    if (sends.length + mine.length > budget) break;
    const title = `Good morning, ${p.user.name.split(/\s+/)[0]}`;
    const url = `/${portal(p.user.role)}`;
    for (const sub of mine) sends.push({ sub, title, body: countsLine(counts.get(p.userId)!), url });
    told.push(p);
    done.add(p.userId);
  }
  if (told.length) {
    await prisma.notification.createMany({ data: told.map((p) => ({ userId: p.userId, title: 'Your day', body: countsLine(counts.get(p.userId)!), type: 'brief', link: `/${portal(p.user.role)}` })) });
    await pushService.sendEach(sends.map((s) => ({ subscription: s.sub, payload: { title: s.title, body: s.body, url: s.url, tag: 'daily-brief' } })));
  }
  // Everyone done gets their next morning (one statement).
  const next = people.filter((p) => done.has(p.userId)).concat(rows.filter((r) => r.user.status === 'SUSPENDED'));
  if (next.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE daily_briefs SET "nextAt" = CASE "userId" ${next.map(() => 'WHEN ? THEN ?').join(' ')} END, "sentAt" = ? WHERE "userId" IN (${next.map(() => '?').join(',')})`,
      ...next.flatMap((p) => [p.userId, dbDate(nextMorning(p.timeZone, p.hour, now.getTime() + 3600_000))]), dbDate(now), ...next.map((p) => p.userId),
    );
  }
  return { due: rows.length, told: told.length, pushes: sends.length };
}
