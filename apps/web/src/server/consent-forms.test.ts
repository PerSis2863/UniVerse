import { describe, expect, it } from 'vitest';
import { cleanName, cleanSignature, dueDate, senderLink } from './consent-forms';

describe('consent form signatures', () => {
  it('keeps a drawn signature made of moves and lines', () => {
    expect(cleanSignature('M12 34 L13 35 L20 40 M50 60 L51 61')).toBe('M12 34 L13 35 L20 40 M50 60 L51 61');
    expect(cleanSignature('M-3 4 L310 -2')).toBe('M-3 4 L310 -2'); // a stroke that left the box
  });
  it('drops anything that isn’t one', () => {
    for (const v of ['', 'L1 2', 'M1 2 C3 4 5 6 7 8', 'M1.5 2', 'M1 2 L3', '<script>', 'M1 2 Z', 42, null, `M1 2${' L3 4'.repeat(5000)}`]) {
      expect(cleanSignature(v), String(v).slice(0, 20)).toBeNull();
    }
  });
  it('tidies the typed name and refuses one that’s too short', () => {
    expect(cleanName('  Priya   Doe ')).toBe('Priya Doe');
    expect(cleanName('P')).toBe('');
    expect(cleanName(undefined)).toBe('');
    expect(cleanName('x'.repeat(150))).toHaveLength(100);
  });
});

describe('consent form dates', () => {
  const now = new Date('2026-10-09T12:00:00Z').getTime();
  it('reads a day as the end of that day', () => {
    expect(dueDate('2026-11-14', now)?.getHours()).toBe(23);
    expect(dueDate('', now)).toBeNull();
    expect(dueDate(undefined, now)).toBeNull();
  });
  it('refuses a wrong or past date', () => {
    expect(() => dueDate('not a date', now)).toThrow();
    expect(() => dueDate('2026-10-01', now)).toThrow();
  });
  it('allows today', () => expect(dueDate('2026-10-09', now)).not.toBeNull());
});

describe('where senders follow a form', () => {
  it('sends admins to Administrative and teachers next to their students', () => {
    expect(senderLink('ADMIN', 'f1')).toBe('/admin/administrative?tab=forms&form=f1');
    expect(senderLink('TEACHER', 'f1')).toBe('/teacher/forms?form=f1');
  });
});
