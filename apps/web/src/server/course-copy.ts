import { createHash } from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from './http';

// Copy a course to a new term (Stage 5 · B2): its modules and their items, materials, quizzes and
// their questions, assignments with their rubrics, gradebook categories, the question bank, the
// Learning DNA concepts and tags, and oral checks. Never students, submissions, grades, attendance,
// announcements or chats. Quizzes come over as drafts; dates are cleared, or moved by whole weeks.
//
// Workers Free allows 50 database queries per request, so the browser copies in steps: POST
// /api/courses/<id>/copy makes the new course, then POST …/copy/step runs each stage until it says
// done. Every copied row's id is made from the new course's id and the original row's id
// (copiedId), so a step can point at rows another step copies, a step tried twice skips what's
// already there, and nothing has to be remembered between steps.

export const COPY_STAGES = ['concepts', 'modules', 'materials', 'quizzes', 'questions', 'assignments', 'categories', 'assessments', 'bank', 'items', 'tags', 'orals'] as const;
export type CopyStage = (typeof COPY_STAGES)[number];

/** Rows read per step (also the most ids in one IN list: D1 allows 100 bound values). */
const BATCH = 90;
/** Concepts are copied in one step (parents before children); a course has far fewer. */
const MAX_CONCEPTS = 300;

/** The copy's id for a row of the original: like a cuid, the same every time for the same pair. */
export function copiedId(targetCourseId: string, originalId: string): string {
  const hash = createHash('sha256').update(`${targetCourseId}:${originalId}`).digest();
  let out = 'c';
  for (let i = 0; out.length < 25; i++) out += (hash[i] % 36).toString(36);
  return out;
}

/** A concept tag's reference in the copy: questions by their new id, rubric rows as "<new assignment>:<criterion>". */
export function copiedRef(target: string, kind: string, refId: string): string {
  if (kind === 'CRITERION') {
    const at = refId.indexOf(':');
    return at > 0 ? `${copiedId(target, refId.slice(0, at))}${refId.slice(at)}` : refId;
  }
  return copiedId(target, refId);
}

/** Parents before children, so each concept's parent is already there when it's added. */
export function parentsFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const ids = new Set(rows.map((r) => r.id));
  const out: T[] = [];
  const done = new Set<string>();
  let left = rows;
  while (left.length) {
    const ready = left.filter((r) => !r.parentId || !ids.has(r.parentId) || done.has(r.parentId));
    // A loop (shouldn't happen): add the rest as they are rather than never finishing.
    const next = ready.length ? ready : left;
    for (const r of next) { out.push(r); done.add(r.id); }
    left = left.filter((r) => !done.has(r.id));
  }
  return out;
}

const DAY = 86_400_000;
const shifted = (d: Date | null, shiftDays: number | null) => (d && shiftDays !== null ? new Date(d.getTime() + shiftDays * DAY) : null);

async function managed(courseId: string, user: SessionUser) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, name: true, description: true, skills: true, credits: true, department: true, color: true, emoji: true, teacherId: true } });
  if (!course) throw new NotFoundException('That course isn’t there any more.');
  if (user.role !== 'ADMIN' && course.teacherId !== user.id) throw new ForbiddenException('Only the course’s teacher or an admin can copy it.');
  return course;
}

/** POST /api/courses/:id/copy { code, name }: the new course (a draft, same teacher), empty for now. */
export async function startCourseCopy(sourceId: string, user: SessionUser, body: Record<string, unknown>) {
  const source = await managed(sourceId, user);
  const code = typeof body.code === 'string' ? body.code.trim().slice(0, 40) : '';
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : source.name;
  if (!code) throw new BadRequestException('Give the new course a code (for example CS101-2027).');
  if (code === source.code || (await prisma.course.findUnique({ where: { code }, select: { id: true } }))) throw new ConflictException('A course with this code already exists. Choose another code.');
  const course = await prisma.course.create({
    data: { code, name, description: source.description, skills: source.skills, credits: source.credits, department: source.department, color: source.color, emoji: source.emoji, teacherId: source.teacherId, status: 'DRAFT' },
    select: { id: true, code: true, name: true },
  });
  return { course, stages: COPY_STAGES };
}

/** Adds the rows not copied yet, a few per statement (D1 allows 100 bound values per query). */
async function put<T extends { id: string }>(rows: T[], columns: number, existing: (ids: string[]) => Promise<{ id: string }[]>, create: (data: T[]) => Promise<unknown>) {
  if (!rows.length) return 0;
  const have = new Set((await existing(rows.map((r) => r.id))).map((r) => r.id));
  const todo = rows.filter((r) => !have.has(r.id));
  const per = Math.max(1, Math.floor(100 / columns));
  for (let i = 0; i < todo.length; i += per) await create(todo.slice(i, i + per));
  return todo.length;
}

/**
 * Scalar columns per table (each written on every row by createMany). Checked against the schema
 * in course-copy.test.ts, so a new column can't push a statement over D1's limit unnoticed.
 */
export const COLUMNS = { CourseConcept: 7, CourseModule: 11, Material: 8, Quiz: 13, QuizQuestion: 10, Assignment: 23, GradeCategory: 7, GradeAssessment: 4, BankQuestion: 12, ModuleItem: 9, ConceptTag: 5, OralCheck: 13 } as const;

/**
 * POST /api/courses/:id/copy/step { target, stage, after?, shiftDays? }: copies up to BATCH rows of
 * one stage from course :id into `target` (a course the same person runs). Returns where to carry
 * on (`after`), or null when the stage is done.
 */
export async function courseCopyStep(sourceId: string, user: SessionUser, body: Record<string, unknown>) {
  const [source, target] = await Promise.all([managed(sourceId, user), managed(typeof body.target === 'string' ? body.target : '', user)]);
  if (source.id === target.id) throw new BadRequestException('A course can’t be copied into itself.');
  const stage = COPY_STAGES.find((s) => s === body.stage);
  if (!stage) throw new BadRequestException('Unknown step.');
  const after = typeof body.after === 'string' && body.after ? body.after.slice(0, 40) : undefined;
  const shiftDays = typeof body.shiftDays === 'number' && Number.isInteger(body.shiftDays) && Math.abs(body.shiftDays) <= 3650 ? body.shiftDays : null;
  const t = target.id;
  const id = (original: string) => copiedId(t, original);
  const page = { ...(after ? { id: { gt: after } } : {}) };
  const take = BATCH;
  const next = (rows: { id: string }[]) => (rows.length === take ? rows[rows.length - 1].id : null);

  switch (stage) {
    case 'concepts': {
      const rows = await prisma.courseConcept.findMany({ where: { courseId: source.id }, orderBy: { id: 'asc' }, take: MAX_CONCEPTS });
      const copied = await put(
        parentsFirst(rows).map((c) => ({ id: id(c.id), courseId: t, name: c.name, description: c.description, parentId: c.parentId ? id(c.parentId) : null, position: c.position })),
        COLUMNS.CourseConcept,
        // Up to 300 ids: what the new course already has, rather than one long IN list.
        () => prisma.courseConcept.findMany({ where: { courseId: t }, select: { id: true } }),
        (data) => prisma.courseConcept.createMany({ data }),
      );
      return { stage, copied, after: null };
    }
    case 'modules': {
      const rows = await prisma.courseModule.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((m) => ({ id: id(m.id), courseId: t, title: m.title, summary: m.summary, position: m.position, published: m.published, releaseAt: shifted(m.releaseAt, shiftDays), requireQuizId: m.requireQuizId ? id(m.requireQuizId) : null, requireScore: m.requireScore })),
        COLUMNS.CourseModule, (ids) => prisma.courseModule.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.courseModule.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'materials': {
      const rows = await prisma.material.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      // The same files: deleting a material never deletes its file, so both courses keep working.
      const copied = await put(
        rows.map((m) => ({ id: id(m.id), courseId: t, title: m.title, type: m.type, fileUrl: m.fileUrl, size: m.size, uploadedById: m.uploadedById })),
        COLUMNS.Material, (ids) => prisma.material.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.material.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'quizzes': {
      const rows = await prisma.quiz.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((q) => ({ id: id(q.id), courseId: t, title: q.title, description: q.description, dueDate: shifted(q.dueDate, shiftDays), timeLimit: q.timeLimit, status: 'DRAFT' as const, shuffle: q.shuffle, examMode: q.examMode, plainWords: q.plainWords, pools: q.pools })),
        COLUMNS.Quiz, (ids) => prisma.quiz.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.quiz.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'questions': {
      const rows = await prisma.quizQuestion.findMany({ where: { quiz: { courseId: source.id }, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((q) => ({ id: id(q.id), quizId: id(q.quizId), question: q.question, options: q.options ?? [], correctAnswer: q.correctAnswer, points: q.points, order: q.order, type: q.type, meta: q.meta, pool: q.pool })),
        COLUMNS.QuizQuestion, (ids) => prisma.quizQuestion.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.quizQuestion.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'assignments': {
      const rows = await prisma.assignment.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((a) => ({ id: id(a.id), courseId: t, createdById: user.id, title: a.title, instructions: a.instructions, rubric: a.rubric ?? [], maxScore: a.maxScore, weight: a.weight, dueDate: shifted(a.dueDate, shiftDays), status: 'OPEN', aiPolicy: a.aiPolicy, latePenalty: a.latePenalty, lateGraceMinutes: a.lateGraceMinutes, latePenaltyMax: a.latePenaltyMax, maxAttempts: a.maxAttempts, submitKind: a.submitKind, groupMode: a.groupMode, peerReviews: a.peerReviews, peerDueDate: shifted(a.peerDueDate, shiftDays), postPolicy: a.postPolicy, rubricHelp: a.rubricHelp })),
        COLUMNS.Assignment, (ids) => prisma.assignment.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.assignment.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'categories': {
      const rows = await prisma.gradeCategory.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((c) => ({ id: id(c.id), courseId: t, name: c.name, weight: c.weight, dropLowest: c.dropLowest, position: c.position })),
        COLUMNS.GradeCategory, (ids) => prisma.gradeCategory.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.gradeCategory.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'assessments': {
      const rows = await prisma.gradeAssessment.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((a) => ({ id: id(a.id), courseId: t, name: a.name, categoryId: id(a.categoryId) })),
        COLUMNS.GradeAssessment, (ids) => prisma.gradeAssessment.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.gradeAssessment.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'bank': {
      const rows = await prisma.bankQuestion.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((q) => ({ id: id(q.id), courseId: t, question: q.question, options: q.options ?? [], correctAnswer: q.correctAnswer, points: q.points, tags: q.tags, difficulty: q.difficulty, createdById: q.createdById, type: q.type, meta: q.meta })),
        COLUMNS.BankQuestion, (ids) => prisma.bankQuestion.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.bankQuestion.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'items': {
      const rows = await prisma.moduleItem.findMany({ where: { module: { courseId: source.id }, ...page }, orderBy: { id: 'asc' }, take });
      // Files, quizzes and assignments point at their copies; a live class (a dated event) is left for the teacher to choose again.
      const ref = (kind: string, refId: string | null) => (refId && (kind === 'FILE' || kind === 'QUIZ' || kind === 'ASSIGNMENT') ? id(refId) : null);
      const copied = await put(
        rows.map((i) => ({ id: id(i.id), moduleId: id(i.moduleId), kind: i.kind, refId: ref(i.kind, i.refId), title: i.title, body: i.body, url: i.url, position: i.position })),
        COLUMNS.ModuleItem, (ids) => prisma.moduleItem.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.moduleItem.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'tags': {
      const rows = await prisma.conceptTag.findMany({ where: { concept: { courseId: source.id }, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((x) => ({ id: id(x.id), conceptId: id(x.conceptId), kind: x.kind, refId: copiedRef(t, x.kind, x.refId) })),
        COLUMNS.ConceptTag, (ids) => prisma.conceptTag.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.conceptTag.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
    case 'orals': {
      const rows = await prisma.oralCheck.findMany({ where: { courseId: source.id, ...page }, orderBy: { id: 'asc' }, take });
      const copied = await put(
        rows.map((o) => ({ id: id(o.id), courseId: t, teacherId: target.teacherId, title: o.title, kind: o.kind, topic: o.topic, questions: o.questions, lang: o.lang, rubric: o.rubric, minutes: o.minutes, dueAt: shifted(o.dueAt, shiftDays), status: 'OPEN' })),
        COLUMNS.OralCheck, (ids) => prisma.oralCheck.findMany({ where: { id: { in: ids } }, select: { id: true } }), (data) => prisma.oralCheck.createMany({ data }),
      );
      return { stage, copied, after: next(rows) };
    }
  }
}
