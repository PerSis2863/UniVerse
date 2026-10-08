// Course modules (Stage 5 · B2): rules shared by the server, the course board and sample mode.
// Import-free, so it runs anywhere.

export const ITEM_KINDS = ['PAGE', 'FILE', 'LINK', 'VIDEO', 'QUIZ', 'ASSIGNMENT', 'LIVE'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Items that point at something already in the course (picked from a list), not typed in. */
export const REF_KINDS: readonly ItemKind[] = ['FILE', 'QUIZ', 'ASSIGNMENT', 'LIVE'];

export interface ModuleRule {
  published: boolean;
  releaseAt: string | Date | null;
  requireQuizId: string | null;
  requireScore: number | null;
  requireQuizTitle?: string | null;
}

export type Lock = { locked: false } | { locked: true; reason: string };

/**
 * Whether a student can open a module now. `bestPct` is the student's best score on the
 * required quiz, in percent (null: not taken). Unpublished modules aren't shown to students at all.
 */
export function lockFor(m: ModuleRule, now: Date, bestPct: number | null): Lock {
  if (m.releaseAt && new Date(m.releaseAt) > now) {
    return { locked: true, reason: `Opens ${new Date(m.releaseAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` };
  }
  if (m.requireQuizId && m.requireScore != null && (bestPct == null || bestPct < m.requireScore)) {
    const quiz = m.requireQuizTitle ? `“${m.requireQuizTitle}”` : 'the quiz';
    return { locked: true, reason: bestPct == null ? `Unlocks after ${quiz} (${m.requireScore}% or more)` : `Unlocks at ${m.requireScore}% on ${quiz} (your best: ${Math.round(bestPct)}%)` };
  }
  return { locked: false };
}

/** A score as a percentage, or null. */
export const percent = (score: number | null | undefined, max: number | null | undefined) => (score != null && max ? (score / max) * 100 : null);

/** The first item not done yet, in module and item order, in modules the student can open. */
export function nextItem<I extends { id: string; done: boolean }, M extends { id: string; locked: boolean; items: I[] }>(modules: M[]): { module: M; item: I } | null {
  for (const m of modules) {
    if (m.locked) continue;
    const item = m.items.find((i) => !i.done);
    if (item) return { module: m, item };
  }
  return null;
}

/** New positions after moving one entry up (-1) or down (+1); unchanged at the ends. */
export function moved<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
