import { describe, expect, it } from 'vitest';
import { cleanPools, drawFor, parsePools, poolSummary } from './quiz-draw';

const qs = [
  { id: 'intro', pool: null, points: 1 },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, pool: 'week 3', points: 1 })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, pool: 'hard', points: 2 })),
];

describe('question pools', () => {
  it('gives each student their own draw, the same every time, in the quiz’s order', () => {
    const pools = { 'week 3': 3, hard: 1 };
    const mine = drawFor(qs, pools, 'alice:quiz');
    expect(mine).toHaveLength(5);
    expect(mine[0].id).toBe('intro');
    expect(mine.filter((q) => q.pool === 'week 3')).toHaveLength(3);
    expect(drawFor(qs, pools, 'alice:quiz')).toEqual(mine);
    // Read in another order, the same draw.
    expect(drawFor([...qs].reverse(), pools, 'alice:quiz').map((q) => q.id).sort()).toEqual(mine.map((q) => q.id).sort());
    expect(mine.map((q) => qs.indexOf(q))).toEqual([...mine.map((q) => qs.indexOf(q))].sort((a, b) => a - b));
    // Over a class, different students get different questions.
    const seen = new Set(Array.from({ length: 30 }, (_, k) => drawFor(qs, pools, `s${k}:quiz`).map((q) => q.id).join()).values());
    expect(seen.size).toBeGreaterThan(10);
  });
  it('takes the whole pool when the number is missing or too big, and everything without pools', () => {
    expect(drawFor(qs, { 'week 3': 50 }, 'x')).toHaveLength(15);
    expect(drawFor(qs, null, 'x')).toHaveLength(15);
    expect(poolSummary(qs, { 'week 3': 3 })).toEqual([{ name: 'week 3', size: 10, each: 3 }, { name: 'hard', size: 4, each: 4 }]);
  });
  it('keeps only sensible pool settings', () => {
    expect(cleanPools({ ' week  3 ': '3', bad: 0, worse: 'x', '': 2 })).toEqual({ 'week 3': 3 });
    expect(cleanPools([1, 2])).toBeNull();
    expect(parsePools('{"a":2}')).toEqual({ a: 2 });
    expect(parsePools('nope')).toBeNull();
  });
});
