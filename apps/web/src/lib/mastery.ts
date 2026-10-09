// Learning DNA maths (Stage 5 · D1): how well a student knows a concept, from what they've done.
// Import-free and unit-tested. Each observation is an outcome from 0 (wrong) to 1 (right / full
// marks) with a weight; the level starts low and moves toward each outcome, the newest counting
// most (a learning-rate update, like a light Elo). Confidence grows with the evidence.

export interface Observation { at: number; outcome: number; weight?: number }
export interface Mastery { level: number; confidence: number; n: number; trend: number; last: number | null }
export type Band = 'new' | 'learning' | 'nearly' | 'mastered';

const PRIOR = 0.3, RATE = 0.35, MAX_STEP = 0.8;
const r2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** A concept's mastery from its observations (any order). */
export function masteryOf(observations: Observation[]): Mastery {
  const obs = [...observations].filter((o) => Number.isFinite(o.outcome)).sort((a, b) => a.at - b.at);
  let level = PRIOR, weight = 0, before = PRIOR;
  obs.forEach((o, i) => {
    if (i === obs.length - 3) before = level;
    const w = Math.max(0, o.weight ?? 1);
    level += Math.min(MAX_STEP, RATE * w) * (clamp(o.outcome) - level);
    weight += w;
  });
  if (obs.length < 3) before = PRIOR;
  return { level: r2(level), confidence: r2(1 - Math.exp(-weight / 3)), n: obs.length, trend: r2(obs.length ? level - before : 0), last: obs.at(-1)?.at ?? null };
}

/** In words: new (nothing yet), learning, nearly there, mastered (high and well evidenced). */
export function bandOf(m: Pick<Mastery, 'level' | 'confidence' | 'n'>): Band {
  if (!m.n) return 'new';
  if (m.level >= 0.8 && m.confidence >= 0.5) return 'mastered';
  return m.level >= 0.55 ? 'nearly' : 'learning';
}

/**
 * What to study next: concepts tried but not yet secure (weakest first, the better-evidenced
 * among equals), then concepts not met yet in course order. At most `count`.
 */
export function nextBest<T extends { id: string; position: number; mastery: Mastery }>(concepts: T[], count = 3): T[] {
  const weak = concepts.filter((c) => c.mastery.n > 0 && bandOf(c.mastery) !== 'mastered')
    .sort((a, b) => a.mastery.level - b.mastery.level || b.mastery.confidence - a.mastery.confidence);
  const fresh = concepts.filter((c) => c.mastery.n === 0).sort((a, b) => a.position - b.position);
  return [...weak, ...fresh].slice(0, count);
}

/** For the teacher: concepts the class is weakest on (at least `minStudents` with evidence, average below 0.6). */
export function reteach(grid: { conceptId: string; levels: (Mastery | null)[] }[], minStudents = 3, count = 3) {
  return grid.map((row) => {
    const seen = row.levels.filter((m): m is Mastery => !!m && m.n > 0);
    const average = seen.length ? seen.reduce((a, m) => a + m.level, 0) / seen.length : null;
    return { conceptId: row.conceptId, students: seen.length, average: average == null ? null : r2(average), struggling: seen.filter((m) => bandOf(m) === 'learning').length };
  }).filter((r) => r.students >= minStudents && r.average != null && r.average < 0.6)
    .sort((a, b) => (a.average ?? 1) - (b.average ?? 1)).slice(0, count);
}
