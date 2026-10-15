import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { courseAccess } from '@/lib/course-access';
import type { SessionUser } from '@/lib/server-auth';
import { IMPORT_BATCH, importCost } from '@/lib/cc-import';
import { LessonPageError, cleanPageBody } from '@/lib/lesson-page';
import { materialTypeOf } from '@/lib/file-urls';
import { isAppFileUrl } from '@/lib/storage';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { pageTexts } from './course-modules';

// Common Cartridge export and import for a course (Stage 5 · B2; the cartridge itself is made and read
// in the browser: src/lib/cc-export.ts, src/lib/cc-import.ts). Export: everything the modules hold,
// in one read (rich pages are loaded one by one, GET /api/courses/:id/modules/:itemId). Import: a few
// items at a time into a module that stays hidden from students until the teacher shows it.

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const inChunks = async <T,>(ids: string[], run: (part: string[]) => Promise<T[]>) => (await Promise.all(chunks([...new Set(ids)], 90).map(run))).flat();
const newId = () => `c${[...randomBytes(18)].map((x) => (x % 36).toString(36)).join('').slice(0, 24)}`;
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const isHttp = (v: string) => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };

async function teacherOf(courseId: string, user: SessionUser) {
  const a = await courseAccess(courseId, user);
  if (!a) throw new NotFoundException('Course not found.');
  if (!a.canManage) throw new ForbiddenException('Only the course’s teacher can import or export it.');
  return a.course;
}

/** GET /api/courses/:id/cartridge — the course's modules with what each item points to, for export. */
export async function cartridgeData(courseId: string, user: SessionUser) {
  await teacherOf(courseId, user);
  const [course, modules] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { code: true, name: true, description: true } }),
    prisma.courseModule.findMany({ where: { courseId }, orderBy: { position: 'asc' }, take: 200, select: { title: true, summary: true, items: { orderBy: { position: 'asc' }, select: { id: true, kind: true, refId: true, title: true, url: true } } } }),
  ]);
  const items = modules.flatMap((m) => m.items);
  const refs = (kind: string) => items.filter((i) => i.kind === kind && i.refId).map((i) => i.refId!);
  const [pages, materials, quizzes, assignments] = await Promise.all([
    pageTexts(items.filter((i) => i.kind === 'PAGE').map((i) => i.id)),
    inChunks(refs('FILE'), (part) => prisma.material.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, fileUrl: true } })),
    inChunks(refs('QUIZ'), (part) => prisma.quiz.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, description: true, questions: { orderBy: { order: 'asc' }, take: 300, select: { question: true, options: true, correctAnswer: true, points: true } } } })),
    inChunks(refs('ASSIGNMENT'), (part) => prisma.assignment.findMany({ where: { courseId, id: { in: part } }, select: { id: true, title: true, instructions: true, maxScore: true, dueDate: true } })),
  ]);
  const by = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const [page, mat, quiz, asg] = [by(pages), by(materials), by(quizzes), by(assignments)];
  return {
    course: { code: course?.code ?? '', name: course?.name ?? '', description: course?.description ?? null },
    modules: modules.map((m) => ({
      title: m.title, summary: m.summary,
      items: m.items.map((i) => {
        const base = { id: i.id, kind: i.kind, title: i.title };
        switch (i.kind) {
          case 'PAGE': { const p = page.get(i.id); return { ...base, body: p?.body ?? null, rich: !!p?.rich }; }
          case 'LINK': case 'VIDEO': return { ...base, url: i.url };
          case 'FILE': { const f = i.refId ? mat.get(i.refId) : undefined; return { ...base, file: f ? { title: f.title, url: f.fileUrl } : null }; }
          case 'QUIZ': {
            const q = i.refId ? quiz.get(i.refId) : undefined;
            return { ...base, quiz: q ? { title: q.title, description: q.description, questions: q.questions.map((x) => ({ question: x.question, options: Array.isArray(x.options) ? (x.options as unknown[]).map(String) : [], correct: x.correctAnswer, points: x.points })) } : null };
          }
          case 'ASSIGNMENT': { const a = i.refId ? asg.get(i.refId) : undefined; return { ...base, assignment: a ? { title: a.title, instructions: a.instructions, maxScore: a.maxScore, dueDate: a.dueDate } : null }; }
          default: return base;
        }
      }),
    })),
  };
}

interface Question { question: string; options: string[]; correct: string; points: number }
function cleanQuestions(raw: unknown, label: string): Question[] {
  const list = Array.isArray(raw) ? raw.slice(0, IMPORT_BATCH.questions) : [];
  const out = list.flatMap((q) => {
    const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
    const question = typeof o.question === 'string' ? o.question.trim().slice(0, 2000) : '';
    const options = Array.isArray(o.options) ? o.options.slice(0, 10).map((x) => cut(x, 300)) : [];
    const correct = cut(o.correct, 300);
    const points = Number(o.points);
    if (!question || options.length < 2 || options.some((x) => !x) || new Set(options).size !== options.length || !options.includes(correct)) return [];
    return [{ question, options, correct, points: points > 0 && points <= 1000 ? points : 1 }];
  });
  if (!out.length) throw new BadRequestException(`“${label}” has no questions that can be added.`);
  return out;
}

/**
 * POST /api/courses/:id/import { moduleId?, title?, summary?, items } — adds imported items to a
 * module (made, hidden from students, when there's no moduleId): pages (the editor's JSON or text),
 * links and videos, files already uploaded here (they become course materials), and quizzes (drafts).
 * A request carries what fits (src/lib/cc-import.ts importBatches).
 */
export async function importItems(courseId: string, user: SessionUser, b: Record<string, unknown>) {
  await teacherOf(courseId, user);
  const raw = Array.isArray(b.items) ? b.items : [];
  if (!raw.length) throw new BadRequestException('Nothing to add.');
  if (raw.length > IMPORT_BATCH.items) throw new BadRequestException(`Send up to ${IMPORT_BATCH.items} items at a time.`);

  type Row = { id: string; kind: string; title: string; refId: string | null; body: string | null; url: string | null };
  const rows: Row[] = [];
  const materials: { id: string; title: string; fileUrl: string; type: ReturnType<typeof materialTypeOf>; size: string | null }[] = [];
  const quizzes: { id: string; title: string; description: string | null; questions: Question[] }[] = [];
  let cost = 0;
  for (const x of raw) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const title = cut(o.title, 200);
    if (!title) throw new BadRequestException('Every item needs a title.');
    const id = newId();
    switch (o.kind) {
      case 'PAGE': {
        let body: string;
        try { body = cleanPageBody(o.body); } catch (e) {
          if (e instanceof LessonPageError) throw new BadRequestException(`“${title}”: ${e.message}`);
          throw e;
        }
        rows.push({ id, kind: 'PAGE', title, refId: null, body: body || null, url: null });
        break;
      }
      case 'LINK': case 'VIDEO': {
        const url = typeof o.url === 'string' ? o.url.trim().slice(0, 1000) : '';
        if (!isHttp(url)) throw new BadRequestException(`“${title}” isn’t a web address.`);
        rows.push({ id, kind: o.kind, title, refId: null, body: null, url });
        break;
      }
      case 'FILE': {
        const url = typeof o.url === 'string' ? o.url : '';
        if (!isAppFileUrl(url)) throw new BadRequestException(`“${title}” wasn’t uploaded here.`);
        const m = { id: newId(), title, fileUrl: url, type: materialTypeOf(cut(o.fileName, 200), url), size: cut(o.size, 20) || null };
        materials.push(m);
        rows.push({ id, kind: 'FILE', title, refId: m.id, body: null, url: null });
        cost += 1;
        break;
      }
      case 'QUIZ': {
        const q = { id: newId(), title, description: cut(o.description, 2000) || null, questions: cleanQuestions(o.questions, title) };
        quizzes.push(q);
        rows.push({ id, kind: 'QUIZ', title, refId: q.id, body: null, url: null });
        cost += importCost({ kind: 'QUIZ', title, description: null, questions: q.questions });
        break;
      }
      default:
        throw new BadRequestException('Pages, links, videos, files and quizzes can be imported.');
    }
  }
  if (cost > IMPORT_BATCH.cost) throw new BadRequestException('Send fewer files and quizzes at a time.');

  // The module: the one asked for (in this course), or a new one after the others, hidden.
  let moduleId = typeof b.moduleId === 'string' ? b.moduleId : '';
  if (moduleId) {
    if (!(await prisma.courseModule.findFirst({ where: { id: moduleId, courseId }, select: { id: true } }))) throw new NotFoundException('That module isn’t there any more.');
  } else {
    const title = cut(b.title, 140) || 'Imported';
    const last = await prisma.courseModule.findFirst({ where: { courseId }, orderBy: { position: 'desc' }, select: { position: true } });
    moduleId = (await prisma.courseModule.create({ data: { courseId, title, summary: cut(b.summary, 600) || null, position: (last?.position ?? -1) + 1, published: false }, select: { id: true } })).id;
  }
  const lastItem = await prisma.moduleItem.findFirst({ where: { moduleId }, orderBy: { position: 'desc' }, select: { position: true } });
  const start = (lastItem?.position ?? -1) + 1;

  // A few rows per statement (D1 takes 100 values a query): materials 7 columns, questions 7, items 8.
  for (const part of chunks(materials, 12)) await prisma.material.createMany({ data: part.map((m) => ({ ...m, courseId, uploadedById: user.id })) });
  for (const q of quizzes) {
    await prisma.quiz.create({ data: { id: q.id, courseId, title: q.title, description: q.description, status: 'DRAFT' } });
    for (const part of chunks(q.questions.map((x, i) => ({ quizId: q.id, question: x.question, options: x.options, correctAnswer: x.correct, points: x.points, order: i })), 12)) {
      await prisma.quizQuestion.createMany({ data: part });
    }
  }
  const data = rows.map((r, i) => ({ ...r, moduleId, position: start + i }));
  // Long pages one at a time, the rest together.
  const big = data.filter((r) => (r.body?.length ?? 0) > 50_000);
  for (const r of big) await prisma.moduleItem.create({ data: r });
  for (const part of chunks(data.filter((r) => !big.includes(r)), 11)) await prisma.moduleItem.createMany({ data: part });
  return { moduleId, added: rows.length };
}
