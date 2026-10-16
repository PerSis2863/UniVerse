import { describe, expect, it } from 'vitest';
import { cleanDeck, deckText, emptyDeck, LAYOUTS, layoutItems, newSlide, plainText, textParas } from './deck';

describe('decks', () => {
  it('makes each layout with its placeholders and starting text', () => {
    for (const l of LAYOUTS) expect(Array.isArray(layoutItems(l.id, '16:9'))).toBe(true);
    const title = layoutItems('title', '16:9', { title: 'Volcanoes', subtitle: 'Year 8 science' });
    expect(title.map((i) => [i.role, plainText(i.paras), i.align])).toEqual([['title', 'Volcanoes', 'center'], ['subtitle', 'Year 8 science', 'center']]);
    const content = layoutItems('content', '4:3', { title: 'Why', body: 'Heat\nPressure' });
    expect(content[1].paras?.map((p) => p.bullet)).toEqual(['dot', 'dot']);
    expect(content[1].x + content[1].w).toBeLessThanOrEqual(1200);
    expect(newSlide('picture', '16:9').items.some((i) => i.kind === 'image')).toBe(true);
  });
  it('keeps only safe, known parts of a deck from outside', () => {
    const d = cleanDeck({
      theme: 'nope', ratio: '4:3',
      slides: [{ id: 'a', layout: 'content', notes: 'Say hello', transition: 'fade', bg: '#FFFFFF', items: [
        { id: 'x', kind: 'text', x: 10, y: 20, w: 300, h: 100, size: 9999, paras: [{ runs: [{ t: 'Hi', b: true, color: 'red', link: 'javascript:alert(1)' }, { t: 'there', link: 'https://example.org' }], bullet: 'dot', align: 'middle' }], onclick: 'x' },
        { id: 'y', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: 'javascript:alert(1)' },
        { id: 'z', kind: 'image', x: 0, y: 0, w: 10, h: 10, src: '/api/files/abc.png', alt: 'A volcano' },
        { kind: 'script' },
      ] }, { id: 'a' }],
    });
    expect(d.theme).toBe('classic');
    expect(d.ratio).toBe('4:3');
    const [s, s2] = d.slides;
    expect(s2.id).not.toBe('a');
    expect(s.transition).toBe('fade');
    expect(s.items).toHaveLength(3);
    expect(s.items[0]).toEqual({ id: 'x', kind: 'text', x: 10, y: 20, w: 300, h: 100, size: 300, paras: [{ runs: [{ t: 'Hi', b: true }, { t: 'there', link: 'https://example.org' }], bullet: 'dot' }] });
    expect(s.items[1].src).toBeUndefined();
    expect(s.items[2]).toMatchObject({ src: '/api/files/abc.png', alt: 'A volcano', fit: 'cover' });
  });
  it('always has a slide, and gives its words', () => {
    expect(cleanDeck({}).slides).toHaveLength(1);
    expect(emptyDeck().slides[0].layout).toBe('title');
    const d = cleanDeck({ slides: [{ items: [{ kind: 'text', paras: textParas('One\nTwo') }] }, { items: [{ kind: 'shape', paras: textParas('Three') }] }] });
    expect(deckText(d)).toBe('One\nTwo\n\nThree');
  });
});
