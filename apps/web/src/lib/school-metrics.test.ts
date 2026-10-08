import { describe, expect, it } from 'vitest';
import { METRICS, SUGGESTIONS, columnsFor, formatValue, guessMetric, headlineFor, isMetricId, metricMeta, normaliseParams, rangeText, type MetricRow } from './school-metrics';

const row = (label: string, value: number): MetricRow => ({ label, value });

describe('catalogue', () => {
  it('ids are unique and known', () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isMetricId(id)).toBe(true);
    expect(isMetricId('drop_tables')).toBe(false);
    expect(isMetricId(3)).toBe(false);
  });
  it('every suggestion names a real measure', () => {
    for (const s of SUGGESTIONS) expect(isMetricId(s.metric)).toBe(true);
  });
});

describe('normaliseParams', () => {
  const att = metricMeta('attendance_by_course');
  it('snaps days to the nearest choice', () => {
    expect(normaliseParams(att, { days: 25 }).days).toBe(30);
    expect(normaliseParams(att, { days: 100 }).days).toBe(90);
    expect(normaliseParams(att, { days: 9999 }).days).toBe(365);
  });
  it('uses the usual days for nonsense', () => {
    expect(normaliseParams(att, { days: -3 }).days).toBe(30);
    expect(normaliseParams(att, { days: Number.NaN }).days).toBe(30);
    expect(normaliseParams(att).days).toBe(30);
  });
  it('"not seen for" uses its own choices', () => {
    expect(normaliseParams(metricMeta('inactive_students_by_department'), { days: 50 }).days).toBe(60);
  });
  it('no days for measures without a range', () => {
    expect(normaliseParams(metricMeta('enrollment_by_department'), { days: 30 }).days).toBeNull();
  });
  it('keeps a known order, else the usual one', () => {
    expect(normaliseParams(att, { order: 'highest' }).order).toBe('highest');
    expect(normaliseParams(att, { order: 'random' }).order).toBe('lowest');
  });
  it('trends have no order', () => {
    expect(normaliseParams(metricMeta('attendance_trend'), { order: 'highest' }).order).toBeNull();
  });
});

describe('rangeText and columnsFor', () => {
  it('names windows', () => {
    expect(rangeText(metricMeta('attendance_by_course'), 90)).toBe('Last 3 months');
    expect(rangeText(metricMeta('attendance_by_course'), 45)).toBe('Last 45 days');
    expect(rangeText(metricMeta('inactive_students_by_department'), 14)).toBe('Not seen for 14+ days');
    expect(rangeText(metricMeta('enrollment_by_department'), null)).toBe('Right now');
  });
  it('trends go by month past six months', () => {
    expect(columnsFor(metricMeta('attendance_trend'), 90)[0].label).toBe('Week starting');
    expect(columnsFor(metricMeta('attendance_trend'), 365)[0].label).toBe('Month');
  });
});

describe('formatValue', () => {
  it('percent', () => expect(formatValue(61.6, '%')).toBe('62%'));
  it('hours and days, long and short', () => {
    expect(formatValue(1, 'hours')).toBe('1 hour');
    expect(formatValue(1204.25, 'hours')).toBe('1,204.3 hours');
    expect(formatValue(4.46, 'days', false)).toBe('4.5 d');
  });
  it('counts with thousands', () => expect(formatValue(12345)).toBe('12,345'));
  it('a dash for no value', () => {
    expect(formatValue(null)).toBe('–');
    expect(formatValue(Number.NaN)).toBe('–');
  });
});

describe('headlineFor', () => {
  it('empty rows', () => expect(headlineFor(metricMeta('attendance_by_course'), [], 'lowest', null)).toBe(metricMeta('attendance_by_course').empty));
  it('a trend that moved', () => {
    expect(headlineFor(metricMeta('attendance_trend'), [row('1 Sep', 80), row('8 Sep', 90)], null, null)).toBe('Attendance went from 80% (1 Sep) to 90% (8 Sep).');
  });
  it('a flat trend', () => {
    expect(headlineFor(metricMeta('attendance_trend'), [row('1 Sep', 80.2), row('8 Sep', 79.9)], null, null)).toContain('stayed at 80%');
  });
  it('monthly totals', () => {
    expect(headlineFor(metricMeta('impact_hours_by_month'), [row('Aug', 10), row('Sep', 30)], null, null)).toBe('40 hours in total. Busiest month: Sep (30 hours).');
  });
  it('mentions the overall figure across rows', () => {
    expect(headlineFor(metricMeta('attendance_by_course'), [row('CS101', 70), row('MA201', 90)], 'lowest', 80)).toContain('Across the 2 courses shown: 80%.');
  });
});

describe('guessMetric', () => {
  it.each([
    ['Which courses have the lowest attendance?', 'attendance_by_course', 'lowest'],
    ['attendance by department', 'attendance_by_department', undefined],
    ['Is attendance going down?', 'attendance_trend', undefined],
    ['Which teachers have the most to grade?', 'teacher_workload', 'highest'],
    ['Where are students struggling?', 'at_risk_by_department', undefined],
    ['Who has not opened the app?', 'inactive_students_by_department', undefined],
    ['volunteer hours per project', 'impact_hours_by_project', undefined],
    ['How many students in each department?', 'enrollment_by_department', undefined],
  ])('"%s" → %s', (q, metric, order) => {
    const g = guessMetric(q);
    expect(g?.metric).toBe(metric);
    expect(g?.order).toBe(order);
  });
  it('reads a period', () => {
    expect(guessMetric('attendance over the last 2 weeks')?.days).toBe(14);
    expect(guessMetric('grades this term')?.days).toBe(90);
  });
  it('finds a department, longest name first', () => {
    expect(guessMetric('grades in computer science', ['Science', 'Computer Science'])?.department).toBe('Computer Science');
  });
  it('null when nothing matches', () => expect(guessMetric('what is the weather')).toBeNull());
});
