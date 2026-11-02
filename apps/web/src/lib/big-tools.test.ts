import { describe, expect, it } from 'vitest';
import { C128, code128, compile, decide, flow, histogram, invoice, isDue, needed, nextBox, numbers, seeded, spiral, stats, streaks, studyPlan, treeLayout, weighted, wordFreq, wordSearch } from './big-tools';

describe('big tools', () => {
  it('compiles formulas with implicit times', () => {
    expect(compile('2x^2 + 3x - 1')(2)).toBe(13);
    expect(compile('y = sin(pi x/2)')(1)).toBeCloseTo(1);
    expect(compile('-x^2')(3)).toBe(-9);
    expect(compile('3(x+1)')(1)).toBe(6);
    expect(compile('sqrt x')(9)).toBe(3);
    expect(compile('e^x')(0)).toBe(1);
    expect(() => compile('2+')).toThrow();
    expect(() => compile('foo(x)')).toThrow();
  });
  it('does statistics', () => {
    const s = stats(numbers('2, 4, 4, 4, 5, 5, 7, 9'))!;
    expect(s.mean).toBe(5); expect(s.sd).toBe(2); expect(s.median).toBe(4.5); expect(s.mode).toEqual([4]);
    expect(stats([])).toBeNull();
    expect(histogram([1, 2, 3, 4], 2)).toEqual([2, 2]);
  });
  it('lays out a flowchart, loops included', () => {
    const f = flow('Start -> Plan -> Build\nBuild -> Test: done?\nTest -> Build: no');
    expect(f.nodes.map((n) => [n.id, n.layer])).toEqual([['Start', 0], ['Plan', 1], ['Build', 2], ['Test', 3]]);
    expect(f.edges.find((e) => e.from === 'Build' && e.to === 'Test')?.label).toBe('done?');
  });
  it('lays out a mind map', () => {
    const t = treeLayout([{ id: 'r', parent: null, text: '' }, { id: 'a', parent: 'r', text: '' }, { id: 'b', parent: 'r', text: '' }]);
    expect(t.get('r')).toEqual({ depth: 0, row: 0.5 });
    expect(t.get('b')).toEqual({ depth: 1, row: 1 });
  });
  it('hides words in a word search', () => {
    const w = wordSearch(['cat', 'dog', 'bird'], 8, true, seeded(7));
    expect(w.skipped).toEqual([]);
    for (const p of w.placed) expect([...p.word].map((_, k) => w.grid[p.r + p.dr * k][p.c + p.dc * k]).join('')).toBe(p.word);
    expect(w.grid.flat().every((ch) => /^[A-Z]$/.test(ch))).toBe(true);
  });
  it('encodes Code 128', () => {
    expect(C128).toHaveLength(107);
    expect(new Set(C128).size).toBe(107);
    expect(C128.slice(0, 106).every((p) => [...p].reduce((a, d) => a + +d, 0) === 11)).toBe(true);
    // Start B, "A" (33), check (104 + 33) % 103 = 34, stop.
    expect(code128('A').join('')).toBe(C128[104] + C128[33] + C128[34] + C128[106]);
    expect(() => code128('é')).toThrow();
  });
  it('plans revision', () => {
    const p = studyPlan([{ name: 'Maths', date: '2026-11-04', hours: 3 }, { name: 'Art', date: '2026-11-10', hours: 2 }], '2026-11-01', 2);
    expect(p.days[0].items.find((i) => i.name === 'Maths')?.hours).toBeGreaterThan(0);
    expect(p.days.slice(0, 3).flatMap((d) => d.items).filter((i) => i.name === 'Maths').reduce((a, i) => a + i.hours, 0)).toBe(3);
    expect(p.short).toEqual([]);
    expect(studyPlan([{ name: 'X', date: '2026-11-02', hours: 5 }], '2026-11-01', 2).short).toEqual([{ name: 'X', hours: 3 }]);
  });
  it('works out grades', () => {
    expect(weighted([{ score: 80, weight: 30 }, { score: 60, weight: 70 }])).toBe(66);
    expect(needed(70, 60, 75, 40)).toBeCloseTo(82.5);
  });
  it('moves flashcards between boxes', () => {
    expect(nextBox(2, true)).toBe(3); expect(nextBox(5, true)).toBe(5); expect(nextBox(4, false)).toBe(1);
    expect(isDue(1, 3)).toBe(true); expect(isDue(3, 4)).toBe(true); expect(isDue(3, 2)).toBe(false);
  });
  it('scores decisions, counts words, places boxes', () => {
    expect(decide(['A', 'B'], [2, 1], [[1, 5], [5, 1]])[0].name).toBe('B');
    expect(wordFreq('The cat and the cat and a dog')).toEqual([['cat', 2], ['dog', 1]]);
    const p = spiral([{ w: 100, h: 40 }, { w: 80, h: 30 }, { w: 60, h: 20 }], 600, 400).filter((b) => !!b);
    expect(p).toHaveLength(3);
    expect(p[0]!.x + p[0]!.w < p[1]!.x || p[1]!.x + p[1]!.w < p[0]!.x || p[0]!.y + p[0]!.h < p[1]!.y || p[1]!.y + p[1]!.h < p[0]!.y).toBe(true);
  });
  it('totals invoices and streaks', () => {
    expect(invoice([{ what: 'a', qty: 2, price: 50 }], 10, 20)).toEqual({ sub: 100, discount: 10, tax: 18, total: 108 });
    expect(streaks(['2026-10-30', '2026-10-31', '2026-10-25', '2026-10-26', '2026-10-27'], '2026-11-01')).toEqual({ cur: 2, best: 3 });
  });
});
