import { describe, expect, it } from 'vitest';
import { previousVisit } from './since-visit';

const H = 3_600_000;
const now = Date.UTC(2026, 10, 14, 12);

describe('since your last visit', () => {
  it('a first visit has nothing before it', () => {
    expect(previousVisit([], now)).toBeNull();
    expect(previousVisit([now - 60_000], now)).toBeNull();
  });
  it('a second tab or a new sign-in within the hour is the same visit', () => {
    expect(previousVisit([now - 60_000, now - 20 * 60_000, now - 26 * H], now)).toBe(now - 26 * H);
    expect(previousVisit([now - 60_000, now - 30 * 60_000], now)).toBeNull();
  });
  it('looks back 30 days at most', () => {
    expect(previousVisit([now, now - 90 * 24 * H], now)).toBe(now - 30 * 24 * H);
  });
});
