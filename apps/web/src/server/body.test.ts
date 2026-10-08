import { describe, expect, it } from 'vitest';
import { first, oneOf, str, strings, text } from './body';
import { pick } from './pick';

describe('body helpers', () => {
  it('oneOf', () => {
    expect(oneOf(['a', 'b'] as const, 'a')).toBe(true);
    expect(oneOf(['a', 'b'] as const, 'c')).toBe(false);
    expect(oneOf(['a', 'b'] as const, 1)).toBe(false);
    expect(oneOf(['a', 'b'] as const, undefined)).toBe(false);
  });
  it('str', () => {
    expect(str('x')).toBe('x');
    expect(str('')).toBe('');
    expect(str(1)).toBeUndefined();
    expect(str(null)).toBeUndefined();
  });
  it('text', () => {
    expect(text('x')).toBe('x');
    expect(text({})).toBe('');
    expect(text(undefined)).toBe('');
  });
  it('strings', () => {
    expect(strings(['a', 1, 'b', null])).toEqual(['a', 'b']);
    expect(strings('a')).toEqual([]);
    expect(strings(undefined)).toEqual([]);
  });
  it('first', () => {
    expect(first(['a', 'b'])).toBe('a');
    expect(first('a')).toBe('a');
    expect(first(undefined)).toBeUndefined();
  });
});

describe('pick', () => {
  type Course = { title: string; description: string; status: string };
  it('copies only allowed keys', () => {
    expect(pick<Course>({ title: 'A', status: 'PUBLISHED', ownerId: 'x' }, ['title', 'description'])).toEqual({ title: 'A' });
  });
  it('drops undefined but keeps null and empty values', () => {
    expect(pick<Course>({ title: undefined, description: null, status: '' }, ['title', 'description', 'status'])).toEqual({ description: null, status: '' });
  });
  it('handles no body', () => {
    expect(pick<Course>(null, ['title'])).toEqual({});
    expect(pick<Course>(undefined, ['title'])).toEqual({});
  });
});
