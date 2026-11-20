import { describe, expect, it } from 'vitest';
import { repeatDates } from './meeting-repeat';

const day = (d: Date) => d.toISOString().slice(0, 10);
describe('repeatDates', () => {
  const start = new Date('2026-11-20T09:00:00Z'); // a Friday
  it('repeats weekly, every 2 weeks and monthly at the same time', () => {
    expect(repeatDates(start, 'weekly', 3).map(day)).toEqual(['2026-11-20', '2026-11-27', '2026-12-04']);
    expect(repeatDates(start, 'biweekly', 2).map(day)).toEqual(['2026-11-20', '2026-12-04']);
    expect(repeatDates(start, 'monthly', 2).map((d) => d.toISOString())).toEqual(['2026-11-20T09:00:00.000Z', '2026-12-20T09:00:00.000Z']);
  });
  it('skips weekends for weekdays, and stops at ten', () => {
    expect(repeatDates(start, 'weekdays', 3).map(day)).toEqual(['2026-11-20', '2026-11-23', '2026-11-24']);
    expect(repeatDates(start, 'daily', 50)).toHaveLength(10);
    expect(repeatDates(start, 'daily', 0)).toHaveLength(1);
  });
});
