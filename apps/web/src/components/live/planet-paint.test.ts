import { describe, expect, it } from 'vitest';
import { BASE, toBase } from '@/components/trace/map/engine';
import { MASK, landLookup, maskIndex } from './planet-paint';

// The planet's land picture (M85): the background thread finds a place's pixel without d3, so its
// sums must land on exactly the pixel the maps' own projection gives.
describe('the planet’s land picture', () => {
  it('finds the same pixel as the maps’ projection, edges included', () => {
    const k = MASK / BASE;
    const pixel = (lat: number, lon: number) => {
      const [x, y] = toBase(lon, lat);
      return Math.min(MASK - 1, Math.max(0, Math.round(y * k))) * MASK + Math.min(MASK - 1, Math.max(0, Math.round(x * k)));
    };
    let wrong = 0, n = 0;
    for (let lat = -83; lat <= 83; lat += 0.37) for (let lon = -180; lon <= 180; lon += 0.53) { n++; if (maskIndex(lat, lon) !== pixel(lat, lon)) wrong++; }
    for (const [lat, lon] of [[0, 180], [0, -180], [83, 0], [-83, 179.999], [12.5, 180.0000000001]]) { n++; if (maskIndex(lat, lon) !== pixel(lat, lon)) wrong++; }
    expect(n).toBeGreaterThan(150_000);
    expect(wrong).toBe(0);
  });
  it('is land only where the picture says so, and never near the poles', () => {
    const bits = new Uint8Array(MASK * MASK);
    bits[maskIndex(48.85, 2.35)] = 1; // Paris
    const land = landLookup(bits);
    expect(land(48.85, 2.35)).toBe(true);
    expect(land(-33.9, 151.2)).toBe(false);
    bits.fill(1);
    expect(land(84, 0)).toBe(false);
  });
});
