import { describe, expect, it } from 'vitest';
import { chainIntact, pointHash } from './trace-wallet';

describe('trace wallet chain', () => {
  const make = (prev: string, i: number, points: number, balanceAfter: number) => {
    const createdAt = new Date(Date.UTC(2026, 9, 24, 10, i));
    const e = { userId: 'u1', brandId: 'b1', kind: 'SCAN', points, balanceAfter, previousHash: prev, createdAt };
    return { ...e, hash: pointHash({ ...e, at: createdAt.toISOString() }) };
  };
  it('accepts an untouched chain and catches an edited entry', () => {
    const a = make('GENESIS', 0, 25, 25), b = make(a.hash, 1, 50, 75), c = make(b.hash, 2, -50, 25);
    expect(chainIntact([a, b, c])).toBe(true);
    expect(chainIntact([a, { ...b, points: 5000 }, c])).toBe(false);
    expect(chainIntact([a, c])).toBe(false);
    expect(chainIntact([])).toBe(true);
  });
});
