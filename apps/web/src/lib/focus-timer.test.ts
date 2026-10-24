import { describe, expect, it } from 'vitest';
import { pause, progress, ready, remaining, skip, start, tick } from './focus-timer';

describe('focus timer', () => {
  it('runs a focus round, then starts the break by itself', () => {
    const s = start(ready(0), 0);
    expect(remaining(s, 60_000)).toBe(24 * 60_000);
    const { state, ended } = tick(s, 25 * 60_000);
    expect(ended).toBe('focus');
    expect(state).toMatchObject({ phase: 'break', rounds: 1, endsAt: 30 * 60_000 });
  });

  it('waits after a break, and pauses where it was', () => {
    const brk = tick(start(ready(0), 0), 25 * 60_000).state;
    const { state, ended } = tick(brk, 31 * 60_000);
    expect(ended).toBe('break');
    expect(state).toMatchObject({ phase: 'focus', endsAt: null, rounds: 1 });
    const paused = pause(start(ready(1), 0), 10 * 60_000);
    expect(paused).toMatchObject({ endsAt: null, left: 40 * 60_000 });
    expect(progress(paused, 99e9)).toBeCloseTo(0.2);
  });

  it('skips to the next round', () => {
    expect(skip(start(ready(2), 0), 1000)).toMatchObject({ phase: 'break', rounds: 1 });
  });
});
