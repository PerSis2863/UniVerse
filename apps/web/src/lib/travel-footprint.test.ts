import { describe, expect, it } from 'vitest';
import { legKg, modesFor, tripFootprint } from './travel-footprint';

const stop = (id: string, cc: string, lat: number, lon: number, mode: string | null = null) => ({ id, guide: id, name: id, cc, lat, lon, days: 2, position: 0, mode });

describe('trip footprint (M247)', () => {
  it('works out a leg by its way, for everyone travelling', () => {
    expect(legKg(300, 'train', 2)).toBe(25.2); // 300 × 1.2 × 0.035 × 2
    expect(legKg(300, 'plane', 1)).toBe(75); // short flights count more
    expect(legKg(1000, 'plane', 1)).toBe(150);
    expect(legKg(100, 'car', 3)).toBe(20.4); // one car for three
    expect(modesFor(2500, false)).toEqual(['plane']);
    expect(modesFor(400, true)).toEqual(['plane', 'ferry']);
  });
  it('totals a trip against its greenest version', () => {
    const f = tripFootprint([stop('Lisbon', 'PT', 38.71, -9.14), stop('Porto', 'PT', 41.15, -8.61, 'plane'), stop('Madrid', 'ES', 40.42, -3.7)], 2);
    expect(f.legs.map((l) => [l.mode, l.chosen, l.best])).toEqual([['plane', true, 'bus'], ['train', false, 'bus']]);
    expect(f.total).toBeGreaterThan(f.greenest);
    expect(f.perPerson).toBeCloseTo(f.total / 2, 0);
  });
});
