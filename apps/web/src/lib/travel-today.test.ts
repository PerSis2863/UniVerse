import { describe, expect, it } from 'vitest';
import { clock, timetable, tripToday } from './travel-today';
import type { PlanItem, PlanStop } from './travel-plan';

const stop = (id: string, lat: number, lon: number, days: number, position: number): PlanStop => ({ id, guide: id, name: id, cc: 'PT', lat, lon, days, position });
const item = (id: string, stopId: string, day: number | null, position: number, lat: number, lon: number, minutes: number): PlanItem => ({ id, stopId, day, position, name: id, kind: 'see', lat, lon, hours: null, price: null, minutes });
const stops = [stop('lisbon', 38.7139, -9.1394, 3, 0), stop('porto', 41.1496, -8.611, 2, 1)];
const items = [item('tower', 'lisbon', 1, 0, 38.6916, -9.216, 60), item('monastery', 'lisbon', 1, 1, 38.6979, -9.2068, 120), item('castle', 'lisbon', 0, 0, 38.7139, -9.1335, 90)];

describe('Today mode (M239)', () => {
  it('lays a day out from 9:00 with the walk between places', () => {
    const t = timetable(items.slice(0, 2));
    expect(t[0]).toMatchObject({ start: 540, end: 600, travel: 0 });
    expect(t[1].travel).toBeGreaterThan(5);
    expect(t[1].walk).toBe(true);
    expect(t[1].start).toBe(600 + t[1].travel);
  });
  it('finds the city and day in its own time, what is on and when to leave for the next', () => {
    // 10:05 in Lisbon (UTC+1 in April) on the trip's second day.
    const t = tripToday('2027-04-08', stops, items, new Date('2027-04-09T09:05:00Z'));
    expect(t.state).toBe('during');
    if (t.state !== 'during') return;
    expect([t.stop, t.day, t.date, t.zone]).toEqual([0, 1, '2027-04-09', 'Europe/Lisbon']);
    expect(t.current).toBe(-1); // the tower ended at 10:00
    expect(t.next).toBe(1);
    expect(t.leaveAt).toBe(600);
  });
  it('counts the days before and knows when it is over', () => {
    expect(tripToday('2027-04-08', stops, items, new Date('2027-04-01T12:00:00Z'))).toEqual({ state: 'before', days: 7, first: '2027-04-08' });
    expect(tripToday('2027-04-08', stops, items, new Date('2027-05-01T12:00:00Z')).state).toBe('after');
    expect(tripToday(null, stops, items, new Date()).state).toBe('nodates');
    expect(tripToday('2027-04-08', [], [], new Date()).state).toBe('empty');
  });
  it('shows a chosen day as a preview', () => {
    const t = tripToday('2027-04-08', stops, items, new Date('2027-01-01T00:00:00Z'), { stop: 0, day: 0 });
    expect(t.state === 'during' && t.slots.map((s) => s.item.id)).toEqual(['castle']);
    expect(clock(545)).toBe('09:05');
  });
});
