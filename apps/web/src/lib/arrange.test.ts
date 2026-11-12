import { describe, expect, it } from 'vitest';
import { arranged, cleanKey, cleanStore, moved, overlap, uniqueKeys } from './arrange';

describe('arrange this page', () => {
  it('names things once each', () => {
    expect(uniqueKeys(['Open', 'Open', '', 'Save'])).toEqual(['Open', 'Open #2', '#3', 'Save']);
    expect(cleanKey('  Due   this\n week ')).toBe('Due this week');
  });
  it('keeps the saved order, and puts a new card next to what it follows', () => {
    expect(arranged(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    expect(arranged(['c', 'a', 'gone'], ['a', 'new', 'c'])).toEqual(['c', 'a', 'new']);
    expect(arranged(['b', 'a'], ['new', 'a', 'b'])).toEqual(['new', 'b', 'a']);
  });
  it('moves one thing', () => {
    expect(moved(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });
  it('matches a saved group to its container', () => {
    expect(overlap({ order: ['a', 'b', 'x'] }, ['b', 'a', 'c'])).toBe(2);
  });
  it('drops anything odd from a damaged copy', () => {
    const s = cleanStore({ '/home': [{ order: ['a', 7, 'b'], sizes: { a: { pct: 500, h: 'tall' }, b: 3 }, maxW: 10 }, 'x', { order: [] }], 'evil': [{ order: ['a'] }], '/x': 'no' });
    expect(s).toEqual({ '/home': [{ order: ['a', 'b'], sizes: { a: { pct: 100 } }, maxW: 320 }] });
    expect(cleanStore(null)).toEqual({});
    expect(cleanStore([1])).toEqual({});
  });
});
