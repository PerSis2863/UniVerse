import { describe, expect, it } from 'vitest';
import { dppScore, gs1Link, gs1Target, gtin14, mergeSupply, parseDpp, parseSupplyAnswer, readDpp } from './dpp';

describe('GTINs and GS1 Digital Link', () => {
  it('checks the check digit and pads to 14 digits', () => {
    expect(gtin14('9520123456788')).toBe('09520123456788');
    expect(gtin14('09520123456788')).toBe('09520123456788');
    expect(gtin14('9520123456789')).toBeNull(); // wrong check digit
    expect(gtin14('96385074')).toBe('00000096385074'); // a GTIN-8
    expect(gtin14('12345')).toBeNull();
    expect(gtin14('952-0123-456788')).toBe('09520123456788');
  });

  it('sends a unit to its passport and a product to the product page', () => {
    expect(gs1Target('09520123456788/21/ABC123000A9XK2M7QP')).toEqual(['/t/ABC123000A9XK2M7QP', '']);
    expect(gs1Target('09520123456788/10/LOT7/21/X1')).toEqual(['/t/X1', '']);
    expect(gs1Target('9520123456788')).toEqual(['/dpp', 'g=09520123456788']);
    expect(gs1Target('09520123456788/10/H26-3')).toEqual(['/dpp', 'g=09520123456788&lot=H26-3']);
    expect(gs1Target('09520123456789/21/X')).toBeNull(); // bad GTIN
    expect(gs1Target('09520123456788/99/X')).toBeNull(); // not a key we answer
    expect(gs1Target('09520123456788/21')).toBeNull();
    expect(gs1Link('https://universeimpact.com', '09520123456788', 'ABC')).toBe('https://universeimpact.com/01/09520123456788/21/ABC');
  });
});

describe('the passport', () => {
  it('keeps only clean, bounded values', () => {
    const d = parseDpp({
      madeIn: '  Portugal ', manufacturer: { name: 'Acme', website: 'javascript:alert(1)' },
      materials: [{ name: 'Cotton', percent: '60', recycled: 140, origin: 'IN' }, { name: '' }, 'junk'],
      substances: [{ name: 'Lead', cas: '7439-92-1', percent: 0.01 }, { name: 'X', cas: 'not-a-cas' }],
      carbonKg: -3, repairScore: 11, documents: [{ title: 'DoC', url: 'http://plain.example' }, { title: 'Cert', url: 'https://x.example/c.pdf' }],
      certifications: ['GOTS', 5],
    });
    expect(d.madeIn).toBe('Portugal');
    expect(d.manufacturer.website).toBeNull();
    expect(d.materials).toEqual([{ name: 'Cotton', percent: 60, recycled: null, origin: 'IN', supplier: null }]);
    expect(d.substances).toEqual([{ name: 'Lead', cas: '7439-92-1', percent: 0.01 }, { name: 'X', cas: null, percent: null }]);
    expect(d.carbonKg).toBeNull();
    expect(d.repairScore).toBeNull();
    expect(d.documents).toEqual([{ title: 'Cert', url: 'https://x.example/c.pdf' }]);
    expect(d.certifications).toEqual(['GOTS']);
    expect(readDpp('not json')).toEqual(readDpp(null));
  });

  it('counts what is filled in', () => {
    const empty = dppScore(readDpp(null), null);
    expect(empty.done).toBe(0);
    const d = parseDpp({ madeIn: 'Spain', manufacturer: { name: 'Aurora' }, materials: [{ name: 'Olives', origin: 'Spain' }], carbonKg: 1.4, certifications: ['No substances of concern (REACH)'] });
    const s = dppScore(d, '09520123456788');
    expect(s.done).toBe(5);
    expect(s.missing).toContain('Care and use');
  });

  it('adds a supplier answer, replacing their material and keeping documents once', () => {
    const d = parseDpp({ materials: [{ name: 'Glass bottle', origin: null }], documents: [{ title: 'A', url: 'https://a.example' }] });
    const a = parseSupplyAnswer({ material: { name: 'glass bottle', recycled: 62, origin: 'Seville, Spain' }, certifications: ['ISO 14001'], documents: [{ title: 'A', url: 'https://a.example' }, { title: 'B', url: 'https://b.example' }] })!;
    const m = mergeSupply(d, a);
    expect(m.materials).toEqual([{ name: 'glass bottle', percent: null, recycled: 62, origin: 'Seville, Spain', supplier: null }]);
    expect(m.documents.map((x) => x.title)).toEqual(['A', 'B']);
    expect(m.certifications).toEqual(['ISO 14001']);
    expect(parseSupplyAnswer({ material: { name: '' } })).toBeNull();
  });
});
