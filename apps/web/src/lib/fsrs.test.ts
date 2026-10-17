import { describe, expect, it } from 'vitest';
import { preview, retrievability, review, type CardState } from './fsrs';

const fresh: CardState = { stability: null, difficulty: null, lastReview: null, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
const t0 = new Date('2026-10-01T10:00:00Z');
const later = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

describe('FSRS flashcard scheduling', () => {
  it('starts a new card from the answer, and “again” brings it back in ten minutes', () => {
    const good = review(fresh, 'good', t0);
    expect(good).toMatchObject({ stability: 3.7145, interval: 4, reps: 1, lapses: 0 });
    expect(good.due.toISOString()).toBe('2026-10-05T10:00:00.000Z');
    const easy = review(fresh, 'easy', t0);
    expect(easy.interval).toBe(14);
    expect(easy.difficulty).toBeLessThan(good.difficulty);
    const again = review(fresh, 'again', t0);
    expect(again.interval).toBe(0);
    expect(again.due.getTime() - t0.getTime()).toBe(10 * 60_000);
    expect(again.lapses).toBe(0);
  });

  it('spaces reviews out when remembered on time, and shortens them after a lapse', () => {
    let c: CardState = { ...fresh };
    let at = t0;
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const n = review(c, 'good', at);
      gaps.push(n.interval);
      c = { ...c, ...n, ease: 2.5 };
      at = n.due;
    }
    expect(gaps[0]).toBe(4);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    const forgot = review(c, 'again', at);
    expect(forgot.stability).toBeLessThan(c.stability!);
    expect(forgot.lapses).toBe(1);
    expect(forgot.difficulty).toBeGreaterThan(c.difficulty!);
    expect(forgot.difficulty).toBeLessThanOrEqual(10);
  });

  it('remembers better when reviewed later than due (a bigger stability gain)', () => {
    const c = { ...fresh, ...review(fresh, 'good', t0), ease: 2.5 };
    const onTime = review(c, 'good', later(t0, 4));
    const late = review(c, 'good', later(t0, 12));
    expect(late.stability).toBeGreaterThan(onTime.stability);
    expect(retrievability(4, 4)).toBeCloseTo(0.9, 5);
  });

  it('carries on from the SM-2 numbers of older cards', () => {
    const old: CardState = { stability: null, difficulty: null, lastReview: null, interval: 10, ease: 2.5, reps: 3, lapses: 0 };
    const n = review(old, 'good', t0);
    expect(n.interval).toBeGreaterThan(10);
    expect(n.reps).toBe(4);
    expect(preview(fresh, t0)).toEqual({ again: '10 min', hard: '1 d', good: '4 d', easy: '14 d' });
  });
});
