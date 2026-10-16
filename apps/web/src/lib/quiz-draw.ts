// Question pools (Stage 5 · B4.2): a quiz can hold more questions than each student answers. Its
// questions are grouped in pools by a label, and each student gets their own draw of N from a pool
// (the same again on reload, since the draw is seeded by the student and the quiz). Questions with
// no pool are for everyone. Import-free apart from the seeded shuffle; tested in quiz-draw.test.ts.

import { shuffled } from './seeded-shuffle';

/** How many each student gets from each pool: { "week 3": 5 }. */
export type Pools = Record<string, number>;

const MAX_POOLS = 20;
export const cleanPoolName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');

/** Pool counts made safe to store (null: no pools). */
export function cleanPools(raw: unknown): Pools | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Pools = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_POOLS)) {
    const name = cleanPoolName(k);
    const n = Math.round(Number(v));
    if (name && Number.isFinite(n) && n >= 1 && n <= 200) out[name] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function parsePools(s: string | null | undefined): Pools | null {
  try { return s ? cleanPools(JSON.parse(s)) : null; } catch { return null; }
}

/**
 * The questions one student gets, in the quiz's order: every question with no pool, and from each
 * pool the number set for it (all of it when the number is missing or as big as the pool).
 */
export function drawFor<Q extends { id: string; pool?: string | null }>(questions: Q[], pools: Pools | null, seed: string): Q[] {
  if (!pools) return questions;
  const keep = new Set<string>();
  const byPool = new Map<string, Q[]>();
  for (const q of questions) {
    if (!q.pool) keep.add(q.id);
    else byPool.set(q.pool, [...(byPool.get(q.pool) ?? []), q]);
  }
  for (const [pool, qs] of byPool) {
    const n = pools[pool];
    // Sorted first, so the draw doesn't depend on the order the questions were read in.
    const picked = n && n < qs.length ? shuffled(qs.map((q) => q.id).sort(), `${seed}:${pool}`).slice(0, n) : qs.map((q) => q.id);
    for (const id of picked) keep.add(id);
  }
  return questions.filter((q) => keep.has(q.id));
}

/** A submission's drawn question ids (null: it got every question). */
export function drawnOf(s: string | null | undefined): string[] | null {
  try { const v = s ? (JSON.parse(s) as unknown) : null; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null; } catch { return null; }
}

/** Each pool's size and how many each student gets, for the teacher. */
export function poolSummary(questions: { pool?: string | null; points: number }[], pools: Pools | null) {
  const out = new Map<string, { size: number; each: number }>();
  for (const q of questions) if (q.pool) out.set(q.pool, { size: (out.get(q.pool)?.size ?? 0) + 1, each: 0 });
  for (const [k, v] of out) v.each = Math.min(v.size, pools?.[k] ?? v.size);
  return [...out.entries()].map(([name, v]) => ({ name, ...v }));
}
