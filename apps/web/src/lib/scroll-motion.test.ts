import { describe, expect, it } from 'vitest';
import { formatFigure, parseFigure } from './scroll-motion';

describe('count-up figures keep the page’s own format', () => {
  it('reads numbers as the page wrote them', () => {
    expect(parseFigure('1,412')).toMatchObject({ value: 1412, group: ',', decimals: 0 });
    expect(parseFigure('96.6%')).toMatchObject({ value: 96.6, decimals: 1, suffix: '%' });
    expect(parseFigure('₹2,300')).toMatchObject({ prefix: '₹', value: 2300 });
    expect(parseFigure('+15')).toMatchObject({ prefix: '+', value: 15 });
    expect(parseFigure('62,000')).toMatchObject({ value: 62000 });
  });

  it('leaves alone what isn’t one quantity', () => {
    for (const t of ['2026', '0', '1', '12:30', '3 / 10', '2026-10-21', 'Oct 15', '9876543210', '—', 'v2.1.3']) expect(parseFigure(t)).toBeNull();
  });

  it('writes in-between values in the same format, ending on the exact original', () => {
    const f = parseFigure('1,412')!;
    expect(formatFigure(f, 706.4)).toBe('706');
    expect(formatFigure(f, 1412)).toBe('1,412');
    const p = parseFigure('96.6%')!;
    expect(formatFigure(p, 48.33)).toBe('48.3%');
    const r = parseFigure('₹12,345')!;
    expect(formatFigure(r, 12345)).toBe('₹12,345');
  });
});
