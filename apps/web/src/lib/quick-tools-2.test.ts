import { describe, expect, it } from 'vitest';
import { addDays, calc, cite, contrast, convertUnit, daysBetween, findReplace, groups, hexRgb, jwtParts, password, readability, rgbHsl, toMillis, urlParts } from './quick-tools-2';

describe('quick tools, second set', () => {
  it('finds and replaces', () => {
    expect(findReplace('Cat cat category', 'cat', 'dog')).toEqual({ text: 'dog dog dogegory', count: 3 });
    expect(findReplace('Cat cat category', 'cat', 'dog', { words: true, caseSensitive: true })).toEqual({ text: 'Cat dog category', count: 1 });
  });
  it('scores how easy a text is', () => {
    expect(readability('The cat sat on the mat. It was a good day.')!.label).toBe('Easy');
    expect(readability('')).toBeNull();
  });
  it('writes references', () => {
    const s = { authors: 'Smith, Jane Ann; Lee, Bo', title: 'Learning together', site: 'UniVerse', year: '2026', url: 'https://u.example/a' };
    expect(cite(s, 'apa')).toBe('Smith, J. A., & Lee, B. (2026). Learning together. UniVerse. https://u.example/a');
    expect(cite(s, 'mla')).toBe('Smith, Jane Ann, and Bo Lee. “Learning together.” UniVerse, 2026, https://u.example/a.');
  });
  it('calculates without eval', () => {
    expect(calc('2 + 3 × 4')).toBe(14);
    expect(calc('(2+3)^2 - 10%')).toBeCloseTo(24.9);
    expect(calc('sqrt(16) + -2')).toBe(2);
    expect(() => calc('2 +')).toThrow();
    expect(() => calc('alert(1)')).toThrow();
  });
  it('converts units', () => {
    expect(convertUnit('Length', 1, 'mile', 'km')).toBeCloseTo(1.609344);
    expect(convertUnit('Temperature', 100, '°C', '°F')).toBe(212);
    expect(convertUnit('Data', 1, 'GiB', 'MB')).toBeCloseTo(1073.741824);
  });
  it('makes even groups', () => {
    const g = groups(['a', 'b', 'c', 'd', 'e'], 2, () => 0.5);
    expect(g.map((x) => x.length)).toEqual([3, 2]);
    expect(g.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('counts days and weekdays', () => {
    expect(daysBetween('2026-11-02', '2026-11-09')).toEqual({ days: 7, weeks: 1, weekdays: 5 });
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('handles colours and contrast', () => {
    expect(hexRgb('#fff')).toEqual([255, 255, 255]);
    expect(rgbHsl([255, 0, 0])).toEqual([0, 100, 50]);
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('nope', '#fff')).toBeNull();
  });
  it('reads times, addresses and tokens', () => {
    expect(toMillis('1700000000')).toBe(1_700_000_000_000);
    expect(toMillis('2026-11-01T00:00:00Z')).toBe(Date.UTC(2026, 10, 1));
    expect(urlParts('https://a.com/x%20y?q=1&r=2#top')).toEqual({ protocol: 'https', host: 'a.com', path: '/x y', hash: 'top', query: [['q', '1'], ['r', '2']] });
    expect(jwtParts('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig')).toEqual({ header: { alg: 'HS256' }, payload: { sub: '123' } });
    expect(jwtParts('nonsense')).toBeNull();
  });
  it('makes passwords from the chosen characters', () => {
    const p = password(24, { digits: true });
    expect(p).toMatch(/^[2-9]{24}$/);
  });
});
