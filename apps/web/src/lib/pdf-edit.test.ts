import { describe, expect, it } from 'vitest';
import { markAt, movePage, parseRanges, simplify, toFraction, turn, type Mark } from './pdf-edit';

describe('PDF editor helpers', () => {
  it('moves pages and turns them', () => {
    expect(movePage(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePage(['a', 'b'], 1, 5)).toEqual(['a', 'b']);
    expect(turn(270, 1)).toBe(0);
    expect(turn(0, -1)).toBe(270);
  });
  it('reads page ranges', () => {
    expect(parseRanges('1-3, 5, 2, 9, x', 6)).toEqual([0, 1, 2, 4]);
    expect(parseRanges('4-2', 6)).toEqual([1, 2, 3]);
    expect(parseRanges('', 3)).toEqual([]);
  });
  it('turns pointer positions into page fractions, inside the page', () => {
    const box = { left: 100, top: 50, width: 200, height: 400 };
    expect(toFraction(200, 250, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(toFraction(50, 900, box)).toEqual({ x: 0, y: 1 });
  });
  it('finds the mark under a point, newest first', () => {
    const marks: Mark[] = [
      { id: 'box', kind: 'whiteout', color: '#fff', size: 1, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
      { id: 'line', kind: 'pen', color: '#000', size: 2, points: [{ x: 0.15, y: 0.15 }, { x: 0.5, y: 0.5 }] },
    ];
    expect(markAt(marks, { x: 0.15, y: 0.15 })?.id).toBe('line');
    expect(markAt(marks, { x: 0.28, y: 0.18 })?.id).toBe('box');
    expect(markAt(marks, { x: 0.9, y: 0.9 })).toBeNull();
  });
  it('thins freehand lines', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0.001, y: 0 }, { x: 0.01, y: 0 }], 0.005)).toEqual([{ x: 0, y: 0 }, { x: 0.01, y: 0 }]);
  });
});
