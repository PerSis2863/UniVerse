import { describe, expect, it } from 'vitest';
import { lessonDates, mondayOf, spreadModules } from './lesson-plan';

const slots = [
  { id: 'mon', dayOfWeek: 0, startTime: '09:00', endTime: '10:00', type: 'LECTURE' },
  { id: 'thu', dayOfWeek: 3, startTime: '14:00', endTime: '15:30', type: 'LAB' },
  { id: 'bad', dayOfWeek: 2, startTime: '9am', endTime: '10:00', type: 'LECTURE' },
];

describe('lesson planner', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-11-18')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });

  it('lists each class of the term in order', () => {
    const d = lessonDates(slots, '2026-11-18', 2);
    expect(d.map((l) => `${l.day} ${l.slotId} w${l.week}`)).toEqual(['2026-11-16 mon w1', '2026-11-19 thu w1', '2026-11-23 mon w2', '2026-11-26 thu w2']);
    expect(lessonDates(slots, 'soon', 2)).toEqual([]);
    expect(lessonDates(slots, '2026-11-18', 99)).toHaveLength(26 * 2);
  });

  it('spreads modules over free lessons', () => {
    const lessons = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, planned: key === 'b' }));
    const m = spreadModules(lessons, ['Intro', 'Trees']);
    expect([...m.entries()]).toEqual([['a', 'Intro'], ['c', 'Intro (continued)'], ['d', 'Trees'], ['e', 'Trees (continued)']]);
    expect(spreadModules(lessons, []).size).toBe(0);
  });
});
