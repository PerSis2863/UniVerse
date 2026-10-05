// School analytics (admin → Insights): a fixed catalogue of safe measures. Admins open them
// directly (suggested questions, trend cards) or ask in plain words, and AI only picks a measure
// and its settings from this list. It never writes SQL, so every answer is a known, capped query.
// Import-free: the server, the Insights page and sample mode all share it.

export type MetricId =
  | 'attendance_by_course' | 'attendance_by_department' | 'attendance_trend'
  | 'grades_by_course' | 'grades_by_department' | 'grade_trend'
  | 'at_risk_by_department' | 'active_students_trend' | 'inactive_students_by_department'
  | 'teacher_workload' | 'grading_time_by_course'
  | 'impact_hours_by_month' | 'impact_hours_by_project' | 'enrollment_by_department';

export type Unit = '%' | 'count' | 'hours' | 'days';
/** bar: one bar per course, department…; line: a rate or count over time; column: amounts per month. */
export type ChartKind = 'bar' | 'line' | 'column';
export type Order = 'lowest' | 'highest';
/** What "days" means: a time window, how long since students were last seen, or nothing (right now). */
export type RangeKind = 'window' | 'away' | 'none';

export interface MetricColumn { key: string; label: string; unit?: Unit }

export interface MetricMeta {
  id: MetricId;
  title: string;
  /** One line for people and for the AI that picks a measure. */
  about: string;
  kind: ChartKind;
  unit: Unit;
  range: RangeKind;
  /** Usual number of days (0 when the measure has no range). */
  days: number;
  /** Usual order of the rows (null: in time order). */
  order: Order | null;
  /** Can be narrowed to one department. */
  department: boolean;
  /** What each row is: 'Course', 'Department', 'Teacher', 'Project', 'Month', or 'period' (weeks, or months for long windows). */
  group: string;
  /** The value column's name. */
  value: string;
  /** More columns for the table (keys the rows carry). */
  extra: MetricColumn[];
  /** The first row's headline when the rows are sorted largest first / smallest first. */
  top?: string;
  bottom?: string;
  /** Said when there's nothing to show. */
  empty: string;
  /** Said when every row is zero (counts only). */
  zero?: string;
}

const NAME: MetricColumn = { key: 'name', label: 'Name' };
const MARKS: MetricColumn = { key: 'counted', label: 'Marks', unit: 'count' };
const VOLUNTEERS: MetricColumn = { key: 'people', label: 'Volunteers', unit: 'count' };

export const METRICS: MetricMeta[] = [
  { id: 'attendance_by_course', title: 'Attendance by course', about: 'Share of attendance marks that were present or late, per course.', kind: 'bar', unit: '%', range: 'window', days: 30, order: 'lowest', department: true, top: 'Best attendance: {label}, {value}.', bottom: 'Lowest attendance: {label}, {value}.', group: 'Course', value: 'Attendance', extra: [NAME, MARKS], empty: 'No attendance was taken in this period.' },
  { id: 'attendance_by_department', title: 'Attendance by department', about: 'Share of attendance marks that were present or late, per department.', kind: 'bar', unit: '%', range: 'window', days: 30, order: 'lowest', department: false, top: 'Best attendance: {label}, {value}.', bottom: 'Lowest attendance: {label}, {value}.', group: 'Department', value: 'Attendance', extra: [MARKS], empty: 'No attendance was taken in this period.' },
  { id: 'attendance_trend', title: 'Attendance over time', about: 'Attendance rate (present or late) week by week, or month by month for long periods.', kind: 'line', unit: '%', range: 'window', days: 90, order: null, department: true, group: 'period', value: 'Attendance', extra: [MARKS], empty: 'No attendance was taken in this period.' },
  { id: 'grades_by_course', title: 'Average grade by course', about: 'Average grade given per course, as a percentage of the maximum score.', kind: 'bar', unit: '%', range: 'window', days: 30, order: 'lowest', department: true, top: 'Highest average grade: {label}, {value}.', bottom: 'Lowest average grade: {label}, {value}.', group: 'Course', value: 'Average grade', extra: [NAME, { key: 'n', label: 'Grades', unit: 'count' }], empty: 'No grades were given in this period.' },
  { id: 'grades_by_department', title: 'Average grade by department', about: 'Average grade given per department, as a percentage of the maximum score.', kind: 'bar', unit: '%', range: 'window', days: 30, order: 'lowest', department: false, top: 'Highest average grade: {label}, {value}.', bottom: 'Lowest average grade: {label}, {value}.', group: 'Department', value: 'Average grade', extra: [{ key: 'n', label: 'Grades', unit: 'count' }], empty: 'No grades were given in this period.' },
  { id: 'grade_trend', title: 'Grades over time', about: 'Average grade week by week, or month by month for long periods.', kind: 'line', unit: '%', range: 'window', days: 90, order: null, department: true, group: 'period', value: 'Average grade', extra: [{ key: 'n', label: 'Grades', unit: 'count' }], empty: 'No grades were given in this period.' },
  { id: 'at_risk_by_department', title: 'Students needing help by department', about: 'Students with an open early-warning flag (at risk or watch), per department of the flagged course. Right now, no time window.', kind: 'bar', unit: 'count', range: 'none', days: 0, order: 'highest', department: false, top: 'Most students flagged: {label} ({value}).', bottom: 'Fewest students flagged: {label} ({value}).', group: 'Department', value: 'Students flagged', extra: [{ key: 'atRisk', label: 'Of them at risk', unit: 'count' }], empty: 'No open early-warning flags right now.' },
  { id: 'active_students_trend', title: 'Active students over time', about: 'Students who did real learning on UniVerse (quizzes, flashcards, the course tutor) each week, or each month for long periods.', kind: 'line', unit: 'count', range: 'window', days: 90, order: null, department: true, group: 'period', value: 'Students who studied', extra: [], empty: 'No study activity in this period.' },
  { id: 'inactive_students_by_department', title: 'Students not seen recently', about: 'Active student accounts that haven’t opened UniVerse for a number of days, per department.', kind: 'bar', unit: 'count', range: 'away', days: 14, order: 'highest', department: false, top: 'Most students not seen: {label} ({value}).', bottom: 'Fewest students not seen: {label} ({value}).', zero: 'Every student has opened UniVerse in this period.', group: 'Department', value: 'Not seen', extra: [{ key: 'total', label: 'Students', unit: 'count' }, { key: 'share', label: 'Share', unit: '%' }], empty: 'There are no active student accounts yet.' },
  { id: 'teacher_workload', title: 'Teacher workload', about: 'Student answers waiting to be graded per teacher, with their courses, students and grades given in the period.', kind: 'bar', unit: 'count', range: 'window', days: 30, order: 'highest', department: false, top: 'Most answers waiting: {label} ({value}).', bottom: 'Fewest answers waiting: {label} ({value}).', zero: 'No student answers are waiting to be graded.', group: 'Teacher', value: 'Waiting to grade', extra: [{ key: 'courses', label: 'Courses', unit: 'count' }, { key: 'students', label: 'Students', unit: 'count' }, { key: 'graded', label: 'Grades given', unit: 'count' }], empty: 'No active teachers yet.' },
  { id: 'grading_time_by_course', title: 'Grading time by course', about: 'Average days between a student handing in an assignment and getting it back graded, per course.', kind: 'bar', unit: 'days', range: 'window', days: 90, order: 'highest', department: true, top: 'Slowest to return work: {label}, {value} on average.', bottom: 'Fastest to return work: {label}, {value} on average.', group: 'Course', value: 'Days to return', extra: [NAME, { key: 'n', label: 'Returned', unit: 'count' }], empty: 'No assignments were returned in this period.' },
  { id: 'impact_hours_by_month', title: 'Volunteer hours by month', about: 'Verified volunteer hours from checked-in shifts, month by month.', kind: 'column', unit: 'hours', range: 'window', days: 365, order: null, department: false, group: 'Month', value: 'Verified hours', extra: [VOLUNTEERS], empty: 'No verified volunteer hours in this period.' },
  { id: 'impact_hours_by_project', title: 'Volunteer hours by project', about: 'Verified volunteer hours from checked-in shifts, per NGO project.', kind: 'bar', unit: 'hours', range: 'window', days: 365, order: 'highest', department: false, top: 'Most hours: {label}, {value}.', bottom: 'Fewest hours: {label}, {value}.', group: 'Project', value: 'Verified hours', extra: [VOLUNTEERS], empty: 'No verified volunteer hours in this period.' },
  { id: 'enrollment_by_department', title: 'Students by department', about: 'Students enrolled in at least one course of each department, with the number of courses. Right now.', kind: 'bar', unit: 'count', range: 'none', days: 0, order: 'highest', department: false, top: 'Most students: {label} ({value}).', bottom: 'Fewest students: {label} ({value}).', group: 'Department', value: 'Students enrolled', extra: [{ key: 'courses', label: 'Courses', unit: 'count' }], empty: 'No enrolments yet.' },
];

export const isMetricId = (v: unknown): v is MetricId => typeof v === 'string' && METRICS.some((m) => m.id === v);
export const metricMeta = (id: MetricId): MetricMeta => METRICS.find((m) => m.id === id)!;

/** Trends longer than six months go month by month instead of week by week. */
export const monthlyFor = (days: number | null) => (days ?? 0) > 180;

/** The table's columns: what each row is, the value, then the extras. */
export function columnsFor(meta: MetricMeta, days: number | null): MetricColumn[] {
  const label = meta.group === 'period' ? (monthlyFor(days) ? 'Month' : 'Week starting') : meta.group;
  return [{ key: 'label', label }, { key: 'value', label: meta.value, unit: meta.unit }, ...meta.extra];
}

/** Time windows people can pick, and "not seen for" lengths. */
export const WINDOWS = [7, 14, 30, 90, 180, 365];
export const AWAY = [7, 14, 30, 60];

export function rangeText(meta: MetricMeta, days: number | null): string {
  if (meta.range === 'none' || !days) return 'Right now';
  if (meta.range === 'away') return `Not seen for ${days}+ days`;
  return ({ 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days', 90: 'Last 3 months', 180: 'Last 6 months', 365: 'Last 12 months' } as Record<number, string>)[days] ?? `Last ${days} days`;
}

export interface MetricParams { days?: number | null; order?: string | null; department?: string | null }

/** The measure's settings, made safe: days snapped to the nearest choice, a known order. */
export function normaliseParams(meta: MetricMeta, raw: MetricParams = {}): { days: number | null; order: Order | null } {
  const choices = meta.range === 'away' ? AWAY : meta.range === 'window' ? WINDOWS : [];
  const want = Number(raw.days);
  const days = !choices.length ? null : Number.isFinite(want) && want > 0 ? choices.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)) : meta.days;
  const order = meta.order === null ? null : raw.order === 'lowest' || raw.order === 'highest' ? raw.order : meta.order;
  return { days, order };
}

export type MetricRow = { label: string; value: number } & Record<string, string | number | null>;

export interface MetricResult {
  metric: MetricId;
  title: string;
  kind: ChartKind;
  unit: Unit;
  days: number | null;
  order: Order | null;
  department: string | null;
  /** e.g. "Last 30 days". */
  range: string;
  /** The first column is the row label, the second the value; the rest are shown in the table. */
  columns: MetricColumn[];
  rows: MetricRow[];
  headline: string;
  /** e.g. the department asked about doesn't exist. */
  note?: string;
  /** Departments it can be narrowed to (measures that allow it). */
  departments?: string[];
  /** How a question was matched to the measure. */
  via?: 'ai' | 'saved' | 'keywords' | 'suggestion';
  question?: string;
}

/** A question no measure answers. */
export interface MetricHelp { help: true; message: string }

export const HELP_MESSAGE = 'I can answer questions about attendance, grades, students needing help, study activity, students not seen recently, teacher workload, grading time, volunteer hours and enrolment.';

/** Suggested questions: opening one runs its measure straight away, without AI. */
export const SUGGESTIONS: { q: string; metric: MetricId; days?: number; order?: Order }[] = [
  { q: 'Which courses have the lowest attendance this month?', metric: 'attendance_by_course', days: 30, order: 'lowest' },
  { q: 'How are grades by department?', metric: 'grades_by_department' },
  { q: 'Where are most students needing help?', metric: 'at_risk_by_department' },
  { q: 'Which teachers have the most to grade?', metric: 'teacher_workload' },
  { q: 'How many students study each week?', metric: 'active_students_trend' },
  { q: 'Who hasn’t opened UniVerse for two weeks?', metric: 'inactive_students_by_department', days: 14 },
  { q: 'Which courses are slowest to return work?', metric: 'grading_time_by_course' },
  { q: 'How many volunteer hours this year?', metric: 'impact_hours_by_month', days: 365 },
];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A value for people: 62%, 4.5 days, 1,204. `long` spells out hours and days. */
export function formatValue(v: number | null | undefined, unit: Unit = 'count', long = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  if (unit === '%') return `${Math.round(v)}%`;
  if (unit === 'hours') return long ? `${round1(v).toLocaleString('en-US')} ${round1(v) === 1 ? 'hour' : 'hours'}` : `${round1(v).toLocaleString('en-US')} h`;
  if (unit === 'days') return long ? `${round1(v)} ${round1(v) === 1 ? 'day' : 'days'}` : `${round1(v)} d`;
  return Math.round(v).toLocaleString('en-US');
}

/**
 * One or two plain sentences about the rows, worked out without AI (so they're never wrong about
 * the numbers). `overall` is the weighted figure across the rows, for rates and averages.
 */
export function headlineFor(meta: MetricMeta, rows: MetricRow[], order: Order | null, overall: number | null): string {
  if (!rows.length) return meta.empty;
  const f = (v: number) => formatValue(v, meta.unit);
  if (meta.kind === 'column') {
    const total = rows.reduce((s, r) => s + r.value, 0);
    const best = rows.reduce((a, b) => (b.value > a.value ? b : a));
    return total > 0 ? `${f(total)} in total. Busiest month: ${best.label} (${f(best.value)}).` : meta.empty;
  }
  if (meta.kind === 'line') {
    const first = rows[0], last = rows[rows.length - 1];
    const name = meta.title.replace(/ over time$/, '');
    if (rows.length === 1) return `${name}: ${f(last.value)} (${last.label}).`;
    return Math.round(first.value) === Math.round(last.value)
      ? `${name} stayed at ${f(last.value)} from ${first.label} to ${last.label}.`
      : `${name} went from ${f(first.value)} (${first.label}) to ${f(last.value)} (${last.label}).`;
  }
  if (meta.unit !== '%' && rows.every((r) => !r.value)) return meta.zero ?? `${meta.value}: 0 for every ${meta.group.toLowerCase()}.`;
  const template = (order === 'lowest' ? meta.bottom : meta.top) ?? '{label}: {value}.';
  const lead = template.replace('{label}', rows[0].label).replace('{value}', f(rows[0].value));
  if (overall !== null && rows.length > 1) return `${lead} Across the ${rows.length} ${meta.group.toLowerCase()}s shown: ${f(overall)}.`;
  return lead;
}

/**
 * A best guess at the measure from keywords, for when AI isn't available (and in sample mode).
 * Null when nothing matches.
 */
export function guessMetric(question: string, departments: string[] = []): { metric: MetricId; days?: number; order?: Order; department?: string } | null {
  const q = ` ${question.toLowerCase().replace(/[’']/g, '')} `;
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  const word = (...words: string[]) => new RegExp(`\\b(${words.join('|')})\\b`).test(q);
  const byCourse = has('course', 'class', 'subject', 'module');
  const byDept = has('department', 'faculty', ' dept');
  const trend = has('trend', 'over time', 'each week', 'per week', 'weekly', 'by week', 'each month', 'per month', 'monthly', 'by month', 'changed', 'change', 'going up', 'going down', 'improv', 'dropp', 'falling', 'rising');

  let metric: MetricId | null = null;
  if (has('volunteer', 'impact', 'ngo', 'shift')) metric = has('project', 'ngo', 'charity', 'organisation', 'organization') ? 'impact_hours_by_project' : 'impact_hours_by_month';
  else if (has('turnaround', 'grading time', 'marking time', 'time to grade', 'time to mark', 'return work', 'returning work', 'get work back', 'slowest', 'fastest')) metric = 'grading_time_by_course';
  else if (has('teacher', 'workload', 'to grade', 'to mark', 'marking', 'backlog')) metric = 'teacher_workload';
  else if (has('at risk', 'at-risk', 'risk', 'struggl', 'need help', 'needing help', 'flag', 'early warning', 'support')) metric = 'at_risk_by_department';
  else if (has('not seen', 'inactive', 'havent', 'hasnt', 'have not', 'has not', 'not logged', 'not opened', 'last seen', 'disappeared')) metric = 'inactive_students_by_department';
  else if (has('attend', 'absent', 'absence', 'present', 'turn up', 'show up', 'skipping')) metric = trend ? 'attendance_trend' : byCourse ? 'attendance_by_course' : byDept ? 'attendance_by_department' : 'attendance_by_course';
  else if (has('grade', 'score', 'mark', 'result', 'gpa', 'perform', 'exam')) metric = trend ? 'grade_trend' : byCourse ? 'grades_by_course' : 'grades_by_department';
  else if (has('active', 'engag', 'study', 'studying', 'using universe', 'usage', 'log in', 'login', 'logged in')) metric = 'active_students_trend';
  else if (has('enrol', 'enroll', 'how many students', 'number of students', 'students per', 'students in each', 'biggest department', 'largest department')) metric = 'enrollment_by_department';
  if (!metric) return null;

  let days: number | undefined;
  const n = q.match(/(\d{1,3})\s*(day|week|month)/);
  if (n) days = Number(n[1]) * (n[2] === 'week' ? 7 : n[2] === 'month' ? 30 : 1);
  else if (has('two weeks', 'fortnight')) days = 14;
  else if (has('today', 'this week', 'last week', 'past week', 'a week')) days = 7;
  else if (has('this month', 'last month', 'past month', 'a month')) days = 30;
  else if (has('term', 'semester', 'quarter', 'three months')) days = 90;
  else if (has('six months', 'half year', 'half a year')) days = 180;
  else if (has('this year', 'last year', 'past year', 'a year', 'annual', 'twelve months')) days = 365;

  let order: Order | undefined;
  if (word('lowest', 'worst', 'least', 'fewest', 'bottom', 'poorest', 'weakest', 'fastest', 'quickest')) order = 'lowest';
  else if (word('highest', 'best', 'most', 'top', 'strongest', 'slowest', 'longest', 'biggest', 'largest')) order = 'highest';

  const department = [...departments].sort((a, b) => b.length - a.length).find((d) => d !== 'Other' && d.length > 1 && q.includes(d.toLowerCase()));
  return { metric, days, order, department };
}
