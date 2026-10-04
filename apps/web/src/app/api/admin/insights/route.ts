import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';

// School-wide insights for admins (/admin/insights): students flagged in more than one course,
// how each department is doing (grades now vs the month before, attendance), and each teacher's
// workload. Counted in SQL: a handful of queries whatever the size of the school.

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00'); // how dates are stored in D1

type Num = number | bigint | null;
const n = (v: Num) => (v === null ? null : Number(v));

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const now = Date.now();
  const d30 = iso(now - 30 * DAY), d60 = iso(now - 60 * DAY);

  const [flags, depts, attendance, teachers, totals] = await Promise.all([
    prisma.studentRiskFlag.findMany({
      where: { status: 'OPEN', level: { in: ['AT_RISK', 'WATCH'] } },
      orderBy: { score: 'desc' },
      take: 400,
      select: { score: true, level: true, reasons: true, student: { select: { id: true, name: true, email: true } }, course: { select: { id: true, code: true } } },
    }),
    prisma.$queryRawUnsafe<{ dept: string; recent: Num; previous: Num; graded: Num }[]>(
      `SELECT COALESCE(NULLIF(TRIM(c.department), ''), 'Other') AS dept,
              AVG(CASE WHEN g.gradedAt >= ? AND g.maxScore > 0 THEN g.score * 100.0 / g.maxScore END) AS recent,
              AVG(CASE WHEN g.gradedAt < ? AND g.maxScore > 0 THEN g.score * 100.0 / g.maxScore END) AS previous,
              SUM(CASE WHEN g.gradedAt >= ? THEN 1 ELSE 0 END) AS graded
       FROM grades g JOIN courses c ON c.id = g.courseId
       WHERE g.status = 'GRADED' AND g.gradedAt >= ?
       GROUP BY dept ORDER BY dept`,
      d30, d30, d30, d60,
    ),
    prisma.$queryRawUnsafe<{ dept: string; attended: Num; counted: Num }[]>(
      `SELECT COALESCE(NULLIF(TRIM(c.department), ''), 'Other') AS dept,
              SUM(CASE WHEN a.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended,
              SUM(CASE WHEN a.status != 'EXCUSED' THEN 1 ELSE 0 END) AS counted
       FROM attendance a JOIN courses c ON c.id = a.courseId
       WHERE a.date >= ?
       GROUP BY dept`,
      d30,
    ),
    prisma.$queryRawUnsafe<{ id: string; name: string; email: string; lastSeenAt: string | null; courses: Num; students: Num; toGrade: Num; graded30: Num; flagged: Num }[]>(
      `SELECT u.id, u.name, u.email, u.lastSeenAt,
              (SELECT COUNT(*) FROM courses c WHERE c.teacherId = u.id) AS courses,
              (SELECT COUNT(DISTINCT e.studentId) FROM enrollments e JOIN courses c ON c.id = e.courseId WHERE c.teacherId = u.id) AS students,
              (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId JOIN courses c ON c.id = a.courseId WHERE c.teacherId = u.id AND s.status != 'RETURNED') AS toGrade,
              (SELECT COUNT(*) FROM grades g JOIN courses c ON c.id = g.courseId WHERE c.teacherId = u.id AND g.gradedAt >= ?) AS graded30,
              (SELECT COUNT(*) FROM student_risk_flags f JOIN courses c ON c.id = f.courseId WHERE c.teacherId = u.id AND f.status = 'OPEN' AND f.level = 'AT_RISK') AS flagged
       FROM users u
       WHERE u.role = 'TEACHER' AND u.status = 'ACTIVE'
       ORDER BY toGrade DESC, students DESC
       LIMIT 200`,
      d30,
    ),
    prisma.$queryRawUnsafe<{ students: Num; teachers: Num; courses: Num; grade30: Num; attended: Num; counted: Num }[]>(
      `SELECT (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE') AS students,
              (SELECT COUNT(*) FROM users WHERE role = 'TEACHER' AND status = 'ACTIVE') AS teachers,
              (SELECT COUNT(*) FROM courses) AS courses,
              (SELECT AVG(score * 100.0 / maxScore) FROM grades WHERE status = 'GRADED' AND maxScore > 0 AND gradedAt >= ?) AS grade30,
              (SELECT SUM(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) FROM attendance WHERE date >= ?) AS attended,
              (SELECT SUM(CASE WHEN status != 'EXCUSED' THEN 1 ELSE 0 END) FROM attendance WHERE date >= ?) AS counted`,
      d30, d30, d30,
    ),
  ]);

  // One row per student, with every course they're flagged in (most worrying first).
  const byStudent = new Map<string, { id: string; name: string; email: string; worst: number; level: string; courses: { code: string; level: string; score: number; reasons: string[] }[] }>();
  for (const f of flags) {
    const s = byStudent.get(f.student.id) ?? { ...f.student, worst: 0, level: 'WATCH', courses: [] };
    const reasons = Array.isArray(f.reasons) ? (f.reasons as { text?: string }[]).map((r) => r?.text).filter((t): t is string => !!t).slice(0, 3) : [];
    s.courses.push({ code: f.course.code, level: f.level, score: f.score, reasons });
    s.worst = Math.max(s.worst, f.score);
    if (f.level === 'AT_RISK') s.level = 'AT_RISK';
    byStudent.set(f.student.id, s);
  }
  const atRisk = [...byStudent.values()].sort((a, b) => b.courses.length - a.courses.length || b.worst - a.worst).slice(0, 50);

  const att = new Map(attendance.map((a) => [a.dept, a]));
  const departments = depts.map((d) => {
    const a = att.get(d.dept);
    const counted = n(a?.counted ?? null) ?? 0;
    return {
      name: d.dept,
      grade: d.recent === null ? null : Math.round(n(d.recent)!),
      previous: d.previous === null ? null : Math.round(n(d.previous)!),
      graded: n(d.graded) ?? 0,
      attendance: counted ? Math.round(((n(a?.attended ?? null) ?? 0) / counted) * 100) : null,
    };
  });
  // Departments with attendance but no grades in the window.
  for (const a of attendance) {
    if (!departments.some((d) => d.name === a.dept)) {
      const counted = n(a.counted) ?? 0;
      departments.push({ name: a.dept, grade: null, previous: null, graded: 0, attendance: counted ? Math.round(((n(a.attended) ?? 0) / counted) * 100) : null });
    }
  }

  const t = totals[0];
  const counted = n(t?.counted ?? null) ?? 0;
  return NextResponse.json(
    {
      totals: {
        students: n(t?.students ?? 0) ?? 0,
        teachers: n(t?.teachers ?? 0) ?? 0,
        courses: n(t?.courses ?? 0) ?? 0,
        grade30: t?.grade30 === null || t?.grade30 === undefined ? null : Math.round(n(t.grade30)!),
        attendance30: counted ? Math.round(((n(t?.attended ?? 0) ?? 0) / counted) * 100) : null,
        flaggedStudents: byStudent.size,
      },
      atRisk,
      departments: departments.sort((a, b) => a.name.localeCompare(b.name)),
      teachers: teachers.map((x) => ({ ...x, courses: n(x.courses) ?? 0, students: n(x.students) ?? 0, toGrade: n(x.toGrade) ?? 0, graded30: n(x.graded30) ?? 0, flagged: n(x.flagged) ?? 0 })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
