import { describe, expect, it } from 'vitest';
import { cleanQuestion, csvRows, parseQuestionCsv } from './question-bank';

describe('cleanQuestion', () => {
  const base = { question: 'Which is a prime?', options: ['4', '7', '9'], correctAnswer: '7' };
  it('accepts a good question with defaults', () => expect(cleanQuestion(base)).toEqual({ ...base, points: 1, tags: [], difficulty: null }));
  it('needs text, 2–6 different options and a right answer among them', () => {
    expect(cleanQuestion({ ...base, question: ' ' })).toMatch(/needs its text/);
    expect(cleanQuestion({ ...base, options: ['7'] })).toMatch(/2 to 6/);
    expect(cleanQuestion({ ...base, options: ['7', '7 '] })).toMatch(/different/);
    expect(cleanQuestion({ ...base, correctAnswer: '11' })).toMatch(/one of the options/);
  });
  it('matches the right answer ignoring case', () => expect((cleanQuestion({ question: 'x', options: ['Yes', 'No'], correctAnswer: 'yes' }) as { correctAnswer: string }).correctAnswer).toBe('Yes'));
  it('tidies tags, points and difficulty', () => {
    const q = cleanQuestion({ ...base, tags: 'Maths, primes; maths', points: '2.3', difficulty: 'hard' });
    expect(q).toMatchObject({ tags: ['maths', 'primes'], points: 2.5, difficulty: 'HARD' });
    expect(cleanQuestion({ ...base, points: 500 })).toMatch(/Points/);
  });
});

describe('csvRows', () => {
  it('quotes, commas inside quotes and doubled quotes', () => expect(csvRows('a,"b, c","say ""hi"""\n1,2,3')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]));
  it('semicolons and CRLF', () => expect(csvRows('a;b\r\nc;d\r\n')).toEqual([['a', 'b'], ['c', 'd']]));
  it('skips empty lines', () => expect(csvRows('a,b\n\n,\nc,d')).toEqual([['a', 'b'], ['c', 'd']]));
});

describe('parseQuestionCsv', () => {
  it('reads a file with a header and letter answers', () => {
    const csv = 'Question,Option A,Option B,Option C,Option D,Correct,Points,Tags,Difficulty\n"What is 2+2?",3,4,5,,B,1,"maths, easy",Easy\nCapital of France?,Paris,Rome,,,Paris,2,geography,medium';
    const r = parseQuestionCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]).toMatchObject({ question: 'What is 2+2?', options: ['3', '4', '5'], correctAnswer: '4', difficulty: 'EASY', tags: ['maths', 'easy'] });
    expect(r.questions[1]).toMatchObject({ correctAnswer: 'Paris', points: 2, difficulty: 'MEDIUM' });
  });
  it('reads a file without a header in the documented order', () => {
    const r = parseQuestionCsv('Is water wet?,Yes,No,,,A');
    expect(r.questions[0]).toMatchObject({ options: ['Yes', 'No'], correctAnswer: 'Yes' });
  });
  it('reports bad lines with their line number and keeps the good ones', () => {
    const r = parseQuestionCsv('question,a,b,correct\nGood?,x,y,a\nBad?,x,,a\nAlso bad?,x,y,c');
    expect(r.questions).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it('ignores a byte-order mark and empty files', () => {
    expect(parseQuestionCsv('﻿question,a,b,correct\nQ?,x,y,b').questions[0].correctAnswer).toBe('y');
    expect(parseQuestionCsv('')).toEqual({ questions: [], errors: [] });
  });
});
