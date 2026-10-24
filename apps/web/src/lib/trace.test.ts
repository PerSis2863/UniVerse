import { describe, expect, it } from 'vitest';
import { CODE_LEN, MAX_BATCH, cleanCode, decodeSerial, encodeSerial, forecast, formatCode, isDiverted, journeyCarbon, splitCode, tierFor, toBase32, trustScore, verdictFor } from './trace';

describe('trace codes', () => {
  it('round-trips serial numbers', () => {
    for (const n of [0, 1, 31, 32, 1023, MAX_BATCH - 1]) expect(decodeSerial(encodeSerial(n))).toBe(n);
    expect(encodeSerial(0)).toBe('0000');
    expect(() => encodeSerial(MAX_BATCH)).toThrow();
    expect(() => encodeSerial(-1)).toThrow();
  });

  it('splits a code and forgives how people type it', () => {
    const code = `ABC123${encodeSerial(42)}9XK2M7QP`;
    expect(code).toHaveLength(CODE_LEN);
    expect(splitCode(code)).toEqual({ key: 'ABC123', serial: 42, sig: '9XK2M7QP' });
    expect(splitCode(formatCode(code).toLowerCase())).toEqual({ key: 'ABC123', serial: 42, sig: '9XK2M7QP' });
    expect(cleanCode('abc-o1l')).toBe('ABC011');
    expect(splitCode('short')).toBeNull();
    expect(splitCode('ABC123000U9XK2M7QP')).toBeNull(); // U isn't in the alphabet
  });

  it('turns bytes into base32 of a fixed length', () => {
    expect(toBase32(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]), 8)).toBe('ZZZZZZZZ');
    expect(toBase32(new Uint8Array([0, 0, 0, 0, 0]), 8)).toBe('00000000');
  });
});

describe('scan verdicts', () => {
  const paris = { lat: 48.8566, lng: 2.3522 };
  const lyon = { lat: 45.764, lng: 4.8357 };
  const fresh = { scanCount: 0, firstLat: null, firstLng: null };
  const seen = { scanCount: 2, firstLat: paris.lat, firstLng: paris.lng };

  it('trusts the first scan and nearby checks after it', () => {
    expect(verdictFor(fresh, paris)).toBe('FIRST');
    expect(verdictFor(seen, { lat: 48.86, lng: 2.35 })).toBe('SEEN');
    expect(verdictFor(seen, null)).toBe('SEEN');
  });

  it('flags a code seen far away, too often, or flagged by the brand', () => {
    expect(verdictFor(seen, lyon)).toBe('SUSPECT');
    expect(verdictFor({ ...seen, scanCount: 25 }, paris)).toBe('SUSPECT');
    expect(verdictFor({ ...fresh, status: 'FLAGGED' }, paris)).toBe('SUSPECT');
  });

  it('falls back to the country when there is no GPS', () => {
    const noGps = { scanCount: 1, firstLat: null, firstLng: null };
    expect(verdictFor(noGps, null, { first: 'FR', now: 'FR' })).toBe('SEEN');
    expect(verdictFor(noGps, null, { first: 'FR', now: 'NG' })).toBe('SUSPECT');
    expect(verdictFor(noGps, null, { first: null, now: 'NG' })).toBe('SEEN');
    // GPS on both sides wins over the country (border towns).
    expect(verdictFor(seen, { lat: 48.86, lng: 2.35 }, { first: 'FR', now: 'BE' })).toBe('SEEN');
  });
});

describe('campaign areas and map cells', () => {
  const paris = { lat: 48.8566, lng: 2.3522 };
  it('matches a country, a circle, or everywhere', async () => {
    const { inArea } = await import('./trace');
    const none = { country: null, lat: null, lng: null, radiusKm: null };
    expect(inArea(none, null, null)).toBe(true);
    expect(inArea({ ...none, country: 'FR' }, null, 'fr')).toBe(true);
    expect(inArea({ ...none, country: 'FR' }, null, 'ES')).toBe(false);
    const circle = { ...none, lat: paris.lat, lng: paris.lng, radiusKm: 30 };
    expect(inArea(circle, { lat: 48.9, lng: 2.4 }, 'FR')).toBe(true);
    expect(inArea(circle, { lat: 45.76, lng: 4.84 }, 'FR')).toBe(false);
    expect(inArea(circle, null, 'FR')).toBe(false);
  });

  it('snaps positions to a coarse grid', async () => {
    const { cellOf } = await import('./trace');
    expect(cellOf(48.8566, 2.3522, 0.1)).toEqual([48.9, 2.4]);
    expect(cellOf(48.8566, 2.3522, 0.5)).toEqual([49, 2.5]);
    expect(cellOf(-33.87, 151.21, 0.5)).toEqual([-34, 151]);
  });
});

describe('trace plus helpers', () => {
  it('gives shops a tier from their sales', () => {
    expect(tierFor(0).id).toBe('BRONZE');
    expect(tierFor(20).id).toBe('SILVER');
    expect(tierFor(150).multiplier).toBe(1.5);
    expect(tierFor(5).next).toEqual({ label: 'Silver', need: 15 });
  });
  it('spots grey-market scans', () => {
    expect(isDiverted('FR, ES', 'IT')).toBe(true);
    expect(isDiverted('FR,ES', 'es')).toBe(false);
    expect(isDiverted(null, 'IT')).toBe(false);
    expect(isDiverted('FR', null)).toBe(false);
  });
  it('counts a journey’s CO2, cheaper by sea', () => {
    const road = journeyCarbon([{ place: 'Jaén', lat: 37.78, lng: -3.78 }, { place: 'Lyon', lat: 45.76, lng: 4.84 }], 1);
    const sea = journeyCarbon([{ place: 'Port of Valencia', lat: 39.45, lng: -0.32 }, { place: 'Port of Genoa', lat: 44.41, lng: 8.93 }], 1);
    expect(road.km).toBeGreaterThan(1000);
    expect(road.kg).toBeGreaterThan(0.1);
    expect(sea.kg / sea.km).toBeLessThan(road.kg / road.km);
  });
  it('forecasts a weekly pattern with a trend, never below zero', () => {
    const series = Array.from({ length: 56 }, (_, i) => 10 + i * 0.5 + (i % 7 === 5 ? 8 : 0));
    const f = forecast(series, 14);
    expect(f.values).toHaveLength(14);
    expect(f.values[13]).toBeGreaterThan(series[0]);
    expect(Math.min(...forecast(Array(30).fill(0), 7).values)).toBe(0);
  });
  it('scores trust from genuine scans, ratings and recalls', () => {
    expect(trustScore({ genuinePct: 100, rating: 5, recalls: 0, recallsWithAdvice: 0 })).toBe(100);
    expect(trustScore({ genuinePct: 90, rating: 4, recalls: 2, recallsWithAdvice: 1 })).toBeLessThan(90);
  });
});
