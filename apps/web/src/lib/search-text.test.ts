import { describe, expect, it } from 'vitest';
import { ftsQuery, plainText } from './search-text';

describe('search text', () => {
  it('keeps the words of a document, not its tags', () => {
    expect(plainText('<h1>Photo&shy;synthesis</h1><p>Plants make <strong>sugar</strong> &amp; oxygen.</p><style>p{color:red}</style><ul><li>Light</li><li>Water</li></ul>'))
      .toBe('Photo&shy;synthesis\nPlants make sugar & oxygen.\nLight\nWater');
  });
  it('asks FTS5 for every word, as a word or its start, with nothing that could be an operator', () => {
    expect(ftsQuery('Photosynthesis notes')).toBe('"photosynthesis"* AND "notes"*');
    expect(ftsQuery('"x" OR y* NEAR(z) -- a')).toBe('"or"* AND "near"*');
    expect(ftsQuery('é')).toBeNull();
    expect(ftsQuery('Café crème')).toBe('"café"* AND "crème"*');
  });
});
