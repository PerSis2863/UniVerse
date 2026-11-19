import { describe, expect, it } from 'vitest';
import { glideOut } from './map-smooth';

describe('map fling (M335)', () => {
  it('starts fast, settles exactly, never overshoots', () => {
    expect(glideOut(0)).toBe(0);
    expect(glideOut(1)).toBe(1);
    expect(glideOut(0.25)).toBeGreaterThan(0.55);
    for (let t = 0; t < 1; t += 0.05) expect(glideOut(t + 0.05)).toBeGreaterThanOrEqual(glideOut(t));
  });
});
