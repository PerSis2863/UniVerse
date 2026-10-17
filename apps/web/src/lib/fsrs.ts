// Flashcard scheduling with FSRS (Stage 5 · Q13), the Free Spaced Repetition Scheduler (version
// 4.5, its published default weights): each card has a stability (how many days until the chance
// of remembering it falls to 90 %) and a difficulty (1–10). A review updates both from the answer
// and how long it has been; the next review is when recall is expected to drop to 90 %. Cards
// scheduled before FSRS (the older SM-2 numbers) carry on from their last interval.

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';
const G: Record<ReviewGrade, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81; // so that retrievability is 90 % after `stability` days
const RETENTION = 0.9;
const MAX_DAYS = 3 * 365;
const DAY = 86_400_000;
const AGAIN_MINUTES = 10;

export interface CardState { stability: number | null; difficulty: number | null; lastReview: Date | null; interval: number; ease: number; reps: number; lapses: number }
export interface Scheduled { stability: number; difficulty: number; lastReview: Date; interval: number; reps: number; lapses: number; due: Date }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/** The chance of remembering after `days` with this stability. */
export const retrievability = (days: number, stability: number) => (1 + (FACTOR * Math.max(0, days)) / stability) ** DECAY;
const initDifficulty = (g: number) => clamp(W[4] - (g - 3) * W[5], 1, 10);
/** Days until recall falls to the retention we aim for (90 %: the stability itself). */
const intervalFor = (s: number) => clamp(Math.round((s / FACTOR) * (RETENTION ** (1 / DECAY) - 1)), 1, MAX_DAYS);

/** Where a card stands: its FSRS numbers, or ones made up from the SM-2 numbers it had. */
function current(c: CardState): { s: number; d: number; isNew: boolean } {
  if (c.stability && c.difficulty) return { s: c.stability, d: c.difficulty, isNew: false };
  if (c.reps > 0 && c.interval > 0) return { s: Math.max(0.5, c.interval), d: clamp(11 - ((c.ease - 1.3) / 1.7) * 9, 1, 10), isNew: false };
  return { s: 0, d: 0, isNew: true };
}

/** A review: the card's new stability, difficulty and when it's next due. */
export function review(c: CardState, grade: ReviewGrade, now = new Date()): Scheduled {
  const g = G[grade];
  const { s, d, isNew } = current(c);
  let stability: number, difficulty: number;
  if (isNew) {
    stability = W[g - 1];
    difficulty = initDifficulty(g);
  } else {
    const days = c.lastReview ? (now.getTime() - c.lastReview.getTime()) / DAY : c.interval;
    const r = retrievability(days, s);
    difficulty = clamp(W[7] * initDifficulty(3) + (1 - W[7]) * (d - W[6] * (g - 3)), 1, 10);
    stability = g === 1
      ? Math.min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)))
      : s * (Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
  }
  stability = clamp(stability, 0.1, 36500);
  const again = g === 1;
  const interval = again ? 0 : intervalFor(stability);
  return {
    stability: round(stability),
    difficulty: round(difficulty),
    lastReview: now,
    interval,
    reps: again ? 0 : c.reps + 1,
    lapses: c.lapses + (again && !isNew ? 1 : 0),
    // "Again": back in 10 minutes, the same session.
    due: new Date(now.getTime() + (again ? AGAIN_MINUTES * 60_000 : interval * DAY)),
  };
}

/** What each answer would do, for the buttons ("Good · 4 d"). */
export function preview(c: CardState, now = new Date()): Record<ReviewGrade, string> {
  const label = (g: ReviewGrade) => {
    const n = review(c, g, now);
    if (!n.interval) return `${AGAIN_MINUTES} min`;
    return n.interval < 30 ? `${n.interval} d` : n.interval < 365 ? `${Math.round(n.interval / 30)} mo` : `${Math.round((n.interval / 365) * 10) / 10} y`;
  };
  return { again: label('again'), hard: label('hard'), good: label('good'), easy: label('easy') };
}
