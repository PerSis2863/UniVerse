import { RELIEF_KINDS, URGENCIES, type ReliefKind, type Urgency } from './relief';
import { BIAS, BUCKETS, SCALE, WEIGHTS } from './relief-model.gen';

// Relief's own AI (M420): a small model UniVerse trained itself, from nothing, with no outside AI service.
// It reads a request for help ("SOS water rising, 3 kids on the roof") and says how urgent it is and what
// kind of help it is. It runs right here (in the browser or the Worker) in well under a millisecond.
//
// How it reads: the text becomes a list of "features" (each word, each pair of words and each group of three
// letters, so a misspelling like "urgnt" still looks like "urgent"); each feature is turned into one of
// BUCKETS numbers by a hash; the model holds a learned weight per number and per answer, adds them up and
// picks the answer with the biggest total. It learned those weights from examples
// (scripts/ai/train-relief.mts, which writes relief-model.gen.ts).

/** The answers, in the order of the model's columns: the four urgencies, then the seven kinds. */
export const COLUMNS = [...URGENCIES, ...RELIEF_KINDS] as const;

/** FNV-1a: a fast, fixed hash of a string to a 32-bit number (the same in training and here). */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The text's features as bucket numbers (each once). */
export function features(text: string, buckets = BUCKETS): number[] {
  const words = text.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 200).map((w) => (/^\d+$/.test(w) ? '#' : w));
  const out = new Set<number>();
  words.forEach((w, i) => {
    out.add(hash(`w:${w}`) % buckets);
    if (i > 0) out.add(hash(`b:${words[i - 1]} ${w}`) % buckets);
    const p = ` ${w} `;
    for (let j = 0; j + 3 <= p.length; j++) out.add(hash(`c:${p.slice(j, j + 3)}`) % buckets);
  });
  return [...out];
}

/** A model's numbers: a weight per bucket and column (row by row), a scale per column, a bias per column. */
export interface Model { w: ArrayLike<number>; scale: readonly number[]; bias: readonly number[]; buckets: number }

let builtIn: Model | null = null;
const shipped = () => (builtIn ??= { w: Int8Array.from(atob(WEIGHTS), (c) => (c.charCodeAt(0) << 24) >> 24), scale: SCALE, bias: BIAS, buckets: BUCKETS });

/** Chances (0–1) for each answer in a group of columns, from a softmax over the totals. */
function chances(totals: number[]) {
  const top = Math.max(...totals);
  const e = totals.map((t) => Math.exp(t - top));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

/** Raw totals per column (used by the training script's own check, too). */
export function totals(text: string, { w, scale, bias, buckets }: Model = shipped()): number[] {
  const f = features(text, buckets);
  const n = COLUMNS.length;
  const norm = 1 / Math.sqrt(Math.max(1, f.length));
  return COLUMNS.map((_, c) => {
    let s = 0;
    for (const b of f) s += w[b * n + c];
    return bias[c] + s * scale[c] * norm;
  });
}

export interface NeedReading { urgency: Urgency; kind: ReliefKind; urgencySure: number; kindSure: number }

/** How urgent the request is and what kind of help it asks for, with how sure the model is (0–1). */
export function readNeed(text: string): NeedReading {
  const t = totals(text);
  const u = chances(t.slice(0, URGENCIES.length)), k = chances(t.slice(URGENCIES.length));
  const ui = u.indexOf(Math.max(...u)), ki = k.indexOf(Math.max(...k));
  return { urgency: URGENCIES[ui], kind: RELIEF_KINDS[ki], urgencySure: u[ui], kindSure: k[ki] };
}

/**
 * A first guess at a need from a text message (M107), for the coordinator to check before it goes on the
 * map: the kind and how urgent (this model, M420), how many people ("family of 5", "3 children") and a
 * short title.
 */
export function guessNeed(text: string): { kind: ReliefKind; people: number; urgency: Urgency; title: string } {
  const t = text.replace(/\s+/g, ' ').trim();
  const { kind, urgency } = readNeed(t);
  const n = /\bfamily of (\d{1,3})\b/i.exec(t) ?? /\b(\d{1,4})\s*(?:people|persons|of us|adults|kids|children|ppl|families)\b/i.exec(t);
  const people = n ? Math.min(10_000, Math.max(1, Number(n[1]))) : 1;
  const title = t.length <= 80 ? t : `${t.slice(0, 78).replace(/\s+\S*$/, '')}…`;
  return { kind, people, urgency, title };
}
