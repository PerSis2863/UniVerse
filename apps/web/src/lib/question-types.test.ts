import { describe, expect, it } from 'vitest';
import { BLANK, keyFor, valuesFor, metaOf, answerText, cleanGiven, cleanQuestionInput, forStudent, isRight, markAnswer, readNumber, toInput, type CleanQuestion, type QuestionInput } from './question-types';

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
  it('a maths expression: any equal expression is right', () => {
    const q = make({ type: 'MATH', question: 'Expand (x+1)^2.', accepted: ['x^2 + 2x + 1'] });
    expect(isRight(q, '(x+1)^2')).toBe(true);
    expect(isRight(q, '1 + 2x + x²')).toBe(true);
    expect(isRight(q, 'x^2 + 1')).toBe(false);
    expect(markAnswer(q, '2 +')).toEqual({ credit: 0, answered: true });
    expect(forStudent(q, null).ask.math).toBe(true);
    expect(cleanQuestionInput({ type: 'MATH', question: 'x', accepted: ['2 +'] })).toMatch(/can’t be read/);
  });
  it('tapping on a picture', () => {
    const q = make({ type: 'HOTSPOT', question: 'Tap the heart.', image: '/api/files/abcdefghijklmnopqrstu', areas: [{ x: 40, y: 30, w: 20, h: 15 }] });
    expect(isRight(q, '50,35')).toBe(true);
    expect(isRight(q, '10,10')).toBe(false);
    expect(markAnswer(q, 'nonsense')).toEqual({ credit: 0, answered: false });
    expect(forStudent(q, null).ask.image).toBe('/api/files/abcdefghijklmnopqrstu');
    expect(forStudent(q, null)).not.toHaveProperty('meta');
    expect(answerText(q, '50,35')).toBe('A point on the picture');
    expect(cleanQuestionInput({ type: 'HOTSPOT', question: 'x', image: 'https://evil.example/x.png', areas: [{ x: 1, y: 1, w: 5, h: 5 }] })).toBe('Upload the picture first.');
    expect(cleanQuestionInput({ type: 'HOTSPOT', question: 'x', image: '/api/files/abcdefghijklmnopqrstu', areas: [{ x: 99, y: 1, w: 5, h: 5 }] })).toMatch(/Mark the right area/);
  });
  it('numbers that change for each student, marked against their own numbers', () => {
    const q = { ...make({ type: 'NUMBER', question: 'A car drives {d} km in {t} hours. Its average speed in km/h?', formula: 'd/t', vars: [{ name: 'd', min: 60, max: 300, step: 30 }, { name: 't', min: 2, max: 5, step: 1 }], tolerance: 0.05 }), id: 'q9' };
    const mine = forStudent(q, null, 'alice').question;
    expect(mine).not.toContain('{d}');
    const v = valuesFor(metaOf(q), 'alice', 'q9');
    expect(mine).toBe(`A car drives ${v.d} km in ${v.t} hours. Its average speed in km/h?`);
    expect(isRight(q, String(v.d / v.t), 'alice')).toBe(true);
    expect(isRight(q, String(v.d / v.t))).toBe(false); // can't be marked without knowing who
    expect(keyFor(q, 'alice')).toBe(`${Math.round((v.d / v.t) * 1e9) / 1e9} (± 0.05)`);
    expect(q.correctAnswer).toBe('= d/t (± 0.05)');
    // Different students, different numbers (most of the time).
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((w) => forStudent(q, null, w).question)).size).toBeGreaterThan(2);
    expect(cleanQuestionInput({ type: 'NUMBER', question: 'No place for it', formula: 'd', vars: [{ name: 'd', min: 1, max: 2, step: 1 }] })).toMatch(/Put \{d\}/);
    expect(cleanQuestionInput({ type: 'NUMBER', question: '{d}', formula: 'd/k', vars: [{ name: 'd', min: 1, max: 2, step: 1 }] })).toMatch(/uses “k”/);
    expect(cleanQuestionInput({ type: 'NUMBER', question: '{d}', formula: '1/d', vars: [{ name: 'd', min: 0, max: 2, step: 1 }] })).toMatch(/dividing by 0/);
  });
  it('keeps a hint and an explanation, never for students', () => {
    const q = make({ question: '2 + 2?', options: ['3', '4'], correctAnswer: '4', hint: 'Count on your fingers.', explain: 'Two and two make four.' });
    expect(metaOf(q)).toEqual({ hint: 'Count on your fingers.', explain: 'Two and two make four.' });
    expect(isRight(q, '4')).toBe(true);
    expect(JSON.stringify(forStudent(q, null))).not.toContain('fingers');
    expect(toInput(q)).toMatchObject({ hint: 'Count on your fingers.', explain: 'Two and two make four.' });
  });
  it('gives each student their own order, and the same again', () => {
    const q = make({ type: 'CHOICE', question: 'x', options: ['a', 'b', 'c', 'd', 'e', 'f'], correctAnswer: 'a' });
    expect(forStudent(q, 'u1').options).toEqual(forStudent(q, 'u1').options);
    expect([...forStudent(q, 'u1').options].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
