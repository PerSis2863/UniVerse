import { describe, expect, it } from 'vitest';
import { roundDown, totalLabel } from './site-totals';

describe('site totals', () => {
  it('round down to two figures and hide anything under 10', () => {
    expect(roundDown(9)).toBe(0);
    expect(roundDown(10)).toBe(10);
    expect(roundDown(87)).toBe(80);
    expect(roundDown(1234)).toBe(1200);
    expect(roundDown(1_234_567)).toBe(1_200_000);
    expect(roundDown(Number.NaN)).toBe(0);
  });
  it('read short', () => {
    expect(totalLabel(1200)).toBe('1,200+');
    expect(totalLabel(12_000)).toBe('12K+');
    expect(totalLabel(1_200_000)).toBe('1.2M+');
  });
});
