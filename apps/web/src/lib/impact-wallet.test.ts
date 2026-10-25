import { describe, expect, it } from 'vitest';
import { newest, weekly, worth } from './impact-wallet';

const WEEK = 7 * 86_400_000;

describe('impact wallet', () => {
  it('puts values in the right week, oldest first', () => {
    const now = 100 * WEEK;
    const w = weekly([{ at: now - 1, v: 2 }, { at: now - WEEK - 1, v: 3 }, { at: now - 20 * WEEK, v: 9 }, { at: now + WEEK, v: 9 }], now, 4);
    expect(w).toEqual([0, 0, 3, 2]);
  });
  it('sorts events newest first and cuts the list', () => {
    const e = (at: string) => ({ app: 'green' as const, at, text: '', amount: '' });
    expect(newest([e('2026-01-01'), e('2026-03-01'), e('2026-02-01')], 2).map((x) => x.at)).toEqual(['2026-03-01', '2026-02-01']);
  });
  it('adds points per currency and skips empty balances', () => {
    expect(worth([{ points: 500, pointValue: 0.01, currency: 'EUR' }, { points: 100, pointValue: 0.02, currency: 'EUR' }, { points: 0, pointValue: 1, currency: 'USD' }]))
      .toEqual([{ currency: 'EUR', amount: 7 }]);
  });
});
