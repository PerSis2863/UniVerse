import { describe, expect, it } from 'vitest';
import { dayBefore, dayIn, lastWeek, timeZoneOf } from './study-days';
import { describeDevice } from './device-name';
import { levelInfo } from './impact-level';

describe('study days (shared by the Next.js routes and the light API path)', () => {
  const lateEvening = new Date('2026-10-14T23:30:00Z');
  it('counts the day in the student’s own time zone', () => {
    expect(dayIn('UTC', lateEvening)).toBe('2026-10-14');
    expect(dayIn('Asia/Kolkata', lateEvening)).toBe('2026-10-15');
    expect(dayIn('America/Chicago', lateEvening)).toBe('2026-10-14');
    expect(dayIn(undefined, lateEvening)).toBe('2026-10-14');
    expect(dayIn('Not/AZone', lateEvening)).toBe('2026-10-14');
  });
  it('goes back across months and years', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });
  it('lists the 7 days ending today, oldest first', () => {
    expect(lastWeek('2026-10-02')).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
  it('reads the time zone Cloudflare puts on the request', () => {
    const req = Object.assign(new Request('https://x.test'), { cf: { timezone: 'Europe/Paris' } });
    expect(timeZoneOf(req)).toBe('Europe/Paris');
    expect(timeZoneOf(new Request('https://x.test'))).toBeUndefined();
  });
});

describe('device names and impact levels', () => {
  it('names the browser and system', () => {
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(describeDevice('curl/8.0')).toBe('Unknown device');
    expect(describeDevice(null)).toBeNull();
  });
  it('places points on the level ladder', () => {
    expect(levelInfo(0)).toMatchObject({ current: { level: 1 }, next: { level: 2 }, progress: 0 });
    expect(levelInfo(810)).toMatchObject({ current: { level: 4 }, next: { level: 5 }, progress: 53 });
    expect(levelInfo(9000)).toMatchObject({ current: { level: 7 }, next: null, progress: 100 });
  });
});
