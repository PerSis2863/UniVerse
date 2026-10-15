import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { ITEM_KINDS, REF_KINDS, lockFor, nextItem, percent, type ItemKind } from '@/lib/course-modules';
import { LessonPageError, cleanPageBody } from '@/lib/lesson-page';
import { oneOf, str, text, type Body } from './body';
import { publish } from './realtime';

// Course modules (Stage 5 · B2): a course's ordered units, each a list of things to do. Students
// see their progress (✓ per item), the next item, and why a module is still locked (release date,
// or a quiz score it needs). Teachers build them from what the course already has (materials,
// quizzes, assignments, live classes) plus pages, links and videos, and see how many students
// finished each item. Quizzes and assignments count as done once handed in.

type Access = { course: { id: string }; canManage: boolean };
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const inChunks = async <T,>(ids: string[], run: (part: string[]) => Promise<T[]>) => (await Promise.all(chunks([...new Set(ids)]).map(run))).flat();
const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const isHttp = (v: string) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };

export class ModuleError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Pages' text, without the rich pages' (up to 300 kB each: loaded when opened, pageView): rich says which. */
export const pageTexts = (ids: string[]) => inChunks(ids, (part) => prisma.$queryRawUnsafe<{ id: string; body: string | null; rich: number | null }[]>(
  `SELECT id, CASE WHEN substr(body, 1, 13) = '{"type":"doc"' THEN NULL ELSE body END AS body, substr(body, 1, 13) = '{"type":"doc"' AS rich FROM module_items WHERE id IN (${part.map(() => '?').join(', ')})`, ...part));

/** Everything the Modules tab shows, shaped for the viewer. */
export async function modulesView(courseId: string, user: SessionUser, access: Access) {
  const { canManage } = access;
  const modules = await prisma.courseModule.findMany({
    where: { courseId, ...(canManage ? {} : { published: true }) },
    orderBy: { position: 'asc' },
    include: { items: { orderBy: { position: 'asc' }, select: { id: true, kind: true, refId: true, title: true, url: true, position: true } } },
  });
  const items = modules.flatMap((m) => m.items);
  const refs = (kind: ItemKind) => items.filter((i) => i.kind === kind && i.refId).map((i) => i.refId!);
  const quizIds = [...refs('QUIZ'), ...modules.map((m) => m.requireQuizId).filter((x): x is string => !!x)];

  const [pages, materials, quizzes, assignments, events] = await Promise.all([
    pageTexts(items.filter((i) => i.kind === 'PAGE').map((i) => i.id)),
    inChunks(refs('FILE'), (part) => prisma.material.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, type: true, fileUrl: true } })),
    inChunks(quizIds, (part) => prisma.quiz.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, status: true, dueDate: true } })),
    inChunks(refs('ASSIGNMENT'), (part) => prisma.assignment.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, dueDate: true } })),
    inChunks(refs('LIVE'), (part) => prisma.calendarEvent.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, startAt: true } })),
  ]);
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const [page, mat, quiz, asg, ev] = [byId(pages), byId(materials), byId(quizzes), byId(assignments), byId(events)];

  // Done: a student's own; a teacher's view counts students.
  const done = new Set<string>();
  const counts = new Map<string, number>();
  const best = new Map<string, number>();
  let students = 0;
  if (canManage) {
    const [enrolled, prog, qs, as] = await Promise.all([
      prisma.enrollment.count({ where: { courseId } }),
      inChunks(items.map((i) => i.id), (part) => prisma.itemProgress.groupBy({ by: ['itemId'], where: { itemId: { in: part } }, _count: { _all: true } })),
      inChunks(refs('QUIZ'), (part) => prisma.quizSubmission.groupBy({ by: ['quizId'], where: { quizId: { in: part } }, _count: { _all: true } })),
      inChunks(refs('ASSIGNMENT'), (part) => prisma.assignmentSubmission.groupBy({ by: ['assignmentId'], where: { assignmentId: { in: part } }, _count: { _all: true } })),
    ]);
    students = enrolled;
    for (const p of prog) counts.set(p.itemId, p._count._all);
    for (const q of qs) counts.set(`QUIZ:${q.quizId}`, q._count._all);
    for (const a of as) counts.set(`ASSIGNMENT:${a.assignmentId}`, a._count._all);
  } else {
    const [prog, qs, as] = await Promise.all([
      inChunks(items.map((i) => i.id), (part) => prisma.itemProgress.findMany({ where: { userId: user.id, itemId: { in: part } }, select: { itemId: true } })),
      inChunks(quizIds, (part) => prisma.quizSubmission.findMany({ where: { studentId: user.id, quizId: { in: part } }, select: { quizId: true, score: true, maxScore: true } })),
      inChunks(refs('ASSIGNMENT'), (part) => prisma.assignmentSubmission.findMany({ where: { studentId: user.id, assignmentId: { in: part } }, select: { assignmentId: true } })),
    ]);
    for (const p of prog) done.add(p.itemId);
    for (const q of qs) { done.add(`QUIZ:${q.quizId}`); const pc = percent(q.score, q.maxScore); if (pc != null) best.set(q.quizId, Math.max(best.get(q.quizId) ?? 0, pc)); }
    for (const a of as) done.add(`ASSIGNMENT:${a.assignmentId}`);
  }

  const teacherPaths = user.role === 'TEACHER' || user.role === 'ADMIN';
  const now = new Date();
  const shaped = modules.map((m) => {
    const lock = canManage ? ({ locked: false } as const) : lockFor({ ...m, requireQuizTitle: m.requireQuizId ? quiz.get(m.requireQuizId)?.title ?? null : null }, now, m.requireQuizId ? best.get(m.requireQuizId) ?? null : null);
    const list = m.items.map((i) => {
      const key = i.kind === 'QUIZ' || i.kind === 'ASSIGNMENT' ? `${i.kind}:${i.refId}` : i.id;
      let href: string | null = null, meta: string | null = null, missing = false;
      switch (i.kind) {
        case 'FILE': { const x = i.refId ? mat.get(i.refId) : null; missing = !x; href = x?.fileUrl ?? null; meta = x?.type ?? null; break; }
        case 'QUIZ': { const x = i.refId ? quiz.get(i.refId) : null; missing = !x; href = x ? (teacherPaths ? '/teacher/quizzes' : '/student/quizzes') : null; meta = x?.dueDate ? `Due ${day(x.dueDate)}` : x?.status === 'DRAFT' ? 'Draft' : null; break; }
        case 'ASSIGNMENT': { const x = i.refId ? asg.get(i.refId) : null; missing = !x; href = x ? `/${teacherPaths ? 'teacher' : 'student'}/assignments/${x.id}` : null; meta = x?.dueDate ? `Due ${day(x.dueDate)}` : null; break; }
        case 'LIVE': { const x = i.refId ? ev.get(i.refId) : null; missing = !x; href = x ? `/${teacherPaths ? 'teacher' : 'student'}/calendar` : null; meta = x ? x.startAt.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null; break; }
        case 'LINK': case 'VIDEO': href = i.url; break;
      }
      const hidden = lock.locked;
      // A rich page (the page editor's) is loaded when opened (pageView), so the list stays small.
      const p = page.get(i.id);
      const rich = !!p?.rich;
      return {
        id: i.id, kind: i.kind as ItemKind, refId: i.refId, title: i.title, position: i.position,
        body: hidden || rich ? null : p?.body ?? null, rich, url: hidden ? null : i.url, href: hidden ? null : href, meta, missing,
        done: done.has(key), doneCount: canManage ? counts.get(key) ?? 0 : undefined,
      };
    });
    return {
      id: m.id, title: m.title, summary: m.summary, position: m.position, published: m.published,
      releaseAt: m.releaseAt, requireQuizId: m.requireQuizId, requireScore: m.requireScore,
      requireQuizTitle: m.requireQuizId ? quiz.get(m.requireQuizId)?.title ?? null : null,
      locked: lock.locked, lockReason: lock.locked ? lock.reason : null,
      items: list, doneItems: list.filter((x) => x.done).length,
    };
  });
  const next = canManage ? null : nextItem(shaped);

  // What a teacher can add (pickers).
  const choices = canManage ? await Promise.all([
    prisma.material.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, type: true } }),
    prisma.quiz.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, status: true } }),
    prisma.assignment.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true } }),
    prisma.calendarEvent.findMany({ where: { courseId, endAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { startAt: 'asc' }, take: 100, select: { id: true, title: true, startAt: true } }),
  ]).then(([m, q, a, e]) => ({ FILE: m, QUIZ: q, ASSIGNMENT: a, LIVE: e })) : null;

  return { canManage, students, modules: shaped, next: next ? { moduleId: next.module.id, itemId: next.item.id } : null, choices };
}

/** GET /api/courses/:id/modules/:itemId — one page (rich pages aren't in the list), if the viewer may open it. */
export async function pageView(courseId: string, user: SessionUser, access: Access, itemId: string) {
  const item = await prisma.moduleItem.findFirst({
    where: { id: itemId, kind: 'PAGE', module: { courseId, ...(access.canManage ? {} : { published: true }) } },
    select: { id: true, title: true, body: true, module: { select: { published: true, releaseAt: true, requireQuizId: true, requireScore: true } } },
  });
  if (!item) throw new ModuleError('That page isn’t there any more.', 404);
  if (!access.canManage) {
    const m = item.module;
    let best: number | null = null;
    if (m.requireQuizId) {
      const subs = await prisma.quizSubmission.findMany({ where: { studentId: user.id, quizId: m.requireQuizId }, select: { score: true, maxScore: true }, take: 50 });
      for (const q of subs) { const pc = percent(q.score, q.maxScore); if (pc != null) best = Math.max(best ?? 0, pc); }
    }
    const lock = lockFor({ ...m, requireQuizTitle: null }, new Date(), best);
    if (lock.locked) throw new ModuleError(`This module is locked. ${lock.reason}.`, 403);
  }
  return { id: item.id, title: item.title, body: item.body };
}

/** A page's text from the teacher: a rich page checked, plain text trimmed. */
function pageBody(raw: unknown) {
  try { return cleanPageBody(raw); } catch (e) {
    if (e instanceof LessonPageError) throw new ModuleError(e.message);
    throw e;
  }
}

/** The refId belongs to this course for that kind; returns its title. */
async function refTitle(courseId: string, kind: ItemKind, refId: string): Promise<string | null> {
  const where = { id: refId, courseId };
  const row = kind === 'FILE' ? await prisma.material.findFirst({ where, select: { title: true } })
    : kind === 'QUIZ' ? await prisma.quiz.findFirst({ where, select: { title: true } })
    : kind === 'ASSIGNMENT' ? await prisma.assignment.findFirst({ where, select: { title: true } })
    : kind === 'LIVE' ? await prisma.calendarEvent.findFirst({ where, select: { title: true } })
    : null;
  return row?.title ?? null;
}

function moduleFields(b: Body) {
  const releaseAt = str(b.releaseAt);
  const score = Number(b.requireScore);
  const requireQuizId = str(b.requireQuizId) || null;
  return {
    title: text(b.title).trim().slice(0, 140),
    summary: text(b.summary).trim().slice(0, 600) || null,
    published: b.published !== false,
    releaseAt: releaseAt && !Number.isNaN(Date.parse(releaseAt)) ? new Date(releaseAt) : null,
    requireQuizId,
    requireScore: requireQuizId && Number.isFinite(score) ? Math.min(100, Math.max(1, Math.round(score))) : null,
  };
}

/** Tells the course's students (and teacher) to reload their Modules tab (and a page that changed). */
async function refresh(courseId: string, teacherId: string, extra: string[] = []) {
  const enrolled = await prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true }, take: 1000 });
  publish([teacherId, ...enrolled.map((e) => e.studentId)], { type: 'refresh', keys: [`/api/courses/${courseId}/modules`, ...extra] });
}

const ACTIONS = ['create-module', 'update-module', 'delete-module', 'move-module', 'add-item', 'update-item', 'delete-item', 'move-item', 'done'] as const;

/** One change to a course's modules. Teachers build them; students mark items done. */
export async function changeModules(courseId: string, user: SessionUser, access: Access, b: Body) {
  if (!oneOf(ACTIONS, b.action)) throw new ModuleError('Unknown action.');
  const action = b.action;

  if (action === 'done') {
    const item = await prisma.moduleItem.findFirst({ where: { id: text(b.itemId), module: { courseId, ...(access.canManage ? {} : { published: true }) } }, select: { id: true, kind: true } });
    if (!item) throw new ModuleError('Item not found.', 404);
    if (item.kind === 'QUIZ' || item.kind === 'ASSIGNMENT') throw new ModuleError('This counts as done once you hand it in.');
    if (b.done === false) await prisma.itemProgress.deleteMany({ where: { itemId: item.id, userId: user.id } });
    else await prisma.itemProgress.upsert({ where: { itemId_userId: { itemId: item.id, userId: user.id } }, update: {}, create: { itemId: item.id, userId: user.id } });
    return { ok: true };
  }

  if (!access.canManage) throw new ModuleError('Only the course teacher can change modules.', 403);
  const mod = async (id: unknown) => {
    const m = await prisma.courseModule.findFirst({ where: { id: text(id), courseId } });
    if (!m) throw new ModuleError('Module not found.', 404);
    return m;
  };
  const itemOf = async (id: unknown) => {
    const i = await prisma.moduleItem.findFirst({ where: { id: text(id), module: { courseId } } });
    if (!i) throw new ModuleError('Item not found.', 404);
    return i;
  };
  let result: unknown = { ok: true };
  const changed: string[] = [];

  switch (action) {
    case 'create-module': {
      const f = moduleFields(b);
      if (!f.title) throw new ModuleError('Give the module a title.');
      if (f.requireQuizId && !(await refTitle(courseId, 'QUIZ', f.requireQuizId))) throw new ModuleError('That quiz isn’t in this course.');
      const last = await prisma.courseModule.findFirst({ where: { courseId }, orderBy: { position: 'desc' }, select: { position: true } });
      result = await prisma.courseModule.create({ data: { ...f, courseId, position: (last?.position ?? -1) + 1 } });
      break;
    }
    case 'update-module': {
      const m = await mod(b.moduleId);
      const f = moduleFields({ title: m.title, summary: m.summary, published: m.published, releaseAt: m.releaseAt?.toISOString(), requireQuizId: m.requireQuizId, requireScore: m.requireScore, ...b });
      if (!f.title) throw new ModuleError('Give the module a title.');
      if (f.requireQuizId && !(await refTitle(courseId, 'QUIZ', f.requireQuizId))) throw new ModuleError('That quiz isn’t in this course.');
      result = await prisma.courseModule.update({ where: { id: m.id }, data: f });
      break;
    }
    case 'delete-module': {
      const m = await mod(b.moduleId);
      await prisma.courseModule.delete({ where: { id: m.id } });
      break;
    }
    case 'move-module': {
      const m = await mod(b.moduleId);
      const dir = b.dir === -1 ? -1 : 1;
      const other = await prisma.courseModule.findFirst({ where: { courseId, position: dir < 0 ? { lt: m.position } : { gt: m.position } }, orderBy: { position: dir < 0 ? 'desc' : 'asc' } });
      if (other) await prisma.$transaction([
        prisma.courseModule.update({ where: { id: m.id }, data: { position: other.position } }),
        prisma.courseModule.update({ where: { id: other.id }, data: { position: m.position } }),
      ]);
      break;
    }
    case 'add-item': {
      const m = await mod(b.moduleId);
      if (!oneOf(ITEM_KINDS, b.kind)) throw new ModuleError('Pick what to add.');
      const kind = b.kind;
      let title = text(b.title).trim().slice(0, 200);
      const data: { refId?: string; url?: string; body?: string } = {};
      if (REF_KINDS.includes(kind)) {
        const refId = text(b.refId);
        const found = refId ? await refTitle(courseId, kind, refId) : null;
        if (!found) throw new ModuleError('Pick one from this course.');
        data.refId = refId;
        title ||= found;
      } else if (kind === 'PAGE') {
        // The text can come later, in the page editor.
        if (!title) throw new ModuleError('Give the page a title.');
        const body = pageBody(b.body);
        if (body) data.body = body;
      } else {
        const url = text(b.url).trim().slice(0, 1000);
        if (!isHttp(url)) throw new ModuleError('Paste a full link (https://…).');
        data.url = url;
        title ||= new URL(url).hostname.replace(/^www\./, '');
      }
      const last = await prisma.moduleItem.findFirst({ where: { moduleId: m.id }, orderBy: { position: 'desc' }, select: { position: true } });
      result = await prisma.moduleItem.create({ data: { moduleId: m.id, kind, title, ...data, position: (last?.position ?? -1) + 1 } });
      break;
    }
    case 'update-item': {
      const i = await itemOf(b.itemId);
      const title = b.title === undefined ? i.title : text(b.title).trim().slice(0, 200);
      if (!title) throw new ModuleError('An item needs a title.');
      const data: { title: string; body?: string; url?: string } = { title };
      if (i.kind === 'PAGE' && b.body !== undefined) { data.body = pageBody(b.body); changed.push(`/api/courses/${courseId}/modules/${i.id}`); }
      if ((i.kind === 'LINK' || i.kind === 'VIDEO') && b.url !== undefined) { data.url = text(b.url).trim(); if (!isHttp(data.url)) throw new ModuleError('Paste a full link (https://…).'); }
      result = await prisma.moduleItem.update({ where: { id: i.id }, data });
      break;
    }
    case 'delete-item': {
      const i = await itemOf(b.itemId);
      await prisma.moduleItem.delete({ where: { id: i.id } });
      break;
    }
    case 'move-item': {
      const i = await itemOf(b.itemId);
      const dir = b.dir === -1 ? -1 : 1;
      const other = await prisma.moduleItem.findFirst({ where: { moduleId: i.moduleId, position: dir < 0 ? { lt: i.position } : { gt: i.position } }, orderBy: { position: dir < 0 ? 'desc' : 'asc' } });
      if (other) await prisma.$transaction([
        prisma.moduleItem.update({ where: { id: i.id }, data: { position: other.position } }),
        prisma.moduleItem.update({ where: { id: other.id }, data: { position: i.position } }),
      ]);
      break;
    }
  }
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  await refresh(courseId, course?.teacherId ?? user.id, changed);
  return result;
}
