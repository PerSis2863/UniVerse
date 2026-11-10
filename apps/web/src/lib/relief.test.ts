import { describe, expect, it } from 'vitest';
import { freshness, rankPlaces } from './relief';

describe('rankPlaces (M148)', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const near = { id: 'near', lat: 13.08, lng: 80.27, openNow: true, statusAt: at(1) };
  const far = { id: 'far', lat: 13.5, lng: 80.5, openNow: true, statusAt: at(0.5) };
  const shut = { id: 'shut', lat: 13.08, lng: 80.27, openNow: false, statusAt: at(1) };
  const stale = { id: 'stale', lat: 13.08, lng: 80.28, openNow: true, statusAt: at(30) };
  it('puts open places that spoke today first, nearest first, then stale, then closed', () => {
    expect(rankPlaces([shut, stale, far, near], { lat: 13.08, lng: 80.27 }, now).map((p) => p.id)).toEqual(['near', 'far', 'stale', 'shut']);
  });
  it('without a position, the newest word first', () => {
    expect(rankPlaces([near, far], null, now).map((p) => p.id)).toEqual(['far', 'near']);
    expect(freshness(at(2), now)).toBe('fresh');
    expect(freshness(at(10), now)).toBe('today');
    expect(freshness(at(30), now)).toBe('old');
  });
});
