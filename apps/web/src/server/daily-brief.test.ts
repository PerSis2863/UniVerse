import { describe, expect, it } from 'vitest';
import { nextMorning } from './daily-brief';

describe('nextMorning', () => {
  it('later today when it is still early', () => {
    const from = Date.parse('2026-10-08T03:00:00Z');
    expect(nextMorning('UTC', 7, from).toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });
  it('tomorrow once the hour has passed', () => {
    const from = Date.parse('2026-10-08T09:00:00Z');
    expect(nextMorning('UTC', 7, from).toISOString()).toBe('2026-10-09T07:00:00.000Z');
  });
  it('exactly on the hour means tomorrow', () => {
    const from = Date.parse('2026-10-08T07:00:00Z');
    expect(nextMorning('UTC', 7, from).toISOString()).toBe('2026-10-09T07:00:00.000Z');
  });
  it('in a time zone ahead of UTC', () => {
    // 20:00 UTC is 01:30 the next day in India; 7:00 there is 01:30 UTC.
    const from = Date.parse('2026-10-08T20:00:00Z');
    expect(nextMorning('Asia/Kolkata', 7, from).toISOString()).toBe('2026-10-09T01:30:00.000Z');
  });
  it('in a time zone behind UTC', () => {
    // New York is UTC-4 in October: 7:00 there is 11:00 UTC.
    const from = Date.parse('2026-10-08T12:00:00Z');
    expect(nextMorning('America/New_York', 7, from).toISOString()).toBe('2026-10-09T11:00:00.000Z');
  });
  it('across a daylight-saving change', () => {
    // US clocks go back on 1 November 2026: 7:00 on the 2nd is 12:00 UTC (UTC-5).
    const from = Date.parse('2026-11-01T13:00:00Z');
    expect(nextMorning('America/New_York', 7, from).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });
});
