import { describe, expect, it } from 'vitest';
import { attendedRate, cleanPosition, cleanSeating, distanceM, isChronic, nearCampus, suggestFromCall } from './attendance-rules';

describe('attendance rules', () => {
  it('reads a class call: present from the threshold, late from a quarter, else absent', () => {
    expect(suggestFromCall(2800, 3600)).toBe('PRESENT');
    expect(suggestFromCall(1200, 3600)).toBe('LATE');
    expect(suggestFromCall(300, 3600)).toBe('ABSENT');
    expect(suggestFromCall(0, 3600)).toBe('ABSENT');
    expect(suggestFromCall(2000, 3600, 0.5)).toBe('PRESENT');
    expect(suggestFromCall(100, 0)).toBe('ABSENT');
  });
  it('spots frequent absence', () => {
    expect(isChronic(['ABSENT', 'ABSENT', 'EXCUSED', 'ABSENT', 'PRESENT'])).toBe(true); // last three counted days
    expect(isChronic(['PRESENT', 'ABSENT', 'PRESENT', 'ABSENT', 'PRESENT', 'PRESENT'])).toBe(true); // 4 of 6
    expect(isChronic(['PRESENT', 'LATE', 'PRESENT', 'ABSENT', 'PRESENT'])).toBe(false); // 80 %
    expect(isChronic(['ABSENT', 'ABSENT'])).toBe(false); // too few days
    expect(attendedRate(['PRESENT', 'EXCUSED', 'ABSENT', 'LATE'])).toEqual({ attended: 2, counted: 3, rate: 2 / 3 });
  });
  it('checks a phone is on campus, allowing for its own uncertainty', () => {
    const campus = { lat: 12.9716, lng: 77.5946, radius: 300 };
    expect(Math.round(distanceM({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9806, lng: 77.5946 }))).toBe(1001);
    expect(nearCampus({ lat: 12.9735, lng: 77.5946, accuracy: 20 }, campus)).toBe(true); // ~211 m
    expect(nearCampus({ lat: 12.9752, lng: 77.5946, accuracy: 20 }, campus)).toBe(false); // ~400 m
    expect(nearCampus({ lat: 12.9752, lng: 77.5946, accuracy: 400 }, campus)).toBe(true); // 300 + up to 150
    expect(cleanPosition({ lat: 'x', lng: 1 })).toBeNull();
    expect(cleanPosition({ lat: 12, lng: 77 })).toEqual({ lat: 12, lng: 77, accuracy: 50 });
  });
  it('keeps a seating chart sensible', () => {
    const s = cleanSeating({ rows: 2, cols: 3, seats: { '0-0': 'a', '0-1': 'a', '1-2': 'b', '2-0': 'c', 'x': 'd', '1-1': 'z' } }, new Set(['a', 'b', 'c']));
    expect(s).toEqual({ rows: 2, cols: 3, seats: { '0-0': 'a', '1-2': 'b' } });
    expect(cleanSeating('nonsense')).toEqual({ rows: 5, cols: 6, seats: {} });
  });
});
