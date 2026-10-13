import { describe, expect, it } from 'vitest';
import { cleanTerms, glossSegments, isLevel, parseTerms, speechChunks } from './reading-level';

describe('reading levels', () => {
  it('knows its levels', () => {
    expect(isLevel('g5')).toBe(true);
    expect(isLevel('g8')).toBe(true);
    expect(isLevel('original')).toBe(false);
    expect(isLevel('toString')).toBe(false);
  });

  it('keeps only key terms that are explained, short and in the text, once each', () => {
    const text = 'A loop repeats steps. A variable stores a value.';
    const terms = cleanTerms([
      { term: 'loop', meaning: 'Steps done again and again.' },
      { term: 'Loop', meaning: 'Duplicate.' },
      { term: 'variable', meaning: '' },
      { term: 'compiler', meaning: 'Not in the text.' },
      { term: 'value', meaning: 'What is stored.' },
      null, 'loop', { term: 42, meaning: 'x' },
    ], text);
    expect(terms).toEqual([{ term: 'loop', meaning: 'Steps done again and again.' }, { term: 'value', meaning: 'What is stored.' }]);
    expect(cleanTerms('nope', text)).toEqual([]);
    expect(parseTerms('{broken', text)).toEqual([]);
    expect(parseTerms(JSON.stringify([{ term: 'value', meaning: 'm' }]), text)).toEqual([{ term: 'value', meaning: 'm' }]);
  });

  it('marks the first whole-word appearance of each term, longest first, and loses no text', () => {
    const text = 'A tree grows. A binary search tree keeps order. The tree is sorted; retree is not a word.';
    const terms = [{ term: 'tree', meaning: 't' }, { term: 'binary search tree', meaning: 'b' }, { term: 'sort', meaning: 's' }];
    const parts = glossSegments(text, terms);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    const marked = parts.filter((p) => p.term).map((p) => p.text);
    expect(marked).toEqual(['tree', 'binary search tree']); // "sort" is only part of "sorted"
    expect(glossSegments('Nothing here.', [])).toEqual([{ text: 'Nothing here.' }]);
  });

  it('cuts text into short sentences for reading aloud, keeping every word', () => {
    const text = 'First sentence. Second one!  Third?\n\nA fourth sentence that is quite a bit longer than the others, with a comma.';
    const chunks = speechChunks(text, 40);
    expect(chunks.every((c) => c.length <= 40)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' ').trim());
    expect(speechChunks('Short. Text.')).toEqual(['Short. Text.']);
    expect(speechChunks('   ')).toEqual([]);
    const noStops = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    expect(speechChunks(noStops, 50).join(' ')).toBe(noStops);
  });
});
