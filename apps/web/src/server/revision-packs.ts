import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { MATH_RULE } from '@/lib/tutor-rules';
import { cleanPack, joinSources, outlinePack, type RevisionPack } from '@/lib/revision-pack';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, strings, type Body } from './body';
import { ghidraJson } from './ghidra/brain';
import { spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { notifyMany } from './email';

// M294: revision packs. A course's teacher picks materials (their text, as the AI tutor reads them:
// course_sources) and the class recaps, and ONE AI request turns them into a pack: topics with a
// summary, key points and terms, practice questions with answers, a checklist. When AI isn't
// available (allowance, the switch) the pack is a plain outline from the modules. The teacher checks
// it and publishes it; students see published packs only.

const MAX_PACKS = 30, MAX_SOURCES = 20;
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const read = (s: string): RevisionPack => { try { return cleanPack(JSON.parse(s)); } catch { return cleanPack(null); } };
const titles = (s: string) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };

export const SYSTEM = `You make a revision pack for students before an exam, ONLY from the course material given (never add topics it doesn't cover).
Give a short overview (2–3 sentences), then 3–10 topics in teaching order. Each topic: a title, a summary in plain words (3–5 sentences), 3–6 key points a student must remember, and up to 6 key terms with their meaning.
Then 8–20 practice questions across the topics, exam style, each with a model answer (2–5 sentences) and the topic it tests. Then a checklist of 5–12 "I can…" lines.
Use the language of the material. ${MATH_RULE}`;

export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: { type: 'STRING' },
    topics: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } }, terms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, meaning: { type: 'STRING' } }, required: ['term', 'meaning'] } } }, required: ['title', 'summary', 'points'] } },
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { q: { type: 'STRING' }, a: { type: 'STRING' }, topic: { type: 'STRING' } }, required: ['q', 'a'] } },
    checklist: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['overview', 'topics', 'questions', 'checklist'],
};

async function accessOf(u: SessionUser, courseId: string) {
  const a = await courseAccess(courseId, u);
  if (!a) throw new NotFoundException('Course not found.');
  return a;
}

/** GET /revision-packs?courseId=: the packs (teachers: all, with the materials to choose from; students: published). */
export async function listPacks(u: SessionUser, courseId: string) {
  const a = await accessOf(u, courseId);
  const [packs, sources] = await Promise.all([
    prisma.revisionPack.findMany({ where: { courseId, ...(a.canManage ? {} : { published: true }) }, orderBy: { createdAt: 'desc' }, take: MAX_PACKS }),
    a.canManage ? prisma.courseSource.findMany({ where: { courseId, status: 'READY' }, select: { id: true, title: true, kind: true, chars: true }, orderBy: { createdAt: 'desc' }, take: 100 }) : Promise.resolve([]),
  ]);
  return {
    canEdit: a.canManage,
    sources,
    packs: packs.map((p) => ({ id: p.id, title: p.title, pack: read(p.content), sources: titles(p.sources), usedAi: p.usedAi, published: p.published, createdAt: p.createdAt })),
  };
}

/** POST /revision-packs { courseId, title, sourceIds, recaps } (one AI request; the outline without it). */
export async function makePack(u: SessionUser, b: Body) {
  const courseId = clip(b.courseId, 40);
  const a = await accessOf(u, courseId);
  if (!a.canManage) throw new ForbiddenException('Only the course’s teachers can make revision packs.');
  const title = clip(b.title, 120) || `${a.course.code} revision`;
  if ((await prisma.revisionPack.count({ where: { courseId } })) >= MAX_PACKS) throw new BadRequestException(`A course keeps ${MAX_PACKS} revision packs: remove an old one.`);
  const ids = [...new Set(strings(b.sourceIds))].slice(0, MAX_SOURCES);
  const [sources, recaps] = await Promise.all([
    ids.length ? prisma.courseSource.findMany({ where: { courseId, id: { in: ids }, status: 'READY' }, select: { title: true, text: true } }) : Promise.resolve([]),
    b.recaps === true ? prisma.classSession.findMany({ where: { courseId, recap: { not: null } }, select: { recap: true, startedAt: true }, orderBy: { startedAt: 'desc' }, take: 10 }) : Promise.resolve([]),
  ]);
  const all = [...sources, ...recaps.map((r) => ({ title: `Class of ${r.startedAt.toISOString().slice(0, 10)}`, text: r.recap ?? '' }))].filter((x) => x.text.trim());

  let pack: RevisionPack | null = null;
  let usedAi = false;
  if (all.length) {
    const spend = await spendAi(u);
    if (spend.ok) {
      await logAiUse(u.id, { kind: 'revision', detail: title, courseId });
      pack = cleanPack(await ghidraJson<unknown>('revision', SYSTEM, `Course: ${a.course.code} — ${a.course.name}\n\n${joinSources(all)}`, SCHEMA, 6000));
      usedAi = pack.topics.length > 0;
    }
  }
  if (!pack?.topics.length) {
    const modules = await prisma.courseModule.findMany({ where: { courseId }, orderBy: { position: 'asc' }, take: 12, select: { title: true, summary: true, items: { select: { title: true }, orderBy: { position: 'asc' }, take: 8 } } });
    pack = outlinePack(modules.map((m) => ({ title: m.title, summary: m.summary, items: m.items.map((i) => i.title) })));
    usedAi = false;
    if (!pack.topics.length) throw new BadRequestException('Pick some materials with text, or add modules to the course first.');
  }
  const created = await prisma.revisionPack.create({ data: { courseId, title, content: JSON.stringify(pack), sources: JSON.stringify(all.map((x) => x.title).slice(0, 30)), usedAi, createdById: u.id }, select: { id: true } });
  return { id: created.id, usedAi };
}

async function packFor(u: SessionUser, id: string) {
  const p = await prisma.revisionPack.findUnique({ where: { id }, select: { id: true, courseId: true, title: true, published: true } });
  if (!p) throw new NotFoundException('That pack isn’t there any more.');
  const a = await accessOf(u, p.courseId);
  if (!a.canManage) throw new ForbiddenException('Only the course’s teachers can change its packs.');
  return { ...p, course: a.course };
}

/** PATCH /revision-packs/:id { title?, pack?, published? }: the teacher's edits; publishing tells the students. */
export async function updatePack(u: SessionUser, id: string, b: Body) {
  const p = await packFor(u, id);
  const data: { title?: string; content?: string; published?: boolean } = {};
  if (b.title !== undefined) data.title = clip(b.title, 120) || p.title;
  if (b.pack !== undefined) data.content = JSON.stringify(cleanPack(b.pack));
  if (typeof b.published === 'boolean') data.published = b.published;
  await prisma.revisionPack.update({ where: { id }, data });
  if (data.published && !p.published) {
    const students = await prisma.enrollment.findMany({ where: { courseId: p.courseId }, select: { studentId: true }, take: 1000 });
    await notifyMany(students.map((s) => s.studentId), { title: `New revision pack in ${p.course.code}`, body: data.title ?? p.title, link: `/student/blackboard?course=${p.courseId}&tab=revision`, type: 'info', courseId: p.courseId, email: false });
  }
  return { ok: true };
}

/** DELETE /revision-packs/:id */
export async function removePack(u: SessionUser, id: string) {
  await packFor(u, id);
  await prisma.revisionPack.delete({ where: { id } });
  return { ok: true };
}
