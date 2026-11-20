import { describe, expect, it } from 'vitest';
import { transitApps, waysBetween } from './transit-options';

const paris = { lat: 48.8566, lon: 2.3522 }, lyon = { lat: 45.764, lon: 4.8357 }, louvre = { lat: 48.8606, lon: 2.3376 }, tokyo = { lat: 35.6762, lon: 139.6503 };

describe('public transport options (M356)', () => {
  it('across a city: city transport and the drive, no train or flight', () => {
    const kinds = waysBetween(paris, louvre).map((w) => w.kind);
    expect(kinds).toContain('local');
    expect(kinds).not.toContain('train');
    expect(kinds).not.toContain('flight');
  });
  it('between cities: train fastest, coach, flight and drive, each with time and CO₂', () => {
    const ways = waysBetween(paris, lyon);
    expect(ways.map((w) => w.kind)).toEqual(expect.arrayContaining(['train', 'bus', 'flight', 'car']));
    expect(ways.find((w) => w.kind === 'train')!.minutes).toBeLessThan(ways.find((w) => w.kind === 'bus')!.minutes);
    expect(ways[0].kind).toBe('train'); // Paris–Lyon: the high-speed train, about two and a half hours door to door
    expect(ways.find((w) => w.kind === 'train')!.kg).toBeLessThan(ways.find((w) => w.kind === 'flight')!.kg);
    for (const w of ways) { expect(w.minutes % 5).toBe(0); expect(w.minutes).toBeGreaterThan(0); }
    expect(ways.map((w) => w.minutes)).toEqual([...ways.map((w) => w.minutes)].sort((x, y) => x - y));
  });
  it('across the world: only the flight', () => expect(waysBetween(paris, tokyo).map((w) => w.kind)).toEqual(['flight']));
  it('next door: nothing to take', () => expect(waysBetween(paris, { lat: 48.8567, lon: 2.3523 })).toEqual([]));
  it('opens the exact route in Google Maps, Apple Maps and Citymapper', () => {
    const [g, a, c] = transitApps({ ...paris, name: 'Paris' }, { ...lyon, name: 'Lyon' });
    expect(g.url).toContain('travelmode=transit');
    expect(a.url).toContain('dirflg=r');
    expect(new URL(c.url).searchParams.get('endname')).toBe('Lyon');
  });
});
