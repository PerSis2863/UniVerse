import { describe, expect, it } from 'vitest';
import { addressOf, photonOf, photonUrl, areaOf, area, directionsUrl, distance, duration, haversine, lengthOf, routesOf, stepText } from './map-tools';

describe('map tools (M237)', () => {
  it('asks the router of the chosen way of travel', () => {
    expect(directionsUrl('bike', { lat: 60.17, lon: 24.94 }, { lat: 60.18, lon: 24.95 })).toBe('https://routing.openstreetmap.de/routed-bike/route/v1/driving/24.94000,60.17000;24.95000,60.18000?overview=full&geometries=geojson&steps=true&alternatives=true');
  });
  it('reads routes and turns, and refuses a bad answer', () => {
    const answer = { code: 'Ok', routes: [{ duration: 600, distance: 2400, geometry: { coordinates: [[24.94, 60.17], [24.95, 60.18]] }, legs: [{ steps: [{ name: 'Kaivokatu', distance: 300, maneuver: { type: 'depart' } }, { name: 'Mannerheimintie', distance: 900, maneuver: { type: 'turn', modifier: 'left' } }, { distance: 0, maneuver: { type: 'arrive' } }] }] }] };
    const [r] = routesOf(answer);
    expect(r.minutes).toBe(10);
    expect(r.km).toBe(2.4);
    expect(r.steps.map((s) => s.text)).toEqual(['Head off along Kaivokatu', 'Turn left onto Mannerheimintie', 'You have arrived']);
    expect(routesOf({ code: 'NoRoute' })).toEqual([]);
    expect(routesOf({ code: 'Ok', routes: [{ geometry: { coordinates: [[1, 2]] } }] })).toEqual([]);
    expect(stepText({ maneuver: { type: 'fork', modifier: 'slight right' }, name: 'A1' })).toBe('Keep slightly right onto A1');
  });
  it('writes times, distances and areas', () => {
    expect(duration(12)).toBe('12 min');
    expect(duration(65)).toBe('1 h 05 min');
    expect(distance(0.347)).toBe('350 m');
    expect(distance(1.24)).toBe('1.2 km');
    expect(area(0.0042)).toBe('4,200 m²');
    expect(area(0.034)).toBe('3.4 ha');
  });
  it('measures along the ground', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.2, 0);
    const square = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0.01 }, { lat: 0.01, lon: 0 }];
    expect(lengthOf(square)).toBeCloseTo(3.34, 1);
    expect(areaOf(square)).toBeCloseTo(1.236, 1);
  });
  it('reads an address', () => {
    expect(addressOf({ display_name: '2, Kaivokatu, Kluuvi, Helsinki, Finland' })).toBe('2, Kaivokatu, Kluuvi, Helsinki');
    expect(addressOf({})).toBeNull();
  });
});

describe('real places in the search boxes (M348: a hotel in Brussels)', () => {
  it('asks near the map and reads the answer as places', () => {
    const u = new URL(photonUrl('brxxl 5', { lat: 50.8503, lon: 4.3517 }));
    expect([u.host, u.searchParams.get('q'), u.searchParams.get('lat'), u.searchParams.get('lon')]).toEqual(['photon.komoot.io', 'brxxl 5', '50.8503', '4.3517']);
    expect(new URL(photonUrl('x')).searchParams.has('lat')).toBe(false);
    const got = photonOf({ features: [
      { geometry: { coordinates: [4.3476, 50.8476] }, properties: { osm_type: 'N', osm_id: 42, osm_key: 'tourism', osm_value: 'hotel', name: 'Brxxl 5 City Centre', street: 'Rue de Woeringen', housenumber: '5', city: 'Brussels', country: 'Belgium' } },
      { geometry: { coordinates: [4.3476, 50.8476] }, properties: { osm_type: 'N', osm_id: 42, name: 'Brxxl 5 City Centre' } }, // the same again
      { geometry: { coordinates: [4.35, 50.85] }, properties: { street: 'Rue Neuve', housenumber: '1', city: 'Brussels' } }, // an address
      { geometry: { coordinates: ['x', 50] }, properties: { name: 'Nowhere' } },
      { properties: { name: 'No position' } },
    ] });
    expect(got).toEqual([
      { key: 'N42', name: 'Brxxl 5 City Centre', cls: 'tourism', sub: 'hotel', lat: 50.8476, lon: 4.3476, address: 'Rue de Woeringen 5, Brussels, Belgium' },
      { key: null, name: 'Rue Neuve 1', cls: '', sub: '', lat: 50.85, lon: 4.35, address: 'Brussels' },
    ]);
    expect(photonOf(null)).toEqual([]);
  });
});
