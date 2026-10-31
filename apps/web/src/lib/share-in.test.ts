import { describe, expect, it } from 'vitest';
import { sharedText } from './share-in';

describe('sharedText', () => {
  it('joins title, text and link without repeats', () => {
    expect(sharedText({ title: 'Flood map', text: 'Look at this https://x.org/a', url: 'https://x.org/a' })).toBe('Flood map Look at this https://x.org/a');
    expect(sharedText({ text: '  ', url: 'https://x.org' })).toBe('https://x.org');
    expect(sharedText({})).toBe('');
  });
  it('keeps it to 2000 characters', () => {
    expect(sharedText({ text: 'a'.repeat(3000) })).toHaveLength(2000);
  });
});
