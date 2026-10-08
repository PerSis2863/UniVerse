import { describe, expect, it } from 'vitest';
import { HHMM, minutesOf, validZone, wallClock, within } from './local-time';

describe('validZone', () => {
  it('keeps a real zone', () => expect(validZone('Asia/Kolkata')).toBe('Asia/Kolkata'));
  it('falls back to UTC for nonsense', () => expect(validZone('Mars/Olympus')).toBe('UTC'));
  it('falls back to UTC for non-strings', () => {
    expect(validZone(undefined)).toBe('UTC');
    expect(validZone(42)).toBe('UTC');
    expect(validZone('')).toBe('UTC');
  });
  it('rejects very long names', () => expect(validZone('A'.repeat(65))).toBe('UTC'));
});

describe('wallClock', () => {
  const d = new Date('2026-10-08T20:45:00Z');
  it('reads UTC', () => expect(wallClock(d, 'UTC')).toEqual({ day: '2026-10-08', y: 2026, m: 10, d: 8, hour: 20, min: 45 }));
  it('moves to the next day east of UTC', () => {
    const w = wallClock(d, 'Asia/Kolkata'); // +5:30
    expect(w.day).toBe('2026-10-09');
    expect([w.hour, w.min]).toEqual([2, 15]);
  });
  it('stays on the day west of UTC', () => {
    const w = wallClock(d, 'America/New_York'); // EDT, -4
    expect(w.day).toBe('2026-10-08');
    expect(w.hour).toBe(16);
  });
  it('uses 0–23 hours at midnight', () => expect(wallClock(new Date('2026-01-01T00:05:00Z'), 'UTC').hour).toBe(0));
});

describe('HHMM and minutesOf', () => {
  it.each(['00:00', '07:30', '23:59'])('accepts %s', (t) => expect(HHMM.test(t)).toBe(true));
  it.each(['24:00', '7:30', '12:60', 'noon'])('rejects %s', (t) => expect(HHMM.test(t)).toBe(false));
  it('counts minutes', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('07:30')).toBe(450);
    expect(minutesOf('23:59')).toBe(1439);
  });
});

describe('within', () => {
  it('a daytime span', () => {
    expect(within('09:00', '17:00', minutesOf('12:00'))).toBe(true);
    expect(within('09:00', '17:00', minutesOf('17:00'))).toBe(false);
    expect(within('09:00', '17:00', minutesOf('09:00'))).toBe(true);
  });
  it('an overnight span', () => {
    expect(within('22:00', '07:00', minutesOf('23:30'))).toBe(true);
    expect(within('22:00', '07:00', minutesOf('03:00'))).toBe(true);
    expect(within('22:00', '07:00', minutesOf('12:00'))).toBe(false);
  });
  it('an empty span is never on', () => expect(within('08:00', '08:00', minutesOf('08:00'))).toBe(false));
});
