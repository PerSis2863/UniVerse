import { describe, expect, it } from 'vitest';
import { panFor } from './spatial-audio';

describe('spatial audio', () => {
  it('pans by where the tile is', () => {
    expect(panFor(500, 0, 1000)).toBe(0);
    expect(panFor(250, 0, 1000)).toBe(-0.5);
    expect(panFor(0, 0, 1000)).toBe(-0.8);
    expect(panFor(1200, 0, 1000)).toBe(0.8);
    expect(panFor(150, 100, 0)).toBe(0);
  });
});
