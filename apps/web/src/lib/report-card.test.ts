import { describe, expect, it } from 'vitest';
import { SCALE_PRESETS, cleanScale } from './gradebook';
import { attendanceRate, courseLine, overall, reportCardsPage, reportCardSection, scaleNote } from './report-card';

const none = { present: 0, late: 0, absent: 0, excused: 0 };

describe('attendanceRate', () => {
  it('present and late count; excused is left out', () => expect(attendanceRate({ present: 7, late: 1, absent: 2, excused: 5 })).toBe(80));
  it('null when nothing was counted', () => {
    expect(attendanceRate(none)).toBeNull();
    expect(attendanceRate({ ...none, excused: 3 })).toBeNull();
  });
});

describe('courseLine and overall', () => {
  const course = { code: 'CS101', name: 'Intro', teacher: 'Dr Rao' };
  it('uses the weighted final and letter', () => {
    const cats = [{ id: 'hw', name: 'Homework', weight: 40, dropLowest: 0 }, { id: 'ex', name: 'Exams', weight: 60, dropLowest: 0 }];
    const of = (a: string) => (a.startsWith('HW') ? 'hw' : 'ex');
    const l = courseLine(course, [{ assessment: 'HW 1', score: 90, maxScore: 100 }, { assessment: 'Final', score: 70, maxScore: 100 }], cats, of, { present: 9, late: 0, absent: 1, excused: 0 });
    expect(l).toMatchObject({ final: 78, letter: 'C', graded: 2, attendanceRate: 90 });
  });
  it('no grades: no final', () => expect(courseLine(course, [], [], () => null, none)).toMatchObject({ final: null, letter: null, attendanceRate: null }));
  it('averages finals and GPA across courses, attendance over all classes', () => {
    const a = courseLine(course, [{ assessment: 'x', score: 95, maxScore: 100 }], [], () => null, { present: 10, late: 0, absent: 0, excused: 0 });
    const b = courseLine({ ...course, code: 'MA1' }, [{ assessment: 'y', score: 75, maxScore: 100 }], [], () => null, { present: 5, late: 0, absent: 5, excused: 0 });
    const c = courseLine({ ...course, code: 'X' }, [], [], () => null, none);
    expect(overall([a, b, c])).toEqual({ average: 85, gpa: 3, attendanceRate: 75, gpaMax: 4 });
    expect(overall([])).toEqual({ average: null, gpa: null, attendanceRate: null, gpaMax: 4 });
  });
});

describe('reportCardsPage', () => {
  it('escapes names and comments, one section per card', () => {
    const data = { student: { name: '<b>Eve</b>', email: 'e@x.org' }, term: { title: 'Term 1', from: '2026-09-01', to: '2026-12-20' }, school: 'Uni', courses: [], overall: { average: null, gpa: null, attendanceRate: null } };
    const html = reportCardsPage('Cards', [{ data, comment: 'Great <script>x</script>' }, { data, comment: null }]);
    expect(html).not.toContain('<b>Eve</b>');
    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(html).not.toContain('<script>x</script>');
    expect(html.match(/<section class="card">/g)).toHaveLength(2);
  });
});

describe('the school’s scale and logo on the card (Q22)', () => {
  it('writes the bands it was made with', () => {
    expect(scaleNote()).toBe('A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F below');
    expect(scaleNote(SCALE_PRESETS.find((p) => p.id === 'ib')!.scale)).toBe('7 ≥ 80, 6 ≥ 70, 5 ≥ 60, 4 ≥ 50, 3 ≥ 40, 2 ≥ 25, 1 below');
  });
  it('every preset is a valid scale', () => {
    for (const p of SCALE_PRESETS) expect(cleanScale(p.scale)).toEqual(p.scale);
  });
  it('shows the logo only from a safe address', () => {
    const d = { student: { name: 'A', email: '' }, term: { title: 'T1', from: '2026-01-01', to: '2026-03-31' }, school: 'S', courses: [], overall: { average: null, gpa: null, attendanceRate: null } };
    expect(reportCardSection({ ...d, logo: 'https://x.org/logo.png' }, null)).toContain('<img class="logo" src="https://x.org/logo.png"');
    expect(reportCardSection({ ...d, logo: 'javascript:alert(1)' }, null)).not.toContain('<img');
  });
});
