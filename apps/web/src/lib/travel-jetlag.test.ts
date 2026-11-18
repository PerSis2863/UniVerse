import { describe, expect, it } from 'vitest';
import { isZone, jetLagPlan, shiftHours, zoneOffset } from './travel-jetlag';

const april = new Date('2027-04-08T12:00:00Z');

describe('jet-lag planner (M244)', () => {
  it('reads zones and their offsets, summer time included', () => {
    expect(isZone('Asia/Kolkata')).toBe(true);
    expect(isZone('Nowhere/Land')).toBe(false);
    expect(isZone('<script>')).toBe(false);
    expect(zoneOffset('Asia/Kolkata', april)).toBe(330);
    expect(zoneOffset('America/New_York', april)).toBe(-240);
    expect(shiftHours('Europe/London', 'Asia/Tokyo', april)).toBe(8);
    expect(shiftHours('Asia/Tokyo', 'America/Los_Angeles', april)).toBe(8); // 16 h west is 8 h east: the short way round
  });
  it('shifts sleep earlier before going east, then seeks morning light there', () => {
    const p = jetLagPlan('Europe/London', 'Asia/Kolkata', april);
    expect(p).toMatchObject({ shift: 4.5, east: true, mild: false, adapt: 5 });
    expect(p.days.slice(0, 3).map((d) => d.bed)).toEqual([22 * 60, 21 * 60, 20 * 60]);
    const first = p.days.find((d) => d.day === 1)!;
    expect(first.seek).toEqual([7 * 60, 10 * 60]);
    expect(first.avoid).toEqual([20 * 60, 23 * 60]);
  });
  it('goes later before going west and seeks evening light there; a short hop needs nothing', () => {
    const p = jetLagPlan('Europe/Paris', 'America/New_York', april);
    expect(p).toMatchObject({ shift: -6, east: false, adapt: 4 });
    expect(p.days[0].bed).toBe(0); // midnight
    expect(p.days.find((d) => d.day === 1)!.seek).toEqual([18 * 60, 21 * 60]);
    expect(jetLagPlan('Europe/London', 'Europe/Lisbon', april)).toMatchObject({ mild: true, days: [{ day: 0 }] });
  });
  it('keeps the first mornings dim on a very long eastward trip', () => {
    const p = jetLagPlan('Europe/London', 'Australia/Sydney', april);
    expect(p.shift).toBe(9);
    const first = p.days.find((d) => d.day === 1)!, third = p.days.find((d) => d.day === 3)!;
    expect(first.avoid).toEqual([7 * 60, 10 * 60]);
    expect(first.seek).toEqual([11 * 60, 14 * 60]);
    expect(third.seek).toEqual([7 * 60, 10 * 60]);
  });
});
