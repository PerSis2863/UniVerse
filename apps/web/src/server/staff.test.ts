import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, eachDay, isDay, overlaps, weekday } from './staff';

describe('calendar days for leave and cover', () => {
  it('accepts only real days', () => {
    expect(isDay('2026-10-14')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-10-14T00:00')).toBe(false);
    expect(isDay(20261014)).toBe(false);
  });
  it('counts across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-14', '2026-10-17')).toBe(3);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([]);
  });
  it('numbers weekdays like the timetable (Monday 0 … Sunday 6)', () => {
    expect(weekday('2026-10-12')).toBe(0); // a Monday
    expect(weekday('2026-10-14')).toBe(2);
    expect(weekday('2026-10-18')).toBe(6); // a Sunday
  });
  it('spots class times that overlap (touching ends don’t)', () => {
    expect(overlaps({ start: '09:00', end: '10:30' }, { start: '10:00', end: '11:00' })).toBe(true);
    expect(overlaps({ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' })).toBe(false);
    expect(overlaps({ start: '09:00', end: '12:00' }, { start: '10:00', end: '11:00' })).toBe(true);
  });
});
