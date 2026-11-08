import { describe, expect, it } from 'vitest';
import { riverFibres, riverFocus } from './river-gl';

describe('riverFibres', () => {
  it('gives every fibre finite numbers the shader can use, the same each time', () => {
    const f = riverFibres(36);
    expect(f).toHaveLength(36 * 16);
    expect(f.every(Number.isFinite)).toBe(true);
    expect(riverFibres(36)).toEqual(f);
    for (let i = 0; i < 36; i++) {
      const o = i * 16;
      expect(f[o + 3]).toBeGreaterThan(0); // the lower arm's turn never divides by zero
      expect(f[o + 15]).toBeGreaterThan(0); // nor does its bow
      expect(f[o + 12]).toBeGreaterThanOrEqual(0);
      expect(f[o + 12]).toBeLessThan(9); // a colour the palette has
    }
  });
  it('spreads the fibres across the bundle with gaps between them', () => {
    const f = riverFibres(36);
    // Where each fibre sits across the bundle (0 outside … 1 inside): the whole width is used.
    const spread = Array.from({ length: 36 }, (_, i) => f[i * 16 + 8]).sort((a, b) => a - b);
    expect(spread[0]).toBeLessThan(0.05);
    expect(spread[35]).toBeGreaterThan(0.95);
    // Neighbours keep apart: no two of them pile on the same spot.
    expect(spread.slice(1).filter((x, i) => x - spread[i] < 1e-4)).toHaveLength(0);
  });
});

describe('riverFocus', () => {
  it('is sharp at the top of the page and only a little softer further down', () => {
    expect(riverFocus(0, 800)).toBe(1);
    for (let sy = 0; sy < 800 * 10; sy += 50) {
      expect(riverFocus(sy, 800)).toBeGreaterThanOrEqual(0.6);
      expect(riverFocus(sy + 50, 800)).toBeLessThanOrEqual(riverFocus(sy, 800));
    }
  });
});
