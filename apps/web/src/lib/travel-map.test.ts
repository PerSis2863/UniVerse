import { describe, expect, it } from 'vitest';
import { classesOf, kindOf, walkFrom, walkStay, type MapPlace } from './travel-map';

// M209: the map's kinds of place and "Walk from here".
describe('travel map', () => {
  it('names places and their kinds', () => {
    expect(kindOf('cafe')).toBe('Café');
    expect(kindOf('bus', 'bus_stop')).toBe('Bus stop');
    expect(classesOf('museum')).toContain('art_gallery');
  });
  it('walks to the most notable sights nearby, nearest next, within the time', () => {
    const p = (key: string, lat: number, lon: number, rank: number, name = key): MapPlace => ({ key, name, cls: 'attraction', rank, lat, lon });
    const start = { lat: 38.7, lon: -9.14 };
    const places = [p('far', 38.8, -9.14, 1), p('a', 38.701, -9.14, 2), p('b', 38.703, -9.14, 3), p('c', 38.705, -9.14, 9), p('museum', 38.7, -9.135, 1, 'National Museum')];
    const w = walkFrom(start, places, 180);
    expect(w.stops.map((s) => s.key)).not.toContain('far'); // 11 km away
    expect(w.stops[0].key).toBe('a'); // nearest of the notable ones first
    expect(walkFrom(start, places, 400).stops.find((s) => s.key === 'museum')!.stay).toBe(75); // a museum is a visit
    expect(w.stops.length).toBeGreaterThanOrEqual(4); // the rest are looks
    expect(w.total).toBeLessThanOrEqual(180);
    expect(walkFrom(start, places, 60).stops.length).toBeGreaterThanOrEqual(2);
    // The same place twice (its outline and its point) is walked to once; an artwork is a quick look.
    const twice = walkFrom(start, [p('x1', 38.701, -9.14, 1, 'Esfera Armilar'), { ...p('x2', 38.7011, -9.1401, 1, 'Esfera Armilar'), cls: 'art_gallery', sub: 'artwork' }, p('y', 38.702, -9.14, 2)], 180);
    expect(twice.stops.filter((s) => s.name === 'Esfera Armilar')).toHaveLength(1);
    expect(walkStay('art_gallery', 'Esfera Armilar', 'artwork')).toBe(10);
  });
});
