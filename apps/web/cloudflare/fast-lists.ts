// Light-path answers for the lists the Collaborate pages open with (see fast-api.ts): plain SQL, the
// same JSON as the Next.js routes they stand in for (named on each), so a fresh Worker answers them
// without loading Next.js (on the free plan that first load is cut off, and the page says "Couldn't load").
import { isoDate, json, type Caller } from './fast-db';

type Row = Record<string, string | number | null>;
const NO_STORE = { 'Cache-Control': 'no-store' };

/** My classes (as in src/server/spaces.ts and src/server/docs.ts): enrolled, taught, or for docs, every class for admins. */
async function myCourses(me: Caller, db: D1Database, adminSeesAll: boolean) {
  const sql = me.role === 'STUDENT'
    ? 'SELECT c.id, c.code, c.name FROM enrollments e JOIN courses c ON c.id = e.courseId WHERE e.studentId = ?1 LIMIT 100'
    : me.role === 'ADMIN' && adminSeesAll
      ? 'SELECT id, code, name FROM courses LIMIT 100'
      : 'SELECT id, code, name FROM courses WHERE teacherId = ?1 LIMIT 100';
  const stmt = db.prepare(sql);
  const { results } = await (sql.includes('?1') ? stmt.bind(me.id) : stmt).all<{ id: string; code: string; name: string }>();
  return results.map((c) => ({ id: c.id, code: c.code, name: c.name }));
}

async function myGroups(me: Caller, db: D1Database) {
  const { results } = await db
    .prepare('SELECT g.id, g.name FROM group_memberships m JOIN groups g ON g.id = m.groupId WHERE m.userId = ?1 LIMIT 100')
    .bind(me.id)
    .all<{ id: string; name: string }>();
  return results.map((g) => ({ id: g.id, name: g.name }));
}

/** GET /api/spaces (src/server/spaces.ts mySpaces): my classes and study groups. */
export async function spacesList(me: Caller, db: D1Database) {
  const [courses, groups] = await Promise.all([myCourses(me, db, false), myGroups(me, db)]);
  return json({ courses, groups }, 200, NO_STORE);
}

const DOC_COLUMNS = 'id, title, preview, courseId, groupId, ownerId, parentId, updatedAt';

/**
 * GET /api/docs (src/server/docs.ts listDocs): pages I can see (mine, shared with me, my classes' and
 * groups'), newest first (200), then the sub-pages of those, up to three levels down.
 */
export async function docsList(me: Caller, db: D1Database) {
  const [courses, groups] = await Promise.all([myCourses(me, db, true), myGroups(me, db)]);
  // Each list of classes and groups fits a query: at most 100 each, D1 takes 100 values, so they go in separately.
  const where = ['ownerId = ?1', 'EXISTS (SELECT 1 FROM doc_members m WHERE m.docId = docs.id AND m.userId = ?1)'];
  const values: string[] = [me.id];
  const inList = (column: string, ids: string[]) => {
    if (!ids.length) return;
    where.push(`${column} IN (${ids.map((_, i) => `?${values.length + i + 1}`).join(',')})`);
    values.push(...ids);
  };
  inList('courseId', courses.map((c) => c.id));
  inList('groupId', groups.map((g) => g.id));
  if (values.length > 100) return null; // more than D1 takes in one query: the Next.js route answers
  const { results } = await db
    .prepare(`SELECT ${DOC_COLUMNS} FROM docs WHERE ${where.join(' OR ')} ORDER BY updatedAt DESC LIMIT 200`)
    .bind(...values)
    .all<Row>();
  const docs = [...results];
  const seen = new Set(docs.map((d) => d.id as string));
  let frontier = docs.map((d) => d.id as string);
  for (let level = 0; level < 3 && frontier.length && docs.length < 300; level++) {
    const next: string[] = [];
    for (let i = 0; i < Math.min(frontier.length, 180); i += 90) {
      const part = frontier.slice(i, i + 90);
      const { results: kids } = await db
        .prepare(`SELECT ${DOC_COLUMNS} FROM docs WHERE parentId IN (${part.map(() => '?').join(',')}) LIMIT 100`)
        .bind(...part)
        .all<Row>();
      for (const r of kids) {
        if (!seen.has(r.id as string)) { seen.add(r.id as string); docs.push(r); next.push(r.id as string); }
      }
    }
    frontier = next;
  }
  const label = new Map<string, string>([...courses.map((c) => [c.id, c.code] as const), ...groups.map((g) => [g.id, g.name] as const)]);
  return json({
    courses,
    groups,
    docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      preview: d.preview,
      course: d.courseId ? label.get(d.courseId as string) ?? null : d.groupId ? label.get(d.groupId as string) ?? null : null,
      space: d.courseId ? `c:${d.courseId}` : d.groupId ? `g:${d.groupId}` : null,
      parentId: d.parentId,
      mine: d.ownerId === me.id,
      updatedAt: isoDate(d.updatedAt as string),
    })),
  }, 200, NO_STORE);
}

const DEPT_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

/** GET /api/core/dashboard/admin (src/server/services/dashboard.service.ts getAdminDashboard): the admin overview. */
export async function adminDashboard(db: D1Database) {
  const [counts, students, teachers, payments, pending] = await db.batch([
    db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE role = 'STUDENT') AS students, (SELECT COUNT(*) FROM users WHERE role = 'TEACHER') AS teachers,
      (SELECT COUNT(*) FROM courses) AS courses, (SELECT SUM(amount) FROM payments WHERE status = 'COMPLETED') AS revenue`),
    db.prepare('SELECT department, COUNT(userId) AS n FROM student_profiles GROUP BY department'),
    db.prepare('SELECT department, COUNT(userId) AS n FROM teacher_profiles GROUP BY department'),
    db.prepare('SELECT u.name, p.type, p.amount, p.status FROM payments p JOIN users u ON u.id = p.userId ORDER BY p.createdAt DESC LIMIT 5'),
    db.prepare(`SELECT u.id, u.name, u.role, u.createdAt, s.department AS sDept, t.department AS tDept FROM users u
      LEFT JOIN student_profiles s ON s.userId = u.id LEFT JOIN teacher_profiles t ON t.userId = u.id
      WHERE u.status = 'PENDING' ORDER BY u.createdAt DESC LIMIT 5`),
  ]);
  const c = (counts.results[0] ?? {}) as Row;
  const totalStudents = Number(c.students ?? 0), totalTeachers = Number(c.teachers ?? 0);
  const departments = new Map<string, { name: string; students: number; teachers: number }>();
  for (const s of students.results as Row[]) if (s.department) departments.set(s.department as string, { name: s.department as string, students: Number(s.n), teachers: 0 });
  for (const t of teachers.results as Row[]) {
    if (!t.department) continue;
    const d = departments.get(t.department as string);
    if (d) d.teachers = Number(t.n); else departments.set(t.department as string, { name: t.department as string, students: 0, teachers: Number(t.n) });
  }
  const list = [...departments.values()].map((d, i) => ({ ...d, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
  if (!list.length) list.push({ name: 'General', students: totalStudents, teachers: totalTeachers, color: '#6366f1' });
  return json({
    totalStudents,
    totalTeachers,
    totalCourses: Number(c.courses ?? 0),
    revenue: Number(c.revenue ?? 0) || 0,
    departments: list,
    recentPayments: (payments.results as Row[]).map((p) => ({ name: p.name, type: p.type, amount: Number(p.amount), status: String(p.status).toLowerCase() })),
    pendingUsers: (pending.results as Row[]).map((u) => ({
      id: u.id, name: u.name, role: u.role,
      dept: u.sDept || u.tDept || 'General',
      applied: new Date(isoDate(u.createdAt as string)!).toLocaleDateString(),
    })),
  }, 200, NO_STORE);
}

const COURSE_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
const percent = (g: { score: number; maxScore: number }) => (g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0);
const letter = (p: number) => (p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F');

/** GET /api/core/dashboard/teacher (src/server/services/dashboard.service.ts getTeacherDashboard): a teacher's overview. */
export async function teacherDashboard(me: Caller, db: D1Database) {
  const mine = 'IN (SELECT id FROM courses WHERE teacherId = ?1)';
  const [counts, graded, courses, recent] = await db.batch([
    db.prepare(`SELECT (SELECT COUNT(*) FROM courses WHERE teacherId = ?1) AS courses,
      (SELECT COUNT(DISTINCT studentId) FROM enrollments WHERE courseId ${mine}) AS students,
      (SELECT COUNT(*) FROM grades WHERE status = 'PENDING' AND courseId ${mine}) AS pending`).bind(me.id),
    db.prepare(`SELECT studentId, courseId, score, maxScore, gradedAt FROM grades WHERE status = 'GRADED' AND courseId ${mine} ORDER BY gradedAt DESC`).bind(me.id),
    db.prepare('SELECT id, name, code, color FROM courses WHERE teacherId = ?1 ORDER BY createdAt DESC LIMIT 5').bind(me.id),
    db.prepare(`SELECT g.score, g.maxScore, u.name AS student, c.name AS course FROM grades g JOIN users u ON u.id = g.studentId JOIN courses c ON c.id = g.courseId
      WHERE g.status = 'GRADED' AND g.courseId ${mine} ORDER BY g.gradedAt DESC LIMIT 5`).bind(me.id),
  ]);
  const c = (counts.results[0] ?? {}) as Row;
  const grades = (graded.results as Row[]).map((g) => ({ studentId: g.studentId as string, courseId: g.courseId as string, score: Number(g.score), maxScore: Number(g.maxScore), gradedAt: g.gradedAt as string | null }));
  const top = courses.results as Row[];
  const enrolled = new Map<string, string[]>();
  if (top.length) {
    const { results } = await db.prepare(`SELECT courseId, studentId FROM enrollments WHERE courseId IN (${top.map(() => '?').join(',')})`).bind(...top.map((x) => x.id)).all<Row>();
    for (const e of results) enrolled.set(e.courseId as string, [...(enrolled.get(e.courseId as string) ?? []), e.studentId as string]);
  }
  const myCourses = top.map((x, i) => {
    const students = enrolled.get(x.id as string) ?? [];
    const done = new Set(grades.filter((g) => g.courseId === x.id).map((g) => g.studentId));
    return {
      id: x.id, name: x.name, code: x.code,
      students: students.length,
      completion: students.length ? Math.round((students.filter((s) => done.has(s)).length / students.length) * 100) : 0,
      color: x.color || COURSE_COLORS[i % COURSE_COLORS.length],
    };
  });
  const byMonth = new Map<string, { label: string; sum: number; n: number; t: number }>();
  for (const g of grades) {
    const d = new Date(g.gradedAt ? isoDate(g.gradedAt)! : 0);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = byMonth.get(key) ?? { label: d.toLocaleString('en', { month: 'short' }), sum: 0, n: 0, t: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
    m.sum += percent(g);
    m.n += 1;
    byMonth.set(key, m);
  }
  return json({
    activeCourses: Number(c.courses ?? 0),
    totalStudents: Number(c.students ?? 0),
    pendingGrades: Number(c.pending ?? 0),
    avgClassScore: grades.length ? Math.round(grades.reduce((sum, g) => sum + percent(g), 0) / grades.length) : 0,
    myCourses,
    gradeDistributionData: ['A', 'B', 'C', 'D', 'F'].map((grade) => ({ grade, count: grades.filter((g) => letter(percent(g)) === grade).length })),
    performanceTrendData: [...byMonth.values()].sort((a, b) => a.t - b.t).slice(-6).map((m) => ({ month: m.label, avgScore: Math.round(m.sum / m.n) })),
    recentStudents: (recent.results as Row[]).map((g) => {
      const score = Math.round(percent({ score: Number(g.score), maxScore: Number(g.maxScore) }));
      return { name: g.student, course: g.course, score, status: score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'needs-help' };
    }),
  }, 200, NO_STORE);
}
