import { describe, expect, it } from 'vitest';
import { SHEET_TEMPLATES } from './templates';
import { cleanBook } from './book';
import { Calc, mapSource } from './calc';
import { cellOf } from './refs';
import { isErr } from './values';

describe('spreadsheet templates', () => {
  for (const t of SHEET_TEMPLATES) {
    it(`${t.name}: survives cleaning and every formula works`, () => {
      const raw = t.book();
      const book = cleanBook(raw);
      expect(book).toEqual(raw);
      const calc = new Calc(mapSource(book.sheets.map((s) => ({ id: s.id, name: s.name, cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v])) }))), { now: () => Date.UTC(2026, 9, 16) });
      for (const s of book.sheets) for (const [k, c] of Object.entries(s.cells)) {
        if (!c.v.startsWith('=')) continue;
        const at = cellOf(k)!;
        const v = calc.value(s.id, at.r, at.c);
        expect(isErr(v), `${t.id} ${k} ${c.v} → ${JSON.stringify(v)}`).toBe(false);
      }
    });
  }
  it('works out the budget and gradebook', () => {
    const budget = SHEET_TEMPLATES[0].book().sheets[0];
    const calc = new Calc(mapSource([{ id: 's1', name: 'Budget', cells: Object.fromEntries(Object.entries(budget.cells).map(([k, c]) => [k, c.v])) }]));
    // Money in 170, out 130 each month: 40 left over, 240 over six months.
    expect(calc.value('s1', 13, 2)).toBe(40);
    expect(calc.value('s1', 13, 8)).toBe(240);
    const marks = SHEET_TEMPLATES[1].book().sheets[0];
    const c2 = new Calc(mapSource([{ id: 's1', name: 'Marks', cells: Object.fromEntries(Object.entries(marks.cells).map(([k, c]) => [k, c.v])) }]));
    expect([c2.value('s1', 3, 4), c2.value('s1', 3, 5), c2.value('s1', 6, 5), c2.value('s1', 6, 6)]).toEqual([84.3, 'B', 'F', false]);
  });
});
