import { describe, expect, it } from 'vitest';
import { classesOf, kindOf, bubbleAt, ROUTER, routeOf, routeUrl, walkFrom, walkInGoogle, walkStay, withLegs, type MapPlace } from './travel-map';

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

describe('street photos (M214)', () => {
  it('takes the first picture on an allowed instance, with who took it and when', async () => {
    const { streetPhotoOf } = await import('./travel-map');
    const pic = (host: string, id: string) => ({ id, geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { datetime: '2025-07-08T07:46:35+00:00', 'view:azimuth': 81 }, providers: [{ name: 'mapcomplete', roles: ['producer'] }, { name: 'Ana', roles: ['producer'] }], assets: { thumb: { href: `https://${host}/t.jpg` }, sd: { href: `https://${host}/sd.jpg` }, hd: { href: `https://${host}/hd.jpg` } } });
    expect(streetPhotoOf({ features: [pic('evil.example', 'a'), pic('panoramax.openstreetmap.fr', 'b')] })).toMatchObject({ id: 'b', by: 'Ana', heading: 81, lat: 48.85, lon: 2.35, sd: 'https://panoramax.openstreetmap.fr/sd.jpg' });
    expect(streetPhotoOf({ features: [pic('panoramax.ign.fr.evil.example', 'c')] })).toBeNull();
    expect(streetPhotoOf(null)).toBeNull();
    expect(streetPhotoOf({ features: 'x' })).toBeNull();
  });
});

describe('the walk along real streets (M229)', () => {
  const start = { lat: 47.21, lon: -1.564 }, a = { key: 'N1', name: 'A', rank: 1, lat: 47.216, lon: -1.556, walk: 9, stay: 15, at: 9 }, b = { key: 'N2', name: 'B', rank: 2, lat: 47.218, lon: -1.553, walk: 3, stay: 20, at: 27 };
  // The router's real answer for these three points (trimmed path).
  const answer = { code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[-1.564026, 47.210038], [-1.561622, 47.212201], [-1.556096, 47.21606], [-1.552985, 47.21796]] }, legs: [{ duration: 843.8, distance: 1055.2 }, { duration: 309.2, distance: 383.7 }] }] };

  it('asks for the start and the stops in order, longitude first', () => {
    expect(routeUrl(start, [a, b])).toBe(`${ROUTER}-1.56400,47.21000;-1.55600,47.21600;-1.55300,47.21800?overview=full&geometries=geojson`);
  });
  it('reads the path and each leg, and refuses answers that do not fit', () => {
    const r = routeOf(answer, 2)!;
    expect(r.path).toHaveLength(4);
    expect(r.legs.map((l) => [l.min, Math.round(l.km * 1000)])).toEqual([[14, 1055], [5, 384]]);
    expect(routeOf(answer, 3)).toBeNull();
    expect(routeOf({ code: 'NoRoute' }, 2)).toBeNull();
    expect(routeOf(null, 2)).toBeNull();
  });
  it('puts the true walking minutes into the walk', () => {
    const w = withLegs({ stops: [a, b], total: 47, km: 1.2 }, routeOf(answer, 2)!.legs);
    expect(w.stops.map((s) => [s.walk, s.at])).toEqual([[14, 14], [5, 34]]);
    expect([w.total, w.km]).toEqual([54, 1.4]);
  });
  it('opens the whole walk in Google Maps, on foot', () => {
    const u = new URL(walkInGoogle(start, [a, b]));
    expect([u.searchParams.get('travelmode'), u.searchParams.get('origin'), u.searchParams.get('destination'), u.searchParams.get('waypoints')]).toEqual(['walking', '47.21000,-1.56400', '47.21800,-1.55300', '47.21600,-1.55600']);
  });
});

describe('the walk time bubble (M229)', () => {
  it('sits on the path by the middle of the longest stretch, never on a stop', () => {
    const path: [number, number][] = [[0, 0], [1, 0], [1, 4], [2, 4]];
    expect(bubbleAt(path, [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 4, lon: 1 }, { lat: 4, lon: 2 }])).toEqual([1, 2]);
    expect(bubbleAt([[0, 0], [2, 2]], [{ lat: 0, lon: 0 }, { lat: 2, lon: 2 }])).toEqual([1, 1]);
  });
});
