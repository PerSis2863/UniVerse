import { describe, expect, it } from 'vitest';
import { parseGift } from './gift';
import { cleanQuestion } from './question-bank';

describe('parseGift', () => {
  it('reads one-answer multiple choice with a title, comments and feedback', () => {
    const r = parseGift(`// a comment
::Capitals::What is the capital of France? {
  =Paris#Yes!
  ~London#No
  ~Berlin
}`);
    expect(r.errors).toEqual([]);
    expect(r.questions).toEqual([{ type: 'CHOICE', question: 'What is the capital of France?', points: 1, options: ['Paris', 'London', 'Berlin'], correctAnswer: 'Paris' }]);
  });

  it('reads true / false in all its spellings', () => {
    const r = parseGift('The sun is a star. {T}\n\nThe moon is a planet. {FALSE}\n\nWater is wet. {TRUE#right}');
    expect(r.questions.map((q) => q.correctAnswer)).toEqual(['True', 'False', 'True']);
    expect(r.questions.every((q) => q.type === 'TRUE_FALSE')).toBe(true);
  });

  it('reads short answers and fill in the blank', () => {
    const r = parseGift('Who wrote Hamlet? {=Shakespeare =William Shakespeare}\n\nWater boils at {=100 =one hundred} degrees.');
    expect(r.questions[0]).toMatchObject({ type: 'SHORT', question: 'Who wrote Hamlet?', accepted: ['Shakespeare', 'William Shakespeare'] });
    expect(r.questions[1]).toMatchObject({ type: 'BLANKS', question: 'Water boils at [[100|one hundred]] degrees.' });
  });

  it('reads several right answers, weighted ones as partly right', () => {
    const r = parseGift('Which are primes? {~%50%2 ~%50%3 ~%-100%4}\n\nPick the fruits. {=apple =pear ~carrot}');
    expect(r.questions[0]).toMatchObject({ type: 'MULTI', options: ['2', '3', '4'], correct: ['2', '3'], partial: true });
    expect(r.questions[1]).toMatchObject({ type: 'MULTI', options: ['apple', 'pear', 'carrot'], correct: ['apple', 'pear'], partial: false });
  });

  it('reads matching, with extra right-hand answers', () => {
    const r = parseGift('Match the animals. {=cat -> meow =dog -> woof = -> moo}');
    expect(r.questions[0]).toMatchObject({ type: 'MATCH', pairs: [{ left: 'cat', right: 'meow' }, { left: 'dog', right: 'woof' }], extra: ['moo'] });
  });

  it('reads numbers with a tolerance, a range or several answers', () => {
    const r = parseGift('Pi to two places? {#3.14:0.01}\n\nA number from 1 to 5. {#1..5}\n\nWhen was Ulysses Grant born? {#=1822:0 =%50%1822:2}');
    expect(r.questions.map((q) => [q.type, q.value, q.tolerance])).toEqual([['NUMBER', 3.14, 0.01], ['NUMBER', 3, 2], ['NUMBER', 1822, 0]]);
  });

  it('keeps general feedback as the explanation and strips formats and HTML', () => {
    const r = parseGift('[html]<p>What is <b>2+2</b>?</p> {=4 ####Two and two make four.}');
    expect(r.questions[0]).toMatchObject({ type: 'SHORT', question: 'What is 2+2?', accepted: ['4'], explain: 'Two and two make four.' });
  });

  it('reads escaped special characters', () => {
    const r = parseGift('What is 1 \\= 1 \\{really\\}? {=yes \\~ sure ~no}');
    expect(r.questions[0]).toMatchObject({ type: 'CHOICE', question: 'What is 1 = 1 {really}?', options: ['yes ~ sure', 'no'], correctAnswer: 'yes ~ sure' });
  });

  it('skips categories, and says which questions couldn’t be read', () => {
    const r = parseGift('$CATEGORY: tom/course\n\n::Essay::Write about your summer. {}\n\nNo braces here.\n\nPi? {#abc}');
    expect(r.questions).toEqual([]);
    expect(r.errors.map((e) => [e.n, e.title])).toEqual([[1, 'Essay'], [2, 'No braces here.'], [3, 'Pi?']]);
  });

  it('gives questions the server accepts', () => {
    const r = parseGift(`::Q1::Capital of Spain? {=Madrid ~Lisbon ~Rome}

Is grass green? {T}

Name a primary colour. {=red =blue =yellow}

Match. {=a -> 1 =b -> 2}

Pick two. {=x =y ~z}

Roughly 10? {#10:1}

The cat sat on the {=mat}.`);
    expect(r.errors).toEqual([]);
    for (const q of r.questions) expect(typeof cleanQuestion(q)).toBe('object');
  });

  it('copes with Windows line endings and a byte-order mark', () => {
    const r = parseGift('﻿Q one? {T}\r\n\r\nQ two? {F}\r\n');
    expect(r.questions.map((q) => q.question)).toEqual(['Q one?', 'Q two?']);
  });
});
