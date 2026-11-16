import { describe, expect, it } from 'vitest';
import { commonsFileOf, commonsSrcSet, photoOk, plain, readGuide, templateParams } from './travel-guide';
import { bookingLinks, mapLink } from './travel-book';

// M202: Travel reads a Wikivoyage article into parts, places and districts; booking opens partners with
// the place and dates filled in.
const WIKI = `{{pagebanner|Sample banner.jpg|caption=x}}
{{geo|35.01|135.76|zoom=12}}
'''Sampleton''' ({{lang|ja|見本}}) is a [[Japan|Japanese]] city of [[temple]]s.<ref>a note</ref>

==Districts==
{{Regionlist
|region1name=[[Sampleton/Old Town|Old Town]]
|region1description=Lanes and '''tea houses'''.
}}

==Understand==
Sampleton was the capital for a long time, and the old streets show it everywhere you walk.

==See==
===Temples===
* {{see
| name=Golden Hall | alt=金堂 | url=https://example.org/hall | address=1 Temple Rd | lat=35.02 | long=135.77
| hours=09:00-17:00 | price=¥500
| content=A hall covered in [[gold leaf]], best in the morning light.
}}
==Eat==
* {{listing | name=Noodle Bar | price=¥800 | content=Thick noodles in a hot broth.}}
==Sleep==
===Budget===
* {{sleep | name=River Hostel | price=¥3000 | url=javascript:alert(1) }}
{{IsPartOf|Kansai}}
`;

describe('Travel guides', () => {
  it('splits a template at its top-level bars only', () => {
    const t = templateParams('see | name=[[A|B]] | content={{lang|ja|x}} y | 12');
    expect(t.name).toBe('see');
    expect(t.named.name).toBe('[[A|B]]');
    expect(t.named.content).toBe('{{lang|ja|x}} y');
    expect(t.pos).toEqual(['12']);
  });
  it('turns wiki text into plain words', () => {
    expect(plain(`'''Kyōto''' ({{lang|ja|京都}}) was [[Japan|Nippon]]'s capital.<ref>x</ref> [[File:A.jpg|thumb|a]]&mdash;ok`)).toBe('Kyōto (京都) was Nippon\'s capital. —ok');
  });
  it('reads the banner, position, parent, districts, parts and listings', () => {
    const g = readGuide('Sampleton', WIKI);
    expect(g.banner).toBe('Sample banner.jpg');
    expect([g.lat, g.lon]).toEqual([35.01, 135.76]);
    expect(g.parent).toBe('Kansai');
    expect(g.summary[0]).toBe('Sampleton (見本) is a Japanese city of temples.');
    expect(g.places).toEqual([{ title: 'Sampleton/Old Town', name: 'Old Town', text: 'Lanes and tea houses.' }]);
    const see = g.sections.find((s) => s.part === 'see')!;
    expect(see.listings[0]).toMatchObject({ kind: 'see', name: 'Golden Hall', alt: '金堂', url: 'https://example.org/hall', lat: 35.02, lon: 135.77, price: '¥500', group: 'Temples', text: 'A hall covered in gold leaf, best in the morning light.' });
    // An untyped listing takes its part's kind; a link that isn't a web address is dropped.
    expect(g.sections.find((s) => s.part === 'eat')!.listings[0].kind).toBe('eat');
    const sleep = g.sections.find((s) => s.part === 'sleep')!.listings[0];
    expect(sleep).toMatchObject({ kind: 'sleep', name: 'River Hostel', group: 'Budget' });
    expect(sleep.url).toBeUndefined();
  });
  it('fills partners’ searches with the place and the dates', () => {
    const [stay, flight, tour, train] = bookingLinks('Kyoto/Central', { checkin: '2027-04-01', checkout: '2027-04-05', from: 'Delhi' });
    expect(new URL(stay.url).searchParams.get('ss')).toBe('Kyoto Central');
    expect(new URL(stay.url).searchParams.get('checkin')).toBe('2027-04-01');
    expect(flight.url).toContain(encodeURIComponent('Flights to Kyoto Central from Delhi on 2027-04-01'));
    expect(new URL(tour.url).searchParams.get('q')).toBe('Kyoto Central');
    expect(train.url).toBe('https://www.rome2rio.com/s/Delhi/Kyoto%20Central');
    // Dates the wrong way round aren't sent.
    expect(new URL(bookingLinks('Rome', { checkin: '2027-05-09', checkout: '2027-05-01' })[0].url).searchParams.get('checkin')).toBeNull();
    expect(mapLink('Golden Hall', { lat: 35, lon: 135 })).toContain('mlat=35&mlon=135');
  });
});

describe('cover photos (M228)', () => {
  it('takes wide, sharp photos and refuses banners, maps, flags, collages and small or tall files', () => {
    expect(photoOk('Rome Skyline (8012016319).jpg', 4000, 2667)).toBe(true);
    expect(photoOk('Paris banner.jpg', 2100, 300)).toBe(false);
    expect(photoOk('Bali in Indonesia (special marker).svg', 3000, 1500, 'DRAWING')).toBe(false);
    expect(photoOk('Istanbul Montage 2016.jpg', 3000, 2000)).toBe(false);
    expect(photoOk('Lisbon_locator_map.png', 3000, 2000)).toBe(false);
    expect(photoOk('Kyoto tower.jpg', 1071, 723)).toBe(false);
    expect(photoOk('Tall tower.jpg', 2000, 3000)).toBe(false);
    expect(photoOk('Satellite image of Crete.jpg', 4000, 2500)).toBe(false);
  });
  it('finds the Commons file behind a thumbnail and lists its widths', () => {
    expect(commonsFileOf('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Bel%C3%A9m_Tower.jpg/320px-Bel%C3%A9m_Tower.jpg')).toBe('Belém Tower.jpg');
    expect(commonsFileOf('https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Local.jpg/320px-Local.jpg')).toBeNull();
    expect(commonsSrcSet('A b.jpg')).toContain('Special:FilePath/A_b.jpg?width=1920 1920w');
  });
});
