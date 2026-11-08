import { describe, expect, it } from 'vitest';
import { riverCamera, riverFibres } from './river-gl';

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

describe('riverCamera', () => {
  it('shows exactly the drawn river at the top of the page', () => {
    expect(riverCamera(0, 1280, 800, false)).toEqual({ vs: 0, zoom: 1, rot: 0, ox: 0, oy: 0, focus: 1 });
  });
  it('moves with the page and softens, nothing more, with Reduce Motion', () => {
    const c = riverCamera(400, 1280, 800, true);
    expect(c).toMatchObject({ vs: 400, zoom: 1, rot: 0 });
    expect(c.focus).toBeCloseTo(0.375);
  });
  it('changes smoothly as the page scrolls, even when the stages go round again', () => {
    let prev = riverCamera(0, 1280, 800, false);
    for (let sy = 4; sy < 800 * 20; sy += 4) {
      const c = riverCamera(sy, 1280, 800, false);
      expect(Math.abs(c.vs - prev.vs)).toBeLessThan(5);
      expect(Math.abs(c.zoom - prev.zoom)).toBeLessThan(0.02);
      expect(Math.abs(c.rot - prev.rot)).toBeLessThan(0.03);
      expect(Math.abs(c.focus - prev.focus)).toBeLessThan(0.03);
      expect(Math.abs(c.ox - prev.ox) + Math.abs(c.oy - prev.oy)).toBeLessThan(6);
      prev = c;
    }
  });
});
