import { describe, expect, it } from 'vitest';
import { BADGES, co2For, streak, weeklyChallenge } from './green';
import { needScore, snap } from './relief';

describe('green', () => {
  it('turns actions into CO2', () => {
    expect(co2For('TREE', 3)).toBe(66);
    expect(co2For('CYCLE', 18)).toBe(3.6);
  });
  it('counts a streak up to today or yesterday', () => {
    expect(streak(['2026-10-22', '2026-10-23', '2026-10-24'], '2026-10-24')).toBe(3);
    expect(streak(['2026-10-22', '2026-10-23'], '2026-10-24')).toBe(2);
    expect(streak(['2026-10-20'], '2026-10-24')).toBe(0);
  });
  it('awards badges', () => {
    const earned = BADGES.filter((b) => b.earned({ actions: 12, kg: 150, byKind: { TREE: 5 }, streak: 2 })).map((b) => b.id);
    expect(earned).toEqual(['first', 'ten', 'hundred-kg', 'trees']);
  });
  it('changes the challenge every Monday', () => {
    const mon = Date.UTC(2026, 9, 19), sun = Date.UTC(2026, 9, 25, 20), next = Date.UTC(2026, 9, 26, 1);
    expect(weeklyChallenge(mon).title).toBe(weeklyChallenge(sun).title);
    expect(weeklyChallenge(next).title).not.toBe(weeklyChallenge(mon).title);
  });
});

describe('relief', () => {
  it('rounds positions to about 500 m', () => {
    expect(snap(48.85661)).toBeCloseTo(48.855, 5);
  });
  it('puts urgent and near needs first', () => {
    const now = Date.now(), here = { lat: 0, lng: 0 };
    const critical = needScore({ urgency: 'CRITICAL', lat: 0.5, lng: 0, createdAt: new Date(now) }, here, now);
    const low = needScore({ urgency: 'LOW', lat: 0, lng: 0, createdAt: new Date(now) }, here, now);
    expect(critical).toBeGreaterThan(low);
  });
});
