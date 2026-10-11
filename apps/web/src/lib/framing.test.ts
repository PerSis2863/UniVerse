import { describe, expect, it } from 'vitest';
import { frameFor, glide } from './framing';

describe('auto-framing', () => {
  it('shows the whole picture with no face', () => {
    expect(frameFor(null, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
  it('zooms in on a small face, keeping the shape, inside the picture', () => {
    const c = frameFor({ x: 900, y: 100, w: 100, h: 100 }, 1280, 720);
    expect(c.h).toBe(360); // never more than 2×
    expect(c.w).toBe(640);
    expect(c.x + c.w).toBeLessThanOrEqual(1280);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x).toBe(630); // centred on the face, pulled back inside the right edge
  });
  it('barely zooms for a big face and glides', () => {
    expect(frameFor({ x: 400, y: 100, w: 400, h: 400 }, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    expect(glide({ x: 0, y: 0, w: 100, h: 50 }, { x: 10, y: 10, w: 50, h: 25 }, 0.5)).toEqual({ x: 5, y: 5, w: 75, h: 37.5 });
  });
});
