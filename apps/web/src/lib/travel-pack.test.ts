import { describe, expect, it } from 'vitest';
import { packingFor } from './travel-pack';

// M215: the packing list follows the trip: its length, weather, what the places are for, plugs and money.
const plugs = { GB: 'G', JP: 'AB', TH: 'ABCFO', CH: 'CJ', DE: 'CF', PT: 'CF' };
const items = (l: { item: string }[]) => l.map((x) => x.item);

describe('packing list', () => {
  it('a hot, rainy August in Bangkok from Britain: sun, rain, mosquitoes, an adapter and baht', () => {
    const l = packingFor({ stops: [{ guide: 'Bangkok', cc: 'TH', days: 4 }], start: '2027-08-10', home: 'GB', plugs });
    const all = items(l);
    expect(all).toEqual(expect.arrayContaining(['Sunscreen', 'Insect repellent', 'Rain jacket or a small umbrella', 'Some cash in THB', 'Passport (valid six months past the trip)', 'Clothes that cover shoulders and knees']));
    expect(all.find((x) => x.startsWith('A plug adapter'))).toBe('A plug adapter for Type A, B, C, F and O');
    expect(all).toContain('4 sets of underwear and socks');
  });
  it('a winter week in Zermatt from Germany: warm things, hiking, no adapter (Type C fits), francs', () => {
    const all = items(packingFor({ stops: [{ guide: 'Zermatt', cc: 'CH', days: 9 }], start: '2027-01-05', home: 'DE', plugs }));
    expect(all).toEqual(expect.arrayContaining(['A warm jacket and a jumper', 'Hat, gloves and a scarf', 'Hiking shoes', 'Some cash in CHF', '7 sets of underwear and socks']));
    expect(all.some((x) => x.startsWith('A plug adapter'))).toBe(false);
  });
  it('at home with no weather known: an ID, a light jacket, no cash list', () => {
    const all = items(packingFor({ stops: [{ guide: 'Somewhere small', cc: 'PT', days: 2 }], start: null, home: 'PT', plugs }));
    expect(all).toEqual(expect.arrayContaining(['ID card or passport', 'A light jacket for the evenings']));
    expect(all.some((x) => x.startsWith('Some cash'))).toBe(false);
  });
});
