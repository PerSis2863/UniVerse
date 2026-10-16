// Quiz item analysis (Stage 5 · B4.6): how each question worked, from students' answers.
// Import-free. Plain words in the flags, because teachers read them, not statisticians.
//  - right: share of students who answered correctly (the "difficulty" index p).
//  - separates: right among the top 27% of students minus right among the bottom 27% (the
//    discrimination index D, -1…1). Needs at least 4 students.
//  - consistency: KR-20 for the whole quiz (0…1; ~0.7 or more is good for a test). Needs at least
//    5 students and 3 questions.
// Each question is marked by its type (src/lib/question-types.ts); "right" means fully right, and
// the answers chosen are counted for the types with options to choose from.

import { isRight, markAnswer, metaOf, typeOf, type Given } from './question-types';

export interface ItemIn { id: string; options: string[]; correctAnswer: string; type?: string | null; meta?: string | null }
/** A student's answers; `who` for numbers that change per student, `drawn` when the quiz draws from pools. */
export interface AnswersIn { answers: Record<string, Given | undefined | null>; who?: string; drawn?: string[] | null }
export interface ItemResult {
  id: string;
  answered: number;
  right: number | null;
  separates: number | null;
  counts: { option: string; n: number; correct: boolean }[];
  blank: number;
  flags: string[];
  fix: boolean;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function analyseQuiz(items: ItemIn[], subs: AnswersIn[]): { students: number; items: ItemResult[]; consistency: number | null; toFix: number } {
  const n = subs.length;
  // With pools (B4.2) each question counts only for the students who got it.
  const had = (s: AnswersIn, q: ItemIn) => !s.drawn || s.drawn.includes(q.id);
  const correct = subs.map((s) => items.map((q) => had(s, q) && isRight(q, s.answers[q.id], s.who)));
  const rightCounts = correct.map((row) => row.filter(Boolean).length);
  const totals = subs.map((s, i) => { const k = items.filter((q) => had(s, q)).length; return k ? rightCounts[i] / k : 0; });
  // Top and bottom 27% by share right (at least one student each).
  const order = totals.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t);
  const g = Math.max(1, Math.round(n * 0.27));
  const upper = order.slice(0, g).map((x) => x.i);
  const lower = order.slice(-g).map((x) => x.i);

  const results = items.map((q, qi) => {
    const got = subs.map((s, i) => (had(s, q) ? i : -1)).filter((i) => i >= 0);
    const nq = got.length;
    const answered = got.filter((i) => markAnswer(q, subs[i].answers[q.id], subs[i].who).answered).length;
    const rightN = got.filter((i) => correct[i][qi]).length;
    const right = nq ? rightN / nq : null;
    const share = (idx: number[]) => idx.filter((i) => correct[i][qi]).length / idx.length;
    const up = upper.filter((i) => had(subs[i], q)), low = lower.filter((i) => had(subs[i], q));
    const separates = nq >= 4 && up.length && low.length ? share(up) - share(low) : null;
    const t = typeOf(q);
    const rightOnes = t === 'MULTI' ? metaOf(q).correct ?? [] : [q.correctAnswer];
    const chose = (given: Given | undefined | null, option: string) => (Array.isArray(given) ? given.includes(option) : given === option);
    const counts = t === 'CHOICE' || t === 'TRUE_FALSE' || t === 'MULTI'
      ? q.options.map((option) => ({ option, n: got.filter((i) => chose(subs[i].answers[q.id], option)).length, correct: rightOnes.includes(option) }))
      : [];
    const flags: string[] = [];
    const topWrong = counts.filter((c) => !c.correct).sort((a, b) => b.n - a.n)[0];
    const rightCount = counts.find((c) => c.correct)?.n ?? 0;
    if (right != null && nq >= 3 && right < 0.3) flags.push('Most students got this wrong: check the wording and the answer key.');
    if (separates != null && separates < 0) flags.push('Students who did better overall got this wrong more often: the answer key may be wrong, or the question is confusing.');
    else if (separates != null && separates < 0.15 && right != null && right >= 0.3 && right <= 0.9) flags.push('It doesn’t separate students who know the topic from those who don’t.');
    if (topWrong && nq >= 3 && t !== 'MULTI' && topWrong.n > rightCount) flags.push(`More students chose “${topWrong.option}” than the right answer.`);
    const unused = counts.filter((c) => !c.correct && c.n === 0);
    if (nq >= 5 && unused.length && unused.length < counts.length - 1) flags.push(`Nobody chose ${unused.map((c) => `“${c.option}”`).join(', ')}: ${unused.length === 1 ? 'it isn’t' : 'they aren’t'} a believable wrong answer.`);
    if (right != null && nq >= 5 && right === 1) flags.push('Everyone got this right: fine as a warm-up, but it doesn’t tell you much.');
    const fix = flags.some((f) => !f.startsWith('Everyone') && !f.startsWith('Nobody'));
    return { id: q.id, answered, right: right == null ? null : r2(right), separates: separates == null ? null : r2(separates), counts, blank: nq - answered, flags, fix };
  });

  // KR-20 consistency over right/wrong items (not when students got different questions).
  let consistency: number | null = null;
  const k = items.length;
  if (n >= 5 && k >= 3 && !subs.some((s) => s.drawn)) {
    const mean = rightCounts.reduce((a, b) => a + b, 0) / n;
    const variance = rightCounts.reduce((a, t) => a + (t - mean) ** 2, 0) / n;
    const pq = items.reduce((a, _q, qi) => { const p = correct.filter((row) => row[qi]).length / n; return a + p * (1 - p); }, 0);
    consistency = variance > 0 ? Math.max(0, r2((k / (k - 1)) * (1 - pq / variance))) : null;
  }
  return { students: n, items: results, consistency, toFix: results.filter((r) => r.fix).length };
}
