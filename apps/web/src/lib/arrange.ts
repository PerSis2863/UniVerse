// M165: "Arrange this page" (the owner, 12 Nov 2026: "resize… change its locations just by dragging…
// in every page… even with the buttons"). The pure part: what is kept (per person, per page, on this
// device) and how a saved order meets the page as it is now. The DOM part is arrange-dom.ts.
//
// A page isn't described anywhere, so things are known by what they say: a card by its label or heading,
// a button by its text. A saved group (`Entry`) lists those names in the order chosen; it belongs to
// whichever container on the page holds at least two of them.

export interface Size {
  /** Width as a share of its row (20–100), for rows and stacks. */
  pct?: number;
  /** Width as grid columns spanned, in a grid. */
  span?: number;
  /** Height in px. */
  h?: number;
}
export interface Entry {
  order: string[];
  sizes?: Record<string, Size>;
  /** The container's own widest width in px, when a card was pulled wider than it. */
  maxW?: number;
  /** M166: plain wrappers (by name) opened into this group, so their things and this group's mix. */
  open?: string[];
  /** M167: things of this group (by name) dropped inside a card with a look of its own (by its key: `hostKeys`). */
  inside?: Record<string, string>;
}
/** M167: a shortcut a person dragged in: onto a page from the side menu, or onto the menu from a page. */
export interface Pin { href: string; label: string }
/** Where shortcuts are kept: the side menu's (one for every app), and each page's. */
export const MENU_PINS = '/~pins/menu';
export const pagePins = (path: string) => `/~pins${path}`;
const MAX_PINS = 12;
/** One page's groups. */
export type PageLayout = Entry[];
export type Store = Record<string, PageLayout>;

const MAX_PAGES = 150, MAX_ENTRIES = 30, MAX_KEYS = 60;

/** A name fit to be a key: one line, trimmed, 60 characters. */
export const cleanKey = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Names made unique in their group: the second "Open" is "Open #2". */
export function uniqueKeys(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n, i) => {
    const base = n || `#${i + 1}`, c = (seen.get(base) ?? 0) + 1;
    seen.set(base, c);
    return c === 1 ? base : `${base} #${c}`;
  });
}

/** How many of a container's names a saved group knows. */
export const overlap = (entry: Entry, keys: string[]) => { const s = new Set(entry.order); return keys.filter((k) => s.has(k)).length; };

/**
 * The order to show: the names saved, in the order saved, with the ones the page has that weren't there
 * when it was saved kept next to what they follow on the page (a new card doesn't jump to the end).
 */
export function arranged(saved: string[], now: string[]): string[] {
  const here = new Set(now), known = new Set(saved);
  const out = saved.filter((k) => here.has(k));
  now.forEach((k, i) => {
    if (known.has(k)) return;
    // After the nearest earlier neighbour that is placed; at the front when there is none.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const p = out.indexOf(now[j]); if (p >= 0) { at = p + 1; break; } }
    out.splice(at, 0, k);
  });
  return out;
}

/** `keys` with the one at `from` moved to sit at `to`. */
export function moved<T>(keys: T[], from: number, to: number): T[] {
  const out = keys.slice();
  const [k] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, k);
  return out;
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined);

/** A store read from the device: anything odd is dropped, so a damaged copy can't break a page. */
export function cleanStore(raw: unknown): Store {
  const out: Store = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [path, list] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_PAGES)) {
    if (!path.startsWith('/') || path.length > 200 || !Array.isArray(list)) continue;
    const entries: Entry[] = [];
    for (const e of list.slice(0, MAX_ENTRIES)) {
      if (!e || typeof e !== 'object') continue;
      const { order, sizes, maxW } = e as { order?: unknown; sizes?: unknown; maxW?: unknown };
      if (!Array.isArray(order)) continue;
      const keys = order.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 64).slice(0, MAX_KEYS);
      if (keys.length < 1) continue;
      const entry: Entry = { order: keys };
      if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
        const s: Record<string, Size> = {};
        for (const [k, v] of Object.entries(sizes as Record<string, unknown>).slice(0, MAX_KEYS)) {
          if (!v || typeof v !== 'object') continue;
          const z = v as Record<string, unknown>, size: Size = {};
          const pct = num(z.pct, 8, 100), span = num(z.span, 1, 12), h = num(z.h, 60, 4000);
          if (pct !== undefined) size.pct = pct;
          if (span !== undefined) size.span = span;
          if (h !== undefined) size.h = h;
          if (Object.keys(size).length) s[k] = size;
        }
        if (Object.keys(s).length) entry.sizes = s;
      }
      const w = num(maxW, 320, 4000);
      if (w !== undefined) entry.maxW = w;
      const open = (e as { open?: unknown }).open;
      if (Array.isArray(open)) { const o = open.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 64).slice(0, 12); if (o.length) entry.open = o; }
      const inside = (e as { inside?: unknown }).inside;
      if (inside && typeof inside === 'object' && !Array.isArray(inside)) {
        const i = Object.entries(inside as Record<string, unknown>).filter((x): x is [string, string] => x[0].length > 0 && x[0].length <= 64 && typeof x[1] === 'string' && x[1].length > 0 && x[1].length <= 64).slice(0, 12);
        if (i.length) entry.inside = Object.fromEntries(i);
      }
      entries.push(entry);
    }
    if (entries.length) out[path] = entries;
  }
  return out;
}

// ── M166: what is kept, with the time each page was last changed, so two devices can be joined ──

/**
 * Everything a person arranged: each page's groups, their shortcuts (M167, by `MENU_PINS` / `pagePins`),
 * and when each was last changed (ms; a page put back keeps its time with nothing in it).
 */
export interface Doc { store: Store; at: Record<string, number>; pins: Record<string, Pin[]> }
export const emptyDoc = (): Doc => ({ store: {}, at: {}, pins: {} });

/** A shortcut fit to keep: a page of this site (a path, never another site or a script), and a short name. */
export function cleanPin(raw: unknown): Pin | null {
  if (!raw || typeof raw !== 'object') return null;
  const { href, label } = raw as { href?: unknown; label?: unknown };
  if (typeof href !== 'string' || !/^\/(?![/\\])[^\s<>"'`\\]{0,299}$/.test(href)) return null;
  const name = cleanKey(typeof label === 'string' ? label : '');
  return name ? { href, label: name } : null;
}
export function cleanPins(raw: unknown): Record<string, Pin[]> {
  const out: Record<string, Pin[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, list] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_PAGES)) {
    if (!key.startsWith('/~pins/') || key.length > 210 || !Array.isArray(list)) continue;
    const seen = new Set<string>(), pins: Pin[] = [];
    for (const p of list.slice(0, MAX_PINS * 2)) { const c = cleanPin(p); if (c && !seen.has(c.href) && pins.length < MAX_PINS) { seen.add(c.href); pins.push(c); } }
    if (pins.length) out[key] = pins;
  }
  return out;
}
/** The most a saved copy may weigh as JSON (the server refuses more). */
export const MAX_DOC_BYTES = 200_000;

export function cleanDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDoc();
  const r = raw as { store?: unknown; at?: unknown; pins?: unknown };
  // The first version kept the pages alone.
  const store = cleanStore('store' in r || 'at' in r ? r.store : raw);
  const at: Record<string, number> = {};
  if (r.at && typeof r.at === 'object' && !Array.isArray(r.at)) {
    const times = Object.entries(r.at as Record<string, unknown>)
      .filter((e): e is [string, number] => e[0].startsWith('/') && e[0].length <= 200 && typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, MAX_PAGES * 2);
    for (const [k, v] of times) at[k] = Math.round(v);
  }
  return { store, at, pins: cleanPins(r.pins) };
}

/** Two copies joined: page by page, the one changed last wins (a page put back later stays put back). */
export function mergeDocs(a: Doc, b: Doc): Doc {
  const out = emptyDoc();
  const keys = [a, b].flatMap((d) => [...Object.keys(d.at), ...Object.keys(d.store), ...Object.keys(d.pins)]);
  for (const path of new Set(keys)) {
    const ta = a.at[path] ?? 0, tb = b.at[path] ?? 0;
    // The same moment (or none known): whichever has something; both: always the same one, whoever asks.
    const ja = JSON.stringify([a.store[path] ?? [], a.pins[path] ?? []]), jb = JSON.stringify([b.store[path] ?? [], b.pins[path] ?? []]);
    const none = '[[],[]]', from = tb > ta ? b : ta > tb ? a : ja === none ? b : jb === none ? a : ja <= jb ? a : b;
    if (from.store[path]?.length) out.store[path] = from.store[path];
    if (from.pins[path]?.length) out.pins[path] = from.pins[path];
    const t = Math.max(ta, tb);
    if (t) out.at[path] = t;
  }
  return out;
}

export const sameDoc = (a: Doc, b: Doc) => JSON.stringify([a.store, a.at, a.pins]) === JSON.stringify([b.store, b.at, b.pins]);

const storeKey = (userId: string | null | undefined) => `uv-arrange:${userId || 'me'}`;

/**
 * One person's arrangements on this device: read once, written on every change, shared by everything
 * that arranges (the page, the side menu) and by the sync with their other devices.
 */
export class Vault {
  private doc: Doc;
  private listeners = new Set<(paths: Set<string>, mine: boolean) => void>();
  constructor(private userId: string | null | undefined) {
    let raw: unknown = null;
    try { raw = JSON.parse(localStorage.getItem(storeKey(userId)) ?? 'null'); } catch { /* private window */ }
    this.doc = cleanDoc(raw);
  }
  get(path: string): PageLayout { return this.doc.store[path] ?? []; }
  /** A copy to send or compare. */
  now(): Doc { return JSON.parse(JSON.stringify(this.doc)) as Doc; }
  any() { return Object.keys(this.doc.store).length > 0 || Object.keys(this.doc.pins).length > 0; }
  /** M167: the shortcuts kept under `key` (`MENU_PINS`, `pagePins(path)`). */
  pins(key: string): Pin[] { return this.doc.pins[key] ?? []; }
  /** Every list of shortcuts (a copy, for drawing them). */
  allPins(): Record<string, Pin[]> { return { ...this.doc.pins }; }
  /** Shortcuts changed here: several lists at once (a shortcut moved from the menu to a page is one change). */
  setPins(lists: Record<string, Pin[]>) {
    const t = Date.now(), paths = new Set<string>();
    for (const [key, list] of Object.entries(lists)) {
      const clean = cleanPins({ [key]: list })[key] ?? [];
      if (clean.length) this.doc.pins[key] = clean; else delete this.doc.pins[key];
      this.doc.at[key] = t;
      paths.add(key);
    }
    if (paths.size) this.write(paths, true);
  }
  /** A change made here. */
  set(path: string, layout: PageLayout) {
    if (layout.length) this.doc.store[path] = layout; else delete this.doc.store[path];
    this.doc.at[path] = Date.now();
    this.write(new Set([path]), true);
  }
  /** Every page put back as it was. */
  clearAll() {
    const paths = new Set([...Object.keys(this.doc.store), ...Object.keys(this.doc.pins)]), t = Date.now();
    for (const p of paths) { delete this.doc.store[p]; delete this.doc.pins[p]; this.doc.at[p] = t; }
    if (paths.size) this.write(paths, true);
  }
  /** Another device's copy joined in; tells which pages changed here. */
  merge(other: Doc): boolean {
    const next = mergeDocs(this.doc, other);
    const paths = new Set<string>();
    for (const p of new Set([...Object.keys(next.store), ...Object.keys(this.doc.store), ...Object.keys(next.pins), ...Object.keys(this.doc.pins)])) {
      if (JSON.stringify([next.store[p] ?? [], next.pins[p] ?? []]) !== JSON.stringify([this.doc.store[p] ?? [], this.doc.pins[p] ?? []])) paths.add(p);
    }
    const changed = !sameDoc(next, this.doc);
    this.doc = next;
    if (changed) this.write(paths, false);
    return changed;
  }
  /** `mine`: the change was made on this device (so it is worth sending). */
  listen(fn: (paths: Set<string>, mine: boolean) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private write(paths: Set<string>, mine: boolean) {
    try { localStorage.setItem(storeKey(this.userId), JSON.stringify(this.doc)); } catch { /* private window or full: this visit only */ }
    for (const fn of this.listeners) fn(paths, mine);
  }
}
