import { describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { readPptx, writePptx } from './pptx';
import { cleanDeck, plainText, textParas, type DeckJSON } from './deck';
import { deckHtml, deckReadable, parasHtml } from './render';
import { DECK_TEMPLATES } from './templates';
import { parseXml } from '../xml-lite';

const deck: DeckJSON = cleanDeck({ theme: 'midnight', ratio: '16:9', slides: [
  { id: 's1', layout: 'title', notes: 'Welcome everyone\nThen start', transition: 'fade', items: [
    { id: 't', kind: 'text', role: 'title', x: 90, y: 290, w: 1420, h: 180, size: 84, align: 'center', paras: [{ runs: [{ t: 'Volcanoes & ', b: true }, { t: '<lava>', i: true, color: '#ff0000' }] }] },
    { id: 'b', kind: 'text', role: 'body', x: 90, y: 500, w: 700, h: 300, size: 36, paras: [{ runs: [{ t: 'Heat' }], bullet: 'dot' }, { runs: [{ t: 'Pressure', u: true, link: 'https://example.org/p' }], bullet: 'num', align: 'right' }] },
    { id: 'c', kind: 'shape', shape: 'ellipse', x: 1000, y: 500, w: 300, h: 200, rot: 45, fill: '#22c55e', line: '#000000', lineW: 3, paras: textParas('Big') },
    { id: 'i', kind: 'image', x: 100, y: 100, w: 200, h: 100, src: '/api/files/pic.png', alt: 'A crater' },
  ] },
  { id: 's2', layout: 'blank', notes: '', bg: '#ffeedd', hidden: true, items: [{ id: 'l', kind: 'shape', shape: 'line', x: 0, y: 0, w: 400, h: 10, line: '#111111' }] },
] });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe('writePptx', () => {
  const parts = writePptx(deck, new Map([['/api/files/pic.png', { bytes: PNG, ext: 'png' as const }]]), 'Volcanoes');
  it('writes well-formed parts for every slide, its notes and its picture', () => {
    for (const [p, b] of Object.entries(parts)) if (p.endsWith('.xml') || p.endsWith('.rels')) expect(() => parseXml(new TextDecoder().decode(b)), p).not.toThrow();
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/notesSlides/notesSlide1.xml', 'ppt/media/image1.png', 'ppt/theme/theme1.xml', '[Content_Types].xml']));
    const s1 = new TextDecoder().decode(parts['ppt/slides/slide1.xml']);
    expect(s1).toContain('<a:t>&lt;lava&gt;</a:t>');
    expect(s1).toContain('sz="5040"');
    expect(s1).toContain('<p:fade/>');
    expect(new TextDecoder().decode(parts['ppt/slides/slide2.xml'])).toContain('show="0"');
  });
  it('reads back what it wrote', () => {
    const { deck: back, skipped } = readPptx(unzipSync(zipSync(parts)));
    expect(skipped).toEqual([]);
    expect(back.ratio).toBe('16:9');
    const [a, b] = back.slides;
    expect(a.notes).toBe('Welcome everyone\nThen start');
    expect(a.transition).toBe('fade');
    expect(b).toMatchObject({ bg: '#ffeedd', hidden: true });
    const [title, body, shape, pic] = a.items;
    expect(title).toMatchObject({ kind: 'text', x: 90, y: 290, w: 1420, h: 180, size: 84 });
    expect(title.paras?.[0].runs).toEqual([{ t: 'Volcanoes & ', b: true, color: '#efeeeb' }, { t: '<lava>', i: true, color: '#ff0000' }]);
    expect(body.paras?.map((p) => [plainText([p]), p.bullet, p.align])).toEqual([['Heat', 'dot', undefined], ['Pressure', 'num', 'right']]);
    expect(body.paras?.[1].runs[0]).toMatchObject({ u: true, link: 'https://example.org/p' });
    expect(shape).toMatchObject({ kind: 'shape', shape: 'ellipse', rot: 45, fill: '#22c55e', line: '#000000' });
    expect(pic).toMatchObject({ kind: 'image', src: 'media:ppt/media/image1.png', alt: 'A crater' });
    expect(b.items[0]).toMatchObject({ kind: 'shape', shape: 'line' });
  });
  it('says what it couldn’t read', () => {
    expect(() => readPptx({})).toThrow(/isn’t a PowerPoint/);
  });
});

describe('deck HTML', () => {
  it('escapes everything and draws lists', () => {
    expect(parasHtml([{ runs: [{ t: '<b>x</b>', b: true }] }, { runs: [{ t: 'a' }], bullet: 'dot' }, { runs: [{ t: 'b' }], bullet: 'dot' }, { runs: [] }])).toBe('<div><span style="font-weight:700">&lt;b&gt;x&lt;/b&gt;</span></div><ul><li>a</li><li>b</li></ul><div><br></div>');
    const html = deckHtml(deck, { notes: true });
    expect(html).not.toContain('<lava>');
    expect(html.match(/class="slide"/g)).toHaveLength(2);
    expect(deckReadable(deck)).toContain('<h2>1. Volcanoes &amp; &lt;lava&gt;</h2>');
  });
  it('makes every template into a deck that survives cleaning', () => {
    for (const t of DECK_TEMPLATES) { const d = t.deck(); expect(cleanDeck(d).slides.length, t.id).toBe(d.slides.length); }
  });
});
