import { describe, expect, it } from 'vitest';
import type { Guide } from './travel-guide';
import { aroundStay, districtsNear, walkMinutes, withDistricts } from './travel-stay';

const at = (kind: 'see' | 'eat' | 'buy' | 'sleep', name: string, lat: number, lon: number) => ({ kind, name, lat, lon });
const guide = {
  title: 'Paris', summary: [], places: [],
  sections: [
    { part: 'see', title: 'See', text: [], listings: [at('see', 'Far tower', 48.858, 2.2945), at('see', 'Near church', 48.853, 2.35), { kind: 'see', name: 'No position' }] },
    { part: 'eat', title: 'Eat', text: [], listings: [at('eat', 'Bistro', 48.8535, 2.349), at('sleep', 'A hotel', 48.85, 2.35)] },
    { part: 'buy', title: 'Buy', text: [], listings: [at('buy', 'Out of town mall', 48.95, 2.6)] },
  ],
} as unknown as Guide;

describe('around a stay (M232)', () => {
  it('groups the guide by kind, nearest first, with a walk', () => {
    const near = aroundStay(guide, { lat: 48.8534, lon: 2.3488 });
    expect(near.see.map((s) => s.name)).toEqual(['Near church', 'Far tower']);
    expect(near.eat.map((s) => s.name)).toEqual(['Bistro']); // a hotel isn't a recommendation
    expect(near.buy.map((s) => s.name)).toEqual(['Out of town mall']); // none close: the nearest anyway
    expect(near.do).toEqual([]);
    expect(walkMinutes(near.see[0].km)).toBeLessThan(5);
    expect(walkMinutes(0)).toBe(1);
  });
  it('finds the stay\'s district from the sights near it and adds its places (M232)', () => {
    const city = { title: 'Paris', summary: [], places: [], sections: [{ part: 'see', title: 'See', text: [], listings: [
      { kind: 'see', name: 'Arc', lat: 48.8738, lon: 2.295, guide: 'Paris/8th arrondissement' },
      { kind: 'see', name: 'Tower', lat: 48.858, lon: 2.2945, guide: 'Paris/7th arrondissement' },
      { kind: 'see', name: 'Louvre', lat: 48.8606, lon: 2.3376, guide: 'Paris/1st arrondissement' },
      { kind: 'see', name: 'Elsewhere', lat: 48.87, lon: 2.31, guide: 'Versailles' },
    ] }] } as unknown as Guide;
    const stay = { lat: 48.8718, lon: 2.315 }; // Le Bristol, 8th
    expect(districtsNear(city, stay)).toEqual(['Paris/8th arrondissement', 'Paris/1st arrondissement']);
    const eighth = { title: 'Paris/8th arrondissement', summary: [], places: [], sections: [{ part: 'eat', title: 'Eat', text: [], listings: [{ kind: 'eat', name: 'Ladurée', lat: 48.8712, lon: 2.3039 }, { kind: 'see', name: 'arc', lat: 48.8738, lon: 2.295 }] }] } as unknown as Guide;
    const near = aroundStay(withDistricts(city, [eighth, undefined]), stay);
    expect(near.eat.map((x) => x.name)).toEqual(['Ladurée']);
    expect(near.see.filter((x) => x.name.toLowerCase() === 'arc')).toHaveLength(1); // listed twice, kept once
  });
});
