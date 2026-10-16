import { describe, expect, it } from 'vitest';
import { Calc, mapSource } from './calc';
import { cellOf } from './refs';
import { serial } from './values';

/** Works out one sheet ("Sheet1") plus optional others; returns a reader by address. */
function book(cells: Record<string, string>, more: { name: string; cells: Record<string, string> }[] = [], now = Date.UTC(2026, 9, 16, 12)) {
  const calc = new Calc(mapSource([{ id: 's1', name: 'Sheet1', cells }, ...more.map((m, i) => ({ id: `s${i + 2}`, ...m }))]), { now: () => now, rand: () => 0.5 });
  return (a: string, sheet = 's1') => { const x = cellOf(a)!; return calc.value(sheet, x.r, x.c); };
}
const one = (formula: string, cells: Record<string, string> = {}) => book({ ...cells, Z99: formula })('Z99');

describe('values and arithmetic', () => {
  it('reads typed values', () => {
    const v = book({ A1: '12', A2: '1,200.5', A3: '50%', A4: 'hello', A5: 'TRUE', A6: "'007", A7: '2026-10-16', A8: '$3' });
    expect([v('A1'), v('A2'), v('A3'), v('A4'), v('A5'), v('A6'), v('A7'), v('A8'), v('B1')]).toEqual([12, 1200.5, 0.5, 'hello', true, '007', serial(2026, 10, 16), 3, null]);
  });
  it('follows Excel’s order of operations', () => {
    expect(one('=1+2*3')).toBe(7);
    expect(one('=(1+2)*3')).toBe(9);
    expect(one('=-2^2')).toBe(4);
    expect(one('=2^3^2')).toBe(64);
    expect(one('=10%')).toBe(0.1);
    expect(one('=1+2&"x"')).toBe('3x');
    expect(one('=1<2')).toBe(true);
    expect(one('="a"="A"')).toBe(true);
    expect(one('=5/0')).toEqual({ e: '#DIV/0!' });
    expect(one('="x"+1')).toEqual({ e: '#VALUE!' });
    expect(one('=A1+1', { A1: '' })).toBe(1);
  });
  it('reads references, areas and other sheets', () => {
    const v = book({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', B2: '=A1+Data!B2', B3: "='My data'!A1*2", B4: '=SUM(A:A)', B5: '=Nope!A1' }, [{ name: 'Data', cells: { B2: '10' } }, { name: 'My data', cells: { A1: '21' } }]);
    expect([v('B1'), v('B2'), v('B3'), v('B4'), v('B5')]).toEqual([6, 11, 42, 6, { e: '#REF!' }]);
  });
  it('shows loops as #CIRC! and copes with long chains', () => {
    const v = book({ A1: '=B1', B1: '=A1', C1: '=C1+1' });
    expect([v('A1'), v('B1'), v('C1')]).toEqual([{ e: '#CIRC!' }, { e: '#CIRC!' }, { e: '#CIRC!' }]);
    const cells: Record<string, string> = { A1: '1' };
    for (let r = 2; r <= 3000; r++) cells[`A${r}`] = `=A${r - 1}+1`;
    expect(book(cells)('A3000')).toBe(3000);
  });
  it('says #NAME? for unknown functions and formulas that can’t be read', () => {
    expect(one('=NOPE(1)')).toEqual({ e: '#NAME?' });
    expect(one('=1+')).toEqual({ e: '#NAME?' });
    expect(one('=foo')).toEqual({ e: '#NAME?' });
  });
});

describe('functions', () => {
  const data = { A1: '10', A2: '20', A3: 'x', A4: '', A5: '30', B1: 'apple', B2: 'banana', B3: 'apple', B4: 'cherry', B5: 'apple' };
  it('adds, averages and counts as Excel does', () => {
    expect(one('=SUM(A1:A5)', data)).toBe(60);
    expect(one('=SUM(1,"2",TRUE)')).toBe(4);
    expect(one('=AVERAGE(A1:A5)', data)).toBe(20);
    expect(one('=COUNT(A1:A5)', data)).toBe(3);
    expect(one('=COUNTA(A1:A5)', data)).toBe(4);
    expect(one('=COUNTBLANK(A1:A5)', data)).toBe(1);
    expect(one('=MIN(A1:A5)', data)).toBe(10);
    expect(one('=MAX(A1:A5)', data)).toBe(30);
    expect(one('=AVERAGE(C1:C3)')).toEqual({ e: '#DIV/0!' });
    expect(one('=MEDIAN(1,2,3,4)')).toBe(2.5);
    expect(one('=STDEV(2,4,4,4,5,5,7,9)')).toBeCloseTo(2.138, 3);
    expect(one('=LARGE(A1:A5,2)', data)).toBe(20);
    expect(one('=RANK(20,A1:A5)', data)).toBe(2);
    expect(one('=SUMPRODUCT(A1:A2,A1:A2)', data)).toBe(500);
  });
  it('counts and adds with criteria', () => {
    expect(one('=COUNTIF(B1:B5,"apple")', data)).toBe(3);
    expect(one('=COUNTIF(B1:B5,"a*")', data)).toBe(3);
    expect(one('=COUNTIF(B1:B5,"<>apple")', data)).toBe(2);
    expect(one('=COUNTIF(A1:A5,">15")', data)).toBe(2);
    expect(one('=SUMIF(B1:B5,"apple",A1:A5)', data)).toBe(40);
    expect(one('=SUMIFS(A1:A5,B1:B5,"apple",A1:A5,">15")', data)).toBe(30);
    expect(one('=AVERAGEIF(A1:A5,">5")', data)).toBe(20);
    expect(one('=COUNTIFS(B1:B5,"apple",A1:A5,"<>")', data)).toBe(3);
    expect(one('=COUNTIFS(B1:B5,"<>apple",A1:A5,"<>")', data)).toBe(1);
  });
  it('rounds and does maths', () => {
    expect(one('=ROUND(1.005,2)')).toBe(1.01);
    expect(one('=ROUND(1234.5,-2)')).toBe(1200);
    expect(one('=ROUNDUP(1.21,1)')).toBe(1.3);
    expect(one('=ROUNDDOWN(-1.29,1)')).toBe(-1.2);
    expect(one('=INT(-1.5)')).toBe(-2);
    expect(one('=MOD(-3,2)')).toBe(1);
    expect(one('=SQRT(-1)')).toEqual({ e: '#NUM!' });
    expect(one('=FACT(5)')).toBe(120);
    expect(one('=GCD(12,18)')).toBe(6);
    expect(one('=CEILING(4.2,0.5)')).toBe(4.5);
    expect(one('=RANDBETWEEN(1,10)')).toBe(6);
  });
  it('makes decisions', () => {
    expect(one('=IF(A1>5,"big","small")', data)).toBe('big');
    expect(one('=IF(FALSE,1)')).toBe(false);
    expect(one('=IFS(A1>50,"a",A1>5,"b")', data)).toBe('b');
    expect(one('=AND(TRUE,1)')).toBe(true);
    expect(one('=OR(FALSE,0)')).toBe(false);
    expect(one('=IFERROR(1/0,"none")')).toBe('none');
    expect(one('=IFNA(VLOOKUP("z",B1:B5,1,FALSE),"missing")', data)).toBe('missing');
    expect(one('=SWITCH(2,1,"one",2,"two","many")')).toBe('two');
    expect(one('=CHOOSE(2,"a","b","c")')).toBe('b');
    expect(one('=ISBLANK(A4)', data)).toBe(true);
    expect(one('=ISERROR(1/0)')).toBe(true);
    expect(one('=IF(TRUE,1,1/0)')).toBe(1);
  });
  it('works with text', () => {
    expect(one('=LEN("héllo")')).toBe(5);
    expect(one('=LEFT("Hello",2)&RIGHT("Hello",2)&MID("Hello",2,3)')).toBe('Heloell');
    expect(one('=PROPER("hello wORLD")')).toBe('Hello World');
    expect(one('=TRIM("  a   b ")')).toBe('a b');
    expect(one('=SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c');
    expect(one('=FIND("l","Hello")')).toBe(3);
    expect(one('=SEARCH("L*O","Hello")')).toBe(3);
    expect(one('=TEXTJOIN(", ",TRUE,B1:B3,"")', data)).toBe('apple, banana, apple');
    expect(one('=TEXT(1234.5,"#,##0.00")')).toBe('1,234.50');
    expect(one('=TEXT(0.256,"0.0%")')).toBe('25.6%');
    expect(one('=VALUE("1,000")')).toBe(1000);
    expect(one('=CONCAT("a",1,TRUE)')).toBe('a1TRUE');
  });
  it('looks things up', () => {
    const t = { A1: 'id', B1: 'name', A2: '1', B2: 'Ann', A3: '2', B3: 'Bo', A4: '3', B4: 'Cy', D1: '0', D2: '50', D3: '70', E1: 'F', E2: 'C', E3: 'A' };
    expect(one('=VLOOKUP(2,A2:B4,2,FALSE)', t)).toBe('Bo');
    expect(one('=VLOOKUP(65,D1:E3,2)', t)).toBe('C');
    expect(one('=VLOOKUP(9,A2:B4,2,FALSE)', t)).toEqual({ e: '#N/A' });
    expect(one('=VLOOKUP(2,A2:B4,3,FALSE)', t)).toEqual({ e: '#REF!' });
    expect(one('=HLOOKUP("name",A1:B4,3,FALSE)', t)).toBe('Bo');
    expect(one('=XLOOKUP("Cy",B2:B4,A2:A4)', t)).toBe(3);
    expect(one('=XLOOKUP("Zed",B2:B4,A2:A4,"no one")', t)).toBe('no one');
    expect(one('=INDEX(A2:B4,3,2)', t)).toBe('Cy');
    expect(one('=MATCH("Bo",B2:B4,0)', t)).toBe(2);
    expect(one('=INDEX(B2:B4,MATCH(3,A2:A4,0))', t)).toBe('Cy');
    expect(one('=ROW(B7)+COLUMN(C1)')).toBe(10);
    expect(one('=ROWS(A1:B4)*COLUMNS(A1:B4)')).toBe(8);
  });
  it('works with dates', () => {
    const d = serial(2026, 10, 16);
    expect(one('=TODAY()')).toBe(d);
    expect(one('=DATE(2026,10,16)')).toBe(d);
    expect(one('=DATE(2026,13,1)')).toBe(serial(2027, 1, 1));
    expect(one('=YEAR(A1)&"-"&MONTH(A1)&"-"&DAY(A1)', { A1: '2026-10-16' })).toBe('2026-10-16');
    expect(one('=WEEKDAY(DATE(2026,10,16))')).toBe(6); // a Friday
    expect(one('=DATEDIF("2000-05-20","2026-10-16","Y")')).toBe(26);
    expect(one('=EOMONTH("2026-02-10",0)')).toBe(serial(2026, 2, 28));
    expect(one('=EDATE("2026-01-31",1)')).toBe(serial(2026, 2, 28));
    expect(one('=NETWORKDAYS("2026-10-12","2026-10-18")')).toBe(5);
    expect(one('=WORKDAY("2026-10-16",1)')).toBe(serial(2026, 10, 19));
    expect(one('=TEXT(DATE(2026,10,16),"dddd d mmmm yyyy")')).toBe('Friday 16 October 2026');
    expect(one('=HOUR("14:30")*100+MINUTE("14:30")')).toBe(1430);
  });
  it('does money sums', () => {
    expect(one('=PMT(0.05/12,60,10000)')).toBeCloseTo(-188.71, 2);
    expect(one('=FV(0.05,10,-100)')).toBeCloseTo(1257.79, 2);
    expect(one('=NPV(0.1,100,100)')).toBeCloseTo(173.55, 2);
    expect(one('=IRR(A1:A3)', { A1: '-100', A2: '60', A3: '60' })).toBeCloseTo(0.1307, 4);
  });
});
