import { describe, expect, it } from 'vitest';
import { dropLowest, finalGrade, letter, pct, type Category } from './gradebook';

const g = (assessment: string, score: number, maxScore = 100) => ({ assessment, score, maxScore });

describe('pct and dropLowest', () => {
  it('percent', () => {
    expect(pct(15, 20)).toBe(75);
    expect(pct(5, 0)).toBe(0);
  });
  it('drops the lowest, keeping one', () => {
    expect(dropLowest([70, 50, 90], 1)).toEqual({ kept: [70, 90], dropped: 1 });
    expect(dropLowest([70], 3)).toEqual({ kept: [70], dropped: 0 });
    expect(dropLowest([], 1)).toEqual({ kept: [], dropped: 0 });
  });
});

describe('finalGrade', () => {
  const cats: Category[] = [
    { id: 'hw', name: 'Homework', weight: 40, dropLowest: 1 },
    { id: 'ex', name: 'Exams', weight: 60, dropLowest: 0 },
  ];
  const map: Record<string, string> = { 'HW 1': 'hw', 'HW 2': 'hw', 'HW 3': 'hw', Midterm: 'ex', Final: 'ex' };
  const of = (a: string) => map[a] ?? null;

  it('plain average without categories', () => {
    expect(finalGrade([g('A', 80), g('B', 60)], [], of).final).toBe(70);
    expect(finalGrade([], [], of).final).toBeNull();
  });
  it('weights categories and drops the lowest homework', () => {
    const r = finalGrade([g('HW 1', 100), g('HW 2', 40), g('HW 3', 80), g('Midterm', 70), g('Final', 90)], cats, of);
    // Homework (drop 40): 90; exams: 80 → 0.4·90 + 0.6·80 = 84
    expect(r.final).toBeCloseTo(84);
    expect(r.byCategory.find((c) => c.id === 'hw')).toMatchObject({ average: 90, counted: 2, dropped: 1 });
  });
  it('an empty category doesn’t pull the final down', () => {
    expect(finalGrade([g('HW 1', 80)], cats, of).final).toBe(80);
  });
  it('uses the score out of its maximum', () => {
    expect(finalGrade([g('Midterm', 35, 50)], cats, of).final).toBe(70);
  });
  it('grades in no category count with what is left of 100%', () => {
    const partial: Category[] = [{ id: 'ex', name: 'Exams', weight: 75, dropLowest: 0 }];
    const r = finalGrade([g('Midterm', 80), g('Quiz', 40)], partial, of);
    expect(r.uncategorized).toBe(1);
    expect(r.final).toBeCloseTo(0.75 * 80 + 0.25 * 40);
  });
  it('with weights already at 100%, uncategorized grades don’t count', () => {
    const r = finalGrade([g('Midterm', 80), g('Pop quiz', 10)], cats, of);
    expect(r.uncategorized).toBe(1);
    expect(r.final).toBe(80);
  });
});

describe('letter', () => {
  it.each([[95, 'A', 4], [90, 'A', 4], [85, 'B', 3], [72, 'C', 2], [60, 'D', 1], [59.9, 'F', 0]])('%s → %s', (p, l, gpa) => expect(letter(p)).toEqual({ letter: l, gpa }));
  it('null without grades', () => expect(letter(null)).toBeNull());
});
