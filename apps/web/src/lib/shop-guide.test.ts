import { describe, expect, it } from 'vitest';
import { guideProgress, shopSteps } from './shop-guide';

describe('a new shop’s guide', () => {
  it('marks what the shop has done and names the next step', () => {
    const p = guideProgress(shopSteps({ brands: 1, stops: 0, sales: 2, points: 0, signShown: false }));
    expect(p).toMatchObject({ done: 2, total: 5 });
    expect(p.next?.id).toBe('sign');
    expect(guideProgress(shopSteps({ brands: 1, stops: 3, sales: 9, points: 40, signShown: true })).next).toBeNull();
  });
});
