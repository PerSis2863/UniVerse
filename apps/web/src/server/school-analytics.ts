import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  HELP_MESSAGE, METRICS, SUGGESTIONS, columnsFor, guessMetric, headlineFor, isMetricId, metricMeta, monthlyFor, normaliseParams, rangeText,
  type MetricHelp, type MetricId, type MetricParams, type MetricResult, type MetricRow, type Order,
} from '@/lib/school-metrics';
import { cachedAi, sameQuestion, saveAi, spendAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException } from './http';
import { featureOff } from './moderation';

// School analytics for admins (Insights → School insights): runs one measure from the catalogue in
// src/lib/school-metrics.ts. Every measure is fixed SQL with bound values and at most 50 rows
// (60 for weekly trends), so a question can never read anything else or run up D1. Questions in
// plain words cost one small AI request that only picks the measure; the pick is saved for a week,
// and the numbers are always counted fresh.

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00'); // how dates are stored in D1
type Num = string | number | bigint | null | undefined;
const num = (v: Num) => (v === null || v === undefined ? 0 : Number(v));
const dept = (col: string) => `COALESCE(NULLIF(TRIM(${col}), ''), 'Other')`;
const dayLabel = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

let deptCache: { at: number; list: string[] } | null = null;

/** Department names from courses and student profiles ("Other" for blank ones), kept 5 minutes. */
export async function departments(): Promise<string[]> {
  if (deptCache && Date.now() - deptCache.at < 300_000) return deptCache.list;
  const rows = await prisma.$queryRawUnsafe<{ d: string }[]>(
    `SELECT ${dept('department')} AS d FROM courses UNION SELECT ${dept('department')} AS d FROM student_profiles ORDER BY d LIMIT 100`,
  );
  deptCache = { at: Date.now(), list: rows.map((r) => r.d) };
  return deptCache.list;
}

type Raw = Record<string, string | number | bigint | null>;
const q = (sql: string, ...values: unknown[]) => prisma.$queryRawUnsafe<Raw[]>(sql, ...values);

/** Runs one measure. Settings are made safe first; a department that doesn't exist is ignored (with a note). */
export async function runMetric(id: MetricId, raw: MetricParams = {}): Promise<MetricResult> {
  const meta = metricMeta(id);
  const { days, order } = normaliseParams(meta, raw);
  const wanted = raw.department?.trim().slice(0, 80) || '';
  const list = meta.department ? await departments() : [];
  const department = wanted && meta.department ? list.find((d) => d.toLowerCase() === wanted.toLowerCase()) ?? null : null;
  const note = wanted && meta.department && !department ? `There’s no department called “${wanted}”, so this shows every department.` : undefined;

  const since = days ? iso(Date.now() - days * DAY) : '';
  const dir = order === 'lowest' ? 'ASC' : 'DESC';
  const monthly = monthlyFor(days);
  const bucket = (col: string) => (monthly ? `substr(${col}, 1, 7)` : `date(substr(${col}, 1, 10), '-6 days', 'weekday 1')`);
  const period = (k: string) => (monthly ? monthLabel(k) : dayLabel(k));
  const inDept = (col: string) => (department ? ` AND ${dept(col)} = ?` : '');
  const deptValue = department ? [department] : [];

  let rows: MetricRow[] = [];
  let overall: number | null = null;

  const ATT = `SUM(CASE WHEN a.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS attended, SUM(CASE WHEN a.status != 'EXCUSED' THEN 1 ELSE 0 END) AS counted`;
  const GRADE = `AVG(g.score * 100.0 / g.maxScore) AS v, COUNT(*) AS n`;
  const GRADED = `g.status = 'GRADED' AND g.maxScore > 0 AND g.gradedAt >= ?`;
  const rate = (r: Raw) => ({ value: (num(r.attended) / num(r.counted)) * 100, counted: num(r.counted) });
  const weighted = (list: MetricRow[], weight: string) => {
    const w = list.reduce((s, r) => s + Number(r[weight] ?? 0), 0);
    return w ? list.reduce((s, r) => s + r.value * Number(r[weight] ?? 0), 0) / w : null;
  };

  switch (id) {
    case 'attendance_by_course': {
      const found = await q(
        `SELECT * FROM (SELECT c.code AS label, c.name AS name, ${ATT} FROM attendance a JOIN courses c ON c.id = a.courseId
         WHERE a.date >= ?${inDept('c.department')} GROUP BY c.id) WHERE counted > 0 ORDER BY attended * 1.0 / counted ${dir}, counted DESC LIMIT 50`,
        since, ...deptValue,
      );
      rows = found.map((r) => ({ label: String(r.label), name: String(r.name ?? ''), ...rate(r) }));
      overall = weighted(rows, 'counted');
      break;
    }
    case 'attendance_by_department': {
      const found = await q(
        `SELECT * FROM (SELECT ${dept('c.department')} AS label, ${ATT} FROM attendance a JOIN courses c ON c.id = a.courseId
         WHERE a.date >= ? GROUP BY label) WHERE counted > 0 ORDER BY attended * 1.0 / counted ${dir}, label LIMIT 50`,
        since,
      );
      rows = found.map((r) => ({ label: String(r.label), ...rate(r) }));
      overall = weighted(rows, 'counted');
      break;
    }
    case 'attendance_trend': {
      const found = await q(
        `SELECT * FROM (SELECT ${bucket('a.date')} AS k, ${ATT} FROM attendance a JOIN courses c ON c.id = a.courseId
         WHERE a.date >= ?${inDept('c.department')} GROUP BY k) WHERE counted > 0 ORDER BY k LIMIT 60`,
        since, ...deptValue,
      );
      rows = found.map((r) => ({ label: period(String(r.k)), ...rate(r) }));
      break;
    }
    case 'grades_by_course': {
      const found = await q(
        `SELECT c.code AS label, c.name AS name, ${GRADE} FROM grades g JOIN courses c ON c.id = g.courseId
         WHERE ${GRADED}${inDept('c.department')} GROUP BY c.id ORDER BY v ${dir}, n DESC LIMIT 50`,
        since, ...deptValue,
      );
      rows = found.map((r) => ({ label: String(r.label), name: String(r.name ?? ''), value: num(r.v), n: num(r.n) }));
      overall = weighted(rows, 'n');
      break;
    }
    case 'grades_by_department': {
      const found = await q(
        `SELECT ${dept('c.department')} AS label, ${GRADE} FROM grades g JOIN courses c ON c.id = g.courseId
         WHERE ${GRADED} GROUP BY label ORDER BY v ${dir}, label LIMIT 50`,
        since,
      );
      rows = found.map((r) => ({ label: String(r.label), value: num(r.v), n: num(r.n) }));
      overall = weighted(rows, 'n');
      break;
    }
    case 'grade_trend': {
      const found = await q(
        `SELECT ${bucket('g.gradedAt')} AS k, ${GRADE} FROM grades g JOIN courses c ON c.id = g.courseId
         WHERE ${GRADED}${inDept('c.department')} GROUP BY k ORDER BY k LIMIT 60`,
        since, ...deptValue,
      );
      rows = found.map((r) => ({ label: period(String(r.k)), value: num(r.v), n: num(r.n) }));
      break;
    }
    case 'at_risk_by_department': {
      const found = await q(
        `SELECT ${dept('c.department')} AS label, COUNT(DISTINCT f.studentId) AS v, COUNT(DISTINCT CASE WHEN f.level = 'AT_RISK' THEN f.studentId END) AS atRisk
         FROM student_risk_flags f JOIN courses c ON c.id = f.courseId
         WHERE f.status = 'OPEN' AND f.level IN ('AT_RISK', 'WATCH') GROUP BY label ORDER BY v ${dir}, label LIMIT 50`,
      );
      rows = found.map((r) => ({ label: String(r.label), value: num(r.v), atRisk: num(r.atRisk) }));
      break;
    }
    case 'active_students_trend': {
      const found = await q(
        `SELECT ${bucket('s.day')} AS k, COUNT(DISTINCT s.userId) AS v
         FROM study_days s JOIN users u ON u.id = s.userId${department ? ' LEFT JOIN student_profiles sp ON sp.userId = u.id' : ''}
         WHERE u.role = 'STUDENT' AND s.day >= ?${inDept('sp.department')} GROUP BY k ORDER BY k LIMIT 60`,
        since.slice(0, 10), ...deptValue,
      );
      rows = found.map((r) => ({ label: period(String(r.k)), value: num(r.v) }));
      break;
    }
    case 'inactive_students_by_department': {
      const found = await q(
        `SELECT ${dept('sp.department')} AS label, SUM(CASE WHEN u.lastSeenAt IS NULL OR u.lastSeenAt < ? THEN 1 ELSE 0 END) AS v, COUNT(*) AS total
         FROM users u LEFT JOIN student_profiles sp ON sp.userId = u.id
         WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE' GROUP BY label ORDER BY v ${dir}, label LIMIT 50`,
        since,
      );
      rows = found.map((r) => ({ label: String(r.label), value: num(r.v), total: num(r.total), share: num(r.total) ? (num(r.v) / num(r.total)) * 100 : 0 }));
      break;
    }
    case 'teacher_workload': {
      const found = await q(
        `SELECT u.name AS label,
                (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId JOIN courses c ON c.id = a.courseId WHERE c.teacherId = u.id AND s.status != 'RETURNED') AS v,
                (SELECT COUNT(*) FROM courses c WHERE c.teacherId = u.id) AS courses,
                (SELECT COUNT(DISTINCT e.studentId) FROM enrollments e JOIN courses c ON c.id = e.courseId WHERE c.teacherId = u.id) AS students,
                (SELECT COUNT(*) FROM grades g JOIN courses c ON c.id = g.courseId WHERE c.teacherId = u.id AND g.gradedAt >= ?) AS graded
         FROM users u WHERE u.role = 'TEACHER' AND u.status = 'ACTIVE'
         ORDER BY v ${dir}, students DESC LIMIT 50`,
        since,
      );
      rows = found.map((r) => ({ label: String(r.label ?? 'Teacher'), value: num(r.v), courses: num(r.courses), students: num(r.students), graded: num(r.graded) }));
      break;
    }
    case 'grading_time_by_course': {
      const found = await q(
        `SELECT * FROM (SELECT c.code AS label, c.name AS name, AVG(julianday(s.returnedAt) - julianday(s.submittedAt)) AS v, COUNT(*) AS n
         FROM assignment_submissions s JOIN assignments a ON a.id = s.assignmentId JOIN courses c ON c.id = a.courseId
         WHERE s.returnedAt IS NOT NULL AND s.returnedAt >= ?${inDept('c.department')} GROUP BY c.id) WHERE v IS NOT NULL ORDER BY v ${dir} LIMIT 50`,
        since, ...deptValue,
      );
      rows = found.map((r) => ({ label: String(r.label), name: String(r.name ?? ''), value: Math.max(0, num(r.v)), n: num(r.n) }));
      overall = weighted(rows, 'n');
      break;
    }
    case 'impact_hours_by_month': {
      const found = await q(
        `SELECT substr(sc.checkOutAt, 1, 7) AS k, SUM(sc.minutes) / 60.0 AS v, COUNT(DISTINCT sc.studentId) AS people
         FROM shift_checkins sc WHERE sc.verified = 1 AND sc.checkOutAt >= ? GROUP BY k ORDER BY k LIMIT 24`,
        since,
      );
      // Every month in the window, so quiet months show as zero.
      const byMonth = new Map(found.map((r) => [String(r.k), r]));
      const start = new Date(Date.now() - (days ?? 365) * DAY);
      const months: string[] = [];
      for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d.getTime() <= Date.now() && months.length < 13; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.toISOString().slice(0, 7));
      rows = months.map((k) => ({ label: monthLabel(k), value: num(byMonth.get(k)?.v), people: num(byMonth.get(k)?.people) }));
      if (!found.length) rows = [];
      break;
    }
    case 'impact_hours_by_project': {
      const found = await q(
        `SELECT p.name AS label, SUM(sc.minutes) / 60.0 AS v, COUNT(DISTINCT sc.studentId) AS people
         FROM shift_checkins sc JOIN volunteer_shifts sh ON sh.id = sc.shiftId JOIN ngo_projects p ON p.id = sh.projectId
         WHERE sc.verified = 1 AND sc.checkOutAt >= ? GROUP BY p.id ORDER BY v ${dir} LIMIT 50`,
        since,
      );
      rows = found.map((r) => ({ label: String(r.label), value: num(r.v), people: num(r.people) }));
      break;
    }
    case 'enrollment_by_department': {
      const found = await q(
        `SELECT ${dept('c.department')} AS label, COUNT(DISTINCT e.studentId) AS v, COUNT(DISTINCT c.id) AS courses
         FROM enrollments e JOIN courses c ON c.id = e.courseId GROUP BY label ORDER BY v ${dir}, label LIMIT 50`,
      );
      rows = found.map((r) => ({ label: String(r.label), value: num(r.v), courses: num(r.courses) }));
      break;
    }
  }

  return {
    metric: id,
    title: meta.title,
    kind: meta.kind,
    unit: meta.unit,
    days,
    order,
    department,
    range: rangeText(meta, days) + (department ? ` · ${department}` : ''),
    columns: columnsFor(meta, days),
    rows,
    headline: headlineFor(meta, rows, order, overall),
    ...(note ? { note } : {}),
    ...(meta.department ? { departments: list } : {}),
  };
}

type Pick = { metric: MetricId | 'none'; days?: number; order?: Order; department?: string };

const SYSTEM = `You map a school administrator's question to one measure from a fixed list. Answer with the measure's id, or "none" when no measure answers it (for example a question about one named person, money, or anything not listed). Never invent measures.
days: the time window the question means (this week 7, this month 30, this term 90, six months 180, this year 365); leave it out when the question doesn't say. For inactive_students_by_department, days is how long since students last opened UniVerse.
order: "lowest" when the question wants the smallest values first (lowest, worst, fewest, least, fastest), "highest" for the largest first (highest, best, most, slowest). Leave it out when the question doesn't say.
department: one of the listed departments, copied exactly, only when the question names it.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    metric: { type: 'STRING', enum: [...METRICS.map((m) => m.id), 'none'] },
    days: { type: 'INTEGER' },
    order: { type: 'STRING', enum: ['lowest', 'highest'] },
    department: { type: 'STRING' },
  },
  required: ['metric'],
};

const validPick = (p: Pick | null): p is Pick => !!p && (p.metric === 'none' || isMetricId(p.metric));

/**
 * A question in plain words → the measure that answers it. Suggested questions skip AI; others use
 * one small AI request (saved a week per wording), or keywords when AI isn't available today.
 */
export async function askSchool(user: SessionUser, question: string): Promise<MetricResult | MetricHelp> {
  const text = question.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (text.length < 3) throw new BadRequestException('Type a question first.');
  const same = sameQuestion(text);
  const suggested = SUGGESTIONS.find((s) => sameQuestion(s.q) === same);
  if (suggested) return { ...(await runMetric(suggested.metric, suggested)), via: 'suggestion', question: text };

  const list = await departments();
  const key = ['school-analytics', same];
  let pick = await cachedAi<Pick>(key, 7);
  let via: MetricResult['via'] = 'saved';
  let aiMessage = '';
  if (!validPick(pick)) {
    pick = null;
    if (process.env.GEMINI_API_KEY && !(await featureOff('ai'))) {
      const spend = await spendAi(user);
      if (spend.ok) {
        const measures = METRICS.map((m) => `- ${m.id}: ${m.title}. ${m.about}${m.range === 'window' ? ` Usual window ${m.days} days.` : ''}${m.department ? ' Can narrow to one department.' : ''}`).join('\n');
        const out = await geminiJson<Pick>(SYSTEM, `Measures:\n${measures}\n\nDepartments: ${list.join(', ') || 'none yet'}\n\nQuestion: ${text}`, SCHEMA, 150, true);
        if (validPick(out)) {
          pick = out;
          via = 'ai';
          await saveAi(key, out);
        }
      } else {
        aiMessage = spend.message;
      }
    }
    if (!pick) {
      pick = guessMetric(text, list);
      via = 'keywords';
    }
  }
  if (!pick || pick.metric === 'none') return { help: true, message: aiMessage && !pick ? `${aiMessage} ${HELP_MESSAGE}` : HELP_MESSAGE };
  return { ...(await runMetric(pick.metric, pick)), via, question: text };
}
