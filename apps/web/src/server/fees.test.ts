import { describe, expect, it } from 'vitest';
import { outstanding, parseInstalments, parseItems, split, statusOf, toMinor } from './fees';

describe('fee amounts', () => {
  it('reads amounts as whole minor units', () => {
    expect(toMinor('1250')).toBe(125000);
    expect(toMinor('1,250.50')).toBe(125050);
    expect(toMinor(0.1 + 0.2)).toBe(30); // no floating-point drift
    expect(toMinor('-5')).toBeNull();
    expect(toMinor('abc')).toBeNull();
    expect(toMinor('')).toBeNull();
    expect(toMinor(1e9)).toBeNull(); // over the cap
  });
  it('splits a total into instalments that add up exactly', () => {
    expect(split(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(split(100000, 4)).toEqual([25000, 25000, 25000, 25000]);
    for (const n of [1, 5, 7, 12]) expect(split(1234567, n).reduce((a, b) => a + b, 0)).toBe(1234567);
  });
});

describe('bill status', () => {
  it('follows what has been paid against the bill after its discount', () => {
    expect(statusOf({ amount: 1000, discount: 0, paid: 0 })).toBe('DUE');
    expect(statusOf({ amount: 1000, discount: 0, paid: 400 })).toBe('PARTIAL');
    expect(statusOf({ amount: 1000, discount: 200, paid: 800 })).toBe('PAID');
    expect(statusOf({ amount: 1000, discount: 1000, paid: 0 })).toBe('PAID');
  });
  it('keeps waived and cancelled bills as they are', () => {
    expect(statusOf({ amount: 1000, discount: 0, paid: 0, status: 'WAIVED' })).toBe('WAIVED');
    expect(statusOf({ amount: 1000, discount: 0, paid: 1000, status: 'CANCELLED' })).toBe('CANCELLED');
  });
  it('owes nothing once paid, waived or cancelled', () => {
    expect(outstanding({ amount: 1000, discount: 100, paid: 300, status: 'PARTIAL' })).toBe(600);
    expect(outstanding({ amount: 1000, discount: 0, paid: 0, status: 'WAIVED' })).toBe(0);
    expect(outstanding({ amount: 1000, discount: 0, paid: 1000, status: 'PAID' })).toBe(0);
  });
});

describe('fee plans', () => {
  it('needs named items with amounts', () => {
    expect(parseItems([{ label: ' Tuition ', amount: '12000' }, { label: 'Books', amount: 1500.5 }])).toEqual([{ label: 'Tuition', amount: 1200000 }, { label: 'Books', amount: 150050 }]);
    expect(() => parseItems([])).toThrow();
    expect(() => parseItems([{ label: '', amount: 5 }])).toThrow();
    expect(() => parseItems([{ label: 'Tuition', amount: 0 }])).toThrow();
  });
  const now = new Date('2026-10-09T12:00:00Z').getTime();
  it('splits the total over the due dates, in date order', () => {
    const r = parseInstalments([{ dueAt: '2027-01-10' }, { dueAt: '2026-11-10' }], 100001, now);
    expect(r.map((x) => x.dueAt.slice(0, 10))).toEqual(['2026-11-10', '2027-01-10']);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100001);
    expect(r[0].label).toBe('Instalment 2');
  });
  it('uses given amounts only when they add up to the total', () => {
    expect(parseInstalments([{ dueAt: '2026-11-10', amount: 300 }, { dueAt: '2026-12-10', amount: 700 }], 100000, now).map((x) => x.amount)).toEqual([30000, 70000]);
    expect(parseInstalments([{ dueAt: '2026-11-10', amount: 300 }, { dueAt: '2026-12-10', amount: 600 }], 100000, now).map((x) => x.amount)).toEqual([50000, 50000]);
  });
  it('refuses missing or very old dates', () => {
    expect(() => parseInstalments([{ dueAt: '' }], 1000, now)).toThrow();
    expect(() => parseInstalments([{ dueAt: '2024-01-01' }], 1000, now)).toThrow();
    expect(() => parseInstalments(Array.from({ length: 13 }, () => ({ dueAt: '2026-12-01' })), 1000, now)).toThrow();
  });
  it('names a single instalment “Full amount”', () => expect(parseInstalments([{ dueAt: '2026-11-10' }], 1000, now)[0].label).toBe('Full amount'));
});
