import { describe, expect, it } from 'vitest';
import { MENU_PINS, arranged, cleanDoc, cleanKey, cleanPin, cleanStore, mergeDocs, moved, overlap, pagePins, uniqueKeys } from './arrange';

describe('arrange this page', () => {
  it('names things once each', () => {
    expect(uniqueKeys(['Open', 'Open', '', 'Save'])).toEqual(['Open', 'Open #2', '#3', 'Save']);
    expect(cleanKey('  Due   this\n week ')).toBe('Due this week');
  });
  it('keeps the saved order, and puts a new card next to what it follows', () => {
    expect(arranged(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    expect(arranged(['c', 'a', 'gone'], ['a', 'new', 'c'])).toEqual(['c', 'a', 'new']);
    expect(arranged(['b', 'a'], ['new', 'a', 'b'])).toEqual(['new', 'b', 'a']);
  });
  it('moves one thing', () => {
    expect(moved(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });
  it('matches a saved group to its container', () => {
    expect(overlap({ order: ['a', 'b', 'x'] }, ['b', 'a', 'c'])).toBe(2);
  });
  it('drops anything odd from a damaged copy', () => {
    const s = cleanStore({ '/home': [{ order: ['a', 7, 'b'], sizes: { a: { pct: 500, h: 'tall' }, b: 3 }, maxW: 10 }, 'x', { order: [] }], 'evil': [{ order: ['a'] }], '/x': 'no' });
    expect(s).toEqual({ '/home': [{ order: ['a', 'b'], sizes: { a: { pct: 100 } }, maxW: 320 }] });
    expect(cleanStore(null)).toEqual({});
    expect(cleanStore([1])).toEqual({});
  });
  it('joins two devices page by page, the later change winning, a page put back staying put back', () => {
    const phone = { pins: {}, store: { '/a': [{ order: ['x', 'y'] }], '/b': [{ order: ['p', 'q'] }] }, at: { '/a': 10, '/b': 30 } };
    const laptop = { pins: {}, store: { '/a': [{ order: ['y', 'x'] }], '/c': [{ order: ['m', 'n'] }] }, at: { '/a': 20, '/b': 40, '/c': 5 } };
    const both = mergeDocs(phone, laptop);
    expect(both.store).toEqual({ '/a': [{ order: ['y', 'x'] }], '/c': [{ order: ['m', 'n'] }] }); // /b was put back on the laptop, later
    expect(both.at).toEqual({ '/a': 20, '/b': 40, '/c': 5 });
    expect(mergeDocs(laptop, phone)).toEqual(both);
  });
  it('reads the first version (pages alone) and drops odd times', () => {
    expect(cleanDoc({ '/a': [{ order: ['x'] }] })).toEqual({ store: { '/a': [{ order: ['x'] }] }, at: {}, pins: {} });
    expect(cleanDoc({ store: { '/a': [{ order: ['x'], open: ['w', 3] }] }, at: { '/a': 5.4, 'bad': 9, '/z': 'no' } })).toEqual({ store: { '/a': [{ order: ['x'], open: ['w'] }] }, at: { '/a': 5 }, pins: {} });
  });
  it('keeps only shortcuts to pages of this site, once each, with a short name', () => {
    expect(cleanPin({ href: '/student/grades', label: '  Grades  ' })).toEqual({ href: '/student/grades', label: 'Grades' });
    for (const href of ['https://evil.test/x', '//evil.test', 'javascript:alert(1)', '/a b', '/\\evil', 'grades', '/x"onmouseover=1']) expect(cleanPin({ href, label: 'x' })).toBeNull();
    expect(cleanPin({ href: '/a', label: '   ' })).toBeNull();
    const d = cleanDoc({ pins: { [MENU_PINS]: [{ href: '/a', label: 'A' }, { href: '/a', label: 'again' }, { href: 'http://x', label: 'B' }], '/elsewhere': [{ href: '/b', label: 'B' }] } });
    expect(d.pins).toEqual({ [MENU_PINS]: [{ href: '/a', label: 'A' }] });
  });
  it('joins shortcuts like pages: the later change wins, a shortcut moved from the menu to a page moves', () => {
    const before = { store: {}, at: { [MENU_PINS]: 10 }, pins: { [MENU_PINS]: [{ href: '/a', label: 'A' }] } };
    const after = { store: {}, at: { [MENU_PINS]: 20, [pagePins('/student')]: 20 }, pins: { [pagePins('/student')]: [{ href: '/a', label: 'A' }] } };
    expect(mergeDocs(before, after).pins).toEqual({ [pagePins('/student')]: [{ href: '/a', label: 'A' }] });
    expect(mergeDocs(after, before)).toEqual(mergeDocs(before, after));
  });
  it('keeps what was dropped inside a card', () => {
    expect(cleanStore({ '/a': [{ order: ['x', 'y'], inside: { x: 'Quick notes', y: 7, '': 'z' } }] })).toEqual({ '/a': [{ order: ['x', 'y'], inside: { x: 'Quick notes' } }] });
  });
});
