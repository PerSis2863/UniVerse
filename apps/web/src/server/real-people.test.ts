import { describe, expect, it } from 'vitest';
import { realPeopleColumns } from './real-people';

describe('real people (M79)', () => {
  const cols = realPeopleColumns(Date.parse('2026-11-03T12:00:00Z'));
  it('leaves made-up accounts out of every number (and counts them only in "left")', () => {
    for (const [k, sql] of cols) {
      expect(sql, k).toContain("NOT LIKE '%@sample.universe.test'");
      expect(sql, k).toContain("'demo@student.com'");
      if (k === 'left') expect(sql).toContain('NOT (');
    }
  });
  it('has every app for 7 and 30 days, with dates in the stored form', () => {
    for (const app of ['UniVersity', 'Trace', 'Relief', 'Green', 'Play']) for (const d of ['7', '30']) expect(cols.some(([k]) => k === app + d)).toBe(true);
    expect(cols.find(([k]) => k === 'week')![1]).toContain("'2026-10-27T12:00:00.000+00:00'");
  });
});
