import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { mondayOf } from '@/lib/lesson-plan';
import { BadRequestException, NotFoundException } from './http';

// M300: a parent's week (the parent app, Schoolwork): for one linked child and one week, the grades
// that came back, attendance day by day, what was handed in and what was missed, what's due the
// next week and the courses' announcements. Schoolwork only, as in guardian-view.ts: never messages,
// the teacher's written feedback or anything personal.

const DAY = 86_400_000;
const MAX_WEEKS_BACK = 26;

export async function guardianWeek(u: SessionUser, studentId: string, weekRaw: string | undefined) {
  const link = await prisma.guardianLink.findFirst({ where: { guardianId: u.id, studentId }, select: { id: true } });
  if (!link) throw new NotFoundException('That child isn’t linked to your account.');
  const thisWeek = mondayOf(new Date().toISOString().slice(0, 10));
  const week = weekRaw && /^\d{4}-\d{2}-\d{2}$/.test(weekRaw) ? mondayOf(weekRaw) : thisWeek;
  const start = new Date(`${week}T00:00:00Z`), end = new Date(start.getTime() + 7 * DAY), next = new Date(end.getTime() + 7 * DAY);
  if (start.getTime() > Date.parse(`${thisWeek}T00:00:00Z`) || Date.parse(`${thisWeek}T00:00:00Z`) - start.getTime() > MAX_WEEKS_BACK * 7 * DAY) throw new BadRequestException('Choose one of the last 26 weeks.');

  const courses = await prisma.enrollment.findMany({ where: { studentId }, select: { courseId: true, course: { select: { code: true, name: true } } }, take: 60 });
  const ids = courses.map((c) => c.courseId);
  const code = (id: string) => courses.find((c) => c.courseId === id)?.course.code ?? '';
  const [grades, attendance, handedIn, quizzesDone, dueAssignments, dueQuizzes, announcements] = await Promise.all([
    prisma.grade.findMany({ where: { studentId, gradedAt: { gte: start, lt: end } }, select: { courseId: true, assignmentName: true, score: true, maxScore: true, gradedAt: true }, orderBy: { gradedAt: 'asc' }, take: 60 }),
    prisma.attendance.findMany({ where: { studentId, date: { gte: start, lt: end } }, select: { courseId: true, date: true, status: true }, orderBy: { date: 'asc' }, take: 100 }),
    prisma.assignmentSubmission.findMany({ where: { studentId, submittedAt: { gte: start, lt: end } }, select: { assignmentId: true, submittedAt: true, assignment: { select: { title: true, courseId: true } } }, take: 60 }),
    prisma.quizSubmission.findMany({ where: { studentId, submittedAt: { gte: start, lt: end } }, select: { quizId: true, submittedAt: true, quiz: { select: { title: true, courseId: true } } }, take: 60 }),
    ids.length ? prisma.assignment.findMany({ where: { courseId: { in: ids.slice(0, 90) }, dueDate: { gte: start, lt: next } }, select: { id: true, title: true, courseId: true, dueDate: true, submissions: { where: { studentId }, select: { id: true }, take: 1 } }, take: 80 }) : Promise.resolve([]),
    ids.length ? prisma.quiz.findMany({ where: { courseId: { in: ids.slice(0, 90) }, status: { in: ['PUBLISHED', 'CLOSED'] }, practice: false, dueDate: { gte: start, lt: next } }, select: { id: true, title: true, courseId: true, dueDate: true, submissions: { where: { studentId }, select: { id: true }, take: 1 } }, take: 80 }) : Promise.resolve([]),
    ids.length ? prisma.announcement.findMany({ where: { courseId: { in: ids.slice(0, 90) }, createdAt: { gte: start, lt: end }, OR: [{ publishAt: null }, { publishAt: { lt: end } }] }, select: { title: true, courseId: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 30 }) : Promise.resolve([]),
  ]);
  const due = [...dueAssignments.map((a) => ({ ...a, kind: 'assignment' as const })), ...dueQuizzes.map((q) => ({ ...q, kind: 'quiz' as const }))];
  const now = Date.now();
  const attended = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length, counted = attendance.filter((a) => a.status !== 'EXCUSED').length;
  return {
    week, thisWeek, previous: new Date(start.getTime() - 7 * DAY).toISOString().slice(0, 10), next: week < thisWeek ? end.toISOString().slice(0, 10) : null,
    summary: { grades: grades.length, attendance: counted ? Math.round((attended / counted) * 100) : null, handedIn: handedIn.length + quizzesDone.length, missed: due.filter((d) => d.dueDate! < end && d.dueDate!.getTime() < now && !d.submissions.length).length },
    grades: grades.map((g) => ({ course: code(g.courseId), title: g.assignmentName, score: g.score, maxScore: g.maxScore, at: g.gradedAt })),
    attendance: attendance.map((a) => ({ course: code(a.courseId), day: a.date.toISOString().slice(0, 10), status: a.status })),
    handedIn: [...handedIn.map((h) => ({ course: code(h.assignment.courseId), title: h.assignment.title, at: h.submittedAt })), ...quizzesDone.map((q) => ({ course: code(q.quiz.courseId), title: q.quiz.title, at: q.submittedAt }))].sort((a, b) => a.at.getTime() - b.at.getTime()),
    missed: due.filter((d) => d.dueDate! < end && d.dueDate!.getTime() < now && !d.submissions.length).map((d) => ({ course: code(d.courseId), title: d.title, kind: d.kind, due: d.dueDate })),
    nextWeek: due.filter((d) => d.dueDate! >= end).map((d) => ({ course: code(d.courseId), title: d.title, kind: d.kind, due: d.dueDate, done: d.submissions.length > 0 })).sort((a, b) => a.due!.getTime() - b.due!.getTime()),
    announcements: announcements.map((a) => ({ course: code(a.courseId!), title: a.title, at: a.createdAt })),
  };
}
