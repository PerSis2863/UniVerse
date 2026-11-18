import { describe, expect, it } from 'vitest';
import { falling, weeklyRates } from './attendance-trend';

const now = Date.UTC(2026, 10, 18, 12); // a Wednesday
const day = (d: number) => new Date(Date.UTC(2026, 10, 18) - d * 86_400_000);
const rows = (from: number, marks: string[]) => marks.map((status, i) => ({ date: day(from + i), status }));

describe('attendance trends', () => {
  it('counts each week, leaving excused classes out', () => {
    const r = weeklyRates([...rows(0, ['ABSENT', 'PRESENT']), ...rows(7, ['PRESENT', 'EXCUSED', 'LATE'])], 3, now);
    expect(r.map((w) => w.week)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(r.map((w) => w.rate)).toEqual([null, 100, 50]);
    expect(r[1].counted).toBe(2);
  });

  it('sees a fall from the weeks before', () => {
    const steady = weeklyRates([...rows(14, ['PRESENT', 'PRESENT', 'PRESENT']), ...rows(21, ['PRESENT', 'PRESENT', 'PRESENT']), ...rows(7, ['ABSENT', 'ABSENT', 'PRESENT']), ...rows(0, ['ABSENT', 'PRESENT'])], 6, now);
    expect(falling(steady)).toEqual({ from: 100, to: 40 });
    expect(falling(weeklyRates(rows(0, ['ABSENT', 'ABSENT']), 6, now))).toBeNull();
  });
});
