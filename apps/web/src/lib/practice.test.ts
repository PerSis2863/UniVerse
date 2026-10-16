import { describe, expect, it } from 'vitest';
import { pickNext, type Known } from './practice';

const now = Date.UTC(2026, 9, 16, 12);
const qs = [{ id: 'loops1', concepts: ['loops'] }, { id: 'loops2', concepts: ['loops'] }, { id: 'rec1', concepts: ['recursion'] }, { id: 'misc', concepts: [] }];

describe('adaptive practice', () => {
  it('starts with what the student knows least', () => {
    const known = new Map<string, Known>([['loops', { level: 0.9, n: 8 }], ['recursion', { level: 0.2, n: 5 }]]);
    expect(pickNext(qs, known, [], now, 's')).toEqual({ id: 'rec1', concept: 'recursion', why: 'learning' });
  });
  it('a concept with no evidence yet counts as new', () => {
    const known = new Map<string, Known>([['loops', { level: 0.9, n: 8 }]]);
    expect(pickNext(qs, known, [], now, 's')).toMatchObject({ id: 'rec1', why: 'new' });
  });
  it('doesn’t ask the same question again straight away, and brings back what was missed', () => {
    const known = new Map<string, Known>([['loops', { level: 0.5, n: 4 }], ['recursion', { level: 0.2, n: 5 }]]);
    const justNow = [{ questionId: 'rec1', credit: 0, solved: false, at: now - 60_000 }];
    expect(pickNext(qs, known, justNow, now, 's')?.id).toMatch(/^loops/);
    const anHourAgo = [{ questionId: 'loops1', credit: 0, solved: true, at: now - 3_600_000 }, { questionId: 'rec1', credit: 1, solved: true, at: now - 3_600_000 }];
    expect(pickNext(qs, known, anHourAgo, now, 's')).toMatchObject({ id: 'loops1', why: 'missed' });
  });
  it('lets questions answered right first time rest for a few days', () => {
    const known = new Map<string, Known>([['loops', { level: 0.5, n: 4 }], ['recursion', { level: 0.5, n: 4 }]]);
    const right = ['loops1', 'loops2', 'rec1'].map((id) => ({ questionId: id, credit: 1, solved: true, at: now - 3_600_000 }));
    expect(pickNext(qs, known, right, now, 's')?.id).toBe('misc');
    expect(pickNext([], known, [], now, 's')).toBeNull();
  });
});
