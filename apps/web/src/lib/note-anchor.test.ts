import { describe, expect, it } from 'vitest';
import { cleanAnchor, textParts } from './note-anchor';

describe('note anchors', () => {
  it('keeps boxes on the page and words inside the text', () => {
    expect(cleanAnchor({ type: 'box', page: 2, x: 0.5, y: 0.9, w: 0.8, h: 0.5 }, 0)).toEqual({ type: 'box', page: 2, x: 0.5, y: 0.9, w: 0.5, h: 0.1 });
    expect(cleanAnchor({ type: 'box', page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }, 0)).toBeNull();
    expect(cleanAnchor({ type: 'box', page: 1, x: 'a', y: 0, w: 0.1, h: 0.1 }, 0)).toBeNull();
    expect(cleanAnchor({ type: 'text', start: 3, end: 8, quote: 'hello' }, 10)).toEqual({ type: 'text', start: 3, end: 8, quote: 'hello' });
    expect(cleanAnchor({ type: 'text', start: 3, end: 30 }, 10)).toBeNull();
    expect(cleanAnchor({ type: 'text', start: 5, end: 5 }, 10)).toBeNull();
    expect(cleanAnchor({ type: 'script' }, 10)).toBeNull();
  });
  it('splits text around noted words', () => {
    const notes = [{ id: 'b', anchor: { type: 'text' as const, start: 6, end: 11, quote: 'world' } }, { id: 'a', anchor: { type: 'text' as const, start: 0, end: 5, quote: 'Hello' } }, { id: 'c', anchor: { type: 'text' as const, start: 8, end: 12, quote: '' } }];
    expect(textParts('Hello world!', notes)).toEqual([
      { text: 'Hello', noteId: 'a' }, { text: ' ', noteId: null }, { text: 'world', noteId: 'b' }, { text: '!', noteId: null },
    ]);
    expect(textParts('abc', [])).toEqual([{ text: 'abc', noteId: null }]);
  });
});
