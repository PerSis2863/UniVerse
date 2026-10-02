import prisma from '@/lib/db';

// Course analytics for teachers: how a class is doing (average, trend, grade spread, attendance,
// completed work) and who is falling behind, with plain reasons and a suggested next step.
// Everything comes from five queries for the whole course (the course list plus four in
// parallel) and is worked out in memory, so a request stays far below D1's per-request query
// limit however big the class is.

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const TREND_WEEKS = 10;

export type BehindReason = { code: 'grades' | 'trend' | 'absences' | 'missed'; text: string };
export type SuggestedAction = 'message' | 'help';

export interface CourseAnalytics {
  course: { id: string; code: string; name: string };
  students: number;
  average: number | null; // class average, %
  averageChange: number | null; // last 4 weeks vs the 4 before, percentage points
  trend: { week: string; average: number | null; items: number }[];
  distribution: { label: string; min: number; count: number }[];
  attendance: { rate: number | null; recentRate: number | null; sessions: number };
  completion: { rate: number | null; done: number; expected: number; quizzes: number; assignments: number };
  behind: {
    student: { id: string; name: string; email: string; avatar: string | null };
    score: number;
    average: number | null;
    attendanceRate: number | null;
    missed: number;
    reasons: BehindReason[];
    action: SuggestedAction;
    actionText: string;
  }[];
}

const BANDS = [
  { label: '90–100', min: 90 },
  { label: '80–89', min: 80 },
  { label: '70–79', min: 70 },
  { label: '60–69', min: 60 },
  { label: 'Below 60', min: 0 },
];

const mean = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);
const round = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

/** The courses this person may analyse: their own, or every published course for admins. */
export function analyticsCourses(user: { id: string; role: string }) {
  return prisma.course.findMany({
    where: user.role === 'ADMIN' ? { status: 'PUBLISHED' } : { teacherId: user.id },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
    take: 200,
  });
}

export async function courseAnalytics(course: { id: string; code: string; name: string }, now = Date.now()): Promise<CourseAnalytics> {
  const nowDate = new Date(now);
  const [enrollments, attendance, grades, quizzes] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: course.id, student: { role: 'STUDENT', status: { not: 'SUSPENDED' } } },
      select: { enrolledAt: true, student: { select: { id: true, name: true, email: true, avatar: true } } },
    }),
    prisma.attendance.findMany({ where: { courseId: course.id }, select: { studentId: true, status: true, date: true } }),
    prisma.grade.findMany({ where: { courseId: course.id }, select: { studentId: true, assignmentName: true, score: true, maxScore: true, status: true, gradedAt: true } }),
    prisma.quiz.findMany({
      where: { courseId: course.id, status: { in: ['PUBLISHED', 'CLOSED'] } },
      select: { title: true, dueDate: true, submissions: { select: { studentId: true, score: true, maxScore: true, submittedAt: true } } },
    }),
  ]);

  const enrolled = new Set(enrollments.map((e) => e.student.id));

  // Graded items: teacher grades and scored quiz submissions, as percentages
  type Item = { studentId: string; percent: number; at: number };
  const items: Item[] = [];
  for (const g of grades) {
    if (g.status === 'GRADED' && g.maxScore > 0 && enrolled.has(g.studentId)) items.push({ studentId: g.studentId, percent: Math.min(100, (g.score / g.maxScore) * 100), at: g.gradedAt.getTime() });
  }
  for (const q of quizzes) {
    for (const s of q.submissions) {
      if (s.score !== null && s.maxScore && s.maxScore > 0 && enrolled.has(s.studentId)) items.push({ studentId: s.studentId, percent: Math.min(100, (s.score / s.maxScore) * 100), at: s.submittedAt.getTime() });
    }
  }
  const itemsBy = new Map<string, Item[]>();
  for (const it of items) {
    const list = itemsBy.get(it.studentId);
    if (list) list.push(it); else itemsBy.set(it.studentId, [it]);
  }

  // Weekly class average for the trend line (oldest week first)
  const weekStart = now - TREND_WEEKS * WEEK;
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const from = weekStart + i * WEEK;
    const inWeek = items.filter((it) => it.at >= from && it.at < from + WEEK).map((it) => it.percent);
    return { week: new Date(from).toISOString().slice(0, 10), average: round(mean(inWeek)), items: inWeek.length };
  });
  const recent = mean(items.filter((it) => it.at >= now - 4 * WEEK).map((it) => it.percent));
  const before = mean(items.filter((it) => it.at >= now - 8 * WEEK && it.at < now - 4 * WEEK).map((it) => it.percent));

  // Attendance: present or late counts as attended; excused absences don't count either way
  const attBy = new Map<string, { attended: number; counted: number }>();
  let attended = 0, counted = 0, recentAttended = 0, recentCounted = 0;
  const sessions = new Set<string>();
  for (const a of attendance) {
    if (!enrolled.has(a.studentId) || a.status === 'EXCUSED') continue;
    const ok = a.status === 'PRESENT' || a.status === 'LATE' ? 1 : 0;
    const s = attBy.get(a.studentId) ?? { attended: 0, counted: 0 };
    s.attended += ok; s.counted += 1;
    attBy.set(a.studentId, s);
    attended += ok; counted += 1;
    if (a.date.getTime() >= now - 30 * DAY) { recentAttended += ok; recentCounted += 1; }
    sessions.add(a.date.toISOString().slice(0, 10));
  }

  // Work expected: quizzes already due (after the student joined), and assignments most of the
  // class has a mark for (so a one-off grade for a single student isn't "missed" by everyone else)
  const dueQuizzes = quizzes.filter((q) => q.dueDate && q.dueDate < nowDate);
  const gradedBy = new Map<string, Set<string>>();
  for (const g of grades) {
    if (!enrolled.has(g.studentId)) continue;
    gradedBy.set(g.assignmentName, (gradedBy.get(g.assignmentName) ?? new Set()).add(g.studentId));
  }
  const firstMarked = new Map<string, number>();
  for (const g of grades) firstMarked.set(g.assignmentName, Math.min(firstMarked.get(g.assignmentName) ?? Infinity, g.gradedAt.getTime()));
  const classAssignments = [...gradedBy].filter(([, who]) => enrolled.size > 0 && who.size / enrolled.size >= 0.5).map(([name]) => name);

  let done = 0, expected = 0;
  const behind: CourseAnalytics['behind'] = [];
  const studentAverages: number[] = [];

  for (const e of enrollments) {
    const id = e.student.id;
    const mine = (itemsBy.get(id) ?? []).sort((a, b) => a.at - b.at);
    const avg = mean(mine.map((it) => it.percent));
    if (avg !== null) studentAverages.push(avg);

    const missedNames: string[] = [];
    for (const q of dueQuizzes) {
      if (q.dueDate! <= e.enrolledAt) continue;
      expected++;
      if (q.submissions.some((s) => s.studentId === id)) done++;
      else missedNames.push(q.title);
    }
    for (const name of classAssignments) {
      if ((firstMarked.get(name) ?? 0) < e.enrolledAt.getTime()) continue; // set before they joined
      expected++;
      if (gradedBy.get(name)!.has(id)) done++;
      else missedNames.push(name);
    }

    const att = attBy.get(id);
    const attRate = att && att.counted > 0 ? att.attended / att.counted : null;

    // Falling behind: plain, explainable rules, each adding to a ranking score
    const reasons: BehindReason[] = [];
    let score = 0;
    if (avg !== null && mine.length >= 2) {
      if (avg < 50) { score += 35; reasons.push({ code: 'grades', text: `Low grades: ${Math.round(avg)}% average over ${mine.length} marks` }); }
      else if (avg < 60) { score += 20; reasons.push({ code: 'grades', text: `Low grades: ${Math.round(avg)}% average over ${mine.length} marks` }); }
    }
    if (mine.length >= 4) {
      const last = mean(mine.slice(-2).map((it) => it.percent))!;
      const earlier = mean(mine.slice(0, -2).map((it) => it.percent))!;
      const drop = earlier - last;
      if (drop >= 10) { score += drop >= 20 ? 25 : 15; reasons.push({ code: 'trend', text: `Dropping: latest marks ${Math.round(last)}%, down from ${Math.round(earlier)}%` }); }
    }
    if (att && att.counted >= 3 && attRate !== null && attRate < 0.8) {
      const absent = att.counted - att.attended;
      score += attRate < 0.6 ? 30 : 15;
      reasons.push({ code: 'absences', text: `Absences: missed ${absent} of ${att.counted} classes` });
    }
    if (missedNames.length) {
      score += Math.min(30, missedNames.length * 10);
      reasons.push({ code: 'missed', text: `Missed work: ${missedNames.slice(0, 2).map((n) => `“${n}”`).join(', ')}${missedNames.length > 2 ? ` and ${missedNames.length - 2} more` : ''}` });
    }
    if (!score) continue;

    // Absent or not handing work in: check in first. Struggling with the material: offer help.
    const engagement = reasons.some((r) => r.code === 'absences' || r.code === 'missed');
    const learning = reasons.some((r) => r.code === 'grades' || r.code === 'trend');
    const action: SuggestedAction = learning && !engagement ? 'help' : 'message';
    const actionText = learning && engagement
      ? 'Message them to check in, and offer extra help with the material'
      : learning
        ? 'Offer extra help: office hours, a catch-up session or extra practice'
        : reasons.some((r) => r.code === 'absences')
          ? 'Message them to check in about the missed classes'
          : 'Message them about the missing work and agree a new date';
    behind.push({
      student: { id, name: e.student.name, email: e.student.email, avatar: e.student.avatar },
      score: Math.min(100, score),
      average: round(avg),
      attendanceRate: attRate === null ? null : Math.round(attRate * 100),
      missed: missedNames.length,
      reasons,
      action,
      actionText,
    });
  }
  behind.sort((a, b) => b.score - a.score || (a.average ?? 101) - (b.average ?? 101));

  return {
    course,
    students: enrollments.length,
    average: round(mean(studentAverages)),
    averageChange: recent !== null && before !== null ? round(recent - before) : null,
    trend,
    distribution: BANDS.map((b, i) => ({
      label: b.label,
      min: b.min,
      count: studentAverages.filter((a) => a >= b.min && (i === 0 || a < BANDS[i - 1].min)).length,
    })),
    attendance: {
      rate: counted ? Math.round((attended / counted) * 1000) / 10 : null,
      recentRate: recentCounted ? Math.round((recentAttended / recentCounted) * 1000) / 10 : null,
      sessions: sessions.size,
    },
    completion: {
      rate: expected ? Math.round((done / expected) * 1000) / 10 : null,
      done,
      expected,
      quizzes: dueQuizzes.length,
      assignments: classAssignments.length,
    },
    behind: behind.slice(0, 100),
  };
}
