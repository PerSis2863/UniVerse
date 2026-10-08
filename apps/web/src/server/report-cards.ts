import prisma from '@/lib/db';
import type { Category } from '@/lib/gradebook';
import { courseLine, overall, type AttendanceCounts, type ReportCardData } from '@/lib/report-card';
import { notifyMany } from './email';

// Report cards (Stage 5 · B15.3; card maths in src/lib/report-card.ts). An admin starts a round
// for a term (dates); cards are made 25 students per request (the browser asks for the next batch,
// so no request runs long on Workers), then the admin adds comments and publishes. Students see
// published cards in Grades and can print them; nothing is emailed.

const BATCH = 25;
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const inChunks = async <T,>(ids: string[], run: (part: string[]) => Promise<T[]>) => (await Promise.all(chunks([...new Set(ids)]).map(run))).flat();
const studentsWhere = { role: 'STUDENT' as const, status: { not: 'SUSPENDED' as const }, enrollments: { some: {} } };

export class ReportCardError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function createRun(input: { title: unknown; from: unknown; to: unknown }, school: string, userId: string) {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
  const from = typeof input.from === 'string' ? new Date(input.from) : null;
  const to = typeof input.to === 'string' ? new Date(input.to) : null;
  if (!title) throw new ReportCardError('Give the round a name, e.g. “Term 1 2026–27”.');
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new ReportCardError('Pick the term’s first and last day.');
  to.setHours(23, 59, 59, 999);
  const total = await prisma.user.count({ where: studentsWhere });
  return prisma.reportCardRun.create({ data: { title, fromDate: from, toDate: to, school: school.slice(0, 120), total, createdById: userId } });
}

/** Makes (or remakes) the cards for the next batch of students after `cursor`. */
export async function compileBatch(runId: string, cursor: string | null) {
  const run = await prisma.reportCardRun.findUnique({ where: { id: runId } });
  if (!run) throw new ReportCardError('Round not found.', 404);
  const students = await prisma.user.findMany({ where: { ...studentsWhere, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: BATCH, select: { id: true, name: true, email: true } });
  if (!students.length) return { made: 0, next: null };
  const ids = students.map((s) => s.id);
  const range = { gte: run.fromDate, lte: run.toDate };
  const [enrollments, grades, attendance] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, course: { select: { id: true, code: true, name: true, teacher: { select: { name: true } } } } } }),
    prisma.grade.findMany({ where: { studentId: { in: ids }, gradedAt: range }, select: { studentId: true, courseId: true, assignmentName: true, score: true, maxScore: true } }),
    prisma.attendance.groupBy({ by: ['studentId', 'courseId', 'status'], where: { studentId: { in: ids }, date: range }, _count: { _all: true } }),
  ]);
  const courseIds = enrollments.map((e) => e.course.id);
  const [categories, assessments] = await Promise.all([
    inChunks(courseIds, (part) => prisma.gradeCategory.findMany({ where: { courseId: { in: part } }, select: { id: true, courseId: true, name: true, weight: true, dropLowest: true } })),
    inChunks(courseIds, (part) => prisma.gradeAssessment.findMany({ where: { courseId: { in: part } }, select: { courseId: true, name: true, categoryId: true } })),
  ]);

  for (const s of students) {
    const lines = enrollments.filter((e) => e.studentId === s.id).map(({ course }) => {
      const mine = grades.filter((g) => g.studentId === s.id && g.courseId === course.id).map((g) => ({ assessment: g.assignmentName, score: g.score, maxScore: g.maxScore }));
      const cats: Category[] = categories.filter((c) => c.courseId === course.id);
      const of = new Map(assessments.filter((a) => a.courseId === course.id).map((a) => [a.name, a.categoryId]));
      const att: AttendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 };
      for (const a of attendance) if (a.studentId === s.id && a.courseId === course.id) att[a.status.toLowerCase() as keyof AttendanceCounts] += a._count._all;
      return courseLine({ code: course.code, name: course.name, teacher: course.teacher?.name ?? null }, mine, cats, (n) => of.get(n) ?? null, att);
    }).sort((a, b) => a.code.localeCompare(b.code));
    const data: ReportCardData = {
      student: { name: s.name, email: s.email },
      term: { title: run.title, from: run.fromDate.toISOString(), to: run.toDate.toISOString() },
      school: run.school,
      courses: lines,
      overall: overall(lines),
    };
    await prisma.reportCard.upsert({
      where: { runId_studentId: { runId, studentId: s.id } },
      update: { data: data as object, average: data.overall.average },
      create: { runId, studentId: s.id, data: data as object, average: data.overall.average },
    });
  }
  return { made: students.length, next: students.length === BATCH ? students[students.length - 1].id : null };
}

export async function listRuns() {
  const runs = await prisma.reportCardRun.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { cards: true } } } });
  return runs.map(({ _count, ...r }) => ({ ...r, cards: _count.cards }));
}

export async function runDetail(runId: string) {
  const run = await prisma.reportCardRun.findUnique({ where: { id: runId } });
  if (!run) throw new ReportCardError('Round not found.', 404);
  const cards = await prisma.reportCard.findMany({ where: { runId }, orderBy: { student: { name: 'asc' } }, select: { id: true, data: true, comment: true, average: true, student: { select: { id: true, name: true, email: true } } } });
  return { run, cards };
}

export async function setComment(cardId: string, comment: unknown) {
  const text = typeof comment === 'string' ? comment.trim().slice(0, 2000) : '';
  const card = await prisma.reportCard.update({ where: { id: cardId }, data: { comment: text || null } }).catch(() => null);
  if (!card) throw new ReportCardError('Card not found.', 404);
  return { ok: true };
}

/** Publishes (students see the cards and get an in-app notification) or takes a round back. */
export async function setPublished(runId: string, published: boolean) {
  const run = await prisma.reportCardRun.findUnique({ where: { id: runId } });
  if (!run) throw new ReportCardError('Round not found.', 404);
  if (published && !(await prisma.reportCard.count({ where: { runId } }))) throw new ReportCardError('Make the cards first.');
  await prisma.reportCardRun.update({ where: { id: runId }, data: { publishedAt: published ? new Date() : null } });
  if (published && !run.publishedAt) {
    const students = await prisma.reportCard.findMany({ where: { runId }, select: { studentId: true } });
    await notifyMany(students.map((s) => s.studentId), { type: 'report-card', title: `Your report card: ${run.title}`, body: 'It’s ready in Grades. You can print it or save it as a PDF.', link: '/student/grades', email: false });
  }
  return { ok: true };
}

export const deleteRun = (runId: string) => prisma.reportCardRun.delete({ where: { id: runId } }).then(() => ({ ok: true }));

/** A student's published cards, newest first. */
export async function myCards(studentId: string) {
  return prisma.reportCard.findMany({
    where: { studentId, run: { publishedAt: { not: null } } },
    orderBy: { run: { toDate: 'desc' } },
    select: { id: true, data: true, comment: true, run: { select: { title: true, fromDate: true, toDate: true, publishedAt: true } } },
  });
}
