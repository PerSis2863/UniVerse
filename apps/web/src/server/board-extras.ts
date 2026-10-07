import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { boardAccess, canEdit } from './boards';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { notifyMentioned } from './mentions';
import { publish } from './realtime';

// Boards (Stage 4 · 3.4, part 3): comments on shapes, and saved versions.
// Comments: anyone who can see the board comments (@name notifies, 3.9); editors and the author
// resolve. Versions: editors save the board's elements (named, or automatic while drawing), keep
// the latest 30 automatic ones and every named one; restoring is done by the board's app, so it
// syncs like any edit.

const MAX_COMMENT = 1000, MAX_VERSION_BYTES = 900_000, KEEP_AUTO = 30, AUTO_GAP_MS = 10 * 60_000;

async function access(boardId: string, user: SessionUser) {
  const a = await boardAccess(boardId, user.id);
  if (!a) throw new NotFoundException('This board doesn’t exist or hasn’t been shared with you.');
  return a;
}
async function people(boardId: string, ownerId: string) {
  const m = await prisma.boardMember.findMany({ where: { boardId }, select: { userId: true }, take: 300 });
  return [ownerId, ...m.map((x) => x.userId)];
}

/** GET /api/boards/:id/comments */
export async function listBoardComments(boardId: string, user: SessionUser) {
  const a = await access(boardId, user);
  const rows = await prisma.boardComment.findMany({ where: { boardId }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, elementId: true, body: true, resolvedAt: true, createdAt: true, user: { select: { id: true, name: true, avatar: true } } } });
  return { comments: rows.map((c) => ({ ...c, canResolve: c.user.id === user.id || canEdit(a.role) })) };
}

/** POST /api/boards/:id/comments { elementId, body } */
export async function addBoardComment(boardId: string, user: SessionUser, b: Record<string, unknown>) {
  const a = await access(boardId, user);
  const elementId = typeof b.elementId === 'string' ? b.elementId.slice(0, 64) : '';
  const body = typeof b.body === 'string' ? b.body.trim().slice(0, MAX_COMMENT) : '';
  if (!elementId || !body) throw new BadRequestException('Write something first.');
  if ((await prisma.boardComment.count({ where: { boardId } })) >= 2000) throw new BadRequestException('This board has too many comments. Resolve or delete some first.');
  const c = await prisma.boardComment.create({ data: { boardId, elementId, userId: user.id, body }, select: { id: true } });
  const ids = await people(boardId, a.board.ownerId);
  await notifyMentioned(body, ids, user, { title: a.board.title, link: `/boards/${boardId}` });
  publish(ids, { type: 'refresh', keys: [`/api/boards/${boardId}/comments`] });
  return c;
}

/** PATCH /api/boards/comments/:cid { resolved } · DELETE (the author) */
export async function changeBoardComment(commentId: string, user: SessionUser, b: Record<string, unknown> | null) {
  const c = await prisma.boardComment.findUnique({ where: { id: commentId }, select: { id: true, boardId: true, userId: true } });
  if (!c) throw new NotFoundException('This comment isn’t there any more.');
  const a = await access(c.boardId, user);
  if (b === null) {
    if (c.userId !== user.id && a.role !== 'OWNER') throw new ForbiddenException('Only whoever wrote it can delete this comment.');
    await prisma.boardComment.delete({ where: { id: commentId } });
  } else {
    if (c.userId !== user.id && !canEdit(a.role)) throw new ForbiddenException('You can only read this board.');
    await prisma.boardComment.update({ where: { id: commentId }, data: { resolvedAt: b.resolved === true ? new Date() : null } });
  }
  publish(await people(c.boardId, a.board.ownerId), { type: 'refresh', keys: [`/api/boards/${c.boardId}/comments`] });
  return { ok: true };
}

/** GET /api/boards/:id/versions — the list (without the elements). */
export async function listBoardVersions(boardId: string, user: SessionUser) {
  await access(boardId, user);
  const rows = await prisma.boardVersion.findMany({ where: { boardId }, orderBy: { createdAt: 'desc' }, take: 80, select: { id: true, name: true, count: true, createdAt: true, createdById: true } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return { versions: rows.map((r) => ({ id: r.id, name: r.name, count: r.count, at: r.createdAt, by: names.get(r.createdById) ?? 'Someone' })) };
}

/** POST /api/boards/:id/versions { elements, name?, auto? } — editors. Automatic saves at most every 10 min. */
export async function saveBoardVersion(boardId: string, user: SessionUser, b: Record<string, unknown>) {
  const a = await access(boardId, user);
  if (!canEdit(a.role)) throw new ForbiddenException('You can only look at this board.');
  if (!Array.isArray(b.elements)) throw new BadRequestException('Nothing to save.');
  const elements = (b.elements as unknown[]).filter((e) => e && typeof e === 'object' && !(e as { isDeleted?: boolean }).isDeleted).slice(0, 5000);
  const json = JSON.stringify(elements);
  if (json.length > MAX_VERSION_BYTES) throw new BadRequestException('This board is too big to save as a version.');
  const auto = b.auto === true;
  const name = !auto && typeof b.name === 'string' ? b.name.trim().slice(0, 80) || null : null;
  if (auto) {
    const last = await prisma.boardVersion.findFirst({ where: { boardId, name: null }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, elements: true } });
    if (last && (Date.now() - last.createdAt.getTime() < AUTO_GAP_MS || last.elements === json)) return { saved: false };
  }
  const v = await prisma.boardVersion.create({ data: { boardId, name, elements: json, count: elements.length, createdById: user.id }, select: { id: true } });
  const old = await prisma.boardVersion.findMany({ where: { boardId, name: null }, orderBy: { createdAt: 'desc' }, skip: KEEP_AUTO, select: { id: true } });
  if (old.length) await prisma.boardVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { saved: true, id: v.id };
}

/** GET /api/boards/versions/:vid — one version's elements (to preview or restore). */
export async function getBoardVersion(versionId: string, user: SessionUser) {
  const v = await prisma.boardVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new NotFoundException('This version isn’t there any more.');
  const a = await access(v.boardId, user);
  return { id: v.id, name: v.name, at: v.createdAt, canRestore: canEdit(a.role), elements: JSON.parse(v.elements) as unknown[] };
}

/** Who can be @mentioned on a board (3.9 autocomplete). */
export async function whiteboardPeople(boardId: string, user: SessionUser) {
  const a = await access(boardId, user);
  return people(boardId, a.board.ownerId);
}
