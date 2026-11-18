import { describe, expect, it } from 'vitest';
import { buildVersions, cleanRubric, itemScore, paperScore, paperTotal, type SourceQuestion } from './exam-paper';

const qs: SourceQuestion[] = [
  { id: 'q1', question: '2 + 2?', type: 'CHOICE', options: ['3', '4', '5', '6'], correctAnswer: '4', points: 1 },
  { id: 'q2', question: 'The sun is a star.', type: 'TRUE_FALSE', options: ['True', 'False'], correctAnswer: 'True', points: 1 },
  { id: 'q3', question: 'Primes?', type: 'MULTI', options: ['2', '4', '5', '9'], correctAnswer: '["2","5"]', points: 2 },
  { id: 'q4', question: 'pi to 2 places', type: 'NUMBER', options: [], correctAnswer: '3.14', points: 1 },
  { id: 'q5', question: 'Explain photosynthesis.', type: 'SHORT', options: [], correctAnswer: '', points: 5, rubric: [{ name: 'Light', points: 2 }, { name: 'Sugar', points: 3 }] },
];

describe('paper exams', () => {
  it('keeps version A in order and the same versions for the same seed', () => {
    const a = buildVersions(qs, { versions: 3, shuffleOptions: true, seed: 's' });
    expect(a.map((v) => v.label)).toEqual(['A', 'B', 'C']);
    expect(a[0].items.map((i) => i.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    expect(buildVersions(qs, { versions: 3, shuffleOptions: true, seed: 's' })).toEqual(a);
    for (const v of a) expect(v.items.at(-1)?.id).toBe('q5');
  });

  it('writes each version’s key in its own option order', () => {
    for (const v of buildVersions(qs, { versions: 4, shuffleOptions: true, seed: 'x' })) {
      const q1 = v.items.find((i) => i.id === 'q1')!;
      expect(q1.options['ABCD'.indexOf(q1.key)]).toBe('4');
      const q3 = v.items.find((i) => i.id === 'q3')!;
      expect([...q3.key].map((l) => q3.options['ABCD'.indexOf(l)]).sort()).toEqual(['2', '5']);
      expect(v.items.find((i) => i.id === 'q2')!.options).toEqual(['True', 'False']);
    }
  });

  it('marks from the key and the rubric', () => {
    const [a] = buildVersions(qs, { versions: 1, shuffleOptions: false, seed: 's' });
    expect(paperTotal(a)).toBe(10);
    expect(itemScore(a.items[2], { answer: 'c a' })).toBe(2);
    expect(itemScore(a.items[2], { answer: 'A' })).toBe(0);
    expect(itemScore(a.items[3], { answer: '3,14' })).toBe(1);
    expect(itemScore(a.items[4], { rubric: [2, 9] })).toBe(5);
    expect(paperScore(a, { q1: { answer: 'b' }, q2: { answer: 'A' }, q5: { rubric: [1, 1] } })).toBe(4);
  });

  it('keeps only sensible rubric rows', () => {
    expect(cleanRubric([{ name: ' Ideas ', points: 3.3 }, { name: '', points: 2 }, { name: 'x', points: -1 }, 'no'])).toEqual([{ name: 'Ideas', points: 3.5 }]);
  });
});
