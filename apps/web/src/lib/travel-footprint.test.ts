import { describe, expect, it } from 'vitest';
import { legKg, legMinutes, modesFor, tripFootprint } from './travel-footprint';

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
  it('compares every way of a leg by time and CO₂ (M357)', () => {
    expect(legMinutes(460, 'train')).toBeLessThan(legMinutes(460, 'plane')); // Paris–Lyon: the fast train beats flying door to door
    expect(legMinutes(2000, 'plane')).toBeLessThan(legMinutes(2000, 'train'));
    const f = tripFootprint([stop('Paris', 'FR', 48.86, 2.35), stop('Lyon', 'FR', 45.76, 4.84)], 1);
    const w = f.legs[0].ways;
    expect(w.map((x) => x.mode)).toEqual(['train', 'plane', 'car', 'bus']);
    expect(w.find((x) => x.fastest)?.mode).toBe('train');
    expect(w.find((x) => x.greenest)?.mode).toBe(f.legs[0].best);
    expect(f.minutes).toBe(f.legs[0].minutes);
  });
});
