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
}
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
      entries.push(entry);
    }
    if (entries.length) out[path] = entries;
  }
  return out;
}

// ── M166: what is kept, with the time each page was last changed, so two devices can be joined ──

/** Everything a person arranged: each page's groups, and when each page was last changed (ms; a page put back keeps its time with no groups). */
export interface Doc { store: Store; at: Record<string, number> }
export const emptyDoc = (): Doc => ({ store: {}, at: {} });
/** The most a saved copy may weigh as JSON (the server refuses more). */
export const MAX_DOC_BYTES = 200_000;

export function cleanDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDoc();
  const r = raw as { store?: unknown; at?: unknown };
  // The first version kept the pages alone.
  const store = cleanStore('store' in r || 'at' in r ? r.store : raw);
  const at: Record<string, number> = {};
  if (r.at && typeof r.at === 'object' && !Array.isArray(r.at)) {
    const times = Object.entries(r.at as Record<string, unknown>)
      .filter((e): e is [string, number] => e[0].startsWith('/') && e[0].length <= 200 && typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, MAX_PAGES * 2);
    for (const [k, v] of times) at[k] = Math.round(v);
  }
  return { store, at };
}

/** Two copies joined: page by page, the one changed last wins (a page put back later stays put back). */
export function mergeDocs(a: Doc, b: Doc): Doc {
  const out = emptyDoc();
  for (const path of new Set([...Object.keys(a.at), ...Object.keys(b.at), ...Object.keys(a.store), ...Object.keys(b.store)])) {
    const ta = a.at[path] ?? 0, tb = b.at[path] ?? 0;
    // The same moment (or none known): whichever has something; both: always the same one, whoever asks.
    const ja = JSON.stringify(a.store[path] ?? []), jb = JSON.stringify(b.store[path] ?? []);
    const from = tb > ta ? b : ta > tb ? a : ja === '[]' ? b : jb === '[]' ? a : ja <= jb ? a : b;
    if (from.store[path]?.length) out.store[path] = from.store[path];
    const t = Math.max(ta, tb);
    if (t) out.at[path] = t;
  }
  return out;
}

export const sameDoc = (a: Doc, b: Doc) => JSON.stringify([a.store, a.at]) === JSON.stringify([b.store, b.at]);

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
  any() { return Object.keys(this.doc.store).length > 0; }
  /** A change made here. */
  set(path: string, layout: PageLayout) {
    if (layout.length) this.doc.store[path] = layout; else delete this.doc.store[path];
    this.doc.at[path] = Date.now();
    this.write(new Set([path]), true);
  }
  /** Every page put back as it was. */
  clearAll() {
    const paths = new Set(Object.keys(this.doc.store)), t = Date.now();
    for (const p of paths) { delete this.doc.store[p]; this.doc.at[p] = t; }
    if (paths.size) this.write(paths, true);
  }
  /** Another device's copy joined in; tells which pages changed here. */
  merge(other: Doc): boolean {
    const next = mergeDocs(this.doc, other);
    const paths = new Set<string>();
    for (const p of new Set([...Object.keys(next.store), ...Object.keys(this.doc.store)])) if (JSON.stringify(next.store[p] ?? []) !== JSON.stringify(this.doc.store[p] ?? [])) paths.add(p);
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
