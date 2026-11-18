import { describe, expect, it } from 'vitest';
import { closes, festivalLines, holidaysOn, holidaysUrl, monthsOf, yearsOf } from './travel-holidays';

const h = (date: string, name: string, types = ['Public'], global = true, counties: string[] | null = null) => ({ date, localName: name, name, countryCode: 'PT', types, global, counties });

describe('holidays and events on a trip (M246)', () => {
  it('keeps the holidays on the trip’s dates, once each', () => {
    const list = [h('2027-04-25', 'Freedom Day'), h('2027-04-02', 'Good Friday'), h('2027-04-25', 'Freedom Day'), h('2027-06-13', 'St Anthony', ['Public'], false, ['PT-11'])];
    expect(holidaysOn(list, '2027-04-20', '2027-04-28').map((x) => x.name)).toEqual(['Freedom Day']);
    expect(yearsOf('2027-12-28', '2028-01-03')).toEqual([2027, 2028]);
    expect(holidaysUrl(2027, 'pt')).toBe('https://date.nager.at/api/v3/PublicHolidays/2027/PT');
  });
  it('says what may close', () => {
    expect(closes(h('2027-04-25', 'x'))).toMatch(/^Banks, offices and many shops may close;/);
    expect(closes(h('2027-06-13', 'x', ['Public'], false, ['PT-11']))).toMatch(/close in some regions/);
    expect(closes(h('2027-06-13', 'x', ['Bank']))).toBe('Banks close.');
  });
  it('finds the guide’s festivals, those in the trip’s months first', () => {
    expect(monthsOf('2027-12-28', '2028-01-03')).toEqual([11, 0]);
    const text = ['The city is quiet in winter. In June the Festas de Santo António fill Alfama with grilled sardines and parades. A jazz festival takes place every July in the park gardens. Carnival is celebrated with costumes across the old town.'];
    expect(festivalLines(text, [5])).toEqual([
      { text: 'In June the Festas de Santo António fill Alfama with grilled sardines and parades.', inMonth: true },
      { text: 'Carnival is celebrated with costumes across the old town.', inMonth: false },
    ]);
  });
});
