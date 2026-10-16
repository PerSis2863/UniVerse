import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addItems, addSlide, deleteItems, deleteSlides, duplicateSlide, loadDeck, moveSlide, restack, setDeck, setSlide, slideIds, slideOf, toDeck, updateItems, LOCAL } from './model';
import { emptyDeck, newSlide, textParas } from './deck';

describe('the live deck', () => {
  it('loads, gives back, adds, copies, moves and deletes slides', () => {
    const doc = new Y.Doc();
    loadDeck(doc, emptyDeck());
    const [first] = slideIds(doc);
    const b = addSlide(doc, first, newSlide('content', '16:9', { title: 'B' }));
    const c = duplicateSlide(doc, b)!;
    expect(slideIds(doc)).toEqual([first, b, c]);
    expect(slideOf(doc, c)!.items.map((i) => i.id)).not.toEqual(slideOf(doc, b)!.items.map((i) => i.id));
    moveSlide(doc, c, 0);
    expect(slideIds(doc)[0]).toBe(c);
    deleteSlides(doc, [c, b, first]);
    expect(slideIds(doc)).toHaveLength(1);
    setSlide(doc, slideIds(doc)[0], { notes: 'Speak slowly', transition: 'fade' });
    expect(toDeck(doc).slides[0]).toMatchObject({ notes: 'Speak slowly', transition: 'fade' });
  });
  it('adds, changes, restacks and deletes items, and stretches them for a new ratio', () => {
    const doc = new Y.Doc();
    loadDeck(doc, { theme: 'ocean', ratio: '4:3', slides: [newSlide('blank', '4:3')] });
    const s = slideIds(doc)[0];
    addItems(doc, s, [{ id: 'a', kind: 'shape', shape: 'ellipse', x: 100, y: 100, w: 300, h: 200 }, { id: 'b', kind: 'text', x: 0, y: 0, w: 600, h: 100, paras: textParas('Hi') }]);
    updateItems(doc, s, ['a'], { fill: '#ff0000', rot: undefined });
    updateItems(doc, s, ['b'], (it) => ({ ...it, x: it.x + 50 }));
    restack(doc, s, ['b'], 'back');
    expect(slideOf(doc, s)!.items.map((i) => [i.id, i.x, i.fill])).toEqual([['b', 50, undefined], ['a', 100, '#ff0000']]);
    setDeck(doc, { ratio: '16:9' });
    expect(slideOf(doc, s)!.items.find((i) => i.id === 'a')).toMatchObject({ x: 133, w: 400 });
    deleteItems(doc, s, ['a']);
    expect(slideOf(doc, s)!.items).toHaveLength(1);
  });
  it('undoes only my own changes', () => {
    const doc = new Y.Doc();
    loadDeck(doc, emptyDeck());
    const undo = new Y.UndoManager([doc.getArray('slideOrder'), doc.getMap('slides'), doc.getMap('deck')], { trackedOrigins: new Set([LOCAL]) });
    addSlide(doc, null);
    expect(slideIds(doc)).toHaveLength(2);
    undo.undo();
    expect(slideIds(doc)).toHaveLength(1);
  });
});
