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

describe('help search: careers (Q15)', () => {
  it('finds the tracker, interview practice and mentors for students', () => {
    expect(top('track my job applications', 'STUDENT')).toBe('application-tracker');
    expect(top('job alerts', 'STUDENT')).toBe('application-tracker');
    expect(top('practise for an interview', 'STUDENT')).toBe('interview-practice');
    expect(top('book a call with alumni', 'STUDENT')).toBe('mentors');
  });

  it('shows teachers how to mentor', () => {
    expect(top('become a mentor', 'TEACHER')).toBe('mentor-teacher');
  });
});

describe('help search: global impact (Q16)', () => {
  it('finds donations, certificates and the carbon tracker', () => {
    expect(top('how do I donate to an NGO', 'STUDENT')).toBe('donations');
    expect(top('80G receipt', 'TEACHER')).toBe('donations');
    expect(top('turn on donations for an NGO', 'ADMIN')).toBe('donations-admin');
    expect(top('certificate for my volunteer hours', 'STUDENT')).toBe('volunteer-shifts');
    expect(top('carbon footprint of my club', 'STUDENT')).toBe('club-carbon');
  });
});

describe('help search: student life (Q17)', () => {
  it('finds tickets, elections, the board and pre-orders', () => {
    expect(top('buy a ticket for an event', 'STUDENT')).toBe('event-tickets');
    expect(top('scan tickets at the door', 'ADMIN')).toBe('event-tickets-admin');
    expect(top('is my vote secret', 'STUDENT')).toBe('club-elections');
    expect(top('sell my books', 'STUDENT')).toBe('campus-board');
    expect(top('carpool', 'STUDENT')).toBe('campus-board');
    expect(top('pre-order food', 'STUDENT')).toBe('meal-preorders');
    expect(top('kitchen orders', 'ADMIN')).toBe('meal-preorders-admin');
  });
});
