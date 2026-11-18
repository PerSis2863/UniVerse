import { describe, expect, it } from 'vitest';
import { glideEase, wheelPx } from './smooth-scroll';

describe('smooth scroll (M326)', () => {
  it('eases out like tripist: half the way in a tenth of the glide, all of it by the end', () => {
    expect(glideEase(0)).toBeCloseTo(0.001, 3);
    expect(glideEase(0.1)).toBeCloseTo(0.5, 2);
    expect(glideEase(1)).toBe(1);
    expect(glideEase(0.3)).toBeGreaterThan(glideEase(0.2));
  });
  it('turns wheel lines and pages into pixels', () => {
    expect(wheelPx(100, 0, 800)).toBe(100);
    expect(wheelPx(3, 1, 800)).toBe(50);
    expect(wheelPx(1, 2, 800)).toBe(800);
  });
});
