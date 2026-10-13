import { describe, expect, it } from 'vitest';
import { cleanScores, cleanTranscript, defaultRubric, examinerPrompt, isOralKind, maxOf, parseRubric, studentWords, totalOf } from './oral';

describe('oral exams (Stage 5 · D11)', () => {
  it('has a rubric for each kind, scoring clarity, depth and evidence', () => {
    expect(isOralKind('VIVA')).toBe(true);
    expect(isOralKind('toString')).toBe(false);
    expect(defaultRubric('VIVA').map((c) => c.id)).toEqual(['clarity', 'depth', 'evidence']);
    expect(defaultRubric('DEBATE').map((c) => c.id)).toContain('rebuttal');
    expect(defaultRubric('LANGUAGE').map((c) => c.id)).toEqual(['clarity', 'accuracy', 'range', 'depth']);
    expect(maxOf(defaultRubric('VIVA'))).toBe(12);
  });

  it('accepts a teacher’s rubric within limits, with unique ids', () => {
    const r = parseRubric([{ name: 'Clarity', max: 5 }, { name: 'Clarity', max: 3 }, { name: '', max: 4 }, { name: 'Too big', max: 50 }, { name: '  Use of sources ', max: '4', desc: 'Cites the reading' }]);
    expect(r).toEqual([
      { id: 'clarity', name: 'Clarity', desc: '', max: 5 },
      { id: 'clarity-2', name: 'Clarity', desc: '', max: 3 },
      { id: 'use-of-sources', name: 'Use of sources', desc: 'Cites the reading', max: 4 },
    ]);
    expect(parseRubric([])).toBeNull();
    expect(parseRubric('x')).toBeNull();
  });

  it('keeps AI scores within the rubric and only quotes the student really said', () => {
    const rubric = defaultRubric('VIVA');
    const s = cleanScores([
      { id: 'clarity', score: 3.6, reason: 'Clear.', quote: '“Round robin gives each process a turn”' },
      { id: 'depth', score: 9, reason: 'Deep.', quote: 'something never said' },
      { id: 'other', score: 4 },
    ], rubric, 'Round robin gives each process a   turn, then it moves on.');
    expect(s).toEqual([
      { id: 'clarity', score: 4, reason: 'Clear.', quote: 'Round robin gives each process a turn' },
      { id: 'depth', score: 4, reason: 'Deep.', quote: '' },
      { id: 'evidence', score: 0, reason: '', quote: '' },
    ]);
    expect(totalOf(s)).toBe(8);
  });

  it('cleans a transcript from the browser', () => {
    const lines = cleanTranscript([{ who: 'ai', text: ' Hello,  why? ' }, { who: 'hacker', text: 'my answer' }, { who: 'you', text: '   ' }, null]);
    expect(lines).toEqual([{ who: 'ai', text: 'Hello, why?' }, { who: 'you', text: 'my answer' }]);
    expect(studentWords(lines)).toBe('my answer');
    expect(cleanTranscript([{ who: 'you', text: 'x'.repeat(20) }, { who: 'you', text: 'y'.repeat(20) }], 120, 30)).toHaveLength(1);
  });

  it('tells the examiner how to run each kind of oral', () => {
    const viva = examinerPrompt({ kind: 'VIVA', topic: 'Scheduling', minutes: 8, name: 'Sam' });
    expect(viva).toContain('Topic: Scheduling.');
    expect(viva).toContain("don't give answers or hints");
    expect(examinerPrompt({ kind: 'LANGUAGE', topic: 'My town', minutes: 5, lang: 'fr' })).toContain('Speak only French');
    expect(examinerPrompt({ kind: 'DEBATE', topic: 'Uniforms', minutes: 5 })).toContain('opposite side');
    expect(examinerPrompt({ kind: 'VIVA', topic: 'T', minutes: 8, questions: '1. What is a quantum?' })).toContain('The teacher wants these covered');
  });
});
