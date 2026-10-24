import { describe, expect, it } from 'vitest';
import { areaPath, change, fmt, linePath, niceTicks, percentileBin, points, stats } from './instruments';

describe('instruments', () => {
  it('sums up a series', () => {
    const s = stats([4, 1, 3, 2, 10]);
    expect(s).toMatchObject({ last: 10, min: 1, max: 10, total: 20, avg: 4, p95: 10 });
    expect(stats([])).toMatchObject({ last: 0, avg: 0, p95: 0 });
  });

  it('finds the bin holding the 95th percentile', () => {
    expect(percentileBin([10, 80, 5, 3, 2])).toBe(2);
    expect(percentileBin([10, 80, 4, 4, 2])).toBe(3);
    expect(percentileBin([0, 0, 0])).toBe(-1);
    expect(percentileBin([0, 0, 1])).toBe(2);
  });

  it('compares with the period before', () => {
    expect(change(110, 100)).toBeCloseTo(10);
    expect(change(5, 0)).toBeNull();
  });

  it('makes round axis ticks', () => {
    expect(niceTicks(1750)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(9).at(-1)).toBeGreaterThanOrEqual(9);
  });

  it('scales points into a box and draws through them', () => {
    const pts = points([0, 5, 10], 100, 50);
    expect(pts).toEqual([[0, 50], [50, 25], [100, 0]]);
    expect(linePath(pts)).toMatch(/^M0,50 C.* 100,0$/);
    expect(areaPath(pts, 50)).toMatch(/L100,50 L0,50 Z$/);
    expect(linePath([])).toBe('');
  });

  it('formats numbers', () => {
    expect(fmt(1172)).toBe('1,172');
    expect(fmt(0.314)).toBe('0.31');
    expect(fmt(4.72)).toBe('4.72');
    expect(fmt(12_400)).toBe('12.4k');
    expect(fmt(6_900_000)).toBe('6.9M');
    expect(fmt(NaN)).toBe('–');
  });
});
