import { describe, expect, it, vi } from 'vitest';
import { divertedScan, wins } from './trace-plus';

vi.mock('@/lib/db', () => ({ default: {} }));

describe('trace plus', () => {
  it('decides each unit’s instant win once, from the batch secret, at about the set odds', () => {
    const codes = Array.from({ length: 5000 }, (_, i) => `ABC123${i}`);
    const won = codes.filter((c) => wins('s3cret', c, 50));
    expect(won.length).toBeGreaterThan(60);
    expect(won.length).toBeLessThan(140);
    expect(codes.filter((c) => wins('s3cret', c, 50))).toEqual(won); // the same every time
    expect(codes.filter((c) => wins('other', c, 50))).not.toEqual(won); // another batch, other winners
    expect(wins('s3cret', 'X', null)).toBe(false);
    expect(wins('s3cret', 'X', 1)).toBe(false);
  });

  it('flags checks outside the countries a batch was sold to', () => {
    expect(divertedScan({ allowedCountries: 'FR,DE' }, 'US')).toBe(true);
    expect(divertedScan({ allowedCountries: 'FR,DE' }, 'de')).toBe(false);
    expect(divertedScan({ allowedCountries: null }, 'US')).toBe(false);
    expect(divertedScan({ allowedCountries: 'FR' }, null)).toBe(false);
  });
});
