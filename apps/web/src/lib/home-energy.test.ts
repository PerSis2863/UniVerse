import { describe, expect, it } from 'vitest';
import { homeEnergyKg } from './green';
import { byMonth, compareLatest } from './home-energy';

describe('home energy from bills', () => {
  it('uses the country’s grid, a green tariff, and gas by kWh or cubic metre', () => {
    expect(homeEnergyKg('ELECTRICITY', 300, 'kWh', { country: 'in' })).toBe(213);
    expect(homeEnergyKg('ELECTRICITY', 300, 'kWh', { country: 'XX' })).toBe(144);
    expect(homeEnergyKg('ELECTRICITY', 300, 'kWh', { country: 'IN', greenTariff: true })).toBe(9);
    expect(homeEnergyKg('GAS', 100, 'm3')).toBe(193.1);
    expect(homeEnergyKg('OIL', 10, 'L')).toBe(25.4);
  });
  it('adds up each month and compares the latest', () => {
    const m = byMonth([{ month: '2025-11', kind: 'GAS', kg: 100 }, { month: '2026-10', kind: 'ELECTRICITY', kg: 60 }, { month: '2026-11', kind: 'GAS', kg: 80 }, { month: '2026-11', kind: 'ELECTRICITY', kg: 40 }], 2);
    expect(m.map((x) => [x.month, x.kg, x.perPerson])).toEqual([['2025-11', 100, 50], ['2026-10', 60, 30], ['2026-11', 120, 60]]);
    expect(compareLatest(m)).toEqual({ month: '2026-11', kg: 120, vsYearAgo: 20, vsAverage: 50 });
  });
});
