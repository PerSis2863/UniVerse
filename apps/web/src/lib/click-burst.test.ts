import { describe, expect, it } from 'vitest';
import { BURST, burstTransform } from './click-burst';

describe('click burst (M333, tripist)', () => {
  it('runs each line 15 px outwards, shrinking into its tip', () => {
    expect(BURST.to[1] - BURST.from[1]).toBe(15);
    expect(burstTransform(45, false)).toBe('rotate(-45deg) translateX(5px) scaleX(1)');
    expect(burstTransform(150, true)).toBe(`rotate(-150deg) translateX(29px) scaleX(${2 / 11})`);
  });
});
