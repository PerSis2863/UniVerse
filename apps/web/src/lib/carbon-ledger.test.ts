import { describe, expect, it } from 'vitest';
import { CATEGORIES, commuteKgYear, costPerTonne, factorFor, gridFactor, isPeriod, kgFor, leverCuts, targetPath, totals } from './carbon-ledger';

// M269–M273: a company's footprint adds up the way the GHG Protocol counts it.
describe('carbon ledger', () => {
  it('has one category per id, each with a scope, a unit and a source', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) { expect([1, 2, 3]).toContain(c.scope); expect(c.source.length).toBeGreaterThan(5); }
  });
  it('uses the country’s grid for electricity and the currency for spend', () => {
    const elec = CATEGORIES.find((c) => c.id === 'electricity')!, it = CATEGORIES.find((c) => c.id === 'buy-it')!;
    expect(factorFor(elec, 'IN', 'INR')).toBe(0.716);
    expect(factorFor(elec, 'zz', 'USD')).toBe(gridFactor(null));
    expect(factorFor(it, 'IN', 'INR')).toBeCloseTo(0.2 * 0.012, 6);
    expect(kgFor(1000, 0.716)).toBe(716);
    expect(kgFor(-5, 2)).toBe(0);
  });
  it('checks months', () => {
    expect(isPeriod('2026-03')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('26-03')).toBe(false);
  });
  it('totals by scope, category and month, only for the year asked', () => {
    const t = totals([
      { period: '2026-01', category: 'diesel', scope: 1, kg: 251, quantity: 100 },
      { period: '2026-01', category: 'electricity', scope: 2, kg: 716, quantity: 1000 },
      { period: '2026-02', category: 'flight-long', scope: 3, kg: 261, quantity: 1000 },
      { period: '2025-12', category: 'diesel', scope: 1, kg: 999, quantity: 1 },
    ], 2026);
    expect(t.kg).toBe(1228);
    expect(t.scope).toEqual({ 1: 251, 2: 716, 3: 261 });
    expect(t.byMonth['2026-01']).toBe(967);
    expect(t.gj).toBeCloseTo(100 * 0.036 + 1000 * 0.0036, 3);
  });
  it('works out a year of commuting', () => {
    expect(commuteKgYear('car', 10, 5)).toBeCloseTo(0.168 * 10 * 2 * 5 * 46, 3);
    expect(commuteKgYear('cycle', 10, 5)).toBe(0);
    expect(commuteKgYear('nope', 10, 5)).toBe(0);
  });
  it('draws a straight path to the target', () => {
    const p = targetPath(1000, 2024, 2030, 42);
    expect(p).toHaveLength(7);
    expect(p[0].kg).toBe(1000);
    expect(p.at(-1)!.kg).toBe(580);
    expect(targetPath(1000, 2030, 2024, 42)).toEqual([]);
  });
  it('cuts what each lever touches, and no more than all of it', () => {
    const by = { electricity: 1000, 'flight-short': 500, 'waste-landfill': 100, gas: 400 };
    const c = leverCuts(by, { renewable: { share: 1, cost: 0, saving: 0 }, rail: { share: 2, cost: 0, saving: 0 }, recycling: { share: 0.5, cost: 0, saving: 0 }, heatpump: { share: 1, cost: 0, saving: 0 } }, 'GB');
    expect(c.renewable).toBe(1000);
    expect(c.rail).toBeLessThan(500);
    expect(c.recycling).toBeCloseTo(50 * (1 - 0.021 / 0.467), 3);
    expect(c.heatpump).toBeGreaterThan(0);
    expect(c.heatpump).toBeLessThan(400);
    expect(c.fleet).toBe(0);
  });
  it('prices a tonne over ten years, negative when it pays for itself', () => {
    expect(costPerTonne({ share: 1, cost: 10_000, saving: 0 }, 2000)).toBe(500);
    expect(costPerTonne({ share: 1, cost: 0, saving: 1000 }, 2000)).toBe(-500);
    expect(costPerTonne({ share: 1, cost: 0, saving: 0 }, 2000)).toBeNull();
    expect(costPerTonne(undefined, 2000)).toBeNull();
  });
});
