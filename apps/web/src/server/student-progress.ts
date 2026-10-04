import prisma from '@/lib/db';

// A student's standing, shared by the study planner and the parent / guardian page: each course
// with its current grade and attendance, and what's due soon. Five queries, run together.

export interface CourseStanding {
  id: string;
  code: string;
  name: string;
  color: string | null;
  emoji: string | null;
  /** Weighted average of graded work, in %; null when nothing is graded yet. */
  grade: number | null;
  /** Present or late, in %; excused days are left out. */
  attendance: number | null;
  /** The latest graded work (newest first), for the planner's prompt. */
  recent: { name: string; percent: number }[];
}

export interface Deadline {
  id: string;
  kind: 'quiz' | 'exam' | 'deadline';
  title: string;
  due: string; // ISO
  course: { code: string; name: string } | null;
}

export interface StudentProgress {
  courses: CourseStanding[];
  deadlines: Deadline[];
  attendance: number | null;
  average: number | null;
}

const pct = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);

export async function studentProgress(studentId: string, days = 21): Promise<StudentProgress> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  const enrolled = { enrollments: { some: { studentId } } };

  const [enrollments, grades, attendance, quizzes, events, assignments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: 'asc' },
      select: { course: { select: { id: true, code: true, name: true, color: true, emoji: true } } },
    }),
    prisma.grade.findMany({
      where: { studentId, status: 'GRADED' },
      orderBy: { gradedAt: 'desc' },
      take: 300,
      select: { courseId: true, assignmentName: true, score: true, maxScore: true, weight: true },
    }),
    prisma.attendance.groupBy({ by: ['courseId', 'status'], where: { studentId }, _count: { _all: true } }),
    // Published quizzes in my courses that I haven't handed in yet.
    prisma.quiz.findMany({
      where: { course: enrolled, status: 'PUBLISHED', dueDate: { gte: now, lte: until }, submissions: { none: { studentId } } },
      orderBy: { dueDate: 'asc' },
      take: 30,
      select: { id: true, title: true, dueDate: true, course: { select: { code: true, name: true } } },
    }),
    // Exams and deadlines: my own, and those my teachers put on my courses' calendars. Personal
    // events and meetings stay out (they aren't work to prepare for, and may be private).
    prisma.calendarEvent.findMany({
      where: { type: { in: ['EXAM', 'DEADLINE'] }, startAt: { gte: now, lte: until }, OR: [{ userId: studentId }, { course: enrolled }] },
      orderBy: { startAt: 'asc' },
      take: 30,
      select: { id: true, title: true, type: true, startAt: true, course: { select: { code: true, name: true } } },
    }),
    // Open written assignments in my courses that I haven't handed in yet.
    prisma.assignment.findMany({
      where: { course: enrolled, status: 'OPEN', dueDate: { gte: now, lte: until }, submissions: { none: { studentId } } },
      orderBy: { dueDate: 'asc' },
      take: 30,
      select: { id: true, title: true, dueDate: true, course: { select: { code: true, name: true } } },
    }),
  ]);

  const att = new Map<string, { attended: number; total: number }>();
  for (const row of attendance) {
    if (row.status === 'EXCUSED') continue;
    const a = att.get(row.courseId) ?? { attended: 0, total: 0 };
    a.total += row._count._all;
    if (row.status === 'PRESENT' || row.status === 'LATE') a.attended += row._count._all;
    att.set(row.courseId, a);
  }

  const agg = new Map<string, { w: number; sum: number; recent: { name: string; percent: number }[] }>();
  for (const g of grades) {
    const a = agg.get(g.courseId) ?? { w: 0, sum: 0, recent: [] };
    a.w += g.weight;
    a.sum += pct(g.score, g.maxScore) * g.weight;
    if (a.recent.length < 3) a.recent.push({ name: g.assignmentName, percent: Math.round(pct(g.score, g.maxScore)) });
    agg.set(g.courseId, a);
  }

  const courses: CourseStanding[] = enrollments.map(({ course }) => {
    const a = att.get(course.id);
    const g = agg.get(course.id);
    return {
      ...course,
      grade: g && g.w ? Math.round(g.sum / g.w) : null,
      attendance: a && a.total ? Math.round((a.attended / a.total) * 100) : null,
      recent: g?.recent ?? [],
    };
  });

  const deadlines: Deadline[] = [
    ...quizzes.map((q) => ({ id: `q-${q.id}`, kind: 'quiz' as const, title: q.title, due: q.dueDate!.toISOString(), course: q.course })),
    ...assignments.map((a) => ({ id: `a-${a.id}`, kind: 'deadline' as const, title: a.title, due: a.dueDate!.toISOString(), course: a.course })),
    ...events.map((e) => ({ id: `e-${e.id}`, kind: e.type === 'EXAM' ? ('exam' as const) : ('deadline' as const), title: e.title, due: e.startAt.toISOString(), course: e.course })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  const attTotal = [...att.values()].reduce((t, a) => ({ attended: t.attended + a.attended, total: t.total + a.total }), { attended: 0, total: 0 });
  const gTotal = [...agg.values()].reduce((t, a) => ({ w: t.w + a.w, sum: t.sum + a.sum }), { w: 0, sum: 0 });

  return {
    courses,
    deadlines,
    attendance: attTotal.total ? Math.round((attTotal.attended / attTotal.total) * 100) : null,
    average: gTotal.w ? Math.round(gTotal.sum / gTotal.w) : null,
  };
}
