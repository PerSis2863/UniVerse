import { describe, expect, it } from 'vitest';
import { dailyCounts } from './daily-counts';

describe('dailyCounts', () => {
  it('puts each thing on its local day, oldest first, and leaves out older ones and unknown keys', () => {
    const now = Date.parse('2026-11-09T12:00:00Z');
    const got = dailyCounts([
      { key: 'a', at: new Date('2026-11-09T01:00:00Z') },
      { key: 'a', at: new Date('2026-11-08T20:00:00Z') }, // 9 Nov 01:30 in India
      { key: 'a', at: new Date('2026-11-07T10:00:00Z') },
      { key: 'b', at: new Date('2026-10-01T10:00:00Z') },
      { key: 'x', at: new Date('2026-11-09T10:00:00Z') },
    ], ['a', 'b'], 3, now, 330);
    expect(got).toEqual({ a: [1, 0, 2], b: [0, 0, 0] });
  });
});
