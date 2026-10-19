import { describe, expect, it } from 'vitest';
import { searchHelp } from './search';

const top = (q: string, role?: 'STUDENT' | 'TEACHER' | 'ADMIN') => searchHelp(q, role).matches[0]?.entry.id;

describe('help search: skills passport (Q14)', () => {
  it('finds the CV, portfolio and LinkedIn answer for students', () => {
    expect(top('how do I make a CV', 'STUDENT')).toBe('passport-portfolio');
    expect(top('add my certificate to linkedin', 'STUDENT')).toBe('passport-portfolio');
    expect(top('change my portfolio colour', 'STUDENT')).toBe('passport-portfolio');
  });

  it('finds how an employer checks a credential, for everyone', () => {
    expect(top('how can an employer verify my certificate', 'STUDENT')).toBe('verify-credential');
    expect(top('is this certificate real', 'ADMIN')).toBe('verify-credential');
  });
});
