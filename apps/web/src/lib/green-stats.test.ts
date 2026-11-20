import { describe, expect, it } from 'vitest';
import { actionsCsv, change, monthKg, months } from './green-stats';

const now = Date.parse('2026-11-20T12:00:00Z');
const year = { '2026-11-01': 2, '2026-11-19': 3.5, '2026-10-05': 4, '2026-09-30': 1 };

describe('Green home numbers (M359)', () => {
  it('adds up a month and compares it with the one before', () => {
    expect(monthKg(year, now)).toBe(5.5);
    expect(monthKg(year, now, -1)).toBe(4);
    expect(change(5.5, 4)).toBe(38);
    expect(change(3, 0)).toBeNull();
  });
  it('lists the last months oldest first', () => {
    const m = months(year, now, 3);
    expect(m.map((x) => x.kg)).toEqual([1, 4, 5.5]);
  });
  it('writes a spreadsheet with quoted notes', () => {
    const csv = actionsCsv([{ createdAt: '2026-11-19T08:00:00Z', kind: 'CYCLE', amount: 5, units: 'km', co2Kg: 1, note: 'To work, and back', verifiedAt: null }]);
    expect(csv.split('\n')[1]).toBe('2026-11-19,CYCLE,5,km,1,"To work, and back",no');
  });
});
