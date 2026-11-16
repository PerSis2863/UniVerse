import { describe, expect, it } from 'vitest';
import { balances, readAmount, settle, spent, type Expense } from './travel-split';

// M215: a trip's shared costs add up, settle in the fewest payments, per currency.
const e = (paidBy: string, amount: number, split: string[], currency = 'EUR', category = 'food'): Expense => ({ id: `${paidBy}${amount}`, paidBy, amount, currency, split, category, what: 'x', day: null, createdBy: paidBy, createdAt: '' });

describe('shared costs', () => {
  it('splits evenly, leftover cents to the first, and always adds up to nothing', () => {
    const b = balances([e('ana', 1000, ['ana', 'ben', 'cy']), e('ben', 3000, ['ana', 'ben'])]).EUR;
    expect(b).toEqual({ ana: 1000 - 334 - 1500, ben: 3000 - 333 - 1500, cy: -333 });
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(0);
  });
  it('settles with as few payments as it can, and a payment back clears it', () => {
    const list = [e('ana', 9000, ['ana', 'ben', 'cy'])];
    expect(settle(balances(list).EUR, 'EUR')).toEqual([{ from: 'ben', to: 'ana', amount: 3000, currency: 'EUR' }, { from: 'cy', to: 'ana', amount: 3000, currency: 'EUR' }]);
    const paid = [...list, e('ben', 3000, ['ana'], 'EUR', 'settle'), e('cy', 3000, ['ana'], 'EUR', 'settle')];
    expect(settle(balances(paid).EUR, 'EUR')).toEqual([]);
    expect(spent(paid).EUR).toEqual({ total: 9000, byKind: { food: 9000 } });
  });
  it('keeps currencies apart', () => {
    const b = balances([e('ana', 100000, ['ana', 'ben'], 'JPY'), e('ben', 2000, ['ana', 'ben'])]);
    expect(b.JPY).toEqual({ ana: 50000, ben: -50000 });
    expect(b.EUR).toEqual({ ben: 1000, ana: -1000 });
  });
  it('reads amounts as people type them', () => {
    expect(readAmount('12.50')).toBe(1250);
    expect(readAmount('12,5')).toBe(1250);
    expect(readAmount('1,200')).toBe(120000);
    expect(readAmount('1.234,56')).toBe(123456);
    expect(readAmount('1 200')).toBe(120000);
    expect(readAmount('0')).toBeNull();
    expect(readAmount('abc')).toBeNull();
    expect(readAmount('-5')).toBeNull();
  });
});
