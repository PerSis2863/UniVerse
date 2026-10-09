import { describe, expect, it } from 'vitest';
import { isMinor, quickCheck, type Policy } from './safety';

describe('quickCheck', () => {
  it('passes ordinary messages', () => {
    expect(quickCheck('See you in the library at 5?')).toBeNull();
    expect(quickCheck('This exam is killing me lol')).toBeNull();
  });
  it.each([
    ['i want to die', 'self_harm'],
    ['I have been cutting myself', 'self_harm'],
    ["I'll hurt you after class", 'threat'],
    ['someone said they will bring a gun to school', 'threat'],
  ])('flags "%s" as strong %s', (text, kind) => {
    const r = quickCheck(text);
    expect(r?.kinds).toContain(kind);
    expect(r?.strong).toBe(true);
  });
  it.each([
    ['nobody likes you', 'bullying'],
    ['you are so worthless', 'bullying'],
    ['send me nudes', 'sexual'],
    ["don't tell your parents", 'sexual'],
    ['what is your address', 'personal_info'],
    ['call me on 9876543210', 'personal_info'],
    ['go back to your country', 'hate'],
  ])('flags "%s" as %s (not strong)', (text, kind) => {
    const r = quickCheck(text);
    expect(r?.kinds).toContain(kind);
    expect(r?.strong).toBe(false);
  });
  it('lists each kind once', () => {
    const r = quickCheck('nobody likes you, everyone hates you');
    expect(r?.kinds).toEqual(['bullying']);
  });
  it('is strong when any hit is strong', () => {
    const r = quickCheck('nobody likes you and I want to die');
    expect(r?.kinds.sort()).toEqual(['bullying', 'self_harm']);
    expect(r?.strong).toBe(true);
  });
});

describe('isMinor', () => {
  const p = (studentsMinors = false): Policy => ({ guard: true, recordMinors: false, quietMinors: true, quietStart: '22:00', quietEnd: '07:00', studentsMinors, parentMessaging: true });
  const now = new Date('2026-10-08T12:00:00Z');
  it('teachers are never minors', () => expect(isMinor({ role: 'TEACHER', dateOfBirth: new Date('2012-01-01') }, p(), now)).toBe(false));
  it('a 15-year-old student is', () => expect(isMinor({ role: 'STUDENT', dateOfBirth: new Date('2011-03-01') }, p(), now)).toBe(true));
  it('an 18-year-old student is not', () => expect(isMinor({ role: 'STUDENT', dateOfBirth: new Date('2008-10-08') }, p(), now)).toBe(false));
  it('the day before turning 18 still is', () => expect(isMinor({ role: 'STUDENT', dateOfBirth: new Date('2008-10-09') }, p(), now)).toBe(true));
  it('no birth date follows the school setting', () => {
    expect(isMinor({ role: 'STUDENT', dateOfBirth: null }, p(false), now)).toBe(false);
    expect(isMinor({ role: 'STUDENT', dateOfBirth: null }, p(true), now)).toBe(true);
  });
});
