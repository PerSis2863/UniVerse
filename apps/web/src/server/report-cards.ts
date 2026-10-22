import prisma from '@/lib/db';
import type { Category } from '@/lib/gradebook';
import { courseLine, overall, type AttendanceCounts, type ReportCardData } from '@/lib/report-card';
import { scaleFor } from './grade-scale';
import { notifyMany } from './email';
import { inSchools, schoolsOf, usersIn, type SchoolIds } from './school-scope';

// Report cards (Stage 5 · B15.3; card maths in src/lib/report-card.ts). An admin starts a round
// for a term (dates); cards are made 25 students per request (the browser asks for the next batch,
// so no request runs long on Workers), then the admin adds comments and publishes. Students see
// published cards in Grades and can print them; nothing is emailed. A round belongs to the school of
// the admin who started it (school-scope.ts): its cards are that school's students, and another
// school's admins can't see or change it ("not found"); the platform owner sees every round. A
// round's starter may also run a school they own, so its cards can be several schools' students:
// each viewer sees, makes and comments on only their own schools' students' cards, and publishes or
// deletes a round only when it has no one else's.

const BATCH = 25;
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const inChunks = async <T,>(ids: string[], run: (part: string[]) => Promise<T[]>) => (await Promise.all(chunks([...new Set(ids)]).map(run))).flat();
const studentsWhere = (schools: SchoolIds | 'all') => ({ AND: [usersIn(schools), { role: 'STUDENT' as const, status: { not: 'SUSPENDED' as const }, enrollments: { some: {} } }] });

type Viewer = Parameters<typeof schoolsOf>[0];
type Run = NonNullable<Awaited<ReturnType<typeof prisma.reportCardRun.findUnique>>>;

/** A round's starter: their school (null for the main school, also when they're gone) and the schools its cards cover. */
async function runSchool(createdById: string | null) {
  const creator = createdById ? await prisma.user.findUnique({ where: { id: createdById }, select: { id: true, organizationId: true } }) : null;
  // A plain record (never 'all'): a round is one school's, even the platform owner's.
  return { orgId: creator?.organizationId ?? null, schools: creator ? await schoolsOf({ ...creator }) : ([null] as SchoolIds) };
}

/** Only cards of the viewer's schools' students ({} for the platform owner). */
const cardsOf = (viewing: SchoolIds | 'all') => (viewing === 'all' ? {} : { student: usersIn(viewing) });

/** The round, if it's one of the viewer's school's; otherwise "not found". */
async function findRun(viewer: Viewer, runId: string): Promise<Run> {
  const run = runId ? await prisma.reportCardRun.findUnique({ where: { id: runId } }) : null;
  if (!run) throw new ReportCardError('Round not found.', 404);
  const viewing = await schoolsOf(viewer);
  if (viewing !== 'all' && !inSchools(viewing, (await runSchool(run.createdById)).orgId)) throw new ReportCardError('Round not found.', 404);
  return run;
}

/** Publishing or deleting acts on every card of the round: refused while it has another school's students' cards. */
async function assertWholeRun(viewer: Viewer, runId: string) {
  const viewing = await schoolsOf(viewer);
  if (viewing !== 'all' && (await prisma.reportCard.count({ where: { runId, NOT: cardsOf(viewing) } }))) throw new ReportCardError('Only whoever started this round can publish or delete it.', 403);
}

export class ReportCardError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function createRun(input: { title: unknown; from: unknown; to: unknown }, school: string, user: { id: string; organizationId?: string | null }) {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
  const from = typeof input.from === 'string' ? new Date(input.from) : null;
  const to = typeof input.to === 'string' ? new Date(input.to) : null;
  if (!title) throw new ReportCardError('Give the round a name, e.g. “Term 1 2026–27”.');
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new ReportCardError('Pick the term’s first and last day.');
  to.setHours(23, 59, 59, 999);
  const total = await prisma.user.count({ where: studentsWhere(await schoolsOf({ id: user.id, organizationId: user.organizationId ?? null })) });
  return prisma.reportCardRun.create({ data: { title, fromDate: from, toDate: to, school: school.slice(0, 120), total, createdById: user.id } });
}

/** Makes (or remakes) the cards for the next batch of students after `cursor`. */
export async function compileBatch(viewer: Viewer, runId: string, cursor: string | null) {
  const run = await findRun(viewer, runId);
  // The school's letter grades and GPA points (Stage 5 · B3.4), and its students: of the schools the
  // round covers, the viewer's only.
  const { orgId, schools: covered } = await runSchool(run.createdById);
  const viewing = await schoolsOf(viewer);
  const schools = viewing === 'all' ? covered : covered === 'all' ? viewing : covered.filter((s) => viewing.includes(s));
  const [scale, org] = await Promise.all([scaleFor(orgId), orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { logoUrl: true } }) : Promise.resolve(null)]);
  // The school's logo on the card (Stage 5 · Q22), when it's an image the card can show.
  const logo = org?.logoUrl && /^(https:\/\/|\/api\/files\/)/.test(org.logoUrl) ? org.logoUrl : undefined;
  const students = await prisma.user.findMany({ where: { ...studentsWhere(schools), ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: BATCH, select: { id: true, name: true, email: true } });
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
      return courseLine({ code: course.code, name: course.name, teacher: course.teacher?.name ?? null }, mine, cats, (n) => of.get(n) ?? null, att, scale);
    }).sort((a, b) => a.code.localeCompare(b.code));
    const data: ReportCardData = {
      student: { name: s.name, email: s.email },
      term: { title: run.title, from: run.fromDate.toISOString(), to: run.toDate.toISOString() },
      school: run.school,
      ...(logo ? { logo } : {}),
      courses: lines,
      overall: overall(lines, scale),
      // The bands the letters came from, for the note on the card (Q22).
      scale,
    };
    await prisma.reportCard.upsert({
      where: { runId_studentId: { runId, studentId: s.id } },
      update: { data: data as object, average: data.overall.average },
      create: { runId, studentId: s.id, data: data as object, average: data.overall.average },
    });
  }
  return { made: students.length, next: students.length === BATCH ? students[students.length - 1].id : null };
}

/** The viewer's school's rounds (newest 50), by the school of whoever started each. */
export async function listRuns(viewer: Viewer) {
  const viewing = await schoolsOf(viewer);
  const runs = await prisma.reportCardRun.findMany({ orderBy: { createdAt: 'desc' }, take: viewing === 'all' ? 50 : 300, include: { _count: { select: { cards: viewing === 'all' ? true : { where: cardsOf(viewing) } } } } });
  let mine = runs;
  if (viewing !== 'all') {
    const starters = [...new Set(runs.map((r) => r.createdById).filter((id): id is string => !!id))];
    const found = await inChunks(starters, (part) => prisma.user.findMany({ where: { id: { in: part } }, select: { id: true, organizationId: true } }));
    const orgOf = new Map(found.map((u) => [u.id, u.organizationId]));
    mine = runs.filter((r) => inSchools(viewing, (r.createdById && orgOf.get(r.createdById)) || null));
  }
  return mine.slice(0, 50).map(({ _count, ...r }) => ({ ...r, cards: _count.cards }));
}

export async function runDetail(viewer: Viewer, runId: string) {
  const run = await findRun(viewer, runId);
  const cards = await prisma.reportCard.findMany({ where: { runId, ...cardsOf(await schoolsOf(viewer)) }, orderBy: { student: { name: 'asc' } }, select: { id: true, data: true, comment: true, average: true, student: { select: { id: true, name: true, email: true } } } });
  return { run, cards };
}

export async function setComment(viewer: Viewer, cardId: string, comment: unknown) {
  const text = typeof comment === 'string' ? comment.trim().slice(0, 2000) : '';
  const found = cardId ? await prisma.reportCard.findUnique({ where: { id: cardId }, select: { runId: true, student: { select: { organizationId: true } } } }) : null;
  // Another school's student's card looks gone, even in the viewer's school's round.
  if (!found || !inSchools(await schoolsOf(viewer), found.student?.organizationId) || !(await findRun(viewer, found.runId).then(() => true, () => false))) throw new ReportCardError('Card not found.', 404);
  const card = await prisma.reportCard.update({ where: { id: cardId }, data: { comment: text || null } }).catch(() => null);
  if (!card) throw new ReportCardError('Card not found.', 404);
  return { ok: true };
}

/** Publishes (students see the cards and get an in-app notification) or takes a round back. */
export async function setPublished(viewer: Viewer, runId: string, published: boolean) {
  const run = await findRun(viewer, runId);
  await assertWholeRun(viewer, runId);
  if (published && !(await prisma.reportCard.count({ where: { runId } }))) throw new ReportCardError('Make the cards first.');
  await prisma.reportCardRun.update({ where: { id: runId }, data: { publishedAt: published ? new Date() : null } });
  if (published && !run.publishedAt) {
    const students = await prisma.reportCard.findMany({ where: { runId }, select: { studentId: true } });
    await notifyMany(students.map((s) => s.studentId), { type: 'report-card', title: `Your report card: ${run.title}`, body: 'It’s ready in Grades. You can print it or save it as a PDF.', link: '/student/grades', email: false });
  }
  return { ok: true };
}

export async function deleteRun(viewer: Viewer, runId: string) {
  await findRun(viewer, runId);
  await assertWholeRun(viewer, runId);
  await prisma.reportCardRun.delete({ where: { id: runId } });
  return { ok: true };
}

/** A student's published cards, newest first. */
export async function myCards(studentId: string) {
  return prisma.reportCard.findMany({
    where: { studentId, run: { publishedAt: { not: null } } },
    orderBy: { run: { toDate: 'desc' } },
    select: { id: true, data: true, comment: true, run: { select: { title: true, fromDate: true, toDate: true, publishedAt: true } } },
  });
}
