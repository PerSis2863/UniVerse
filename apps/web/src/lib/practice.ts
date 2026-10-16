// Adaptive practice (Stage 5 · B4.4): which question a student should practise next. Questions on
// what they haven't mastered come first (their Learning DNA, D1), then ones they got wrong before;
// one they just answered waits a few minutes, and one they got right first time recently waits a few
// days. Import-free apart from the seeded random numbers; tested in practice.test.ts.

import { hash, seeded } from './seeded-shuffle';

export interface Candidate { id: string; concepts: string[] }
/** A question practised before: the first try's credit, whether it was solved in the end, when. */
export interface Seen { questionId: string; credit: number; solved: boolean; at: number }
/** How well a concept is known (masteryOf in src/lib/mastery.ts): level 0–1 and how much evidence. */
export interface Known { level: number; n: number }

export type Why = 'learning' | 'new' | 'missed' | 'review';

const MIN = 60_000, DAY = 86_400_000;

/** The next question, the concept it's for (if any) and why it was picked; null when there's none. */
export function pickNext(candidates: Candidate[], known: Map<string, Known>, history: Seen[], now: number, seed: string): { id: string; concept: string | null; why: Why } | null {
  if (!candidates.length) return null;
  const last = new Map<string, Seen>();
  for (const h of history) { const was = last.get(h.questionId); if (!was || h.at > was.at) last.set(h.questionId, h); }
  const rand = seeded(hash(seed));
  const scored = candidates.map((c) => {
    // How much the student needs its concepts: 1 − their level; a concept with no evidence yet is new.
    let need = 0.4, concept: string | null = null, fresh = false;
    for (const id of c.concepts) {
      const k = known.get(id);
      const n = !k || k.n === 0 ? 0.7 : 1 - k.level;
      if (concept === null || n > need) { need = n; concept = id; fresh = !k || k.n === 0; }
    }
    const seen = last.get(c.id);
    let score = need;
    let why: Why = fresh ? 'new' : concept ? 'learning' : 'review';
    if (!seen) score += 0.15;
    else if (now - seen.at < 5 * MIN) score -= 2; // not the same one again straight away
    else if (seen.credit >= 1 && now - seen.at < 3 * DAY) score -= 0.6; // right first time lately
    else if (seen.credit < 1) { score += 0.25; why = 'missed'; }
    return { id: c.id, concept, why, score: score + rand() * 0.1 };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { id: best.id, concept: best.concept, why: best.why };
}
