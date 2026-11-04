import { describe, expect, it } from 'vitest';
import { GAMES, GAME_IDS } from '../play';
import { SEA, isLife, isPower, isTrash, oceanMultiplier, oceanPhase, oceanSchedule } from './ocean';
import { CAPACITY, rescuePoints, rescueSchedule, rescueStorm, rescueTown, waterLevel } from './rescue';
import { PIN_TARGETS, kmBetween, pinPoints, pinRegion, pinStreakBonus, pinTarget } from './pin';
import { QUIZ_BOSS_MULT, quizBoss, quizPoints } from './quiz';
import { NITRO_STREAK, PASSAGES, TYPE_CHAR, TYPE_DONE, typingPassage, wpm } from './typing';
import { FIRE_COLS, FIRE_OUT, FIRE_ROWS, FOREST, MEADOW, ROCK, VILLAGE, WATER, dropCells, fireFinal, fireMap, fireTick, igniteChance } from './wildfire';
import { REEF_HALF, REEF_LITTER, REEF_NETS, REEF_SPOTS, jellyAt, reefBest, reefLayout } from './reef';

describe('UniVerse Play, the bigger games', () => {
  it('lists thirteen games: two or three per app and four 3D worlds (M105)', () => {
    expect(GAME_IDS.length).toBe(13);
    for (const app of ['campus', 'trace']) expect(GAME_IDS.filter((g) => GAMES[g].app === app).length).toBe(2);
    for (const app of ['relief', 'green']) expect(GAME_IDS.filter((g) => GAMES[g].app === app).length).toBe(3);
    expect(GAME_IDS.filter((g) => GAMES[g].world).length).toBe(4);
  });
  it('gives everyone the same valley, spreads fire downwind, and keeps a perfect Fire Line under the cap', () => {
    const m = fireMap(5, GAMES.fire.seconds);
    expect(m).toEqual(fireMap(5, GAMES.fire.seconds));
    expect(m.cells).toHaveLength(FIRE_COLS * FIRE_ROWS);
    expect(m.villages).toHaveLength(3);
    expect(m.strikes.length).toBeGreaterThan(5);
    expect(m.strikes.every((s) => m.cells[s.cell] === FOREST)).toBe(true);
    expect(m.winds[0].at).toBe(0);
    // Downwind catches far more often than upwind; rock and water never.
    expect(igniteChance(FOREST, 1, 0, 0)).toBeGreaterThan(igniteChance(FOREST, -1, 0, 0) * 3);
    expect(igniteChance(ROCK, 1, 0, 0)).toBe(0);
    expect(igniteChance(WATER, 1, 0, 0)).toBe(0);
    // A tick lights neighbours, and a burning cell burns out to ash.
    const n = FIRE_COLS * FIRE_ROWS, burn = new Uint8Array(n), wet = new Uint8Array(n), ash = new Uint8Array(n), cells = new Uint8Array(n).fill(FOREST);
    burn[5 * FIRE_COLS + 5] = 1;
    const lit = fireTick(cells, burn, wet, ash, 0, () => 0);
    expect(lit.length).toBeGreaterThan(0);
    expect(ash[5 * FIRE_COLS + 5]).toBe(1);
    expect(dropCells(10, 10).length).toBeGreaterThan(12);
    // Every flame put out once, all villages standing, all the forest green: under the cap.
    for (const seed of [1, 2, 3, 4, 5]) {
      const f = fireMap(seed, GAMES.fire.seconds);
      const burnable = Array.from(f.cells).filter((k) => k === FOREST || k === MEADOW || k === VILLAGE).length;
      expect(burnable * FIRE_OUT + fireFinal(3, 1, 1)).toBeLessThanOrEqual(GAMES.fire.maxScore);
    }
  });
  it('builds the same reef for everyone, and a perfect dive stays under the cap', () => {
    const r = reefLayout(9);
    expect(r).toEqual(reefLayout(9));
    expect(r.spots).toHaveLength(REEF_SPOTS);
    expect(r.nets).toHaveLength(REEF_NETS);
    expect(r.litter).toHaveLength(REEF_LITTER);
    for (const p of [...r.spots, ...r.nets, ...r.litter]) expect(Math.abs(p.x) <= REEF_HALF && Math.abs(p.z) <= REEF_HALF).toBe(true);
    // Objectives never sit on top of each other.
    const marks = [...r.spots, ...r.nets];
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) expect(Math.hypot(marks[i].x - marks[j].x, marks[i].z - marks[j].z)).toBeGreaterThan(4);
    const j = jellyAt(r.jellies[0], 10);
    expect(j.y).toBeGreaterThan(0);
    expect(reefBest(GAMES.reef.seconds)).toBeLessThanOrEqual(GAMES.reef.maxScore);
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

describe('M39 game features', () => {
  it('names the region for a hint', () => {
    expect(pinRegion(48.85, 2.35)).toBe('Europe');
    expect(pinRegion(40.71, -74)).toBe('North America');
    expect(pinRegion(-23.55, -46.63)).toBe('South America');
    expect(pinRegion(-1.29, 36.82)).toBe('Africa');
    expect(pinRegion(25.2, 55.27)).toBe('the Middle East');
    expect(pinRegion(35.68, 139.69)).toBe('Asia');
    expect(pinRegion(-33.87, 151.21)).toBe('Oceania');
  });
  it('every fifth quiz question is a boss worth triple', () => {
    expect([0, 1, 2, 3, 4, 9].map(quizBoss)).toEqual([false, false, false, false, true, true]);
    // The most one question can give: a boss, doubled, in the lightning round.
    expect(quizPoints(true, 10_000, 6, 2 * 2 * QUIZ_BOSS_MULT)).toBe(3000);
  });
});
