import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));

import { cleanDraft } from './syllabus';

describe('syllabus drafts', () => {
  it('keeps what the teacher wrote, without blanks, and within the limits', () => {
    const d = cleanDraft({
      outcomes: ['Write loops', '', '  ', 'Explain   recursion', 'a', 'b', 'c', 'd'],
      skills: ['Programming', 'programming', 'Debugging'],
      modules: [
        { title: ' Getting started ', summary: 'x'.repeat(500), topics: ['Variables', '', 42, 'Types'] },
        { title: '', topics: ['dropped'] },
        ...Array.from({ length: 30 }, (_, i) => ({ title: `Week ${i}` })),
      ],
    });
    expect(d.outcomes).toEqual(['Write loops', 'Explain recursion', 'a', 'b', 'c', 'd']);
    expect(d.skills).toEqual(['Programming', 'Debugging']);
    expect(d.modules[0]).toEqual({ title: 'Getting started', summary: 'x'.repeat(400), topics: ['Variables', 'Types'] });
    expect(d.modules).toHaveLength(20);
    expect(d.modules[1].title).toBe('Week 0');
  });

  it('turns anything else into an empty draft', () => {
    expect(cleanDraft(null)).toEqual({ outcomes: [], skills: [], modules: [] });
    expect(cleanDraft({ modules: 'no' })).toEqual({ outcomes: [], skills: [], modules: [] });
  });
});
