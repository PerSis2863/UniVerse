import { describe, expect, it } from 'vitest';
import { guessCategory, guessPeriod, num, parseCsv } from './carbon-import';

// M270: a company's spreadsheet becomes ledger lines a person can check.
describe('spreadsheet import', () => {
  it('reads quoted cells, commas inside them and Windows line ends', () => {
    expect(parseCsv('month,description,amount\r\n2026-01,"Diesel, vans",120\r\n\r\n2026-02,Electricity,"1,500"')).toEqual([
      ['month', 'description', 'amount'], ['2026-01', 'Diesel, vans', '120'], ['2026-02', 'Electricity', '1,500'],
    ]);
  });
  it('sorts descriptions into categories', () => {
    expect(guessCategory('Electricity bill March')).toBe('electricity');
    expect(guessCategory('Green tariff electricity')).toBe('electricity-green');
    expect(guessCategory('IndiGo flight DEL-BOM')).toBe('flight-short');
    expect(guessCategory('diesel')).toBe('diesel');
    expect(guessCategory('Hotel, Pune')).toBe('hotel');
    expect(guessCategory('Something else')).toBeNull();
  });
  it('reads months in the usual ways', () => {
    expect(guessPeriod('2026-03-31', 2026)).toBe('2026-03');
    expect(guessPeriod('31/03/2026', 2026)).toBe('2026-03');
    expect(guessPeriod('03/2026', 2026)).toBe('2026-03');
    expect(guessPeriod('Mar 2026', 2026)).toBe('2026-03');
    expect(guessPeriod('', 2026)).toBe('2026-12');
    expect(guessPeriod('soon', 2026)).toBeNull();
  });
  it('reads numbers with separators and units', () => {
    expect(num('1,234.5 kWh')).toBe(1234.5);
    expect(num('')).toBeNull();
  });
});
