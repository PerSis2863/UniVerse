import { describe, expect, it } from 'vitest';
import { hoursText, inHours, parseDays, type ContactHours } from './parent-hours';

const h = (over: Partial<ContactHours> = {}): ContactHours => ({ open: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '16:00', timeZone: 'Asia/Kolkata', ...over });

describe('parent contact hours', () => {
  it('is open on a weekday during the hours, in the teacher’s time zone', () => {
    // Wednesday 8 Oct 2026, 05:00 UTC = 10:30 in India.
    expect(inHours(h(), new Date('2026-10-07T05:00:00Z'))).toBe(true);
  });
  it('is closed before and after the hours', () => {
    expect(inHours(h(), new Date('2026-10-07T01:00:00Z'))).toBe(false); // 06:30 India
    expect(inHours(h(), new Date('2026-10-07T11:00:00Z'))).toBe(false); // 16:30 India
  });
  it('is closed at the weekend', () => {
    expect(inHours(h(), new Date('2026-10-10T05:00:00Z'))).toBe(false); // Saturday
  });
  it('is closed when the teacher isn’t taking messages', () => {
    expect(inHours(h({ open: false }), new Date('2026-10-07T05:00:00Z'))).toBe(false);
  });
  it('handles hours that cross midnight', () => {
    const night = h({ start: '20:00', end: '02:00', days: [0, 1, 2, 3, 4, 5, 6], timeZone: 'UTC' });
    expect(inHours(night, new Date('2026-10-07T23:00:00Z'))).toBe(true);
    expect(inHours(night, new Date('2026-10-07T12:00:00Z'))).toBe(false);
  });
  it('says the days simply', () => {
    expect(hoursText(h())).toBe('Mon–Fri, 08:00–16:00');
    expect(hoursText(h({ days: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Every day, 08:00–16:00');
    expect(hoursText(h({ days: [1, 3, 5] }))).toBe('Mon, Wed, Fri, 08:00–16:00');
    expect(hoursText(h({ open: false }))).toBe('Not taking parent messages right now');
  });
  it('reads days safely', () => {
    expect(parseDays('5,1,1,9,x,0')).toEqual([0, 1, 5]);
    expect(parseDays('')).toEqual([]);
  });
});
