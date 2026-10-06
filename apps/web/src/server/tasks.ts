import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { notify } from './email';

// Task boards (Stage 4 · 3.3): Kanban lists of cards with an assignee, a due date, a checklist,
// notes and comments. A board is yours and whoever you add (editors or viewers), or a course's:
// then everyone in the course can see and edit it. "My tasks" lists open cards assigned to me on
// any board; cards with a due date go into my smart study planner (src/server/smart-planner.ts).
// Every change tells the board's people to refresh (live updates); an assignment notifies in-app.

const MAX_BOARDS = 50, MAX_LISTS = 12, MAX_TASKS = 500, MAX_CHECK = 30, MAX_COMMENT = 2000;

export interface CheckItem { text: string; done: boolean }

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** What I may do on a board. */
async function access(boardId: string, user: SessionUser) {
  const board = await prisma.taskBoard.findUnique({ where: { id: boardId }, select: { id: true, title: true, ownerId: true, courseId: true, members: { select: { userId: true, role: true } } } });
  if (!board) throw new NotFoundException('Board not found.');
  const mine = board.members.find((m) => m.userId === user.id);
  let course: Awaited<ReturnType<typeof courseAccess>> = null;
  if (board.courseId) course = await courseAccess(board.courseId, user);
  const isOwner = board.ownerId === user.id;
  const canSee = isOwner || !!mine || !!course || user.role === 'ADMIN';
  if (!canSee) throw new NotFoundException('Board not found.');
  const canEdit = isOwner || mine?.role === 'EDITOR' || !!course;
  const canManage = isOwner || !!course?.canManage;
  return { board, canEdit, canManage };
}

/** The people who see a board: owner, members and (course boards) the course, up to 300. */
async function audience(board: { ownerId: string; courseId: string | null; members: { userId: string }[] }) {
  const ids = new Set([board.ownerId, ...board.members.map((m) => m.userId)]);
  if (board.courseId) {
    const c = await prisma.course.findUnique({ where: { id: board.courseId }, select: { teacherId: true, enrollments: { select: { studentId: true }, take: 300 } } });
    if (c?.teacherId) ids.add(c.teacherId);
    for (const e of c?.enrollments ?? []) ids.add(e.studentId);
  }
  return [...ids].slice(0, 300);
}

async function changed(boardId: string, board?: { ownerId: string; courseId: string | null; members: { userId: string }[] }) {
  const b = board ?? (await prisma.taskBoard.findUnique({ where: { id: boardId }, select: { ownerId: true, courseId: true, members: { select: { userId: true } } } }));
  if (!b) return;
  await prisma.taskBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } }).catch(() => {});
  publish(await audience(b), { type: 'refresh', keys: [`/api/tasks/${boardId}`, '/api/tasks'] });
}

// ── Boards ─────────────────────────────────────────────────────────────────────────────────

/** My boards (mine, shared with me, my courses'), my open tasks, and my courses (to make a board for one). */
export async function overview(user: SessionUser) {
  const courses = user.role === 'STUDENT'
    ? (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 100 })).map((e) => e.course)
    : await prisma.course.findMany({ where: user.role === 'ADMIN' ? {} : { teacherId: user.id }, select: { id: true, code: true, name: true }, take: 100 });
  const [boards, mine] = await Promise.all([
    prisma.taskBoard.findMany({
      where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }, ...(courses.length ? [{ courseId: { in: courses.map((c) => c.id) } }] : [])] },
      orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, title: true, courseId: true, ownerId: true, updatedAt: true, _count: { select: { tasks: true } } },
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, doneAt: null }, orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }], take: 200,
      select: { id: true, title: true, dueAt: true, boardId: true, board: { select: { title: true } }, list: { select: { title: true } } },
    }),
  ]);
  const code = new Map(courses.map((c) => [c.id, c.code]));
  return {
    courses,
    boards: boards.map((b) => ({ id: b.id, title: b.title, course: b.courseId ? code.get(b.courseId) ?? null : null, mine: b.ownerId === user.id, tasks: b._count.tasks, updatedAt: b.updatedAt })),
    mine: mine.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, boardId: t.boardId, board: t.board.title, list: t.list.title })),
  };
}

export async function createBoard(user: SessionUser, body: Record<string, unknown>) {
  const title = clean(body.title, 80);
  if (!title) throw new BadRequestException('Give the board a name.');
  const courseId = typeof body.courseId === 'string' && body.courseId ? body.courseId : null;
  if (courseId && !(await courseAccess(courseId, user))) throw new NotFoundException('Course not found.');
  if ((await prisma.taskBoard.count({ where: { ownerId: user.id } })) >= MAX_BOARDS) throw new BadRequestException(`You can have up to ${MAX_BOARDS} boards. Delete one first.`);
  const board = await prisma.taskBoard.create({ data: { title, ownerId: user.id, courseId } });
  await prisma.taskList.createMany({ data: ['To do', 'Doing', 'Done'].map((t, i) => ({ boardId: board.id, title: t, position: i + 1 })) });
  return { id: board.id };
}

/** A board with its lists, cards, the people cards can be given to, and what I may do. */
export async function getBoard(boardId: string, user: SessionUser) {
  const { board, canEdit, canManage } = await access(boardId, user);
  const [lists, tasks, people] = await Promise.all([
    prisma.taskList.findMany({ where: { boardId }, orderBy: { position: 'asc' }, select: { id: true, title: true, position: true } }),
    prisma.task.findMany({
      where: { boardId }, orderBy: { position: 'asc' }, take: MAX_TASKS,
      select: { id: true, listId: true, title: true, notes: true, assigneeId: true, dueAt: true, position: true, checklist: true, doneAt: true, _count: { select: { comments: true } } },
    }),
    audience(board).then((ids) => prisma.user.findMany({ where: { id: { in: ids.slice(0, 90) } }, select: { id: true, name: true, avatar: true } })),
  ]);
  const course = board.courseId ? await prisma.course.findUnique({ where: { id: board.courseId }, select: { code: true, name: true } }) : null;
  return {
    id: board.id, title: board.title, course, canEdit, canManage, me: user.id, people,
    members: board.members,
    lists,
    tasks: tasks.map((t) => ({ ...t, checklist: parseChecklist(t.checklist), comments: t._count.comments, _count: undefined })),
  };
}

export async function updateBoard(boardId: string, user: SessionUser, body: Record<string, unknown>) {
  const { board, canManage } = await access(boardId, user);
  if (!canManage) throw new ForbiddenException('Only whoever made this board can rename it.');
  const title = clean(body.title, 80);
  if (title) await prisma.taskBoard.update({ where: { id: boardId }, data: { title } });
  await changed(boardId, board);
  return { ok: true };
}

export async function deleteBoard(boardId: string, user: SessionUser) {
  const { board, canManage } = await access(boardId, user);
  if (!canManage) throw new ForbiddenException('Only whoever made this board can delete it.');
  const people = await audience(board);
  await prisma.taskBoard.delete({ where: { id: boardId } });
  publish(people, { type: 'refresh', keys: ['/api/tasks'] });
  return { ok: true };
}

/** Add someone by email (editor or viewer), or remove them. */
export async function setMember(boardId: string, user: SessionUser, body: Record<string, unknown>) {
  const { board, canManage } = await access(boardId, user);
  if (!canManage) throw new ForbiddenException('Only whoever made this board can share it.');
  if (body.remove && typeof body.userId === 'string') {
    await prisma.taskBoardMember.deleteMany({ where: { boardId, userId: body.userId } });
  } else {
    const email = clean(body.email, 200).toLowerCase();
    const who = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } }) : null;
    if (!who) throw new NotFoundException('Nobody on UniVerse has that email.');
    if (board.members.length >= 100) throw new BadRequestException('A board can be shared with up to 100 people.');
    const role = body.role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
    await prisma.taskBoardMember.upsert({ where: { boardId_userId: { boardId, userId: who.id } }, create: { boardId, userId: who.id, role }, update: { role } });
    void notify(who.id, { title: `${user.name} shared a task board with you`, body: board.title, link: `/tasks/${boardId}`, type: 'info', email: false });
  }
  await changed(boardId);
  return { ok: true };
}

// ── Lists ──────────────────────────────────────────────────────────────────────────────────

export async function addList(boardId: string, user: SessionUser, body: Record<string, unknown>) {
  const { board, canEdit } = await access(boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  const title = clean(body.title, 60);
  if (!title) throw new BadRequestException('Give the list a name.');
  const lists = await prisma.taskList.findMany({ where: { boardId }, select: { position: true } });
  if (lists.length >= MAX_LISTS) throw new BadRequestException(`A board has up to ${MAX_LISTS} lists.`);
  const list = await prisma.taskList.create({ data: { boardId, title, position: Math.max(0, ...lists.map((l) => l.position)) + 1 } });
  await changed(boardId, board);
  return list;
}

export async function updateList(listId: string, user: SessionUser, body: Record<string, unknown>) {
  const list = await prisma.taskList.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw new NotFoundException('List not found.');
  const { board, canEdit } = await access(list.boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  const data: { title?: string; position?: number } = {};
  const title = clean(body.title, 60);
  if (title) data.title = title;
  if (Number.isFinite(body.position)) data.position = Number(body.position);
  await prisma.taskList.update({ where: { id: listId }, data });
  await changed(list.boardId, board);
  return { ok: true };
}

export async function deleteList(listId: string, user: SessionUser) {
  const list = await prisma.taskList.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw new NotFoundException('List not found.');
  const { board, canEdit } = await access(list.boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  if ((await prisma.taskList.count({ where: { boardId: list.boardId } })) <= 1) throw new BadRequestException('A board needs at least one list.');
  await prisma.taskList.delete({ where: { id: listId } });
  await changed(list.boardId, board);
  return { ok: true };
}

// ── Cards ──────────────────────────────────────────────────────────────────────────────────

function parseChecklist(raw: string | null): CheckItem[] {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.slice(0, MAX_CHECK).map((x) => ({ text: String(x?.text ?? '').slice(0, 200), done: !!x?.done })).filter((x) => x.text) : []; } catch { return []; }
}

export async function addTask(boardId: string, user: SessionUser, body: Record<string, unknown>) {
  const { board, canEdit } = await access(boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  const title = clean(body.title, 200);
  if (!title) throw new BadRequestException('Give the card a title.');
  const listId = typeof body.listId === 'string' ? body.listId : '';
  if (!(await prisma.taskList.findFirst({ where: { id: listId, boardId }, select: { id: true } }))) throw new NotFoundException('List not found.');
  if ((await prisma.task.count({ where: { boardId } })) >= MAX_TASKS) throw new BadRequestException(`A board has up to ${MAX_TASKS} cards.`);
  const last = await prisma.task.findFirst({ where: { listId }, orderBy: { position: 'desc' }, select: { position: true } });
  const task = await prisma.task.create({ data: { boardId, listId, title, createdById: user.id, position: (last?.position ?? 0) + 1 } });
  await changed(boardId, board);
  return task;
}

/** Changes a card: title, notes, assignee, due date, list and place, checklist, done. */
export async function updateTask(taskId: string, user: SessionUser, body: Record<string, unknown>) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true, assigneeId: true, title: true } });
  if (!task) throw new NotFoundException('Card not found.');
  const { board, canEdit } = await access(task.boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  const data: { title?: string; notes?: string | null; assigneeId?: string | null; dueAt?: Date | null; listId?: string; position?: number; checklist?: string | null; doneAt?: Date | null } = {};
  if (typeof body.title === 'string' && body.title.trim()) data.title = clean(body.title, 200);
  if (body.notes === null || typeof body.notes === 'string') data.notes = clean(body.notes, 5000) || null;
  if (body.assigneeId === null) data.assigneeId = null;
  else if (typeof body.assigneeId === 'string') {
    if (!(await audience(board)).includes(body.assigneeId)) throw new BadRequestException('Only people on this board can be given a card.');
    data.assigneeId = body.assigneeId;
  }
  if (body.dueAt === null) data.dueAt = null;
  else if (typeof body.dueAt === 'string') { const d = new Date(body.dueAt); if (Number.isNaN(d.getTime())) throw new BadRequestException('That due date isn’t a date.'); data.dueAt = d; }
  if (typeof body.listId === 'string') {
    if (!(await prisma.taskList.findFirst({ where: { id: body.listId, boardId: task.boardId }, select: { id: true } }))) throw new NotFoundException('List not found.');
    data.listId = body.listId;
  }
  if (Number.isFinite(body.position)) data.position = Number(body.position);
  if (Array.isArray(body.checklist)) data.checklist = JSON.stringify(parseChecklist(JSON.stringify(body.checklist)));
  if (typeof body.done === 'boolean') data.doneAt = body.done ? new Date() : null;
  const saved = await prisma.task.update({ where: { id: taskId }, data });
  if (data.assigneeId && data.assigneeId !== task.assigneeId && data.assigneeId !== user.id) {
    void notify(data.assigneeId, { title: `${user.name} gave you a task`, body: `${saved.title} · ${board.title}`, link: `/tasks/${task.boardId}?task=${taskId}`, type: 'reminder', email: false });
  }
  await changed(task.boardId, board);
  return { ok: true };
}

export async function deleteTask(taskId: string, user: SessionUser) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true } });
  if (!task) throw new NotFoundException('Card not found.');
  const { board, canEdit } = await access(task.boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  await prisma.task.delete({ where: { id: taskId } });
  await changed(task.boardId, board);
  return { ok: true };
}

// ── Comments ───────────────────────────────────────────────────────────────────────────────

export async function listComments(taskId: string, user: SessionUser) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true } });
  if (!task) throw new NotFoundException('Card not found.');
  await access(task.boardId, user);
  const rows = await prisma.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, userId: true, body: true, createdAt: true } });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))].slice(0, 90) } }, select: { id: true, name: true, avatar: true } });
  const by = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, user: by.get(r.userId) ?? { id: r.userId, name: 'Someone', avatar: null } }));
}

export async function addComment(taskId: string, user: SessionUser, body: Record<string, unknown>) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true, title: true, assigneeId: true } });
  if (!task) throw new NotFoundException('Card not found.');
  const { board } = await access(task.boardId, user);
  const text = clean(body.body, MAX_COMMENT);
  if (!text) throw new BadRequestException('Write something first.');
  const c = await prisma.taskComment.create({ data: { taskId, userId: user.id, body: text } });
  if (task.assigneeId && task.assigneeId !== user.id) {
    void notify(task.assigneeId, { title: `${user.name} commented on your task`, body: `${task.title}: ${text.slice(0, 140)}`, link: `/tasks/${task.boardId}?task=${taskId}`, type: 'info', email: false });
  }
  publish(await audience(board), { type: 'refresh', keys: [`/api/tasks/items/${taskId}/comments`, `/api/tasks/${task.boardId}`] });
  return c;
}

/** My open cards due in this window, for the smart study planner. */
export function plannerTasks(userId: string, from: Date, to: Date) {
  return prisma.task.findMany({ where: { assigneeId: userId, doneAt: null, dueAt: { gte: from, lte: to } }, select: { id: true, title: true, dueAt: true }, take: 50 });
}
