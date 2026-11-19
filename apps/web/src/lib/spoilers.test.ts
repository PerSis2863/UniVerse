import { describe, expect, it } from 'vitest';
import { hideSpoilers } from './spoilers';

describe('hideSpoilers', () => {
  it('covers ||spoilers|| and leaves the rest', () => {
    expect(hideSpoilers('The killer is ||the butler|| obviously')).toBe('The killer is ▒▒▒▒ obviously');
    expect(hideSpoilers('a || b')).toBe('a || b');
  });
});
