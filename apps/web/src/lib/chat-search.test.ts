import { describe, expect, it } from 'vitest';
import { parseQuery } from './chat-search';

describe('parseQuery', () => {
  it('keeps plain words', () => {
    expect(parseQuery('exam notes')).toEqual({ words: ['exam', 'notes'] });
  });
  it('reads from: in lower case', () => {
    expect(parseQuery('from:Jane hello').from).toBe('jane');
  });
  it('reads in: without a leading #', () => {
    expect(parseQuery('in:#CS101').in).toBe('cs101');
  });
  it('reads quoted values', () => {
    const q = parseQuery('from:"Jane Smith" report');
    expect(q.from).toBe('jane smith');
    expect(q.words).toEqual(['report']);
  });
  it.each([
    ['file', 'file'], ['files', 'file'], ['doc', 'file'],
    ['link', 'link'], ['url', 'link'],
    ['photo', 'photo'], ['images', 'photo'], ['img', 'photo'],
    ['voice', 'voice'], ['audio', 'voice'],
  ])('has:%s means %s', (val, has) => {
    expect(parseQuery(`has:${val}`).has).toBe(has);
  });
  it('ignores an unknown has:', () => {
    expect(parseQuery('has:banana').has).toBeUndefined();
  });
  it('reads before: and after: dates', () => {
    const q = parseQuery('before:2026-10-01 after:2026-09-01');
    expect(q.before?.getFullYear()).toBe(2026);
    expect(q.before?.getMonth()).toBe(9);
    expect(q.after?.getMonth()).toBe(8);
  });
  it('drops an invalid date', () => {
    expect(parseQuery('before:soon').before).toBeUndefined();
  });
  it('treats an empty filter as a word', () => {
    expect(parseQuery('from:').words).toEqual(['from:']);
  });
  it('treats unknown keys as words', () => {
    expect(parseQuery('to:jane').words).toEqual(['to:jane']);
  });
  it('keeps at most 6 words', () => {
    expect(parseQuery('a b c d e f g h').words).toHaveLength(6);
  });
  it('is case-insensitive about keys', () => {
    expect(parseQuery('FROM:Ana').from).toBe('ana');
  });
});
