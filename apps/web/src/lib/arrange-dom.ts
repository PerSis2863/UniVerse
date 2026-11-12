import { arranged, cleanKey, moved, overlap, uniqueKeys, type Entry, type PageLayout, type Size, type Vault } from './arrange';
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
const BLOCK = 'section, article, form, .panel, .card, .ins-board, [data-card], li, tbody > tr, [class*="rounded-xl"], [class*="rounded-2xl"], [class*="rounded-3xl"]';
/** Never arranged: the feature's own parts, overlays, the phone's tab bar (and the side menu, which has an arranger of its own). */
const SKIP = '[data-arrange-ui], [data-no-arrange], [role="dialog"], [role="menu"], [role="listbox"], .ios-tabbar';
/** Never grabbed: what is typed in, played, drawn on, or drags by itself. */
const NOGRAB = '[data-arrange-ui], [data-no-arrange], input, textarea, select, option, [contenteditable=""], [contenteditable="true"], .ProseMirror, canvas, iframe, video, audio, [draggable="true"], [role="slider"], [role="separator"], [role="scrollbar"], [role="dialog"], [role="menu"], [role="listbox"]';
const TITLE = 'h1, h2, h3, h4, h5, h6, legend, label, [data-card-title]';
const EDGE = 8, MAX_GROUP = 24, MAX_ROWS = 60, TRAVEL = 6, HOLD = 350;
/** Under this width a page is one column: widths chosen on a computer aren't used (the order and heights are). */
const narrow = () => window.innerWidth < 640;

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
  // A table's row is what it says (numbers and all: "Week 3" isn't "Week 4").
  if (el.tagName === 'TR') return cleanKey(Array.from(el.children).map((c) => c.textContent?.trim()).join(' '));
  const h = el.querySelector('h1, h2, h3, h4, legend, [data-card-title]');
  // No heading: what it says (a row in a list, a tile).
  return cleanKey((h ?? el).textContent?.replace(/\d+/g, ''));
}

const opened = (el: Element | null): boolean => el instanceof HTMLElement && el.dataset.arrOpen !== undefined;
/** What a container holds for arranging: its children, with the children of any wrapper opened into it. */
const inside = (el: Element): Element[] => Array.from(el.children).flatMap((k) => (opened(k) ? inside(k) : [k]));
const held = (parent: HTMLElement) => inside(parent).filter(shown);
/** The box whose children are a wrapper's things: itself, or (a wrapper that only wraps one plain box) that box. */
function core(w: HTMLElement): HTMLElement {
  for (;;) {
    const kids = Array.from(w.children).filter(shown);
    if (kids.length !== 1 || !plain(kids[0]) || kids[0].children.length < 2) return w;
    w = kids[0];
  }
}
/** A box with no look of its own (no fill, edge, shadow, padding, clipping, role or name): it can be opened into its container unseen. */
function plain(el: HTMLElement): boolean {
  if (!/^(DIV|SECTION)$/.test(el.tagName) || el.matches(SKIP) || el.hasAttribute('role') || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return false;
  const n = Array.from(el.children).filter(shown).length;
  if (n < 1 || n > MAX_GROUP) return false;
  const c = getComputedStyle(el);
  return c.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) && c.boxShadow === 'none' && c.overflowX === 'visible' && c.overflowY === 'visible'
    && /static|relative/.test(c.position) && ['Top', 'Right', 'Bottom', 'Left'].every((d) => (parseFloat(c[`border${d}Width` as 'borderTopWidth']) || 0) === 0 && (parseFloat(c[`padding${d}` as 'paddingTop']) || 0) === 0);
}

// shortcut: whether a component handles the press itself (an editor's canvas, a calendar's grid, a
// swipe row) is read from the props (not `onTouchStart`: every link has one, to load its page early) React keeps on the node (`__reactProps$…`, the same since React 17);
// if React ever renames it this finds nothing and such parts need `data-no-arrange`.
let propsKey: string | undefined;
function pressHandled(el: HTMLElement): boolean {
  propsKey ??= Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  const p = propsKey ? (el as unknown as Record<string, Record<string, unknown> | undefined>)[propsKey] : undefined;
  return !!p && !!(p.onPointerDown || p.onMouseDown || p.onPointerDownCapture || p.onMouseDownCapture || p.onDragStart);
}

interface Group { parent: HTMLElement; kids: HTMLElement[]; keys: string[] }

export class Arranger {
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
  private resized = 0;
  private unlisten: () => void;

  /** `menu`: the root is the side menu (its entries move, nothing resizes). */
  constructor(private root: HTMLElement, private vault: Vault, private changed: (s: { canUndo: boolean; arranged: boolean }) => void, private menu = false) {
    // Only things added or taken away matter (numbers counting up, clocks and typing change text alone).
    const things = (l: NodeList) => Array.prototype.some.call(l, (n: Node) => n.nodeType === 1);
    this.mo = new MutationObserver((list) => { if (list.some((r) => things(r.addedNodes) || things(r.removedNodes))) this.schedule(); });
    this.mo.observe(root, { childList: true, subtree: true });
    // Another device changed this page: show it (not under a finger that is arranging).
    this.unlisten = vault.listen((paths, mine) => { if (!mine && paths.has(this.path) && !this.busy) this.reload(); });
    // After the page's own handlers (bubble), so something that drags by itself is seen to have started.
    document.addEventListener('pointerdown', this.down);
    document.addEventListener('pointermove', this.hover, { passive: true });
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('dblclick', this.twice, true);
    document.addEventListener('touchmove', this.touch, { capture: true, passive: false });
    document.addEventListener('contextmenu', this.touch, true);
    document.addEventListener('dragstart', this.native, true);
    window.addEventListener('resize', this.fit);
  }

  destroy() {
    this.drag?.();
    document.removeEventListener('pointerdown', this.down);
    document.removeEventListener('pointermove', this.hover);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('dblclick', this.twice, true);
    window.removeEventListener('resize', this.fit);
    clearTimeout(this.resized);
    this.unlisten();
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
    this.path = path;
    this.reload();
  }

  /** The page as it is kept (after a change of page, or of the copy kept). */
  private reload() {
    this.clear();
    this.layout = JSON.parse(JSON.stringify(this.vault.get(this.path))) as PageLayout;
    this.undoStack = [];
    this.apply();
    this.tell();
  }

  /** The window changed size: widths are measured again (a page of one column on a phone, of four on a computer). */
  private fit = () => {
    clearTimeout(this.resized);
    this.resized = window.setTimeout(() => { if (this.layout.length && !this.busy) { this.clear(); this.apply(); } }, 200);
  };

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
    this.layout = this.layout.filter((e) => e.order.length > 0);
    this.vault.set(this.path, JSON.parse(JSON.stringify(this.layout)) as PageLayout);
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
    // A wrapper opened into its container: its things belong to that container's group.
    while (opened(parent) && parent.parentElement) parent = parent.parentElement;
    if (parent.closest(SKIP) || (!this.menu && parent.closest('aside')) || /(^| )divide-x/.test(cls(parent))) return null;
    // Of a table, only the rows of its body (not the header, not the cells of a row).
    if (parent.matches('table, thead, tfoot, tr, colgroup')) return null;
    const kids = held(parent);
    if (kids.length < 2 || kids.length > (parent.matches('tbody, ul, ol') ? MAX_ROWS : MAX_GROUP)) return null;
    // The page's own frame (its top bar and what is under it) stays as it is.
    if (kids.some((k) => k.matches('header, .app-topbar'))) return null;
    if (!kids.some((k) => k.matches(BLOCK) || k.matches(CONTROL))) return null;
    return { parent, kids, keys: uniqueKeys(kids.map(nameOf)) };
  }

  private groups(): Group[] {
    const parents = new Set<HTMLElement>();
    for (const el of this.root.querySelectorAll(`${BLOCK}, ${CONTROL}`)) { let p = el.parentElement; while (p && opened(p)) p = p.parentElement; if (p && p !== this.root.parentElement) parents.add(p); }
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
      const open = entry.open ?? [];
      let best: Group | null = null, score = Math.min(2, entry.order.length) - 1;
      for (const g of groups) {
        if (taken.has(g)) continue;
        const wrappers = open.filter((k) => g.keys.includes(k)).length;
        // A group that took wrappers in belongs to the container that holds them (or already shows their things).
        const s = overlap(entry, g.keys) + wrappers;
        if (s > score) { best = g; score = s; }
      }
      if (!best) continue;
      taken.add(best);
      let g = best;
      for (const key of open) {
        if (Array.from(g.parent.children).some((c) => opened(c) && (c as HTMLElement).dataset.arrOpen === key)) continue;
        // By its name; or (its name is what it says, which may have changed) by the things it holds.
        const known = new Set(entry.order);
        const w = g.kids[g.keys.indexOf(key)] ?? g.kids.find((k) => {
          if (!plain(k)) return false;
          const names = uniqueKeys(held(core(k)).map(nameOf));
          return names.length > 0 && names.filter((n) => known.has(n)).length >= Math.min(2, names.length);
        });
        if (!w || !plain(w)) continue;
        for (const other of groups) if (other.parent === w) taken.add(other);
        this.unwrap(w, g.parent, key, this.ready(g).gap);
      }
      if (open.length) g = this.groupOf(best.parent) ?? best;
      this.owner.set(g.parent, entry);
      this.dress(g, entry);
    }
  }

  /**
   * Opens a plain wrapper into its container (`display: contents`): its things become the container's,
   * each keeping the width it had (measured now, on this screen), so nothing jumps.
   */
  private unwrap(w: HTMLElement, into: HTMLElement, key: string, gap: number) {
    const box = core(w), kids = Array.from(box.children).filter(shown);
    const ci = getComputedStyle(into), inner = into.clientWidth - (parseFloat(ci.paddingLeft) || 0) - (parseFloat(ci.paddingRight) || 0);
    const own = parseFloat(getComputedStyle(box).columnGap) || 0;
    const widths = kids.map((k) => k.getBoundingClientRect().width);
    for (let el: HTMLElement | null = box; el && el !== into; el = el.parentElement) { el.dataset.arrOpen = el === w ? key : ''; el.style.display = 'contents'; }
    kids.forEach((k, i) => {
      if (k.style.width || inner <= 0) return;
      k.dataset.arrFit = '';
      k.style.flex = '0 0 auto';
      // As wide as it was, in a share of the row (with the container's own gap, which may be wider: a hair narrower then).
      const share = Math.min(100, ((widths[i] + own) / (inner + own)) * 100);
      k.style.width = widths[i] >= inner - 1 ? '100%' : `calc(${share.toFixed(3)}% - ${((gap * (100 - share)) / 100 + 0.02).toFixed(2)}px)`;
    });
  }

  /** Makes a container able to show another order (a stack becomes a wrapping row with its own gap). */
  private ready(g: Group): { grid: boolean; gap: number } {
    const p = g.parent, cs = getComputedStyle(p);
    if (!p.dataset.arranged) {
      if (p.tagName === 'TBODY') this.table(p);
      else if (cs.display === 'block' || cs.display === 'flow-root') {
        // The space between its things, as most of them have it (one of them may have its own).
        const seen = new Map<number, number>(), m = g.kids.map((k) => { const c = getComputedStyle(k); return [parseFloat(c.marginTop) || 0, parseFloat(c.marginBottom) || 0]; });
        for (let i = 0; i + 1 < m.length; i++) { const v = Math.max(0, m[i][1] + m[i + 1][0]); seen.set(v, (seen.get(v) ?? 0) + 1); }
        const gap = [...seen].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] ?? 0;
        p.style.display = 'flex'; p.style.flexFlow = 'row wrap'; p.style.gap = `${gap}px`;
        p.dataset.arranged = 'col';
      } else p.dataset.arranged = cs.display.includes('grid') ? 'grid' : 'flex';
      // Where the browser has it, Tab follows what is seen, not what was written.
      p.style.setProperty('reading-flow', /grid|rows/.test(p.dataset.arranged ?? '') ? 'grid-rows' : 'flex-visual');
      // A list with lines between its rows (drawn above every row but the first written, or under every
      // one but the last written): the lines follow the order shown (CSS, by `data-arr-edge`).
      if (/(^| )divide-y/.test(cls(p))) p.dataset.arrDiv = (parseFloat(getComputedStyle(g.kids[g.kids.length - 1]).borderTopWidth) || 0) > 0 ? 'top' : 'bottom';
    }
    const gap = parseFloat(getComputedStyle(p).columnGap) || 0;
    return { grid: p.dataset.arranged === 'grid', gap };
  }

  /**
   * A table whose rows can change places: it is laid out as a grid (each row a sub-grid of the table's
   * columns), where `order` works; the roles say it is still a table to a screen reader.
   */
  private table(body: HTMLElement) {
    const t = body.closest('table');
    if (!t) return;
    // Its columns as wide as they are now, in shares, so nothing shifts and it still follows the window.
    const widths: number[] = [];
    for (const row of t.querySelectorAll(':scope > * > tr')) {
      let at = 0;
      for (const c of Array.from(row.children) as HTMLTableCellElement[]) {
        const span = c.colSpan || 1;
        if (span === 1) widths[at] = Math.max(widths[at] ?? 0, c.getBoundingClientRect().width);
        at += span;
      }
      for (let i = 0; i < at; i++) widths[i] ??= 0;
    }
    t.style.setProperty('--arr-cols', widths.map((w) => `minmax(0, ${Math.max(1, Math.round(w * 10) / 10)}fr)`).join(' ') || '1fr');
    t.dataset.arrTable = '';
    const role = (el: Element, r: string) => { if (!el.hasAttribute('role')) { el.setAttribute('role', r); el.setAttribute('data-arr-role', ''); } };
    role(t, 'table');
    for (const part of t.querySelectorAll(':scope > thead, :scope > tbody, :scope > tfoot')) role(part, 'rowgroup');
    for (const row of t.querySelectorAll(':scope > * > tr')) {
      role(row, 'row');
      for (const c of Array.from(row.children) as HTMLTableCellElement[]) {
        role(c, c.tagName === 'TH' ? (c.scope === 'row' ? 'rowheader' : 'columnheader') : 'cell');
        if (c.colSpan > 1 && !c.style.gridColumn) { c.style.gridColumn = `span ${c.colSpan}`; c.dataset.arrSpan = ''; }
      }
    }
    body.dataset.arranged = 'rows';
  }

  /** In a list with lines between its rows, the one shown first wears no line above it (or the last none under it). */
  private lines(p: HTMLElement, seq: HTMLElement[]) {
    if (p.dataset.arrDiv === undefined) return;
    for (const k of seq) if (k.dataset.arrEdge !== undefined) delete k.dataset.arrEdge;
    const edge = p.dataset.arrDiv === 'top' ? seq[0] : seq[seq.length - 1];
    if (edge) edge.dataset.arrEdge = '';
  }

  private dress(g: Group, entry: Entry) {
    const { grid, gap } = this.ready(g);
    const seq = arranged(entry.order, g.keys);
    g.kids.forEach((k, i) => { const o = String(seq.indexOf(g.keys[i]) + 1); if (k.style.order !== o) k.style.order = o; });
    this.lines(g.parent, this.sequence(g));
    if (entry.maxW) g.parent.style.maxWidth = `${entry.maxW}px`;
    for (const [key, size] of Object.entries(entry.sizes ?? {})) {
      const el = g.kids[g.keys.indexOf(key)];
      if (el) this.size(el, size, grid, gap, g.parent);
    }
  }

  private size(el: HTMLElement, s: Size, grid: boolean, gap: number, parent: HTMLElement) {
    el.dataset.arrSized = '';
    if (narrow()) { /* one column: the width chosen on a wider screen waits for one */ }
    else if (grid) {
      const cols = getComputedStyle(parent).gridTemplateColumns.split(' ').length;
      el.style.gridColumn = s.span ? `span ${Math.min(s.span, cols)}` : '';
    } else if (s.pct) {
      delete el.dataset.arrFit;
      el.style.flex = '0 0 auto';
      el.style.width = s.pct >= 100 ? '100%' : `calc(${s.pct}% - ${(gap * (100 - s.pct)) / 100}px)`;
    }
    if (s.h) { el.style.height = `${s.h}px`; el.style.overflow = 'auto'; } else if (el.style.height) { el.style.height = ''; el.style.overflow = ''; }
  }

  /** Takes every trace of an arrangement off the page. */
  /** The root itself and everything in it that matches (the side menu is its own arranged container). */
  private all(sel: string): HTMLElement[] { return [...(this.root.matches(sel) ? [this.root] : []), ...this.root.querySelectorAll<HTMLElement>(sel)]; }

  private clear() {
    for (const p of this.all('[data-arranged]')) {
      if (p.dataset.arranged === 'col') { p.style.display = ''; p.style.flexFlow = ''; p.style.gap = ''; }
      p.style.removeProperty('reading-flow'); p.style.maxWidth = '';
      delete p.dataset.arranged; delete p.dataset.arrDiv;
      for (const k of held(p)) { k.style.order = ''; delete k.dataset.arrEdge; }
    }
    for (const w of this.all('[data-arr-open]')) { w.style.display = ''; delete w.dataset.arrOpen; }
    for (const el of this.all('[data-arr-sized], [data-arr-fit]')) {
      el.style.width = ''; el.style.flex = ''; el.style.gridColumn = ''; el.style.height = ''; el.style.overflow = '';
      delete el.dataset.arrSized; delete el.dataset.arrFit;
    }
    for (const t of this.all('[data-arr-table]')) {
      delete t.dataset.arrTable; t.style.removeProperty('--arr-cols');
      for (const el of [t, ...t.querySelectorAll<HTMLElement>('[data-arr-role], [data-arr-span]')]) {
        if (el.hasAttribute('data-arr-role')) { el.removeAttribute('role'); el.removeAttribute('data-arr-role'); }
        if (el.dataset.arrSpan !== undefined) { el.style.gridColumn = ''; delete el.dataset.arrSpan; }
      }
    }
    this.owner = new WeakMap();
  }

  // ── Gestures ──
  /** A card (it can be resized) or a control (a button, a tab: only moved). */
  private kind(el: HTMLElement): Kind { return this.menu || el.tagName === 'TR' || (el.matches(CONTROL) && el.getBoundingClientRect().height < 72) ? 'control' : 'block'; }

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
      // (An opened wrapper has no box; one column has no widths to pull.)
      const boxed = q.width > 0 && !opened(el);
      const r = boxed && !narrow() && (rtl ? x < q.left + EDGE : x > q.right - EDGE), b = boxed && y > q.bottom - EDGE;
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

  private move(el: HTMLElement, g0: Group, e: PointerEvent, x0: number, y0: number) {
    this.remember();
    let g = g0, entry = this.entryFor(g);
    this.ready(g);
    let seq = this.sequence(g);
    seq.forEach((k, i) => { k.style.order = String(i + 1); });
    let still = seq.filter((k) => k !== el);
    let rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
    let base = rects.get(el)!, over: HTMLElement | null = null, dirty = false, mixed = !!entry.open?.length;
    const start = base;
    el.classList.add('arr-drag');
    // The page's own scroller, so a card can be carried past the edge of the screen.
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const onScroll = () => { dirty = true; };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    const place = (x: number, y: number) => { el.style.transform = `translate3d(${x - x0 + (start.left - base.left)}px, ${y - y0 + (start.top - base.top)}px, 0) scale(1.02)`; };
    const measure = () => {
      for (const k of still) for (const a of k.getAnimations()) if (a.id === 'arr') a.finish();
      const t = el.style.transform; el.style.transform = '';
      rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      el.style.transform = t; base = rects.get(el)!; dirty = false;
    };
    /** The order `next` on the page, its neighbours gliding from where they were. */
    const settle = (next: HTMLElement[], before: Map<HTMLElement, DOMRect>) => {
      seq = next; still = seq.filter((k) => k !== el);
      seq.forEach((k, i) => { k.style.order = String(i + 1); });
      this.lines(g.parent, seq);
      el.style.transform = '';
      rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      base = rects.get(el)!;
      for (const k of still) {
        const a = before.get(k), b = rects.get(k)!;
        if (!a || Math.abs(a.left - b.left) + Math.abs(a.top - b.top) < 1) continue;
        this.glide(k, `translate(${a.left - b.left}px, ${a.top - b.top}px)`, 320);
      }
    };
    /**
     * A plain wrapper `w` of the group `into` is opened, so the carried thing and the wrapper's own can
     * mix (M166): out of its own row into the page, or into another row.
     */
    const open = (w: HTMLElement, into: Group) => {
      const before = rects;
      const box = core(w);
      const things = Array.from(box.children).filter(shown).map((k, i) => ({ k, i, o: Number(k.style.order) || 0 })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.k);
      const outer = into === g ? seq : this.sequence(into);
      const target = into === g ? entry : this.entryFor(into);
      // The wrapper's own arrangement (if it had one) travels with its things.
      const had = this.owner.get(box);
      if (had) this.layout = this.layout.filter((x) => x !== had);
      const key = into.keys[into.kids.indexOf(w)];
      this.unwrap(w, into.parent, key, this.ready(into).gap);
      (target.open ??= []).push(key);
      for (const [k, size] of Object.entries(had?.sizes ?? {})) (target.sizes ??= {})[k] = size;
      const next = outer.flatMap((k) => (k === w ? things : [k]));
      g = this.groupOf(into.parent) ?? into; entry = target; mixed = true;
      this.owner.set(g.parent, entry);
      settle(next.filter((k) => g.kids.includes(k)), before);
      over = null;
    };
    let shut: HTMLElement | null = null; // the row last asked whether it opens
    const within = (q: DOMRect, x: number, y: number, pad = 0) => x >= q.left - pad && x <= q.right + pad && y >= q.top - pad && y <= q.bottom + pad;

    const again = this.follow(e, (x, y) => {
      if (dirty) measure();
      // Carried to the top or bottom edge: the page scrolls under it.
      if (scroller) {
        const s = scroller.getBoundingClientRect(), by = y < s.top + 56 ? -14 : y > s.bottom - 56 ? 14 : 0;
        if (by) { scroller.scrollTop += by; again(); }
      }
      // Carried out of its own row: the row opens into what holds it, and the thing is free among those.
      const home = g.parent;
      // (Whether a row can open is asked once per row, not every frame: it reads the row's style.)
      if (!this.menu && home !== this.root && home !== shut && !opened(home) && !within(home.getBoundingClientRect(), x, y, 12)) {
        shut = home;
        if (plain(home)) {
          // (Through wrappers that only wrap that one row.)
          let top = home;
          while (top.parentElement && top.parentElement !== this.root && plain(top.parentElement) && Array.from(top.parentElement.children).filter(shown).length === 1) top = top.parentElement;
          const up = this.member(top);
          if (up && this.root.contains(up.parent)) open(top, up);
        }
      }
      if (over) { const q = rects.get(over)!; if (!within(q, x, y)) over = null; }
      const target = still.find((k) => within(rects.get(k)!, x, y));
      if (target && target !== over) {
        // Over another row of things: it opens, so the carried thing can sit among them.
        if (!this.menu && plain(target) && this.groupOf(core(target))) { open(target, g); place(x, y); again(); return; }
        settle(moved(seq, seq.indexOf(el), seq.indexOf(target)), rects);
        over = target;
      }
      place(x, y);
    }, () => {
      document.removeEventListener('scroll', onScroll, true);
      const from = el.style.transform;
      el.style.transform = '';
      entry.order = seq.map((k) => g.keys[g.kids.indexOf(k)]);
      const landed = el.getBoundingClientRect();
      let from2 = from;
      // Rows whose things ended up together again close (only they, and this group, are drawn again).
      if (mixed && this.close(g, entry, seq)) {
        // (Drawn again, the thing may sit a little elsewhere: it glides in from where the hand left it.)
        const now = el.getBoundingClientRect(), m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(from);
        if (m) from2 = `translate3d(${Number(m[1]) + landed.left - now.left}px, ${Number(m[2]) + landed.top - now.top}px, 0) scale(1.02)`;
      }
      this.save();
      this.glide(el, from2, 300).finished.catch(() => undefined).finally(() => el.classList.remove('arr-drag'));
    });
  }

  /**
   * After a move in a group that took wrappers in: a wrapper whose things sit side by side again, with
   * nothing of another's between them, closes (it is one thing again, its things in the order left).
   */
  private close(g: Group, entry: Entry, seq: HTMLElement[]): boolean {
    const closed: { box: HTMLElement; inner: Entry | null }[] = [];
    for (const w of Array.from(g.parent.children).filter((c): c is HTMLElement => opened(c))) {
      const mine = held(w), at = mine.map((k) => seq.indexOf(k)).filter((i) => i >= 0).sort((a, b) => a - b);
      if (!at.length || at.length !== mine.length || at[at.length - 1] - at[0] !== at.length - 1) continue;
      const key = w.dataset.arrOpen ?? '', run = seq.slice(at[0], at[0] + at.length), keys = run.map((k) => g.keys[g.kids.indexOf(k)]);
      entry.order = entry.order.flatMap((k) => (k === keys[0] ? [key] : keys.includes(k) ? [] : [k]));
      entry.open = entry.open?.filter((k) => k !== key);
      if (!entry.open?.length) delete entry.open;
      // Its own order, when it isn't the one it was written in; its things' sizes go back with them.
      const inner: Entry = { order: uniqueKeys(run.map(nameOf)) };
      for (const [i, k] of keys.entries()) { const size = entry.sizes?.[k]; if (size) { (inner.sizes ??= {})[inner.order[i]] = size; delete entry.sizes![k]; } }
      const keep = run.some((k, i) => k !== mine[i]) || !!inner.sizes;
      if (keep) this.layout.push(inner);
      closed.push({ box: this.shut(w), inner: keep ? inner : null });
    }
    if (entry.sizes && !Object.keys(entry.sizes).length) delete entry.sizes;
    if (!closed.length) return false;
    // The group without them, and each of them as its own group again.
    const outer = this.groupOf(g.parent);
    if (outer) { this.owner.set(outer.parent, entry); this.dress(outer, entry); }
    for (const { box, inner } of closed) {
      const gi = inner && this.groupOf(box);
      if (gi && inner) { this.owner.set(box, inner); this.dress(gi, inner); }
    }
    return true;
  }

  /** A wrapper that was opened is one box again; returns the box that holds its things. */
  private shut(w: HTMLElement): HTMLElement {
    let box = w;
    for (let el: HTMLElement | null = w; el && opened(el); el = (Array.from(el.children).find((c) => opened(c)) as HTMLElement | undefined) ?? null) {
      el.style.display = ''; delete el.dataset.arrOpen; box = el;
    }
    for (const k of Array.from(box.children) as HTMLElement[]) {
      if (k.dataset.arrFit !== undefined || k.dataset.arrSized !== undefined) { k.style.width = ''; k.style.flex = ''; k.style.gridColumn = ''; k.style.height = ''; k.style.overflow = ''; delete k.dataset.arrFit; delete k.dataset.arrSized; }
      k.style.order = ''; delete k.dataset.arrEdge;
    }
    return box;
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

  /** A double-click on a card's edge gives it back the size it came with. */
  private twice = (e: MouseEvent) => {
    const hit = this.item(e.target, e.clientX, e.clientY, true);
    const entry = hit && this.owner.get(hit.g.parent);
    const key = hit ? hit.g.keys[hit.g.kids.indexOf(hit.el)] : '';
    if (!hit || !entry?.sizes?.[key]) return;
    e.preventDefault(); e.stopPropagation();
    getSelection()?.removeAllRanges();
    this.remember();
    delete entry.sizes[key];
    if (!Object.keys(entry.sizes).length) delete entry.sizes;
    delete entry.maxW;
    this.save();
    this.clear(); this.apply();
  };

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
