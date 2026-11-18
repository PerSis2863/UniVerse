import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { courseAccess } from '@/lib/course-access';
import { optionsOf, typeOf } from '@/lib/question-types';
import { buildVersions, cleanMarks, cleanRubric, MAX_ITEMS, paperScore, paperTotal, type PaperVersion, type SourceQuestion } from '@/lib/exam-paper';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { str, strings, text, type Body } from './body';

// M291: paper exams. A course's teachers build a printed exam from its question bank (and written
// questions typed here, each with a rubric), in up to four versions with a key each, then type every
// student's marks and send the totals to the gradebook. Students never see a paper or its key here:
// their grade reaches them through the gradebook like any other.

const MAX_PAPERS = 50;
const clip = (v: unknown, n: number) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const long = (v: unknown, n: number) => text(v).trim().slice(0, n);

async function teacherOf(u: SessionUser, courseId: string) {
  const access = await courseAccess(courseId, u);
  if (!access) throw new NotFoundException('Course not found.');
  if (!access.canManage) throw new ForbiddenException('Only the course’s teachers can make paper exams.');
}

const readVersions = (s: string): PaperVersion[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };

async function paperFor(u: SessionUser, id: string) {
  const p = await prisma.examPaper.findUnique({ where: { id } });
  if (!p) throw new NotFoundException('That paper isn’t there any more.');
  await teacherOf(u, p.courseId);
  return { ...p, versions: readVersions(p.versions) };
}

/** GET /exam-papers?courseId=: the course's papers, newest first. */
export async function listPapers(u: SessionUser, courseId: string) {
  await teacherOf(u, courseId);
  const rows = await prisma.examPaper.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: MAX_PAPERS, include: { _count: { select: { marks: true } } } });
  return {
    papers: rows.map((p) => {
      const versions = readVersions(p.versions);
      return { id: p.id, title: p.title, versions: versions.length, questions: versions[0]?.items.length ?? 0, total: versions[0] ? paperTotal(versions[0]) : 0, marked: p._count.marks, postedAt: p.postedAt, createdAt: p.createdAt };
    }),
  };
}

/**
 * POST /exam-papers { courseId, title, instructions?, minutes?, questionIds, written: [{ question, answer?, rubric }],
 * versions (1–4), shuffleOptions }
 */
export async function createPaper(u: SessionUser, b: Body) {
  const courseId = clip(b.courseId, 40);
  await teacherOf(u, courseId);
  const title = clip(b.title, 120);
  if (!title) throw new BadRequestException('Give the paper a title.');
  if ((await prisma.examPaper.count({ where: { courseId } })) >= MAX_PAPERS) throw new BadRequestException(`A course keeps ${MAX_PAPERS} paper exams: remove an old one.`);
  const ids = [...new Set(strings(b.questionIds))].slice(0, MAX_ITEMS);
  const bank = ids.length ? await prisma.bankQuestion.findMany({ where: { courseId, id: { in: ids } } }) : [];
  const fromBank: SourceQuestion[] = ids.flatMap((id) => {
    const q = bank.find((x) => x.id === id);
    return q ? [{ id: q.id, question: q.question, type: typeOf(q), options: optionsOf(q), correctAnswer: q.correctAnswer, points: q.points }] : [];
  });
  const written: SourceQuestion[] = (Array.isArray(b.written) ? b.written : []).slice(0, MAX_ITEMS).flatMap((w, i) => {
    const o = (w ?? {}) as Body;
    const question = long(o.question, 2000);
    const rubric = cleanRubric(o.rubric);
    const points = Math.min(Math.max(Number(o.points) || 0, 0), 100);
    return question && (rubric.length || points) ? [{ id: `w${i + 1}`, question, type: 'WRITTEN', options: [], correctAnswer: long(o.answer, 2000), points, rubric }] : [];
  });
  const all = [...fromBank, ...written].slice(0, MAX_ITEMS);
  if (!all.length) throw new BadRequestException('Pick at least one question.');
  const minutes = Number(b.minutes);
  const created = await prisma.examPaper.create({
    data: {
      courseId, title, createdById: u.id,
      instructions: long(b.instructions, 1000) || null,
      minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 600) : null,
      versions: JSON.stringify(buildVersions(all, { versions: Number(b.versions) || 1, shuffleOptions: b.shuffleOptions !== false, seed: `${courseId}:${title}:${Date.now()}` })),
    },
    select: { id: true },
  });
  return { paper: created };
}

/** GET /exam-papers/:id: the paper with its versions and keys, the course's students and their marks. */
export async function getPaper(u: SessionUser, id: string) {
  const p = await paperFor(u, id);
  const [enrolled, marks, course] = await Promise.all([
    prisma.enrollment.findMany({ where: { courseId: p.courseId }, select: { student: { select: { id: true, name: true } } }, take: 500 }),
    prisma.examMark.findMany({ where: { paperId: id } }),
    prisma.course.findUnique({ where: { id: p.courseId }, select: { name: true } }),
  ]);
  const read = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };
  return {
    paper: { id: p.id, title: p.title, course: course?.name ?? '', instructions: p.instructions, minutes: p.minutes, versions: p.versions, postedAt: p.postedAt, total: p.versions[0] ? paperTotal(p.versions[0]) : 0 },
    students: enrolled.map((e) => e.student).sort((a, b) => a.name.localeCompare(b.name)),
    marks: marks.map((m) => ({ studentId: m.studentId, version: m.version, marks: read(m.marks), score: m.score })),
  };
}

/** POST /exam-papers/:id/marks { studentId, version, marks }: one student's marks (worked out again here). */
export async function saveMarks(u: SessionUser, id: string, b: Body) {
  const p = await paperFor(u, id);
  const studentId = clip(b.studentId, 40);
  const enrolled = await prisma.enrollment.findFirst({ where: { courseId: p.courseId, studentId }, select: { id: true } });
  if (!enrolled) throw new BadRequestException('That student isn’t in this course.');
  const version = p.versions.find((v) => v.label === b.version) ?? p.versions[0];
  if (!version) throw new BadRequestException('This paper has no questions.');
  const marks = cleanMarks(b.marks, version.items);
  const score = paperScore(version, marks);
  await prisma.examMark.upsert({
    where: { paperId_studentId: { paperId: id, studentId } },
    create: { paperId: id, studentId, version: version.label, marks: JSON.stringify(marks), score },
    update: { version: version.label, marks: JSON.stringify(marks), score },
  });
  return { score, total: paperTotal(version) };
}

/** POST /exam-papers/:id/post: every marked student's total into the gradebook (sent again, it updates them). */
export async function postPaper(u: SessionUser, id: string) {
  const p = await paperFor(u, id);
  const total = p.versions[0] ? paperTotal(p.versions[0]) : 0;
  if (!total) throw new BadRequestException('This paper has no points to give.');
  const marks = await prisma.examMark.findMany({ where: { paperId: id }, select: { studentId: true, score: true }, take: 500 });
  if (!marks.length) throw new BadRequestException('Mark at least one student first.');
  // Sent again, the paper's rows are replaced (they're its own: same course, title and students). Rows go in
  // groups of 15 (6 values each, D1 takes 100 a statement), so a class of 500 stays under 50 queries.
  const ids = marks.map((m) => m.studentId);
  for (let i = 0; i < ids.length; i += 90) await prisma.grade.deleteMany({ where: { courseId: p.courseId, assignmentName: p.title, studentId: { in: ids.slice(i, i + 90) } } });
  for (let i = 0; i < marks.length; i += 15) {
    await prisma.grade.createMany({ data: marks.slice(i, i + 15).map((m) => ({ studentId: m.studentId, courseId: p.courseId, assignmentName: p.title, score: m.score, maxScore: total })) });
  }
  await prisma.examPaper.update({ where: { id }, data: { postedAt: new Date() } });
  return { posted: marks.length };
}

/** DELETE /exam-papers/:id (grades already sent stay in the gradebook). */
export async function removePaper(u: SessionUser, id: string) {
  await paperFor(u, id);
  await prisma.examPaper.delete({ where: { id } });
  return { ok: true };
}
