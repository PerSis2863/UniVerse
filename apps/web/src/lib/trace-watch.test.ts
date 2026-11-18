import { describe, expect, it } from 'vitest';
import { areaOf, cleanWatch, mayTell, prune } from './trace-watch';

describe('area alerts for copies', () => {
  it('keeps a sensible watch', () => {
    expect(cleanWatch({ countries: ['fr', 'FR', 'France', 'de'], threshold: 4, anywhere: false })).toEqual({ countries: ['FR', 'DE'], threshold: 3, anywhere: false });
    expect(cleanWatch('{"threshold":10}')).toEqual({ countries: [], threshold: 10, anywhere: true });
  });
  it('names the area: a watched country, else the 0.5° cell', () => {
    const w = cleanWatch({ countries: ['IN'] });
    expect(areaOf(w, { country: 'in', lat: 19.07, lng: 72.87 })).toBe('c:IN');
    expect(areaOf(w, { country: 'NG', lat: 6.52, lng: -3.38 })).toBe('g:6.5,-3.5');
    expect(areaOf({ ...w, anywhere: false }, { country: 'NG', lat: 6.5, lng: 3.3 })).toBeNull();
  });
  it('tells an area once a day and forgets old ones', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(mayTell({ 'c:IN': '2026-11-18T01:00:00Z' }, 'c:IN', now)).toBe(false);
    expect(mayTell({ 'c:IN': '2026-11-17T01:00:00Z' }, 'c:IN', now)).toBe(true);
    expect(prune({ a: '2026-11-18T01:00:00Z', b: '2026-11-15T01:00:00Z' }, now)).toEqual({ a: '2026-11-18T01:00:00Z' });
  });
});
