import { describe, expect, it } from 'vitest';
import { ahead, planesFrom } from './aircraft';

describe('aircraft', () => {
  it('keeps airborne planes with a position, rounded, and thins a long list evenly', () => {
    const states = [
      ['a', 'BAW1', 'UK', 0, 0, -0.4512, 51.4789, 10000, false, 230.4, 90.6, 0, null, 10100],
      ['b', 'X', 'FR', 0, 0, 2.5, 49, 0, true, 0, 0, 0, null, 0], // on the ground
      ['c', 'Y', 'DE', 0, 0, null, null, 9000, false, 200, 10, 0, null, 9000], // no position
    ];
    expect(planesFrom(states)).toEqual([[51.48, -0.45, 91, 230, 10100]]);
    const many = Array.from({ length: 10 }, (_, i) => ['x', '', '', 0, 0, i, i, 1, false, 1, 1, 0, null, 1]);
    expect(planesFrom(many, 5)).toHaveLength(5);
  });
  it('moves a plane along its track', () => {
    const [lat, lon] = ahead(0, 0, 90, 111_195); // one degree east along the equator
    expect(lat).toBeCloseTo(0, 5);
    expect(lon).toBeCloseTo(1, 2);
  });
});
