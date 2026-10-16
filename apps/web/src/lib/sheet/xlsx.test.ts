import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { csvCells, excelFormula, readXlsx, sheetCsv, writeXlsx } from './xlsx';
import { Calc, mapSource } from './calc';
import { cleanBook, type BookJSON } from './book';

const enc = new TextEncoder();
const files = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc.encode(v)]));

// How Excel itself writes a small workbook: shared strings, a shared formula, styles, widths,
// a merge and a frozen header row.
const EXCEL = files({
  'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Marks" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Score</t></si><si><r><t>Ann</t></r><r><rPr><b/></rPr><t>ie</t></r></si><si><t>Bo</t></si><si><t>007</t></si></sst>',
  'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts><font><sz val="11"/></font><font><b/><sz val="14"/><color rgb="FFFF0000"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills><borders><border/><border><bottom style="thin"/></border></borders><cellXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1"><alignment horizontal="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': `<worksheet><sheetViews><sheetView><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/></cols><sheetData>
    <row r="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" s="1" t="s"><v>1</v></c><c r="C1" t="s"><v>4</v></c></row>
    <row r="2" ht="30" customHeight="1"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>0.8</v></c><c r="C2" s="2"><f t="shared" ref="C2:C3" si="0">B2*100%</f><v>0.8</v></c><c r="D2" s="3"><v>46311</v></c></row>
    <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>0.65</v></c><c r="C3" s="2"><f t="shared" si="0"/><v>0.65</v></c><c r="D3" t="b"><v>1</v></c></row>
    <row r="4" hidden="1"><c r="B4"><f>_xlfn.XLOOKUP("Bo",A2:A3,B2:B3)</f><v>0.65</v></c></row>
  </sheetData><mergeCells><mergeCell ref="E1:F1"/></mergeCells></worksheet>`,
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>=not a formula</t></is></c></row></sheetData></worksheet>',
});

describe('readXlsx', () => {
  const book = readXlsx(EXCEL);
  const [marks, notes] = book.sheets;

  it('reads sheets, values, shared and new formulas', () => {
    expect(book.sheets.map((s) => s.name)).toEqual(['Marks', 'Notes']);
    expect(marks.cells.A2.v).toBe('Annie');
    expect(marks.cells.B2.v).toBe('0.8');
    expect(marks.cells.C1.v).toBe("'007"); // text that looks like a number stays text
    expect(marks.cells.C2.v).toBe('=B2*100%');
    expect(marks.cells.C3.v).toBe('=B3*100%');
    expect(marks.cells.D3.v).toBe('TRUE');
    expect(marks.cells.B4.v).toBe('=XLOOKUP("Bo",A2:A3,B2:B3)');
    expect(notes.cells.A1.v).toBe("'=not a formula");
  });
  it('reads styles, sizes, merges, frozen rows and hidden rows', () => {
    expect(marks.cells.A1.s).toEqual({ b: true, size: 14, color: '#ff0000', bg: '#ffff00', bd: { b: 1 }, align: 'center', wrap: true });
    expect(marks.cells.C2.s).toEqual({ fmt: 'percent', dp: 1 });
    expect(marks.cells.D2.s).toEqual({ fmt: 'date' });
    expect(marks.cols).toEqual({ 0: 145 });
    expect(marks.rows).toEqual({ 1: 40 });
    expect(marks.freeze).toEqual({ r: 1, c: 0 });
    expect(marks.merges).toEqual(['E1:F1']);
    expect(marks.hiddenRows).toEqual([3]);
  });
  it('works the formulas out', () => {
    const calc = new Calc(mapSource(book.sheets.map((s) => ({ id: s.id, name: s.name, cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v])) }))));
    expect(calc.value(marks.id, 2, 2)).toBe(0.65);
    expect(calc.value(marks.id, 3, 1)).toBe(0.65);
  });
  it('refuses files that aren’t workbooks', () => {
    expect(() => readXlsx(files({ 'word/document.xml': '<w/>' }))).toThrow(/isn’t an Excel/);
  });
});

describe('writeXlsx', () => {
  const book: BookJSON = cleanBook({ sheets: [
    { id: 'a', name: 'Budget 2026', cells: { A1: { v: 'Item', s: { b: true, bg: '#eeeeee' } }, B1: { v: 'Cost' }, A2: { v: 'Rent & bills' }, B2: { v: '1200', s: { fmt: 'currency', cur: '€' } }, A3: { v: 'Food <weekly>' }, B3: { v: '85.5' }, B4: { v: '=SUM(B2:B3)', s: { fmt: 'number', dp: 2 } }, C1: { v: 'TRUE' }, C2: { v: "'0042" } }, cols: { 0: 180 }, rows: { 0: 32 }, freeze: { r: 1, c: 0 }, merges: ['D1:E2'] },
    { id: 'b', name: 'Notes', cells: { A1: { v: "='Budget 2026'!B4/12" } } },
  ] });

  it('writes a workbook that reads back the same', () => {
    const calc = new Calc(mapSource(book.sheets.map((s) => ({ id: s.id, name: s.name, cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, c.v])) }))));
    const parts = writeXlsx(book, (sheet, key) => { const m = /^([A-Z]+)(\d+)$/.exec(key)!; return calc.value(sheet, Number(m[2]) - 1, m[1].charCodeAt(0) - 65); });
    // Through a real zip and back, as a download and an upload would.
    const back = readXlsx(unzipSync(zipSync(parts)));
    expect(back.sheets.map((s) => s.name)).toEqual(['Budget 2026', 'Notes']);
    const [a, b] = back.sheets;
    expect(a.cells.A2.v).toBe('Rent & bills');
    expect(a.cells.A3.v).toBe('Food <weekly>');
    expect(a.cells.B4.v).toBe('=SUM(B2:B3)');
    expect(a.cells.C1.v).toBe('TRUE');
    expect(a.cells.C2.v).toBe("'0042");
    expect(a.cells.A1.s).toEqual({ b: true, bg: '#eeeeee' });
    expect(a.cells.B2.s).toEqual({ fmt: 'currency', cur: '€', dp: 2 });
    expect(a.cells.B4.s).toEqual({ fmt: 'number', dp: 2 });
    expect(a.cols).toEqual({ 0: 180 });
    expect(a.rows).toEqual({ 0: 32 });
    expect(a.freeze).toEqual({ r: 1, c: 0 });
    expect(a.merges).toEqual(['D1:E2']);
    expect(b.cells.A1.v).toBe("='Budget 2026'!B4/12");
    // The worked-out value is saved with the formula.
    expect(new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])).toContain('<f>SUM(B2:B3)</f><v>1285.5</v>');
  });
});

describe('excelFormula', () => {
  it('marks newer functions as Excel wants, and only functions', () => {
    expect(excelFormula('IFS(A1>1,"IFS(",TRUE,"x")+xlookup(1,A:A,B:B)')).toBe('_xlfn.IFS(A1>1,"IFS(",TRUE,"x")+_xlfn.XLOOKUP(1,A:A,B:B)');
    expect(excelFormula('SUM(A1:A3)')).toBe('SUM(A1:A3)');
  });
});

describe('CSV', () => {
  it('keeps exported text from running as a formula elsewhere', () => {
    expect(sheetCsv([['=1+1', '-5', '@x', 'a,b', 'say "hi"']])).toBe(`'=1+1,-5,'@x,"a,b","say ""hi"""`);
  });
  it('never runs imported text as a formula', () => {
    expect(csvCells([['=HYPERLINK("x")', '12'], ['', 'b']])).toEqual({ A1: { v: '\'=HYPERLINK("x")' }, B1: { v: '12' }, B2: { v: 'b' } });
  });
});
