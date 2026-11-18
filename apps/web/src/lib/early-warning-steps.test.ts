import { describe, expect, it } from 'vitest';
import { readHistory, stepsFor, trendOf, withScore } from './early-warning-steps';

const DAY = 86_400_000;
const at = (d: number) => new Date(Date.UTC(2026, 10, 1) + d * DAY).toISOString();

describe('early warning steps', () => {
  it('lists the steps for each reason once', () => {
    const ids = stepsFor([{ code: 'grades' }, { code: 'grade-drop' }, { code: 'grades' }, { code: 'unknown' }]).map((s) => s.id);
    expect(ids).toEqual(['office-hours', 'mastery', 'latest-work']);
  });

  it('keeps one point a day, the latest 12', () => {
    let h = withScore([], 40, Date.parse(at(0)));
    h = withScore(h, 55, Date.parse(at(0)) + 3600_000);
    expect(h).toHaveLength(1);
    expect(h[0].score).toBe(55);
    for (let d = 1; d < 20; d++) h = withScore(h, d, Date.parse(at(d)));
    expect(h).toHaveLength(12);
    expect(readHistory(JSON.stringify([...h, { at: 1 }, null]))).toEqual(h);
    expect(readHistory('nope')).toEqual([]);
  });

  it('compares with about a week before', () => {
    const now = Date.parse(at(10));
    expect(trendOf([{ at: at(1), score: 30 }, { at: at(3), score: 35 }, { at: at(10), score: 50 }], now)).toBe('worse');
    expect(trendOf([{ at: at(2), score: 70 }, { at: at(10), score: 45 }], now)).toBe('better');
    expect(trendOf([{ at: at(9), score: 40 }, { at: at(10), score: 70 }], now)).toBe('worse');
    expect(trendOf([{ at: at(10), score: 70 }], now)).toBe('steady');
  });
});
