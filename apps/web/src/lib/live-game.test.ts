import { describe, expect, it } from 'vitest';
import { pointsFor, ranked, settle, streakBonus } from './live-game';

describe('live quiz game', () => {
  it('gives more points for quicker right answers', () => {
    expect(pointsFor(true, 0, 20)).toBe(1000);
    expect(pointsFor(true, 10_000, 20)).toBe(750);
    expect(pointsFor(true, 60_000, 20)).toBe(500);
    expect(pointsFor(false, 0, 20)).toBe(0);
  });
  it('adds a bonus for streaks, and breaks them on a miss or no answer', () => {
    expect([1, 2, 3, 6, 10].map(streakBonus)).toEqual([0, 100, 200, 500, 500]);
    const after = settle([{ userId: 'a', streak: 2 }, { userId: 'b', streak: 4 }, { userId: 'c', streak: 1 }], [{ userId: 'a', correct: true }, { userId: 'b', correct: false }]);
    expect(after).toEqual([{ userId: 'a', streak: 3, bonus: 200 }, { userId: 'b', streak: 0, bonus: 0 }, { userId: 'c', streak: 0, bonus: 0 }]);
  });
  it('ranks players, sharing a rank on equal scores', () => {
    expect(ranked([{ name: 'Bob', score: 900 }, { name: 'Alice', score: 1500 }, { name: 'Cara', score: 900 }]).map((p) => `${p.rank} ${p.name}`)).toEqual(['1 Alice', '2 Bob', '2 Cara']);
  });
});
