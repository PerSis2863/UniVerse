import { describe, expect, it } from 'vitest';
import { CARD_OUTCOME, matchConcept } from './concept-match';

const concepts = [
  { id: 'flow', name: 'Control flow', description: 'Making decisions and repeating things', parentId: null },
  { id: 'loops', name: 'Loops', description: 'for and while loops, iterating over a list', parentId: 'flow' },
  { id: 'rec', name: 'Recursion', description: 'A function calling itself, base cases', parentId: 'flow' },
  { id: 'bigo', name: 'Big O notation', description: 'How running time grows with the input', parentId: null },
];

describe('which concept a text is about (Learning DNA signals)', () => {
  it('finds the concept named in a flashcard or a tutor question', () => {
    expect(matchConcept('Why does my while loop never stop?', concepts)).toBe('loops');
    expect(matchConcept('What is the base case in recursion?', concepts)).toBe('rec');
    expect(matchConcept('Recursive functions call themselves', concepts)).toBe('rec'); // "recursi" stem
    expect(matchConcept('What is the Big O of binary search? O(log n) notation', concepts)).toBe('bigo');
  });
  it('needs most of the name, and says nothing when nothing fits', () => {
    expect(matchConcept('Is the exam open book?', concepts)).toBeNull();
    expect(matchConcept('a big list', concepts)).toBeNull(); // one word of two
    expect(matchConcept('', concepts)).toBeNull();
    expect(matchConcept('loops', [])).toBeNull();
  });
  it('prefers the specific concept over the one above it', () => {
    expect(matchConcept('control flow with loops', concepts)).toBe('flow'); // the name in full beats one word
    expect(matchConcept('Loops: repeating things', concepts)).toBe('loops');
  });
  it('turns a review into an outcome', () => {
    expect([CARD_OUTCOME.again, CARD_OUTCOME.hard, CARD_OUTCOME.good, CARD_OUTCOME.easy]).toEqual([0, 0.6, 0.9, 1]);
  });
});
