import { describe, expect, it } from 'vitest';
import { climbOf, destination, nightArea, plusCode, reachOf, samples, sunLines, terrarium, tileOf, tileZoom } from './map-extras';
import { subsolar } from './travel-local';

const inside = (pt: [number, number], ring: number[][]) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

describe('map extras (M336)', () => {
  it('gives Google’s Plus Codes', () => {
    expect(plusCode(47.365590, 8.524997)).toBe('8FVC9G8F+6X');
    expect(plusCode(-41.2730625, 174.7859375)).toBe('4VCPPQGP+Q9');
  });
  it('finds the sun overhead and the night side', () => {
    const june = subsolar(new Date('2026-06-21T12:00:00Z'));
    expect(june.lat).toBeGreaterThan(23); expect(Math.abs(june.lon)).toBeLessThan(5);
    const ring = (nightArea(new Date('2026-06-21T12:00:00Z')).features[0].geometry as GeoJSON.Polygon).coordinates[0];
    expect(inside([170, 0], ring)).toBe(true); // midnight in the Pacific
    expect(inside([0, 10], ring)).toBe(false); // noon in Africa
    expect(inside([0, -80], ring)).toBe(true); // Antarctica's winter
  });
  it('draws the sun’s directions', () => {
    const fc = sunLines(51.5, -0.1, 14, new Date('2026-06-21T12:00:00Z'), () => 'x');
    const roles = fc.features.filter((f) => f.geometry.type === 'LineString').map((f) => f.properties!.role);
    expect(roles).toEqual(['rise', 'set', 'now']);
    const rise = fc.features[0].geometry as GeoJSON.LineString;
    expect(rise.coordinates[1][0]).toBeGreaterThan(-0.1); // the sun rises in the north-east in June
    expect(rise.coordinates[1][1]).toBeGreaterThan(51.5);
  });
  it('goes a distance along a bearing', () => {
    const [lon, lat] = destination(0, 0, 90, 111.195);
    expect(lon).toBeCloseTo(1, 2); expect(lat).toBeCloseTo(0, 5);
  });
  it('reads heights and tiles', () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(129, 44, 128)).toBe(300.5);
    expect(tileOf(0, 0, 1)).toEqual({ x: 1, y: 1, px: 0, py: 0 });
    expect(tileZoom([[-9.14, 38.71], [-9.13, 38.72]])).toBe(12);
    expect(tileZoom(samples([[-9, 38], [2, 48]], 60).map((x) => x.at))).toBeLessThan(9);
  });
  it('samples a path and counts its climb', () => {
    const s = samples([[0, 0], [0, 1], [1, 1]], 5);
    expect(s).toHaveLength(5); expect(s[0].at).toEqual([0, 0]); expect(s[4].at[0]).toBeCloseTo(1); expect(s[2].at[1]).toBeCloseTo(1, 1);
    expect(climbOf([100, 101, 110, 108, 120, 90])).toEqual({ up: 20, down: 30, low: 90, high: 120 });
  });
  it('reads the walking reach', () => {
    const poly = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const fc = reachOf({ features: [{ type: 'Feature', geometry: poly, properties: { contour: 5 } }, { type: 'Feature', geometry: poly, properties: { contour: 15 } }, { type: 'Feature', geometry: null, properties: {} }] });
    expect(fc?.features.map((f) => f.properties!.label)).toEqual(['15 min walk', '5 min walk']);
    expect(reachOf({ error: 'x' })).toBeNull();
  });
});
