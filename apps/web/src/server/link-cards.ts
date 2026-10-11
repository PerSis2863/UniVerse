import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { boardAccess } from './boards';
import { canReadDoc } from './docs';
import { NotFoundException } from './http';
import { canReadTaskBoard } from './tasks';

// Live cards for links to the app's own docs, whiteboards and task boards in chats (Stage 5 ·
// B7.10; src/lib/app-links.ts): the title, the start of a doc, a board's small picture, a task
// board's progress. Only for people who may open the item; everyone else sees the plain link.

/** GET /api/link-card?kind=doc|board|tasks&id= */
export async function linkCard(user: SessionUser, kind: string | null, id: string | null) {
  const none = () => new NotFoundException('You can’t open this.');
  if (!id || id.length > 40) throw none();
  if (kind === 'doc') {
    if (!(await canReadDoc(id, user))) throw none();
    const d = await prisma.doc.findUnique({ where: { id }, select: { title: true, preview: true, updatedAt: true } });
    if (!d) throw none();
    return { kind, title: d.title || 'Untitled doc', snippet: d.preview?.slice(0, 160) ?? null, updatedAt: d.updatedAt.toISOString() };
  }
  if (kind === 'board') {
    const a = await boardAccess(id, user.id);
    if (!a) throw none();
    const b = await prisma.board.findUnique({ where: { id }, select: { title: true, thumbnail: true, updatedAt: true } });
    if (!b) throw none();
    // The small preview picture only if it's an inline image (no outside addresses).
    return { kind, title: b.title || 'Whiteboard', thumbnail: b.thumbnail?.startsWith('data:image/') && b.thumbnail.length < 200_000 ? b.thumbnail : null, updatedAt: b.updatedAt.toISOString() };
  }
  if (kind === 'tasks') {
    if (!(await canReadTaskBoard(id, user))) throw none();
    const now = new Date();
    const [t, total, done, overdue] = await Promise.all([
      prisma.taskBoard.findUnique({ where: { id }, select: { title: true } }),
      prisma.task.count({ where: { boardId: id } }),
      prisma.task.count({ where: { boardId: id, doneAt: { not: null } } }),
      prisma.task.count({ where: { boardId: id, doneAt: null, dueAt: { lt: now } } }),
    ]);
    if (!t) throw none();
    return { kind, title: t.title || 'Tasks', progress: { done, total, overdue } };
  }
  throw none();
}
