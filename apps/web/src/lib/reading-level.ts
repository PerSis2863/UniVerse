// Reading levels (Stage 5 · D9, reading-level adapter): a text rewritten by AI for a younger reader
// (src/server/reading-level.ts), with its key terms explained. Shared by the server, the reader and
// the tests: the levels, cleaning the AI's key terms, marking them in the text, and cutting a text
// into short pieces for reading aloud.

export const LEVELS = {
  g8: { label: 'Grade 8', short: 'Simpler', hint: 'About 13–14 years old: clear sentences, technical words explained.' },
  g5: { label: 'Grade 5', short: 'Simplest', hint: 'About 10–11 years old: short sentences and everyday words.' },
} as const;
export type Level = keyof typeof LEVELS;
export const isLevel = (x: unknown): x is Level => typeof x === 'string' && Object.hasOwn(LEVELS, x);

export interface Term { term: string; meaning: string }
export interface Leveled { text: string; terms: Term[] }

const MAX_TERMS = 8;

/** The AI's key terms that are usable: short, explained, found in the text, each once. */
export function cleanTerms(raw: unknown, text: string): Term[] {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = x as Partial<Term> | null;
    const term = typeof t?.term === 'string' ? t.term.trim() : '';
    const meaning = typeof t?.meaning === 'string' ? t.meaning.trim() : '';
    const key = term.toLowerCase();
    if (term.length < 2 || term.length > 60 || !meaning || meaning.length > 300 || seen.has(key) || !lower.includes(key)) continue;
    seen.add(key);
    out.push({ term, meaning });
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/** Stored terms (a JSON list) back as a list; anything broken is dropped. */
export function parseTerms(json: string, text: string): Term[] {
  try { return cleanTerms(JSON.parse(json), text); } catch { return []; }
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

/**
 * The text in pieces, with the first appearance of each key term marked (whole words only, any case),
 * so the reader can highlight it. Joining the pieces gives the text back.
 */
export function glossSegments(text: string, terms: Term[]): { text: string; term?: Term }[] {
  const lower = text.toLowerCase();
  const hits: { at: number; end: number; term: Term }[] = [];
  // Longer terms first, so "binary search tree" wins over "tree".
  for (const term of [...terms].sort((a, b) => b.term.length - a.term.length)) {
    const key = term.term.toLowerCase();
    for (let at = lower.indexOf(key); at >= 0; at = lower.indexOf(key, at + 1)) {
      const end = at + key.length;
      if (isWordChar(text[at - 1]) || isWordChar(text[end])) continue;
      if (hits.some((h) => at < h.end && end > h.at)) continue;
      hits.push({ at, end, term });
      break;
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const out: { text: string; term?: Term }[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at > pos) out.push({ text: text.slice(pos, h.at) });
    out.push({ text: text.slice(h.at, h.end), term: h.term });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

/**
 * A text in short pieces for reading aloud (some browsers stop a long utterance after about 15
 * seconds): sentences, joined up to `max` characters; a very long sentence is cut at a comma or space.
 */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?。？！]+(?:[.!?。？！]+["'”’)\]]*|$)\s*/gu) ?? [];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let s of sentences) {
    while (s.length > max) {
      push();
      const cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max));
      const at = cut > max / 3 ? cut + 1 : s.lastIndexOf(' ', max) > max / 3 ? s.lastIndexOf(' ', max) : max;
      out.push(s.slice(0, at).trim());
      s = s.slice(at);
    }
    if (cur.length + s.length > max) push();
    cur += s;
  }
  push();
  return out.filter(Boolean);
}
