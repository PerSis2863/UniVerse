import { describe, expect, it } from 'vitest';
import { checkQuestions } from './quiz-draft';

describe('Ghidra’s quiz drafts: every question checked (M366)', () => {
  it('keeps real questions with four different options and a right answer among them', () => {
    const good = { question: 'What is 1/2 + 1/4?', options: ['3/4', '2/6', '1/8', '2/4'], answer: 0 };
    expect(checkQuestions([good], 5)).toEqual([good]);
  });
  it('drops anything off, and stops at the number asked for', () => {
    const qs = checkQuestions([
      { question: 'Hi?', options: ['a', 'b', 'c', 'd'], answer: 0 }, // too short
      { question: 'Which is a prime number?', options: ['4', '6', '7'], answer: 2 }, // three options
      { question: 'Which is a prime number?', options: ['4', '4', '7', '9'], answer: 2 }, // the same option twice
      { question: 'Which is a prime number?', options: ['4', '6', '7', '9'], answer: 7 }, // no such answer
      { question: 'Which is a prime number?', options: ['4', '6', '7', '9'], answer: 2 },
      { question: 'Which is an even number?', options: ['3', '5', '8', '9'], answer: 2 },
    ], 1);
    expect(qs).toHaveLength(1);
    expect(qs[0].options[qs[0].answer]).toBe('7');
    expect(checkQuestions('nonsense', 5)).toEqual([]);
  });
});
