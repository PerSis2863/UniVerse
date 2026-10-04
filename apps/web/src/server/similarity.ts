// Similarity signals for written answers, shown to the teacher only (src/server/assignments.ts).
// A signal is a prompt to look closer, never a verdict: shared phrasing can be innocent (quotes,
// set definitions, group work).
//
// Text is cut into overlapping 5-word phrases ("shingles"). For answer-to-answer comparison each
// answer keeps a 64-number MinHash signature, so a whole class compares in milliseconds; the
// share of matching numbers estimates how much phrasing two answers share. For course materials
// we measure how many of the answer's phrases appear in the material.

const K = 5; // words per phrase
const HASHES = 64;
const MIN_SHINGLES = 12; // shorter answers give unreliable numbers

function words(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

/** FNV-1a, 32-bit. */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function shingles(text: string): Set<number> {
  const w = words(text);
  const out = new Set<number>();
  for (let i = 0; i + K <= w.length; i++) out.add(fnv(w.slice(i, i + K).join(' ')));
  return out;
}

// Fixed, odd multipliers and offsets for the 64 hash functions (deterministic, so signatures
// stored months apart still compare).
const A = Array.from({ length: HASHES }, (_, i) => (fnv(`a${i}`) | 1) >>> 0);
const B = Array.from({ length: HASHES }, (_, i) => fnv(`b${i}`));

export function signature(set: Set<number>): number[] | null {
  if (set.size < MIN_SHINGLES) return null;
  const sig = new Array<number>(HASHES).fill(0xffffffff);
  for (const x of set) {
    for (let i = 0; i < HASHES; i++) {
      const h = (Math.imul(A[i], x) + B[i]) >>> 0;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** Estimated share of phrasing two answers have in common (Jaccard), 0–1. */
export function estimate(a: number[], b: number[]) {
  let same = 0;
  for (let i = 0; i < HASHES; i++) if (a[i] === b[i]) same++;
  return same / HASHES;
}

/** Share of the answer's phrases found in the source text, 0–1. */
export function containment(answer: Set<number>, source: string) {
  if (answer.size < MIN_SHINGLES) return 0;
  const src = shingles(source);
  let found = 0;
  for (const x of answer) if (src.has(x)) found++;
  return found / answer.size;
}

export interface Signals {
  sig: number[] | null;
  /** The course material the answer borrows most from, if it's a noticeable share. */
  material: { title: string; percent: number } | null;
}

/** Signals for a new answer: its signature and its overlap with the course's materials. */
export function signalsFor(text: string, sources: { title: string; text: string }[], answerChars = 12_000): Signals {
  // The first 12,000 characters (on Workers Free) are plenty to recognise copied work, and keep this to a few ms.
  const set = shingles(text.slice(0, answerChars));
  let material: Signals['material'] = null;
  for (const s of sources) {
    const share = containment(set, s.text);
    if (share >= 0.2 && (!material || share * 100 > material.percent)) material = { title: s.title, percent: Math.round(share * 100) };
  }
  return { sig: signature(set), material };
}

/** For each answer, the classmate whose answer shares the most phrasing (from 30% up). */
export function closestPeers<T extends { id: string; sig: number[] | null }>(items: T[], threshold = 0.3) {
  const best = new Map<string, { id: string; share: number }>();
  for (let i = 0; i < items.length; i++) {
    const a = items[i].sig;
    if (!a) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j].sig;
      if (!b) continue;
      const share = estimate(a, b);
      if (share < threshold) continue;
      if (share > (best.get(items[i].id)?.share ?? 0)) best.set(items[i].id, { id: items[j].id, share });
      if (share > (best.get(items[j].id)?.share ?? 0)) best.set(items[j].id, { id: items[i].id, share });
    }
  }
  return best;
}
