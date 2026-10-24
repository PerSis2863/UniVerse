import { describe, expect, it } from 'vitest';
import { streaksFrom } from './chat-streaks';

describe('chat streaks', () => {
  it('counts days in a row when both people wrote', () => {
    const rows = [
      { c: 'a', d: '2026-10-23', n: 2 }, { c: 'a', d: '2026-10-22', n: 2 }, { c: 'a', d: '2026-10-21', n: 2 }, { c: 'a', d: '2026-10-19', n: 2 },
      { c: 'b', d: '2026-10-22', n: 2 }, { c: 'b', d: '2026-10-21', n: 2 }, // today quiet so far: still on
      { c: 'c', d: '2026-10-23', n: 1 }, { c: 'c', d: '2026-10-22', n: 2 }, // only one wrote today, and one day isn't a streak
      { c: 'd', d: '2026-10-20', n: 2 }, { c: 'd', d: '2026-10-19', n: 2 }, // ended
    ];
    expect(streaksFrom(rows, '2026-10-23')).toEqual({ a: 3, b: 2 });
  });
});
