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
          const pct = num(z.pct, 20, 100), span = num(z.span, 1, 12), h = num(z.h, 60, 4000);
          if (pct !== undefined) size.pct = pct;
          if (span !== undefined) size.span = span;
          if (h !== undefined) size.h = h;
          if (Object.keys(size).length) s[k] = size;
        }
        if (Object.keys(s).length) entry.sizes = s;
      }
      const w = num(maxW, 320, 4000);
      if (w !== undefined) entry.maxW = w;
      entries.push(entry);
    }
    if (entries.length) out[path] = entries;
  }
  return out;
}

const storeKey = (userId: string | null | undefined) => `uv-arrange:${userId || 'me'}`;

export function readStore(userId: string | null | undefined): Store {
  try { return cleanStore(JSON.parse(localStorage.getItem(storeKey(userId)) ?? '{}')); } catch { return {}; }
}
export function writeStore(userId: string | null | undefined, store: Store) {
  try { localStorage.setItem(storeKey(userId), JSON.stringify(store)); } catch { /* private window or full: this visit only */ }
}
