import { describe, expect, it } from 'vitest';
import { groupNear } from './cluster';

describe('groupNear', () => {
  it('joins points that would pile up and keeps distant ones apart', () => {
    const g = groupNear([{ item: 'a', x: 100, y: 100 }, { item: 'b', x: 110, y: 104 }, { item: 'c', x: 300, y: 100 }, { item: 'd', x: 96, y: 92 }], 24);
    expect(g.map((x) => x.items)).toEqual([['a', 'b', 'd'], ['c']]);
    expect(g[0].x).toBeCloseTo(102);
    expect(g[0].y).toBeCloseTo(98.67, 1);
  });
  it('splits a group once the points are further apart than the reach (zoomed in)', () => {
    expect(groupNear([{ item: 1, x: 0, y: 0 }, { item: 2, x: 30, y: 0 }], 24)).toHaveLength(2);
    expect(groupNear([], 24)).toEqual([]);
  });
});
