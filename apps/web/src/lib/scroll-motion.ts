import { EASE_GLIDE, pageJustEntered, reducedMotion } from './page-transition';

// Scroll motion on every page (S4, like the "Relay" site the owner sent): blocks below the fold
// rise into place as they scroll into view, big numbers count up, thin progress bars fill and line
// charts draw themselves, once each. Nothing to add to a page: one IntersectionObserver finds the
// parts by their classes (cards, panels, sections; `tabular-nums` figures; `rounded-full
// overflow-hidden` bar tracks; chart SVGs), and a MutationObserver catches parts that arrive later.
// Transform and opacity only (the GPU does the work), nothing for "Reduce Motion", nothing printed.
// Opt out with data-no-motion on any container; opt in an element with data-reveal.
// M1: figures, bars and lines play on every page, not only below the fold, and on computers a soft
// light follows the pointer over cards (.sheen in globals.css). M3: grids of small squares
// (heatmaps, bins, seats) fill in one by one, and a figure that changes rolls into its new value.
// M130: content replacing a loading placeholder, and a row added to a list, glide in (`arrive`).

const BLOCK = 'section, article, .panel, .card, [data-reveal], [class*="rounded-2xl"], [class*="rounded-3xl"]';
const SKIP = '[data-no-motion], [role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"], .stagger, nav, header, footer, table, form, .fixed, .sticky, [data-page-skeleton], [role="status"]';
const FIGURE = '.tabular-nums';
const BAR = '[class*="rounded-full"][class*="overflow-hidden"] > [style*="width"]:not(.bar-grow):not(img)';
const LINE = 'svg path, svg polyline';
const MAX_PER_SCAN = 160;
/** Heatmaps and seat or bin grids: many small squares filling in one by one (M3, the "Cadra" reel). */
const CELLS = '[data-cells], [class*="grid-cols-"], [class*="flex-wrap"]';
const isCellGrid = (el: Element) => {
  if (el.childElementCount < 20) return false;
  const kids = Array.from(el.children).slice(0, 3);
  return kids.every((k) => { const r = k.getBoundingClientRect(); return r.width > 0 && r.width <= 28 && r.height <= 28 && Math.abs(r.width - r.height) <= 6; });
};
/** Text nodes this file is writing to (a count-up), so its own changes aren't taken for new values. */
const writing = new WeakSet<Node>();

type Kind = 'block' | 'figure' | 'bar' | 'line' | 'cells';
const kinds = new WeakMap<Element, Kind>();
const seen = new WeakSet<Element>();
let io: IntersectionObserver | null = null;

/** A number shown as text: "1,412", "96.6%", "₹2,300", "+15", "3 / 10" not (two numbers). */
export function parseFigure(text: string): { prefix: string; value: number; decimals: number; group: string; suffix: string } | null {
  const m = /^(\D{0,3}?)(-?\d{1,3}(?:([,.   ])\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)(\D{0,4})$/.exec(text.trim());
  if (!m) return null;
  const [, prefix, num, group = '', suffix] = m;
  if (/\d/.test(prefix) || /\d/.test(suffix)) return null;
  const decimalSep = group === ',' ? '.' : group === '.' ? ',' : /[.,]\d{1,2}$/.test(num) ? num.match(/([.,])\d{1,2}$/)![1] : '.';
  const [int, frac = ''] = num.split(decimalSep);
  const value = Number(int.replace(/[^\d-]/g, '') + (frac ? `.${frac}` : ''));
  if (!Number.isFinite(value) || Math.abs(value) < 2 || Math.abs(value) > 1e9) return null;
  // A year ("2026") isn't a quantity: counting it up from 0 would look odd.
  if (!group && !frac && !prefix && !suffix && value >= 1900 && value <= 2100) return null;
  return { prefix, value, decimals: frac.length, group, suffix };
}

/** The figure written as the page wrote it, at value `v`. */
export function formatFigure(f: NonNullable<ReturnType<typeof parseFigure>>, v: number): string {
  const fixed = Math.abs(v).toFixed(f.decimals);
  const [int, frac] = fixed.split('.');
  const grouped = f.group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, f.group) : int;
  const decimal = f.group === '.' ? ',' : '.';
  return `${f.prefix}${v < 0 ? '-' : ''}${grouped}${frac ? decimal + frac : ''}${f.suffix}`;
}

// M98: React must have taken over a figure before it's rewritten, or the page's hydration finds
// different text (React error #418, seen on Green and Play when the count started first).
// shortcut: React's own marker on a hydrated node (`__reactFiber$…`); no public way to ask.
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith('__reactFiber$'));
function countUp(el: Element, tries = 0) {
  if (!hydrated(el)) { if (tries < 8) setTimeout(() => countUp(el, tries + 1), 250); return; }
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) return;
  const text = node.nodeValue ?? '';
  const f = parseFigure(text);
  if (!f) return;
  const start = performance.now(), duration = 1100;
  let written = formatFigure(f, 0);
  writing.add(node);
  node.nodeValue = written;
  const step = (now: number) => {
    // React changed the number meanwhile: leave its value alone.
    if (node.nodeValue !== written) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    written = t === 1 ? text : formatFigure(f, f.value * eased);
    node.nodeValue = written;
    if (t < 1) requestAnimationFrame(step);
    else setTimeout(() => writing.delete(node));
  };
  requestAnimationFrame(step);
}

function play(el: Element, kind: Kind) {
  const h = el as HTMLElement;
  if (kind === 'block') {
    h.dataset.sr = 'in';
    const done = () => { delete h.dataset.sr; };
    h.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 1200);
  } else if (kind === 'figure') {
    countUp(el);
  } else if (kind === 'bar') {
    const rtl = getComputedStyle(h).direction === 'rtl';
    h.animate([{ transform: 'scaleX(0)', transformOrigin: rtl ? 'right center' : 'left center' }, { transform: 'scaleX(1)', transformOrigin: rtl ? 'right center' : 'left center' }], { duration: 1000, easing: EASE_GLIDE, delay: 120 })
      // Filled: a glint of light runs along it now and then (M11).
      .finished.then(() => h.classList.add('bar-glint'), () => {});
  } else if (kind === 'cells') {
    Array.from(el.children).slice(0, 400).forEach((c, i) => {
      if (typeof (c as HTMLElement).animate === 'function') c.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(i * 5, 1000), easing: EASE_GLIDE, fill: 'backwards' });
    });
  } else {
    const path = el as SVGGeometryElement;
    let length = 0;
    try { length = path.getTotalLength(); } catch { /* not drawn (hidden) */ }
    if (length > 0) path.animate([{ strokeDasharray: `${length}`, strokeDashoffset: `${length}` }, { strokeDasharray: `${length}`, strokeDashoffset: '0' }], { duration: 1300, easing: EASE_GLIDE, delay: 100 });
  }
}

function observer() {
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io!.unobserve(e.target);
        const kind = kinds.get(e.target);
        if (kind) play(e.target, kind);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  return io;
}

/** Outermost blocks only: a card inside a card rises with its parent. */
const outermost = (el: Element) => !el.parentElement?.closest('[data-sr]');

/** Finds the parts under `root` that start below the screen and gets them ready. */
export function scan(root: ParentNode = document) {
  if (typeof window === 'undefined' || reducedMotion() || !('IntersectionObserver' in window)) return;
  const fold = window.innerHeight;
  const found: [Element, Kind][] = [];
  const take = (selector: string, kind: Kind, ok: (el: Element) => boolean = () => true) => {
    for (const el of root.querySelectorAll(selector)) {
      if (found.length >= MAX_PER_SCAN) return;
      if (seen.has(el) || el.closest(SKIP) || !ok(el)) continue;
      seen.add(el);
      found.push([el, kind]);
    }
  };
  take(BLOCK, 'block');
  take(FIGURE, 'figure', (el) => el.childNodes.length === 1 && !!parseFigure(el.textContent ?? ''));
  take(BAR, 'bar');
  take(CELLS, 'cells', isCellGrid);
  take(LINE, 'line', (el) => {
    const svg = (el as SVGElement).ownerSVGElement;
    const w = svg?.viewBox?.baseVal?.width ?? 0;
    return !!svg && !svg.classList.contains('lucide') && w >= 60 && el.getAttribute('fill') === 'none' && !!el.getAttribute('stroke');
  });
  if (!found.length) return;
  // Reads first (one layout), then writes. Blocks move only if still below the screen (the page's
  // entrance brings in the rest); figures, bars and lines play wherever they are, on every page.
  const below = found.filter(([el, kind]) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && (kind !== 'block' || r.top > fold);
  });
  const o = observer();
  for (const [el, kind] of below) {
    if (kind === 'block' && !outermost(el)) continue;
    kinds.set(el, kind);
    if (kind === 'block') (el as HTMLElement).dataset.sr = 'wait';
    o.observe(el);
  }
}

let mo: MutationObserver | null = null;
let frame = 0;
const pending: MutationRecord[] = [];
const queued: Element[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const CARD = '.panel, .card, .card-hover';
// Cards in the app are often plain bordered, rounded boxes (no .panel/.card class): those count too
// when they're big enough to be a card (not a chip or a field).
const BOX = '[class*="rounded-2xl"][class*="border"], [class*="rounded-3xl"][class*="border"], [class*="rounded-[2"][class*="border"]';
function cardOf(el: Element | null): HTMLElement | null {
  const c = el?.closest?.(CARD) as HTMLElement | null;
  if (c) return c;
  let n = el?.closest?.(BOX) as HTMLElement | null;
  for (let i = 0; n && i < 4; i++) {
    const r = n.getBoundingClientRect();
    if (r.width >= 160 && r.height >= 72 && !n.matches('input, textarea, select')) return n;
    n = n.parentElement?.closest(BOX) as HTMLElement | null;
  }
  return null;
}
/**
 * The light under the pointer (computers with a mouse or trackpad): one listener for the page,
 * at most once a frame; only cards without a background picture of their own take it.
 */
function startSheen(): () => void {
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return () => {};
  let lit: HTMLElement | null = null, x = 0, y = 0, frame = 0;
  const off = () => { if (lit) lit.classList.remove('sheen'); lit = null; };
  const paint = () => {
    frame = 0;
    if (!lit) return;
    const r = lit.getBoundingClientRect();
    lit.style.setProperty('--mx', `${x - r.left}px`);
    lit.style.setProperty('--my', `${y - r.top}px`);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    // M335: no light over a map or a canvas: it repainted the whole map card's background on every move of a drag.
    const over = e.target as Element | null;
    const card = over?.closest?.('canvas, .maplibregl-map') ? null : cardOf(over);
    if (card !== lit) {
      off();
      if (card && !card.closest(SKIP) && (card.classList.contains('sheen') || getComputedStyle(card).backgroundImage === 'none')) {
        lit = card;
        card.classList.add('sheen');
      }
    }
    if (lit && !frame) frame = requestAnimationFrame(paint);
  };
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', off);
  return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', off); off(); };
}

let stopSheen: (() => void) | null = null;
let stopScrolling: (() => void) | null = null;

/**
 * A figure whose value changes on screen (live numbers, a filter applied) rolls into its new value,
 * like a ticker. Not the first value (that counts up) and not plain text.
 */
// M98: a figure that changes twice within 250 ms is animating itself (a counter writing every frame, a
// stopwatch): it's left alone from then on. Before, each frame of the Trace board's and the console's
// counters started its own roll (about 28 a second), most of the Trace board's jerky frames.
const lastChange = new WeakMap<Element, number>();
const selfMoving = new WeakSet<Element>();
function rollChanged(records: MutationRecord[]) {
  const done = new Set<Element>();
  const now = performance.now();
  for (const rec of records) {
    const node = rec.type === 'characterData' ? rec.target : rec.addedNodes[0];
    if (!node || node.nodeType !== Node.TEXT_NODE || writing.has(node)) continue;
    const el = node.parentElement;
    if (!el || done.has(el) || selfMoving.has(el) || !el.matches(FIGURE)) continue;
    const prev = lastChange.get(el);
    lastChange.set(el, now);
    if (prev !== undefined && now - prev < 250) { selfMoving.add(el); continue; }
    if (!seen.has(el) || el.closest(SKIP) || !parseFigure(node.nodeValue ?? '')) continue;
    done.add(el);
    const inline = getComputedStyle(el).display === 'inline';
    // Opacity and a small rise only (no blur: a blur repaints the figure every frame).
    el.animate(inline ? [{ opacity: 0.25 }, { opacity: 1 }] : [{ opacity: 0.25, transform: 'translate3d(0, 0.35em, 0)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE_GLIDE });
  }
}

/** Starts scroll motion for the whole app (once). Returns a stop function. */
const LOADING = '.skeleton, [aria-busy="true"], [role="status"][aria-label="Loading"]';
const LIST = 'ul, ol, tbody, [role="list"], [role="feed"], [role="log"]';
/** A page's frame, which the loading view (app/(dashboard)/loading.tsx) already showed: not an arrival. */
const FRAME = '[data-steady], [data-bar], .app-topbar';

/** Already moving: a part of the page's entrance (WAAPI, PendingPage runs it first), its own CSS
 *  animation (a message's arrival) or framer-motion (inline opacity / transform while it plays). */
function moving(el: HTMLElement) {
  if (el.style.opacity || el.style.transform || el.getAnimations().length) return true;
  // A few levels up is where an entrance runs (the page, a card); the whole way up cost a slow phone dearly.
  let up = 0;
  for (let p = el.parentElement; p && p !== document.body && up < 6; p = p.parentElement, up++) if (p.getAnimations().some((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))) return true;
  return false;
}

/** M211: inside a part that opted out ([data-no-motion]) or is skipped: changes there aren't arrivals.
 *  Kept per node, since the same busy containers (a scene, a ticking counter) change again and again. */
const quietOf = new WeakMap<Node, boolean>();
function quiet(n: Node) {
  let q = quietOf.get(n);
  if (q === undefined) { const el = n instanceof Element ? n : n.parentElement; q = !el || !!el.closest('[data-no-motion]'); quietOf.set(n, q); }
  return q;
}

/**
 * M130: what replaces a loading placeholder glides in (it popped in once the page's entrance was
 * over), and one to three rows added to a list that's already there glide in too (a task you add, a
 * reply). A big arrival (a whole dashboard) brings in its blocks one after another, as the page's
 * entrance does. Only on screen (below it the scroll reveal takes over), at most 8, 40 ms apart;
 * transform and opacity only (the compositor runs it). Rows that only moved (a sort) stay still.
 */
function arrive(records: MutationRecord[]) {
  const lost = new Set<Node>(), removed = new Set<Node>(), added = new Map<Element, HTMLElement[]>();
  for (const rec of records) {
    if (rec.type !== 'childList' || quiet(rec.target)) continue;
    for (const n of rec.removedNodes) {
      removed.add(n);
      if (n instanceof Element && (n.matches(LOADING) || n.querySelector(LOADING))) lost.add(rec.target);
    }
    if (!(rec.target instanceof Element)) continue;
    // Pushed, not copied: a page's first render adds thousands of nodes at once (the copy was quadratic,
    // half a second of a slow phone's start, M211).
    let list = added.get(rec.target);
    for (const n of rec.addedNodes) if (n instanceof HTMLElement) { if (!list) added.set(rec.target, (list = [])); list.push(n); }
  }
  // M231: nothing added (a figure counting up rewrites its text every frame): done before anything is measured.
  // Reading the window's height forces a layout, which ran every frame of every page's count-up.
  if (!added.size) return;
  let fold = 0;
  const parts: HTMLElement[] = [];
  for (const [target, els] of added) {
    if (els.some((el) => removed.has(el))) continue; // moved, not new
    const grew = target.matches(LIST) && els.length <= 3 && target.children.length > els.length;
    if (!lost.has(target) && !grew) continue;
    for (const el of els) {
      if (el.matches(LOADING) || el.closest('[data-no-motion]')) continue;
      fold ||= window.innerHeight;
      const big = el.getBoundingClientRect().height > fold * 0.6 && el.children.length > 1;
      // M234: the page's frame (its bar and row of tabs, drawn already by the loading view) stays still.
      parts.push(...(big ? (Array.from(el.children) as HTMLElement[]) : [el]).filter((p) => !p.matches(FRAME)));
    }
  }
  // Reads first (one layout), then the writes.
  const shown = parts.filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top < fold && r.bottom > 0 && !moving(el); }).slice(0, 8);
  shown.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: i * 40, easing: EASE_GLIDE, fill: 'backwards' }));
  opened(added, removed, new Set(parts));
}

/** M351 (the owner, 20 Nov: "every button when i click… when it try to open something… smooth animations", "every
 *  where in the project"): what a press opens eases in, everywhere, unless it already moves on its own (its own CSS
 *  animation, framer-motion, WAAPI: `moving`), so nothing plays twice: a floating part (a menu, a drop-down, a pop-up)
 *  grows from where it was pressed, 0.96 to full size while it fades in; a part in the page's flow (a section that
 *  opens, a tab's content) fades in rising 8 px. Only what's on screen, at most 6 at once.
 *  M355 (the owner, 20 Nov: "slow openings… please work on this"): anything within 0.8 s of the press; and up to 4 s
 *  after it (what waited for its data), a floating part, or a part inside what the press opened, what its button
 *  controls (aria-controls) or the part of the page the button sits in (its card, section, dialog, row). */
type Press = { t: number; x: number; y: number; near: Element | null; controls: Element | null; roots: HTMLElement[] };
let press: Press = { t: -1e9, x: 0, y: 0, near: null, controls: null, roots: [] };
const NEAR = '[role="dialog"], [role="tabpanel"], [role="region"], section, article, li, form, aside, .card, .panel';
function pressed(e: Event) {
  let x: number, y: number;
  const from = (e instanceof KeyboardEvent ? document.activeElement : e.target) as Element | null;
  if (e instanceof KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = (from as HTMLElement | null)?.getBoundingClientRect();
    x = r ? r.left + r.width / 2 : innerWidth / 2; y = r ? r.top + r.height / 2 : innerHeight / 2;
  } else if (e instanceof PointerEvent) { x = e.clientX; y = e.clientY; } else return;
  const button = from?.closest?.('button, a, summary, [role="button"], [role="tab"], [aria-expanded]') ?? null;
  const id = button?.getAttribute('aria-controls');
  press = { t: performance.now(), x, y, near: button?.closest(NEAR) ?? null, controls: id ? document.getElementById(id) : null, roots: [] };
}
/** Whether a part that appeared a while after the press (its data arrived) still belongs to it. */
function linked(el: HTMLElement, float: boolean) {
  if (float) return true;
  const inside = (c: Element | null) => !!c && c.isConnected && c !== el && c.contains(el);
  return inside(press.controls) || inside(press.near) || press.roots.some(inside);
}
/** Where a floating part grows from: the press, inside the part (its nearest edge when the press was outside). */
export function pressOrigin(r: { left: number; top: number; width: number; height: number }, x: number, y: number) {
  const ox = Math.min(r.width, Math.max(0, x - r.left)), oy = Math.min(r.height, Math.max(0, y - r.top));
  return `${Math.round(ox)}px ${Math.round(oy)}px`;
}
/** Toasts, the page's frame and loading views have their own motion. */
const OPENED_SKIP = `${LOADING}, ${FRAME}, [data-sonner-toaster], [data-sonner-toast], .backdrop-in`;
function opened(added: Map<Element, HTMLElement[]>, removed: Set<Node>, done: Set<HTMLElement>) {
  const since = performance.now() - press.t;
  if (since > 4000) return;
  const out: HTMLElement[] = [];
  for (const [, els] of added) {
    // A list redrawn (a filter, a sort) is not something opened: morph() and the rows' own motion handle it.
    if (els.length > 12 || els.some((el) => removed.has(el))) continue;
    for (const el of els) if (!done.has(el) && !el.matches(OPENED_SKIP) && !el.closest('[data-no-motion]')) out.push(el);
  }
  if (!out.length) return;
  const fold = window.innerHeight;
  // Reads first (one layout), then the writes.
  const shown = out.slice(0, 40).map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.height > 0 && r.top < fold && r.bottom > 0 && !moving(el) && !out.some((o) => o !== el && o.contains(el)))
    .map((x) => ({ ...x, float: ['absolute', 'fixed'].includes(getComputedStyle(x.el).position) }))
    .filter((x) => since <= 800 || linked(x.el, x.float)).slice(0, 6);
  for (const { el, r, float } of shown) {
    press.roots.push(el);
    if (float) {
      // Two animations: the scale adds to the part's own transform (a centring one stays), the fade sets the origin.
      el.animate([{ transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 220, easing: EASE_GLIDE, composite: 'add' });
      el.animate([{ opacity: 0, transformOrigin: pressOrigin(r, press.x, press.y) }, { opacity: 1, transformOrigin: pressOrigin(r, press.x, press.y) }], { duration: 180, easing: 'ease-out' });
    } else {
      el.animate([{ transform: 'translate3d(0, 8px, 0)' }, { transform: 'translate3d(0, 0, 0)' }], { duration: 260, easing: EASE_GLIDE, composite: 'add' });
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
  }
}

/** M355: a big arrival after a press: only its top parts (those not inside another part that arrived) are looked at. */
function openedBig(records: MutationRecord[]) {
  const all = new Set<Node>(), removed = new Set<Node>();
  for (const rec of records) { for (const n of rec.addedNodes) all.add(n); for (const n of rec.removedNodes) removed.add(n); }
  const added = new Map<Element, HTMLElement[]>();
  for (const n of all) {
    if (!(n instanceof HTMLElement) || !n.parentElement) continue;
    let top = true;
    for (let p: Node | null = n.parentNode, up = 0; p && up < 40; p = p.parentNode, up++) if (all.has(p)) { top = false; break; }
    if (!top) continue;
    const list = added.get(n.parentElement) ?? [];
    list.push(n); added.set(n.parentElement, list);
    if (added.size > 30) break;
  }
  opened(added, removed, new Set());
}

export function startScrollMotion(): () => void {
  if (typeof window === 'undefined' || mo || reducedMotion()) return () => {};
  stopSheen = startSheen();
  const flush = () => {
    timer = null;
    // A part inside another queued part is scanned with it (M211: big arrivals queued both).
    const roots = queued.splice(0, 40).filter((r, _, all) => r.isConnected && !all.some((o) => o !== r && o.contains(r)));
    for (const r of roots) scan(r);
  };
  mo = new MutationObserver((all) => {
    // Busy parts that opted out (scenes, typewriters, live counters) change many times a second: drop
    // their changes first, before anything is measured (M211).
    const records = all.filter((rec) => !quiet(rec.target));
    if (!records.length) return;
    for (const rec of records) for (const n of rec.addedNodes) if (n.nodeType === Node.ELEMENT_NODE && queued.length < 200) queued.push(n as Element);
    if (queued.length && !timer) timer = setTimeout(flush, 120);
    // A whole page building at once (hundreds of changes) is no row arriving: the page's own entrance
    // moves it. Small arrivals are looked at just before the next frame is drawn, when the browser lays
    // the page out anyway, not in the middle of React's work (0.4 s of a slow phone's start, M211).
    if (reducedMotion()) return;
    // M355: a big opening (a panel of hundreds of parts after a press) is no page building: its top parts ease in.
    if (records.length > 300) { if (performance.now() - press.t < 4000) requestAnimationFrame(() => { if (!pageJustEntered()) openedBig(records); }); return; }
    if (pending.length + records.length > 300) { pending.length = 0; return; } // many small batches add up to a page
    pending.push(...records);
    // M231: a page that just came in is moved by its own entrance (PendingPage): looking through the old and new
    // page for arrivals was 55 ms of script on every page change (even on a computer), for nothing.
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; const r = pending.splice(0); if (pageJustEntered()) return; rollChanged(r); arrive(r); });
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('pointerdown', pressed, { capture: true, passive: true });
  document.addEventListener('keydown', pressed, { capture: true, passive: true });
  scan(document);
  // M96: <html data-scrolling> while anything scrolls (and 180 ms after), so decorative loops (drifting
  // glows, bar glints, pings) rest meanwhile and the phone only moves the page (globals.css).
  const root = document.documentElement;
  let idle: ReturnType<typeof setTimeout> | null = null;
  const settle = () => { idle = null; delete root.dataset.scrolling; };
  const onScroll = () => { if (idle) clearTimeout(idle); else root.dataset.scrolling = ''; idle = setTimeout(settle, 180); };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  stopScrolling = () => { document.removeEventListener('scroll', onScroll, { capture: true }); if (idle) clearTimeout(idle); settle(); };
  return () => { document.removeEventListener('pointerdown', pressed, { capture: true }); document.removeEventListener('keydown', pressed, { capture: true }); mo?.disconnect(); mo = null; cancelAnimationFrame(frame); frame = 0; pending.length = 0; io?.disconnect(); io = null; stopSheen?.(); stopSheen = null; stopScrolling?.(); stopScrolling = null; };
}
