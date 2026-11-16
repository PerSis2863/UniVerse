import { describe, expect, it } from 'vitest';
import { barSpan, dayKey, daysBetween, hoursText, monthGrid, moveDue, parseMinutes, shiftDates, weekStart } from './task-calendar';

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
  it('starts weeks on Sunday when asked (Q23)', () => {
    const g = monthGrid(2026, 9, 0);
    expect(dayKey(g[0])).toBe('2026-09-27');
    expect(g[0].getDay()).toBe(0);
    expect(dayKey(weekStart(new Date(2026, 9, 11), 0))).toBe('2026-10-11'); // a Sunday starts its own week
    expect(dayKey(weekStart(new Date(2026, 9, 10), 0))).toBe('2026-10-04');
    expect(dayKey(monthGrid(2026, 10, 0)[0])).toBe('2026-11-01'); // November 2026 starts on a Sunday
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
  it('moves a card\'s dates together and reads times people type (M230)', () => {
    const was = new Date(2026, 9, 5, 9).toISOString(), due = new Date(2026, 9, 9, 17).toISOString();
    const m = shiftDates(was, due, 3);
    expect([new Date(m.startAt!).getDate(), new Date(m.dueAt).getDate(), new Date(m.dueAt).getHours()]).toEqual([8, 12, 17]);
    expect(shiftDates(null, due, -2).startAt).toBeNull();
    expect(['1:30', '1h 30m', '90m', '1.5', '45 min', '2 hours', 'soon', ''].map(parseMinutes)).toEqual([90, 90, 90, 90, 45, 120, null, null]);
    expect([hoursText(80), hoursText(45), hoursText(180)]).toEqual(['1 h 20 min', '45 min', '3 h']);
  });
});
