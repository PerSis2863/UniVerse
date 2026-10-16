// Where a note on a hand-in is pinned (Stage 5 · B3.3): a box on a PDF page or picture (fractions of
// the page, so it fits any zoom), or words in a typed answer (character offsets and the quoted words,
// so a note survives as long as the text it points to). Checked before saving; tested.

export type Anchor =
  | { type: 'box'; page: number; x: number; y: number; w: number; h: number }
  | { type: 'text'; start: number; end: number; quote: string };

const frac = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/** An anchor from the browser, made safe, or null when it isn't one. */
export function cleanAnchor(raw: unknown, textLength: number): Anchor | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (o.type === 'box') {
    const page = Math.round(Number(o.page));
    const [x, y, w, h] = [frac(o.x), frac(o.y), frac(o.w), frac(o.h)];
    if (!(page >= 1 && page <= 500) || x === null || y === null || w === null || h === null) return null;
    // At least a small box, and inside the page.
    const ww = Math.min(Math.max(w, 0.01), 1 - x), hh = Math.min(Math.max(h, 0.01), 1 - y);
    if (ww <= 0 || hh <= 0) return null;
    const r = (n: number) => Math.round(n * 10_000) / 10_000;
    return { type: 'box', page, x: r(x), y: r(y), w: r(ww), h: r(hh) };
  }
  if (o.type === 'text') {
    const start = Math.round(Number(o.start)), end = Math.round(Number(o.end));
    if (!(start >= 0 && end > start && end <= textLength && end - start <= 5000)) return null;
    return { type: 'text', start, end, quote: typeof o.quote === 'string' ? o.quote.slice(0, 300) : '' };
  }
  return null;
}

/** Splits a text into plain and noted parts for showing it (overlaps: the earlier note wins). */
export function textParts(text: string, notes: { id: string; anchor: Anchor }[]): { text: string; noteId: string | null }[] {
  const spans = notes.flatMap((n) => (n.anchor.type === 'text' && n.anchor.end <= text.length ? [{ id: n.id, start: n.anchor.start, end: n.anchor.end }] : [])).sort((a, b) => a.start - b.start);
  const out: { text: string; noteId: string | null }[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    if (s.start > at) out.push({ text: text.slice(at, s.start), noteId: null });
    out.push({ text: text.slice(s.start, s.end), noteId: s.id });
    at = s.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), noteId: null });
  return out;
}
