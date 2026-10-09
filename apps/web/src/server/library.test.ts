import { describe, expect, it } from 'vitest';
import { cleanIsbn, fineFor } from './library';

describe('ISBNs', () => {
  it('reads ISBN-13 and ISBN-10 however they are written', () => {
    expect(cleanIsbn('978-0-14-310755-2')).toBe('9780143107552');
    expect(cleanIsbn(' 0-306-40615-2 ')).toBe('0306406152');
    expect(cleanIsbn('0-8044-2957-x')).toBe('080442957X');
  });
  it('refuses numbers with a wrong check digit or length', () => {
    expect(cleanIsbn('9780143107553')).toBeNull();
    expect(cleanIsbn('0306406153')).toBeNull();
    expect(cleanIsbn('12345')).toBeNull();
    expect(cleanIsbn('97801431075X2')).toBeNull();
    expect(cleanIsbn(undefined)).toBeNull();
  });
});

describe('late fines', () => {
  const due = new Date('2026-10-10T12:00:00Z');
  const at = (h: number) => new Date(due.getTime() + h * 3600_000);
  it('charges nothing on time or within an hour', () => {
    expect(fineFor(due, at(-5), 500, 0)).toBe(0);
    expect(fineFor(due, at(0.9), 500, 0)).toBe(0);
  });
  it('charges each day or part of a day late', () => {
    expect(fineFor(due, at(2), 500, 0)).toBe(500);
    expect(fineFor(due, at(25), 500, 0)).toBe(500);
    expect(fineFor(due, at(26), 500, 0)).toBe(1000);
    expect(fineFor(due, at(24 * 10), 500, 0)).toBe(5000);
  });
  it('stops at the cap, and a library without fines charges nothing', () => {
    expect(fineFor(due, at(24 * 30), 500, 3000)).toBe(3000);
    expect(fineFor(due, at(24 * 30), 0, 0)).toBe(0);
  });
});
