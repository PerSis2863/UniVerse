// Early warning's "what to do" (M292): for each reason a student is flagged, the steps that usually
// help, each leading to a tool the teacher already has. Plain rules, no AI. And the score's history:
// whether the student is getting worse or better since they were flagged.

export type Step = { id: string; title: string; why: string; href?: string; label?: string };
export type Point = { at: string; score: number };

const STEPS: Record<string, Step[]> = {
  attendance: [
    { id: 'ask-why', title: 'Ask what’s getting in the way of coming to class', why: 'Missed classes often have a reason outside school: transport, work, health, family.' },
    { id: 'catch-up', title: 'Point them to what they missed', why: 'Notes and recordings make it easier to come back without feeling lost.', href: '/teacher/courses', label: 'Your courses' },
  ],
  grades: [
    { id: 'office-hours', title: 'Invite them to office hours', why: 'A short one-to-one usually finds the topic that is holding them back.', href: '/calls', label: 'Office hours' },
    { id: 'mastery', title: 'Look at their weak topics together', why: 'The mastery map shows which topics they haven’t got yet.', href: '/teacher/mastery', label: 'Mastery map' },
  ],
  'grade-drop': [
    { id: 'latest-work', title: 'Go through their latest work with them', why: 'A sudden drop is often one misunderstanding that spreads to later topics.', href: '/teacher/grades', label: 'Gradebook' },
  ],
  quizzes: [
    { id: 'second-chance', title: 'Give a second chance on the missed quiz', why: 'A late try keeps the topic from becoming a gap.', href: '/teacher/quizzes', label: 'Quizzes' },
  ],
  inactive: [
    { id: 'nudge', title: 'Send a short, friendly message', why: 'Students who stop opening UniVerse usually come back after one personal note.' },
  ],
};

/** The steps for a flag's reasons, without repeats, most useful first (the order reasons are found). */
export function stepsFor(reasons: { code: string }[]): Step[] {
  const seen = new Set<string>();
  return reasons.flatMap((r) => STEPS[r.code] ?? []).filter((s) => !seen.has(s.id) && seen.add(s.id)).slice(0, 5);
}

const DAY = 86_400_000;

/** A flag's history with a new score: one point per day (the day's last), the latest 12 kept. */
export function withScore(history: unknown, score: number, now = Date.now()): Point[] {
  const list = Array.isArray(history) ? history.filter((p): p is Point => !!p && typeof p.at === 'string' && typeof p.score === 'number') : [];
  const day = new Date(now).toISOString().slice(0, 10);
  const kept = list.filter((p) => p.at.slice(0, 10) !== day);
  return [...kept, { at: new Date(now).toISOString(), score }].slice(-12);
}

/** Worse or better: the score now against its value about a week before (10 points or more counts). */
export function trendOf(history: Point[], now = Date.now()): 'worse' | 'better' | 'steady' {
  if (history.length < 2) return 'steady';
  const latest = history[history.length - 1];
  const before = [...history].reverse().find((p) => now - Date.parse(p.at) >= 6 * DAY) ?? history[0];
  const d = latest.score - before.score;
  return d >= 10 ? 'worse' : d <= -10 ? 'better' : 'steady';
}

/** The stored history (a JSON column), only well-formed points. */
export function readHistory(raw: unknown): Point[] {
  if (typeof raw !== 'string') return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((p): p is Point => !!p && typeof p.at === 'string' && typeof p.score === 'number').slice(-12) : [];
  } catch { return []; }
}
