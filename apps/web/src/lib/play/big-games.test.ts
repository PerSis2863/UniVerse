import { describe, expect, it } from 'vitest';
import { GAMES, GAME_IDS } from '../play';
import { SEA, isLife, isPower, isTrash, oceanMultiplier, oceanPhase, oceanSchedule } from './ocean';
import { CAPACITY, rescuePoints, rescueSchedule, rescueStorm, rescueTown, waterLevel } from './rescue';
import { PIN_TARGETS, kmBetween, pinPoints, pinStreakBonus, pinTarget } from './pin';
import { NITRO_STREAK, PASSAGES, TYPE_CHAR, TYPE_DONE, typingPassage, wpm } from './typing';

describe('UniVerse Play, the bigger games', () => {
  it('lists twelve games: two per app and four 3D worlds', () => {
    expect(GAME_IDS.length).toBe(12);
    for (const app of ['campus', 'trace', 'relief', 'green']) expect(GAME_IDS.filter((g) => GAMES[g].app === app).length).toBe(2);
    expect(GAME_IDS.filter((g) => GAMES[g].world).length).toBe(4);
  });
  it('drifts the same sea for everyone, and a perfect cleanup stays under the cap', () => {
    const s = oceanSchedule(3, GAMES.ocean.seconds);
    expect(s).toEqual(oceanSchedule(3, GAMES.ocean.seconds));
    expect(s.length).toBeGreaterThan(80);
    expect(s.some((d) => isLife(d.kind)) && s.some((d) => d.kind === 'net')).toBe(true);
    expect(s.every((d) => d.x > 0 && d.x < 1 && d.at < GAMES.ocean.seconds * 1000)).toBe(true);
    expect(s.some((d) => isPower(d.kind)) && s.some((d) => d.kind === 'oil')).toBe(true);
    expect(s.every((d, k) => k === 0 || s[k - 1].at <= d.at)).toBe(true);
    expect([oceanPhase(0, 90), oceanPhase(40_000, 90), oceanPhase(80_000, 90)]).toEqual([0, 1, 2]);
    // Even every piece with the full combo, all boosted (double), stays under the cap.
    for (const seed of [1, 2, 3, 4, 5]) {
      const best = oceanSchedule(seed, GAMES.ocean.seconds).filter((d) => isTrash(d.kind)).reduce((n, d, k) => n + Math.round(SEA[d.kind].pts * oceanMultiplier(k)) * 2, 0);
      expect(best).toBeLessThanOrEqual(GAMES.ocean.maxScore);
    }
  });
  it('floods the town from the bottom up and never strands people on a roof that floods first', () => {
    const roofs = rescueTown(8);
    expect(roofs).toHaveLength(7);
    expect(waterLevel(0, 120)).toBeGreaterThan(waterLevel(120_000, 120));
    const s = rescueSchedule(8, GAMES.rescue.seconds, roofs);
    expect(s.length).toBeGreaterThan(25);
    for (const p of s) expect(roofs[p.roof].top).toBeLessThan(waterLevel(p.at + p.ttl, GAMES.rescue.seconds));
    expect(s.reduce((a, p) => a + rescuePoints(0, 1, p.pet), 0)).toBeLessThanOrEqual(GAMES.rescue.maxScore);
    expect(rescuePoints(0, 1, true)).toBe(200);
    const storm = rescueStorm(8, GAMES.rescue.seconds, roofs);
    expect(storm.strikes.length).toBeGreaterThan(3);
    expect(storm.gusts.length).toBeGreaterThan(1);
    expect(storm.strikes.every((x) => x.roof >= 0 && x.roof < roofs.length && x.at < GAMES.rescue.seconds * 1000)).toBe(true);
    expect(CAPACITY).toBe(4);
  });
  it('pins fifteen different cities and scores by distance', () => {
    const names = Array.from({ length: PIN_TARGETS }, (_, i) => pinTarget(4, i).name);
    expect(new Set(names).size).toBe(PIN_TARGETS);
    expect(Math.round(kmBetween({ lat: 51.51, lng: -0.13 }, { lat: 48.86, lng: 2.35 }))).toBeGreaterThan(330);
    expect(pinPoints(10, 8000)).toBe(1200);
    expect(pinPoints(3500, 8000)).toBe(0);
    expect(pinPoints(1500, 0)).toBe(500);
    expect(PIN_TARGETS * (pinPoints(0, 8000) + pinStreakBonus(99))).toBeLessThanOrEqual(GAMES.pin.maxScore);
    expect(pinStreakBonus(2)).toBe(120);
  });
  it('types real facts, and even a world-record typist stays under the cap', () => {
    expect(typingPassage(5, 2)).toBe(typingPassage(5, 2));
    expect(PASSAGES.every((p) => p.length >= 60 && p.length <= 140)).toBe(true);
    expect(wpm(250, 60_000)).toBe(50);
    const chars = (220 * 5 * GAMES.type.seconds) / 60; // 220 words a minute
    // Nitro doubles letters typed after each streak: count them all double.
    expect(chars * TYPE_CHAR * 2 + Math.ceil(chars / 60) * TYPE_DONE).toBeLessThanOrEqual(GAMES.type.maxScore);
    expect(NITRO_STREAK).toBeGreaterThan(5);
  });
});
