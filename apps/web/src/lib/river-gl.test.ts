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
  it('adds the fine threads after the lines: faint (no halo), thin, and spread across the whole bundle', () => {
    const f = riverFibres(30, 110);
    expect(f).toHaveLength(140 * 16);
    expect(f.every(Number.isFinite)).toBe(true);
    const ranks: number[] = [];
    for (let i = 30; i < 140; i++) {
      const o = i * 16;
      expect(f[o + 11]).toBeLessThan(0.2); // the shader draws these without a halo
      expect(f[o + 9]).toBeLessThan(0.8);
      expect(f[o + 10]).toBe(0);
      ranks.push(f[o + 8]);
    }
    ranks.sort((a, b) => a - b);
    expect(ranks[0]).toBeLessThan(0.03);
    expect(ranks[109]).toBeGreaterThan(0.97);
    // No tenth of the bundle is left empty.
    for (let k = 0; k < 10; k++) expect(ranks.some((r) => r >= k / 10 && r < (k + 1) / 10)).toBe(true);
    // M128 (the template: many fine lines, a few bright): over a third of the lines glow (above the
    // halo threshold), and every line is thin (the out-of-focus ones aside).
    const lines = Array.from({ length: 30 }, (_, i) => f.subarray(i * 16, i * 16 + 16));
    expect(lines.filter((l) => l[11] > 0.2).length).toBeGreaterThan(10);
    expect(lines.filter((l) => l[10] === 0).every((l) => l[9] < 0.9)).toBe(true);
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
