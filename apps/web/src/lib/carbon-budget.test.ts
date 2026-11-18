import { describe, expect, it } from 'vitest';
import { budgetState, monthPlan } from './carbon-budget';

const parts = [{ id: 'travel', label: 'Getting around', kg: 1200 }, { id: 'home', label: 'Home energy', kg: 2400 }, { id: 'food', label: 'Food', kg: 1800 }];

describe('a monthly carbon budget', () => {
  it('uses a twelfth of the footprint, this month’s bills for home, and takes savings off', () => {
    const p = monthPlan({ parts, billsKg: 150, savedKg: 30, now: new Date(Date.UTC(2026, 10, 16)) })!; // half of November gone
    expect(p.parts.map((x) => x.kg)).toEqual([100, 150, 150]);
    expect(p.elapsed).toBe(0.5);
    expect(p.soFar).toBe(170);
    expect(p.forecast).toBe(340);
  });
  it('needs a footprint, and says over, close or under', () => {
    expect(monthPlan({ parts: null, billsKg: null, savedKg: 0 })).toBeNull();
    expect(budgetState(340, 300)).toEqual({ over: 40, state: 'over' });
    expect(budgetState(310, 300).state).toBe('close');
    expect(budgetState(200, 300).state).toBe('under');
  });
});
