import { describe, expect, it } from 'vitest';
import { BLANK, answerText, cleanGiven, cleanQuestionInput, forStudent, isRight, markAnswer, readNumber, toInput, type CleanQuestion, type QuestionInput } from './question-types';

const make = (b: QuestionInput) => { const q = cleanQuestionInput(b); if (typeof q === 'string') throw new Error(q); return { id: 'q1', ...q }; };

describe('question types', () => {
  it('one answer, as before', () => {
    const q = make({ question: '2 + 2?', options: ['3', '4'], correctAnswer: '4' });
    expect(q).toMatchObject({ type: 'CHOICE', correctAnswer: '4', meta: null });
    expect(isRight(q, '4')).toBe(true);
    expect(markAnswer(q, '3')).toEqual({ credit: 0, answered: true });
    expect(markAnswer(q, undefined)).toEqual({ credit: 0, answered: false });
    // Old rows have no type and no meta.
    expect(isRight({ question: 'x', options: ['a', 'b'], correctAnswer: 'b' }, 'b')).toBe(true);
    expect(cleanQuestionInput({ question: 'x', options: ['a', 'b'], correctAnswer: 'c' })).toBe('The right answer must be one of the options.');
  });
  it('true or false', () => {
    const q = make({ type: 'TRUE_FALSE', question: 'The sun is a star.', correctAnswer: 'true' });
    expect(q.options).toEqual(['True', 'False']);
    expect(isRight(q, 'True')).toBe(true);
    expect(isRight(q, 'False')).toBe(false);
    expect(forStudent(q, 'seed').options).toEqual(['True', 'False']);
  });
  it('several answers, all or nothing, or with partial credit', () => {
    const q = make({ type: 'MULTI', question: 'Primes?', options: ['2', '3', '4', '5'], correct: ['2', '3', '5'] });
    expect(q.correctAnswer).toBe('2, 3, 5');
    expect(isRight(q, ['5', '2', '3'])).toBe(true);
    expect(markAnswer(q, ['2', '3']).credit).toBe(0);
    const p = make({ type: 'MULTI', question: 'Primes?', options: ['2', '3', '4', '5'], correct: ['2', '3', '5'], partial: true });
    expect(markAnswer(p, ['2', '3']).credit).toBe(0.67);
    expect(markAnswer(p, ['2', '4']).credit).toBe(0);
    expect(markAnswer(p, []).answered).toBe(false);
    expect(forStudent(p, null).ask.many).toBe(true);
    expect(cleanQuestionInput({ type: 'MULTI', question: 'x', options: ['a', 'b'], correct: [] })).toBe('Tick at least one right option.');
  });
  it('short answer, loosely compared', () => {
    const q = make({ type: 'SHORT', question: 'Capital of France?', accepted: ['Paris'] });
    expect(isRight(q, '  paris. ')).toBe(true);
    expect(isRight(q, 'Lyon')).toBe(false);
    expect(make({ type: 'SHORT', question: 'Café?', accepted: ['café'] }) && isRight(make({ type: 'SHORT', question: 'x', accepted: ['café'] }), 'CAFE')).toBe(true);
    expect(forStudent(q, 's')).not.toHaveProperty('meta');
    expect(forStudent(q, 's')).not.toHaveProperty('correctAnswer');
  });
  it('fill in the blanks, a share for each', () => {
    const q = make({ type: 'BLANKS', question: 'Water boils at [[100]] °C at [[sea level|sea-level]].' });
    expect(q.question).toBe(`Water boils at ${BLANK} °C at ${BLANK}.`);
    expect(q.correctAnswer).toBe('100 · sea level / sea-level');
    expect(isRight(q, ['100', 'Sea-level'])).toBe(true);
    expect(markAnswer(q, ['100', 'the beach']).credit).toBe(0.5);
    expect(forStudent(q, null).ask.blanks).toBe(2);
    expect(toInput(q).question).toBe('Water boils at [[100]] °C at [[sea level|sea-level]].');
    expect(cleanQuestionInput({ type: 'BLANKS', question: 'No blanks here' })).toMatch(/double brackets/);
  });
  it('matching, with extra choices that match nothing', () => {
    const q = make({ type: 'MATCH', question: 'Match the capitals.', pairs: [{ left: 'France', right: 'Paris' }, { left: 'Spain', right: 'Madrid' }, { left: 'Italy', right: 'Rome' }], extra: ['Berlin'] });
    expect([...(q.options as string[])].sort()).toEqual(['Berlin', 'Madrid', 'Paris', 'Rome']);
    expect(isRight(q, ['Paris', 'Madrid', 'Rome'])).toBe(true);
    expect(markAnswer(q, ['Paris', 'Rome', 'Madrid']).credit).toBe(0.33);
    expect(forStudent(q, 'x').ask.lefts).toEqual(['France', 'Spain', 'Italy']);
    expect(answerText(q, ['Paris', '', 'Rome'])).toBe('France → Paris; Spain → —; Italy → Rome');
  });
  it('putting in order: stored scrambled, credit for each item in its place', () => {
    const q = make({ type: 'ORDER', question: 'Smallest first.', items: ['1', '2', '3', '4'] });
    expect(q.options).not.toEqual(['1', '2', '3', '4']);
    expect(isRight(q, ['1', '2', '3', '4'])).toBe(true);
    expect(markAnswer(q, ['1', '2', '4', '3']).credit).toBe(0.5);
    expect(q.correctAnswer).toBe('1 → 2 → 3 → 4');
  });
  it('a number within the tolerance, typed in different ways', () => {
    const q = make({ type: 'NUMBER', question: 'π to 2 places?', value: '3.14', tolerance: '0.005', unit: '' });
    expect(isRight(q, '3,14')).toBe(true);
    expect(isRight(q, '3.144')).toBe(true);
    expect(isRight(q, '3.15')).toBe(false);
    expect(isRight(q, 'pi')).toBe(false);
    const g = make({ type: 'NUMBER', question: 'g?', value: 9.81, tolerance: 0.1, unit: 'm/s²' });
    expect(isRight(g, '9.8 m/s²')).toBe(true);
    expect(forStudent(g, null).ask.unit).toBe('m/s²');
    expect(g.correctAnswer).toBe('9.81 (± 0.1) m/s²');
    expect([readNumber('1,000.5'), readNumber('−2'), readNumber('1e3'), readNumber('abc')]).toEqual([1000.5, -2, 1000, null]);
  });
  it('keeps only usable answers from the browser', () => {
    const multi = make({ type: 'MULTI', question: 'x', options: ['a', 'b'], correct: ['a'] }) as CleanQuestion & { id: string };
    expect(cleanGiven(multi, ['a', 'a', 7, 'b'])).toEqual(['a', 'b']);
    expect(cleanGiven(multi, 'a')).toBeNull();
    const one = make({ question: 'x', options: ['a', 'b'], correctAnswer: 'a' });
    expect(cleanGiven(one, { evil: true })).toBeNull();
    expect(cleanGiven(one, 'a')).toBe('a');
    expect((cleanGiven(one, 'x'.repeat(2000)) as string).length).toBe(500);
  });
  it('gives each student their own order, and the same again', () => {
    const q = make({ type: 'CHOICE', question: 'x', options: ['a', 'b', 'c', 'd', 'e', 'f'], correctAnswer: 'a' });
    expect(forStudent(q, 'u1').options).toEqual(forStudent(q, 'u1').options);
    expect([...forStudent(q, 'u1').options].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
