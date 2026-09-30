import prisma from '@/lib/db';
import { notify } from './email';

// Early warning: finds students who may be struggling in a course, from four signals —
// attendance, grades, missed quizzes and not opening UniVerse. Plain, explainable rules (no AI):
// each flag lists the reasons behind it. Flags go to the course's teacher and admins only; a
// person decides whether and how to reach out, and nothing is done to the student automatically.

const DAY = 86_400_000;
const WINDOW_DAYS = 30;
export const AT_RISK = 50;
export const WATCH = 30;
const REOPEN_JUMP = 15; // a handled flag comes back only if the score gets this much worse

export type Reason = { code: string; text: string };

interface StudentSignals {
  attendance: { absent: number; counted: number };
  grades: { percent: number; at: Date }[];
  missedQuizzes: string[];
  lastSeenAt: Date | null;
  enrolledAt: Date;
}

/** Score (0–100) and reasons for one student in one course. */
export function assess(s: StudentSignals, now = Date.now()): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  let score = 0;

  // Attendance (last 30 days; excused absences don't count)
  if (s.attendance.counted >= 3) {
    const rate = s.attendance.absent / s.attendance.counted;
    if (rate >= 0.4) { score += 35; reasons.push({ code: 'attendance', text: `Missed ${s.attendance.absent} of ${s.attendance.counted} classes in the last ${WINDOW_DAYS} days` }); }
    else if (rate >= 0.25) { score += 20; reasons.push({ code: 'attendance', text: `Missed ${s.attendance.absent} of ${s.attendance.counted} classes in the last ${WINDOW_DAYS} days` }); }
  }

  // Grades: low average, or a clear drop in the latest results
  if (s.grades.length >= 2) {
    const avg = s.grades.reduce((n, g) => n + g.percent, 0) / s.grades.length;
    if (avg < 50) { score += 30; reasons.push({ code: 'grades', text: `Average ${Math.round(avg)}% across ${s.grades.length} graded items` }); }
    else if (avg < 60) { score += 15; reasons.push({ code: 'grades', text: `Average ${Math.round(avg)}% across ${s.grades.length} graded items` }); }
    if (s.grades.length >= 4) {
      const sorted = [...s.grades].sort((a, b) => a.at.getTime() - b.at.getTime());
      const recent = sorted.slice(-2), before = sorted.slice(0, -2);
      const r = recent.reduce((n, g) => n + g.percent, 0) / recent.length;
      const b = before.reduce((n, g) => n + g.percent, 0) / before.length;
      if (b - r >= 15) { score += 15; reasons.push({ code: 'grade-drop', text: `Latest grades dropped from ${Math.round(b)}% to ${Math.round(r)}% on average` }); }
    }
  }

  // Quizzes that were due and not handed in
  if (s.missedQuizzes.length >= 2) { score += 20; reasons.push({ code: 'quizzes', text: `Didn't hand in ${s.missedQuizzes.length} quizzes: ${s.missedQuizzes.slice(0, 3).join(', ')}${s.missedQuizzes.length > 3 ? '…' : ''}` }); }
  else if (s.missedQuizzes.length === 1) { score += 10; reasons.push({ code: 'quizzes', text: `Didn't hand in the quiz “${s.missedQuizzes[0]}”` }); }

  // Hasn't opened UniVerse for two weeks (only once they've been enrolled that long)
  const since = s.lastSeenAt?.getTime() ?? s.enrolledAt.getTime();
  const days = Math.floor((now - since) / DAY);
  if (days >= 14 && now - s.enrolledAt.getTime() >= 14 * DAY) {
    score += 15;
    reasons.push({ code: 'inactive', text: s.lastSeenAt ? `Hasn't opened UniVerse in ${days} days` : `Hasn't opened UniVerse since enrolling ${days} days ago` });
  }

  return { score: Math.min(100, score), reasons };
}

const levelFor = (score: number) => (score >= AT_RISK ? 'AT_RISK' : score >= WATCH ? 'WATCH' : 'OK');

/** Re-assesses every student in one course and updates its flags. Returns new at-risk students. */
export async function assessCourse(courseId: string, now = Date.now()) {
  const since = new Date(now - WINDOW_DAYS * DAY);
  const [course, enrollments, attendance, grades, quizzes, flags] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, name: true, teacherId: true } }),
    prisma.enrollment.findMany({ where: { courseId }, select: { studentId: true, enrolledAt: true, student: { select: { lastSeenAt: true, status: true, role: true } } } }),
    prisma.attendance.findMany({ where: { courseId, date: { gte: since } }, select: { studentId: true, status: true } }),
    prisma.grade.findMany({ where: { courseId, status: 'GRADED' }, select: { studentId: true, score: true, maxScore: true, gradedAt: true } }),
    prisma.quiz.findMany({
      where: { courseId, status: { in: ['PUBLISHED', 'CLOSED'] }, dueDate: { gte: since, lt: new Date(now) } },
      select: { title: true, createdAt: true, dueDate: true, submissions: { select: { studentId: true } } },
    }),
    prisma.studentRiskFlag.findMany({ where: { courseId } }),
  ]);
  if (!course) return [];

  const flagBy = new Map(flags.map((f) => [f.studentId, f]));
  const newlyAtRisk: { studentId: string; score: number }[] = [];
  const writes: Promise<unknown>[] = [];

  for (const e of enrollments) {
    if (e.student.role !== 'STUDENT' || e.student.status === 'SUSPENDED') continue;
    const mine = attendance.filter((a) => a.studentId === e.studentId && a.status !== 'EXCUSED');
    const signals: StudentSignals = {
      attendance: { absent: mine.filter((a) => a.status === 'ABSENT').length, counted: mine.length },
      grades: grades.filter((g) => g.studentId === e.studentId && g.maxScore > 0).map((g) => ({ percent: (g.score / g.maxScore) * 100, at: g.gradedAt })),
      missedQuizzes: quizzes.filter((q) => q.dueDate! > e.enrolledAt && !q.submissions.some((s) => s.studentId === e.studentId)).map((q) => q.title),
      lastSeenAt: e.student.lastSeenAt,
      enrolledAt: e.enrolledAt,
    };
    const { score, reasons } = assess(signals, now);
    const level = levelFor(score);
    const existing = flagBy.get(e.studentId);

    if (!existing) {
      if (level === 'OK') continue;
      writes.push(prisma.studentRiskFlag.create({ data: { studentId: e.studentId, courseId, score, level, reasons, computedAt: new Date(now) } }));
      if (level === 'AT_RISK') newlyAtRisk.push({ studentId: e.studentId, score });
      continue;
    }
    // Handled flags (resolved / dismissed) come back only if things got clearly worse.
    let status = existing.status;
    if ((status === 'RESOLVED' || status === 'DISMISSED') && level !== 'OK' && score >= (existing.handledScore ?? 0) + REOPEN_JUMP) {
      status = 'OPEN';
      if (level === 'AT_RISK') newlyAtRisk.push({ studentId: e.studentId, score });
    }
    writes.push(prisma.studentRiskFlag.update({ where: { id: existing.id }, data: { score, level, reasons, status, computedAt: new Date(now) } }));
  }
  await Promise.all(writes);

  if (newlyAtRisk.length) {
    await notify(course.teacherId, {
      title: `${newlyAtRisk.length} student${newlyAtRisk.length === 1 ? '' : 's'} may need support in ${course.code}`,
      body: `Early warning found ${newlyAtRisk.length === 1 ? 'a student' : 'students'} in ${course.name} whose attendance, grades or activity suggest they may be struggling. Have a look and decide whether to reach out.`,
      link: '/teacher/early-warning',
      type: 'warning',
    });
  }
  return newlyAtRisk;
}

/** Re-assesses all published courses (daily), or the given ones. */
export async function assessCourses(courseIds?: string[]) {
  const courses = courseIds ?? (await prisma.course.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } })).map((c) => c.id);
  let flagged = 0;
  for (const id of courses) flagged += (await assessCourse(id).catch((e) => (console.error('early warning failed for course', id, e), []))).length;
  return { courses: courses.length, newlyAtRisk: flagged };
}
