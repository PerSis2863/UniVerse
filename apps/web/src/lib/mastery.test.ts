import { describe, expect, it } from 'vitest';
import { bandOf, masteryOf, nextBest, reteach, type Mastery } from './mastery';

const right = (at: number, weight?: number) => ({ at, outcome: 1, weight });
const wrong = (at: number, weight?: number) => ({ at, outcome: 0, weight });

describe('mastery from evidence', () => {
  it('starts low with no evidence', () => {
    expect(masteryOf([])).toEqual({ level: 0.3, confidence: 0, n: 0, trend: 0, last: null });
    expect(bandOf(masteryOf([]))).toBe('new');
  });
  it('rises with right answers and reaches mastered with enough of them', () => {
    const m = masteryOf([right(1), right(2), right(3), right(4), right(5)]);
    expect(m.level).toBeGreaterThan(0.85);
    expect(bandOf(m)).toBe('mastered');
  });
  it('counts the newest most: right after wrong beats wrong after right', () => {
    const improving = masteryOf([wrong(1), wrong(2), right(3), right(4)]);
    const slipping = masteryOf([right(1), right(2), wrong(3), wrong(4)]);
    expect(improving.level).toBeGreaterThan(slipping.level);
    expect(improving.trend).toBeGreaterThan(0);
    expect(slipping.trend).toBeLessThan(0);
  });
  it('doesn’t depend on the order observations arrive in', () => {
    expect(masteryOf([right(3), wrong(1), right(2)])).toEqual(masteryOf([wrong(1), right(2), right(3)]));
  });
  it('treats rubric scores as partial outcomes and weights them', () => {
    const half = masteryOf([{ at: 1, outcome: 0.5, weight: 1.5 }]);
    expect(half.level).toBeGreaterThan(0.3);
    expect(half.level).toBeLessThan(0.5);
    expect(masteryOf([right(1, 3)]).confidence).toBeGreaterThan(masteryOf([right(1)]).confidence);
  });
  it('one lucky answer isn’t mastery (not enough evidence)', () => {
    expect(bandOf(masteryOf([right(1, 2)]))).not.toBe('mastered');
  });
});

describe('what to study next', () => {
  const m = (level: number, n: number, confidence = 0.6): Mastery => ({ level, confidence, n, trend: 0, last: null });
  it('weakest tried concepts first, then new ones in course order, mastered ones never', () => {
    const list = nextBest([
      { id: 'a', position: 0, mastery: m(0.9, 6, 0.9) },
      { id: 'b', position: 1, mastery: m(0.4, 3) },
      { id: 'c', position: 2, mastery: m(0.2, 2) },
      { id: 'd', position: 4, mastery: m(0.3, 0, 0) },
      { id: 'e', position: 3, mastery: m(0.3, 0, 0) },
    ], 4);
    expect(list.map((c) => c.id)).toEqual(['c', 'b', 'e', 'd']);
  });
});

describe('what to re-teach', () => {
  const m = (level: number): Mastery => ({ level, confidence: 0.6, n: 3, trend: 0, last: null });
  it('lists weak concepts with enough students, weakest first', () => {
    const r = reteach([
      { conceptId: 'loops', levels: [m(0.3), m(0.4), m(0.5), null] },
      { conceptId: 'recursion', levels: [m(0.2), m(0.2), m(0.3)] },
      { conceptId: 'variables', levels: [m(0.9), m(0.8), m(0.85)] },
      { conceptId: 'rare', levels: [m(0.1), null, null] },
    ]);
    expect(r.map((x) => x.conceptId)).toEqual(['recursion', 'loops']);
    expect(r[0]).toMatchObject({ students: 3, struggling: 3 });
  });
});
