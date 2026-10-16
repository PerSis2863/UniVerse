// Live quiz game (Stage 5 · B4.5): points and streaks. A right answer is worth 1000 points, down to
// 500 when it comes at the very end of the time; each right answer in a row after the first adds a
// streak bonus of 100 (at most 500). Import-free; tested in live-game.test.ts.

export const MAX_POINTS = 1000;

/** Points for one answer: more when quicker. */
export function pointsFor(correct: boolean, ms: number, seconds: number): number {
  if (!correct) return 0;
  const share = Math.min(1, Math.max(0, ms) / (Math.max(1, seconds) * 1000));
  return Math.round(MAX_POINTS * (1 - share / 2));
}

/** The bonus for a streak of `n` right answers in a row (counting this one). */
export const streakBonus = (n: number) => (n >= 2 ? Math.min(500, (n - 1) * 100) : 0);

/** After a question is revealed: each player's new streak and bonus (no answer breaks a streak). */
export function settle(players: { userId: string; streak: number }[], answers: { userId: string; correct: boolean }[]) {
  const right = new Set(answers.filter((a) => a.correct).map((a) => a.userId));
  return players.map((p) => {
    const streak = right.has(p.userId) ? p.streak + 1 : 0;
    return { userId: p.userId, streak, bonus: streakBonus(streak) };
  });
}

/** Players by score, with ranks (equal scores share a rank). */
export function ranked<P extends { score: number; name: string }>(players: P[]): (P & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0, last = Number.NaN;
  return sorted.map((p, i) => { if (p.score !== last) { rank = i + 1; last = p.score; } return { ...p, rank }; });
}
