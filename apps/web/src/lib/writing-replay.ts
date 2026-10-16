// Writing replay (Stage 5 · B3.6): how a typed answer grew over time, for the teacher. The browser
// keeps a change every few seconds while the student writes (never each key): where the text
// changed, how much went and what came in, and whether it was pasted. It's kept with the draft on
// the device and handed in with the answer. Pure; tested in writing-replay.test.ts.

/** t: when (ms), p: where, d: characters removed, i: text put in, paste: it came from a paste. */
export interface Chunk { t: number; p: number; d: number; i: string; paste?: boolean }
/** base: the text before the first change kept (older changes fold into it past the limit). */
export interface Replay { base: string; chunks: Chunk[] }

export const MAX_CHUNKS = 600;
export const EVERY_MS = 8000;
const MAX_TEXT = 20_000;
/** At most this much text in a replay (its base and everything put in), so a row stays small. */
export const MAX_TOTAL = 150_000;
export const BIG_PASTE = 200;

const size = (r: Replay) => r.chunks.reduce((n, c) => n + c.i.length, r.base.length);

/** The one change that turns `prev` into `next` (null when they're the same). */
export function diffChunk(prev: string, next: string, t: number, paste = false): Chunk | null {
  if (prev === next) return null;
  let a = 0;
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let b = 0;
  while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  return { t, p: a, d: prev.length - a - b, i: next.slice(a, next.length - b), ...(paste ? { paste: true } : {}) };
}

export const apply = (text: string, c: Chunk) => text.slice(0, c.p) + c.i + text.slice(c.p + c.d);

/** The text after the first `n` changes. */
export function textAt(r: Replay, n: number): string {
  let text = r.base;
  for (const c of r.chunks.slice(0, Math.max(0, n))) text = apply(text, c);
  return text;
}

/** Adds the change from `prev` to `next`; past the limits the oldest changes fold into the base. */
export function record(r: Replay, prev: string, next: string, t: number, paste = false): Replay {
  const c = diffChunk(prev, next, t, paste);
  if (!c) return r;
  const out = { base: r.base, chunks: [...r.chunks, c] };
  while (out.chunks.length && (out.chunks.length > MAX_CHUNKS || size(out) > MAX_TOTAL)) out.base = apply(out.base, out.chunks.shift()!);
  return out;
}

/**
 * A replay from the browser, checked: well-formed changes in time order, within the limits. `matches`:
 * whether replaying it gives the text handed in (if not, the teacher is told it's incomplete).
 */
export function cleanReplay(raw: unknown, finalText: string): { replay: Replay; matches: boolean } | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o || typeof o.base !== 'string' || !Array.isArray(o.chunks) || o.base.length > MAX_TEXT) return null;
  const chunks: Chunk[] = [];
  let text = o.base, last = 0, total = o.base.length;
  for (const x of o.chunks.slice(0, MAX_CHUNKS)) {
    const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const t = Number(c.t), p = Number(c.p), d = Number(c.d);
    if (!Number.isInteger(t) || t < last || !Number.isInteger(p) || !Number.isInteger(d) || p < 0 || d < 0 || p + d > text.length || typeof c.i !== 'string') return null;
    const chunk: Chunk = { t, p, d, i: c.i.slice(0, MAX_TEXT), ...(c.paste === true ? { paste: true } : {}) };
    text = apply(text, chunk);
    total += chunk.i.length;
    if (text.length > MAX_TEXT * 1.5 || total > MAX_TOTAL) return null;
    chunks.push(chunk);
    last = t;
  }
  return { replay: { base: o.base, chunks }, matches: text.trim() === finalText.trim() };
}

/** For the teacher: active writing time (gaps over 10 minutes don't count), sittings, big pastes. */
export function replayStats(r: Replay): { minutes: number; sittings: number; pastes: { t: number; length: number }[]; first: number | null; last: number | null } {
  const c = r.chunks;
  let active = 0, sittings = c.length ? 1 : 0;
  for (let k = 1; k < c.length; k++) {
    const gap = c[k].t - c[k - 1].t;
    if (gap > 10 * 60_000) sittings++;
    else active += gap;
  }
  return {
    minutes: Math.round(active / 60_000),
    sittings,
    pastes: c.filter((x) => x.paste && x.i.length >= BIG_PASTE).map((x) => ({ t: x.t, length: x.i.length })),
    first: c[0]?.t ?? null,
    last: c[c.length - 1]?.t ?? null,
  };
}
