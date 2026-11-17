import { describe, expect, it } from 'vitest';
import type { Guide } from './travel-guide';
import { aroundStay, walkMinutes } from './travel-stay';

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
});
