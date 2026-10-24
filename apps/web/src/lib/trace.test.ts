import { describe, expect, it } from 'vitest';
import { CODE_LEN, MAX_BATCH, cleanCode, decodeSerial, encodeSerial, formatCode, splitCode, toBase32, verdictFor } from './trace';

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
