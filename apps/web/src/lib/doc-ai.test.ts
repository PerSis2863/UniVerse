import { describe, expect, it } from 'vitest';
import { isDocAiAction, wordDiff } from './doc-ai';

describe('doc AI helper', () => {
  it('knows its actions', () => {
    expect(isDocAiAction('shorten')).toBe(true);
    expect(isDocAiAction('delete-everything')).toBe(false);
  });
  it('compares word by word', () => {
    expect(wordDiff('the cat sat on mat', 'the cat sat on the mat')).toEqual([{ kind: 'same', text: 'the cat sat on ' }, { kind: 'add', text: 'the ' }, { kind: 'same', text: 'mat' }]);
    expect(wordDiff('I has a apple', 'I have an apple')).toEqual([{ kind: 'same', text: 'I ' }, { kind: 'del', text: 'has a ' }, { kind: 'add', text: 'have an ' }, { kind: 'same', text: 'apple' }]);
    expect(wordDiff('', 'new')).toEqual([{ kind: 'add', text: 'new' }]);
  });
  it('rebuilds both sides from the parts', () => {
    const a = 'Plants make food from light. They need water too.', b = 'Plants make their food using sunlight, and they also need water.';
    const parts = wordDiff(a, b);
    expect(parts.filter((p) => p.kind !== 'add').map((p) => p.text).join('')).toBe(a);
    expect(parts.filter((p) => p.kind !== 'del').map((p) => p.text).join('')).toBe(b);
  });
});
