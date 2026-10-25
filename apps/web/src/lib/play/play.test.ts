import { describe, expect, it } from 'vitest';
import { GAMES, cleanRoomCode, cleanScore, newRoomCode, ranked } from '../play';
import { quizHalf, quizPoints, quizQuestion } from './quiz';
import { fakeCards, fakeRound, rankFor } from './fakes';
import { GRID, STOCK_MAX, STOCK_START, supplyEvents, supplyPoints, supplySchedule, travelMs } from './supply';
import { ITEMS, sortMultiplier, sortPoints, sortSequence, sortWave } from './sort';

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
    expect(quizPoints(true, 10_000, 6, 4)).toBe(1000);
    // 50:50 hides two wrong answers, never the right one.
    const q = quizQuestion(42, 4), half = quizHalf(42, 4, q);
    expect(half).toHaveLength(2);
    expect(half).not.toContain(q.answer);
    // The bank has no repeated questions.
    const seen = new Set(Array.from({ length: 74 }, (_, i) => i).filter((i) => i % 3 !== 2).map((i) => quizQuestion(9, i).q));
    expect(seen.size).toBe(Array.from({ length: 74 }, (_, i) => i).filter((i) => i % 3 !== 2).length);
  });
  it('makes exactly one copy among the passports, with its tell', () => {
    const reasons = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const r = fakeRound(7, i);
      expect(r).toEqual(fakeRound(7, i));
      expect(r.cards).toHaveLength(fakeCards(i));
      reasons.add(r.reason);
      const real = r.cards.filter((_, k) => k !== r.fake);
      const f = r.cards[r.fake];
      const low = Math.min(...real.map((c) => c.price));
      expect(real.every((c) => c.sealOk && c.scans <= 3 && c.brand === real[0].brand && c.bestBefore > c.made && c.km / c.hours < 100)).toBe(true);
      if (r.reason === 'journey') expect(f.km / f.hours).toBeGreaterThan(500);
      if (r.reason === 'scans') expect(f.scans).toBeGreaterThan(50);
      if (r.reason === 'seal') expect(f.sealOk).toBe(false);
      if (r.reason === 'brand') expect(f.brand).not.toBe(real[0].brand);
      if (r.reason === 'dates') expect(f.bestBefore < f.made).toBe(true);
      if (r.reason === 'price') expect(f.price).toBeLessThan(low * 0.6);
      expect(r.why.length).toBeGreaterThan(20);
    }
    expect(reasons.size).toBe(6);
    expect(fakeCards(0)).toBe(4);
    expect(fakeCards(5)).toBe(6);
    expect(rankFor(0)).toBe('Rookie');
    expect(rankFor(11)).toBe('Detective');
  });
  it('schedules supply needs inside the town and the round', () => {
    const s = supplySchedule(5, 90);
    expect(s).toEqual(supplySchedule(5, 90));
    expect(s.length).toBeGreaterThan(30);
    expect(s.every((n) => n.x >= 0 && n.x < GRID.cols && n.y >= 0 && n.y < GRID.rows && n.at < 90_000)).toBe(true);
    expect(supplyPoints(6, 10_000, 10_000)).toBe(360);
    expect(supplyPoints(6, 10_000, 10_000, true)).toBe(720);
    expect(s.some((n) => n.critical) && s.some((n) => !n.critical)).toBe(true);
    // Even a perfect round stays under the game's cap.
    for (const seed of [1, 2, 3, 5, 8]) expect(supplySchedule(seed, 90).reduce((a, n) => a + supplyPoints(n.people, n.ttl, n.ttl, n.critical), 0)).toBeLessThanOrEqual(GAMES.supply.maxScore);
    const ev = supplyEvents(5, 90);
    expect(ev.map((e) => e.kind)).toEqual(['donation', 'rain', 'donation']);
    expect(travelMs(0, 0)).toBeGreaterThan(travelMs(2, 1));
    expect(travelMs(0, 0, true)).toBeGreaterThan(travelMs(0, 0));
    expect(STOCK_MAX).toBeGreaterThan(STOCK_START);
  });
  it('sends belt items faster as the round goes on, within the cap', () => {
    const s = sortSequence(9, 75);
    expect(s).toEqual(sortSequence(9, 75));
    expect(s.every((b) => b.item >= 0 && b.item < ITEMS.length)).toBe(true);
    expect(s.at(-1)!.travel).toBeLessThan(s[0].travel);
    expect(sortMultiplier(0)).toBe(1);
    expect(sortMultiplier(12)).toBe(2);
    expect(sortMultiplier(99)).toBe(3);
    expect(s.some((b) => b.golden)).toBe(true);
    expect(sortPoints(10, true)).toBe(600);
    expect(sortWave(0, 75)).toBe(0);
    expect(sortWave(74_000, 75)).toBe(3);
    for (const seed of [1, 2, 9]) expect(sortSequence(seed, 75).reduce((a, b, k) => a + sortPoints(k, b.golden), 0)).toBeLessThanOrEqual(GAMES.sort.maxScore);
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
