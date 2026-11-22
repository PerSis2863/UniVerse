import { describe, expect, it } from 'vitest';
import { mapsLink, orderStops, routeSummary, reach, reachLink } from './relief-route';

const at = (id: string, lat: number, lng: number) => ({ id, lat, lng });

describe('a helper’s delivery route', () => {
  it('visits nearby stops before far ones and untangles crossings', () => {
    const start = { lat: 0, lng: 0 };
    const order = orderStops(start, [at('far', 0, 0.09), at('near', 0, 0.01), at('mid', 0, 0.05)]);
    expect(order.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
    const square = orderStops(start, [at('a', 0, 0.02), at('b', 0.02, 0.02), at('c', 0.02, 0), at('d', 0.01, 0.01)]);
    expect(square.map((s) => s.id).join('')).not.toBe('acbd');
  });
  it('sums legs and links to the map', () => {
    const s = routeSummary({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0.09 }], 'walk');
    expect(s.km).toBeGreaterThan(12);
    expect(s.minutes).toBeGreaterThan(150);
    const url = mapsLink({ lat: 1, lng: 2 }, [{ lat: 1.1, lng: 2 }, { lat: 1.2, lng: 2 }], 'drive');
    expect(url).toContain('travelmode=driving');
    expect(decodeURIComponent(url)).toContain('waypoints=1.10000,2.00000');
  });
});

describe('the quickest way to a need (M362)', () => {
  it('lists every way and picks the quickest', () => {
    const helper = { lat: 19.076, lng: 72.8777 }, need = { lat: 19.1, lng: 72.88 }; // ~2.7 km in Mumbai
    const r = reach(helper, need);
    expect(r.ways.map((w) => w.mode)).toEqual(['foot', 'bike', 'transit', 'car']);
    expect(r.best?.mode).toBe('car');
    expect(r.best?.words).toBe('by car');
    expect(reach(helper, helper).best).toBeNull();
    expect(reachLink(helper, need, 'transit')).toContain('travelmode=transit');
  });
});
