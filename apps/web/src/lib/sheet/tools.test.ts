import { describe, expect, it } from 'vitest';
import { fillSeries, ruleLook, ruleStats, sortArea } from './tools';
import type { CellJSON, RuleJSON } from './book';
import { keyOf } from './refs';
import { readInput } from './values';

describe('fillSeries', () => {
  it('continues numbers, dates, numbered text, months and days', () => {
    expect(fillSeries(['5'], 3, 1, 0)).toEqual(['5', '5', '5']);
    expect(fillSeries(['1', '3'], 3, 1, 0)).toEqual(['5', '7', '9']);
    expect(fillSeries(['0.1', '0.2'], 2, 1, 0)).toEqual(['0.3', '0.4']);
    expect(fillSeries(['2026-10-30'], 3, 1, 0)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(fillSeries(['Item 1'], 2, 1, 0)).toEqual(['Item 2', 'Item 3']);
    expect(fillSeries(['Q09'], 2, 1, 0)).toEqual(['Q10', 'Q11']);
    expect(fillSeries(['November'], 3, 1, 0)).toEqual(['December', 'January', 'February']);
    expect(fillSeries(['Mon', 'Wed'], 2, 1, 0)).toEqual(['Fri', 'Sun']);
    expect(fillSeries(['yes', 'no'], 3, 1, 0)).toEqual(['yes', 'no', 'yes']);
    expect(fillSeries(['Item 1', 'Item 3'], 2, 1, 0)).toEqual(['Item 5', 'Item 7']);
    expect(fillSeries(['JAN', 'APR'], 2, 1, 0)).toEqual(['JUL', 'OCT']);
  });
  it('moves formula references as it fills', () => {
    expect(fillSeries(['=A1*2'], 2, 1, 0)).toEqual(['=A2*2', '=A3*2']);
    expect(fillSeries(['=A1+$B$1'], 2, 0, 1)).toEqual(['=B1+$B$1', '=C1+$B$1']);
  });
});

describe('sortArea', () => {
  const cells: Record<string, CellJSON> = { A1: { v: 'Name' }, B1: { v: 'Score' }, A2: { v: 'Cy' }, B2: { v: '7' }, A3: { v: 'Ann' }, B3: { v: '' }, A4: { v: 'Bo' }, B4: { v: '9' }, C2: { v: '=B2*2' } };
  const value = (r: number, c: number) => readInput(cells[keyOf(r, c)]?.v ?? '').v;
  it('sorts rows below the header, empty cells last, formulas following their row', () => {
    const out = sortArea((k) => cells[k], value, { r1: 0, c1: 0, r2: 3, c2: 2 }, 1, false, true);
    expect([out.A2?.v, out.A3?.v, out.A4?.v]).toEqual(['Bo', 'Cy', 'Ann']);
    expect(out.C3?.v).toBe('=B3*2');
    expect(out.A1).toBeUndefined();
  });
  it('sorts text A to Z', () => {
    const out = sortArea((k) => cells[k], value, { r1: 1, c1: 0, r2: 3, c2: 1 }, 0, true, false);
    expect([out.A2?.v, out.A3?.v, out.A4?.v]).toEqual(['Ann', 'Bo', 'Cy']);
  });
});

describe('conditional colours', () => {
  const vals = [10, 50, 90, 'x', null, 50];
  const look = (rule: Omit<RuleJSON, 'id' | 'area'>, v: (typeof vals)[number]) => { const r = { id: 'r', area: 'A1:A6', ...rule } as RuleJSON; return ruleLook(r, v, ruleStats(r, vals)); };
  it('tests values', () => {
    expect(look({ kind: 'gt', a: '40', bg: '#ff0000' }, 50)).toEqual({ bg: '#ff0000' });
    expect(look({ kind: 'gt', a: '40' }, 10)).toBeNull();
    expect(look({ kind: 'between', a: '60', b: '20' }, 50)).toEqual({ bg: '#fde68a' });
    expect(look({ kind: 'contains', a: 'X' }, 'x')).not.toBeNull();
    expect(look({ kind: 'empty' }, null)).not.toBeNull();
    expect(look({ kind: 'top', a: '1' }, 90)).not.toBeNull();
    expect(look({ kind: 'top', a: '1' }, 50)).toBeNull();
    expect(look({ kind: 'aboveAvg' }, 90)).not.toBeNull();
    expect(look({ kind: 'dupe' }, 50)).not.toBeNull();
    expect(look({ kind: 'dupe' }, 10)).toBeNull();
  });
  it('makes scales and bars', () => {
    expect(look({ kind: 'scale' }, 10)).toEqual({ bg: '#f8696b' });
    expect(look({ kind: 'scale' }, 90)).toEqual({ bg: '#63be7b' });
    expect(look({ kind: 'bars' }, 45)).toEqual({ bar: 0.5 });
  });
});
