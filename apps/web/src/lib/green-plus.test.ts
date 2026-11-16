import { describe, expect, it } from 'vitest';
import { FOOTPRINT_DEFAULT, equivalents, footprint, journey, logFor, longestStreak, readFootprint, yearGrid } from './green-plus';

// M216: Green's calculators add up and stay within sensible bounds.
describe('footprint', () => {
  it('adds the parts, shares home energy between the people living there', () => {
    const f = footprint(FOOTPRINT_DEFAULT);
    expect(f.parts.map((p) => p.id)).toEqual(['travel', 'flights', 'home', 'food', 'stuff']);
    expect(f.total).toBe(f.parts.reduce((s, p) => s + p.kg, 0));
    expect(f.parts.find((p) => p.id === 'travel')!.kg).toBe(Math.round(100 * 52 * 0.17 + 30 * 52 * 0.06));
    const alone = footprint({ ...FOOTPRINT_DEFAULT, people: 1 }).parts.find((p) => p.id === 'home')!.kg;
    expect(alone).toBe(2 * footprint(FOOTPRINT_DEFAULT).parts.find((p) => p.id === 'home')!.kg);
  });
  it('clamps and checks answers', () => {
    const a = readFootprint({ carKmWeek: 1e9, car: 'rocket', diet: 'vegan', people: 0, greenPower: 'yes', shortFlights: 2.6 });
    expect(a).toMatchObject({ carKmWeek: 3000, car: 'petrol', diet: 'vegan', people: 1, greenPower: false, shortFlights: 3 });
  });
});

describe('a journey', () => {
  it('ranks the ways of going, shares a car, leaves the bike out of long trips', () => {
    const j = journey(300, 2);
    expect(j[0].id).toBe('ev'); // 7.5 kg for two sharing, below the coach's 8.1
    expect(journey(300)[0].id).toBe('coach');
    expect(j.find((m) => m.id === 'car')!.kg).toBe(25.5);
    expect(j.some((m) => m.id === 'bike')).toBe(false);
    expect(journey(5)[0]).toMatchObject({ id: 'bike', kg: 0 });
    expect(journey(6000).find((m) => m.id === 'plane')!.kg).toBe(900);
    expect(logFor('train', 300)).toEqual({ kind: 'TRANSIT', amount: 300 });
    expect(logFor('plane', 300)).toBeNull();
  });
});

describe('a year', () => {
  it('lays out 53 weeks to today, and finds the longest streak', () => {
    const g = yearGrid({ '2026-11-16': 2.5 }, '2026-11-16');
    expect(g.length).toBe(53);
    expect(g[g.length - 1].at(-1)).toEqual({ day: '2026-11-16', kg: 2.5 });
    expect(g[0].length).toBe(7);
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-02', '2026-01-03', '2026-02-01'])).toBe(3);
    expect(equivalents(22)[0]).toMatchObject({ id: 'trees', value: 1 });
  });
});
