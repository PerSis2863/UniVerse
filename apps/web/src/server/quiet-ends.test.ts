import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));
const { quietEndAt } = await import('./quiet-hours');

// M340: "send at their morning" needs the moment someone's quiet hours end, in their own time zone.
describe('quietEndAt', () => {
  it('finds the next end in their zone', () => {
    // 23:30 in Kolkata (18:00 UTC) with quiet hours 22:00–07:00: ends 07:00 there = 01:30 UTC next day.
    expect(quietEndAt({ start: '22:00', end: '07:00', timeZone: 'Asia/Kolkata' }, new Date('2026-11-19T18:00:00Z'))).toBe('2026-11-20T01:30:00.000Z');
  });
  it('is null outside quiet hours', () => {
    expect(quietEndAt({ start: '22:00', end: '07:00', timeZone: 'UTC' }, new Date('2026-11-19T12:00:00Z'))).toBeNull();
  });
});
