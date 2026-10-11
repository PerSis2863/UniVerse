import { describe, expect, it } from 'vitest';
import { searchWords, snippet } from './files-hub';

describe('files hub search', () => {
  it('tidies the words kept for search', () => {
    expect(searchWords('  a\n\n b\tc ')).toBe('a b c');
    expect(searchWords('   ')).toBeNull();
    expect(searchWords(5)).toBeUndefined();
    expect(searchWords('x'.repeat(30_000))?.length).toBe(20_000);
  });
  it('shows a bit around the match', () => {
    expect(snippet('The French Revolution began in 1789.', 'revolution')).toBe('The French Revolution began in 1789.');
    const long = `${'a '.repeat(100)}needle${' b'.repeat(100)}`;
    const s = snippet(long, 'NEEDLE')!;
    expect(s.startsWith('…') && s.endsWith('…') && s.includes('needle')).toBe(true);
    expect(snippet('nothing here', 'x1')).toBeNull();
    expect(snippet(null, 'a')).toBeNull();
  });
});
