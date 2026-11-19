import { describe, expect, it } from 'vitest';
import { glideOut } from './map-smooth';

describe('map fling (M335)', () => {
  it('starts fast, settles exactly, never overshoots', () => {
    expect(glideOut(0)).toBe(0);
    expect(glideOut(1)).toBe(1);
    expect(glideOut(0.25)).toBeGreaterThan(0.55);
    for (let i = 0; i < 20; i++) expect(glideOut((i + 1) / 20)).toBeGreaterThanOrEqual(glideOut(i / 20));
  });
});
