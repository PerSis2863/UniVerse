import { describe, expect, it } from 'vitest';
import { areaSearchUrl, bow, destOf, foundOf, legKey, roadLegs, tripBox, tripDaysOn, tripFeatures, type TripMap } from './map-world';
import { IDEAS } from '@/lib/travel-ideas';

const stop = (id: string, name: string, lat: number | null, lon: number | null, days: number, position: number) => ({ id, guide: name, name, cc: 'PT', lat, lon, days, position });
const item = (id: string, stopId: string, day: number | null, lat: number | null, lon: number | null) => ({ id, stopId, day, position: 0, name: id, kind: 'see', lat, lon, hours: null, price: null, minutes: 60 });
const trip: TripMap = {
  startDate: '2026-12-01',
  stops: [stop('a', 'Lisbon', 38.72, -9.14, 3, 0), stop('b', 'Porto', 41.15, -8.61, 2, 1), stop('c', 'Nowhere', null, null, 1, 2)],
  items: [item('x', 'a', 0, 38.71, -9.13), item('y', 'b', 1, 41.14, -8.6), item('z', 'b', null, 41.16, -8.62), item('w', 'a', 2, null, null)],
};

describe('a trip on the map', () => {
  it('draws the way through its cities in order, numbered, and its places by the day of the whole trip', () => {
    const fc = tripFeatures(trip, null), role = (r: string) => fc.features.filter((f) => f.properties?.role === r);
    expect(role('path')[0].geometry).toEqual({ type: 'LineString', coordinates: [[-9.14, 38.72], [-8.61, 41.15]] });
    expect(role('stop').map((f) => f.properties?.num)).toEqual(['1', '2']);
    // Porto starts on day 4 (Lisbon has three), so its second day is day 5; a place not planned is grey.
    expect(role('item').map((f) => f.properties?.label)).toEqual(['Day 1', 'Day 5', 'Not planned']);
    expect(tripDaysOn(trip)).toEqual([1, 5]);
  });
  it('shows one day alone and frames what is drawn', () => {
    const fc = tripFeatures(trip, 5);
    expect(fc.features.filter((f) => f.properties?.role === 'item').map((f) => f.properties?.id)).toEqual(['y']);
    expect(tripBox(fc)).toEqual([[-9.14, 38.72], [-8.6, 41.15]]);
    expect(tripFeatures(null, null).features).toEqual([]);
    expect(tripBox(tripFeatures(null, null))).toBeNull();
  });
  it('draws the way travelled solid and the way ahead dotted, with the city of today (M264)', () => {
    const paths = (today: number | null) => tripFeatures(trip, null, today).features.filter((f) => f.properties?.role === 'path').map((f) => [f.properties?.done, (f.geometry as GeoJSON.LineString).coordinates.length]);
    const states = (today: number | null) => tripFeatures(trip, null, today).features.filter((f) => f.properties?.role === 'stop').map((f) => f.properties?.state);
    expect(paths(null)).toEqual([[false, 2]]);
    expect(states(null)).toEqual(['next', 'next']);
    expect(states(2)).toEqual(['now', 'next']); // day 2: in Lisbon (days 1–3)
    expect(paths(4)).toEqual([[true, 2]]); // day 4: in Porto, the way there travelled
    expect(states(4)).toEqual(['done', 'now']);
    expect(states(9)).toEqual(['done', 'done']);
  });
});

describe('destinations', () => {
  it('knows a hand-picked place from its index and a town from its own fields', () => {
    const k = IDEAS.findIndex((i) => i.title === 'Kyoto');
    expect(destOf({ i: k }, 0, 0)).toMatchObject({ name: 'Kyoto', cc: 'JP', idea: { title: 'Kyoto' } });
    expect(destOf({ n: 'Coimbra', c: 'PT', p: 143 }, 40.2, -8.42)).toEqual({ name: 'Coimbra', cc: 'PT', lat: 40.2, lon: -8.42, pop: 143, idea: null });
  });
  it('every hand-picked place has a position', () => {
    expect(IDEAS.filter((i) => i.lat == null || i.lon == null).map((i) => i.title)).toEqual([]);
    expect(new Set(IDEAS.map((i) => i.title)).size).toBe(IDEAS.length);
  });
});

describe('search this area', () => {
  it('asks Nominatim only inside the view', () => {
    const u = new URL(areaSearchUrl('pizza', { s: 38.7, w: -9.2, n: 38.75, e: -9.1 }));
    expect(u.host).toBe('nominatim.openstreetmap.org');
    expect(u.searchParams.get('viewbox')).toBe('-9.2000,38.7500,-9.1000,38.7000');
    expect(u.searchParams.get('bounded')).toBe('1');
  });
  it('keeps named places with a position, once each, with their OpenStreetMap key', () => {
    const got = foundOf([
      { osm_type: 'node', osm_id: 12, lat: '38.71', lon: '-9.13', name: 'Pizzeria Uno', display_name: 'Pizzeria Uno, Rua A, Lisboa, Portugal', category: 'amenity', type: 'restaurant' },
      { osm_type: 'node', osm_id: 12, lat: '38.71', lon: '-9.13', name: 'Pizzeria Uno' },
      { osm_type: 'way', osm_id: 7, lat: 'x', lon: '1', name: 'Broken' },
      { osm_type: 'relation', osm_id: 9, lat: '38.72', lon: '-9.14', name: '', display_name: 'Praça, Lisboa' },
    ]);
    expect(got).toEqual([
      { key: 'N12', name: 'Pizzeria Uno', cls: 'amenity', sub: 'restaurant', lat: 38.71, lon: -9.13, address: 'Rua A, Lisboa' },
      { key: 'R9', name: 'Praça', cls: '', sub: '', lat: 38.72, lon: -9.14, address: 'Lisboa' },
    ]);
    expect(foundOf({ error: 'busy' })).toEqual([]);
  });
  it('follows the roads between cities, arcs a flight, and draws the day’s walk (M265)', () => {
    expect(roadLegs(trip).map((l) => l.key)).toEqual(['a>b']);
    const road: [number, number][] = [[-9.14, 38.72], [-8.9, 39.6], [-8.61, 41.15]];
    const path = tripFeatures(trip, null, null, new Map([[legKey({ id: 'a' }, { id: 'b' }), road]])).features.find((f) => f.properties?.role === 'path');
    expect((path!.geometry as GeoJSON.LineString).coordinates).toEqual(road);
    const flown: TripMap = { ...trip, stops: trip.stops.map((x) => (x.id === 'b' ? { ...x, mode: 'plane' } : x)) };
    expect(roadLegs(flown)).toEqual([]);
    const arc = bow([0, 0], [10, 0]);
    expect(arc[0]).toEqual([0, 0]);
    expect(arc[arc.length - 1]).toEqual([10, 0]);
    expect(arc[12][1]).toBeCloseTo(0.71, 1); // bowed to one side half way
    const walk = tripFeatures(trip, 1, null, undefined, [[-9.2, 38.69], [-9.15, 38.7], [-9.13, 38.71]]).features.filter((f) => f.properties?.role === 'walk');
    expect(walk).toHaveLength(1);
  });
});
