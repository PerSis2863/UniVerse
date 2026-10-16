import * as Y from 'yjs';
import { cleanDeck, cleanItem, newId, widthOf, type DeckJSON, type Item, type LayoutId, type Slide } from './deck';
import { newSlide } from './deck';

// A live presentation (Stage 5 · Office suite): the deck kept in a Yjs document so everyone editing
// sees each other's changes and offline edits merge. Layout:
//   deck: Y.Map                    theme, ratio
//   slideOrder: Y.Array<string>    the slides' ids in order
//   slides: Y.Map<Y.Map>           id → { layout, bg, notes, transition, hidden, items, z }
//     items: Y.Map<Item>           id → the item (a text box, shape or picture)
//     z: Y.Array<string>           the items' ids, back to front
// Every change is one transaction marked LOCAL (for undo). Tested in model.test.ts.

export const LOCAL = 'local-slides';
type YSlide = Y.Map<unknown>;

const deckMap = (doc: Y.Doc) => doc.getMap<unknown>('deck');
export const slideOrder = (doc: Y.Doc) => doc.getArray<string>('slideOrder');
export const slidesMap = (doc: Y.Doc) => doc.getMap<YSlide>('slides');
export const slideIds = (doc: Y.Doc) => slideOrder(doc).toArray().filter((id, i, a) => slidesMap(doc).has(id) && a.indexOf(id) === i);
const ys = (doc: Y.Doc, id: string) => slidesMap(doc).get(id);
const itemsOf = (doc: Y.Doc, id: string) => ys(doc, id)?.get('items') as Y.Map<Item> | undefined;
const zOf = (doc: Y.Doc, id: string) => ys(doc, id)?.get('z') as Y.Array<string> | undefined;
export const isEmptyDeck = (doc: Y.Doc) => slideIds(doc).length === 0;
export const ratioOf = (doc: Y.Doc): DeckJSON['ratio'] => (deckMap(doc).get('ratio') === '4:3' ? '4:3' : '16:9');
export const themeIdOf = (doc: Y.Doc) => (deckMap(doc).get('theme') as string | undefined) ?? 'classic';

function makeSlide(s: Slide): YSlide {
  const y = new Y.Map<unknown>();
  y.set('layout', s.layout);
  y.set('notes', s.notes);
  if (s.bg) y.set('bg', s.bg);
  if (s.transition) y.set('transition', s.transition);
  if (s.hidden) y.set('hidden', true);
  const items = new Y.Map<Item>(), z = new Y.Array<string>();
  for (const it of s.items) items.set(it.id, it);
  z.push(s.items.map((i) => i.id));
  y.set('items', items);
  y.set('z', z);
  return y;
}

/** One slide as plain data. */
export function slideOf(doc: Y.Doc, id: string): Slide | null {
  const y = ys(doc, id);
  if (!y) return null;
  const items = itemsOf(doc, id)!, order = zOf(doc, id)!.toArray().filter((x, i, a) => items.has(x) && a.indexOf(x) === i);
  // Items someone added without a place in the order go on top.
  for (const k of items.keys()) if (!order.includes(k)) order.push(k);
  const s: Slide = { id, layout: (y.get('layout') as LayoutId) ?? 'blank', notes: (y.get('notes') as string) ?? '', items: order.map((k) => items.get(k)!) };
  const bg = y.get('bg') as string | undefined, tr = y.get('transition') as Slide['transition'];
  if (bg) s.bg = bg;
  if (tr && tr !== 'none') s.transition = tr;
  if (y.get('hidden')) s.hidden = true;
  return s;
}

export const toDeck = (doc: Y.Doc): DeckJSON => ({ theme: themeIdOf(doc) as DeckJSON['theme'], ratio: ratioOf(doc), slides: slideIds(doc).map((id) => slideOf(doc, id)!) });

/** Replaces the whole deck (a template, an import, or going back to a version). */
export function loadDeck(doc: Y.Doc, raw: DeckJSON) {
  const d = cleanDeck(raw);
  doc.transact(() => {
    deckMap(doc).set('theme', d.theme);
    deckMap(doc).set('ratio', d.ratio);
    const order = slideOrder(doc), map = slidesMap(doc);
    order.delete(0, order.length);
    for (const k of [...map.keys()]) map.delete(k);
    for (const s of d.slides) { map.set(s.id, makeSlide(s)); order.push([s.id]); }
  }, LOCAL);
}

export function setDeck(doc: Y.Doc, patch: Partial<Pick<DeckJSON, 'theme' | 'ratio'>>) {
  doc.transact(() => {
    const before = ratioOf(doc);
    for (const [k, v] of Object.entries(patch)) deckMap(doc).set(k, v);
    // A new shape of slide: everything stretches across.
    if (patch.ratio && patch.ratio !== before) {
      const k = widthOf(patch.ratio) / widthOf(before);
      for (const id of slideIds(doc)) {
        const items = itemsOf(doc, id)!;
        for (const [iid, it] of [...items.entries()]) items.set(iid, { ...it, x: Math.round(it.x * k), w: Math.round(it.w * k) });
      }
    }
  }, LOCAL);
}

export function addSlide(doc: Y.Doc, after: string | null, s: Slide = newSlide('content', ratioOf(doc))): string {
  doc.transact(() => {
    slidesMap(doc).set(s.id, makeSlide(s));
    const order = slideOrder(doc), at = after ? order.toArray().indexOf(after) : -1;
    order.insert(at >= 0 ? at + 1 : order.length, [s.id]);
  }, LOCAL);
  return s.id;
}

export function duplicateSlide(doc: Y.Doc, id: string): string | null {
  const s = slideOf(doc, id);
  if (!s) return null;
  return addSlide(doc, id, { ...s, id: newId('s'), items: s.items.map((i) => ({ ...i, id: newId() })) });
}

export function deleteSlides(doc: Y.Doc, ids: string[]) {
  doc.transact(() => {
    const order = slideOrder(doc);
    if (slideIds(doc).length - ids.length < 1) ids = ids.slice(0, slideIds(doc).length - 1);
    for (const id of ids) {
      for (let i = order.length - 1; i >= 0; i--) if (order.get(i) === id) order.delete(i, 1);
      slidesMap(doc).delete(id);
    }
  }, LOCAL);
}

export function moveSlide(doc: Y.Doc, id: string, to: number) {
  doc.transact(() => {
    const order = slideOrder(doc), from = order.toArray().indexOf(id);
    if (from < 0) return;
    order.delete(from, 1);
    order.insert(Math.max(0, Math.min(order.length, to)), [id]);
  }, LOCAL);
}

export function setSlide(doc: Y.Doc, id: string, patch: Partial<Pick<Slide, 'bg' | 'notes' | 'transition' | 'hidden' | 'layout'>>) {
  doc.transact(() => {
    const y = ys(doc, id);
    if (!y) return;
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === false || v === 'none') y.delete(k); else y.set(k, v); }
  }, LOCAL);
}

export function addItems(doc: Y.Doc, slide: string, list: Item[]) {
  doc.transact(() => {
    const items = itemsOf(doc, slide), z = zOf(doc, slide);
    if (!items || !z) return;
    const W = widthOf(ratioOf(doc));
    for (const raw of list) { const it = cleanItem(raw, W); if (!it) continue; items.set(it.id, it); z.push([it.id]); }
  }, LOCAL);
}

/** Changes items (a function of each, or fields to set; undefined removes a field). */
export function updateItems(doc: Y.Doc, slide: string, ids: string[], f: Partial<Item> | ((it: Item) => Item)) {
  doc.transact(() => {
    const items = itemsOf(doc, slide);
    if (!items) return;
    for (const id of ids) {
      const it = items.get(id);
      if (!it) continue;
      const next = typeof f === 'function' ? f(it) : ({ ...it, ...f } as Item);
      for (const k of Object.keys(next) as (keyof Item)[]) if (next[k] === undefined) delete next[k];
      items.set(id, next);
    }
  }, LOCAL);
}

export function deleteItems(doc: Y.Doc, slide: string, ids: string[]) {
  doc.transact(() => {
    const items = itemsOf(doc, slide), z = zOf(doc, slide);
    if (!items || !z) return;
    for (const id of ids) { items.delete(id); for (let i = z.length - 1; i >= 0; i--) if (z.get(i) === id) z.delete(i, 1); }
  }, LOCAL);
}

/** Brings items forward or sends them back. */
export function restack(doc: Y.Doc, slide: string, ids: string[], how: 'front' | 'back' | 'forward' | 'backward') {
  doc.transact(() => {
    const z = zOf(doc, slide);
    if (!z) return;
    const order = z.toArray();
    let next = [...order];
    if (how === 'front') next = [...order.filter((x) => !ids.includes(x)), ...order.filter((x) => ids.includes(x))];
    else if (how === 'back') next = [...order.filter((x) => ids.includes(x)), ...order.filter((x) => !ids.includes(x))];
    else {
      const d = how === 'forward' ? 1 : -1;
      const idx = next.map((x, i) => (ids.includes(x) ? i : -1)).filter((i) => i >= 0);
      for (const i of d > 0 ? idx.reverse() : idx) { const j = i + d; if (j < 0 || j >= next.length || ids.includes(next[j])) continue; [next[i], next[j]] = [next[j], next[i]]; }
    }
    z.delete(0, z.length);
    z.push(next);
  }, LOCAL);
}
