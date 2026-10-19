import { describe, expect, it } from 'vitest';
import { cleanPan, cleanReg80G, donationMinor, milestonesDue, offers80G, receiptLabel } from './global-impact';
import { carbonSummary, kgFor } from './carbon';

describe('donations', () => {
  it('takes gifts within the limits, in minor units', () => {
    expect(donationMinor(500, 'INR')).toBe(50_000);
    expect(donationMinor('1,000', 'INR')).toBe(100_000);
    expect(donationMinor(9, 'INR')).toBe(null);
    expect(donationMinor(10.5, 'USD')).toBe(1050);
    expect(donationMinor(20_000, 'USD')).toBe(null);
    expect(donationMinor('abc', 'EUR')).toBe(null);
  });
  it('checks Indian tax details for 80G receipts', () => {
    expect(cleanPan(' abcde1234f ')).toBe('ABCDE1234F');
    expect(cleanPan('ABCD1234F')).toBe(null);
    expect(cleanReg80G('AAATA1234AF20214')).toBe('AAATA1234AF20214');
    expect(cleanReg80G('<script>')).toBe(null);
    expect(offers80G('INR', { reg80G: 'AAATA1234AF20214', pan: 'AAATA1234A' })).toBe(true);
    expect(offers80G('USD', { reg80G: 'AAATA1234AF20214', pan: 'AAATA1234A' })).toBe(false);
    expect(offers80G('INR', { reg80G: null, pan: 'AAATA1234A' })).toBe(false);
    expect(receiptLabel(42)).toBe('D-000042');
  });
});

describe('volunteering milestones', () => {
  it('issues each milestone once', () => {
    expect(milestonesDue(9.9, [])).toEqual([]);
    expect(milestonesDue(12, [])).toEqual([10]);
    expect(milestonesDue(120, [10])).toEqual([50, 100]);
    expect(milestonesDue(120, [10, 50, 100])).toEqual([]);
  });
});

describe('carbon tracker', () => {
  it('works out kg CO2e from standard factors', () => {
    expect(kgFor('car-petrol', 100)).toBe(16);
    expect(kgFor('electricity', 50)).toBe(36);
    expect(kgFor('nope', 5)).toBe(null);
    expect(kgFor('bus', -1)).toBe(null);
  });
  it('keeps savings apart from emissions', () => {
    const s = carbonSummary([
      { activity: 'car-petrol', kgCo2e: 16, occurredAt: '2026-10-02' },
      { activity: 'walk-cycle', kgCo2e: 3.2, occurredAt: '2026-10-05' },
      { activity: 'electricity', kgCo2e: 36, occurredAt: '2026-09-20' },
    ]);
    expect(s.emitted).toBe(52);
    expect(s.saved).toBe(3.2);
    expect(s.byMonth[0]).toEqual({ month: '2026-10', emitted: 16, saved: 3.2 });
    expect(s.byActivity[0].key).toBe('electricity');
  });
});
