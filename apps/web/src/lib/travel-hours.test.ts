import { describe, expect, it } from 'vitest';
import { hoursProblem, tripHoursIssues, weekOf } from './travel-hours';

describe('opening-hours check (M251)', () => {
  it('reads guides’ words and OSM’s format', () => {
    expect(weekOf('10:00–18:30')![0]).toEqual([[600, 1110]]);
    expect(weekOf('9AM-5PM, closed Mondays')!.map((d) => d.length)).toEqual([0, 1, 1, 1, 1, 1, 1]);
    expect(weekOf('Tu-Su 10:00-18:00')![0]).toEqual([]);
    expect(weekOf('Tu-Su 10:00-18:00')![1]).toEqual([[600, 1080]]);
    expect(weekOf('Mo-Fr 09:00-17:00; Sa-Su off')![5]).toEqual([]);
    expect(weekOf('daily 10.00 to 22.00')![3]).toEqual([[600, 1320]]);
    expect(weekOf('Varies with the season')).toBeNull();
    expect(weekOf('1-2 hours')).toBeNull();
  });
  it('says whether you’ll find it open', () => {
    const w = weekOf('Tu-Su 10:00-18:00');
    expect(hoursProblem(w, 0, 600, 660)).toBe('closed');
    expect(hoursProblem(w, 1, 540, 600)).toBe('opens later');
    expect(hoursProblem(w, 1, 1020, 1110)).toBe('closes before you leave');
    expect(hoursProblem(w, 1, 1140, 1200)).toBe('closed');
    expect(hoursProblem(w, 1, 660, 720)).toBeNull();
    expect(hoursProblem(null, 1, 660, 720)).toBeNull();
  });
  it('finds the trip’s planned places that will be closed', () => {
    const stops = [{ id: 's1', guide: 'Lisbon', name: 'Lisbon', cc: 'PT', lat: 38.7, lon: -9.1, days: 2, position: 0 }];
    const item = (id: string, day: number, hours: string) => ({ id, stopId: 's1', day, position: 0, name: id, kind: 'see', lat: null, lon: null, hours, price: null, minutes: 60 });
    // 2027-04-12 is a Monday: the trip's first day.
    const issues = tripHoursIssues('2027-04-12', stops, [item('Tile Museum', 0, 'Tu-Su 10:00-18:00'), item('Castle', 1, '09:00-21:00')]);
    expect(issues.map((x) => [x.item.name, x.date, x.problem])).toEqual([['Tile Museum', '2027-04-12', 'closed']]);
  });
});
