import { describe, expect, it } from 'vitest';
import { GAMES, ageOn, tooYoung } from '../play';
import {
  NIGHT_ESCAPE, NIGHT_KEY, NIGHT_KEYS, NIGHT_PER_SECOND, NIGHT_STUN, NIGHT_STUN_COOLDOWN_S, NIGHT_STUN_S, OBBY_CHECK, OBBY_FINISH, OBBY_GEM, OBBY_PER_SECOND, OBBY_STAGES,
  ORBIT_ESCAPE, ORBIT_PER_SECOND, ORBIT_REACTOR, ORBIT_REACTORS, ORBIT_TANK, ORBIT_TANK_EVERY_S, STRIKE_BOT_HP, STRIKE_COMBO_MAX, STRIKE_FIRE_S, STRIKE_HIT, STRIKE_TAG, STRIKE_WAVE,
  mazeNext, mazeStep, nightMaze, obbyCourse, orbitMeteors, orbitStation, strikeArena, strikeMultiplier,
} from './worlds';

describe('3D worlds (M36)', () => {
  it('builds the same reachable obby for a seed, ten checkpoints then the finish, under the cap', () => {
    const a = obbyCourse(7), b = obbyCourse(7);
    expect(a).toEqual(b);
    expect(a.pads.filter((p) => p.kind === 'check').length).toBe(OBBY_STAGES); // the start + 9
    expect(a.pads.at(-1)!.kind).toBe('finish');
    for (let i = 1; i < a.pads.length; i++) {
      const p = a.pads[i - 1], q = a.pads[i];
      const gap = Math.abs(p.z - q.z) - (p.d + q.d) / 2;
      expect(gap).toBeLessThan(4.3); // a running jump covers it
      if (p.kind !== 'bounce') expect(q.y - p.y).toBeLessThan(1.25); // a jump clears 2 m
    }
    const perfect = OBBY_STAGES * OBBY_CHECK + a.gems.length * OBBY_GEM + OBBY_FINISH + GAMES.obby.seconds * OBBY_PER_SECOND;
    for (const s of [1, 2, 3, 99]) expect(OBBY_STAGES * OBBY_CHECK + obbyCourse(s).gems.length * OBBY_GEM + OBBY_FINISH + GAMES.obby.seconds * OBBY_PER_SECOND).toBeLessThanOrEqual(GAMES.obby.maxScore);
    expect(perfect).toBeLessThanOrEqual(GAMES.obby.maxScore);
  });

  it('keeps Neon Strike under its cap even firing nonstop and tagging everything at the top combo', () => {
    const shots = GAMES.strike.seconds / (STRIKE_FIRE_S / 2); // rapid fire the whole round
    const tags = shots / STRIKE_BOT_HP;
    let waves = 0;
    for (let bots = 0; bots < tags; waves++) bots += 3 + waves * 2; // waves only come once the last is cleared
    expect(shots * STRIKE_HIT + tags * STRIKE_TAG * STRIKE_COMBO_MAX + waves * STRIKE_WAVE).toBeLessThanOrEqual(GAMES.strike.maxScore);
    expect(strikeMultiplier(0)).toBe(1);
    expect(strikeMultiplier(99)).toBe(STRIKE_COMBO_MAX);
    expect(strikeArena(3).every((c) => Math.hypot(c.x, c.z) >= 7)).toBe(true);
  });

  it('makes a Night Shift maze where every hall connects, with five keys, and the thing finds its way', () => {
    const m = nightMaze(11), seen = new Set([0]), q = [0];
    while (q.length) for (const x of mazeNext(m, q.shift()!)) if (!seen.has(x)) { seen.add(x); q.push(x); }
    expect(seen.size).toBe(m.n * m.n);
    expect(new Set(m.keys).size).toBe(NIGHT_KEYS);
    const step = mazeStep(m, m.exit, 0);
    expect(mazeNext(m, m.exit)).toContain(step);
    const stuns = GAMES.night.seconds / (NIGHT_STUN_S + NIGHT_STUN_COOLDOWN_S);
    expect(NIGHT_KEYS * NIGHT_KEY + NIGHT_ESCAPE + GAMES.night.seconds * NIGHT_PER_SECOND + stuns * NIGHT_STUN).toBeLessThanOrEqual(GAMES.night.maxScore);
  });

  it('places five reactors and a pod on different decks, meteors in time order, under the cap', () => {
    const s = orbitStation(5);
    expect(new Set([...s.reactors, s.pod]).size).toBe(ORBIT_REACTORS + 1);
    const ms = orbitMeteors(5, GAMES.orbit.seconds);
    expect(ms.every((x, i) => i === 0 || x.at > ms[i - 1].at)).toBe(true);
    expect(ORBIT_REACTORS * ORBIT_REACTOR + (GAMES.orbit.seconds / ORBIT_TANK_EVERY_S + 1) * ORBIT_TANK + ORBIT_ESCAPE + GAMES.orbit.seconds * ORBIT_PER_SECOND).toBeLessThanOrEqual(GAMES.orbit.maxScore);
  });

  it('works out ages and refuses rated games only for a known younger age', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(ageOn('2008-10-26', now)).toBe(17);
    expect(ageOn('2008-10-25', now)).toBe(18);
    expect(ageOn(null, now)).toBeNull();
    expect(tooYoung('night', 17)).toBe(true);
    expect(tooYoung('night', 18)).toBe(false);
    expect(tooYoung('night', null)).toBe(false); // asked on the device instead
    expect(tooYoung('obby', 8)).toBe(false);
  });
});
