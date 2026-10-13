import { describe, expect, it } from 'vitest';
import { materialSections } from './material-sections';

describe('materialSections', () => {
  it('keeps short paragraphs together up to the size', () => {
    const text = ['First paragraph.', 'Second paragraph.', 'Third one.'].join('\n\n');
    expect(materialSections(text, 40)).toEqual(['First paragraph.\n\nSecond paragraph.', 'Third one.']);
  });
  it('cuts a very long paragraph at sentence ends, never losing text', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = materialSections(long, 200);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
    expect(parts[0].endsWith('.')).toBe(true);
  });
  it('splits the same way every time and ignores empty text', () => {
    const text = 'A.\n\nB.\n\nC.';
    expect(materialSections(text, 3)).toEqual(materialSections(text, 3));
    expect(materialSections('   \n\n  ')).toEqual([]);
  });
});
