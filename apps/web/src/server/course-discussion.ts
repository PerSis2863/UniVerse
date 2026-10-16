import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { planLimits } from '@/lib/plan-limits';
import { logAiUse } from './ai-receipts';
import { spendAi } from './ai-budget';
import { notify } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { publish } from './realtime';
import { coursePassages } from './tutor';

// The discussion board of a course (Stage 5 · B2). Its students, its teacher and admins take part.
// A question can be answered: whoever asked, or the teacher, accepts a reply; the teacher can also
// endorse good replies. Students may hide their name from classmates (the teacher always sees it).
// The teacher can ask for an AI draft of an answer from the course's own materials, to edit and send.

const TITLE_MAX = 150;
const BODY_MAX = 5000;
const LIST_MAX = 100;
const POSTS_MAX = 200;

export type ThreadKind = 'QUESTION' | 'DISCUSSION';
type Viewer = { user: SessionUser; canManage: boolean; teacherId: string };

async function access(courseId: string, user: SessionUser): Promise<Viewer & { course: { id: string; code: string; name: string } }> {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  // The whole teaching team moderates (assistants too).
  return { user, canManage: a.canGrade, teacherId: a.course.teacherId, course: { id: a.course.id, code: a.course.code, name: a.course.name } };
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** How an author shows to this viewer: classmates don't see the name of an anonymous post. */
export function authorFor(v: Viewer, author: { id: string; name: string; avatar: string | null; role: string }, anonymous: boolean) {
  const staff = author.id === v.teacherId || author.role === 'ADMIN' || author.role === 'TEACHER';
  const mine = author.id === v.user.id;
  if (anonymous && !staff && !mine && !v.canManage) return { id: null, name: 'Anonymous classmate', avatar: null, staff: false, mine: false, anonymous: true };
  return { id: author.id, name: author.name, avatar: author.avatar, staff, mine, anonymous };
}

const AUTHOR = { select: { id: true, name: true, avatar: true, role: true } } as const;

async function votedBy(userId: string, ids: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    for (const v of await prisma.courseVote.findMany({ where: { userId, targetId: { in: ids.slice(i, i + 90) } }, select: { targetId: true } })) out.add(v.targetId);
  }
  return out;
}

const listKey = (courseId: string) => `/api/courses/${courseId}/discussion*`;

/** Refreshes the board for the people in a thread and the teacher (live updates, no polling). */
async function tellThread(courseId: string, threadId: string, teacherId: string) {
  const people = await prisma.coursePost.findMany({ where: { threadId }, select: { authorId: true }, distinct: ['authorId'], take: planLimits().livePushes });
  const thread = await prisma.courseThread.findUnique({ where: { id: threadId }, select: { authorId: true } });
  publish([teacherId, ...(thread ? [thread.authorId] : []), ...people.map((p) => p.authorId)].slice(0, planLimits().livePushes), { type: 'refresh', keys: [listKey(courseId)] });
}

/** GET /api/courses/:id/discussion?filter=all|unanswered|mine&q= — pinned first, then most recent activity. */
export async function listThreads(courseId: string, user: SessionUser, filter: string | null, q: string | null) {
  const v = await access(courseId, user);
  const search = clean(q, 80);
  const where = {
    courseId,
    ...(filter === 'unanswered' ? { kind: 'QUESTION', answerId: null } : filter === 'mine' ? { authorId: user.id } : {}),
    ...(search ? { OR: [{ title: { contains: search } }, { body: { contains: search } }] } : {}),
  };
  const threads = await prisma.courseThread.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { lastActivityAt: 'desc' }],
    take: LIST_MAX,
    select: {
      id: true, kind: true, title: true, body: true, anonymous: true, pinned: true, locked: true, answerId: true, votes: true, replies: true, createdAt: true, lastActivityAt: true,
      author: AUTHOR, _count: { select: { posts: { where: { endorsed: true } } } },
    },
  });
  const mine = await votedBy(user.id, threads.map((t) => t.id));
  return {
    course: v.course,
    canManage: v.canManage,
    threads: threads.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, excerpt: t.body.slice(0, 220), pinned: t.pinned, locked: t.locked,
      answered: !!t.answerId, endorsed: t._count.posts > 0, votes: t.votes, replies: t.replies, voted: mine.has(t.id),
      author: authorFor(v, t.author, t.anonymous), createdAt: t.createdAt, lastActivityAt: t.lastActivityAt,
    })),
  };
}

/** POST /api/courses/:id/discussion { title, body, kind, anonymous } */
export async function createThread(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  const v = await access(courseId, user);
  const title = clean(b.title, TITLE_MAX);
  const body = clean(b.body, BODY_MAX);
  if (title.length < 3) throw new BadRequestException('Give your post a short title.');
  if (!body) throw new BadRequestException('Write what you’d like to ask or discuss.');
  const kind: ThreadKind = b.kind === 'DISCUSSION' ? 'DISCUSSION' : 'QUESTION';
  // Only students can hide their name (the teacher's posts are always theirs).
  const anonymous = b.anonymous === true && !v.canManage;
  const t = await prisma.courseThread.create({ data: { courseId, authorId: user.id, kind, title, body, anonymous }, select: { id: true } });
  if (kind === 'QUESTION' && user.id !== v.teacherId) {
    await notify(v.teacherId, {
      title: `New question in ${v.course.code}`, body: title, type: 'info', email: false,
      link: `/teacher/blackboard?course=${courseId}&tab=discussion&thread=${t.id}`, courseId,
    });
  }
  publish([v.teacherId, user.id], { type: 'refresh', keys: [listKey(courseId)] });
  return t;
}

async function threadIn(courseId: string, threadId: string) {
  const t = await prisma.courseThread.findFirst({ where: { id: threadId, courseId } });
  if (!t) throw new NotFoundException('This post isn’t there any more.');
  return t;
}

/** GET /api/courses/:id/discussion/:threadId — the thread and its replies (accepted answer first). */
export async function getThread(courseId: string, threadId: string, user: SessionUser) {
  const v = await access(courseId, user);
  const t = await prisma.courseThread.findFirst({ where: { id: threadId, courseId }, include: { author: AUTHOR } });
  if (!t) throw new NotFoundException('This post isn’t there any more.');
  const posts = await prisma.coursePost.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' }, take: POSTS_MAX, include: { author: AUTHOR } });
  const mine = await votedBy(user.id, [t.id, ...posts.map((p) => p.id)]);
  const asReply = (p: (typeof posts)[number]) => ({
    id: p.id, body: p.body, votes: p.votes, voted: mine.has(p.id), endorsed: p.endorsed, accepted: p.id === t.answerId, editedAt: p.editedAt, createdAt: p.createdAt,
    author: authorFor(v, p.author, p.anonymous), canEdit: p.authorId === user.id, canDelete: p.authorId === user.id || v.canManage,
  });
  const replies = posts.map(asReply);
  // The accepted answer first, then the rest in order.
  replies.sort((a, b) => Number(b.accepted) - Number(a.accepted));
  return {
    course: v.course,
    canManage: v.canManage,
    thread: {
      id: t.id, kind: t.kind, title: t.title, body: t.body, pinned: t.pinned, locked: t.locked, answered: !!t.answerId, votes: t.votes, voted: mine.has(t.id),
      editedAt: t.editedAt, createdAt: t.createdAt, author: authorFor(v, t.author, t.anonymous),
      canEdit: t.authorId === user.id, canDelete: t.authorId === user.id || v.canManage, canAccept: t.kind === 'QUESTION' && (t.authorId === user.id || v.canManage),
      canReply: !t.locked || v.canManage,
    },
    replies,
  };
}

/** An in-app notice (never email) that opens the thread on the person's own course board. */
async function tell(userId: string, title: string, body: string, courseId: string, threadId: string) {
  const who = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const side = who?.role === 'TEACHER' || who?.role === 'ADMIN' ? 'teacher' : 'student';
  await notify(userId, { title, body, type: 'info', email: false, link: `/${side}/blackboard?course=${courseId}&tab=discussion&thread=${threadId}`, courseId });
}

/**
 * POST /api/courses/:id/discussion/:threadId { action, … }:
 * reply { body, anonymous } · vote { target } · accept { post | null } · endorse { post, on } ·
 * pin { on } · lock { on } · edit { target, title?, body } · delete { target }.
 */
export async function threadAction(courseId: string, threadId: string, user: SessionUser, b: Record<string, unknown>) {
  const v = await access(courseId, user);
  const t = await threadIn(courseId, threadId);
  const now = new Date();
  const post = async (id: unknown) => {
    const p = typeof id === 'string' ? await prisma.coursePost.findFirst({ where: { id, threadId } }) : null;
    if (!p) throw new NotFoundException('That reply isn’t there any more.');
    return p;
  };
  const manage = () => { if (!v.canManage) throw new ForbiddenException('Only the course’s teacher can do that.'); };
  let result: Record<string, unknown> = { ok: true };

  switch (b.action) {
    case 'reply': {
      if (t.locked && !v.canManage) throw new ForbiddenException('This post is closed to new replies.');
      const body = clean(b.body, BODY_MAX);
      if (!body) throw new BadRequestException('Write your reply first.');
      const p = await prisma.coursePost.create({ data: { threadId, authorId: user.id, body, anonymous: b.anonymous === true && !v.canManage }, select: { id: true } });
      await prisma.courseThread.update({ where: { id: threadId }, data: { replies: { increment: 1 }, lastActivityAt: now } });
      if (t.authorId !== user.id) await tell(t.authorId, `New reply in ${v.course.code}`, t.title, courseId, threadId);
      result = { id: p.id };
      break;
    }
    case 'vote': {
      const target = typeof b.target === 'string' ? b.target : threadId;
      // Your own posts can't be upvoted by you.
      const owner = target === threadId ? t.authorId : (await post(target)).authorId;
      if (owner === user.id) throw new BadRequestException('You can’t upvote your own post.');
      const had = await prisma.courseVote.findUnique({ where: { userId_targetId: { userId: user.id, targetId: target } }, select: { userId: true } });
      if (had) await prisma.courseVote.delete({ where: { userId_targetId: { userId: user.id, targetId: target } } });
      else await prisma.courseVote.create({ data: { userId: user.id, targetId: target } });
      const by = had ? -1 : 1;
      if (target === threadId) await prisma.courseThread.update({ where: { id: threadId }, data: { votes: { increment: by } } });
      else await prisma.coursePost.update({ where: { id: target }, data: { votes: { increment: by } } });
      result = { voted: !had };
      break;
    }
    case 'accept': {
      if (t.kind !== 'QUESTION') throw new BadRequestException('Only questions have an answer.');
      if (t.authorId !== user.id && !v.canManage) throw new ForbiddenException('Only whoever asked, or the teacher, can choose the answer.');
      const p = b.post === null ? null : await post(b.post);
      await prisma.courseThread.update({ where: { id: threadId }, data: { answerId: p?.id ?? null } });
      if (p && p.authorId !== user.id) await tell(p.authorId, 'Your reply was marked as the answer', t.title, courseId, threadId);
      break;
    }
    case 'endorse': {
      manage();
      const p = await post(b.post);
      const on = b.on !== false;
      await prisma.coursePost.update({ where: { id: p.id }, data: { endorsed: on } });
      if (on && p.authorId !== user.id) await tell(p.authorId, 'Your teacher endorsed your reply', t.title, courseId, threadId);
      break;
    }
    case 'pin': manage(); await prisma.courseThread.update({ where: { id: threadId }, data: { pinned: b.on !== false } }); break;
    case 'lock': manage(); await prisma.courseThread.update({ where: { id: threadId }, data: { locked: b.on !== false } }); break;
    case 'edit': {
      const body = clean(b.body, BODY_MAX);
      if (!body) throw new BadRequestException('A post can’t be empty.');
      if (!b.target || b.target === threadId) {
        if (t.authorId !== user.id) throw new ForbiddenException('You can only edit your own posts.');
        const title = clean(b.title, TITLE_MAX) || t.title;
        await prisma.courseThread.update({ where: { id: threadId }, data: { title, body, editedAt: now } });
      } else {
        const p = await post(b.target);
        if (p.authorId !== user.id) throw new ForbiddenException('You can only edit your own replies.');
        await prisma.coursePost.update({ where: { id: p.id }, data: { body, editedAt: now } });
      }
      break;
    }
    case 'delete': {
      if (!b.target || b.target === threadId) {
        if (t.authorId !== user.id && !v.canManage) throw new ForbiddenException('You can only delete your own posts.');
        const ids = (await prisma.coursePost.findMany({ where: { threadId }, select: { id: true } })).map((p) => p.id);
        for (let i = 0; i < ids.length + 1; i += 90) await prisma.courseVote.deleteMany({ where: { targetId: { in: [threadId, ...ids].slice(i, i + 90) } } });
        await prisma.courseThread.delete({ where: { id: threadId } });
        publish([v.teacherId, user.id], { type: 'refresh', keys: [listKey(courseId)] });
        return { ok: true, deleted: 'thread' };
      }
      const p = await post(b.target);
      if (p.authorId !== user.id && !v.canManage) throw new ForbiddenException('You can only delete your own replies.');
      await prisma.courseVote.deleteMany({ where: { targetId: p.id } });
      await prisma.coursePost.delete({ where: { id: p.id } });
      await prisma.courseThread.update({ where: { id: threadId }, data: { replies: { decrement: 1 }, ...(t.answerId === p.id ? { answerId: null } : {}) } });
      break;
    }
    default:
      throw new BadRequestException('Unknown action.');
  }
  await tellThread(courseId, threadId, v.teacherId);
  return result;
}

const SUGGEST_SYSTEM = `You help a university teacher answer a student's question on the course discussion board. Draft a reply the teacher will check and edit before posting.
Use ONLY the numbered course passages provided. Cite the passages you used like [1] or [2] right after the sentence they support.
If the passages don't cover it, say so in "grounded": false and write a short honest draft that points the student to where to look or says the teacher will follow up; don't make things up.
Explain simply, step by step. Guide rather than hand over a graded answer. Same language as the question. Under 200 words, plain text, no headings.`;

/** POST /api/courses/:id/discussion/:threadId/suggest — an AI draft answer for the teacher (never posted by itself). */
export async function suggestAnswer(courseId: string, threadId: string, user: SessionUser) {
  const v = await access(courseId, user);
  if (!v.canManage) throw new ForbiddenException('Only the course’s teacher can ask for a draft answer.');
  const t = await threadIn(courseId, threadId);
  const { found, text } = await coursePassages(courseId, `${t.title} ${t.body}`);
  if (!found.length) return { draft: null, reason: 'no-sources' as const, message: 'The AI needs course materials to draft from: add readable files (PDF or text) in Materials or AI tutor sources.' };
  const spend = await spendAi(user);
  if (!spend.ok) return { draft: null, reason: 'limit' as const, message: spend.message };
  await logAiUse(user.id, { kind: 'discussion', detail: t.title, courseId });
  const out = await geminiJson<{ draft: string; grounded: boolean }>(
    SUGGEST_SYSTEM,
    `Course: ${v.course.code} — ${v.course.name}\n\nCourse passages:\n${text}\n\nStudent's question: ${t.title}\n${t.body.slice(0, 2000)}`,
    { type: 'OBJECT', properties: { draft: { type: 'STRING' }, grounded: { type: 'BOOLEAN' } }, required: ['draft', 'grounded'] },
    900,
  );
  if (!out?.draft) throw new HttpException('The AI couldn’t draft an answer this time. Try again, or write one yourself.', 503);
  const used = new Set([...out.draft.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return { draft: out.draft.slice(0, BODY_MAX), grounded: out.grounded, sources: found.filter((p) => used.has(p.n)).map((p) => ({ n: p.n, title: p.title })), reason: null };
}
