import { describe, expect, it } from 'vitest';
import { aidCodeOf, aidMayMove, freshness, rankPlaces, whoToAlert } from './relief';

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

describe('whoToAlert (M149)', () => {
  const at = { lat: 13.08, lng: 80.27 };
  const w = (userId: string, o: Partial<{ radiusKm: number; urgentOnly: boolean; kinds: string | null; skills: string | null; lat: number }> = {}) => ({ userId, ...at, radiusKm: 5, urgentOnly: true, kinds: null, skills: null, ...o });
  const post = { userId: 'asker', kind: 'MEDICAL', urgency: 'MEDIUM', skill: 'FIRST_AID', ...at };
  it('tells helpers with the skill even when they asked for urgent needs or other kinds only; others as before', () => {
    const got = whoToAlert([
      w('medic', { skills: 'FIRST_AID,DRIVING', kinds: 'FOOD' }), // their skill wins over their filters
      w('cook', { skills: 'COOKING' }),                             // urgent only, not urgent: no
      w('anyone', { urgentOnly: false }),                           // all needs: yes, as an "other"
      w('far medic', { skills: 'FIRST_AID', lat: 14 }),             // out of their radius: no
      w('asker', { skills: 'FIRST_AID' }),                          // never the person who asked
    ], post);
    expect(got).toEqual({ skilled: ['medic'], others: ['anyone'] });
  });
  it('without a skill, only the usual filters', () => {
    expect(whoToAlert([w('a', { skills: 'FIRST_AID' }), w('b', { urgentOnly: false })], { ...post, skill: null, urgency: 'CRITICAL' })).toEqual({ skilled: [], others: ['a', 'b'] });
  });
});

describe('aid boxes (M151)', () => {
  it('moves forward only, with as many stops on the way as needed', () => {
    expect(aidMayMove('PACKED', 'ON_THE_WAY')).toBe(true);
    expect(aidMayMove('ON_THE_WAY', 'ON_THE_WAY')).toBe(true);
    expect(aidMayMove('PACKED', 'DELIVERED')).toBe(true);
    expect(aidMayMove('ON_THE_WAY', 'PACKED')).toBe(false);
    expect(aidMayMove('DELIVERED', 'ON_THE_WAY')).toBe(false);
    expect(aidMayMove('PACKED', 'LOST')).toBe(false);
  });
  it('reads a typed code', () => expect(aidCodeOf(' ab-cd 23x/')).toBe('ABCD23X'));
});
