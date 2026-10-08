import { describe, expect, it } from 'vitest';
import { analyseQuiz } from './item-analysis';

const q = (id: string, correctAnswer = 'A', options = ['A', 'B', 'C', 'D']) => ({ id, options, correctAnswer });
const s = (answers: Record<string, string>) => ({ answers });

describe('analyseQuiz', () => {
  it('nothing to analyse without answers', () => {
    const r = analyseQuiz([q('q1')], []);
    expect(r.students).toBe(0);
    expect(r.items[0]).toMatchObject({ right: null, separates: null, flags: [], fix: false });
  });

  it('share right and option counts', () => {
    const r = analyseQuiz([q('q1')], [s({ q1: 'A' }), s({ q1: 'B' }), s({ q1: 'A' }), s({})]);
    expect(r.items[0].right).toBe(0.5);
    expect(r.items[0].counts.find((c) => c.option === 'A')?.n).toBe(2);
    expect(r.items[0].blank).toBe(1);
  });

  it('flags a question most got wrong, and a popular wrong answer', () => {
    const r = analyseQuiz([q('q1')], [s({ q1: 'B' }), s({ q1: 'B' }), s({ q1: 'B' }), s({ q1: 'A' })]);
    expect(r.items[0].fix).toBe(true);
    expect(r.items[0].flags.join(' ')).toMatch(/Most students got this wrong/);
    expect(r.items[0].flags.join(' ')).toMatch(/More students chose “B”/);
  });

  it('spots a reversed question (strong students get it wrong)', () => {
    // q1 and q2 rank students; q3 is answered right only by the weakest.
    const items = [q('q1'), q('q2'), q('q3')];
    const subs = [
      s({ q1: 'A', q2: 'A', q3: 'B' }), s({ q1: 'A', q2: 'A', q3: 'B' }),
      s({ q1: 'A', q2: 'B', q3: 'B' }), s({ q1: 'B', q2: 'B', q3: 'A' }), s({ q1: 'B', q2: 'B', q3: 'A' }),
    ];
    const r = analyseQuiz(items, subs);
    expect(r.items[2].separates).toBeLessThan(0);
    expect(r.items[2].fix).toBe(true);
    expect(r.items[0].separates).toBeGreaterThan(0.5);
  });

  it('notes options nobody chose and questions everybody got right', () => {
    const r = analyseQuiz([q('q1')], Array.from({ length: 5 }, () => s({ q1: 'A' })));
    expect(r.items[0].right).toBe(1);
    expect(r.items[0].flags.some((f) => f.startsWith('Everyone'))).toBe(true);
    expect(r.items[0].fix).toBe(false);
  });

  it('KR-20 consistency with enough students and questions', () => {
    const items = [q('a'), q('b'), q('c'), q('d')];
    const subs = [
      s({ a: 'A', b: 'A', c: 'A', d: 'A' }), s({ a: 'A', b: 'A', c: 'A', d: 'B' }), s({ a: 'A', b: 'A', c: 'B', d: 'B' }),
      s({ a: 'A', b: 'B', c: 'B', d: 'B' }), s({ a: 'B', b: 'B', c: 'B', d: 'B' }),
    ];
    const r = analyseQuiz(items, subs);
    expect(r.consistency).toBeGreaterThan(0.7);
    expect(analyseQuiz(items, subs.slice(0, 4)).consistency).toBeNull();
  });
});
