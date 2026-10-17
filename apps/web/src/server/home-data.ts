import type { D1Database } from '@cloudflare/workers-types';
import { cleanLayout, type UpNextItem } from '@/lib/home-layout';
import { dayBounds, localTime, monthStart, weekdayOf } from '@/lib/home-time';
import { dayIn, lastWeek } from '@/lib/study-days';

// GET /api/home (Stage 5 · Q8): what the home pages add to their dashboards: the person's layout,
// "Up next", the student's study goal, the teacher's "needs attention" list and the admin's live
// numbers. Plain D1 queries and no Prisma, so the light API path (cloudflare/fast-api.ts) answers it
// with this same code: a home page opening on a fresh Worker never starts Next.js for it.

export interface HomeCaller { id: string; role: string; org: string | null }
type Row = Record<string, unknown>;

// Dates as Prisma stores them in D1, so comparisons line up (cloudflare/fast-db.ts).
const dbDate = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`) : typeof v === 'number' ? v : NaN);
const num = (v: unknown) => Number(v ?? 0) || 0;
const HOUR = 3_600_000;
/** D1 takes at most 100 values in one query; a few go to the other conditions. */
const MAX_COURSES = 90;

export async function homeData(me: HomeCaller, db: D1Database, opts: { tz?: string; now?: number }) {
  const now = opts.now ?? Date.now();
  const today = dayIn(opts.tz, new Date(now));
  if (me.role === 'STUDENT') return student(me, db, now, today, opts.tz);
  if (me.role === 'TEACHER') return teacher(me, db, now, today, opts.tz);
  if (me.role === 'ADMIN') return admin(me, db, now, today, opts.tz);
  const u = await db.prepare('SELECT homeLayout FROM users WHERE id = ?').bind(me.id).first<Row>();
  return { layout: cleanLayout(u?.homeLayout), upNext: [] as UpNextItem[] };
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Today's timetable slots and class calls (now − 4 h … now + 36 h) as "Up next" items. A class
 *  with a call booked over its slot shows once, as the call. */
function classesAndCalls(slots: Row[], calls: Row[], today: string, tz: string | undefined, courseHref: (id: string) => string): UpNextItem[] {
  const callItems: UpNextItem[] = calls.map((c) => {
    const start = ms(c.startAt);
    const kind = c.kind === 'audio' ? 'audio' : 'video';
    return {
      kind: 'call', id: String(c.id), title: String(c.title || 'Class call'), sub: c.code ? `${c.code} · ${c.name}` : c.groupName ? String(c.groupName) : null,
      start, end: start + num(c.durationMin || 60) * 60_000,
      href: c.courseId ? `/call/c_${c.courseId}?kind=${kind}` : `/call/g_${c.groupId}?kind=${kind}`,
    };
  });
  const classItems: UpNextItem[] = [];
  for (const s of slots) {
    const start = localTime(today, String(s.startTime), tz), end = localTime(today, String(s.endTime), tz);
    if (start == null || end == null) continue;
    const covered = calls.some((c) => c.courseId === s.courseId && Math.abs(ms(c.startAt) - start) <= 20 * 60_000);
    if (covered) continue;
    const type = String(s.type ?? 'LECTURE').toLowerCase();
    classItems.push({ kind: 'class', id: String(s.id), title: String(s.name), sub: [s.code, type, s.room].filter(Boolean).join(' · '), start, end, href: courseHref(String(s.courseId)) });
  }
  return [...callItems, ...classItems];
}

async function student(me: HomeCaller, db: D1Database, now: number, today: string, tz: string | undefined) {
  const week = lastWeek(today);
  const [userRes, enrollRes, studyRes, groupCalls] = await db.batch([
    db.prepare('SELECT homeLayout FROM users WHERE id = ?').bind(me.id),
    db.prepare('SELECT courseId FROM enrollments WHERE studentId = ? LIMIT ?').bind(me.id, MAX_COURSES),
    db.prepare('SELECT day, actions FROM study_days WHERE userId = ? AND day >= ?').bind(me.id, week[0]),
    db.prepare(`SELECT sc.id, sc.title, sc.kind, sc.startAt, sc.durationMin, sc.groupId, g.name AS groupName FROM scheduled_calls sc JOIN groups g ON g.id = sc.groupId
      WHERE sc.groupId IN (SELECT groupId FROM group_memberships WHERE userId = ?) AND sc.startAt >= ? AND sc.startAt <= ? ORDER BY sc.startAt LIMIT 10`).bind(me.id, dbDate(now - 4 * HOUR), dbDate(now + 36 * HOUR)),
  ]);
  const ids = (enrollRes.results as Row[]).map((e) => String(e.courseId));
  const q = marks(ids.length);
  const [slots, calls, quizzes, tasks] = ids.length
    ? await db.batch([
        db.prepare(`SELECT ts.id, ts.startTime, ts.endTime, ts.type, ts.courseId, c.code, c.name, (SELECT name FROM rooms WHERE rooms.id = ts.roomId) AS room
          FROM timetable_slots ts JOIN courses c ON c.id = ts.courseId WHERE ts.courseId IN (${q}) AND ts.dayOfWeek = ? ORDER BY ts.startTime`).bind(...ids, weekdayOf(today)),
        db.prepare(`SELECT sc.id, sc.title, sc.kind, sc.startAt, sc.durationMin, sc.courseId, c.code, c.name FROM scheduled_calls sc JOIN courses c ON c.id = sc.courseId
          WHERE sc.courseId IN (${q}) AND sc.startAt >= ? AND sc.startAt <= ? ORDER BY sc.startAt LIMIT 10`).bind(...ids, dbDate(now - 4 * HOUR), dbDate(now + 36 * HOUR)),
        db.prepare(`SELECT q.id, q.title, q.dueDate, c.code FROM quizzes q JOIN courses c ON c.id = q.courseId WHERE q.courseId IN (${q}) AND q.status = 'PUBLISHED' AND q.dueDate > ? AND q.dueDate <= ?
          AND NOT EXISTS (SELECT 1 FROM quiz_submissions s WHERE s.quizId = q.id AND s.studentId = ?) ORDER BY q.dueDate LIMIT 5`).bind(...ids, dbDate(now), dbDate(now + 7 * 24 * HOUR), me.id),
        db.prepare(`SELECT a.id, a.title, a.dueDate, c.code FROM assignments a JOIN courses c ON c.id = a.courseId WHERE a.courseId IN (${q}) AND a.status = 'OPEN' AND a.dueDate > ? AND a.dueDate <= ?
          AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.assignmentId = a.id AND s.studentId = ?) ORDER BY a.dueDate LIMIT 5`).bind(...ids, dbDate(now), dbDate(now + 7 * 24 * HOUR), me.id),
      ])
    : [{ results: [] }, { results: [] }, { results: [] }, { results: [] }];

  const upNext: UpNextItem[] = [
    ...classesAndCalls(slots.results as Row[], [...(calls.results as Row[]), ...(groupCalls.results as Row[])], today, tz, (id) => `/student/courses/${id}`),
    ...(quizzes.results as Row[]).map((x): UpNextItem => ({ kind: 'quiz', id: String(x.id), title: String(x.title), sub: String(x.code ?? ''), due: ms(x.dueDate), href: '/student/quizzes' })),
    ...(tasks.results as Row[]).map((x): UpNextItem => ({ kind: 'assignment', id: String(x.id), title: String(x.title), sub: String(x.code ?? ''), due: ms(x.dueDate), href: `/student/assignments/${x.id}` })),
  ];
  const actions = new Map((studyRes.results as Row[]).map((r) => [String(r.day), num(r.actions)]));
  return {
    layout: cleanLayout((userRes.results[0] as Row | undefined)?.homeLayout),
    upNext,
    study: { today: actions.get(today) ?? 0, week: week.map((day) => ({ day, actions: actions.get(day) ?? 0 })) },
  };
}

async function teacher(me: HomeCaller, db: D1Database, now: number, today: string, tz: string | undefined) {
  const [userRes, courseRes] = await db.batch([
    db.prepare('SELECT homeLayout FROM users WHERE id = ?').bind(me.id),
    db.prepare('SELECT id FROM courses WHERE teacherId = ?1 OR id IN (SELECT courseId FROM course_staff WHERE userId = ?1) ORDER BY createdAt DESC LIMIT ?2').bind(me.id, MAX_COURSES),
  ]);
  const layout = cleanLayout((userRes.results[0] as Row | undefined)?.homeLayout);
  const ids = (courseRes.results as Row[]).map((c) => String(c.id));
  if (!ids.length) return { layout, upNext: [] as UpNextItem[], attention: { toGrade: 0, late: 0, missing: [], atRisk: { total: 0, students: [] }, questions: { total: 0, threads: [] } } };
  const q = marks(ids.length);
  const [slots, calls, grading, missing, risk, questions] = await db.batch([
    db.prepare(`SELECT ts.id, ts.startTime, ts.endTime, ts.type, ts.courseId, c.code, c.name, (SELECT name FROM rooms WHERE rooms.id = ts.roomId) AS room
      FROM timetable_slots ts JOIN courses c ON c.id = ts.courseId WHERE ts.courseId IN (${q}) AND ts.dayOfWeek = ? ORDER BY ts.startTime`).bind(...ids, weekdayOf(today)),
    db.prepare(`SELECT sc.id, sc.title, sc.kind, sc.startAt, sc.durationMin, sc.courseId, c.code, c.name FROM scheduled_calls sc JOIN courses c ON c.id = sc.courseId
      WHERE sc.courseId IN (${q}) AND sc.startAt >= ? AND sc.startAt <= ? ORDER BY sc.startAt LIMIT 10`).bind(...ids, dbDate(now - 4 * HOUR), dbDate(now + 36 * HOUR)),
    // Handed in and waiting for the teacher (the AI's draft counts as waiting too).
    db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN s.lateDays > 0 THEN 1 ELSE 0 END) AS late FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId
      WHERE a.courseId IN (${q}) AND s.status IN ('SUBMITTED', 'DRAFTED')`).bind(...ids),
    // Work due in the last two weeks that some students haven't handed in (one hand-in per student).
    db.prepare(`SELECT a.id, a.title, a.dueDate, c.code, (SELECT COUNT(*) FROM enrollments e WHERE e.courseId = a.courseId) AS enrolled,
      (SELECT COUNT(DISTINCT s.studentId) FROM assignment_submissions s WHERE s.assignmentId = a.id) AS handed
      FROM assignments a JOIN courses c ON c.id = a.courseId WHERE a.courseId IN (${q}) AND a.groupMode IS NULL AND a.dueDate < ? AND a.dueDate >= ? ORDER BY a.dueDate DESC LIMIT 6`).bind(...ids, dbDate(now), dbDate(now - 14 * 24 * HOUR)),
    db.prepare(`SELECT f.studentId, f.courseId, f.score, u.name, c.code, COUNT(*) OVER () AS total FROM student_risk_flags f JOIN users u ON u.id = f.studentId JOIN courses c ON c.id = f.courseId
      WHERE f.courseId IN (${q}) AND f.status = 'OPEN' AND f.level = 'AT_RISK' ORDER BY f.score DESC LIMIT 4`).bind(...ids),
    db.prepare(`SELECT t.id, t.title, t.courseId, t.createdAt, c.code, COUNT(*) OVER () AS total FROM course_threads t JOIN courses c ON c.id = t.courseId
      WHERE t.courseId IN (${q}) AND t.kind = 'QUESTION' AND t.replies = 0 AND t.answerId IS NULL AND t.createdAt >= ? ORDER BY t.createdAt DESC LIMIT 4`).bind(...ids, dbDate(now - 30 * 24 * HOUR)),
  ]);
  const g = (grading.results[0] ?? {}) as Row;
  const toGrade = num(g.n);
  const riskRows = risk.results as Row[], qRows = questions.results as Row[];
  return {
    layout,
    upNext: [
      ...classesAndCalls(slots.results as Row[], calls.results as Row[], today, tz, (id) => `/teacher/blackboard?course=${id}`),
      ...(toGrade ? [{ kind: 'grade', id: 'grade', title: `${toGrade} to grade`, sub: num(g.late) ? `${num(g.late)} handed in late` : 'Handed in and waiting for you', count: toGrade, href: '/teacher/assignments' } satisfies UpNextItem] : []),
    ],
    attention: {
      toGrade,
      late: num(g.late),
      missing: (missing.results as Row[]).map((a) => ({ id: String(a.id), title: String(a.title), code: String(a.code ?? ''), due: ms(a.dueDate), missing: Math.max(0, num(a.enrolled) - num(a.handed)) })).filter((a) => a.missing > 0),
      atRisk: { total: num(riskRows[0]?.total), students: riskRows.map((r) => ({ id: String(r.studentId), name: String(r.name), code: String(r.code ?? ''), score: num(r.score) })) },
      questions: { total: num(qRows[0]?.total), threads: qRows.map((t) => ({ id: String(t.id), title: String(t.title), code: String(t.code ?? ''), courseId: String(t.courseId), at: ms(t.createdAt) })) },
    },
  };
}

async function admin(me: HomeCaller, db: D1Database, now: number, today: string, tz: string | undefined) {
  // A school's admin sees their school (people whose account belongs to it); without one, everyone.
  const inOrg = (col: string) => (me.org ? ` AND ${col} IN (SELECT id FROM users WHERE organizationId = ?)` : '');
  const org = me.org ? [me.org] : [];
  const { start: dayStart } = dayBounds(today, tz);
  const { start: monthBegin } = dayBounds(monthStart(today), tz);
  // Attendance rows are stored for the day itself (midnight UTC of that date).
  const attDay = Date.parse(`${today}T00:00:00Z`);
  const [userRes, att, fees, flags, active, pending] = await db.batch([
    db.prepare('SELECT homeLayout FROM users WHERE id = ?').bind(me.id),
    db.prepare(`SELECT status, COUNT(*) AS n FROM attendance WHERE date >= ? AND date < ?${inOrg('studentId')} GROUP BY status`).bind(dbDate(attDay), dbDate(attDay + 24 * HOUR), ...org),
    db.prepare(`SELECT i.currency, SUM(CASE WHEN p.paidAt >= ? THEN p.amount - COALESCE(p.refundedAmount, 0) ELSE 0 END) AS today, SUM(p.amount - COALESCE(p.refundedAmount, 0)) AS month,
      SUM(CASE WHEN p.paidAt >= ? THEN 1 ELSE 0 END) AS payments FROM fee_payments p JOIN fee_invoices i ON i.id = p.invoiceId
      WHERE p.paidAt >= ? AND p.voidedAt IS NULL${inOrg('i.studentId')} GROUP BY i.currency ORDER BY month DESC`).bind(dbDate(dayStart), dbDate(dayStart), dbDate(monthBegin), ...org),
    db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high FROM safety_flags WHERE status = 'OPEN'${inOrg('senderId')}`).bind(...org),
    db.prepare(`SELECT SUM(CASE WHEN lastSeenAt >= ? THEN 1 ELSE 0 END) AS now, COUNT(*) AS today FROM users WHERE lastSeenAt >= ?${me.org ? ' AND organizationId = ?' : ''}`).bind(dbDate(now - 15 * 60_000), dbDate(dayStart), ...org),
    db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status = 'PENDING'${me.org ? ' AND organizationId = ?' : ''}`).bind(...org),
  ]);
  const byStatus = new Map((att.results as Row[]).map((r) => [String(r.status), num(r.n)]));
  const marked = [...byStatus.values()].reduce((a, b) => a + b, 0);
  const f = flags.results[0] as Row | undefined, a = active.results[0] as Row | undefined;
  return {
    layout: cleanLayout((userRes.results[0] as Row | undefined)?.homeLayout),
    upNext: [] as UpNextItem[],
    live: {
      attendance: { marked, present: (byStatus.get('PRESENT') ?? 0) + (byStatus.get('LATE') ?? 0), absent: byStatus.get('ABSENT') ?? 0 },
      fees: (fees.results as Row[]).map((r) => ({ currency: String(r.currency || 'INR'), today: num(r.today), month: num(r.month), payments: num(r.payments) })),
      safety: { open: num(f?.n), high: num(f?.high) },
      active: { now: num(a?.now), today: num(a?.today) },
      pending: num((pending.results[0] as Row | undefined)?.n),
    },
  };
}
