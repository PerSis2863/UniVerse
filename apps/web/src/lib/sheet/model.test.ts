import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addSheet, changeLines, clipFromText, copyArea, deleteSheet, duplicateSheet, getMeta, liveSource, loadBook, moveSheet, nameOf, pasteCells, renameSheet, setCells, sheetIds, toBook, cellsOf, sizeOf, LOCAL } from './model';
import { Calc } from './calc';

function book() {
  const doc = new Y.Doc();
  loadBook(doc, { sheets: [
    { id: 'a', name: 'Marks', cells: { A1: { v: 'Name' }, B1: { v: 'Score' }, A2: { v: 'Ann' }, B2: { v: '7' }, A3: { v: 'Bo' }, B3: { v: '9' }, B4: { v: '=SUM(B2:B3)' } }, rows: { 2: 40 }, merges: ['A5:B5'], charts: [{ id: 'c1', type: 'column', area: 'A1:B3', title: '' }] },
    { id: 'b', name: 'Summary', cells: { A1: { v: '=Marks!B4*2' } } },
  ] });
  return doc;
}
const v = (doc: Y.Doc, sheet: string, k: string) => cellsOf(doc, sheet)?.get(k)?.v;

describe('the live workbook', () => {
  it('loads and gives back the same workbook', () => {
    const doc = book();
    const back = toBook(doc);
    expect(back.sheets.map((s) => s.name)).toEqual(['Marks', 'Summary']);
    expect(back.sheets[0].rows).toEqual({ 2: 40 });
    expect(back.sheets[0].merges).toEqual(['A5:B5']);
    const calc = new Calc(liveSource(doc));
    expect(calc.value('b', 0, 0)).toBe(32);
  });
  it('inserts and deletes rows with formulas, sizes, merges and charts following', () => {
    const doc = book();
    changeLines(doc, 'a', 'row', 2, 1); // a new row 3
    expect(v(doc, 'a', 'A4')).toBe('Bo');
    expect(v(doc, 'a', 'B5')).toBe('=SUM(B2:B4)');
    expect(v(doc, 'b', 'A1')).toBe('=Marks!B5*2');
    expect(sizeOf(doc, 'a', 'rows', 3)).toBe(40);
    expect(getMeta(doc, 'a', 'merges')).toEqual(['A6:B6']);
    expect(getMeta(doc, 'a', 'charts')?.[0].area).toBe('A1:B4');
    changeLines(doc, 'a', 'row', 1, -1); // delete Ann's row
    expect(v(doc, 'a', 'A2')).toBeUndefined();
    expect(v(doc, 'a', 'A3')).toBe('Bo');
    expect(v(doc, 'a', 'B4')).toBe('=SUM(B2:B3)');
    changeLines(doc, 'a', 'col', 0, -1);
    expect(v(doc, 'a', 'A1')).toBe('Score');
    expect(v(doc, 'b', 'A1')).toBe('=Marks!A4*2');
  });
  it('renames, copies, moves and deletes sheets', () => {
    const doc = book();
    expect(renameSheet(doc, 'a', 'Term 1: marks')).toBe('Term 1 marks');
    expect(v(doc, 'b', 'A1')).toBe("='Term 1 marks'!B4*2");
    const copy = duplicateSheet(doc, 'a')!;
    expect(nameOf(doc, copy)).toBe('Term 1 marks (2)');
    expect(sheetIds(doc)).toEqual(['a', copy, 'b']);
    moveSheet(doc, 'b', 0);
    expect(sheetIds(doc)[0]).toBe('b');
    deleteSheet(doc, 'a');
    expect(v(doc, 'b', 'A1')).toBe('=#REF!*2');
    const added = addSheet(doc)!;
    expect(nameOf(doc, added)).toMatch(/^Sheet\d$/);
  });
  it('copies and pastes like Excel', () => {
    const doc = book();
    const clip = copyArea(doc, 'a', { r1: 1, c1: 1, r2: 3, c2: 1 });
    const out = pasteCells(clip, { r: 1, c: 3 }, null, 'all');
    expect(out.D4?.v).toBe('=SUM(D2:D3)');
    const repeated = pasteCells(copyArea(doc, 'a', { r1: 1, c1: 0, r2: 1, c2: 0 }), { r: 10, c: 0 }, { rows: 3, cols: 1 }, 'all');
    expect(Object.keys(repeated)).toEqual(['A11', 'A12', 'A13']);
    const values = pasteCells(clip, { r: 1, c: 3 }, null, 'values', () => '16');
    expect(values.D4?.v).toBe('16');
    const text = clipFromText('a\tb\n1\t\n');
    expect(text).toMatchObject({ rows: 2, cols: 2, cells: [[{ v: 'a' }, { v: 'b' }], [{ v: '1' }, null]] });
  });
  it('can undo its own changes only', () => {
    const doc = book();
    const undo = new Y.UndoManager([doc.getArray('order'), doc.getMap('sheets')], { trackedOrigins: new Set([LOCAL]) });
    setCells(doc, 'a', { C1: { v: 'mine' } });
    doc.transact(() => { cellsOf(doc, 'a')!.set('D1', { v: 'theirs' }); }, 'remote');
    undo.undo();
    expect(v(doc, 'a', 'C1')).toBeUndefined();
    expect(v(doc, 'a', 'D1')).toBe('theirs');
  });
});
