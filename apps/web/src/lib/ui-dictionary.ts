// The app's screens in other languages (Stage 5 · Q21). A language's dictionary maps the English
// text of public/i18n/catalog.json to its translation; text with values ("{0} open reports") is a
// pattern. It is stored in CHUNKS parts (ui_translations), chosen by a hash of the English text,
// and applied in the browser by src/components/i18n/UiTranslator.tsx. Pure: shared by the server
// and the browser, and unit-tested.

export const CHUNKS = 32;
export type Chunk = { s: Record<string, string>; r: string[] };
const MAX_TEXT = 600;

/** The same English text always lands in the same part (FNV-1a). */
export function chunkOf(source: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) h = Math.imul(h ^ source.charCodeAt(i), 0x01000193) >>> 0;
  return h % CHUNKS;
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export const hasValues = (s: string) => /\{\d\}/.test(s);
/**
 * A pattern is used only when its own words say enough: at least 5 letters, and two words when it
 * starts and ends with a value. "{0} to {1}" would match anyone's sentence with "to" in it.
 */
export function strongPattern(s: string): boolean {
  const fixed = s.replace(/\{\d\}/g, ' ');
  const letters = (fixed.match(/[A-Za-z]/g) ?? []).length;
  const words = (fixed.match(/[A-Za-z]{2,}/g) ?? []).length;
  return letters >= 5 && (!/^\{\d\}.*\{\d\}$/.test(s.trim()) || words >= 2);
}

/** A part as sent by the owner console: only text that belongs in this part, nothing huge. */
export function cleanChunk(raw: unknown, chunk: number): Chunk {
  const r = (raw ?? {}) as { s?: unknown; r?: unknown };
  const s: Record<string, string> = {};
  if (r.s && typeof r.s === 'object') {
    for (const [k, v] of Object.entries(r.s as Record<string, unknown>)) {
      if (typeof v !== 'string' || !k || k.length > MAX_TEXT || chunkOf(k) !== chunk) continue;
      const t = v.trim().slice(0, MAX_TEXT * 2);
      // A pattern's translation must keep every {n} of the English.
      if (t && (k.match(/\{\d\}/g) ?? []).every((p) => t.includes(p))) s[k] = t;
    }
  }
  const reviewed = Array.isArray(r.r) ? [...new Set(r.r.filter((x): x is string => typeof x === 'string' && x in s))] : [];
  return { s, r: reviewed };
}

type Pattern = { re: RegExp; to: string };
export type Dictionary = { exact: Map<string, string>; patterns: Map<string, Pattern[]>; words: [RegExp, string][]; relative: Intl.RelativeTimeFormat | null };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyWord = (s: string) => (s.match(/[A-Za-z]{2,}/g) ?? ([] as string[])).sort((a, b) => b.length - a.length)[0]?.toLowerCase();

/** Month and weekday names in dates written in English ("Monday, September 28") → the language's. */
function dateWords(locale: string): [RegExp, string][] {
  const out: [RegExp, string][] = [];
  try {
    for (const [opt, n] of [[{ month: 'long' }, 12], [{ month: 'short' }, 12], [{ weekday: 'long' }, 7], [{ weekday: 'short' }, 7]] as const) {
      const en = new Intl.DateTimeFormat('en', { ...opt, timeZone: 'UTC' });
      const to = new Intl.DateTimeFormat(locale, { ...opt, timeZone: 'UTC' });
      for (let i = 0; i < n; i++) {
        const d = 'month' in opt ? new Date(Date.UTC(2026, i, 15)) : new Date(Date.UTC(2026, 0, 4 + i));
        const a = en.format(d), b = to.format(d);
        if (a !== b && !out.some(([re]) => re.source === `\\b${a}\\b`)) out.push([new RegExp(`\\b${a}\\b`, 'g'), b]);
      }
    }
  } catch {
    /* no Intl data for this language */
  }
  return out.sort((x, y) => y[0].source.length - x[0].source.length); // "September" before "Sep"
}

export function compile(chunks: Chunk[], locale: string): Dictionary {
  const exact = new Map<string, string>();
  const patterns = new Map<string, Pattern[]>();
  for (const c of chunks) {
    for (const [k, v] of Object.entries(c.s ?? {})) {
      if (!hasValues(k)) { exact.set(k, v); continue; }
      if (!strongPattern(k)) continue;
      const word = keyWord(k.replace(/\{\d\}/g, ' '));
      if (!word) continue;
      const parts = k.split(/(\{\d\})/);
      const order: number[] = [];
      const re = new RegExp(`^${parts.map((p) => (/^\{\d\}$/.test(p) ? (order.push(Number(p[1])), '(.+?)') : esc(p))).join('')}$`, 's');
      const to = v.replace(/\{(\d)\}/g, (_, n) => `\u0000${order.indexOf(Number(n)) + 1}\u0000`);
      patterns.set(word, [...(patterns.get(word) ?? []), { re, to }]);
    }
  }
  let relative: Intl.RelativeTimeFormat | null = null;
  try { relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }); } catch { /* no Intl data */ }
  return { exact, patterns, words: dateWords(locale), relative };
}

/** The translation of one piece of screen text (keeping its spaces around it), or null. */
export function translateText(d: Dictionary, text: string): string | null {
  const key = norm(text);
  if (!key || !/[A-Za-z]/.test(key)) return null;
  const wrap = (t: string) => text.slice(0, text.length - text.trimStart().length) + t + text.slice(text.trimEnd().length);
  const hit = d.exact.get(key);
  if (hit !== undefined) return wrap(hit);
  for (const w of new Set((key.match(/[A-Za-z]{2,}/g) ?? []).map((x) => x.toLowerCase()))) {
    for (const p of d.patterns.get(w) ?? []) {
      const m = p.re.exec(key);
      if (m) return wrap(p.to.replace(/\u0000(\d)\u0000/g, (_, i) => m[Number(i)] ?? ''));
    }
  }
  // "22 days ago", "about 1 hour ago", "in 3 days" (date-fns' English) in the language.
  const rel = d.relative && /^(in )?(?:(?:about|over|almost|less than) )?(\d+|an?|one) (second|minute|hour|day|week|month|year)s?( ago)?$/i.exec(key);
  if (rel && d.relative && (rel[1] || rel[4])) {
    const n = /^\d+$/.test(rel[2]) ? Number(rel[2]) : 1;
    return wrap(d.relative.format(rel[1] ? n : -n, rel[3].toLowerCase() as Intl.RelativeTimeFormatUnit));
  }
  let out = key, changed = false;
  for (const [re, to] of d.words) { const next = out.replace(re, to); if (next !== out) { out = next; changed = true; } }
  return changed ? wrap(out) : null;
}
