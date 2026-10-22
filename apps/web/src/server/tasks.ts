import prisma from '@/lib/db';
import { MAX_BLOCKERS, PRIORITIES, REPEATS, cleanLabels, makesCycle, nextDue, parseList, type Priority, type Repeat } from '@/lib/task-extras';
import { ACTIONS, MAX_RULES, TRIGGERS, actionsFor, matching, type Action, type Rule, type Trigger } from '@/lib/task-automation';
import { courseAccess, taughtBy } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { publish } from './realtime';
import { notify } from './email';
import { groupAccess, groupPeople } from './spaces';
import { notifyMentioned } from './mentions';
import { indexItem } from './search-index';
import { inSchools, schoolsOf, usersIn } from './school-scope';

// Task boards (Stage 4 · 3.3): Kanban lists of cards with an assignee, a due date, a checklist,
// notes and comments. A board is yours and whoever you add (editors or viewers), or a course's:
// then everyone in the course can see and edit it. "My tasks" lists open cards assigned to me on
// any board; cards with a due date go into my smart study planner (src/server/smart-planner.ts).
// Every change tells the board's people to refresh (live updates); an assignment notifies in-app.

const MAX_BOARDS = 50, MAX_LISTS = 12, MAX_TASKS = 500, MAX_CHECK = 30, MAX_COMMENT = 2000;

export interface CheckItem { text: string; done: boolean }

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** An admin of the school whose person owns this board (school-scope.ts); the platform owner, any. */
async function adminOver(ownerId: string, user: SessionUser) {
  if (user.role !== 'ADMIN') return false;
  const schools = await schoolsOf(user);
  if (schools === 'all') return true;
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { organizationId: true } });
  return !!owner && inSchools(schools, owner.organizationId);
}

/** What I may do on a board. */
async function access(boardId: string, user: SessionUser) {
  const board = await prisma.taskBoard.findUnique({ where: { id: boardId }, select: { id: true, title: true, ownerId: true, courseId: true, groupId: true, members: { select: { userId: true, role: true } } } });
  if (!board) throw new NotFoundException('Board not found.');
  const mine = board.members.find((m) => m.userId === user.id);
  let course: Awaited<ReturnType<typeof courseAccess>> = null;
  if (board.courseId) course = await courseAccess(board.courseId, user);
  let group = board.groupId ? await groupAccess(board.groupId, user) : null;
  // Admins see their own school's boards only (whoever owns it is in their school): another
  // school's look "not found". groupAccess lets in any admin, so one outside the group is checked too.
  if (group && !group.group.members.length && !(await adminOver(board.ownerId, user))) group = null;
  const isOwner = board.ownerId === user.id;
  const canSee = isOwner || !!mine || !!course || !!group || (await adminOver(board.ownerId, user));
  if (!canSee) throw new NotFoundException('Board not found.');
  const canEdit = isOwner || mine?.role === 'EDITOR' || !!course || !!group;
  const canManage = isOwner || !!course?.canManage || !!group?.canManage;
  return { board, canEdit, canManage };
}

/** Whether someone may see a task board (its comments' translations check this; Stage 5 · B7.5). */
export async function canReadTaskBoard(boardId: string, user: SessionUser) {
  try { await access(boardId, user); return true; } catch { return false; }
}

/** The people who see a board: owner, members and (course boards) the course, up to 300. */
async function audience(board: { ownerId: string; courseId: string | null; groupId?: string | null; members: { userId: string }[] }) {
  const ids = new Set([board.ownerId, ...board.members.map((m) => m.userId)]);
  if (board.groupId) for (const u of await groupPeople(board.groupId)) ids.add(u);
  if (board.courseId) {
    const c = await prisma.course.findUnique({ where: { id: board.courseId }, select: { teacherId: true, enrollments: { select: { studentId: true }, take: 300 } } });
    if (c?.teacherId) ids.add(c.teacherId);
    for (const e of c?.enrollments ?? []) ids.add(e.studentId);
  }
  return [...ids].slice(0, 300);
}

async function changed(boardId: string, board?: { ownerId: string; courseId: string | null; groupId?: string | null; members: { userId: string }[] }) {
  const b = board ?? (await prisma.taskBoard.findUnique({ where: { id: boardId }, select: { ownerId: true, courseId: true, groupId: true, members: { select: { userId: true } } } }));
  if (!b) return;
  await prisma.taskBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } }).catch(() => {});
  publish(await audience(b), { type: 'refresh', keys: [`/api/tasks/${boardId}`, '/api/tasks'] });
}

// ── Boards ─────────────────────────────────────────────────────────────────────────────────

/** My boards (mine, shared with me, my courses'), my open tasks, and my courses (to make a board for one). */
export async function overview(user: SessionUser) {
  const courses = user.role === 'STUDENT'
    ? (await prisma.enrollment.findMany({ where: { studentId: user.id }, select: { course: { select: { id: true, code: true, name: true } } }, take: 100 })).map((e) => e.course)
    : await prisma.course.findMany({ where: user.role === 'ADMIN' ? { teacher: usersIn(await schoolsOf(user)) } : taughtBy(user.id), select: { id: true, code: true, name: true }, take: 100 });
  const groups = (await prisma.groupMembership.findMany({ where: { userId: user.id }, select: { group: { select: { id: true, name: true } } }, take: 100 })).map((m) => m.group);
  // Three lookups, put together: the course and group lists can be long (an admin's whole school),
  // and a long list inside OR can't be split for D1's 100 values (src/lib/d1-split.ts); on their own they are.
  const select = { id: true, title: true, courseId: true, groupId: true, ownerId: true, updatedAt: true, _count: { select: { tasks: true } } } as const;
  const [own, ofCourses, ofGroups, mine] = await Promise.all([
    prisma.taskBoard.findMany({ where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] }, orderBy: { updatedAt: 'desc' }, take: 100, select }),
    courses.length ? prisma.taskBoard.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, orderBy: { updatedAt: 'desc' }, take: 100, select }) : [],
    groups.length ? prisma.taskBoard.findMany({ where: { groupId: { in: groups.map((g) => g.id) } }, orderBy: { updatedAt: 'desc' }, take: 100, select }) : [],
    prisma.task.findMany({
      where: { assigneeId: user.id, doneAt: null }, orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }], take: 200,
      select: { id: true, title: true, dueAt: true, boardId: true, board: { select: { title: true } }, list: { select: { title: true } } },
    }),
  ]);
  const boards = [...new Map([...own, ...ofCourses, ...ofGroups].map((b) => [b.id, b])).values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 100);
  const code = new Map([...courses.map((c) => [c.id, c.code] as const), ...groups.map((g) => [g.id, g.name] as const)]);
  return {
    courses, groups,
    boards: boards.map((b) => ({ id: b.id, title: b.title, course: b.courseId ? code.get(b.courseId) ?? null : b.groupId ? code.get(b.groupId) ?? null : null, mine: b.ownerId === user.id, tasks: b._count.tasks, updatedAt: b.updatedAt })),
    mine: mine.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, boardId: t.boardId, board: t.board.title, list: t.list.title })),
  };
}

export async function createBoard(user: SessionUser, body: Record<string, unknown>) {
  const title = clean(body.title, 80);
  if (!title) throw new BadRequestException('Give the board a name.');
  const courseId = typeof body.courseId === 'string' && body.courseId ? body.courseId : null;
  const groupId = !courseId && typeof body.groupId === 'string' && body.groupId ? body.groupId : null;
  if (courseId && !(await courseAccess(courseId, user))) throw new NotFoundException('Course not found.');
  if (groupId && !(await groupAccess(groupId, user))) throw new NotFoundException('Group not found.');
  if ((await prisma.taskBoard.count({ where: { ownerId: user.id } })) >= MAX_BOARDS) throw new BadRequestException(`You can have up to ${MAX_BOARDS} boards. Delete one first.`);
  const board = await prisma.taskBoard.create({ data: { title, ownerId: user.id, courseId, groupId } });
  await prisma.taskList.createMany({ data: ['To do', 'Doing', 'Done'].map((t, i) => ({ boardId: board.id, title: t, position: i + 1 })) });
  return { id: board.id };
}

/** A board with its lists, cards, the people cards can be given to, and what I may do. */
export async function getBoard(boardId: string, user: SessionUser) {
  const { board, canEdit, canManage } = await access(boardId, user);
  const [lists, tasks, people] = await Promise.all([
    prisma.taskList.findMany({ where: { boardId }, orderBy: { position: 'asc' }, select: { id: true, title: true, position: true, wipLimit: true } }),
    prisma.task.findMany({
      where: { boardId }, orderBy: { position: 'asc' }, take: MAX_TASKS,
      select: { id: true, listId: true, title: true, notes: true, assigneeId: true, dueAt: true, position: true, checklist: true, doneAt: true, createdAt: true, priority: true, labels: true, estimate: true, repeat: true, blockedBy: true, _count: { select: { comments: true } } },
    }),
    audience(board).then((ids) => prisma.user.findMany({ where: { id: { in: ids.slice(0, 90) } }, select: { id: true, name: true, avatar: true } })),
  ]);
  const course = board.courseId ? await prisma.course.findUnique({ where: { id: board.courseId }, select: { code: true, name: true } }) : null;
  return {
    id: board.id, title: board.title, course, canEdit, canManage, me: user.id, people,
    members: board.members,
    lists,
    tasks: tasks.map((t) => ({ ...t, checklist: parseChecklist(t.checklist), labels: parseList(t.labels), blockedBy: parseList(t.blockedBy), comments: t._count.comments, _count: undefined })),
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
    await notify(who.id, { title: `${user.name} shared a task board with you`, body: board.title, link: `/tasks/${boardId}`, type: 'info', email: false });
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
  const data: { title?: string; position?: number; wipLimit?: number | null } = {};
  const title = clean(body.title, 60);
  if (title) data.title = title;
  if (Number.isFinite(body.position)) data.position = Number(body.position);
  // A work-in-progress limit (Stage 5 · B9.9): 1–99 open cards, or none.
  if (body.wipLimit === null || body.wipLimit === 0) data.wipLimit = null;
  else if (Number.isInteger(Number(body.wipLimit)) && Number(body.wipLimit) >= 1) data.wipLimit = Math.min(99, Number(body.wipLimit));
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
  await indexItem({ kind: 'task', ref: task.id, scope: `tboard:${boardId}`, title, body: '', sub: board.title, link: `/tasks/${boardId}?task=${task.id}` }); // search (Stage 5 · Q10)
  await runAutomations(boardId, board, task, { kind: 'created', listId }, user);
  await changed(boardId, board);
  return task;
}

/** Changes a card: title, notes, assignee, due date, list and place, checklist, done. */
/** A board's first list (where a repeating card's next one goes). */
async function firstList(boardId: string) {
  return (await prisma.taskList.findFirst({ where: { boardId }, orderBy: { position: 'asc' }, select: { id: true } }))?.id ?? null;
}

export async function updateTask(taskId: string, user: SessionUser, body: Record<string, unknown>) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { boardId: true, assigneeId: true, title: true, doneAt: true, repeat: true, dueAt: true, listId: true, notes: true, priority: true, labels: true, estimate: true } });
  if (!task) throw new NotFoundException('Card not found.');
  const { board, canEdit } = await access(task.boardId, user);
  if (!canEdit) throw new ForbiddenException('You can only look at this board.');
  const data: { title?: string; notes?: string | null; assigneeId?: string | null; dueAt?: Date | null; listId?: string; position?: number; checklist?: string | null; doneAt?: Date | null; priority?: string | null; labels?: string | null; estimate?: number | null; repeat?: string | null; blockedBy?: string | null } = {};
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
  // Card extras (Stage 5 · B9.9).
  if (body.priority === null || PRIORITIES.includes(body.priority as Priority)) data.priority = (body.priority as string | null) ?? null;
  if (body.labels !== undefined) { const l = cleanLabels(body.labels); data.labels = l.length ? JSON.stringify(l) : null; }
  if (body.estimate === null) data.estimate = null;
  else if (Number.isFinite(Number(body.estimate)) && body.estimate !== '') data.estimate = Math.max(0, Math.min(999, Math.round(Number(body.estimate) * 4) / 4));
  if (body.repeat === null || REPEATS.includes(body.repeat as Repeat)) data.repeat = (body.repeat as string | null) ?? null;
  if (body.blockedBy !== undefined) {
    const want = [...new Set(Array.isArray(body.blockedBy) ? body.blockedBy.filter((x): x is string => typeof x === 'string' && x !== taskId) : [])].slice(0, MAX_BLOCKERS);
    const cards = want.length ? await prisma.task.findMany({ where: { boardId: task.boardId }, select: { id: true, blockedBy: true }, take: MAX_TASKS }) : [];
    const waits = new Map(cards.map((c) => [c.id, parseList(c.blockedBy)]));
    const ok = want.filter((id) => waits.has(id));
    if (ok.some((id) => makesCycle(taskId, id, (x) => waits.get(x) ?? []))) throw new BadRequestException('That would make the cards wait on each other in a circle.');
    data.blockedBy = ok.length ? JSON.stringify(ok) : null;
  }
  const saved = await prisma.task.update({ where: { id: taskId }, data });
  if (data.title !== undefined || data.notes !== undefined) await indexItem({ kind: 'task', ref: taskId, scope: `tboard:${task.boardId}`, title: saved.title, body: saved.notes ?? '', sub: board.title, link: `/tasks/${task.boardId}?task=${taskId}` });
  // Moved to another list: the board's automations for that list run.
  if (data.listId && data.listId !== task.listId) await runAutomations(task.boardId, board, saved, { kind: 'moved', listId: data.listId }, user);
  // A repeating card marked done makes the next one, due one step later.
  if (data.doneAt && !task.doneAt && task.repeat && REPEATS.includes(task.repeat as Repeat)) {
    const listId = (await firstList(task.boardId)) ?? task.listId;
    const last = await prisma.task.findFirst({ where: { listId }, orderBy: { position: 'desc' }, select: { position: true } });
    await prisma.task.create({ data: { boardId: task.boardId, listId, title: saved.title, notes: task.notes, assigneeId: saved.assigneeId, dueAt: nextDue(task.dueAt ?? new Date(), task.repeat as Repeat), position: (last?.position ?? 0) + 1, priority: task.priority, labels: task.labels, estimate: task.estimate, repeat: task.repeat, createdById: user.id } });
  }
  if (data.assigneeId && data.assigneeId !== task.assigneeId && data.assigneeId !== user.id) {
    await notify(data.assigneeId, { title: `${user.name} gave you a task`, body: `${saved.title} · ${board.title}`, link: `/tasks/${task.boardId}?task=${taskId}`, type: 'reminder', email: false });
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
  const people = await audience(board);
  // @mentions (3.9) notify whoever is named; the assignee hears about other comments as before.
  const pinged = await notifyMentioned(text, people, user, { title: task.title, link: `/tasks/${task.boardId}?task=${taskId}` });
  if (task.assigneeId && task.assigneeId !== user.id && !pinged.includes(task.assigneeId)) {
    await notify(task.assigneeId, { title: `${user.name} commented on your task`, body: `${task.title}: ${text.slice(0, 140)}`, link: `/tasks/${task.boardId}?task=${taskId}`, type: 'info', email: false });
  }
  publish(people, { type: 'refresh', keys: [`/api/tasks/items/${taskId}/comments`, `/api/tasks/${task.boardId}`] });
  return c;
}

/** My open cards due in this window, for the smart study planner. */
export function plannerTasks(userId: string, from: Date, to: Date) {
  return prisma.task.findMany({ where: { assigneeId: userId, doneAt: null, dueAt: { gte: from, lte: to } }, select: { id: true, title: true, dueAt: true }, take: 50 });
}

/** Who can be @mentioned here (3.9 autocomplete): the people who can see it. */
export async function boardPeople(id: string, user: SessionUser) {
  const { board } = await access(id, user);
  return audience(board);
}

// ── Automations (Stage 5 · B9.10; src/lib/task-automation.ts) ──────────────────────────────

type BoardLike = { id: string; title: string; ownerId: string; courseId: string | null; groupId?: string | null; members: { userId: string }[] };

/** Runs the rules a card event sets off. What rules change doesn't set off more rules. */
async function runAutomations(boardId: string, board: BoardLike, task: { id: string; title: string; assigneeId: string | null; labels: string | null }, event: { kind: 'moved' | 'created'; listId: string }, user: SessionUser) {
  const rules = (await prisma.taskAutomation.findMany({ where: { boardId, enabled: true, trigger: event.kind }, take: MAX_RULES })) as Rule[];
  const hits = matching(rules, event);
  if (!hits.length) return;
  const people = await audience(board);
  const data: { assigneeId?: string | null; priority?: string; labels?: string; doneAt?: Date } = {};
  let labels = parseList(task.labels);
  let assignee = task.assigneeId;
  for (const r of hits) {
    if (r.action === 'assign' && (!r.userId || people.includes(r.userId))) { data.assigneeId = r.userId; assignee = r.userId; }
    if (r.action === 'priority' && PRIORITIES.includes(r.value as Priority)) data.priority = r.value!;
    if (r.action === 'label' && r.value) { labels = cleanLabels([...labels, r.value]); data.labels = JSON.stringify(labels); }
    if (r.action === 'done') data.doneAt = new Date();
  }
  if (Object.keys(data).length) await prisma.task.update({ where: { id: task.id }, data });
  const list = (await prisma.taskList.findUnique({ where: { id: event.listId }, select: { title: true } }))?.title ?? 'a list';
  const link = `/tasks/${boardId}?task=${task.id}`;
  const told = new Set<string>([user.id]);
  for (const r of hits.filter((x) => x.action === 'notify')) {
    const to = r.userId ?? assignee;
    if (!to || told.has(to) || !people.includes(to)) continue;
    told.add(to);
    await notify(to, { title: event.kind === 'moved' ? `“${task.title}” moved to ${list}` : `New card in ${list}: ${task.title}`, body: board.title, link, type: 'reminder', email: false });
  }
  if (data.assigneeId && !told.has(data.assigneeId)) await notify(data.assigneeId, { title: `You were given a task: ${task.title}`, body: board.title, link, type: 'reminder', email: false });
}

/** GET /api/tasks/:id/automations: the board's rules (anyone on it can see them; its managers change them). */
export async function listAutomations(boardId: string, user: SessionUser) {
  const { canManage } = await access(boardId, user);
  const rules = await prisma.taskAutomation.findMany({ where: { boardId }, orderBy: { createdAt: 'asc' }, select: { id: true, trigger: true, listId: true, action: true, userId: true, value: true, enabled: true } });
  return { canManage, rules };
}

/** POST /api/tasks/:id/automations { trigger, listId?, action, userId?, value? } */
export async function createAutomation(boardId: string, user: SessionUser, b: Record<string, unknown>) {
  const { board, canManage } = await access(boardId, user);
  if (!canManage) throw new ForbiddenException('Only the board’s owner changes its automations.');
  const trigger = TRIGGERS.find((t) => t === b.trigger) as Trigger | undefined;
  const action = ACTIONS.find((a) => a === b.action) as Action | undefined;
  if (!trigger || !action || !actionsFor(trigger).includes(action)) throw new BadRequestException('Choose when it happens and what to do.');
  let listId: string | null = null;
  if (trigger !== 'due-soon' && typeof b.listId === 'string' && b.listId) {
    if (!(await prisma.taskList.findFirst({ where: { id: b.listId, boardId }, select: { id: true } }))) throw new NotFoundException('List not found.');
    listId = b.listId;
  }
  let userId: string | null = null;
  if (typeof b.userId === 'string' && b.userId) {
    if (!(await audience(board)).includes(b.userId)) throw new BadRequestException('Only people on this board can be chosen.');
    userId = b.userId;
  }
  if (action === 'assign' && !userId) throw new BadRequestException('Choose who to give it to.');
  let value: string | null = null;
  if (action === 'priority') { if (!PRIORITIES.includes(b.value as Priority)) throw new BadRequestException('Choose a priority.'); value = b.value as string; }
  if (action === 'label') { value = cleanLabels([b.value])[0] ?? null; if (!value) throw new BadRequestException('Type the label.'); }
  if ((await prisma.taskAutomation.count({ where: { boardId } })) >= MAX_RULES) throw new BadRequestException(`A board has up to ${MAX_RULES} automations.`);
  return prisma.taskAutomation.create({ data: { boardId, trigger, listId, action, userId, value, createdById: user.id }, select: { id: true, trigger: true, listId: true, action: true, userId: true, value: true, enabled: true } });
}

/** PATCH /api/tasks/automations/:id { enabled } · DELETE */
export async function changeAutomation(id: string, user: SessionUser, b: Record<string, unknown> | null) {
  const rule = await prisma.taskAutomation.findUnique({ where: { id }, select: { boardId: true } });
  if (!rule) throw new NotFoundException('That automation is gone.');
  const { canManage } = await access(rule.boardId, user);
  if (!canManage) throw new ForbiddenException('Only the board’s owner changes its automations.');
  if (b === null) { await prisma.taskAutomation.delete({ where: { id } }); return { deleted: true }; }
  if (typeof b.enabled === 'boolean') await prisma.taskAutomation.update({ where: { id }, data: { enabled: b.enabled } });
  return { ok: true };
}

/**
 * Due-soon automations (the 15-minute check): cards due within a day, not done, not told about
 * yet, on boards with such a rule. In-app notices in one statement; at most 50 cards a run.
 */
export async function remindDueTasks() {
  const now = new Date();
  const rules = await prisma.taskAutomation.findMany({ where: { trigger: 'due-soon', enabled: true }, select: { boardId: true, userId: true }, take: 200 });
  if (!rules.length) return 0;
  const boards = [...new Set(rules.map((r) => r.boardId))].slice(0, 90);
  const tasks = await prisma.task.findMany({ where: { boardId: { in: boards }, doneAt: null, dueRemindedAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + 86_400_000) } }, take: 50, select: { id: true, boardId: true, title: true, assigneeId: true, dueAt: true, board: { select: { title: true } } } });
  if (!tasks.length) return 0;
  await prisma.task.updateMany({ where: { id: { in: tasks.map((t) => t.id) } }, data: { dueRemindedAt: now } });
  const notes = tasks.flatMap((t) => [...new Set(rules.filter((r) => r.boardId === t.boardId).map((r) => r.userId ?? t.assigneeId).filter((u): u is string => !!u))]
    .map((userId) => ({ userId, title: `Due soon: ${t.title}`, body: `${t.board.title} · due ${t.dueAt!.toISOString().slice(0, 16).replace('T', ' ')} UTC`, type: 'reminder', link: `/tasks/${t.boardId}?task=${t.id}` })));
  if (notes.length) {
    await prisma.notification.createMany({ data: notes });
    publish([...new Set(notes.map((n) => n.userId))].slice(0, 40), { type: 'notification' });
  }
  return notes.length;
}
