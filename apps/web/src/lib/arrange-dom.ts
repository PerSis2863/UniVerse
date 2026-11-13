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
const TITLE = 'h1, h2, h3, h4, h5, h6, legend, label, th, [data-card-title]';
/** M167: cards that can take a thing inside them (with a look of their own: `looks`). */
const HOST = 'section, article, form, .panel, .card, [data-card], [class*="rounded-lg"], [class*="rounded-xl"], [class*="rounded-2xl"], [class*="rounded-3xl"]';
const TABLE_PART = /^(TABLE|THEAD|TBODY|TFOOT|TR|TH|TD)$/;
/** How long a carried thing rests over a card before the card makes room for it (ms). */
const DWELL = 420;
/** The browser keeps a thing on its card itself (CSS anchor positioning), through animations, scrolling and resizing. */
const anchors = () => typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a') && CSS.supports('left: anchor(left)');
let hostIds = 0;
const EDGE = 8, EDGE_TOUCH = 18, MAX_GROUP = 24, MAX_ROWS = 60, TRAVEL = 6, HOLD = 350;
/** "Reduce motion" (the app's own setting or the device's): things change place and size without moving. */
const calm = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Under this width a page is one column: widths chosen on a computer aren't used (the order and heights are). */
const narrow = () => window.innerWidth < 640;

type Kind = 'block' | 'control';

/** Whether (x, y) is on words (not only in a box that has some): there the mouse holds a moment before it grabs. */
function onWords(x: number, y: number): boolean {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const node = d.caretPositionFromPoint?.(x, y)?.offsetNode ?? d.caretRangeFromPoint?.(x, y)?.startContainer;
  if (!node || node.nodeType !== 3 || !(node.textContent ?? '').trim()) return false;
  const r = document.createRange();
  r.selectNodeContents(node);
  return Array.from(r.getClientRects()).some((q) => x >= q.left - 1 && x <= q.right + 1 && y >= q.top && y <= q.bottom);
}
const cls = (el: Element) => (typeof el.className === 'string' ? el.className : '');
const shown = (el: Element): el is HTMLElement => el instanceof HTMLElement && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && (el.offsetParent !== null || el.getClientRects().length > 0);

/** Words without what changes as a page loads and lives: numbers, percentages, placeholder dashes (M168). */
const steady = (s: string | null | undefined) => (s ?? '').replace(/[\d%—–·…]+/g, '');

/** What a thing is called: its label, its heading, or (a button) its words without the numbers that change. */
function nameOf(el: HTMLElement): string {
  const own = el.dataset.arrangeKey ?? el.getAttribute('aria-label');
  if (own) return cleanKey(own);
  // A table's header, rows and footer, by the table's headings (steady while its rows change).
  if (/^(THEAD|TBODY|TFOOT)$/.test(el.tagName)) {
    const head = cleanKey(steady(el.closest('table')?.querySelector('thead')?.textContent)).slice(0, 44);
    return `${{ THEAD: 'Header', TBODY: 'Rows', TFOOT: 'Footer' }[el.tagName]}: ${head}`;
  }
  const by = el.getAttribute('aria-labelledby');
  if (by) { const t = document.getElementById(by.split(' ')[0])?.textContent; if (t) return cleanKey(t); }
  if (el.matches(CONTROL)) return cleanKey(steady(el.getAttribute('title') ?? el.textContent));
  // A table's row is what it says (numbers and all: "Week 3" isn't "Week 4").
  if (el.tagName === 'TR') return cleanKey(Array.from(el.children).map((c) => c.textContent?.trim()).join(' '));
  const h = el.querySelector('h1, h2, h3, h4, legend, [data-card-title]');
  // No heading: what it says (a row in a list, a tile).
  return cleanKey(steady((h ?? el).textContent));
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

/** M167: a card's look of its own (a fill, an edge or a shadow), so a thing dropped on it sits inside it. */
function looks(el: HTMLElement): boolean {
  const c = getComputedStyle(el);
  if (/^(contents|inline|none)$/.test(c.display)) return false;
  return !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || c.backgroundImage !== 'none' || c.boxShadow !== 'none' || (parseFloat(c.borderTopWidth) || 0) > 0;
}

/** A table whose columns can change places: one header row, the same number of cells in every row, none spanning two. */
function columnsOk(head: HTMLElement): boolean {
  const t = head.closest('table'), thead = head.parentElement;
  if (!t || thead?.tagName !== 'THEAD' || Array.from(thead.children).filter(shown).length !== 1) return false;
  if (t.querySelector('[colspan]:not([colspan="1"]), [rowspan]:not([rowspan="1"])')) return false;
  const n = head.children.length;
  return n >= 2 && Array.from(t.querySelectorAll(':scope > * > tr')).every((r) => r.children.length === n);
}

/**
 * M167: where a thing carried off the page (or the side menu) can land on the other one. `over` says what
 * a drop at (x, y) would do there, or null (not over the other one, or nothing to make of the thing).
 */
export interface Bridge { over(from: 'page' | 'menu', el: HTMLElement, x: number, y: number): null | (() => void) }

interface Group { parent: HTMLElement; kids: HTMLElement[]; keys: string[] }

export class Arranger {
  private layout: PageLayout = [];
  private path = '';
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private owner = new WeakMap<HTMLElement, Entry>();
  private mo: MutationObserver;
  private frame = 0;
  private busy = false; // a drag or resize is going on: the page isn't re-read under it
  private drag: null | (() => void) = null; // ends the current gesture
  private hot: HTMLElement | null = null; // the card wearing a resize cursor
  private seen = 0; // the frame that looks under the pointer for an edge
  private resized = 0;
  private unlisten: () => void;
  // M167: things dropped inside a card: each card's things, and each thing's card; kept in place as the page changes.
  private slots = new Map<HTMLElement, HTMLElement[]>();
  private slotOf = new Map<HTMLElement, HTMLElement>();
  private ro: ResizeObserver;
  private reslotting = 0;
  /** Parts of what is kept that the last drawing didn't find on the page (groups, rows to open, cards to go inside). */
  private unmatched = 0;
  private retried = 0;

  /** `menu`: the root is the side menu (its entries move, nothing resizes). */
  constructor(private root: HTMLElement, private vault: Vault, private changed: (s: { canUndo: boolean; arranged: boolean }) => void, private menu = false, private bridge?: Bridge) {
    this.ro = new ResizeObserver(() => this.reslotSoon());
    this.ro.observe(root);
    // Only things added or taken away matter (numbers counting up, clocks and typing change text alone).
    const things = (l: NodeList) => Array.prototype.some.call(l, (n: Node) => n.nodeType === 1);
    // (While part of what is kept hasn't found its place yet, words changing count too, twice a second at most:
    // a page may draw its cards before their names arrive.)
    this.mo = new MutationObserver((list) => {
      if (list.some((r) => things(r.addedNodes) || things(r.removedNodes))) this.schedule();
      else if (this.unmatched && performance.now() - this.retried > 500) { this.retried = performance.now(); this.schedule(); }
    });
    this.mo.observe(root, { childList: true, subtree: true, characterData: true });
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
    // A card that moves without changing size (an inner pane scrolled, a page's entrance ended): its things follow.
    document.addEventListener('scroll', this.scrolled, { capture: true, passive: true });
    document.addEventListener('transitionend', this.reslotSoon, true);
    document.addEventListener('animationend', this.reslotSoon, true);
  }

  destroy() {
    this.drag?.();
    document.removeEventListener('pointerdown', this.down);
    document.removeEventListener('pointermove', this.hover);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('dblclick', this.twice, true);
    window.removeEventListener('resize', this.fit);
    document.removeEventListener('scroll', this.scrolled, true);
    document.removeEventListener('transitionend', this.reslotSoon, true);
    document.removeEventListener('animationend', this.reslotSoon, true);
    this.ro.disconnect();
    cancelAnimationFrame(this.reslotting);
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
    this.undoStack = []; this.redoStack = [];
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
    this.redraw(() => this.clear());
  }

  /** The page drawn again from what is kept (put back, undone, redone), its things gliding to their places. */
  private redraw(change: () => void) {
    const els = this.all('[data-arranged], [data-arr-open]').flatMap((p) => held(p)).concat(this.all('[data-arr-sized], [data-arr-in]'));
    this.flip([...new Set(els)], change);
  }

  /**
   * M167: a thing about to appear in the side menu (a shortcut dragged onto it) is kept at the height it
   * was dropped at: its name goes into the menu's order before the entry under `y`.
   */
  placeNext(key: string, y: number) {
    const g = this.groupOf(this.root);
    if (!g) return;
    const seq = this.sequence(g), keys = seq.map((k) => g.keys[g.kids.indexOf(k)]).filter((k) => k !== key);
    const at = seq.findIndex((k) => { const q = k.getBoundingClientRect(); return y < q.top + q.height / 2; });
    keys.splice(at < 0 ? keys.length : at, 0, key);
    this.remember();
    const entry = this.entryFor(g);
    entry.order = keys;
    this.save();
  }

  undo() {
    const last = this.undoStack.pop();
    if (last === undefined) return;
    this.redoStack.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(last) as PageLayout;
    this.save();
    this.redraw(() => { this.clear(); this.apply(); });
  }

  /** M168: a change taken back with undo, made again. */
  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.layout));
    this.layout = JSON.parse(next) as PageLayout;
    this.save();
    this.redraw(() => { this.clear(); this.apply(); });
  }

  // ── What is kept ──
  private tell() { this.changed({ canUndo: this.undoStack.length > 0, arranged: this.layout.length > 0 }); }
  private remember() { this.undoStack.push(JSON.stringify(this.layout)); if (this.undoStack.length > 30) this.undoStack.shift(); this.redoStack = []; }
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
    // What is inside a button or a link (its icon, its words) is part of it, never moved on its own.
    if (parent.closest(CONTROL)) return null;
    // A table: its header, rows and footer; the rows of each; and (by its header row) its columns (M167).
    if (TABLE_PART.test(parent.tagName)) return this.tablePart(parent);
    if (parent.tagName === 'COLGROUP') return null;
    const kids = held(parent);
    // (A page's shortcuts move even when there is one: to the side menu, M167.)
    if (kids.length < (parent.dataset.pagePins !== undefined ? 1 : 2) || kids.length > (parent.matches('tbody, ul, ol') ? MAX_ROWS : MAX_GROUP)) return null;
    // The page's own frame (its top bar and what is under it) stays as it is.
    if (kids.some((k) => k.matches('header, .app-topbar'))) return null;
    if (!kids.some((k) => k.matches(BLOCK) || k.matches(CONTROL))) return null;
    return { parent, kids, keys: uniqueKeys(kids.map(nameOf)) };
  }

  /** A table's group: its header, rows and footer (the table), the rows of one of them, or its columns (the header row). */
  private tablePart(p: HTMLElement): Group | null {
    const t = p.closest('table');
    if (!t || this.menu) return null;
    let kids: HTMLElement[];
    if (p.tagName === 'TABLE') kids = Array.from(p.children).filter((k): k is HTMLElement => /^(THEAD|TBODY|TFOOT)$/.test(k.tagName) && shown(k));
    else if (p.tagName === 'TR') { if (!columnsOk(p)) return null; kids = Array.from(p.children).filter(shown); }
    else if (/^(THEAD|TBODY|TFOOT)$/.test(p.tagName)) kids = Array.from(p.children).filter((k): k is HTMLElement => k.tagName === 'TR' && shown(k));
    else return null;
    if (kids.length < 2 || kids.length > (p.tagName === 'TR' ? MAX_GROUP : MAX_ROWS)) return null;
    return { parent: p, kids, keys: uniqueKeys(kids.map(nameOf)) };
  }

  private groups(): Group[] {
    const parents = new Set<HTMLElement>();
    for (const el of this.root.querySelectorAll('table > thead, table > tfoot, thead > tr, tfoot > tr, thead > tr > th')) if (el.parentElement) parents.add(el.parentElement);
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
    let hosts: Map<string, HTMLElement> | undefined;
    this.unmatched = 0;
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
      if (!best) { this.unmatched++; continue; }
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
        if (!w || !plain(w)) { this.unmatched++; continue; }
        for (const other of groups) if (other.parent === w) taken.add(other);
        this.unwrap(w, g.parent, key, this.ready(g).gap);
      }
      if (open.length) g = this.groupOf(best.parent) ?? best;
      this.owner.set(g.parent, entry);
      this.dress(g, entry);
      // M167: what was dropped inside a card goes back inside it (once the card is on the page).
      for (const [k, hk] of Object.entries(entry.inside ?? {})) {
        hosts ??= this.hosts();
        const kid = g.kids[g.keys.indexOf(k)], host = hosts.get(hk);
        if (kid && host && !host.contains(kid) && !kid.contains(host)) this.slot(kid, host);
        else if (!kid || !host) this.unmatched++;
      }
    }
  }

  /**
   * Opens a plain wrapper into its container (`display: contents`): its things become the container's,
   * each keeping the width it had (measured now, on this screen), so nothing jumps.
   */
  private unwrap(w: HTMLElement, into: HTMLElement, key: string, gap: number) {
    // Its things, with those of rows already opened into it (measured again for the wider room).
    const box = core(w), kids = held(box);
    const ci = getComputedStyle(into), inner = into.clientWidth - (parseFloat(ci.paddingLeft) || 0) - (parseFloat(ci.paddingRight) || 0);
    const own = parseFloat(getComputedStyle(box).columnGap) || 0;
    const widths = kids.map((k) => k.getBoundingClientRect().width);
    for (let el: HTMLElement | null = box; el && el !== into; el = el.parentElement) { el.dataset.arrOpen = el === w ? key : ''; el.style.display = 'contents'; }
    kids.forEach((k, i) => {
      if (k.dataset.arrSized !== undefined || inner <= 0) return;
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
      const t = TABLE_PART.test(p.tagName) ? p.closest('table') : null;
      if (t) { this.table(t); p.dataset.arranged = p.tagName === 'TR' ? 'cols' : 'rows'; }
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
  private table(t: HTMLElement) {
    if (t.dataset.arrTable !== undefined) return;
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
    t.dataset.arrW = JSON.stringify(widths.map((w) => Math.round(w * 10) / 10));
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
  }

  /** M167: the columns as the header row shows them: every row's cells in the same order, each column keeping its width. */
  private mirror(head: HTMLElement) {
    const t = head.closest('table');
    if (!t) return;
    const order = Array.from(head.children).map((c) => (c as HTMLElement).style.order);
    for (const row of t.querySelectorAll<HTMLElement>(':scope > * > tr')) {
      if (row === head) continue;
      Array.from(row.children).forEach((c, i) => { const o = order[i] ?? ''; if ((c as HTMLElement).style.order !== o) (c as HTMLElement).style.order = o; });
    }
    const w = JSON.parse(t.dataset.arrW ?? '[]') as number[];
    if (w.length !== order.length) return;
    const shown = order.map((o, i) => ({ i, o: Number(o) || i + 1 })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.i);
    t.style.setProperty('--arr-cols', shown.map((i) => `minmax(0, ${Math.max(1, w[i])}fr)`).join(' '));
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
    if (g.parent.tagName === 'TR') this.mirror(g.parent);
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
      el.style.width = ''; el.style.justifySelf = '';
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
      el.style.width = ''; el.style.flex = ''; el.style.gridColumn = ''; el.style.height = ''; el.style.overflow = ''; el.style.justifySelf = '';
      delete el.dataset.arrSized; delete el.dataset.arrFit;
    }
    for (const thing of [...this.slotOf.keys()]) this.unslot(thing);
    for (const t of this.all('[data-arr-table]')) {
      delete t.dataset.arrTable; delete t.dataset.arrW; t.style.removeProperty('--arr-cols');
      for (const el of t.querySelectorAll<HTMLElement>('thead, tbody, tfoot, tr, th, td')) if (el.style.order) el.style.order = '';
      for (const el of [t, ...t.querySelectorAll<HTMLElement>('[data-arr-role], [data-arr-span]')]) {
        if (el.hasAttribute('data-arr-role')) { el.removeAttribute('role'); el.removeAttribute('data-arr-role'); }
        if (el.dataset.arrSpan !== undefined) { el.style.gridColumn = ''; delete el.dataset.arrSpan; }
      }
    }
    this.owner = new WeakMap();
  }

  // ── M167: things inside a card with a look of its own ──
  // A thing dropped on such a card stays where React put it: it is only drawn inside the card
  // (`position: absolute` at the card's foot, the card's padding grown to make room), so the card keeps
  // its look and nothing a page renders is moved.

  /** The cards of this page that can take things in, each by a name unique on the page (`Entry.inside`). */
  private hosts(): Map<string, HTMLElement> {
    const list = Array.from(this.root.querySelectorAll<HTMLElement>(HOST)).filter((h) => !h.matches(CONTROL) && !h.closest(SKIP) && !h.closest('table, aside') && h.offsetWidth >= 160 && h.offsetHeight >= 80 && looks(h));
    const keys = uniqueKeys(list.map(nameOf));
    return new Map(keys.map((k, i) => [k, list[i]]));
  }

  /** The card under (x, y) that could take `el` in: bigger than it, not its own, not one it is in. */
  private hostAt(el: HTMLElement, x: number, y: number, known: Map<HTMLElement, boolean>): HTMLElement | null {
    let t = document.elementFromPoint(x, y);
    // (Over something already inside a card: that card.)
    const inThing = t?.closest<HTMLElement>('[data-arr-in]');
    if (inThing && inThing !== el) t = this.slotOf.get(inThing) ?? t;
    const area = el.offsetWidth * el.offsetHeight;
    for (; t && t !== this.root && this.root.contains(t); t = t.parentElement) {
      if (!(t instanceof HTMLElement) || el.contains(t)) continue;
      if (t.contains(el)) return null;
      let ok = known.get(t);
      if (ok === undefined) { ok = t.matches(HOST) && !t.matches(CONTROL) && !t.closest(SKIP) && !t.closest('table, aside') && t.offsetWidth >= 160 && t.offsetHeight >= 80 && looks(t); known.set(t, ok); }
      if (ok && t.offsetWidth * t.offsetHeight >= area * 2.5) return t;
    }
    return null;
  }

  /** `thing` drawn inside `host` (again, if it already is: its place is worked out anew). */
  private slot(thing: HTMLElement, host: HTMLElement) {
    const was = this.slotOf.get(thing);
    if (was && was !== host) this.unslot(thing);
    if (!this.slotOf.has(thing)) {
      thing.dataset.arrW = String(Math.round(thing.offsetWidth));
      thing.dataset.arrIn = '';
      this.slotOf.set(thing, host);
      this.slots.set(host, [...(this.slots.get(host) ?? []), thing]);
      this.ro.observe(host);
    }
    this.seat(host);
  }

  /** `thing` back where its own page puts it; its card closes the room it had. */
  private unslot(thing: HTMLElement) {
    const host = this.slotOf.get(thing);
    this.slotOf.delete(thing);
    for (const p of ['position', 'left', 'top', 'right', 'width', 'margin', 'z-index', 'position-anchor']) thing.style.removeProperty(p);
    delete thing.dataset.arrIn; delete thing.dataset.arrW;
    if (!host) return;
    const rest = (this.slots.get(host) ?? []).filter((t) => t !== thing);
    if (rest.length) { this.slots.set(host, rest); this.seat(host); }
    else { this.slots.delete(host); this.ro.unobserve(host); this.seat(host); }
  }

  /**
   * Lays out a card's things in rows at its foot, the card's padding grown by their height. `room`: the
   * size of one more thing about to be dropped there (while it is carried over the card).
   */
  private seat(host: HTMLElement, room?: { w: number; h: number }) {
    const things = (this.slots.get(host) ?? []).filter((t) => t.isConnected);
    if (!things.length && !room) {
      if (host.dataset.arrPad !== undefined) { host.style.paddingBottom = ''; delete host.dataset.arrPad; }
      if (host.dataset.arrHost !== undefined) { host.style.removeProperty('anchor-name'); delete host.dataset.arrHost; }
      return;
    }
    const hs = getComputedStyle(host), rtl = hs.direction === 'rtl';
    if (host.dataset.arrPad === undefined) host.dataset.arrPad = hs.paddingBottom;
    const padL = parseFloat(hs.paddingLeft) || 0, padR = parseFloat(hs.paddingRight) || 0, padB = parseFloat(host.dataset.arrPad) || 0;
    const inner = Math.max(40, host.clientWidth - padL - padR), gap = 8;
    for (const t of things) {
      for (const a of t.getAnimations()) if (a.id === 'arr') a.finish();
      Object.assign(t.style, { position: 'absolute', margin: '0', zIndex: '20', left: '0px', top: '0px', right: 'auto', width: `${Math.min(Number(t.dataset.arrW) || t.offsetWidth, inner)}px` });
    }
    // Rows from the card's start edge.
    const sizes = [...things.map((t) => ({ w: t.offsetWidth, h: t.offsetHeight })), ...(room ? [{ w: Math.min(room.w, inner), h: room.h }] : [])];
    let x = 0, y = 0, rowH = 0;
    const at = sizes.map(({ w, h }) => { if (x > 0 && x + w > inner) { x = 0; y += rowH + gap; rowH = 0; } const p = { x, y }; x += w + gap; rowH = Math.max(rowH, h); return p; });
    const strip = y + rowH;
    host.style.paddingBottom = `${padB + strip + gap}px`;
    const hr = host.getBoundingClientRect();
    if (anchors()) {
      host.dataset.arrHost ??= String(++hostIds);
      host.style.setProperty('anchor-name', `--arr-h${host.dataset.arrHost}`);
    }
    things.forEach((t, i) => {
      const w = sizes[i].w, left = rtl ? hr.right - padR - at[i].x - w : hr.left + padL + at[i].x, top = hr.bottom - padB - strip + at[i].y;
      if (anchors()) {
        t.style.setProperty('position-anchor', `--arr-h${host.dataset.arrHost}`);
        t.style.top = `calc(anchor(bottom) - ${padB + strip - at[i].y}px)`;
        if (rtl) { t.style.left = 'auto'; t.style.right = `calc(anchor(right) + ${padR + at[i].x}px)`; }
        else t.style.left = `calc(anchor(left) + ${padL + at[i].x}px)`;
        // (Where the browser can't use this card as an anchor for it, it is placed by hand below.)
        const q = t.getBoundingClientRect();
        if (Math.abs(q.left - left) <= 2 && Math.abs(q.top - top) <= 2) return;
        t.style.removeProperty('position-anchor'); t.style.left = '0px'; t.style.top = '0px'; t.style.right = 'auto';
      }
      // Where it is with no offset (its containing block's corner), then where it goes.
      const o = t.getBoundingClientRect();
      t.style.left = `${Math.round(left - o.left)}px`;
      t.style.top = `${Math.round(top - o.top)}px`;
    });
  }

  /** Every card with things inside, laid out again (once a frame at most). */
  private reslotSoon = () => {
    if (!this.slots.size || this.reslotting || this.busy) return;
    this.reslotting = requestAnimationFrame(() => { this.reslotting = 0; for (const h of [...this.slots.keys()]) this.seat(h); });
  };
  /** An inner pane scrolled (the page's own scrolling moves the cards and their things together). */
  private scrolled = (e: Event) => { if (this.slots.size && e.target instanceof HTMLElement && e.target !== document.scrollingElement) this.reslotSoon(); };

  // ── Gestures ──
  /** A card (it can be resized) or a control (a button, a tab: only moved). */
  private kind(el: HTMLElement): Kind {
    // (A table's parts, shortcuts and things inside a card move but aren't pulled wider.)
    if (this.menu || TABLE_PART.test(el.tagName) || el.dataset.pin !== undefined || el.dataset.arrIn !== undefined) return 'control';
    return el.matches(CONTROL) && el.getBoundingClientRect().height < 72 ? 'control' : 'block';
  }

  /** `el` as one of the things its container arranges, if it is. */
  private member(el: HTMLElement): Group | null {
    if (!el.parentElement || el === this.root || el.matches(SKIP) || el.matches('.sr-only, .absolute, .fixed')) return null;
    const g = this.groupOf(el.parentElement);
    return g && g.kids.includes(el) ? g : null;
  }

  /** What the pointer is on: the nearest card whose edge it is at (to resize), else the nearest thing that can move. */
  private item(target: EventTarget | null, x: number, y: number, edgesOnly = false, edge = EDGE): { el: HTMLElement; g: Group; r: boolean; b: boolean } | null {
    const t = target instanceof HTMLElement || target instanceof SVGElement ? target : null;
    if (!t || !this.root.contains(t) || t.closest(NOGRAB)) return null;
    let first: { el: HTMLElement; g: Group } | null = null;
    for (let el: Element | null = t; el && el !== this.root; el = el.parentElement) {
      if (!(el instanceof HTMLElement)) continue;
      // On a button or a link, that is what is pressed: the card around it isn't pulled from under it.
      if (first?.el.matches(CONTROL)) break;
      if (edgesOnly && el.matches(CONTROL)) return null;
      // Something that handles the finger or the mouse itself (a board, a slider someone built).
      if (getComputedStyle(el).touchAction === 'none' || el.getAttribute('draggable') === 'false' || pressHandled(el)) return null;
      const q = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl';
      // (An opened wrapper has no box; one column has no widths to pull.)
      const boxed = q.width > 0 && !opened(el);
      const r = boxed && !narrow() && (rtl ? x < q.left + edge : x > q.right - edge), b = boxed && y > q.bottom - edge;
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
    // (A finger gets wider edges to take hold of.)
    const hit = this.item(t, x0, y0, false, touch ? EDGE_TOUCH : EDGE);
    if (!hit) return;
    const { el, g, r, b } = hit, edge = r || b;
    // Words that can be selected stay selectable: on them the mouse (like a finger anywhere) holds still a moment to grab.
    const words = !edge && !t.closest(CONTROL) && !t.closest(TITLE) && getComputedStyle(t).userSelect !== 'none' && onWords(x0, y0);
    let begun = false;
    const begin = (dx = 0, dy = 0) => {
      begun = true; stop();
      getSelection()?.removeAllRanges();
      // The press that ends a move isn't a click on what was moved.
      const quiet = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
      document.addEventListener('click', quiet, true);
      const lift = () => { setTimeout(() => document.removeEventListener('click', quiet, true), 0); document.removeEventListener('pointerup', lift, true); document.removeEventListener('pointercancel', lift, true); };
      document.addEventListener('pointerup', lift, true);
      document.addEventListener('pointercancel', lift, true);
      if (edge) { this.resize(el, g, e, r, b); return; }
      // M167, a table: carried sideways from any cell, its column moves; its header carried up or down, the whole header.
      let item = el, grp = g;
      const table = TABLE_PART.test(el.tagName) ? el.closest('table') : null;
      if (table && (dx || dy)) {
        const across = Math.abs(dx) > Math.abs(dy) * 1.2, cell = t.closest('td, th'), head = table.querySelector<HTMLElement>(':scope > thead > tr');
        if (across && cell?.parentElement && head) {
          const i = Array.from(cell.parentElement.children).indexOf(cell), cg = this.groupOf(head);
          if (cg && head.children[i]) { item = head.children[i] as HTMLElement; grp = cg; }
        } else if (!across && el.tagName === 'TH') {
          const thead = el.closest('thead') as HTMLElement | null, tg = thead && this.member(thead);
          if (thead && tg) { item = thead; grp = tg; }
        }
      }
      this.move(item, grp, e, x0, y0);
    };
    const hold = (touch || words) && !edge ? window.setTimeout(begin, HOLD) : 0;
    const moving = (m: PointerEvent) => {
      const far = Math.hypot(m.clientX - x0, m.clientY - y0);
      if (hold) { if (far > 8) stop(); } else if (far > (edge ? 3 : TRAVEL) && !begun) begin(m.clientX - x0, m.clientY - y0);
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
    const had = this.layout.length;
    let g = g0, entry = this.entryFor(g);
    const fresh = this.layout.length > had; // this group had no arrangement before this move
    // Taken out of a card (M167): back in its own place, shown where the hand has it.
    const wasIn = this.slotOf.get(el) ?? null, lifted = wasIn ? el.getBoundingClientRect() : null;
    if (wasIn) this.unslot(el);
    this.ready(g);
    let seq = this.sequence(g);
    const seq0 = seq.slice();
    seq.forEach((k, i) => { k.style.order = String(i + 1); });
    let still = seq.filter((k) => k !== el);
    let rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
    let base = rects.get(el)!, over: HTMLElement | null = null, dirty = false, mixed = !!entry.open?.length;
    const start = lifted ?? base;
    // A table's rows, header and footer go up and down; its columns side to side, every cell with its heading.
    const column = el.tagName === 'TH' && g.parent.tagName === 'TR', upDown = /^(TR|THEAD|TBODY|TFOOT)$/.test(el.tagName), table = column || upDown;
    const rowsOf = column ? Array.from(el.closest('table')!.querySelectorAll<HTMLElement>(':scope > * > tr')).filter((r) => r !== g.parent) : [];
    const at = column ? Array.from(g.parent.children).indexOf(el) : -1;
    const cells = rowsOf.map((r) => r.children[at] as HTMLElement | undefined).filter((c): c is HTMLElement => !!c);
    const lift = column ? 'arr-cell' : 'arr-drag';
    el.classList.add(lift);
    for (const c of cells) c.classList.add('arr-cell');
    // The page's own scroller, so a card can be carried past the edge of the screen.
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const onScroll = () => { dirty = true; };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    let into: HTMLElement | null = null; // the card it will go inside
    // M168: a card carried leans a little the way it is moving, and settles level when the hand stops.
    const leans = !table && !calm() && this.kind(el) === 'block';
    let vx = 0, lastX = x0, tilt = 0;
    const place = (x: number, y: number) => {
      const tx = upDown ? 0 : x - x0 + (start.left - base.left), ty = column ? 0 : y - y0 + (start.top - base.top);
      if (leans) { vx = vx * 0.72 + (x - lastX) * 0.28; lastX = x; tilt = Math.abs(vx) < 0.15 ? 0 : Math.max(-2.5, Math.min(2.5, vx * 0.3)); }
      const t = table ? `translate3d(${tx}px, ${ty}px, 0)` : `translate3d(${tx}px, ${ty}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${into ? 0.97 : 1.02})`;
      el.style.transform = t;
      for (const c of cells) c.style.transform = t;
    };
    const measure = () => {
      for (const k of still) for (const a of k.getAnimations()) if (a.id === 'arr') a.finish();
      const t = el.style.transform; el.style.transform = '';
      rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      el.style.transform = t; base = rects.get(el)!; dirty = false;
    };
    /** The other columns' cells in rows on screen (they glide when a column changes places). */
    const others = () => {
      const out: HTMLElement[] = [];
      for (const r of rowsOf) { const q = r.getBoundingClientRect(); if (q.bottom < 0 || q.top > innerHeight) continue; for (const c of Array.from(r.children) as HTMLElement[]) if (c !== r.children[at]) out.push(c); }
      return out;
    };
    /** The order `next` on the page, its neighbours gliding from where they were. */
    const settle = (next: HTMLElement[], before: Map<HTMLElement, DOMRect>) => {
      const body = column ? others() : [], was = new Map(body.map((c) => [c, c.getBoundingClientRect()]));
      seq = next; still = seq.filter((k) => k !== el);
      seq.forEach((k, i) => { k.style.order = String(i + 1); });
      if (column) this.mirror(g.parent);
      this.lines(g.parent, seq);
      el.style.transform = '';
      for (const c of cells) c.style.transform = '';
      rects = new Map(seq.map((k) => [k, k.getBoundingClientRect()]));
      base = rects.get(el)!;
      for (const k of still) {
        const a = before.get(k), b = rects.get(k)!;
        if (!a || Math.abs(a.left - b.left) + Math.abs(a.top - b.top) < 1) continue;
        this.glide(k, `translate(${a.left - b.left}px, ${a.top - b.top}px)`, 320);
      }
      for (const c of body) { const a = was.get(c)!, b = c.getBoundingClientRect(); if (Math.abs(a.left - b.left) >= 1) this.glide(c, `translate(${a.left - b.left}px, 0)`, 320); }
    };
    /**
     * A plain wrapper `w` of the group `into` is opened, so the carried thing and the wrapper's own can
     * mix (M166): out of its own row into the page, or into another row.
     */
    const open = (w: HTMLElement, into: Group) => {
      const before = rects;
      const box = core(w);
      // (With the things of rows already opened into it, the carried one among them.)
      const things = held(box).map((k, i) => ({ k, i, o: Number(k.style.order) || 0 })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.k);
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
    const hit = (q: DOMRect, x: number, y: number) => (column ? x >= q.left && x <= q.right : upDown ? y >= q.top && y <= q.bottom : within(q, x, y));
    // M167: resting over a card (a moment, still), and the card makes room inside it for the thing.
    const known = new Map<HTMLElement, boolean>();
    let rest: { host: HTMLElement; x: number; y: number; t: number } | null = null, restTimer = 0;
    const leaveRoom = () => { if (into) { const h = into; into = null; this.seat(h); dirty = true; } };
    // M167: over the other one (the side menu from the page, the page from the menu): a likeness goes with the hand.
    let ghost: HTMLElement | null = null, away: null | (() => void) = null, gx = 0, gy = 0;

    const again = this.follow(e, (x, y) => {
      if (dirty) measure();
      const there = table ? null : this.bridge?.over(this.menu ? 'menu' : 'page', el, x, y) ?? null;
      if (there) {
        away = there;
        if (!ghost) {
          leaveRoom(); rest = null; clearTimeout(restTimer);
          const seen = el.getBoundingClientRect();
          el.style.transform = '';
          // The thing itself stays (a shortcut to it is made there): its group as it was.
          if (!mixed && seq.some((k, i) => k !== seq0[i])) settle(seq0, rects);
          el.classList.add('arr-lent');
          ghost = this.likeness(el, seen); gx = x; gy = y;
        }
        ghost.style.transform = `translate3d(${x - gx}px, ${y - gy}px, 0)`;
        return;
      }
      if (ghost) { ghost.remove(); ghost = null; away = null; el.classList.remove('arr-lent'); measure(); }
      // Carried to the top or bottom edge: the page scrolls under it.
      if (scroller) {
        const s = scroller.getBoundingClientRect(), by = y < s.top + 56 ? -14 : y > s.bottom - 56 ? 14 : 0;
        if (by) { scroller.scrollTop += by; again(); }
      }
      // Carried out of its own row: the row opens into what holds it, and the thing is free among those.
      const home = g.parent;
      // (Whether a row can open is asked once per row, not every frame: it reads the row's style.)
      if (!this.menu && !table && home !== this.root && home !== shut && !opened(home) && !within(home.getBoundingClientRect(), x, y, 12)) {
        shut = home;
        if (plain(home)) {
          // (Through wrappers that only wrap that one row.)
          let top = home;
          while (top.parentElement && top.parentElement !== this.root && plain(top.parentElement) && Array.from(top.parentElement.children).filter(shown).length === 1) top = top.parentElement;
          const up = this.member(top);
          if (up && this.root.contains(up.parent)) open(top, up);
        }
      }
      if (!this.menu && !table) {
        const host = this.hostAt(el, x, y, known);
        if (into && host !== into) leaveRoom();
        if (host && !into) {
          if (!rest || rest.host !== host || Math.hypot(x - rest.x, y - rest.y) > 14) {
            rest = { host, x, y, t: performance.now() };
            clearTimeout(restTimer); restTimer = window.setTimeout(again, DWELL + 30);
          } else if (performance.now() - rest.t >= DWELL) { into = host; this.seat(host, { w: el.offsetWidth, h: el.offsetHeight }); measure(); }
        } else if (!host) { rest = null; clearTimeout(restTimer); }
      }
      if (!into) {
        if (over) { const q = rects.get(over)!; if (!hit(q, x, y)) over = null; }
        const target = still.find((k) => hit(rects.get(k)!, x, y));
        if (target && target !== over) {
          // Over another row of things: it opens, so the carried thing can sit among them.
          if (!this.menu && !table && plain(target) && this.groupOf(core(target))) { open(target, g); place(x, y); again(); return; }
          settle(moved(seq, seq.indexOf(el), seq.indexOf(target)), rects);
          over = target;
        }
      }
      place(x, y);
      // (Still leaning: another frame, so it comes level though the hand has stopped.)
      if (tilt) again();
    }, () => {
      clearTimeout(restTimer);
      document.removeEventListener('scroll', onScroll, true);
      const key = g.keys[g.kids.indexOf(el)];
      const settled = () => { el.classList.remove(lift); for (const c of cells) c.classList.remove('arr-cell'); };
      /** Nothing of this group changed after all: no arrangement is kept for it (the page isn't "arranged" by a move that went nowhere). */
      const pristine = () => fresh && !mixed && !entry.sizes && !entry.maxW && !entry.inside && entry.order.join('\u0000') === g.keys.join('\u0000');
      const keep = () => {
        if (pristine()) { this.layout = this.layout.filter((x) => x !== entry); this.owner.delete(g.parent); this.undoStack.pop(); this.tell(); }
        else this.save();
      };
      if (ghost) {
        // Dropped on the other one: a shortcut is made there; the thing stays where it was.
        const gh = ghost; ghost = null;
        el.classList.remove('arr-lent'); settled();
        entry.order = seq.map((k) => g.keys[g.kids.indexOf(k)]);
        if (wasIn) this.slot(el, wasIn);
        keep();
        away?.();
        gh.animate([{ opacity: 0.96 }, { opacity: 0 }], { duration: 160, easing: 'ease-out' }).finished.catch(() => undefined).finally(() => gh.remove());
        return;
      }
      const seen = el.getBoundingClientRect(), from = el.style.transform;
      el.style.transform = '';
      for (const c of cells) c.style.transform = '';
      entry.order = seq.map((k) => g.keys[g.kids.indexOf(k)]);
      if (into) {
        // Inside the card it rests over: drawn there, its old place closing up around it.
        const host = into, hk = [...this.hosts()].find(([, h]) => h === host)?.[0];
        into = null;
        if (hk) {
          const before = new Map(still.map((k) => [k, k.getBoundingClientRect()]));
          // It leaves the flow: back among its own row's things, so rows it opened on the way close again.
          if (mixed) {
            const rest = seq.filter((k) => k !== el), mates = rest.map((k, i) => (k.parentElement === el.parentElement ? i : -1)).filter((i) => i >= 0);
            const pos = mates.length ? mates[mates.length - 1] + 1 : rest.length;
            seq = [...rest.slice(0, pos), el, ...rest.slice(pos)];
            entry.order = seq.map((k) => g.keys[g.kids.indexOf(k)]);
            this.close(g, entry, seq);
          }
          // Kept with the group it belongs to now (its own row, when that closed again).
          const mine = this.member(el), kept = mine ? this.entryFor(mine) : entry;
          (kept.inside ??= {})[mine ? mine.keys[mine.kids.indexOf(el)] : key] = hk;
          this.slot(el, host);
          const now = el.getBoundingClientRect();
          this.glide(el, `translate3d(${seen.left - now.left}px, ${seen.top - now.top}px, 0) scale(0.97)`, 300).finished.catch(() => undefined).finally(settled);
          for (const k of still) { const a = before.get(k)!, b = k.getBoundingClientRect(); if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) >= 1) this.glide(k, `translate(${a.left - b.left}px, ${a.top - b.top}px)`, 320); }
          this.save();
          return;
        }
        this.seat(host);
      }
      // Out of a card it was in: it is the group's again.
      if (wasIn && entry.inside) { delete entry.inside[key]; if (!Object.keys(entry.inside).length) delete entry.inside; }
      const landed = el.getBoundingClientRect();
      let from2 = from;
      // Rows whose things ended up together again close (only they, and this group, are drawn again).
      if (mixed && this.close(g, entry, seq)) {
        // (Drawn again, the thing may sit a little elsewhere: it glides in from where the hand left it.)
        const now = el.getBoundingClientRect(), m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(from);
        if (m) from2 = `translate3d(${Number(m[1]) + landed.left - now.left}px, ${Number(m[2]) + landed.top - now.top}px, 0) scale(1.02)`;
      }
      keep();
      this.glide(el, from2, 300).finished.catch(() => undefined).finally(settled);
      for (const c of cells) this.glide(c, from, 300);
    });
  }

  /** A likeness of `el` that follows the hand over the other one (the page or the side menu), above everything. */
  private likeness(el: HTMLElement, r: DOMRect): HTMLElement {
    const c = getComputedStyle(el), g = el.cloneNode(true) as HTMLElement;
    for (const n of [g, ...g.querySelectorAll('[id]')]) n.removeAttribute('id');
    g.removeAttribute('style');
    for (const k of Object.keys(g.dataset)) delete g.dataset[k];
    g.classList.remove('arr-drag', 'arr-lent', 'arr-cell');
    g.setAttribute('aria-hidden', 'true');
    g.inert = true;
    const clear = /rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor);
    Object.assign(g.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '300',
      pointerEvents: 'none', boxSizing: 'border-box', color: c.color, font: c.font, background: clear ? 'var(--surface)' : c.backgroundColor,
      borderRadius: c.borderRadius === '0px' ? '12px' : c.borderRadius, boxShadow: '0 22px 44px -14px rgb(0 0 0 / 0.45)', opacity: '0.96', willChange: 'transform', transition: 'none',
    });
    document.body.appendChild(g);
    return g;
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
    // (Down the chain it was opened through, not into a row of its own opened into it.)
    for (let el: HTMLElement | null = w; el && opened(el); el = (Array.from(el.children).find((c) => (c as HTMLElement).dataset.arrOpen === '') as HTMLElement | undefined) ?? null) {
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
    if (calm()) ms = 0;
    try { a = el.animate([{ transform: from }, { transform: 'none' }], { duration: ms, easing: SPRING_GLIDE }); }
    catch { a = el.animate([{ transform: from }, { transform: 'none' }], { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); } // no linear()
    a.id = 'arr';
    return a;
  }

  /**
   * A change of size, eased (M168): from the size the thing has to the one `change` gives it, its
   * neighbours following as the page makes room. Only what changed (width, height) is animated.
   */
  private ease(el: HTMLElement, change: () => void, ms = 240) {
    for (const a of el.getAnimations()) if (a.id === 'arr-size') a.cancel();
    const a0 = el.getBoundingClientRect();
    change();
    const a1 = el.getBoundingClientRect();
    const dw = Math.abs(a0.width - a1.width) >= 1, dh = Math.abs(a0.height - a1.height) >= 1;
    if (calm() || (!dw && !dh)) return;
    const frame = (r: DOMRect) => ({ ...(dw && { width: `${r.width}px` }), ...(dh && { height: `${r.height}px` }) });
    let a: Animation;
    try { a = el.animate([frame(a0), frame(a1)], { duration: ms, easing: SPRING_GLIDE }); }
    catch { a = el.animate([frame(a0), frame(a1)], { duration: ms, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); }
    a.id = 'arr-size';
  }

  /**
   * Pulling a card's edge (M168: smooth). The card follows the hand to the pixel; neighbours pushed to
   * another place (a row wrapping, a grid's columns freed) glide there; let go, it eases to the size
   * kept (a share of its row, 1% steps; columns in a grid; a height in px).
   */
  private resize(el: HTMLElement, g: Group, e: PointerEvent, right: boolean, bottom: boolean) {
    this.remember();
    const entry = this.entryFor(g), key = g.keys[g.kids.indexOf(el)];
    const { grid, gap } = this.ready(g);
    for (const a of el.getAnimations()) if (a.id === 'arr-size') a.finish();
    const p = g.parent, start = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl';
    const size: Size = { ...(entry.sizes?.[key] ?? {}) };
    const html = document.documentElement;
    html.dataset.arrResize = right && bottom ? 'xy' : right ? 'x' : 'y';
    el.classList.add('arr-size');
    const pcs = getComputedStyle(p), pad = (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0);
    const capped = pcs.maxWidth !== 'none', room = (p.parentElement?.clientWidth ?? p.clientWidth);
    const tracks = grid ? pcs.gridTemplateColumns.split(' ') : [], track = parseFloat(tracks[0]) || start.width;
    // The others, by where the page puts them (not where a glide is drawing them): one that jumps glides.
    const others = g.kids.filter((k) => k !== el);
    const spot = (k: HTMLElement) => [k.offsetLeft, k.offsetTop];
    let was = others.map(spot);
    this.follow(e, (x, y) => {
      const seen = others.map((k) => k.getBoundingClientRect());
      if (right) {
        let w = Math.max(80, start.width + (rtl ? e.clientX - x : x - e.clientX));
        if (grid) {
          size.span = Math.max(1, Math.min(tracks.length, Math.round((w + gap) / (track + gap))));
          const span = `span ${size.span}`;
          if (el.style.gridColumn !== span) el.style.gridColumn = span;
          el.style.justifySelf = 'start';
        } else {
          let inner = p.clientWidth - pad;
          // Pulled wider than what holds it: that grows too, up to the room there is.
          if (w > inner + 4 && capped) { entry.maxW = Math.round(Math.min(room, w + pad)); p.style.maxWidth = `${entry.maxW}px`; inner = p.clientWidth - pad; }
          w = Math.min(w, inner);
          el.style.flex = '0 0 auto';
          size.pct = Math.max(8, Math.min(100, Math.round((w / inner) * 100)));
        }
        el.style.width = `${Math.round(w)}px`;
      }
      if (bottom) {
        size.h = Math.max(60, Math.round(start.height + y - e.clientY));
        el.style.height = `${size.h}px`; el.style.overflow = 'auto';
      }
      el.dataset.arrSized = '';
      const now = others.map(spot);
      others.forEach((k, i) => {
        if (Math.abs(now[i][0] - was[i][0]) + Math.abs(now[i][1] - was[i][1]) <= 12) return;
        for (const a of k.getAnimations()) if (a.id === 'arr') a.cancel();
        const q = k.getBoundingClientRect();
        this.glide(k, `translate(${seen[i].left - q.left}px, ${seen[i].top - q.top}px)`, 280);
      });
      was = now;
    }, () => {
      delete html.dataset.arrResize;
      (entry.sizes ??= {})[key] = size;
      // Its size as kept, eased in: a grid card settles to its columns, a row card to its share.
      const others0 = others.map((k) => k.getBoundingClientRect());
      this.ease(el, () => this.size(el, size, grid, gap, p));
      others.forEach((k, i) => { const q = k.getBoundingClientRect(); if (Math.abs(others0[i].left - q.left) + Math.abs(others0[i].top - q.top) > 1) this.glide(k, `translate(${others0[i].left - q.left}px, ${others0[i].top - q.top}px)`, 260); });
      el.classList.remove('arr-size');
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
    const el = hit.el, p = hit.g.parent;
    this.flip(hit.g.kids.filter((k) => k !== el), () => this.ease(el, () => {
      el.style.width = ''; el.style.flex = ''; el.style.gridColumn = ''; el.style.height = ''; el.style.overflow = ''; el.style.justifySelf = '';
      delete el.dataset.arrSized;
      if (entry.maxW) { delete entry.maxW; p.style.maxWidth = ''; }
    }));
    this.save();
  };

  /** `change`, with `els` gliding from where they were to where it puts them (FLIP: transform only). */
  private flip(els: HTMLElement[], change: () => void) {
    const vh = innerHeight, on = els.filter((k) => { const q = k.getBoundingClientRect(); return q.bottom > -200 && q.top < vh + 200; }).slice(0, 120);
    const before = on.map((k) => k.getBoundingClientRect());
    change();
    on.forEach((k, i) => { const q = k.getBoundingClientRect(), dx = before[i].left - q.left, dy = before[i].top - q.top; if (Math.abs(dx) + Math.abs(dy) >= 1) this.glide(k, `translate(${dx}px, ${dy}px)`, 320); });
  }

  /** Keys: Alt + Shift + arrows move the focused thing, with Ctrl as well they resize a card; Ctrl/⌘ + Z takes a change back. */
  private key = (e: KeyboardEvent) => {
    const at = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const typing = at?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .ProseMirror');
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (!this.undoStack.length || typing) return;
      e.preventDefault(); e.stopPropagation(); this.undo();
      return;
    }
    // M168: Ctrl/⌘ + Shift + Z (or Ctrl + Y) makes again what was taken back.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ((e.shiftKey && e.key.toLowerCase() === 'z') || (!e.shiftKey && e.key.toLowerCase() === 'y'))) {
      if (!this.redoStack.length || typing) return;
      e.preventDefault(); e.stopPropagation(); this.redo();
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
      this.flip(g.kids.filter((x) => x !== el), () => this.ease(el, () => this.size(el, size, grid, gap, g.parent)));
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
