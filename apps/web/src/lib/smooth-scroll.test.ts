import { describe, expect, it } from 'vitest';
import { GLIDE_MS, glideAt, glideEase, wheelPx } from './smooth-scroll';

describe('smooth scroll (M326, M332)', () => {
  it('eases out like tripist: half the way in a tenth of the glide, all of it by the end', () => {
    expect(glideEase(0)).toBeCloseTo(0.001, 3);
    expect(glideEase(0.1)).toBeCloseTo(0.5, 2);
    expect(glideEase(1)).toBe(1);
    expect(glideEase(0.3)).toBeGreaterThan(glideEase(0.2));
    expect(glideAt(0, 100, GLIDE_MS)).toBe(100);
  });
  it('keeps moving when a turn comes every frame (a trackpad), as Lenis does', () => {
    // Each frame: a 14 px turn restarts the glide from where the page is; the clock then moves a frame (Lenis's).
    let pos = 0, target = 0;
    for (let f = 0; f < 30; f++) { target += 14; pos = glideAt(pos, target, 1000 / 60); }
    expect(pos).toBeGreaterThan(150); // half a second of swiping has gone well over a third of the way
  });
  it('turns wheel lines and pages into pixels', () => {
    expect(wheelPx(100, 0, 800)).toBe(100);
    expect(wheelPx(3, 1, 800)).toBe(50);
    expect(wheelPx(1, 2, 800)).toBe(800);
  });
});
