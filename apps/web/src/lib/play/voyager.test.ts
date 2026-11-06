import { describe, expect, it } from 'vitest';
import { GAMES } from '../play';
import { VOYAGER_BELT, VOYAGER_DUST_N, VOYAGER_EDGE, VOYAGER_PLANETS, VOYAGER_SUN_R, cometAt, voyagerMax, voyagerScanReach, voyagerSystem } from './voyager';

// M123: Solar Voyager's system is the same for a seed, every planet can be reached and surveyed,
// and no round can beat the cap the server keeps.
describe('Solar Voyager', () => {
  it('lays out the same system for the same seed, and a different one for another', () => {
    expect(voyagerSystem(7)).toEqual(voyagerSystem(7));
    expect(voyagerSystem(7).at).not.toEqual(voyagerSystem(8).at);
  });
  it('keeps the eight planets in order out from the Sun, apart, inside the edge', () => {
    for (const seed of [1, 2, 3, 99]) {
      const s = voyagerSystem(seed);
      expect(s.at).toHaveLength(8);
      s.at.forEach((a, i) => {
        const d = Math.hypot(a.x, a.z), p = VOYAGER_PLANETS[i];
        expect(d).toBeCloseTo(p.orbit, 5);
        expect(d + p.r + voyagerScanReach(p)).toBeLessThan(VOYAGER_EDGE);
        expect(d - voyagerScanReach(p)).toBeGreaterThan(VOYAGER_SUN_R);
        // The belt's rocks stay clear of every planet's survey zone.
        expect(d < VOYAGER_BELT[0] - voyagerScanReach(p) || d > VOYAGER_BELT[1] + voyagerScanReach(p)).toBe(true);
      });
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
        const a = s.at[i], b = s.at[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(voyagerScanReach(VOYAGER_PLANETS[i]) + voyagerScanReach(VOYAGER_PLANETS[j]));
      }
    }
  });
  it('puts every speck of stardust out of the Sun and inside the edge', () => {
    const s = voyagerSystem(3);
    expect(s.dust).toHaveLength(VOYAGER_DUST_N);
    for (const d of s.dust) { const r = Math.hypot(d.x, d.y, d.z); expect(r).toBeGreaterThan(VOYAGER_SUN_R + 10); expect(r).toBeLessThan(VOYAGER_EDGE); }
    expect(voyagerSystem(3, 100).rocks).toHaveLength(100);
  });
  it('flies one comet for the whole room (whatever the size of the belt), nearest the Sun halfway', () => {
    for (const seed of [1, 4, 77]) {
      const c = voyagerSystem(seed, 420).comet;
      expect(voyagerSystem(seed, 150).comet).toEqual(c);
      const mid = cometAt(c, 0.5), ends = [cometAt(c, 0), cometAt(c, 1)];
      expect(Math.hypot(mid.x, mid.z)).toBeGreaterThan(105);
      expect(Math.hypot(mid.x, mid.z)).toBeLessThan(175);
      for (const e of ends) expect(Math.hypot(e.x, e.y, e.z)).toBeLessThan(VOYAGER_EDGE);
      expect(cometAt(c, 2)).toEqual(ends[1]);
    }
  });
  it('starts beside Earth, clear of it, looking its way', () => {
    for (const seed of [2, 5, 31]) {
      const { start, at } = voyagerSystem(seed), e = at[2], earth = VOYAGER_PLANETS[2];
      const d = Math.hypot(e.x - start.x, e.y - start.y, e.z - start.z);
      expect(d).toBeGreaterThan(earth.r + 10);
      expect(d).toBeLessThan(voyagerScanReach(earth) + earth.r + 20);
      const look = [-Math.sin(start.yaw) * Math.cos(start.pitch), Math.sin(start.pitch), -Math.cos(start.yaw) * Math.cos(start.pitch)];
      const to = [(e.x - start.x) / d, (e.y - start.y) / d, (e.z - start.z) / d];
      expect(look[0] * to[0] + look[1] * to[1] + look[2] * to[2]).toBeGreaterThan(Math.cos(Math.PI / 4));
    }
  });
  it('keeps each moon clear of its planet and its rings', () => {
    for (const p of VOYAGER_PLANETS) for (const m of p.moons) expect(m.d - m.r).toBeGreaterThan(Math.max(p.r, p.ring?.[1] ?? 0) + 1);
  });
  it('has a fact and two numbers for each planet, and a cap no round can pass', () => {
    for (const p of VOYAGER_PLANETS) { expect(p.fact.length).toBeGreaterThan(40); expect(p.stats).toHaveLength(2); }
    expect(voyagerMax(GAMES.voyager.seconds)).toBeLessThanOrEqual(GAMES.voyager.maxScore);
  });
});
