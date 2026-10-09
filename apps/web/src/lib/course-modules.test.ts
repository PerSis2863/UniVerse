import { describe, expect, it } from 'vitest';
import { lockFor, moved, nextItem, percent } from './course-modules';

const now = new Date('2026-10-08T12:00:00Z');
const open = { published: true, releaseAt: null, requireQuizId: null, requireScore: null };

describe('lockFor', () => {
  it('open with no rules', () => expect(lockFor(open, now, null)).toEqual({ locked: false }));
  it('locked before its release date', () => {
    const l = lockFor({ ...open, releaseAt: '2026-10-12T08:00:00Z' }, now, null);
    expect(l.locked).toBe(true);
    if (l.locked) expect(l.reason).toMatch(/^Opens /);
  });
  it('open once released', () => expect(lockFor({ ...open, releaseAt: '2026-10-01T08:00:00Z' }, now, null).locked).toBe(false));
  it('needs the quiz score', () => {
    const rule = { ...open, requireQuizId: 'q1', requireScore: 60, requireQuizTitle: 'Quiz 1' };
    const notTaken = lockFor(rule, now, null);
    expect(notTaken.locked && notTaken.reason).toBe('Unlocks after “Quiz 1” (60% or more)');
    const low = lockFor(rule, now, 45);
    expect(low.locked && low.reason).toBe('Unlocks at 60% on “Quiz 1” (your best: 45%)');
    expect(lockFor(rule, now, 60).locked).toBe(false);
    expect(lockFor(rule, now, 92).locked).toBe(false);
  });
  it('the release date comes first', () => {
    const l = lockFor({ ...open, releaseAt: '2026-11-01T00:00:00Z', requireQuizId: 'q1', requireScore: 60 }, now, 100);
    expect(l.locked && l.reason).toMatch(/^Opens /);
  });
});

describe('percent', () => {
  it('works out a percentage', () => expect(percent(6, 8)).toBe(75));
  it('null without a score or maximum', () => {
    expect(percent(null, 10)).toBeNull();
    expect(percent(5, 0)).toBeNull();
  });
});

describe('nextItem', () => {
  const mod = (id: string, locked: boolean, done: boolean[]) => ({ id, locked, items: done.map((d, i) => ({ id: `${id}-${i}`, done: d })) });
  it('the first undone item', () => expect(nextItem([mod('a', false, [true, false, false])])?.item.id).toBe('a-1'));
  it('moves on to the next module', () => expect(nextItem([mod('a', false, [true]), mod('b', false, [false])])?.item.id).toBe('b-0'));
  it('skips locked modules', () => expect(nextItem([mod('a', true, [false]), mod('b', false, [false])])?.item.id).toBe('b-0'));
  it('null when everything is done', () => expect(nextItem([mod('a', false, [true, true])])).toBeNull());
});

describe('moved', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('up and down', () => {
    expect(moved(list, 'b', -1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(moved(list, 'b', 1).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('unchanged at the ends', () => {
    expect(moved(list, 'a', -1)).toBe(list);
    expect(moved(list, 'c', 1)).toBe(list);
  });
});
