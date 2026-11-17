import { describe, expect, it } from 'vitest';
import { tripCover } from './travel-ideas';

describe('a trip’s picture (M238)', () => {
  it('comes from its place, its country, or a name it mentions, and is never missing', () => {
    expect(tripCover({ name: 'Delhi', cover: 'Delhi' })?.title).toBe('Delhi');
    expect(tripCover({ name: 'Netherland' })?.cc).toBe('NL');
    expect(tripCover({ name: 'Germany' })?.cc).toBe('DE');
    expect(tripCover({ name: 'Summer in Italy' })?.cc).toBe('IT');
    expect(tripCover({ name: 'Weekend', places: ['Paris'] })?.title).toBe('Paris');
    const any = tripCover({ name: 'Our big adventure' });
    expect(any?.photo).toBeTruthy();
    expect(tripCover({ name: 'Our big adventure' })?.title).toBe(any?.title); // the same every time
  });
});
