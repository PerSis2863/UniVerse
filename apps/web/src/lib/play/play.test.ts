import { describe, expect, it } from 'vitest';
import { GAMES, cleanRoomCode, cleanScore, newRoomCode, ranked } from '../play';
import { quizPoints, quizQuestion } from './quiz';
import { fakeRound } from './fakes';
import { GRID, supplyPoints, supplySchedule } from './supply';
import { ITEMS, sortMultiplier, sortSequence } from './sort';

describe('UniVerse Play', () => {
  it('makes and checks room codes', () => {
    const code = newRoomCode();
    expect(cleanRoomCode(code)).toBe(code);
    expect(cleanRoomCode(' k7q2-mx ')).toBe('K7Q2MX');
    expect(cleanRoomCode('ABC10O')).toBeNull(); // 1, 0 and O are never in a code
    expect(cleanRoomCode('ABC')).toBeNull();
  });
  it('keeps scores within what a game allows', () => {
    expect(cleanScore('quiz', 1e9)).toBe(GAMES.quiz.maxScore);
    expect(cleanScore('sort', -5)).toBe(0);
    expect(cleanScore('fakes', 'lots')).toBe(0);
  });
  it('ranks by score, then fewer steps', () => {
    const p = (id: string, score: number, step: number) => ({ id, name: id, avatar: null, score, step, done: false, host: false });
    expect(ranked([p('a', 10, 5), p('b', 20, 9), p('c', 10, 3)]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('gives everyone in a room the same quiz, with one right answer', () => {
    for (let i = 0; i < 30; i++) {
      const a = quizQuestion(42, i), b = quizQuestion(42, i);
      expect(a).toEqual(b);
      expect(new Set(a.options).size).toBe(4);
      expect(a.answer).toBeGreaterThanOrEqual(0);
    }
    expect(quizQuestion(1, 0).q).not.toBe(quizQuestion(2, 0).q + 'x');
    expect(quizPoints(false, 9000, 5)).toBe(0);
    expect(quizPoints(true, 10_000, 6)).toBe(250);
  });
  it('makes exactly one copy among four passports, with its tell', () => {
    for (let i = 0; i < 60; i++) {
      const r = fakeRound(7, i);
      expect(r).toEqual(fakeRound(7, i));
      const real = r.cards.filter((_, k) => k !== r.fake);
      const f = r.cards[r.fake];
      expect(real.every((c) => c.sealOk && c.scans <= 3 && c.brand === real[0].brand)).toBe(true);
      if (r.reason === 'journey') expect(f.km / f.hours).toBeGreaterThan(500);
      if (r.reason === 'scans') expect(f.scans).toBeGreaterThan(50);
      if (r.reason === 'seal') expect(f.sealOk).toBe(false);
      if (r.reason === 'brand') expect(f.brand).not.toBe(real[0].brand);
      expect(r.why.length).toBeGreaterThan(20);
    }
  });
  it('schedules supply needs inside the town and the round', () => {
    const s = supplySchedule(5, 90);
    expect(s).toEqual(supplySchedule(5, 90));
    expect(s.length).toBeGreaterThan(30);
    expect(s.every((n) => n.x >= 0 && n.x < GRID.cols && n.y >= 0 && n.y < GRID.rows && n.at < 90_000)).toBe(true);
    expect(supplyPoints(6, 10_000, 10_000)).toBe(360);
    // Even a perfect round stays under the game's cap.
    expect(s.reduce((a, n) => a + supplyPoints(n.people, n.ttl, n.ttl), 0)).toBeLessThanOrEqual(GAMES.supply.maxScore);
  });
  it('sends belt items faster as the round goes on, within the cap', () => {
    const s = sortSequence(9, 75);
    expect(s).toEqual(sortSequence(9, 75));
    expect(s.every((b) => b.item >= 0 && b.item < ITEMS.length)).toBe(true);
    expect(s.at(-1)!.travel).toBeLessThan(s[0].travel);
    expect(sortMultiplier(0)).toBe(1);
    expect(sortMultiplier(12)).toBe(2);
    expect(sortMultiplier(99)).toBe(3);
    expect(s.reduce((a, _, k) => a + Math.round(100 * sortMultiplier(k)), 0)).toBeLessThanOrEqual(GAMES.sort.maxScore);
  });
});

describe('scoreboard names', () => {
  it('skips titles', async () => {
    const { shortName } = await import('@/server/play');
    expect(shortName('Dr. Tom Hale')).toBe('Tom');
    expect(shortName('Maya Rossi')).toBe('Maya');
    expect(shortName('')).toBe('Player');
  });
});
