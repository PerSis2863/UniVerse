import { describe, expect, it } from 'vitest';
import { cleanLabels, makesCycle, nextDue, openBlockers, parseList } from './task-extras';

describe('task extras', () => {
  it('cleans labels', () => {
    expect(cleanLabels(['  Design ', 'design', 'research', 3, 'a'.repeat(30), 'x', 'y', 'z', 'w'])).toEqual(['Design', 'research', 'a'.repeat(20), 'x', 'y', 'z']);
    expect(cleanLabels('nope')).toEqual([]);
    expect(parseList('["a","b",1]')).toEqual(['a', 'b']);
    expect(parseList('broken')).toEqual([]);
  });
  it('works out the next due date of a repeating card', () => {
    const fri = new Date(2026, 9, 9, 17); // a Friday
    expect(nextDue(fri, 'daily').getDate()).toBe(10);
    expect(nextDue(fri, 'weekdays').getDate()).toBe(12); // Monday
    expect(nextDue(fri, 'weekly').getDate()).toBe(16);
    expect(nextDue(new Date(2026, 0, 31, 9), 'monthly')).toEqual(new Date(2026, 1, 28, 9));
    expect(nextDue(new Date(2026, 9, 15, 9), 'monthly')).toEqual(new Date(2026, 10, 15, 9));
  });
  it('lists open blockers and spots circles', () => {
    const cards = [{ id: 'a', doneAt: null }, { id: 'b', doneAt: '2026-10-01' }, { id: 'c', doneAt: null }];
    expect(openBlockers(['a', 'b', 'gone'], cards).map((c) => c.id)).toEqual(['a']);
    const waits: Record<string, string[]> = { a: ['b'], b: ['c'], c: [] };
    expect(makesCycle('c', 'a', (id) => waits[id] ?? [])).toBe(true); // c ← a ← b ← c
    expect(makesCycle('a', 'c', (id) => waits[id] ?? [])).toBe(false);
    expect(makesCycle('a', 'a', () => [])).toBe(true);
  });
});
