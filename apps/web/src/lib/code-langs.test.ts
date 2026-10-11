import { describe, expect, it } from 'vitest';
import { formatTable, toJavaScript } from './code-langs';

describe('more code languages', () => {
  it('turns TypeScript into JavaScript', () => {
    const js = toJavaScript('interface P { x: number }\nconst add = (a: number, b: number): number => a + b;\nlet p: P = { x: add(1, 2) };\nconsole.log(p.x as number);');
    expect(js).not.toMatch(/interface|: number/);
    expect(js).toContain('const add = (a, b) => a + b;');
    expect(() => toJavaScript('const = ;')).toThrow(/^TypeScript:/);
  });
  it('shows SQL results as a table', () => {
    expect(formatTable(['id', 'name'], [[1, 'Asha'], [2, null]])).toEqual([
      '| id | name |',
      '|----|------|',
      '| 1  | Asha |',
      '| 2  | NULL |',
      '(2 rows)',
    ]);
    expect(formatTable(['n'], [[1]], 500, 1).at(-1)).toBe('(1 of 500 rows)');
  });
});
