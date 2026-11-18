import { describe, expect, it } from 'vitest';
import type { Listing } from './travel-guide';
import { fit, makeItinerary } from './travel-itinerary';

// A small made-up city: sights east and west of a hotel, places to eat and a café beside them.
const L = (name: string, kind: Listing['kind'], lat: number, lon: number, text = '', guide?: string): Listing => ({ name, kind, lat, lon, text, guide });
const city: Listing[] = [
  L('West Castle', 'see', 38.71, -9.16, 'A medieval castle with views.', 'Town/West'), L('West Museum', 'see', 38.712, -9.162, 'The art museum.', 'Town/West'),
  L('West Garden', 'see', 38.708, -9.158, 'A botanic garden.', 'Town/West'), L('West Tower', 'see', 38.709, -9.165, 'An old tower.', 'Town/West'),
  L('East Cathedral', 'see', 38.71, -9.12, 'The famous cathedral.', 'Town/East'), L('East Market', 'see', 38.712, -9.118, 'A food market.', 'Town/East'),
  L('East Palace', 'see', 38.708, -9.122, 'A royal palace.', 'Town/East'), L('East Park', 'see', 38.709, -9.125, 'A park on the hill.', 'Town/East'),
  L('West Tavern', 'eat', 38.7105, -9.161), L('West Grill', 'eat', 38.709, -9.159), L('East Bistro', 'eat', 38.7105, -9.121), L('East Diner', 'eat', 38.709, -9.123),
  L('West Café', 'drink', 38.711, -9.16), L('East Café', 'drink', 38.711, -9.12), L('Closed Fort', 'see', 38.71, -9.14, 'Closed for restoration, temporarily.'),
];
const stay = { lat: 38.71, lon: -9.14 };

describe('the automatic itinerary (M329)', () => {
  it('keeps each day to one side of town, starting and ending at the stay', () => {
    const p = makeItinerary({ listings: city, days: 2, stay, centre: null, pace: 'balanced', interests: [], have: [] });
    const sights = (d: number) => p.add.filter((x) => x.day === d && x.kind === 'see').map((x) => x.name.split(' ')[0]);
    expect(sights(0).length).toBe(4);
    expect(new Set(sights(0)).size).toBe(1);
    expect(new Set(sights(1)).size).toBe(1);
    expect(sights(0)[0]).not.toBe(sights(1)[0]);
    expect(p.areas.sort()).toEqual(['East', 'West']);
    expect(p.add.some((x) => x.name === 'Closed Fort')).toBe(false);
  });
  it('adds lunch, a coffee break and dinner near where you are, with their reason', () => {
    const p = makeItinerary({ listings: city, days: 1, stay, centre: null, pace: 'balanced', interests: [], have: [] });
    const day = p.add.filter((x) => x.day === 0).sort((a, b) => a.position - b.position);
    const lunch = day.find((x) => x.note?.startsWith('Lunch'));
    expect(lunch).toBeTruthy();
    expect(lunch!.name.split(' ')[0]).toBe(day.find((x) => x.kind === 'see')!.name.split(' ')[0]);
    expect(day.at(-1)!.note).toMatch(/^Dinner/);
    expect(day.map((x) => x.position)).toEqual(day.map((_, i) => i));
  });
  it('fits in what is already on the trip and never adds it twice', () => {
    const have = [{ id: 'h1', name: 'East Palace', kind: 'see', lat: 38.708, lon: -9.122, day: null, position: 0, minutes: 60 }];
    const p = makeItinerary({ listings: city, days: 2, stay, centre: null, pace: 'relaxed', interests: [], have });
    expect(p.add.some((x) => x.name === 'East Palace')).toBe(false);
    expect(p.move.find((m) => m.id === 'h1')).toBeTruthy();
  });
  it('a light day gets half as many places, interests rank what matches first', () => {
    const p = makeItinerary({ listings: city, days: 2, stay, centre: null, pace: 'balanced', interests: [], have: [], light: [0] });
    expect(p.add.filter((x) => x.day === 0 && x.kind === 'see').length).toBe(2);
    expect(p.starts).toEqual({ 0: 14 * 60, 1: 9 * 60 });
    expect(fit(city[1], ['art'], 0.5, stay)).toBeGreaterThan(fit(city[2], ['art'], 0.5, stay));
  });
});
