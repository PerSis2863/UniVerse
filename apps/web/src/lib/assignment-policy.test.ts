import { describe, expect, it } from 'vitest';
import { DAY, cleanAccommodation, cleanPolicy, dueFor, lateness, mayHandIn, quizMinutes, withPenalty } from './assignment-policy';

const due = new Date('2026-10-20T17:00:00Z');
const at = (ms: number) => new Date(due.getTime() + ms);
const policy = { latePenalty: 10, lateGraceMinutes: 15, latePenaltyMax: 50 };

describe('late penalties', () => {
  it('counts each started day after the grace period', () => {
    expect(lateness(at(-1), due, policy)).toEqual({ late: false, days: 0, penalty: 0 });
    expect(lateness(at(10 * 60_000), due, policy)).toEqual({ late: false, days: 0, penalty: 0 });
    expect(lateness(at(16 * 60_000), due, policy)).toEqual({ late: true, days: 1, penalty: 10 });
    expect(lateness(at(DAY + 16 * 60_000), due, policy)).toEqual({ late: true, days: 2, penalty: 20 });
  });
  it('stops at the maximum, and without a penalty is only late', () => {
    expect(lateness(at(30 * DAY), due, policy).penalty).toBe(50);
    expect(lateness(at(2 * DAY), due, { latePenalty: null, lateGraceMinutes: 0, latePenaltyMax: 100 })).toEqual({ late: true, days: 2, penalty: 0 });
    expect(lateness(at(2 * DAY), null, policy).late).toBe(false);
  });
  it('takes the % off the score', () => {
    expect(withPenalty(16, 20)).toBe(12.8);
    expect(withPenalty(9, 0)).toBe(9);
    expect(withPenalty(10, 150)).toBe(0);
  });
});

describe('due dates for one student', () => {
  it('uses an extension first, then extra days', () => {
    const ext = new Date('2026-10-25T09:00:00Z');
    expect(dueFor(due, ext, { extraDays: 3, extraTimePct: 0 })).toEqual(ext);
    expect(dueFor(due, null, { extraDays: 3, extraTimePct: 0 })).toEqual(new Date(due.getTime() + 3 * DAY));
    expect(dueFor(due, null)).toEqual(due);
    expect(dueFor(null, null, { extraDays: 3, extraTimePct: 0 })).toBeNull();
  });
  it('gives timed quizzes extra time', () => {
    expect(quizMinutes(30, { extraDays: 0, extraTimePct: 25 })).toBe(38);
    expect(quizMinutes(30)).toBe(30);
    expect(quizMinutes(null, { extraDays: 0, extraTimePct: 50 })).toBeNull();
  });
});

describe('handing in again', () => {
  it('limits attempts when the teacher sets a number', () => {
    expect(mayHandIn(5, null)).toBe(true);
    expect(mayHandIn(1, 1)).toBe(false);
    expect(mayHandIn(1, 2)).toBe(true);
    expect(mayHandIn(2, 2, 1)).toBe(true);
  });
});

describe('what teachers send', () => {
  it('keeps numbers in range', () => {
    expect(cleanPolicy({ latePenalty: 250, lateGraceMinutes: -5, latePenaltyMax: '40', maxAttempts: 0 })).toEqual({ latePenalty: 100, lateGraceMinutes: 0, latePenaltyMax: 40, maxAttempts: 1 });
    expect(cleanPolicy({ latePenalty: '', maxAttempts: null })).toEqual({ latePenalty: null, maxAttempts: null });
    expect(cleanPolicy({})).toEqual({});
    expect(cleanAccommodation({ extraDays: 90, extraTimePct: '25' })).toEqual({ extraDays: 30, extraTimePct: 25 });
    expect(cleanAccommodation({ extraDays: 'x' })).toEqual({ extraDays: 0, extraTimePct: 0 });
  });
});
