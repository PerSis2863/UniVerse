import { describe, expect, it } from 'vitest';
import { balances, inHalf, leaveUsed, leaveYear, workingDays } from './leave-balance';

describe('staff leave balances (Q22)', () => {
  it('finds the leave year, January or April starts', () => {
    expect(leaveYear('2026-10-20')).toEqual({ from: '2026-01-01', to: '2026-12-31', label: '2026' });
    expect(leaveYear('2026-10-20', 4)).toEqual({ from: '2026-04-01', to: '2027-03-31', label: '2026–27' });
    expect(leaveYear('2027-02-10', 4)).toEqual({ from: '2026-04-01', to: '2027-03-31', label: '2026–27' });
  });
  it('counts working days, half a day for a half-day leave', () => {
    expect(workingDays('2026-10-23', '2026-10-26')).toBe(2); // Friday to Monday
    expect(workingDays('2026-10-24', '2026-10-25')).toBe(0); // a weekend
    expect(workingDays('2026-10-21', '2026-10-21', 'AM')).toBe(0.5);
    expect(workingDays('2026-10-21', '2026-10-20')).toBe(0);
  });
  it('adds up approved and pending leave inside the year only', () => {
    const year = leaveYear('2026-10-20', 4);
    const used = leaveUsed([
      { type: 'SICK', fromDate: '2026-03-30', toDate: '2026-04-02', status: 'APPROVED' }, // only 1–2 April count
      { type: 'SICK', fromDate: '2026-10-21', toDate: '2026-10-21', halfDay: 'PM', status: 'APPROVED' },
      { type: 'PERSONAL', fromDate: '2026-11-02', toDate: '2026-11-06', status: 'PENDING' },
      { type: 'PERSONAL', fromDate: '2026-09-01', toDate: '2026-09-01', status: 'DECLINED' },
    ], year);
    expect(used).toEqual({ SICK: { used: 2.5, pending: 0 }, PERSONAL: { used: 0, pending: 5 } });
  });
  it('gives what is left of each allowance (no limit when there is none)', () => {
    const year = leaveYear('2026-10-20');
    const b = balances({ SICK: 12, PERSONAL: 10 }, [{ type: 'SICK', fromDate: '2026-10-19', toDate: '2026-10-21', status: 'APPROVED' }], year, ['SICK', 'PERSONAL', 'TRAINING']);
    expect(b).toEqual([
      { type: 'SICK', allowance: 12, used: 3, pending: 0, left: 9 },
      { type: 'PERSONAL', allowance: 10, used: 0, pending: 0, left: 10 },
      { type: 'TRAINING', allowance: 0, used: 0, pending: 0, left: null },
    ]);
  });
  it('knows which classes a half-day leave misses', () => {
    expect(inHalf('AM', '09:00')).toBe(true);
    expect(inHalf('AM', '13:00')).toBe(false);
    expect(inHalf('PM', '12:00')).toBe(true);
    expect(inHalf(null, '15:00')).toBe(true);
  });
});
