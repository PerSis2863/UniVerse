import { describe, expect, it } from 'vitest';
import { dayText, openState, readHours } from './opening-hours';
import { localClock, sunTimes, zoneAt } from './travel-local';

// M209: a place's own clock, its sunlight and its opening hours.
describe('a place’s clock', () => {
  it('finds the zone in the right country, and the time there', () => {
    expect(zoneAt(38.71, -9.14, 'PT')).toBe('Europe/Lisbon');
    expect(zoneAt(28.1, -15.4, 'ES')).toBe('Atlantic/Canary');
    expect(zoneAt(40.4, -3.7, 'ES')).toBe('Europe/Madrid');
    expect(zoneAt(26.9, 75.8, 'IN')).toBe('Asia/Kolkata');
    const at = new Date('2026-07-15T12:00:00Z');
    expect(localClock('Asia/Kolkata', at)).toEqual({ day: 2, minutes: 17 * 60 + 30, date: '2026-07-15' });
    expect(localClock('Europe/Lisbon', at).minutes).toBe(13 * 60); // summer time
  });
  it('knows sunrise and sunset, and none in the polar night', () => {
    const s = sunTimes(38.71, -9.14, new Date('2026-06-21T12:00:00Z'))!;
    const lisbon = (d: Date) => localClock('Europe/Lisbon', d).minutes;
    expect(Math.abs(lisbon(s.rise) - (6 * 60 + 12))).toBeLessThan(6);
    expect(Math.abs(lisbon(s.set) - (21 * 60 + 5))).toBeLessThan(6);
    expect(s.goldenEvening.getTime()).toBeLessThan(s.set.getTime());
    expect(sunTimes(78.2, 15.6, new Date('2026-12-21T12:00:00Z'))).toBeNull(); // Svalbard
  });
});

describe('opening hours', () => {
  it('reads the common forms and lets a later rule win', () => {
    const h = readHours('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off')!;
    expect(h.sure).toBe(true);
    expect(dayText(h.week, 0)).toBe('09:00–18:00');
    expect(dayText(h.week, 6)).toBe('Closed');
    expect(dayText(readHours('Mo-Su 10:00-20:00; Tu off')!.week, 1)).toBe('Closed');
    expect(dayText(readHours('Mo,We 10:00-12:00,14:00-18:00')!.week, 2)).toBe('10:00–12:00, 14:00–18:00');
    expect(dayText(readHours('24/7')!.week, 3)).toBe('00:00–24:00');
  });
  it('says open, closing time and next opening, past midnight too', () => {
    const late = readHours('Fr-Sa 18:00-02:00')!.week;
    expect(openState(late, 4, 23 * 60)).toEqual({ open: true, until: '02:00' });
    expect(openState(late, 5, 60)).toEqual({ open: true, until: '02:00' }); // Saturday 01:00, from Friday
    expect(openState(late, 0, 12 * 60)).toEqual({ open: false, next: { day: 4, at: '18:00' } });
    const office = readHours('Mo-Fr 09:00-17:00')!.week;
    expect(openState(office, 0, 8 * 60)).toEqual({ open: false, next: { day: 0, at: '09:00' } });
  });
  it('isn’t sure about what it can’t read, and reads nothing from nothing', () => {
    expect(readHours('Mo-Fr 09:00-17:00; Jan-Mar Sa 10:00-12:00')!.sure).toBe(false);
    expect(readHours('sunrise-sunset')).toBeNull();
    expect(readHours('')).toBeNull();
  });
});

describe('the sun’s place', () => {
  it('is high in the south at midday in summer, and below the horizon at night', async () => {
    const { sunPosition } = await import('./travel-local');
    const noon = sunPosition(38.71, -9.14, new Date('2026-06-21T12:38:00Z')); // solar noon in Lisbon (UTC)
    expect(noon.altitude).toBeGreaterThan(70);
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(8);
    expect(sunPosition(38.71, -9.14, new Date('2026-06-21T01:00:00Z')).altitude).toBeLessThan(0);
    expect(Math.abs(sunPosition(38.71, -9.14, new Date('2026-06-21T07:00:00Z')).azimuth - 70)).toBeLessThan(15); // morning, north of east
  });
});
