'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Copy, EyeOff, Plus, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { colorFor, useLiveDoc, type DocStatus } from '@/lib/use-live-doc';
import { H, LAYOUTS, deckText, emptyDeck, newId, newSlide, plainText, themeOf, widthOf, type DeckJSON, type Item, type Para, type Slide } from '@/lib/slides/deck';
import { LOCAL, addItems, addSlide, deleteItems, deleteSlides, duplicateSlide, isEmptyDeck, loadDeck, moveSlide, restack, setDeck, setSlide, slideIds, slideOf, slideOrder, slidesMap, toDeck, updateItems } from '@/lib/slides/model';
import { deckReadable, parasHtml } from '@/lib/slides/render';
import { uploadChatFile } from '@/components/chat/chat-client';
import { MenuList } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { SlideView } from './SlideView';
import { SlidesToolbar, type SlideActions } from './SlidesToolbar';
import { domToParas, format } from './rich-text';

// A presentation (Office suite): PowerPoint's way of working, written together live
// (src/lib/use-live-doc.ts; works offline too). Slides from layouts, text boxes, shapes and
// pictures to move, resize and turn, themes, backgrounds, transitions, items that appear on a
// click, speaker notes, and presenting. A version is saved now and then for the history.

export interface SlidesApi { deck: () => DeckJSON; load: (d: DeckJSON) => void; addSlides: (d: DeckJSON) => void; current: () => number; pickRef: () => string; goTo: (ref: string) => boolean }
/** A copy without one field. */
function omit<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> { const c = { ...o }; delete c[k]; return c; }
type Drag = { kind: 'move' | 'resize' | 'rotate'; handle?: string; x0: number; y0: number; start: Map<string, Item>; moved: boolean };
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export function SlidesEditor({ docId, me, canEdit: mayEdit, onStatus, onPresence, onApi, start, onPresent, commentQuotes }: {
  docId: string; me: { id: string; name: string }; canEdit: boolean;
  onStatus: (s: DocStatus, canEdit: boolean) => void;
  onPresence?: (people: { name: string; color: string }[]) => void;
  onApi: (api: SlidesApi | null) => void;
  start: () => DeckJSON | null;
  onPresent: (deck: DeckJSON, from: number) => void;
  commentQuotes: string[];
}) {
  const [ydoc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => new Awareness(ydoc));
  const [status, setStatus] = useState<{ s: DocStatus; canEdit: boolean }>({ s: 'connecting', canEdit: false });
  useLiveDoc({ docId, ydoc, awareness, mayEdit, onStatus: (s, c) => { setStatus({ s, canEdit: c }); onStatus(s, c); }, onPresence, tooBig: 'This presentation is too big to save more. Use smaller pictures or fewer slides.' });
  const editable = (status.s === 'live' || status.s === 'offline') && status.canEdit;

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setVersion((x) => x + 1); }); };
    ydoc.on('update', on);
    return () => { ydoc.off('update', on); cancelAnimationFrame(raf); };
  }, [ydoc]);
  const deck = useMemo(() => { void version; return toDeck(ydoc); }, [ydoc, version]);
  const theme = themeOf(deck.theme), W = widthOf(deck.ratio);
  const [current, setCurrent] = useState<string | null>(null);
  const slideIndex = Math.max(0, deck.slides.findIndex((s) => s.id === current));
  const slide: Slide | undefined = deck.slides[slideIndex];
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [override, setOverride] = useState<Map<string, Partial<Item>> | null>(null);
  const drag = useRef<Drag | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const editBox = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fit, setFit] = useState(0.5);
  const selected = slide ? slide.items.filter((i) => sel.includes(i.id)) : [];

  // Undo and redo: only my own changes.
  const [undo] = useState(() => new Y.UndoManager([slideOrder(ydoc), slidesMap(ydoc), ydoc.getMap('deck')], { trackedOrigins: new Set([LOCAL]), captureTimeout: 500 }));
  const [stacks, setStacks] = useState({ undo: 0, redo: 0 });
  useEffect(() => {
    const on = () => setStacks({ undo: undo.undoStack.length, redo: undo.redoStack.length });
    undo.on('stack-item-added', on); undo.on('stack-item-popped', on);
    return () => { undo.off('stack-item-added', on); undo.off('stack-item-popped', on); undo.destroy(); };
  }, [undo]);

  // A new presentation: once live and still empty, its template (or a title slide) goes in.
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (status.s !== 'live' || !status.canEdit || !isEmptyDeck(ydoc)) return;
    loadDeck(ydoc, startRef.current() ?? emptyDeck());
    undo.clear();
  }, [status, ydoc, undo]);

  // The slide fits the space it has.
  useEffect(() => {
    const el = canvasBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.max(0.1, Math.min((el.clientWidth - 24) / W, (el.clientHeight - 24) / H))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  // Who's on which slide.
  useEffect(() => { awareness.setLocalStateField('user', { name: me.name, color: colorFor(me.id) }); }, [awareness, me]);
  useEffect(() => { awareness.setLocalStateField('slide', slide?.id ?? null); }, [awareness, slide?.id]);
  const [where, setWhere] = useState<Map<string, { name: string; color: string }[]>>(new Map());
  useEffect(() => {
    const on = () => {
      const m = new Map<string, { name: string; color: string }[]>();
      for (const [id, st] of awareness.getStates()) {
        if (id === ydoc.clientID) continue;
        const s = st as { user?: { name?: string; color?: string }; slide?: string };
        if (s.slide) m.set(s.slide, [...(m.get(s.slide) ?? []), { name: s.user?.name ?? 'Someone', color: s.user?.color ?? '#2a2927' }]);
      }
      setWhere(m);
    };
    awareness.on('change', on);
    return () => awareness.off('change', on);
  }, [awareness, ydoc]);

  // Versions for the history: a few seconds after my last change, and when I leave.
  useEffect(() => {
    if (!editable) return;
    let t: ReturnType<typeof setTimeout> | null = null, dirty = false;
    const save = () => {
      if (!dirty) return;
      dirty = false;
      const d = toDeck(ydoc);
      const data = JSON.stringify(d);
      if (data.length > 1_200_000) return;
      void authedJson(`/api/docs/${docId}/versions`, { method: 'POST', keepalive: data.length < 60_000, body: JSON.stringify({ html: deckReadable(d), text: deckText(d).replace(/\s+/g, ' ').slice(0, 300), data }) }).catch(() => {});
    };
    const on = (_: Uint8Array, origin: unknown) => { if (origin !== LOCAL && origin !== undo) return; dirty = true; if (t) clearTimeout(t); t = setTimeout(save, 8000); };
    ydoc.on('update', on);
    window.addEventListener('pagehide', save);
    return () => { ydoc.off('update', on); window.removeEventListener('pagehide', save); if (t) clearTimeout(t); save(); };
  }, [editable, ydoc, docId, undo]);

  // ── Text editing ───────────────────────────────────────────────────────────────────────
  const saveText = () => {
    if (!editing || !slide || !editBox.current) return;
    const it = slide.items.find((i) => i.id === editing);
    if (!it) return;
    const paras = domToParas(editBox.current, it.color);
    if (JSON.stringify(paras) !== JSON.stringify(it.paras ?? [])) updateItems(ydoc, slide.id, [editing], { paras });
  };
  const stopEditing = () => { saveText(); setEditing(null); };
  // The box starts from the item's text (escaped HTML) when a box starts being edited, then the
  // browser keeps it while typing (the slide is read through a ref, so later changes don't reset it).
  const slideRef = useRef(slide);
  useEffect(() => { slideRef.current = slide; });
  useLayoutEffect(() => {
    const el = editBox.current;
    if (!el || !editing) return;
    const it = slideRef.current?.items.find((i) => i.id === editing);
    el.innerHTML = parasHtml(it?.paras ?? [], it?.align) || '<div><br></div>';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const s = window.getSelection();
    s?.removeAllRanges(); s?.addRange(range);
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const t = setInterval(saveText, 1500);
    return () => clearInterval(t);
  });

  // ── Acting on items ────────────────────────────────────────────────────────────────────
  const update = (ids: string[], f: Partial<Item> | ((it: Item) => Item)) => { if (slide && editable) updateItems(ydoc, slide.id, ids, f); };
  const addItem = (it: Omit<Item, 'id'>) => {
    if (!slide || !editable) return;
    const full = { id: newId(), ...it } as Item;
    addItems(ydoc, slide.id, [full]);
    setSel([full.id]);
    return full.id;
  };
  const runsAll = (it: Item, f: (p: Para) => Para): Item => ({ ...it, paras: (it.paras ?? []).map(f) });
  const allHave = (k: 'b' | 'i' | 'u' | 's') => selected.length > 0 && selected.every((it) => (it.paras ?? []).every((p) => p.runs.every((r) => r[k])) && (it.paras ?? []).some((p) => p.runs.length));
  const onImage = async (f: File | undefined, into?: string) => {
    if (!f || !slide) return;
    if (!f.type.startsWith('image/')) { toast.error('Choose a picture.'); return; }
    const t = toast.loading('Adding the picture…');
    try {
      const src = await uploadChatFile(f);
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); img.src = src; });
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3;
      if (into) update([into], { src, alt: f.name.replace(/\.[^.]+$/, '') });
      else { const w = Math.min(W * 0.5, H * 0.6 * ratio), h = w / ratio; addItem({ kind: 'image', x: (W - w) / 2, y: (H - h) / 2, w, h, src, alt: f.name.replace(/\.[^.]+$/, ''), fit: 'contain' }); }
      toast.success('Picture added', { id: t });
    } catch (e) { toast.error((e as Error).message, { id: t }); }
  };
  const pictureFor = useRef<string | undefined>(undefined);

  const actions: SlideActions = {
    undo: () => undo.undo(), redo: () => undo.redo(),
    newSlide: (layout) => { if (!editable) return; const id = addSlide(ydoc, slide?.id ?? null, newSlide(layout, deck.ratio)); setCurrent(id); setSel([]); },
    text: () => { const id = addItem({ kind: 'text', x: W / 2 - 300, y: H / 2 - 60, w: 600, h: 120, size: 40, paras: [] }); if (id) setEditing(id); },
    shape: (shape) => addItem({ kind: 'shape', shape, x: W / 2 - 160, y: H / 2 - (shape === 'line' ? 10 : 110), w: 320, h: shape === 'line' ? 20 : 220, paras: [], ...(shape === 'line' ? { line: theme.text, lineW: 4 } : {}) }),
    picture: () => { pictureFor.current = undefined; fileRef.current?.click(); },
    theme: (id) => editable && setDeck(ydoc, { theme: id }),
    ratio: (r) => editable && setDeck(ydoc, { ratio: r }),
    background: (c) => slide && editable && setSlide(ydoc, slide.id, { bg: c ?? undefined }),
    backgroundAll: (c) => { if (!editable) return; ydoc.transact(() => { for (const id of slideIds(ydoc)) setSlide(ydoc, id, { bg: c ?? undefined }); }, LOCAL); },
    transition: (t) => slide && editable && setSlide(ydoc, slide.id, { transition: t }),
    transitionAll: (t) => { if (!editable) return; ydoc.transact(() => { for (const id of slideIds(ydoc)) setSlide(ydoc, id, { transition: t }); }, LOCAL); },
    present: (fromStart) => onPresent(toDeck(ydoc), fromStart ? 0 : slideIndex),
    // Text formatting: on the selected words while typing, else on the whole of each selected box.
    toggle: (k) => {
      if (editing) { format(k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : 'strikeThrough'); return; }
      const on = !allHave(k);
      update(sel, (it) => runsAll(it, (p) => ({ ...p, runs: p.runs.map((r) => { const n = { ...r }; if (on) n[k] = true; else delete n[k]; return n; }) })));
    },
    color: (c) => {
      if (editing) { if (c) document.execCommand('foreColor', false, c); return; }
      update(sel, (it) => ({ ...runsAll(it, (p) => ({ ...p, runs: p.runs.map((r) => omit(r, 'color')) })), color: c ?? undefined }));
    },
    align: (a) => { if (editing) { format(a === 'center' ? 'justifyCenter' : a === 'right' ? 'justifyRight' : 'justifyLeft'); return; } update(sel, (it) => ({ ...runsAll(it, (p) => omit(p, 'align')), align: a === 'left' ? undefined : a })); },
    bullets: (kind) => {
      if (editing) { format(kind === 'num' ? 'insertOrderedList' : 'insertUnorderedList'); return; }
      const on = !selected.every((it) => (it.paras ?? []).every((p) => p.bullet === kind));
      update(sel, (it) => runsAll(it, (p) => (on ? { ...p, bullet: kind } : omit(p, 'bullet'))));
    },
    valign: (v) => update(sel, { valign: v === 'top' ? undefined : v }),
    size: (n) => update(sel, { size: n }),
    grow: (d) => update(sel, (it) => ({ ...it, size: Math.max(8, Math.min(300, Math.round((it.size ?? 32) * (d > 0 ? 1.15 : 1 / 1.15)))) })),
    font: (f) => update(sel, { font: f }),
    fill: (c) => update(sel, { fill: c ?? undefined }),
    line: (c) => update(sel, (it) => ({ ...it, line: c ?? undefined, lineW: c ? it.lineW ?? 3 : undefined })),
    arrange: (how) => slide && editable && restack(ydoc, slide.id, sel, how),
    anim: (a) => update(sel, { anim: a ?? undefined }),
    remove: () => { if (slide && editable && sel.length) { deleteItems(ydoc, slide.id, sel); setSel([]); } },
    duplicate: () => { if (!slide || !editable || !selected.length) return; const copies = selected.map((it) => ({ ...it, id: newId(), x: it.x + 30, y: it.y + 30 })); addItems(ydoc, slide.id, copies); setSel(copies.map((c) => c.id)); },
    alt: (text) => update(sel, { alt: text }),
    fitImage: (f) => update(sel, { fit: f }),
  };

  // ── Pointer: select, move, resize, turn ───────────────────────────────────────────────────
  const toCanvas = (e: { clientX: number; clientY: number }) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / fit, y: (e.clientY - r.top) / fit }; };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!slide || e.button === 2) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-editbox]')) return;
    const handle = t.closest<HTMLElement>('[data-handle]')?.dataset.handle;
    const itemId = handle ? sel[0] : t.closest<HTMLElement>('[data-item]')?.dataset.item;
    if (editing && itemId !== editing) stopEditing();
    if (!itemId) { setSel([]); return; }
    const next = handle ? sel : e.shiftKey ? (sel.includes(itemId) ? sel.filter((x) => x !== itemId) : [...sel, itemId]) : sel.includes(itemId) ? sel : [itemId];
    setSel(next);
    if (!editable) return;
    const p = toCanvas(e);
    drag.current = { kind: handle === 'rot' ? 'rotate' : handle ? 'resize' : 'move', handle, x0: p.x, y0: p.y, start: new Map(slide.items.filter((i) => next.includes(i.id)).map((i) => [i.id, i])), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    let dx = p.x - d.x0, dy = p.y - d.y0;
    if (!d.moved && Math.hypot(dx, dy) * fit < 3) return;
    // Captured only once it's really a drag, so clicks and double-clicks still reach the item.
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
    d.moved = true;
    const out = new Map<string, Partial<Item>>();
    if (d.kind === 'move') {
      // Snap the group's middle or edges to the slide's middle and edges.
      const items = [...d.start.values()];
      const x1 = Math.min(...items.map((i) => i.x)) + dx, x2 = Math.max(...items.map((i) => i.x + i.w)) + dx, y1 = Math.min(...items.map((i) => i.y)) + dy, y2 = Math.max(...items.map((i) => i.y + i.h)) + dy;
      const snap = (v: number, targets: number[]) => { for (const t of targets) if (Math.abs(v - t) < 10) return t - v; return 0; };
      if (!e.altKey) {
        dx += snap((x1 + x2) / 2, [W / 2]) || snap(x1, [0, 90]) || snap(x2, [W, W - 90]);
        dy += snap((y1 + y2) / 2, [H / 2]) || snap(y1, [0, 60]) || snap(y2, [H, H - 60]);
      }
      for (const [id, it] of d.start) out.set(id, { x: Math.round(it.x + dx), y: Math.round(it.y + dy) });
    } else if (d.kind === 'resize') {
      const [id, it] = [...d.start.entries()][0];
      const h = d.handle ?? 'se';
      let { x, y, w, h: hh } = it;
      if (h.includes('e')) w = Math.max(20, it.w + dx);
      if (h.includes('s')) hh = Math.max(20, it.h + dy);
      if (h.includes('w')) { w = Math.max(20, it.w - dx); x = it.x + it.w - w; }
      if (h.includes('n')) { hh = Math.max(20, it.h - dy); y = it.y + it.h - hh; }
      // Pictures (and anything with Shift) keep their shape from the corners.
      if ((e.shiftKey || it.kind === 'image') && h.length === 2) { const k = Math.max(w / it.w, hh / it.h); w = it.w * k; hh = it.h * k; if (h.includes('w')) x = it.x + it.w - w; if (h.includes('n')) y = it.y + it.h - hh; }
      out.set(id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
    } else {
      const [id, it] = [...d.start.entries()][0];
      let a = (Math.atan2(p.y - (it.y + it.h / 2), p.x - (it.x + it.w / 2)) * 180) / Math.PI + 90;
      if (e.shiftKey || Math.abs(((a % 90) + 90) % 90) < 4 || Math.abs(((a % 90) + 90) % 90) > 86) a = Math.round(a / (e.shiftKey ? 15 : 90)) * (e.shiftKey ? 15 : 90);
      a = ((Math.round(a) % 360) + 360) % 360;
      out.set(id, { rot: a > 180 ? a - 360 : a });
    }
    setOverride(out);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && override && slide) {
      ydoc.transact(() => { for (const [id, patch] of override) updateItems(ydoc, slide.id, [id], { ...patch, ...(patch.rot === 0 ? { rot: undefined } : {}) }); }, LOCAL);
    }
    setOverride(null);
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    // The item under the pointer (by position: the click may be aimed at the canvas itself).
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.item && canvas.current?.contains(el)) as HTMLElement | undefined;
    const id = under?.dataset.item ?? (e.target as HTMLElement).closest<HTMLElement>('[data-item]')?.dataset.item;
    const it = slide?.items.find((i) => i.id === id);
    if (!it || !editable) return;
    if (it.kind === 'image') { pictureFor.current = it.id; fileRef.current?.click(); return; }
    setSel([it.id]);
    setEditing(it.id);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) { if (e.key === 'Escape') { e.preventDefault(); stopEditing(); canvas.current?.focus(); } return; }
    if (!slide) return;
    const mod = e.ctrlKey || e.metaKey;
    const run = (f: () => void) => { e.preventDefault(); f(); };
    if (mod && e.key.toLowerCase() === 'z') return run(() => (e.shiftKey ? undo.redo() : undo.undo()));
    if (mod && e.key.toLowerCase() === 'y') return run(() => undo.redo());
    if (mod && e.key.toLowerCase() === 'a') return run(() => setSel(slide.items.map((i) => i.id)));
    if (mod && e.key.toLowerCase() === 'd') return run(actions.duplicate);
    if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) return run(() => actions.toggle(e.key.toLowerCase() as 'b' | 'i' | 'u'));
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) return run(actions.remove);
    if (e.key === 'Escape') return run(() => setSel([]));
    if (e.key === 'Enter' && sel.length === 1 && selected[0]?.kind !== 'image') return run(() => setEditing(sel[0]));
    if (e.key === 'Tab' && slide.items.length && sel.length) {
      return run(() => { const i = slide.items.findIndex((x) => x.id === sel[0]); const n = slide.items[(i + (e.shiftKey ? -1 : 1) + slide.items.length) % slide.items.length]; setSel([n.id]); });
    }
    if (e.key === 'F5') return run(() => actions.present(!e.shiftKey));
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && sel.length && editable) { const k = e.shiftKey ? 20 : 2, [dx, dy] = arrows[e.key]; return run(() => update(sel, (it) => ({ ...it, x: it.x + dx * k, y: it.y + dy * k }))); }
    if ((e.key === 'PageDown' || (arrows[e.key] && !sel.length && (e.key === 'ArrowDown' || e.key === 'ArrowRight')))) return run(() => go(slideIndex + 1));
    if ((e.key === 'PageUp' || (arrows[e.key] && !sel.length && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')))) return run(() => go(slideIndex - 1));
  };
  const go = (i: number) => { const s = deck.slides[Math.max(0, Math.min(deck.slides.length - 1, i))]; if (s) { if (editing) stopEditing(); setCurrent(s.id); setSel([]); } };

  // ── The page's handle ──────────────────────────────────────────────────────────────────
  const impl = useRef<SlidesApi | null>(null);
  useEffect(() => {
    impl.current = {
      deck: () => toDeck(ydoc), load: (d) => loadDeck(ydoc, d),
      addSlides: (d) => {
        const cur = toDeck(ydoc);
        const blank = cur.slides.length === 1 && cur.slides[0].items.every((i) => !plainText(i.paras) && !i.src);
        if (blank) { loadDeck(ydoc, d); return; }
        let last = slideIds(ydoc).at(-1) ?? null;
        ydoc.transact(() => { for (const s of d.slides) last = addSlide(ydoc, last, { ...s, id: newId('s'), items: s.items.map((i) => ({ ...i, id: newId() })) }); }, LOCAL);
      },
      current: () => slideIndex,
      pickRef: () => `Slide ${slideIndex + 1}`,
      goTo: (ref) => { const m = /^Slide (\d+)/.exec(ref); if (!m) return false; const n = Number(m[1]) - 1; if (!deck.slides[n]) return false; go(n); return true; },
    };
  });
  const onApiRef = useRef(onApi);
  useEffect(() => { onApiRef.current = onApi; });
  useEffect(() => {
    onApiRef.current({ deck: () => impl.current!.deck(), load: (d) => impl.current!.load(d), addSlides: (d) => impl.current!.addSlides(d), current: () => impl.current!.current(), pickRef: () => impl.current!.pickRef(), goTo: (r) => impl.current!.goTo(r) });
    return () => onApiRef.current(null);
  }, []);

  const commentedSlides = useMemo(() => new Set(commentQuotes.map((q) => /^Slide (\d+)/.exec(q)?.[1]).filter(Boolean).map(Number)), [commentQuotes]);
  const thumbW = 168;
  const one = sel.length === 1 ? selected[0] : null;
  const notes = slide?.notes ?? '';

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="border-b border-zinc-200/70 dark:border-white/[0.06] bg-white/80 dark:bg-[#141416]/80">
        <SlidesToolbar on={actions} canEdit={editable} canUndo={stacks.undo > 0} canRedo={stacks.redo > 0} deck={deck} slide={slide ?? null} selected={selected} editing={!!editing}
          bold={allHave('b')} italic={allHave('i')} underline={allHave('u')} strike={allHave('s')} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Picture to add" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onImage(f, pictureFor.current); }} />
      <div className="flex-1 min-h-0 flex flex-col-reverse md:flex-row">
        <nav aria-label="Slides" className="shrink-0 md:w-52 border-t md:border-t-0 md:border-e border-zinc-200/70 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-[#141416] overflow-x-auto md:overflow-y-auto md:overflow-x-hidden">
          <ol className="flex md:flex-col gap-2 p-2">
            {deck.slides.map((s, i) => {
              const people = where.get(s.id) ?? [];
              return (
                <li key={s.id} className="shrink-0 flex gap-1.5 items-start" onContextMenu={(e) => { e.preventDefault(); setCurrent(s.id); setMenu({ id: s.id, x: e.clientX, y: e.clientY }); }}>
                  <span className="text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400 w-4 text-end pt-1">{i + 1}</span>
                  <button type="button" aria-current={s.id === slide?.id ? 'true' : undefined}
                    onClick={() => go(i)} onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); (e.currentTarget.closest('ol')?.children[i + 1]?.querySelector('button') as HTMLButtonElement | null)?.focus(); }
                      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); (e.currentTarget.closest('ol')?.children[i - 1]?.querySelector('button') as HTMLButtonElement | null)?.focus(); }
                      if ((e.key === 'Delete' || e.key === 'Backspace') && editable && deck.slides.length > 1) { e.preventDefault(); deleteSlides(ydoc, [s.id]); go(i - 1); }
                    }}
                    className={cn('relative rounded-lg overflow-hidden ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0b0b0c] transition-shadow', s.id === slide?.id ? 'ring-2 ring-indigo-600 dark:ring-indigo-400' : 'ring-1 ring-zinc-300 dark:ring-white/15 hover:ring-indigo-400', s.hidden && 'opacity-50')}>
                    {/* Named by its words, not by the picture of the slide (whose text isn't the name). */}
                    <span className="sr-only">{`Slide ${i + 1}${plainText(s.items.find((x) => x.role === 'title')?.paras) ? `: ${plainText(s.items.find((x) => x.role === 'title')?.paras)}` : ''}${s.hidden ? ' (hidden)' : ''}`}</span>
                    <div aria-hidden="true"><SlideView slide={s} theme={theme} W={W} scale={thumbW / W} mode="thumb" /></div>
                    {s.hidden && <EyeOff aria-hidden className="absolute top-1 end-1 w-4 h-4 text-zinc-700" />}
                    {commentedSlides.has(i + 1) && <span aria-hidden title="Has a comment" className="absolute top-0 end-0 w-0 h-0 border-t-[10px] border-s-[10px] border-t-amber-500 border-s-transparent" />}
                    {people.length > 0 && <span className="absolute bottom-1 start-1 flex -space-x-1">{people.slice(0, 3).map((p, k) => <span key={k} title={p.name} className="w-4 h-4 rounded-full border border-white text-[8px] font-bold text-white flex items-center justify-center" style={{ background: p.color }}>{p.name[0]}</span>)}</span>}
                  </button>
                </li>
              );
            })}
            {editable && <li className="shrink-0 md:ps-6"><button type="button" onClick={() => actions.newSlide('content')} className="w-[168px] h-[60px] md:h-auto md:py-3 rounded-lg border-2 border-dashed border-zinc-300 dark:border-white/15 text-sm text-zinc-700 dark:text-zinc-300 inline-flex items-center justify-center gap-1.5 hover:border-indigo-400"><Plus className="w-4 h-4" />New slide</button></li>}
          </ol>
        </nav>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div ref={canvasBox} className="flex-1 min-h-0 flex items-center justify-center bg-zinc-100 dark:bg-[#141416] p-3 overflow-hidden">
            {slide && (
              <div ref={canvas} tabIndex={0} role="region" aria-roledescription="slide" aria-label={`Slide ${slideIndex + 1} of ${deck.slides.length}. Click to select, drag to move, double-click to type.`}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick} onKeyDown={onKeyDown}
                className="relative shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 touch-none" style={{ width: W * fit, height: H * fit }}>
                <SlideView slide={slide} theme={theme} W={W} scale={fit} mode="edit" editingId={editing} override={override ?? undefined} />
                {/* Selection, handles and the text being typed, on the same scaled canvas. */}
                <div className="absolute start-0 top-0 origin-top-left pointer-events-none" style={{ width: W, height: H, transform: `scale(${fit})` }}>
                  {slide.items.map((raw) => {
                    const it = override?.has(raw.id) ? { ...raw, ...override.get(raw.id) } : raw;
                    const on = sel.includes(it.id);
                    const style: React.CSSProperties = { left: it.x, top: it.y, width: it.w, height: it.h, transform: it.rot ? `rotate(${it.rot}deg)` : undefined };
                    return (
                      <div key={it.id} data-item={it.id} className={cn('absolute pointer-events-auto', editable && 'cursor-move', !on && 'hover:outline hover:outline-1 hover:outline-indigo-400/70')} style={{ ...style, outline: on ? `${2 / fit}px solid #2a2927` : undefined }}>
                        {it.id === editing && (
                          <div ref={editBox} data-editbox contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Text box"
                            onBlur={stopEditing} onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
                            className={cn('absolute inset-0 overflow-hidden outline-none cursor-text [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-[1.2em] [&_ol]:ps-[1.2em] flex flex-col', it.kind === 'shape' ? 'p-3' : 'px-3 py-2', it.valign === 'middle' ? 'justify-center' : it.valign === 'bottom' ? 'justify-end' : '')}
                            style={{ fontFamily: `"${it.font ?? (it.role === 'title' ? theme.title : theme.body)}", system-ui, sans-serif`, fontSize: it.size ?? 32, color: it.color ?? (it.role === 'subtitle' ? theme.muted : theme.text), lineHeight: 1.2, textAlign: it.align }} />
                        )}
                        {on && sel.length === 1 && editable && it.id !== editing && <>
                          {HANDLES.map((h) => <span key={h} data-handle={h} className="absolute bg-white border-indigo-600 pointer-events-auto" style={{ width: 12 / fit, height: 12 / fit, borderWidth: 2 / fit, left: h.includes('w') ? -6 / fit : h.includes('e') ? it.w - 6 / fit : it.w / 2 - 6 / fit, top: h.includes('n') ? -6 / fit : h.includes('s') ? it.h - 6 / fit : it.h / 2 - 6 / fit, cursor: `${h}-resize` }} />)}
                          <span data-handle="rot" title="Turn" className="absolute bg-indigo-600 rounded-full pointer-events-auto cursor-grab" style={{ width: 14 / fit, height: 14 / fit, left: it.w / 2 - 7 / fit, top: -36 / fit }} />
                        </>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <label className="block border-t border-zinc-200/70 dark:border-white/[0.06] bg-white dark:bg-[#1b1b1e]">
            <span className="sr-only">Speaker notes</span>
            <textarea key={slide?.id} defaultValue={notes} readOnly={!editable} placeholder={editable ? 'Speaker notes: what to say on this slide (only you see them while presenting)' : 'No notes'}
              onBlur={(e) => { if (slide && e.target.value !== notes) setSlide(ydoc, slide.id, { notes: e.target.value.slice(0, 10_000) }); }}
              className="w-full h-20 md:h-24 resize-none bg-transparent px-4 py-2 text-sm text-zinc-800 dark:text-zinc-200 outline-none placeholder:text-zinc-500" />
          </label>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{one ? `${one.role ?? one.kind} selected${one.kind !== 'image' ? `: ${plainText(one.paras).slice(0, 80)}` : ''}` : sel.length ? `${sel.length} items selected` : ''}</p>
      {menu && (
        <SlideMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuList label="Slide actions" onDone={() => setMenu(null)} items={[
            { label: 'New slide after this', icon: <Plus className="w-4 h-4" />, onSelect: () => actions.newSlide('content'), disabled: !editable },
            { label: 'Duplicate slide', icon: <Copy className="w-4 h-4" />, onSelect: () => { const id = duplicateSlide(ydoc, menu.id); if (id) setCurrent(id); }, disabled: !editable },
            { label: 'Move up', icon: <ArrowUp className="w-4 h-4" />, onSelect: () => moveSlide(ydoc, menu.id, deck.slides.findIndex((s) => s.id === menu.id) - 1), disabled: !editable || deck.slides[0]?.id === menu.id },
            { label: 'Move down', icon: <ArrowDown className="w-4 h-4" />, onSelect: () => moveSlide(ydoc, menu.id, deck.slides.findIndex((s) => s.id === menu.id) + 1), disabled: !editable || deck.slides.at(-1)?.id === menu.id },
            { label: deck.slides.find((s) => s.id === menu.id)?.hidden ? 'Show slide when presenting' : 'Hide slide when presenting', icon: <EyeOff className="w-4 h-4" />, onSelect: () => setSlide(ydoc, menu.id, { hidden: !deck.slides.find((s) => s.id === menu.id)?.hidden }), disabled: !editable },
            { heading: 'Layout' },
            ...LAYOUTS.map((l) => ({ label: l.name, checked: deck.slides.find((s) => s.id === menu.id)?.layout === l.id, onSelect: () => applyLayout(menu.id, l.id), disabled: !editable })),
            'sep',
            { label: 'Delete slide', icon: <Trash2 className="w-4 h-4" />, onSelect: () => { const i = deck.slides.findIndex((s) => s.id === menu.id); deleteSlides(ydoc, [menu.id]); go(i - 1); }, disabled: !editable || deck.slides.length < 2 },
          ]} />
        </SlideMenu>
      )}
    </div>
  );

  /** A new layout keeps the slide's words: its title and text move into the new placeholders. */
  function applyLayout(id: string, layout: Slide['layout']) {
    const s = slideOf(ydoc, id);
    if (!s) return;
    const title = plainText(s.items.find((i) => i.role === 'title')?.paras), sub = plainText(s.items.find((i) => i.role === 'subtitle')?.paras);
    const bodies = s.items.filter((i) => i.role === 'body').map((i) => plainText(i.paras));
    const fresh = newSlide(layout, deck.ratio, { title, subtitle: sub, body: bodies[0], body2: bodies[1] }).items;
    const others = s.items.filter((i) => !i.role);
    ydoc.transact(() => { deleteItems(ydoc, id, s.items.filter((i) => i.role).map((i) => i.id)); addItems(ydoc, id, fresh); setSlide(ydoc, id, { layout }); restack(ydoc, id, others.map((o) => o.id), 'front'); }, LOCAL);
  }
}

function SlideMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const el = box.current;
    if (el) { el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - el.offsetWidth - 8))}px`; el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - el.offsetHeight - 8))}px`; el.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus(); }
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [x, y]);
  return <div ref={box} style={{ position: 'fixed', left: -9999, top: -9999 }} className="z-[70] min-w-56 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-[#141416] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm text-zinc-800 dark:text-zinc-100">{children}</div>;
}
