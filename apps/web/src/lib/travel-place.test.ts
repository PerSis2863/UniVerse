import { describe, expect, it } from 'vitest';
import { fromWikidata, isPlaceKey, osmKey, photosFromCommons, placeFromNominatim, storiesFromWikipedia } from './travel-place';

// M209: real places from OpenStreetMap, Wikidata, Commons and Wikipedia, read into the map's cards.
describe('travel places', () => {
  it('turns a map tile’s id into an OpenStreetMap id', () => {
    expect(osmKey(3989223371)).toBe('N398922337');
    expect(osmKey(1234562)).toBe('W123456');
    expect(osmKey(15)).toBeNull();
    expect(isPlaceKey('N398922337')).toBe(true);
    expect(isPlaceKey('wp:Belém Tower')).toBe(true);
    expect(isPlaceKey('DROP TABLE')).toBe(false);
  });
  it('reads a Nominatim row into a card', () => {
    const p = placeFromNominatim({
      osm_type: 'node', osm_id: 398922337, lat: '38.6974795', lon: '-9.2033202', category: 'shop', type: 'pastry', name: 'Pastéis de Belém',
      address: { house_number: '84-92', road: 'Rua de Belém', suburb: 'São Francisco Xavier', city: 'Lisbon', country_code: 'pt' },
      extratags: { phone: '+351 21 363 7423', website: 'https://pasteisdebelem.pt', 'website:menu': 'https://pasteisdebelem.pt/menu', opening_hours: 'Mo-Su 08:00-21:00', wheelchair: 'yes', cuisine: 'regional', wikidata: 'Q3091352', start_date: '1837', 'payment:cash': 'yes' },
    });
    expect(p).toMatchObject({ key: 'N398922337', name: 'Pastéis de Belém', kind: 'Pastry shop', cc: 'PT', city: 'Lisbon', address: 'Rua de Belém 84-92, São Francisco Xavier, Lisbon', hours: 'Mo-Su 08:00-21:00', menu: 'https://pasteisdebelem.pt/menu', wikidata: 'Q3091352', cuisine: ['Regional'] });
    expect(p.facts).toEqual(['Wheelchair accessible', 'Since 1837']);
  });
  it('takes Wikidata’s line, photo and article', () => {
    expect(fromWikidata({ descriptions: { en: { value: 'confectionery store in Belém' } }, claims: { P18: [{ mainsnak: { datavalue: { value: 'Pasteis de Belem.JPG' } } }] }, sitelinks: { enwiki: { title: 'Pastéis de Belém' } } }))
      .toEqual({ about: 'confectionery store in Belém', image: 'Pasteis de Belem.JPG', wiki: 'Pastéis de Belém' });
  });
  it('keeps Commons photos with their credit, and only pictures', () => {
    const photos = photosFromCommons({ query: { pages: [
      { title: 'File:Torre de Belém.jpg', coordinates: [{ lat: 38.69, lon: -9.21 }], imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x.jpg', thumbwidth: 400, thumbheight: 267, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Torre_de_Bel%C3%A9m.jpg', extmetadata: { Artist: { value: '<a href="//x">Ana Silva</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
      { title: 'File:Map.pdf', coordinates: [{ lat: 38.69, lon: -9.21 }], imageinfo: [{ thumburl: 'https://upload.wikimedia.org/y.jpg' }] },
    ] } });
    expect(photos).toEqual([{ file: 'Torre de Belém.jpg', thumb: 'https://upload.wikimedia.org/x.jpg', w: 400, h: 267, lat: 38.69, lon: -9.21, title: 'Torre de Belém', author: 'Ana Silva', licence: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Torre_de_Bel%C3%A9m.jpg' }]);
  });
  it('keeps Wikipedia’s nearby articles that have a place and words', () => {
    const s = storiesFromWikipedia({ query: { pages: [{ title: 'Belém Tower', coordinates: [{ lat: 38.6916, lon: -9.216 }], extract: 'A 16th-century fortification.', thumbnail: { source: 'https://upload.wikimedia.org/t.jpg' } }, { title: 'No place', extract: 'x' }] } });
    expect(s).toEqual([{ title: 'Belém Tower', lat: 38.6916, lon: -9.216, extract: 'A 16th-century fortification.', thumb: 'https://upload.wikimedia.org/t.jpg', url: 'https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower' }]);
  });
});
