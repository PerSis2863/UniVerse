import { describe, expect, it } from 'vitest';
import { canRecord, viewFor, type ChainFull } from './trace-chain';

const full: ChainFull = {
  price: 12.5, currency: 'EUR', batch: { label: 'Harvest 3', quantity: 500 }, handling: { maxTempC: 8, weightKg: 0.6 }, destination: 'Paris',
  stops: [{ stage: 'MADE', place: 'Jaén, ES', at: '2026-11-01T08:00:00Z', role: 'BRAND', by: 'Ana Ortega' }], scans: 3,
};

describe('what each role sees of a unit', () => {
  it('never gives a driver or a warehouse the price, or anyone but the brand the names', () => {
    for (const role of ['DRIVER', 'WAREHOUSE'] as const) {
      const v = viewFor(role, full);
      expect(v).not.toHaveProperty('price');
      expect(v).not.toHaveProperty('currency');
      expect(v.stops[0]).not.toHaveProperty('by');
      expect(v.destination).toBe('Paris');
      expect(v.handling).toEqual({ maxTempC: 8, weightKg: 0.6 });
    }
    expect(viewFor('DRIVER', full)).not.toHaveProperty('batch');
    expect(viewFor('SHOP', full).stops[0]).not.toHaveProperty('by');
  });
  it('gives the brand everything and a buyer the price and the trip only', () => {
    const brand = viewFor('BRAND', full);
    expect(brand).toMatchObject({ price: 12.5, currency: 'EUR', scans: 3, destination: 'Paris' });
    expect(brand.stops[0].by).toBe('Ana Ortega');
    const buyer = viewFor('BUYER', full);
    expect(buyer).toMatchObject({ price: 12.5 });
    expect(buyer).not.toHaveProperty('batch');
    expect(buyer).not.toHaveProperty('destination');
    expect(buyer).not.toHaveProperty('handling');
    expect(buyer.canRecord).toEqual([]);
  });
  it('lets each role record only its own stops', () => {
    expect(canRecord('DRIVER', 'SHOP')).toBe(true);
    expect(canRecord('DRIVER', 'MADE')).toBe(false);
    expect(canRecord('SHOP', 'SHOP')).toBe(true);
    expect(canRecord('BUYER', 'SHOP')).toBe(false);
  });
});
