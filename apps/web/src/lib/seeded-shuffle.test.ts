import { describe, expect, it } from 'vitest';
import { hash, shuffled } from './seeded-shuffle';

describe('seeded shuffle', () => {
  const xs = Array.from({ length: 10 }, (_, i) => i);
  it('the same order for the same seed', () => expect(shuffled(xs, 'student-1:quiz-1')).toEqual(shuffled(xs, 'student-1:quiz-1')));
  it('a different order for another student', () => expect(shuffled(xs, 'student-1:quiz-1')).not.toEqual(shuffled(xs, 'student-2:quiz-1')));
  it('keeps every item and leaves the input alone', () => {
    const out = shuffled(xs, 'x');
    expect([...out].sort((a, b) => a - b)).toEqual(xs);
    expect(xs).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });
  it('handles empty and single lists', () => {
    expect(shuffled([], 's')).toEqual([]);
    expect(shuffled(['a'], 's')).toEqual(['a']);
  });
  it('hash is stable', () => expect(hash('abc')).toBe(hash('abc')));
});
