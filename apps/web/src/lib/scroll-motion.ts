import { EASE_GLIDE, reducedMotion } from './page-transition';

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

function countUp(el: Element) {
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
    h.animate([{ transform: 'scaleX(0)', transformOrigin: rtl ? 'right center' : 'left center' }, { transform: 'scaleX(1)', transformOrigin: rtl ? 'right center' : 'left center' }], { duration: 1000, easing: EASE_GLIDE, delay: 120 });
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
const queued: Element[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const CARD = '.panel, .card, .card-hover';

/**
 * The light under the pointer (computers with a mouse or trackpad): one listener for the page,
 * at most once a frame; only cards without a background picture of their own take it.
 */
function startSheen(): () => void {
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return () => {};
  let lit: HTMLElement | null = null, x = 0, y = 0, frame = 0;
  const off = () => { lit?.classList.remove('sheen'); lit = null; };
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
    const card = (e.target as Element | null)?.closest?.(CARD) as HTMLElement | null;
    if (card !== lit) {
      off();
      if (card && !card.closest(SKIP) && (card.classList.contains('sheen') || getComputedStyle(card).backgroundImage === 'none')) { lit = card; card.classList.add('sheen'); }
    }
    if (lit && !frame) frame = requestAnimationFrame(paint);
  };
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', off);
  return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', off); off(); };
}

let stopSheen: (() => void) | null = null;

/**
 * A figure whose value changes on screen (live numbers, a filter applied) rolls into its new value
 * out of a short blur, like a ticker. Not the first value (that counts up) and not plain text.
 */
function rollChanged(records: MutationRecord[]) {
  const done = new Set<Element>();
  for (const rec of records) {
    const node = rec.type === 'characterData' ? rec.target : rec.addedNodes[0];
    if (!node || node.nodeType !== Node.TEXT_NODE || writing.has(node)) continue;
    const el = node.parentElement;
    if (!el || done.has(el) || !el.matches(FIGURE) || !seen.has(el) || el.closest(SKIP) || !parseFigure(node.nodeValue ?? '')) continue;
    done.add(el);
    const inline = getComputedStyle(el).display === 'inline';
    el.animate(inline ? [{ opacity: 0.25, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }] : [{ opacity: 0.25, filter: 'blur(3px)', transform: 'translate3d(0, 0.35em, 0)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 420, easing: EASE_GLIDE });
  }
}

/** Starts scroll motion for the whole app (once). Returns a stop function. */
export function startScrollMotion(): () => void {
  if (typeof window === 'undefined' || mo || reducedMotion()) return () => {};
  stopSheen = startSheen();
  const flush = () => {
    timer = null;
    const roots = queued.splice(0, 40);
    for (const r of roots) if (r.isConnected) scan(r);
  };
  mo = new MutationObserver((records) => {
    for (const rec of records) for (const n of rec.addedNodes) if (n.nodeType === Node.ELEMENT_NODE && queued.length < 200) queued.push(n as Element);
    if (queued.length && !timer) timer = setTimeout(flush, 120);
    if (!reducedMotion()) rollChanged(records);
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document);
  return () => { mo?.disconnect(); mo = null; io?.disconnect(); io = null; stopSheen?.(); stopSheen = null; };
}
