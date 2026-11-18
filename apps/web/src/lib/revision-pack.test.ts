import { describe, expect, it } from 'vitest';
import { cleanPack, joinSources, outlinePack } from './revision-pack';

describe('revision packs', () => {
  it('keeps only well-formed parts', () => {
    const p = cleanPack({ overview: '  Big   picture ', topics: [{ title: 'Trees', summary: 'x', points: ['a', 3, ''], terms: [{ term: 'BST', meaning: 'ordered' }, { term: 'no meaning' }] }, { summary: 'no title' }], questions: [{ q: 'Why?', a: 'Because' }, { q: 'No answer' }], checklist: ['one', null] });
    expect(p.overview).toBe('Big picture');
    expect(p.topics).toEqual([{ title: 'Trees', summary: 'x', points: ['a'], terms: [{ term: 'BST', meaning: 'ordered' }] }]);
    expect(p.questions).toEqual([{ q: 'Why?', a: 'Because', topic: '' }]);
    expect(p.checklist).toEqual(['one']);
    expect(cleanPack('nonsense').topics).toEqual([]);
  });

  it('makes an outline from the modules', () => {
    const p = outlinePack([{ title: 'Processes', summary: 'What runs', items: ['Slides', 'Lab'] }]);
    expect(p.topics[0].points).toEqual(['Slides', 'Lab']);
    expect(p.checklist).toEqual(['I can explain “Processes” in my own words']);
  });

  it('shares the room between sources', () => {
    const t = joinSources([{ title: 'A', text: 'a'.repeat(50_000) }, { title: 'B', text: 'short' }], 10_000);
    expect(t.length).toBeLessThanOrEqual(10_000);
    expect(t).toContain('## B\nshort');
  });
});
