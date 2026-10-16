import { describe, expect, it } from 'vitest';
import { adjustForChange, dropSheetIn, functionsIn, parseFormula, renameSheetIn, shiftFormula, tokenize } from './formula';
import { addr, colIndex, colName, parseAddr, parseArea, sheetPrefix } from './refs';

describe('addresses', () => {
  it('names columns as Excel does', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(['A', 'z', 'AA', 'ZZ', 'AAA', '1', 'ABCD'].map(colIndex)).toEqual([0, 25, 26, 701, 702, -1, -1]);
  });
  it('reads and writes addresses and areas', () => {
    expect(parseAddr('$B$3')).toEqual({ r: 2, c: 1, absR: true, absC: true });
    expect(parseAddr('A0')).toBeNull();
    expect(parseArea('C3:A1')).toEqual({ r1: 0, c1: 0, r2: 2, c2: 2 });
    expect(addr(2, 1, true, false)).toBe('B$3');
    expect(sheetPrefix('Sheet1')).toBe('Sheet1!');
    expect(sheetPrefix("Bob's sheet")).toBe("'Bob''s sheet'!");
    expect(sheetPrefix('A1')).toBe("'A1'!");
  });
});

describe('parseFormula', () => {
  it('reads functions, sheets and whole columns', () => {
    expect(parseFormula("SUM('My data'!A1:B2, Data!C:C)")).toEqual({ k: 'fn', name: 'SUM', args: [
      { k: 'area', sheet: 'My data', r1: 0, c1: 0, r2: 1, c2: 1 },
      { k: 'area', sheet: 'Data', r1: 0, c1: 2, r2: 9999, c2: 2 },
    ] });
    expect(parseFormula('LOG10(100)')).toMatchObject({ k: 'fn', name: 'LOG10' });
    expect(parseFormula('_xlfn.XLOOKUP(1,A:A,B:B)')).toMatchObject({ k: 'fn', name: 'XLOOKUP' });
    expect(parseFormula('IF(A1;1;2)')).toMatchObject({ k: 'fn', args: [{ k: 'ref' }, { k: 'num' }, { k: 'num' }] });
    expect(parseFormula('"say ""hi"""')).toEqual({ k: 'str', v: 'say "hi"' });
  });
  it('refuses what isn’t a formula', () => {
    for (const bad of ['1+', 'SUM(1', '"open', '(1))', 'A1 B1', '#WHAT']) expect(parseFormula(bad), bad).toBeNull();
  });
  it('lists the functions used', () => {
    expect([...functionsIn(parseFormula('IF(SUM(A1:A2)>1,ROUND(B1,2),0)')!)]).toEqual(['IF', 'SUM', 'ROUND']);
  });
  it('keeps the position of each piece', () => {
    expect(tokenize('A1 + Sheet2!B2')!.map((t) => [t.t, t.at, t.end])).toEqual([['ref', 0, 2], ['op', 3, 4], ['ref', 5, 14]]);
  });
});

describe('moving references', () => {
  it('copies a formula like Excel: relative references move, $ ones stay', () => {
    expect(shiftFormula('A1+$B$1+C$1+$D1', 2, 1)).toBe('B3+$B$1+D$1+$D3');
    expect(shiftFormula('SUM(A1:A3) * 2', 1, 0)).toBe('SUM(A2:A4) * 2');
    expect(shiftFormula('A1', -1, 0)).toBe('#REF!');
    expect(shiftFormula("'My data'!A1", 0, 1)).toBe("'My data'!B1");
    expect(shiftFormula('SUM(A:A)', 5, 1)).toBe('SUM(B:B)');
    expect(shiftFormula('"A1"&A1', 1, 0)).toBe('"A1"&A2');
  });
  it('follows inserted and deleted rows and columns', () => {
    const rows = (src: string, at: number, count: number, here = true) => adjustForChange(src, { sheet: 'Sheet1', here, axis: 'row', at, count });
    expect(rows('A1+A5', 2, 3)).toBe('A1+A8');
    expect(rows('SUM(A2:A6)', 3, 2)).toBe('SUM(A2:A8)');
    expect(rows('SUM(A2:A6)', 1, 1)).toBe('SUM(A3:A7)');
    expect(rows('A3', 2, -1)).toBe('#REF!');
    expect(rows('A5+SUM(A2:A6)', 2, -2)).toBe('A3+SUM(A2:A4)');
    expect(rows('SUM(A3:A4)', 2, -2)).toBe('SUM(#REF!)');
    expect(rows('Other!A5+A5', 0, 1)).toBe('Other!A5+A6');
    expect(rows('Sheet1!A5+A5', 0, 1, false)).toBe('Sheet1!A6+A5');
    expect(rows('SUM(A:A)', 0, 1)).toBe('SUM(A:A)');
    const cols = (src: string, at: number, count: number) => adjustForChange(src, { sheet: 'Sheet1', here: true, axis: 'col', at, count });
    expect(cols('C1+SUM(A1:D1)', 1, 1)).toBe('D1+SUM(A1:E1)');
    expect(cols('SUM(B:D)', 2, -1)).toBe('SUM(B:C)');
  });
  it('follows renamed and deleted sheets', () => {
    expect(renameSheetIn('Data!A1+data!B2+Other!C3', 'Data', 'Year 2026')).toBe("'Year 2026'!A1+'Year 2026'!B2+Other!C3");
    expect(dropSheetIn('Data!A1+B2', 'data')).toBe('#REF!+B2');
  });
});
