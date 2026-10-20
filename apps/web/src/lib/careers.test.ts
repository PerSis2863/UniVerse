import { describe, expect, it } from 'vitest';
import { builtInQuestions, cleanDocuments, cleanGradYear, cleanLink, cleanQuestions, countFillers, lengthAdvice, overlaps, stageOfApplication, starParts, wordCount } from './careers';

describe('application tracker', () => {
  it('follows the reviewer on UniVerse applications', () => {
    expect(stageOfApplication('PENDING')).toBe('APPLIED');
    expect(stageOfApplication('REVIEWING')).toBe('APPLIED');
    expect(stageOfApplication('ACCEPTED')).toBe('OFFER');
    expect(stageOfApplication('WITHDRAWN')).toBe('REJECTED');
  });
  it('keeps only app files and https links as documents', () => {
    const app = (u: string) => u.startsWith('/api/files/');
    expect(cleanDocuments([{ name: 'CV', url: '/api/files/a/cv.pdf' }, { name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Site', url: 'https://x.org/a' }, { name: '', url: 'https://x.org' }], app))
      .toEqual([{ name: 'CV', url: '/api/files/a/cv.pdf' }, { name: 'Site', url: 'https://x.org/a' }]);
    expect(cleanDocuments('nope', app)).toEqual([]);
  });
  it('accepts https links only', () => {
    expect(cleanLink('http://jobs.example.com/1')).toBe('https://jobs.example.com/1');
    expect(cleanLink('javascript:alert(1)')).toBe(null);
    expect(cleanLink('')).toBe(null);
  });
});

describe('interview practice without AI', () => {
  it('counts filler words, and "like" only as a filler', () => {
    const f = countFillers('Um, so I, like, basically led the team. You know, it was, um, hard. I like coding.');
    expect(f.total).toBe(5);
    expect(f.top[0]).toEqual({ word: 'um', n: 2 });
    expect(countFillers('I like teamwork and I liked the project.').total).toBe(0);
  });
  it('finds the STAR parts', () => {
    expect(starParts('During my internship the goal was to cut load time. So I profiled the app and fixed the slow queries. As a result pages loaded 40% faster.')).toBe('STAR');
    expect(starParts('I am a hard worker and a team player.')).toBe('');
    expect(starParts('I decided to rewrite it and we improved the score.')).toBe('AR');
  });
  it('gives length advice', () => {
    expect(wordCount('  one two  three ')).toBe(3);
    expect(lengthAdvice(20)).toMatch(/short/);
    expect(lengthAdvice(150)).toBe(null);
    expect(lengthAdvice(400)).toMatch(/long/);
  });
  it('has questions without AI and cleans AI ones', () => {
    expect(builtInQuestions('data analyst intern')[1]).toBe('Why do you want to work as a data analyst intern?');
    expect(builtInQuestions('an engineer')[1]).toBe('Why do you want to work as an engineer?');
    expect(cleanQuestions(['What is SQL?', 'what is sql?', 'Hi', 3, 'Tell me about a project you led.'])).toEqual(['What is SQL?', 'Tell me about a project you led.']);
  });
});

describe('mentor slots', () => {
  it('spots overlapping times', () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h, m));
    expect(overlaps({ startAt: at(10), minutes: 30 }, { startAt: at(10, 15), minutes: 30 })).toBe(true);
    expect(overlaps({ startAt: at(10), minutes: 30 }, { startAt: at(10, 30), minutes: 30 })).toBe(false);
  });
  it('keeps graduation years sensible', () => {
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(cleanGradYear('2019', now)).toBe(2019);
    expect(cleanGradYear(1900, now)).toBe(null);
    expect(cleanGradYear(2040, now)).toBe(null);
  });
});
