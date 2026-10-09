import { describe, expect, it } from 'vitest';
import { joinable, slotTimes, when } from './parent-meetings';

const at = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00Z`).getTime();
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

describe('opening meeting times', () => {
  it('fills the time with meetings of the chosen length', () => {
    expect(slotTimes(at('16:00'), at('17:00'), 15, 0).map(hhmm)).toEqual(['16:00', '16:15', '16:30', '16:45']);
  });
  it('leaves a break between meetings when asked', () => {
    expect(slotTimes(at('16:00'), at('17:00'), 15, 5).map(hhmm)).toEqual(['16:00', '16:20', '16:40']);
  });
  it('never runs past the end time', () => {
    expect(slotTimes(at('16:00'), at('16:50'), 20, 0).map(hhmm)).toEqual(['16:00', '16:20']);
    expect(slotTimes(at('16:00'), at('16:10'), 15, 0)).toEqual([]);
  });
  it('skips times that overlap meetings already open', () => {
    const taken = [{ start: at('16:10'), end: at('16:25') }];
    expect(slotTimes(at('16:00'), at('17:00'), 15, 0, taken).map(hhmm)).toEqual(['16:30', '16:45']);
  });
  it('opens at most 40 at once', () => {
    expect(slotTimes(at('08:00'), at('20:00'), 10, 0)).toHaveLength(40);
  });
});

describe('joining a video meeting', () => {
  const m = { startAt: new Date(at('16:00')), durationMin: 15 };
  it('opens to the parent 10 minutes before and to the teacher 30', () => {
    expect(joinable(m, false, at('15:49'))).toBe(false);
    expect(joinable(m, false, at('15:50'))).toBe(true);
    expect(joinable(m, true, at('15:30'))).toBe(true);
    expect(joinable(m, true, at('15:29'))).toBe(false);
  });
  it('closes 30 minutes after the meeting ends', () => {
    expect(joinable(m, false, at('16:45'))).toBe(true);
    expect(joinable(m, false, at('16:46'))).toBe(false);
  });
});

describe('meeting times in notifications', () => {
  it('uses the reader’s time zone, or says UTC', () => {
    const d = new Date('2026-11-12T10:30:00Z');
    expect(when(d, 'Asia/Kolkata')).toBe('Thu 12 Nov, 16:00');
    expect(when(d, null)).toBe('Thu 12 Nov, 10:30 UTC');
    expect(when(d, 'Not/AZone')).toBe('Thu 12 Nov, 10:30');
  });
});
