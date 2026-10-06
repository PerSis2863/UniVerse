import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { evidenceFromGroupWork, skillKey } from './skill-evidence';
import { groupAccess, type SpaceKind } from './spaces';

// Fair group work (Stage 4 · 4.3): who did what in a class's or study group's shared work, from what's
// already recorded: writing and code (edits counted by the live room, cloudflare/worker.ts CodeRoom →
// contributions), tasks finished and made, reviews (document and task comments) and, in study groups,
// posts. Within each tool your share is yours / the group's; overall is your average share across the
// tools the group used, so typing a lot can't outweigh finishing tasks. Study-group teammates rate
// each other (1–5; only averages are shown, and to a student only once three people rated them).
// Whoever runs the space sees everyone; students see their own part. A teacher can verify someone's
// part, which becomes skill evidence in their passport.

const TOOLS = ['writing', 'code', 'tasks', 'reviews', 'posts'] as const;
type Tool = (typeof TOOLS)[number];
const LEVELS = new Set(['Developing', 'Proficient', 'Advanced']);
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
/** Rows of authors → [{ authorId, _count }] (the same shape as a groupBy). */
const tally = (rows: { authorId: string }[]) => [...rows.reduce((m, r) => m.set(r.authorId, (m.get(r.authorId) ?? 0) + 1), new Map<string, number>())].map(([authorId, n]) => ({ authorId, _count: { _all: n } }));

async function space(kind: string, id: string, user: SessionUser) {
  if (kind === 'course') {
    const a = await courseAccess(id, user);
    if (!a) throw new NotFoundException('This class isn’t one of yours.');
    const c = await prisma.course.findUnique({ where: { id }, select: { teacher: { select: { id: true, name: true, avatar: true } }, enrollments: { take: 200, select: { student: { select: { id: true, name: true, avatar: true } } } } } });
    return { kind: 'course' as SpaceKind, title: `${a.course.code} · ${a.course.name}`, canManage: a.canManage, people: [...(c?.teacher ? [c.teacher] : []), ...(c?.enrollments.map((e) => e.student) ?? [])] };
  }
  if (kind === 'group') {
    const a = await groupAccess(id, user);
    if (!a) throw new NotFoundException('This group isn’t one of yours.');
    const people = (await prisma.groupMembership.findMany({ where: { groupId: id }, take: 200, select: { user: { select: { id: true, name: true, avatar: true } } } })).map((m) => m.user);
    return { kind: 'group' as SpaceKind, title: a.group.name, canManage: a.canManage, people };
  }
  throw new NotFoundException('Space not found.');
}

/** GET /api/spaces/[kind]/[id]/contributions?days=: everyone's part (or just mine), over that time. */
export async function spaceContributions(kind: string, id: string, user: SessionUser, daysRaw: unknown) {
  const s = await space(kind, id, user);
  const days = [7, 30, 90, 365].includes(Number(daysRaw)) ? Number(daysRaw) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);
  const where = s.kind === 'course' ? { courseId: id } : { groupId: id };
  const [docs, boards, code] = await Promise.all([
    prisma.doc.findMany({ where, take: 300, select: { id: true } }).then((r) => r.map((d) => d.id)),
    prisma.taskBoard.findMany({ where, take: 100, select: { id: true } }).then((r) => r.map((b) => b.id)),
    s.kind === 'course' ? prisma.codeRoom.findMany({ where: { courseId: id }, take: 300, select: { id: true } }).then((r) => r.map((c) => c.id)) : Promise.resolve([] as string[]),
  ]);
  const sum = async (tool: 'doc' | 'code', ids: string[]) => (await Promise.all(chunks(ids).map((c) => prisma.contribution.groupBy({ by: ['userId'], where: { tool, refId: { in: c }, day: { gte: sinceDay } }, _sum: { edits: true, bytes: true } })))).flat();
  const [writing, coding, versions, docComments, done, made, taskComments, posts, ratings, verified] = await Promise.all([
    sum('doc', docs),
    sum('code', code),
    Promise.all(chunks(docs).map((c) => prisma.docVersion.groupBy({ by: ['authorId'], where: { docId: { in: c }, createdAt: { gte: since } }, _count: { _all: true } }))).then((x) => x.flat()),
    Promise.all(chunks(docs).map((c) => prisma.docComment.findMany({ where: { docId: { in: c }, createdAt: { gte: since } }, select: { userId: true }, take: 5000 }))).then((x) => tally(x.flat().map((r) => ({ authorId: r.userId })))),
    Promise.all(chunks(boards).map((c) => prisma.task.groupBy({ by: ['assigneeId'], where: { boardId: { in: c }, doneAt: { gte: since }, assigneeId: { not: null } }, _count: { _all: true } }))).then((x) => x.flat()),
    Promise.all(chunks(boards).map((c) => prisma.task.groupBy({ by: ['createdById'], where: { boardId: { in: c }, createdAt: { gte: since } }, _count: { _all: true } }))).then((x) => x.flat()),
    Promise.all(chunks(boards).map((c) => prisma.taskComment.findMany({ where: { task: { boardId: { in: c } }, createdAt: { gte: since } }, select: { userId: true }, take: 5000 }))).then((x) => tally(x.flat().map((r) => ({ authorId: r.userId })))),
    s.kind === 'group' ? prisma.groupPost.groupBy({ by: ['authorId'], where: { groupId: id, createdAt: { gte: since } }, _count: { _all: true } }) : Promise.resolve([]),
    s.kind === 'group' ? prisma.peerRating.groupBy({ by: ['rateeId'], where: { spaceKind: s.kind, spaceId: id }, _avg: { score: true }, _count: { _all: true } }) : Promise.resolve([]),
    prisma.skillEvidence.findMany({ where: { kind: 'PROJECT', sourceId: `${s.kind}:${id}` }, select: { userId: true, label: true, level: true } }),
  ]);
  const of = <T extends Record<string, unknown>>(rows: T[], key: keyof T, uid: string) => rows.find((r) => r[key] === uid);
  const count = (rows: { _count: { _all: number } }[], key: string, uid: string) => (of(rows as unknown as Record<string, unknown>[], key, uid) as { _count?: { _all: number } } | undefined)?._count?._all ?? 0;
  const rows = s.people.map((p) => {
    const w = writing.find((r) => r.userId === p.id), c = coding.find((r) => r.userId === p.id);
    return {
      id: p.id, name: p.name, avatar: p.avatar,
      writing: { edits: w?._sum.edits ?? 0, bytes: w?._sum.bytes ?? 0, versions: count(versions, 'authorId', p.id) },
      code: { edits: c?._sum.edits ?? 0, bytes: c?._sum.bytes ?? 0 },
      tasks: { done: count(done, 'assigneeId', p.id), made: count(made, 'createdById', p.id) },
      reviews: count(docComments, 'authorId', p.id) + count(taskComments, 'authorId', p.id),
      posts: count(posts as { _count: { _all: number } }[], 'authorId', p.id),
    };
  });
  // Each tool's measure: bytes written, tasks finished, reviews, posts.
  const measure: Record<Tool, (r: (typeof rows)[number]) => number> = {
    writing: (r) => r.writing.bytes, code: (r) => r.code.bytes, tasks: (r) => r.tasks.done, reviews: (r) => r.reviews, posts: (r) => r.posts,
  };
  const totals = Object.fromEntries(TOOLS.map((t) => [t, rows.reduce((n, r) => n + measure[t](r), 0)])) as Record<Tool, number>;
  const used = TOOLS.filter((t) => totals[t] > 0);
  const people = rows.map((r) => {
    const rating = ratings.find((x) => x.rateeId === r.id);
    const shares = Object.fromEntries(used.map((t) => [t, measure[t](r) / totals[t]])) as Partial<Record<Tool, number>>;
    return {
      ...r, shares,
      share: used.length ? used.reduce((n, t) => n + (shares[t] ?? 0), 0) / used.length : 0,
      rating: rating ? { avg: Math.round((rating._avg.score ?? 0) * 10) / 10, count: rating._count._all } : null,
      verified: verified.filter((v) => v.userId === r.id).map((v) => ({ skill: v.label, level: v.level })),
    };
  });
  const mine = people.find((p) => p.id === user.id) ?? null;
  // Students: their own part (their rating only once three people rated them) and whom they rated.
  const myRatings = s.kind === 'group' ? await prisma.peerRating.findMany({ where: { spaceKind: s.kind, spaceId: id, raterId: user.id }, select: { rateeId: true, score: true } }) : [];
  return {
    days, used, totals, canManage: s.canManage, canVerify: s.canManage && (user.role === 'TEACHER' || user.role === 'ADMIN'), ratings: s.kind === 'group',
    people: s.canManage ? people.sort((a, b) => b.share - a.share) : [],
    me: mine ? { ...mine, rating: mine.rating && mine.rating.count >= 3 ? mine.rating : null } : null,
    teammates: s.kind === 'group' ? s.people.filter((p) => p.id !== user.id).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, myScore: myRatings.find((r) => r.rateeId === p.id)?.score ?? null })) : [],
    size: s.people.length,
  };
}

/** POST …/ratings { rateeId, score, note? }: I rate a study-group teammate (1–5; I can change it). */
export async function ratePeer(kind: string, id: string, user: SessionUser, b: Record<string, unknown>) {
  if (kind !== 'group') throw new BadRequestException('Teammates rate each other in study groups.');
  const s = await space(kind, id, user);
  const rateeId = String(b.rateeId ?? '');
  const score = Math.round(Number(b.score));
  if (rateeId === user.id) throw new BadRequestException('You can’t rate yourself.');
  if (!s.people.some((p) => p.id === rateeId)) throw new NotFoundException('That person isn’t in this group.');
  if (!(score >= 1 && score <= 5)) throw new BadRequestException('Pick 1 to 5 stars.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  await prisma.peerRating.upsert({
    where: { spaceKind_spaceId_raterId_rateeId: { spaceKind: kind, spaceId: id, raterId: user.id, rateeId } },
    update: { score, note, updatedAt: new Date() },
    create: { spaceKind: kind, spaceId: id, raterId: user.id, rateeId, score, note },
  });
  return { ok: true };
}

/** POST …/verify { userId, skills: string[], level }: a teacher verifies someone's part (skill evidence). */
export async function verifyContribution(kind: string, id: string, user: SessionUser, b: Record<string, unknown>) {
  const s = await space(kind, id, user);
  if (!s.canManage || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) throw new ForbiddenException('Only a teacher who runs this space can verify group work.');
  const target = s.people.find((p) => p.id === String(b.userId ?? ''));
  if (!target) throw new NotFoundException('That person isn’t in this space.');
  const skills = (Array.isArray(b.skills) ? b.skills : []).map((x) => String(x ?? '').trim().slice(0, 60)).filter((x, i, all) => x && all.findIndex((y) => skillKey(y) === skillKey(x)) === i).slice(0, 6);
  const level = LEVELS.has(String(b.level)) ? String(b.level) : 'Proficient';
  const c = await spaceContributions(kind, id, user, 90);
  const row = c.people.find((p) => p.id === target.id);
  const detail = row ? `${Math.round(row.share * 100)}% of the group’s work over 90 days` : 'Group work';
  await evidenceFromGroupWork({ userId: target.id, spaceKey: `${s.kind}:${id}`, spaceTitle: s.title, skills, level, detail, teacher: { id: user.id, name: user.name } });
  return { ok: true, skills };
}
