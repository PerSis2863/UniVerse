import { describe, expect, it } from 'vitest';
import { cleanQuestion, cleanUsed, factsLine, nextWeekly, quietWeek, templateSummary, weekOf, type WeekFacts } from './parent-copilot';

const empty: WeekFacts = { child: 'Riya', from: '2026-10-08', to: '2026-10-14', grades: [], attendance: { present: 0, late: 0, absent: 0, excused: 0 }, absences: [], due: [], late: [], average: null, averageBefore: null, achievements: [], reportCards: [] };

describe('parent co-pilot: the week', () => {
  it('a quiet week says so', () => {
    expect(quietWeek(empty)).toBe(true);
    expect(factsLine(empty)).toBe('');
    expect(templateSummary(empty)).toBe('A quiet week for Riya: no new grades, classes marked or work due in the school\'s records.');
  });

  const week: WeekFacts = {
    ...empty,
    grades: [{ course: 'Maths', title: 'Algebra test', percent: 82 }, { course: 'Science', title: 'Lab report', percent: 91 }],
    attendance: { present: 8, late: 1, absent: 1, excused: 0 },
    absences: [{ course: 'Maths', date: '2026-10-12' }],
    due: [{ course: 'English', title: 'Essay', kind: 'assignment', at: '2026-10-16T09:00:00Z' }],
    late: [{ course: 'History', title: 'Timeline', due: '2026-10-10T09:00:00Z' }],
    average: 84, averageBefore: 80,
    achievements: ['Science fair certificate'],
  };

  it('counts what happened', () => {
    expect(quietWeek(week)).toBe(false);
    expect(factsLine(week)).toBe('2 new grades · 1 absence · 1 piece of work late · 1 thing due · 1 achievement');
  });

  it('writes the week from the records alone', () => {
    const s = templateSummary(week);
    expect(s).toContain('present at 9 of 10 classes this week, and absent at 1 (Maths)');
    expect(s).toContain('2 new grades: 82% in Maths (Algebra test) and 91% in Science (Lab report). The best was Science.');
    expect(s).toContain('went up from 80% to 84%');
    expect(s).toContain('past the deadline: Timeline (History)');
    expect(s).toContain('Coming up: Essay (English)');
    expect(s).toContain('Well done for Science fair certificate');
    expect(templateSummary({ ...week, attendance: { present: 5, late: 0, absent: 0, excused: 0 }, absences: [] })).toContain('was at all 5 classes marked this week');
  });
});

describe('parent co-pilot: timing', () => {
  it('the week is known by its Monday', () => {
    expect(weekOf('2026-10-14')).toBe('2026-10-12'); // Wednesday
    expect(weekOf('2026-10-12')).toBe('2026-10-12'); // Monday
    expect(weekOf('2026-10-18')).toBe('2026-10-12'); // Sunday
  });

  it('the next weekly summary, in the parent’s time zone', () => {
    const wed = Date.parse('2026-10-14T10:00:00Z');
    expect(nextWeekly('UTC', 6, 18, wed).toISOString()).toBe('2026-10-18T18:00:00.000Z'); // Sunday 18:00
    expect(nextWeekly('Asia/Kolkata', 6, 18, wed).toISOString()).toBe('2026-10-18T12:30:00.000Z'); // 18:00 in India
    expect(nextWeekly('UTC', 2, 18, wed).toISOString()).toBe('2026-10-14T18:00:00.000Z'); // later today
    expect(nextWeekly('UTC', 2, 9, wed).toISOString()).toBe('2026-10-21T09:00:00.000Z'); // today's has passed
  });
});

describe('parent co-pilot: questions', () => {
  it('cleans questions and sources', () => {
    expect(cleanQuestion('  How is   Riya doing in maths? ')).toBe('How is Riya doing in maths?');
    expect(cleanQuestion('??')).toBeNull();
    expect(cleanQuestion(42)).toBeNull();
    expect(cleanQuestion('x'.repeat(400))?.length).toBe(300);
    expect(cleanQuestion('数学怎么样')).toBe('数学怎么样');
    expect(cleanUsed(['Grades', 'Maths', 'Messages', 'Grades', 7], ['Maths', 'Science'])).toEqual(['Grades', 'Maths']);
    expect(cleanUsed('Grades', [])).toEqual([]);
  });
});
