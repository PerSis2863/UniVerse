import { arranged, cleanKey, moved, overlap, readStore, uniqueKeys, writeStore, type Entry, type PageLayout, type Size, type Store } from './arrange';
import { SPRING_GLIDE } from './page-transition';

// M165: the part of "arrange any page" that touches the page. It never moves a node (React owns the
// tree): a new place is the CSS `order` of the children of one container, a new size is an inline width,
// grid span or height, so nothing a page renders can be broken by it, and a page nobody arranged is
// never touched. There is no mode and nothing is drawn (the owner, 12 Nov: "just want to use the mouse…
// no need to show any lines"): anything in a group of 2 to 24 things (cards, rows of cards, buttons,
// tabs) moves when the mouse presses it and travels, and a card's right and bottom edges resize it. A
// press that doesn't travel is still a click; fields, text being selected, maps, drawings and anything
// that drags by itself are left alone. Everything that moves does so with `transform` on the compositor.

const CONTROL = 'button, a[href], [role="tab"], [role="button"], select, summary';
const BLOCK = 'section, article, form, .panel, .card, .ins-board, [data-card], li, [class*="rounded-xl"], [class*="rounded-2xl"], [class*="rounded-3xl"]';
/** Never arranged: the feature's own bar, overlays, tables, the side menu, the phone's tab bar. */
const SKIP = '[data-arrange-ui], [data-no-arrange], [role="dialog"], [role="menu"], [role="listbox"], table, aside, .ios-tabbar';
/** Never grabbed: what is typed in, played, drawn on, or drags by itself. */
const NOGRAB = '[data-arrange-ui], [data-no-arrange], input, textarea, select, option, [contenteditable=""], [contenteditable="true"], .ProseMirror, canvas, iframe, video, audio, [draggable="true"], [role="slider"], [role="separator"], [role="scrollbar"], [role="dialog"], [role="menu"], [role="listbox"]';
const TITLE = 'h1, h2, h3, h4, h5, h6, legend, label, [data-card-title]';
const EDGE = 8, MAX_GROUP = 24, TRAVEL = 6, HOLD = 350;

type Kind = 'block' | 'control';
const cls = (el: Element) => (typeof el.className === 'string' ? el.className : '');
const shown = (el: Element): el is HTMLElement => el instanceof HTMLElement && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && (el.offsetParent !== null || el.getClientRects().length > 0);

/** What a thing is called: its label, its heading, or (a button) its words without the numbers that change. */
function nameOf(el: HTMLElement): string {
  const own = el.dataset.arrangeKey ?? el.getAttribute('aria-label');
  if (own) return cleanKey(own);
  const by = el.getAttribute('aria-labelledby');
  if (by) { const t = document.getElementById(by.split(' ')[0])?.textContent; if (t) return cleanKey(t); }
  if (el.matches(CONTROL)) return cleanKey((el.getAttribute('title') ?? el.textContent ?? '').replace(/\d+/g, ''));
  const h = el.querySelector('h1, h2, h3, h4, legend, [data-card-title]');
  return cleanKey(h?.textContent?.replace(/\d+/g, ''));
}

// shortcut: whether a component handles the press itself (an editor's canvas, a calendar's grid, a
// swipe row) is read from the props React keeps on the node (`__reactProps$…`, the same since React 17);
// if React ever renames it this finds nothing and such parts need `data-no-arrange`.
let propsKey: string | undefined;
function pressHandled(el: HTMLElement): boolean {
  propsKey ??= Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  const p = propsKey ? (el as unknown as Record<string, Record<string, unknown> | undefined>)[propsKey] : undefined;
  return !!p && !!(p.onPointerDown || p.onMouseDown || p.onTouchStart || p.onPointerDownCapture || p.onMouseDownCapture || p.onDragStart);
}

interface Group { parent: HTMLElement; kids: HTMLElement[]; keys: string[] }

export class Arranger {
  private store: Store;
  private layout: PageLayout = [];
  private path = '';
  private undoStack: string[] = [];
  private owner = new WeakMap<HTMLElement, Entry>();
  private mo: MutationObserver;
  private frame = 0;
  private busy = false; // a drag or resize is going on: the page isn't re-read under it
  private drag: null | (() => void) = null; // ends the current gesture
  private hot: HTMLElement | null = null; // the card wearing a resize cursor
  private seen = 0; // the frame that looks under the pointer for an edge

  constructor(private root: HTMLElement, private userId: string | null, private changed: (s: { canUndo: boolean; arranged: boolean }) => void) {
    this.store = readStore(userId);
    this.mo = new MutationObserver(() => this.schedule());
    this.mo.observe(root, { childList: true, subtree: true });
    // After the page's own handlers (bubble), so something that drags by itself is seen to have started.
    document.addEventListener('pointerdown', this.down);
    document.addEventListener('pointermove', this.hover, { passive: true });
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('touchmove', this.touch, { capture: true, passive: false });
    document.addEventListener('contextmenu', this.touch, true);
    document.addEventListener('dragstart', this.native, true);
  }

  destroy() {
    this.drag?.();
    document.removeEventListener('pointerdown', this.down);
    document.removeEventListener('pointermove', this.hover);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('touchmove', this.touch, true);
    document.removeEventListener('contextmenu', this.touch, true);
    document.removeEventListener('dragstart', this.native, true);
    this.mo.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.seen);
    this.clear();
  }

  setPath(path: string) {
    if (path === this.path) return;
    this.clear();
    this.path = path;
    this.layout = this.store[path] ?? [];
    this.undoStack = [];
    this.apply();
    this.tell();
  }

  reset() {
    if (!this.layout.length) return;
    this.remember();
    this.layout = [];
    this.save();
    this.clear();
  }

  undo() {
    const last = this.undoStack.pop();
    if (last === undefined) return;
    this.layout = JSON.parse(last) as PageLayout;
    this.save();
    this.clear();
    this.apply();
  }

  // ── What is kept ──
  private tell() { this.changed({ canUndo: this.undoStack.length > 0, arranged: this.layout.length > 0 }); }
  private remember() { this.undoStack.push(JSON.stringify(this.layout)); if (this.undoStack.length > 30) this.undoStack.shift(); }
  private save() {
    if (this.layout.length) this.store[this.path] = this.layout; else delete this.store[this.path];
    writeStore(this.userId, this.store);
    this.tell();
  }
  /** The saved group of this container (made now, in the order shown, when it has none). */
  private entryFor(g: Group): Entry {
    let e = this.owner.get(g.parent);
    if (!e || !this.layout.includes(e)) {
      e = { order: this.sequence(g).map((k) => g.keys[g.kids.indexOf(k)]) };
      this.layout.push(e);
      this.owner.set(g.parent, e);
    }
    return e;
  }

  // ── Reading the page ──
  private schedule() {
    if (this.busy || this.frame || !this.layout.length) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.apply(); });
  }

  private groupOf(parent: HTMLElement): Group | null {
    if (parent.closest(SKIP) || /(^| )divide-/.test(cls(parent))) return null;
    const kids = Array.from(parent.children).filter(shown);
    if (kids.length < 2 || kids.length > MAX_GROUP) return null;
    // The page's own frame (its top bar and what is under it) stays as it is.
    if (kids.some((k) => k.matches('header, .app-topbar'))) return null;
    if (!kids.some((k) => k.matches(BLOCK) || k.matches(CONTROL))) return null;
    return { parent, kids, keys: uniqueKeys(kids.map(nameOf)) };
  }

  private groups(): Group[] {
    const parents = new Set<HTMLElement>();
    for (const el of this.root.querySelectorAll(`${BLOCK}, ${CONTROL}`)) { const p = el.parentElement; if (p && p !== this.root.parentElement) parents.add(p); }
    const out: Group[] = [];
    for (const p of parents) { const g = this.groupOf(p); if (g) out.push(g); }
    return out;
  }

  /** The children in the order shown now. */
  private sequence(g: Group): HTMLElement[] {
    return g.kids.map((k, i) => ({ k, i, o: Number(k.style.order) || 0 })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.k);
  }

  // ── Putting the saved arrangement on the page ──
  private apply() {
    if (!this.layout.length) return;
    const groups = this.groups(), taken = new Set<Group>();
    for (const entry of this.layout) {
      let best: Group | null = null, score = Math.min(2, entry.order.length) - 1;
      for (const g of groups) { if (taken.has(g)) continue; const s = overlap(entry, g.keys); if (s > score) { best = g; score = s; } }
      if (!best) continue;
      taken.add(best);
      this.owner.set(best.parent, entry);
      this.dress(best, entry);
    }
  }

  /** Makes a container able to show another order (a stack becomes a wrapping row with its own gap). */
  private ready(g: Group): { grid: boolean; gap: number } {
    const p = g.parent, cs = getComputedStyle(p);
    if (!p.dataset.arranged) {
      if (cs.display === 'block' || cs.display === 'flow-root') {
        const a = getComputedStyle(g.kids[1] ?? g.kids[0]);
        const gap = Math.max(parseFloat(a.marginTop) || 0, parseFloat(getComputedStyle(g.kids[0]).marginBottom) || 0);
        p.style.display = 'flex'; p.style.flexFlow = 'row wrap'; p.style.gap = `${gap}px`;
        p.dataset.arranged = 'col';
      } else p.dataset.arranged = cs.display.includes('grid') ? 'grid' : 'flex';
      // Where the browser has it, Tab follows what is seen, not what was written.
      p.style.setProperty('reading-flow', p.dataset.arranged === 'grid' ? 'grid-rows' : 'flex-visual');
    }
    return { grid: p.dataset.arranged === 'grid', gap: parseFloat(getComputedStyle(p).columnGap) || 0 };
  }

  private dress(g: Group, entry: Entry) {
    const { grid, gap } = this.ready(g);
    const seq = arranged(entry.order, g.keys);
    g.kids.forEach((k, i) => { const o = String(seq.indexOf(g.keys[i]) + 1); if (k.style.order !== o) k.style.order = o; });
    if (entry.maxW) g.parent.style.maxWidth = `${entry.maxW}px`;
    for (const [key, size] of Object.entries(entry.sizes ?? {})) {
      const el = g.kids[g.keys.indexOf(key)];
      if (el) this.size(el, size, grid, gap, g.parent);
    }
  }

  private size(el: HTMLElement, s: Size, grid: boolean, gap: number, parent: HTMLElement) {
    el.dataset.arrSized = '';
    if (grid) {
      const cols = getComputedStyle(parent).gridTemplateColumns.split(' ').length;
      el.style.gridColumn = s.span ? `span ${Math.min(s.span, cols)}` : '';
    } else if (s.pct) {
      el.style.flex = '0 0 auto';
      el.style.width = s.pct >= 100 ? '100%' : `calc(${s.pct}% - ${(gap * (100 - s.pct)) / 100}px)`;
    }
    if (s.h) { el.style.height = `${s.h}px`; el.style.overflow = 'auto'; } else if (el.style.height) { el.style.height = ''; el.style.overflow = ''; }
  }

  /** Takes every trace of an arrangement off the page. */
  private clear() {
    for (const p of this.root.querySelectorAll<HTMLElement>('[data-arranged]')) {
      if (p.dataset.arranged === 'col') { p.style.display = ''; p.style.flexFlow = ''; p.style.gap = ''; }
      p.style.removeProperty('reading-flow'); p.style.maxWidth = '';
      delete p.dataset.arranged;
      for (const k of Array.from(p.children)) if (k instanceof HTMLElement) k.style.order = '';
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-arr-sized]')) {
      el.style.width = ''; el.style.flex = ''; el.style.gridColumn = ''; el.style.height = ''; el.style.overflow = '';
      delete el.dataset.arrSized;
    }
    this.owner = new WeakMap();
  }

  // ── Gestures ──
  /** A card (it can be resized) or a control (a button, a tab: only moved). */
  private kind(el: HTMLElement): Kind { return el.matches(CONTROL) && el.getBoundingClientRect().height < 72 ? 'control' : 'block'; }

  /** `el` as one of the things its container arranges, if it is. */
  private member(el: HTMLElement): Group | null {
    if (!el.parentElement || el === this.root || el.matches(SKIP) || el.matches('.sr-only, .absolute, .fixed')) return null;
    const g = this.groupOf(el.parentElement);
    return g && g.kids.includes(el) ? g : null;
  }

  /** What the pointer is on: the nearest card whose edge it is at (to resize), else the nearest thing that can move. */
  private item(target: EventTarget | null, x: number, y: number, edgesOnly = false): { el: HTMLElement; g: Group; r: boolean; b: boolean } | null {
    const t = target instanceof HTMLElement || target instanceof SVGElement ? target : null;
    if (!t || !this.root.contains(t) || t.closest(NOGRAB)) return null;
    let first: { el: HTMLElement; g: Group } | null = null;
    for (let el: Element | null = t; el && el !== this.root; el = el.parentElement) {
      if (!(el instanceof HTMLElement)) continue;
      // Something that handles the finger or the mouse itself (a board, a slider someone built).
      if (getComputedStyle(el).touchAction === 'none' || el.getAttribute('draggable') === 'false' || pressHandled(el)) return null;
      const q = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl';
      const r = rtl ? x < q.left + EDGE : x > q.right - EDGE, b = y > q.bottom - EDGE;
      if (!r && !b && (first || edgesOnly)) continue;
      const g = this.member(el);
      if (!g) continue;
      if ((r || b) && this.kind(el) === 'block') return { el, g, r, b };
      first ??= { el, g };
    }
    return first && !edgesOnly ? { ...first, r: false, b: false } : null;
  }

  /** A finger that is dragging a card doesn't also scroll the page or open the long-press menu. */
  private touch = (e: Event) => { if (this.busy) e.preventDefault(); };
  /** The browser's own dragging of links and pictures would take the pointer away mid-move. */
  private native = (e: DragEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && this.root.contains(t) && !t.closest('[draggable="true"], [data-no-arrange]')) e.preventDefault();
  };

  /** At a card's edge the pointer shows it can be pulled (looked up once a frame, only while no button is down). */
  private hover = (e: PointerEvent) => {
    if (this.busy || e.pointerType === 'touch' || e.buttons || this.seen) return;
    const { target, clientX: x, clientY: y } = e;
    this.seen = requestAnimationFrame(() => {
      this.seen = 0;
      if (this.busy) return;
      const hit = this.item(target, x, y, true);
      if (this.hot && this.hot !== hit?.el) { this.hot.style.cursor = ''; this.hot = null; }
      if (!hit) return;
      hit.el.style.cursor = hit.r && hit.b ? 'nwse-resize' : hit.r ? 'ew-resize' : 'ns-resize';
      this.hot = hit.el;
    });
  };

  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.busy || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    // Its own scrollbar, or something that already took the pointer for itself.
    if (t instanceof HTMLElement && ((t.offsetWidth - t.clientWidth > 4 && e.offsetX > t.clientWidth) || (t.offsetHeight - t.clientHeight > 4 && e.offsetY > t.clientHeight))) return;
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType === 'touch';
    // (A finger is always captured by what it touched; only a mouse tells us something took it.)
    if (!touch) for (let a: Element | null = t; a; a = a.parentElement) if (a.hasPointerCapture(e.pointerId)) return;
    const hit = this.item(t, x0, y0);
    if (!hit) return;
    const { el, g, r, b } = hit, edge = r || b;
    // Words that can be selected stay selectable: on them the mouse (like a finger anywhere) holds still a moment to grab.
    const words = !edge && !t.closest(CONTROL) && !t.closest(TITLE) && getComputedStyle(t).userSelect !== 'none'
      && Array.from(t.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
    let begun = false;
    const begin = () => {
      begun = true; stop();
      getSelection()?.removeAllRanges();
      // The press that ends a move isn't a click on what was moved.
      const quiet = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
      document.addEventListener('click', quiet, true);
      const lift = () => { setTimeout(() => document.removeEventListener('click', quiet, true), 0); document.removeEventListener('pointerup', lift, true); document.removeEventListener('pointercancel', lift, true); };
      document.addEventListener('pointerup', lift, true);
      document.addEventListener('pointercancel', lift, true);
      if (edge) this.resize(el, g, e, r, b); else this.move(el, g, e, x0, y0);
    };
    const hold = (touch || words) && !edge ? window.setTimeout(begin, HOLD) : 0;
    const moving = (m: PointerEvent) => {
      const far = Math.hypot(m.clientX - x0, m.clientY - y0);
      if (hold) { if (far > 8) stop(); } else if (far > (edge ? 3 : TRAVEL) && !begun) begin();
    };
    const stop = () => { clearTimeout(hold); document.removeEventListener('pointermove', moving, true); document.removeEventListener('pointerup', stop, true); document.removeEventListener('pointercancel', stop, true); };
    document.addEventListener('pointermove', moving, true);
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);
  };

  /** Follows one pointer until it lifts; `frame` runs at most once a frame with the latest position. */
  private follow(e: PointerEvent, frame: (x: number, y: number) => void, done: () => void) {
    this.busy = true;
    document.documentElement.dataset.arrBusy = '';
    let x = e.clientX, y = e.clientY, raf = 0;
    const tick = () => { raf = 0; frame(x, y); };
    const moving = (m: PointerEvent) => { if (m.pointerId !== e.pointerId) return; x = m.clientX; y = m.clientY; if (!raf) raf = requestAnimationFrame(tick); };
    const end = () => {
      document.removeEventListener('pointermove', moving, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', end);
      cancelAnimationFrame(raf);
      this.drag = null;
      this.busy = false;
      delete document.documentElement.dataset.arrBusy;
      done();
    };
    document.addEventListener('pointermove', moving, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', end);
    this.drag = end;
    return () => { if (!raf) raf = requestAnimationFrame(tick); };
  }

  private move(el: HTMLElement, g: Group, e: PointerEvent, x0: number, y0: number) {
    this.remember();
    const entry = this.entryFor(g);
    this.ready(g);
    let seq = this.sequence(g);
    seq.forEach((k, i) => { k.style.order = String(i + 1); });
    const still = seq.filter((k) => k !== el);
    let rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
    let base = rects.get(el)!, over: HTMLElement | null = null, dirty = false;
    el.classList.add('arr-drag');
    // The page's own scroller, so a card can be carried past the edge of the screen.
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const onScroll = () => { dirty = true; };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    const place = (x: number, y: number) => { el.style.transform = `translate3d(${x - x0 + (start.left - base.left)}px, ${y - y0 + (start.top - base.top)}px, 0) scale(1.02)`; };
    const start = base;
    const measure = () => {
      for (const k of still) for (const a of k.getAnimations()) if (a.id === 'arr') a.finish();
      const t = el.style.transform; el.style.transform = '';
      rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      el.style.transform = t; base = rects.get(el)!; dirty = false;
    };
    const again = this.follow(e, (x, y) => {
      if (dirty) measure();
      // Carried to the top or bottom edge: the page scrolls under it.
      if (scroller) {
        const s = scroller.getBoundingClientRect(), by = y < s.top + 56 ? -14 : y > s.bottom - 56 ? 14 : 0;
        if (by) { scroller.scrollTop += by; again(); }
      }
      if (over) { const q = rects.get(over)!; if (x < q.left || x > q.right || y < q.top || y > q.bottom) over = null; }
      const target = still.find((k) => { const q = rects.get(k)!; return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; });
      if (target && target !== over) {
        const before = rects;
        seq = moved(seq, seq.indexOf(el), seq.indexOf(target));
        seq.forEach((k, i) => { k.style.order = String(i + 1); });
        el.style.transform = '';
        rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
        base = rects.get(el)!;
        for (const k of still) {
          const a = before.get(k)!, b = rects.get(k)!;
          if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) < 1) continue;
          this.glide(k, `translate(${a.left - b.left}px, ${a.top - b.top}px)`, 320);
        }
        over = target;
      }
      place(x, y);
    }, () => {
      document.removeEventListener('scroll', onScroll, true);
      const from = el.style.transform;
      el.style.transform = '';
      this.glide(el, from, 300).finished.catch(() => undefined).finally(() => el.classList.remove('arr-drag'));
      entry.order = seq.map((k) => g.keys[g.kids.indexOf(k)]);
      this.save();
    });
  }

  private glide(el: HTMLElement, from: string, ms: number) {
    let a: Animation;
    try { a = el.animate([{ transform: from }, { transform: 'none' }], { duration: ms, easing: SPRING_GLIDE }); }
    catch { a = el.animate([{ transform: from }, { transform: 'none' }], { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); } // no linear()
    a.id = 'arr';
    return a;
  }

  private resize(el: HTMLElement, g: Group, e: PointerEvent, right: boolean, bottom: boolean) {
    this.remember();
    const entry = this.entryFor(g), key = g.keys[g.kids.indexOf(el)];
    const { grid, gap } = this.ready(g);
    const p = g.parent, start = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl';
    const size: Size = { ...(entry.sizes?.[key] ?? {}) };
    el.classList.add('arr-size');
    const pcs = getComputedStyle(p), pad = (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0);
    const capped = pcs.maxWidth !== 'none', room = (p.parentElement?.clientWidth ?? p.clientWidth);
    this.follow(e, (x, y) => {
      if (right) {
        const w = Math.max(80, start.width + (rtl ? e.clientX - x : x - e.clientX));
        if (grid) {
          const tracks = getComputedStyle(p).gridTemplateColumns.split(' ');
          const track = parseFloat(tracks[0]) || start.width;
          size.span = Math.max(1, Math.min(tracks.length, Math.round((w + gap) / (track + gap))));
        } else {
          let inner = p.clientWidth - pad;
          // Pulled wider than what holds it: that grows too, up to the room there is.
          if (w > inner + 4 && capped) { entry.maxW = Math.round(Math.min(room, w + pad)); p.style.maxWidth = `${entry.maxW}px`; inner = p.clientWidth - pad; }
          size.pct = Math.max(20, Math.min(100, Math.round(((w / inner) * 100) / 5) * 5));
        }
      }
      if (bottom) size.h = Math.max(60, Math.round((start.height + y - e.clientY) / 8) * 8);
      this.size(el, size, grid, gap, p);
    }, () => {
      el.classList.remove('arr-size');
      (entry.sizes ??= {})[key] = size;
      this.save();
    });
  }

  /** Keys: Alt + Shift + arrows move the focused thing, with Ctrl as well they resize a card; Ctrl/⌘ + Z takes a change back. */
  private key = (e: KeyboardEvent) => {
    const at = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (!this.undoStack.length || at?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .ProseMirror')) return;
      e.preventDefault(); e.stopPropagation(); this.undo();
      return;
    }
    if (!e.key.startsWith('Arrow') || !e.altKey || !e.shiftKey || e.metaKey || !at || !this.root.contains(at) || at.closest(NOGRAB)) return;
    let el: HTMLElement | null = at, g: Group | null = null;
    for (; el && el !== this.root; el = el.parentElement) { g = this.member(el); if (g) break; }
    if (!el || !g) return;
    const sizing = e.ctrlKey;
    e.preventDefault(); e.stopPropagation();
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    this.remember();
    const entry = this.entryFor(g);
    const { grid, gap } = this.ready(g);
    if (sizing) {
      if (this.kind(el) !== 'block') return;
      const k = g.keys[g.kids.indexOf(el)], size: Size = { ...(entry.sizes?.[k] ?? {}) }, q = el.getBoundingClientRect();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') size.h = Math.max(60, Math.round((size.h ?? q.height) / 8) * 8 + step * 40);
      else if (grid) size.span = Math.max(1, Math.min(12, (size.span ?? 1) + step));
      else size.pct = Math.max(20, Math.min(100, (size.pct ?? 100) + step * 10));
      this.size(el, size, grid, gap, g.parent);
      (entry.sizes ??= {})[k] = size;
    } else {
      const seq = this.sequence(g), at = seq.indexOf(el), to = at + step;
      if (to < 0 || to >= seq.length) return;
      const before = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      const next = moved(seq, at, to);
      next.forEach((k, i) => { k.style.order = String(i + 1); });
      for (const k of next) { const a = before.get(k)!, b = k.getBoundingClientRect(); if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) >= 1) this.glide(k, `translate(${a.left - b.left}px, ${a.top - b.top}px)`, 300); }
      entry.order = next.map((k) => g.keys[g.kids.indexOf(k)]);
      el.scrollIntoView({ block: 'nearest' });
    }
    this.save();
  };
}
