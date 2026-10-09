import { describe, expect, it } from 'vitest';
import { checkAnswers, cleanFields, fillLetter, type FormField } from './admission-form';
import { newRef, phaseOf } from '@/server/admissions';

describe('admission form builder', () => {
  it('keeps valid questions and tidies them', () => {
    const f = cleanFields([{ id: 'why', type: 'long', label: '  Why us?  ', required: true }, { type: 'choice', label: 'Bus?', options: [' Yes', 'No', 'No', ''] }]);
    expect(f).toEqual([{ id: 'why', type: 'long', label: 'Why us?', required: true, help: undefined }, { id: 'q2', type: 'choice', label: 'Bus?', required: false, help: undefined, options: ['Yes', 'No'] }]);
  });
  it('makes ids unique and treats unknown types as short answers', () => {
    const f = cleanFields([{ id: 'a', label: 'One' }, { id: 'a', label: 'Two', type: 'weird' }]);
    expect(f.map((x) => x.id)).toEqual(['a', 'a_']);
    expect(f[1].type).toBe('text');
  });
  it('refuses a question without a label, choices with fewer than two options, and too many uploads', () => {
    expect(() => cleanFields([{ type: 'text', label: '' }])).toThrow(/label/);
    expect(() => cleanFields([{ type: 'multi', label: 'Pick', options: ['Only one'] }])).toThrow(/two choices/);
    expect(() => cleanFields(Array.from({ length: 6 }, (_, i) => ({ type: 'file', label: `Doc ${i}` })))).toThrow(/document/);
  });
});

describe('checking answers', () => {
  const fields: FormField[] = [
    { id: 'name', type: 'text', label: 'School', required: true },
    { id: 'age', type: 'number', label: 'Age', required: false },
    { id: 'bus', type: 'choice', label: 'Bus', required: true, options: ['Yes', 'No'] },
    { id: 'clubs', type: 'multi', label: 'Clubs', required: false, options: ['Chess', 'Art'] },
    { id: 'sib', type: 'yesno', label: 'Sibling here?', required: true },
    { id: 'cert', type: 'file', label: 'Certificate', required: true },
  ];
  it('passes good answers', () => {
    expect(checkAnswers(fields, { name: 'Oak School', age: '11', bus: 'No', clubs: ['Art'], sib: 'yes' }, (id) => id === 'cert')).toEqual({});
  });
  it('flags what’s missing or wrong', () => {
    const e = checkAnswers(fields, { name: ' ', age: 'eleven', bus: 'Maybe', clubs: ['Football'], sib: 'perhaps' });
    expect(Object.keys(e).sort()).toEqual(['age', 'bus', 'cert', 'clubs', 'name', 'sib']);
  });
});

describe('letters, references and round phases', () => {
  it('fills the offer letter', () => {
    expect(fillLetter('Dear {contact}, {student} has a place at {school} ({round}) {date}. {unknown}', { student: 'Asha', contact: 'Priya', round: '2027', school: 'Oak', date: '1 Jan' }))
      .toBe('Dear Priya, Asha has a place at Oak (2027) 1 Jan. {unknown}');
  });
  it('makes readable references', () => {
    for (let i = 0; i < 50; i++) expect(newRef()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/);
  });
  it('knows when a round is open', () => {
    const now = new Date('2026-10-09T12:00:00Z').getTime();
    const r = (o: string, c: string, closed: string | null = null) => ({ opensAt: new Date(o), closesAt: new Date(c), closedAt: closed ? new Date(closed) : null });
    expect(phaseOf(r('2026-10-01', '2026-11-01'), now)).toBe('open');
    expect(phaseOf(r('2026-10-20', '2026-11-01'), now)).toBe('upcoming');
    expect(phaseOf(r('2026-09-01', '2026-10-01'), now)).toBe('ended');
    expect(phaseOf(r('2026-10-01', '2026-11-01', '2026-10-05'), now)).toBe('closed');
  });
});
