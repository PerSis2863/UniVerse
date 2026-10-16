import { describe, expect, it } from 'vitest';
import { cleanStyle, codeOf, display, formatCode, roundTo } from './format';
import { dateFrom, numText, readInput, serial, timeFrom } from './values';

describe('number formats', () => {
  it('formats numbers with Excel codes', () => {
    expect(formatCode(1234.567, '#,##0.00')).toBe('1,234.57');
    expect(formatCode(1234.567, '0')).toBe('1235');
    expect(formatCode(0.5, '0%')).toBe('50%');
    expect(formatCode(0.1234, '0.0%')).toBe('12.3%');
    expect(formatCode(-1234.5, '#,##0.00')).toBe('-1,234.50');
    expect(formatCode(-5, '$#,##0;($#,##0)')).toBe('($5)');
    expect(formatCode(0, '0.00;-0.00;"zero"')).toBe('zero');
    expect(formatCode(12345, '0.00E+00')).toBe('1.23E+04');
    expect(formatCode(1.5, '#.##')).toBe('1.5');
    expect(formatCode(7, '000')).toBe('007');
    expect(formatCode(1500000, '#,##0,"k"')).toBe('1,500k');
    expect(formatCode(3, '0 "items"')).toBe('3 items');
  });
  it('formats dates and times', () => {
    const d = serial(2026, 10, 16) + 0.6041666667; // 14:30
    expect(formatCode(d, 'yyyy-mm-dd')).toBe('2026-10-16');
    expect(formatCode(d, 'd mmm yyyy')).toBe('16 Oct 2026');
    expect(formatCode(d, 'dddd, mmmm d')).toBe('Friday, October 16');
    expect(formatCode(d, 'hh:mm')).toBe('14:30');
    expect(formatCode(d, 'h:mm AM/PM')).toBe('2:30 PM');
    expect(formatCode(d, 'dd/mm/yy hh:mm:ss')).toBe('16/10/26 14:30:00');
  });
  it('rounds half away from zero', () => {
    expect([roundTo(1.005, 2), roundTo(2.5, 0), roundTo(-2.5, 0), roundTo(1e-7, 2)]).toEqual([1.01, 3, -3, 0]);
  });
  it('shows a cell in its style’s format', () => {
    expect(display(1234.5, { fmt: 'currency', cur: '€' })).toBe('€1,234.50');
    expect(display(-3, { fmt: 'currency' })).toBe('-$3.00');
    expect(display(0.25, { fmt: 'percent', dp: 1 })).toBe('25.0%');
    expect(display(serial(2026, 1, 2), { fmt: 'date' })).toBe('2 Jan 2026');
    expect(display(1 / 3)).toBe('0.3333333333');
    expect(display(true)).toBe('TRUE');
    expect(display({ e: '#N/A' })).toBe('#N/A');
    expect(codeOf({ fmt: 'number', dp: 0 })).toBe('#,##0');
  });
  it('keeps only safe style values', () => {
    expect(cleanStyle({ b: true, color: '#FF0000', bg: 'red', align: 'middle', size: 300, font: 'Comic Sans', bd: { t: 1, x: 1 }, onclick: 'x' })).toEqual({ b: true, color: '#ff0000', bd: { t: 1 } });
    expect(cleanStyle({})).toBeUndefined();
  });
});

describe('typed values', () => {
  it('reads what people type', () => {
    expect(readInput('12%')).toEqual({ v: 0.12, fmt: 'percent' });
    expect(readInput('£1,250')).toEqual({ v: 1250, fmt: 'currency', cur: '£' });
    expect(readInput('16/10/2026')).toEqual({ v: serial(2026, 10, 16), fmt: 'date' });
    expect(readInput('9:15')).toEqual({ v: 0.3854166666666667, fmt: 'time' });
    expect(readInput('false')).toEqual({ v: false });
    expect(readInput("'=not a formula")).toEqual({ v: '=not a formula' });
    expect(readInput('12 apples')).toEqual({ v: '12 apples' });
  });
  it('reads dates in common forms', () => {
    const d = serial(2026, 10, 16);
    for (const s of ['2026-10-16', '16/10/2026', '16.10.2026', '16 Oct 2026', 'October 16, 2026', '10/16/2026']) expect(dateFrom(s), s).toBe(d);
    expect(dateFrom('31/02/2026')).toBeNull();
    expect(timeFrom('12:00 am')).toBe(0);
  });
  it('shows numbers like General', () => {
    expect([numText(0.1 + 0.2), numText(1e20), numText(123456789012), numText(-0.5), numText(1234567.891234)]).toEqual(['0.3', '1E+20', '123456789012', '-0.5', '1234567.891']);
  });
});
