import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));

import { COLUMNS, copiedId, copiedRef, parentsFirst } from './course-copy';

describe('course copy', () => {
  it('gives each copied row a stable, cuid-like id of its own', () => {
    const a = copiedId('course_new', 'quiz_1');
    expect(a).toMatch(/^c[a-z0-9]{24}$/);
    expect(copiedId('course_new', 'quiz_1')).toBe(a); // a step tried again finds the same rows
    expect(copiedId('course_other', 'quiz_1')).not.toBe(a); // another copy of the same course
    expect(copiedId('course_new', 'quiz_2')).not.toBe(a);
  });

  it('points concept tags at the copied questions and rubric rows', () => {
    expect(copiedRef('t', 'QUESTION', 'q1')).toBe(copiedId('t', 'q1'));
    expect(copiedRef('t', 'BANK', 'b1')).toBe(copiedId('t', 'b1'));
    expect(copiedRef('t', 'CRITERION', 'asg1:crit_a')).toBe(`${copiedId('t', 'asg1')}:crit_a`);
  });

  it('adds parent concepts before their children', () => {
    const rows = [
      { id: 'leaf', parentId: 'mid' },
      { id: 'mid', parentId: 'root' },
      { id: 'root', parentId: null },
      { id: 'other', parentId: 'gone' }, // parent not in the course: no wait
    ];
    const order = parentsFirst(rows).map((r) => r.id);
    expect(order.indexOf('root')).toBeLessThan(order.indexOf('mid'));
    expect(order.indexOf('mid')).toBeLessThan(order.indexOf('leaf'));
    expect(order).toHaveLength(4);
    // A loop still finishes.
    expect(parentsFirst([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }])).toHaveLength(2);
  });

  it('knows how many columns each table writes (D1 allows 100 values per statement)', () => {
    for (const [model, columns] of Object.entries(COLUMNS)) {
      const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
      expect(m, model).toBeTruthy();
      expect(m!.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').length, model).toBe(columns);
    }
  });
});
