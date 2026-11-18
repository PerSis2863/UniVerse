import { describe, expect, it } from 'vitest';
import { bestOf, type CompareRow } from './trace-compare';

const row = (id: string, o: Partial<CompareRow>): CompareRow => ({ id, name: id, brand: 'B', category: null, imageUrl: null, price: null, currency: 'EUR', warrantyMonths: 12, stars: null, reviews: 0, carbonKg: null, recycledContent: null, recyclable: null, durabilityYears: null, repairScore: null, madeIn: null, ...o });

describe('comparing products', () => {
  it('names the best per fact, ignoring ties and lone values', () => {
    const b = bestOf([row('a', { price: 40, carbonKg: 5, warrantyMonths: 24, repairScore: 7 }), row('b', { price: 55, carbonKg: 3, warrantyMonths: 24 })]);
    expect(b.price).toEqual(['a']);
    expect(b.carbonKg).toEqual(['b']);
    expect(b.warrantyMonths).toBeUndefined();
    expect(b.repairScore).toBeUndefined();
  });
  it('compares prices only in one currency', () => {
    expect(bestOf([row('a', { price: 40 }), row('b', { price: 30, currency: 'USD' })]).price).toBeUndefined();
  });
});
