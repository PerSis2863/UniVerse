import { describe, expect, it } from 'vitest';
import { isGroupMode, makeGroups, shuffle } from './group-maker';

const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('making groups', () => {
  it('makes even groups of about the size asked for', () => {
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(makeGroups(ten, 3).map((g) => g.length).sort()).toEqual([3, 3, 4]);
    expect(makeGroups(ten, 4).map((g) => g.length).sort()).toEqual([3, 3, 4]);
    expect(makeGroups(ten, 5).map((g) => g.length)).toEqual([5, 5]);
    expect(makeGroups([1, 2, 3], 4)).toHaveLength(1);
    expect(makeGroups([], 3)).toEqual([]);
  });
  it('puts everyone in exactly one group, and keeps sizes in range', () => {
    const people = Array.from({ length: 23 }, (_, i) => `s${i}`);
    const groups = makeGroups(people, 1);
    expect(groups.every((g) => g.length >= 2)).toBe(true);
    expect(groups.flat().sort()).toEqual([...people].sort());
    expect(makeGroups(people, 50).map((g) => g.length).sort()).toEqual([11, 12]);
  });
  it('shuffles without losing anyone', () => {
    expect(shuffle([1, 2, 3, 4], seq([0, 0, 0]))).toEqual([2, 3, 4, 1]);
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
  it('knows the modes', () => {
    expect(isGroupMode('SHARED')).toBe(true);
    expect(isGroupMode('NONE')).toBe(false);
  });
});
