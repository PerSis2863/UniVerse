import { describe, expect, it } from 'vitest';
import { cleanText, columnStats, diffLines, pageRanges, palette, parseTable, tableAs, textStats } from './quick-tools';

describe('quick tools', () => {
  it('counts words, sentences and reading time', () => {
    const s = textStats('Hello world. This is UniVerse!\n\nA second paragraph here.');
    expect(s).toMatchObject({ words: 9, sentences: 3, paragraphs: 2 });
    expect(s.readMin).toBeCloseTo(9 / 230);
  });
  it('cleans text', () => {
    expect(cleanText('b\na\nb\n', 'dedupe')).toBe('b\na\n');
    expect(cleanText('item 10\nitem 2', 'sort')).toBe('item 2\nitem 10');
    expect(cleanText('the  quick   fox ', 'spaces')).toBe('the quick fox');
    expect(cleanText('hello there. how are you', 'sentence')).toBe('Hello there. How are you');
    expect(cleanText('the end of it', 'title')).toBe('The End Of It');
  });
  it('finds the changed lines', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([{ op: ' ', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'x' }, { op: ' ', text: 'c' }]);
  });
  it('reads CSV and spreadsheet tables and writes them back', () => {
    const rows = parseTable('name,score\n"Lee, A",12\nBo,8');
    expect(rows).toEqual([['name', 'score'], ['Lee, A', '12'], ['Bo', '8']]);
    expect(parseTable('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(tableAs(rows, 'csv')).toBe('name,score\n"Lee, A",12\nBo,8');
    expect(JSON.parse(tableAs(rows, 'json'))).toEqual([{ name: 'Lee, A', score: 12 }, { name: 'Bo', score: 8 }]);
    expect(tableAs(rows, 'markdown').split('\n')[1]).toBe('| --- | --- |');
    expect(columnStats(rows)).toEqual([{ name: 'score', count: 2, sum: 20, avg: 10, min: 8, max: 12 }]);
  });
  it('makes five colours and reads page ranges', () => {
    expect(palette(200, 'triadic')).toHaveLength(5);
    expect(palette(0, 'shades').every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(pageRanges('3, 1-2, 9-, 2', 10)).toEqual([3, 1, 2, 9, 10]);
  });
});
