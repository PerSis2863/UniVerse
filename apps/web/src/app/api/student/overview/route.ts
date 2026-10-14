import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { streakSummary } from '@/server/streaks';
import { levelInfo } from '@/lib/impact-level';

const pct = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);

/** Everything the student dashboard shows, computed from real records. */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  // Day of week in the student's timezone (0 = Monday, as stored on timetable slots).
  const dowParam = Number(new URL(req.url).searchParams.get('dow'));
  const dow = Number.isInteger(dowParam) && dowParam >= 0 && dowParam <= 6 ? dowParam : (new Date().getDay() + 6) % 7;
  const now = new Date();

  const [me, enrollments, attendance, grades, impact] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, impactXP: true, streakCurrent: true, streakBest: true, streakLastDay: true } }),
    prisma.enrollment.findMany({
      where: { studentId: user.id },
      select: { course: { select: { id: true, code: true, name: true, color: true, emoji: true } } },
    }),
    prisma.attendance.groupBy({ by: ['courseId', 'status'], where: { studentId: user.id }, _count: { _all: true } }),
    prisma.grade.findMany({
      where: { studentId: user.id, status: 'GRADED' },
      orderBy: { gradedAt: 'desc' },
      select: { id: true, courseId: true, assignmentName: true, score: true, maxScore: true, weight: true, gradedAt: true, course: { select: { code: true } } },
    }),
    prisma.impactPoint.aggregate({ where: { userId: user.id }, _sum: { points: true } }),
  ]);

  const courseIds = enrollments.map((e) => e.course.id);
  const [schedule, quizzes, streak] = await Promise.all([
    courseIds.length
      ? prisma.timetableSlot.findMany({
          where: { courseId: { in: courseIds }, dayOfWeek: dow },
          orderBy: { startTime: 'asc' },
          select: { id: true, startTime: true, endTime: true, type: true, room: { select: { name: true } }, course: { select: { code: true, name: true, color: true } } },
        })
      : [],
    courseIds.length
      ? prisma.quiz.findMany({
          where: { courseId: { in: courseIds }, status: 'PUBLISHED', dueDate: { gte: now }, submissions: { none: { studentId: user.id } } },
          orderBy: { dueDate: 'asc' },
          take: 6,
          select: { id: true, title: true, dueDate: true, course: { select: { code: true, name: true } } },
        })
      : [],
    streakSummary(user.id, req, me),
  ]);

  // Attendance: present or late counts as attended; excused days are left out.
  const att = new Map<string, { attended: number; total: number }>();
  for (const row of attendance) {
    if (row.status === 'EXCUSED') continue;
    const a = att.get(row.courseId) ?? { attended: 0, total: 0 };
    a.total += row._count._all;
    if (row.status === 'PRESENT' || row.status === 'LATE') a.attended += row._count._all;
    att.set(row.courseId, a);
  }
  const attTotals = [...att.values()].reduce((t, a) => ({ attended: t.attended + a.attended, total: t.total + a.total }), { attended: 0, total: 0 });

  // Weighted average grade, overall and per course.
  const gradeAgg = new Map<string, { w: number; sum: number }>();
  for (const g of grades) {
    const a = gradeAgg.get(g.courseId) ?? { w: 0, sum: 0 };
    a.w += g.weight;
    a.sum += pct(g.score, g.maxScore) * g.weight;
    gradeAgg.set(g.courseId, a);
  }
  const gTotals = [...gradeAgg.values()].reduce((t, a) => ({ w: t.w + a.w, sum: t.sum + a.sum }), { w: 0, sum: 0 });

  const courses = enrollments.map(({ course }) => {
    const a = att.get(course.id);
    const g = gradeAgg.get(course.id);
    return {
      ...course,
      attendance: a && a.total ? Math.round((a.attended / a.total) * 100) : null,
      averageGrade: g && g.w ? Math.round(g.sum / g.w) : null,
    };
  });

  const xp = me?.impactXP || impact._sum.points || 0;

  return NextResponse.json(
    {
      name: me?.name ?? user.name,
      stats: {
        courses: courses.length,
        attendance: attTotals.total ? Math.round((attTotals.attended / attTotals.total) * 100) : null,
        averageGrade: gTotals.w ? Math.round(gTotals.sum / gTotals.w) : null,
        upcoming: quizzes.length,
        impactPoints: impact._sum.points ?? 0,
      },
      level: levelInfo(xp),
      streak,
      courses,
      schedule: schedule.map((s) => ({
        id: s.id,
        start: s.startTime,
        end: s.endTime,
        type: s.type,
        room: s.room?.name ?? null,
        course: s.course,
      })),
      upcoming: quizzes,
      recentGrades: grades.slice(0, 5).map((g) => ({
        id: g.id,
        name: g.assignmentName,
        course: g.course.code,
        percent: Math.round(pct(g.score, g.maxScore)),
        gradedAt: g.gradedAt,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
