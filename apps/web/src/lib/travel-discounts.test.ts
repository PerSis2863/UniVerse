import { describe, expect, it } from 'vitest';
import { DISCOUNTS, discountsFor } from './travel-discounts';

describe('ways to pay less (M367)', () => {
  it('finds a country’s own schemes first, then those that work everywhere', () => {
    const fr = discountsFor(['FR']);
    expect(fr[0].where).toContain('FR');
    expect(fr.some((d) => d.id === 'isic')).toBe(true);
    expect(fr.some((d) => d.id === 'gb-1625')).toBe(false);
  });
  it('keeps to the people and the kind asked for', () => {
    const seniors = discountsFor(['GB'], ['senior'], 'transport').map((d) => d.id);
    expect(seniors).toContain('gb-senior');
    expect(seniors).not.toContain('gb-1625');
    expect(seniors).toContain('book-ahead'); // for everyone
    expect(discountsFor(['IT'], [], 'sights').every((d) => d.sector === 'sights')).toBe(true);
  });
  it('has unique ids and an official https link where it gives one', () => {
    expect(new Set(DISCOUNTS.map((d) => d.id)).size).toBe(DISCOUNTS.length);
    expect(DISCOUNTS.every((d) => !d.url || d.url.startsWith('https://'))).toBe(true);
  });
});
