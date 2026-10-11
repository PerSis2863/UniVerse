import { describe, expect, it } from 'vitest';
import { barSpan, dayKey, daysBetween, monthGrid, moveDue, weekStart } from './task-calendar';

describe('task calendar', () => {
  it('lays out a month as six Monday-first weeks', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g).toHaveLength(42);
    expect(dayKey(g[0])).toBe('2026-09-28');
    expect(dayKey(g[3])).toBe('2026-10-01');
    expect(g[0].getDay()).toBe(1);
  });
  it('finds the Monday of a week and counts days', () => {
    expect(dayKey(weekStart(new Date(2026, 9, 11)))).toBe('2026-10-05'); // a Sunday
    expect(dayKey(weekStart(new Date(2026, 9, 5)))).toBe('2026-10-05');
    expect(daysBetween(new Date(2026, 9, 5), new Date(2026, 10, 2))).toBe(28);
  });
  it('places bars from creation to due date, cut to the range', () => {
    const start = new Date(2026, 9, 5);
    expect(barSpan(new Date(2026, 9, 6), new Date(2026, 9, 9), start, 28)).toEqual({ from: 1, to: 4, cutStart: false, cutEnd: false });
    expect(barSpan(new Date(2026, 8, 1), new Date(2026, 9, 7), start, 28)).toEqual({ from: 0, to: 2, cutStart: true, cutEnd: false });
    expect(barSpan(new Date(2026, 9, 20), new Date(2026, 9, 10), start, 28)).toEqual({ from: 4, to: 5, cutStart: false, cutEnd: false });
    expect(barSpan(new Date(2026, 9, 1), new Date(2026, 9, 2), start, 28)).toBeNull();
    expect(barSpan(new Date(2026, 9, 1), null, start, 28)).toBeNull();
  });
  it('moves a due date to another day, keeping its time', () => {
    const was = new Date(2026, 9, 5, 9, 30).toISOString();
    const moved = new Date(moveDue(was, '2026-10-08'));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([8, 9, 30]);
    expect(new Date(moveDue(null, '2026-10-08')).getHours()).toBe(17);
  });
});
