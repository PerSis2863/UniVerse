import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { taughtBy } from '@/lib/course-access';
import { ftsQuery, plainText } from '@/lib/search-text';

export { plainText };

// Search everywhere (Stage 5 · Q10): documents, task cards and assignments by their words, each
// with the scope that decides who may find it (doc:<id>, tboard:<board>, course:<id>). Rows are
// written in the same request as the change (one statement each); deletes are removed by database
// triggers (migration 0153). A search only looks at the scopes the searcher can open.

export type IndexKind = 'doc' | 'task' | 'assignment';
const MAX_BODY = 20_000;

/** Adds or replaces one row (one statement). Never throws: search catches up on the next change. */
export async function indexItem(it: { kind: IndexKind; ref: string; scope: string; title: string; body: string; sub?: string | null; link: string }) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "search_items" ("kind", "ref", "scope", "title", "body", "sub", "link", "at") VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("kind", "ref") DO UPDATE SET "scope" = excluded."scope", "title" = excluded."title", "body" = excluded."body", "sub" = excluded."sub", "link" = excluded."link", "at" = excluded."at"`,
      it.kind, it.ref, it.scope, it.title.slice(0, 200), it.body.slice(0, MAX_BODY), it.sub ?? null, it.link, Date.now(),
    );
  } catch (e) { console.error('search index:', e); }
}

/** A new title, keeping the words already there (one statement). */
export async function indexTitle(kind: IndexKind, ref: string, title: string) {
  try { await prisma.$executeRawUnsafe(`UPDATE "search_items" SET "title" = ?, "at" = ? WHERE "kind" = ? AND "ref" = ?`, title.slice(0, 200), Date.now(), kind, ref); }
  catch (e) { console.error('search index:', e); }
}

/** A course's assignments added in bulk (a copied course): their rows in one statement (≤ 90 ids). */
export async function indexCourseAssignments(courseId: string, ids: string[]) {
  const part = ids.slice(0, 90);
  if (!part.length) return;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "search_items" ("kind", "ref", "scope", "title", "body", "sub", "link", "at")
       SELECT 'assignment', a."id", 'course:' || a."courseId", a."title", a."instructions", c."code", 'assignment:' || a."id", ? FROM "assignments" a JOIN "courses" c ON c."id" = a."courseId"
       WHERE a."courseId" = ? AND a."id" IN (${part.map(() => '?').join(', ')})
       ON CONFLICT("kind", "ref") DO UPDATE SET "title" = excluded."title", "body" = excluded."body", "sub" = excluded."sub"`,
      Date.now(), courseId, ...part,
    );
  } catch (e) { console.error('search index:', e); }
}

export const docLink = (id: string, kind: string) => `${kind === 'sheet' ? '/sheets' : kind === 'slides' ? '/slides' : '/docs'}/${id}`;

/** The scopes this person can open: their courses' assignments, their documents and task boards. */
async function scopesOf(user: SessionUser) {
  const [courses, groups] = await Promise.all([
    user.role === 'STUDENT'
      ? prisma.enrollment.findMany({ where: { studentId: user.id }, select: { courseId: true }, take: 80 }).then((r) => r.map((e) => e.courseId))
      : prisma.course.findMany({ where: taughtBy(user.id), select: { id: true }, take: 80 }).then((r) => r.map((c) => c.id)),
    prisma.groupMembership.findMany({ where: { userId: user.id }, select: { groupId: true }, take: 80 }).then((r) => r.map((m) => m.groupId)),
  ]);
  const shared = [...(courses.length ? [{ courseId: { in: courses } }] : []), ...(groups.length ? [{ groupId: { in: groups } }] : [])];
  const [docs, boards] = await Promise.all([
    prisma.doc.findMany({ where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, ...shared] }, orderBy: { updatedAt: 'desc' }, take: 240, select: { id: true } }),
    prisma.taskBoard.findMany({ where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, ...shared] }, orderBy: { updatedAt: 'desc' }, take: 80, select: { id: true } }),
  ]);
  return { courses, boards: boards.map((b) => b.id), scopes: [...courses.map((c) => `course:${c}`), ...docs.map((d) => `doc:${d.id}`), ...boards.map((b) => `tboard:${b.id}`)] };
}

export interface IndexHit { kind: IndexKind; ref: string; title: string; sub: string | null; link: string; snippet: string }

/** The best matches this person may open, at most `limit`. */
export async function searchIndex(user: SessionUser, q: string, limit = 12, mine?: Awaited<ReturnType<typeof scopesOf>>): Promise<IndexHit[]> {
  const match = ftsQuery(q);
  if (!match) return [];
  const { scopes } = mine ?? (await scopesOf(user));
  const hits: (IndexHit & { rank: number })[] = [];
  // D1 takes up to 100 values a query: the scopes 90 at a time; the database ranks the matches.
  for (let i = 0; i < scopes.length; i += 90) {
    const part = scopes.slice(i, i + 90);
    hits.push(...(await prisma.$queryRawUnsafe<(IndexHit & { rank: number })[]>(
      `SELECT s."kind", s."ref", s."title", s."sub", s."link", snippet("search_fts", 1, '«', '»', '…', 18) AS "snippet", bm25("search_fts", 3.0, 1.0) AS "rank"
       FROM "search_fts" JOIN "search_items" s ON s."id" = "search_fts".rowid
       WHERE "search_fts" MATCH ? AND s."scope" IN (${part.map(() => '?').join(', ')}) ORDER BY "rank" LIMIT ?`,
      match, ...part, limit,
    )));
  }
  const portal = user.role === 'TEACHER' || user.role === 'ADMIN' ? '/teacher' : '/student';
  return hits.sort((a, b) => a.rank - b.rank).slice(0, limit).map(({ rank: _r, ...h }) => {
    void _r;
    return { ...h, link: h.link.startsWith('assignment:') ? `${portal}/assignments/${h.link.slice(11)}` : h.link };
  });
}

export interface FoundItem { type: 'doc' | 'sheet' | 'slides' | 'task' | 'assignment' | 'material' | 'board' | 'event'; id: string; title: string; subtitle?: string; snippet?: string; href: string }

/** Everything of mine that matches: words inside documents, cards and assignments (the index), and
 *  by name my courses' materials, my task boards and campus events. */
export async function searchMine(user: SessionUser, q: string): Promise<FoundItem[]> {
  const mine = await scopesOf(user);
  const like = q.slice(0, 80);
  const portal = user.role === 'TEACHER' ? '/teacher' : user.role === 'ADMIN' ? '/admin' : '/student';
  const [hits, materials, boards, events] = await Promise.all([
    searchIndex(user, q, 12, mine),
    mine.courses.length ? prisma.material.findMany({ where: { courseId: { in: mine.courses.slice(0, 90) }, title: { contains: like } }, take: 5, select: { id: true, title: true, courseId: true, course: { select: { code: true } } } }) : [],
    mine.boards.length ? prisma.taskBoard.findMany({ where: { id: { in: mine.boards.slice(0, 90) }, title: { contains: like } }, take: 4, select: { id: true, title: true } }) : [],
    prisma.campusItem.findMany({ where: { kind: 'EVENT', OR: [{ title: { contains: like } }, { description: { contains: like } }], startAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { startAt: 'asc' }, take: 4, select: { id: true, title: true, startAt: true, location: true } }),
  ]);
  const clip = (t: string) => t.replace(/\s+/g, ' ').trim();
  return [
    ...hits.map((h): FoundItem => ({
      type: h.kind === 'doc' ? (h.sub === 'sheet' ? 'sheet' : h.sub === 'slides' ? 'slides' : 'doc') : h.kind,
      id: h.ref, title: h.title, subtitle: h.kind === 'doc' ? undefined : h.sub ?? undefined, snippet: clip(h.snippet) || undefined, href: h.link,
    })),
    ...materials.map((m): FoundItem => ({ type: 'material', id: m.id, title: m.title, subtitle: m.course.code, href: `${portal === '/admin' ? '/teacher' : portal}/blackboard?course=${m.courseId}&tab=materials` })),
    ...boards.map((b): FoundItem => ({ type: 'board', id: b.id, title: b.title, subtitle: 'Task board', href: `/tasks/${b.id}` })),
    ...events.map((e): FoundItem => ({ type: 'event', id: e.id, title: e.title, subtitle: [e.startAt?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), e.location].filter(Boolean).join(' · '), href: portal === '/student' ? '/student/life/events' : portal === '/admin' ? '/admin/monitoring/events' : '/campus-map' })),
  ];
}
