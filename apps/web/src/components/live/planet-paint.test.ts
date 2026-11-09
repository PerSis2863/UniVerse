import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE, toBase } from '@/components/trace/map/engine';
import { MASK, drawPlanet, landLookup, maskIndex, nearestPlace, planetLinks, planetPoints, planetState } from './planet-paint';

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

// M131: the landing's globe, turned by hand and clicked.
describe('the turnable planet', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('picks the place drawn nearest a click, within 18 px', () => {
    const xy = new Float32Array([100, 100, 200, 120, -1e4, 0]);
    expect(nearestPlace(xy, 104, 98)).toBe(0);
    expect(nearestPlace(xy, 196, 126)).toBe(1);
    expect(nearestPlace(xy, 150, 300)).toBe(-1);
  });
  it('turns to face the chosen place', () => {
    // A 2D context that takes any drawing call (sprites are OffscreenCanvases off the page).
    const anything = (): object => new Proxy({} as Record<string | symbol, unknown>, { get: (t, k) => (k in t ? t[k] : () => anything()), set: (t, k, v) => { t[k] = v; return true; } });
    vi.stubGlobal('OffscreenCanvas', class { width = 1; height = 1; getContext() { return anything(); } });
    const places = [{ label: 'UniVersity', lat: 50, lon: 4 }, { label: 'Play', lat: 38, lon: -98 }];
    const s = planetState(), ctx = anything() as CanvasRenderingContext2D;
    const props = { pts: planetPoints(places), links: planetLinks(places), land: null, interactive: false, turnable: true, focus: { lat: 38, lon: -98 }, selected: [1], pings: true };
    for (let t = 0; t < 3; t += 0.016) drawPlanet(s, { ctx, w: 600, h: 600, t, pointer: null, still: false }, props, 1);
    expect(Math.hypot(s.xy[2] - 300, s.xy[3] - 300)).toBeLessThan(6);
  });
});
