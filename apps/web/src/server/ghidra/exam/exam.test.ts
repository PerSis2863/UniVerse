import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

import { codeIn, mark, papers, questions, SKILL_IDS } from '.';
import { langOf, newNumbers, numbers, type Ask } from './kit';
import { wordError } from './papers-shared';

describe('Ghidra’s exam', () => {
  it('has a paper of 50–150 different questions for every skill, the same on every run', async () => {
    const all = await papers(), repeats: string[] = [];
    for (const id of SKILL_IDS) {
      expect(all[id], id).toBeTruthy();
      const qs = questions(id, all[id]);
      expect(qs.length, id).toBeGreaterThanOrEqual(50);
      expect(qs.length, id).toBeLessThanOrEqual(150);
      expect(qs.every((q) => q.rules.length > 0 && (q.mode === 'audio' ? !!q.say : !!q.system && !!q.prompt)), id).toBe(true);
      const kinds = new Set(qs.map((q) => `${q.system.slice(0, 200)}|${q.prompt}|${q.say ?? ''}|${q.html ?? ''}`));
      if (kinds.size < qs.length * 0.4) repeats.push(`${id} ${kinds.size}/${qs.length}`);
      expect(questions(id, all[id]).map((q) => q.prompt)).toEqual(qs.map((q) => q.prompt));
    }
    expect(repeats, 'papers that repeat themselves').toEqual([]);
  });

  it('fails a missing answer, broken JSON, the wrong shape and another AI’s name', async () => {
    const ask = questions('safety', (await papers()).safety)[0];
    expect(mark(ask, null)).toEqual(['no answer']);
    expect(mark(ask, 'sorry')).toEqual(['not JSON']);
    expect(mark(ask, { unsafe: 'yes' })).toEqual(['wrong shape']);
    expect(mark(ask, { unsafe: true, kind: 'bullying', severity: 'high', reason: 'As Gemini, I flag this.' })).toContain('says it is another AI');
  });

  it('passes a right safety verdict and fails a wrong one', async () => {
    const [unsafe, safe] = questions('safety', (await papers()).safety);
    expect(mark(unsafe, { unsafe: true, kind: 'bullying', severity: 'high', reason: 'Insults a classmate.' })).toEqual([]);
    expect(mark(safe, { unsafe: true, kind: 'bullying', severity: 'low', reason: 'x' })).toEqual(['flagged a safe message']);
  });

  it('scores support by its rules, numbered steps allowed', async () => {
    const qs = questions('support', (await papers()).support);
    const kettle = qs.find((q) => q.prompt.includes('ACTIVE RECALL') && q.prompt.includes('warranty and how'))!;
    const steps = 'Recall first: stop using it and contact Hearthly. The warranty is 24 months:\n1. Register it on this passport.\n2. Keep your receipt.';
    expect(mark(kettle, { answer: steps, answered: true })).toEqual([]);
    expect(mark(kettle, { answer: 'The warranty is 36 months and we will refund you.', answered: true })).toEqual(expect.arrayContaining(['recall not first', 'a promise', 'a number not in the facts']));
  });

  it('checks answers from passages: citations, groundedness, language', async () => {
    const qs: Ask[] = questions('semester', (await papers()).semester);
    const off = qs[3], inQ = qs[0];
    expect(mark(off, { answer: 'The passages don’t say; ask your teacher.', grounded: false, used: [] })).toEqual([]);
    expect(mark(off, { answer: 'It is on Monday [1].', grounded: true, used: [1] })).toContain('makes up an answer the passages don’t give');
    expect(mark(inQ, { answer: 'See [9].', grounded: true, used: [9] })).toContain('cites a passage that isn’t there');
  });

  it('reads the code out of a reply', () => {
    expect(codeIn('Here:\n```matlab\nx = 1;\ndisp(x)\n```\nDone.')).toBe('x = 1;\ndisp(x)');
    expect(codeIn('disp(2)')).toBe('disp(2)');
  });

  it('counts numbers without list numbering, citations or hashtags', () => {
    expect([...numbers('1. Register it\n2. Keep 24 receipts [3] #Top10')]).toEqual(['24']);
    expect(newNumbers('It lasts 24 or 36 months', 'Warranty: 24 months')).toEqual(['36']);
  });

  it('guesses languages and word errors well enough', () => {
    expect(langOf('¿Qué gas se libera en la fotosíntesis? El oxígeno.')).toBe('es');
    expect(langOf('The gas that is released is oxygen.')).toBe('en');
    expect(langOf('कल की परीक्षा')).toBe('hi');
    expect(wordError('the cat sat on the mat', 'the cat sat on a mat')).toBeCloseTo(1 / 6);
  });
});
