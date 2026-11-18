import { describe, expect, it } from 'vitest';
import { forecastSupply } from './supply-forecast';

const now = Date.parse('2026-11-18T12:00:00Z');
const ago = (d: number) => new Date(now - d * 86_400_000);

describe('supply forecasts', () => {
  it('works out the daily use, the days left and when to order', () => {
    const f = forecastSupply(100, [{ change: -14, createdAt: ago(2) }, { change: -14, createdAt: ago(10) }, { change: 50, createdAt: ago(3) }], now);
    expect(f.perDay).toBe(2.5);
    expect(f.daysLeft).toBe(40);
    expect(f.orderBy).toBe('2026-12-25');
    expect(f.state).toBe('ok');
  });
  it('warns when it runs out soon, and knows nothing without use', () => {
    expect(forecastSupply(10, [{ change: -21, createdAt: ago(1) }], now).state).toBe('now');
    expect(forecastSupply(10, [{ change: 5, createdAt: ago(1) }, { change: -3, createdAt: ago(40) }], now).state).toBe('unknown');
  });
});
