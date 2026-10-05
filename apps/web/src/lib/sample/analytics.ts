// Sample mode answers for school analytics (admin → Insights). Fictional numbers, shaped exactly
// like the server's, so the page shows what a real school would see.
import {
  HELP_MESSAGE, SUGGESTIONS, columnsFor, guessMetric, headlineFor, metricMeta, monthlyFor, normaliseParams, rangeText,
  type MetricHelp, type MetricId, type MetricParams, type MetricResult, type MetricRow,
} from '@/lib/school-metrics';

const DEPARTMENTS = ['Business', 'Computer Science', 'Design', 'Engineering', 'Mathematics'];
const COURSES = [
  { code: 'CS101', name: 'Introduction to Programming', dept: 'Computer Science' },
  { code: 'CS204', name: 'Operating Systems', dept: 'Computer Science' },
  { code: 'MATH120', name: 'Linear Algebra', dept: 'Mathematics' },
  { code: 'MATH210', name: 'Probability', dept: 'Mathematics' },
  { code: 'BUS110', name: 'Social Entrepreneurship', dept: 'Business' },
  { code: 'DES150', name: 'Design Thinking', dept: 'Design' },
  { code: 'ENG201', name: 'Sustainable Materials', dept: 'Engineering' },
  { code: 'ENG230', name: 'Circuits', dept: 'Engineering' },
];
const TEACHERS = ['Dr. Meera Rao', 'Prof. Daniel Kim', 'Dr. Sofia Alvarez', 'Mr. Tomás Silva', 'Dr. Aisha Bello'];
const PROJECTS = ['Read Together', 'Clean Rivers', 'Code Club for Kids', 'Food Bank Fridays'];

/** A steady pseudo-random number between lo and hi for seed i. */
const between = (i: number, lo: number, hi: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return lo + (x - Math.floor(x)) * (hi - lo);
};

export function sampleMetric(id: MetricId, raw: MetricParams = {}): MetricResult {
  const meta = metricMeta(id);
  const { days, order } = normaliseParams(meta, raw);
  const department = meta.department ? DEPARTMENTS.find((d) => d.toLowerCase() === raw.department?.trim().toLowerCase()) ?? null : null;
  const courses = COURSES.filter((c) => !department || c.dept === department);
  const span = days ?? 30;
  let rows: MetricRow[] = [];

  const periods = () => {
    const monthly = monthlyFor(days);
    const count = monthly ? Math.min(12, Math.round(span / 30)) : Math.max(1, Math.round(span / 7));
    return Array.from({ length: count }, (_, i) => {
      const d = new Date();
      if (monthly) d.setUTCMonth(d.getUTCMonth() - (count - 1 - i), 1);
      else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7 * (count - 1 - i));
      return monthly ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    });
  };

  switch (id) {
    case 'attendance_by_course': rows = courses.map((c, i) => ({ label: c.code, name: c.name, value: between(i + 1, 68, 96), counted: Math.round(between(i + 2, 120, 480) * span / 30) })); break;
    case 'attendance_by_department': rows = DEPARTMENTS.map((d, i) => ({ label: d, value: between(i + 3, 74, 94), counted: Math.round(between(i + 4, 400, 1400) * span / 30) })); break;
    case 'attendance_trend': rows = periods().map((label, i) => ({ label, value: 88 - i * 0.6 + between(i, -2, 2), counted: Math.round(between(i + 5, 900, 1200)) })); break;
    case 'grades_by_course': rows = courses.map((c, i) => ({ label: c.code, name: c.name, value: between(i + 6, 58, 86), n: Math.round(between(i + 7, 20, 90)) })); break;
    case 'grades_by_department': rows = DEPARTMENTS.map((d, i) => ({ label: d, value: between(i + 8, 62, 84), n: Math.round(between(i + 9, 80, 260)) })); break;
    case 'grade_trend': rows = periods().map((label, i) => ({ label, value: 71 + i * 0.4 + between(i + 1, -3, 3), n: Math.round(between(i + 10, 60, 140)) })); break;
    case 'at_risk_by_department': rows = DEPARTMENTS.map((d, i) => { const v = Math.round(between(i + 11, 2, 18)); return { label: d, value: v, atRisk: Math.round(v * between(i + 12, 0.3, 0.6)) }; }); break;
    case 'active_students_trend': rows = periods().map((label, i) => ({ label, value: Math.round(210 + i * 4 + between(i + 2, -15, 15)) })); break;
    case 'inactive_students_by_department': rows = DEPARTMENTS.map((d, i) => { const total = Math.round(between(i + 13, 120, 420)); const v = Math.round(total * between(i + 14, 0.04, 0.16) * Math.sqrt(span / 14)); return { label: d, value: v, total, share: (v / total) * 100 }; }); break;
    case 'teacher_workload': rows = TEACHERS.map((t, i) => ({ label: t, value: Math.round(between(i + 15, 0, 38)), courses: Math.round(between(i + 16, 1, 4)), students: Math.round(between(i + 17, 40, 180)), graded: Math.round(between(i + 18, 10, 120) * span / 30) })); break;
    case 'grading_time_by_course': rows = courses.map((c, i) => ({ label: c.code, name: c.name, value: between(i + 19, 1.5, 9), n: Math.round(between(i + 20, 15, 80)) })); break;
    case 'impact_hours_by_month': rows = periods().map((label, i) => ({ label, value: Math.round(between(i + 21, 8, 64)), people: Math.round(between(i + 22, 4, 30)) })); break;
    case 'impact_hours_by_project': rows = PROJECTS.map((p, i) => ({ label: p, value: Math.round(between(i + 23, 20, 180)), people: Math.round(between(i + 24, 6, 40)) })); break;
    case 'enrollment_by_department': rows = DEPARTMENTS.map((d, i) => ({ label: d, value: Math.round(between(i + 25, 90, 420)), courses: Math.round(between(i + 26, 4, 18)) })); break;
  }
  if (order) rows.sort((a, b) => (order === 'lowest' ? a.value - b.value : b.value - a.value));
  const weight = rows[0] && 'counted' in rows[0] ? 'counted' : rows[0] && 'n' in rows[0] ? 'n' : null;
  const total = weight ? rows.reduce((s, r) => s + Number(r[weight]), 0) : 0;
  const overall = meta.kind === 'bar' && weight && total ? rows.reduce((s, r) => s + r.value * Number(r[weight]), 0) / total : null;

  return {
    metric: id, title: meta.title, kind: meta.kind, unit: meta.unit, days, order, department,
    range: rangeText(meta, days) + (department ? ` · ${department}` : ''),
    columns: columnsFor(meta, days), rows, headline: headlineFor(meta, rows, order, overall),
    ...(meta.department ? { departments: DEPARTMENTS } : {}),
  };
}

export function sampleAsk(question: string): MetricResult | MetricHelp {
  const text = String(question ?? '').trim();
  const suggested = SUGGESTIONS.find((s) => s.q.toLowerCase() === text.toLowerCase());
  const pick = suggested ?? guessMetric(text, DEPARTMENTS);
  if (!pick) return { help: true, message: HELP_MESSAGE };
  return { ...sampleMetric(pick.metric, pick), via: suggested ? 'suggestion' : 'keywords', question: text };
}
