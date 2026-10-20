import { words } from './text-search';

// The course tutor's modes and the teacher's rule for a course (Stage 5 · Q13): a student picks how
// the tutor answers (as usual, explained simply, or hints only); a teacher can make a course hints
// only, add their own instruction ("always ask for the units"), and turn the tutor off for a time
// (before an exam). Also how maths and chemistry are written so the page can show them properly,
// and the common questions of a course grouped for the teacher, with no names.

export type TutorMode = 'normal' | 'simple' | 'hints';
export const TUTOR_MODES: { value: TutorMode; label: string }[] = [
  { value: 'normal', label: 'As usual' },
  { value: 'simple', label: 'Explain simply' },
  { value: 'hints', label: 'Hints only' },
];

export interface TutorRule { hintsOnly: boolean; note: string; off: boolean; offUntil: string | null; /** Whisper TA off in this course's class calls (Stage 5 · Q22). */ whisperOff: boolean }
export const NO_RULE: TutorRule = { hintsOnly: false, note: '', off: false, offUntil: null, whisperOff: false };

/** A course's stored rule (JSON) or a request's, cleaned. */
export function cleanRule(raw: unknown): TutorRule {
  let o: Record<string, unknown> = {};
  if (typeof raw === 'string') { try { o = JSON.parse(raw) ?? {}; } catch { o = {}; } } else if (raw && typeof raw === 'object') o = raw as Record<string, unknown>;
  const until = typeof o.offUntil === 'string' && !Number.isNaN(Date.parse(o.offUntil)) ? new Date(o.offUntil).toISOString() : null;
  return { whisperOff: o.whisperOff === true, hintsOnly: o.hintsOnly === true, note: typeof o.note === 'string' ? o.note.trim().slice(0, 500) : '', off: o.off === true, offUntil: o.off === true ? until : null };
}

/** Whether the tutor is off for students right now (off with no end, or until a time still ahead). */
export const tutorOff = (r: TutorRule, now = Date.now()) => r.off && (!r.offUntil || Date.parse(r.offUntil) > now);

/** The mode used: the student's choice, unless the course is hints only. */
export function modeFor(asked: unknown, r: TutorRule): TutorMode {
  if (r.hintsOnly) return 'hints';
  return asked === 'simple' || asked === 'hints' ? asked : 'normal';
}

/** How to write maths and chemistry, in every AI answer the page shows (rendered with KaTeX). */
export const MATH_RULE = 'Write any maths in LaTeX between single dollar signs, like $x^2 + 1$ (double dollar signs for a formula on its own line), and chemistry with \\ce{...} inside dollar signs, like $\\ce{2H2 + O2 -> 2H2O}$. Never put dollar signs around plain words or money amounts; write money as "USD 5".';

/** What the mode and the teacher's instruction add to the tutor's instructions. */
export function modeInstructions(mode: TutorMode, r: TutorRule): string {
  const lines = [MATH_RULE];
  if (mode === 'simple') lines.push('Explain as simply as you can: everyday words, a short example or comparison, one idea at a time, as if to a 14-year-old. Define any term you must use.');
  if (mode === 'hints') lines.push('Give hints only: never the final answer or a full worked solution, even if asked. Ask a guiding question, point to the idea or formula to use, and check the student’s next step. If they insist, explain that this course’s tutor gives hints only.');
  if (r.note) lines.push(`The teacher's instruction for this course (follow it): ${r.note}`);
  return lines.join('\n');
}

// ── Common questions, for the teacher ────────────────────────────────────────────────────────────

const QUESTION_WORDS = new Set('explain please help understand mean means difference between example examples give tell show work works use used using get find need know does doesnt dont make about like just also question questions answer answers many much'.split(' '));
/** "moles" and "mole" alike: a plain plural's s dropped. */
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') ? w.slice(0, -1) : w);
const keyWords = (text: string) => [...new Set(words(text).filter((w) => !QUESTION_WORDS.has(w) && !/^\d+$/.test(w)).map(stem))];

export interface QuestionGroup { label: string; asked: number; people: number; examples: string[]; last: string }

/**
 * Questions asked of a course's tutor grouped by what they're about (shared key words), keeping only
 * groups asked by at least `minPeople` different students, so no one's question stands alone. No names.
 */
export function groupQuestions(items: { userId: string; text: string; at: string }[], minPeople = 2): QuestionGroup[] {
  type G = { keys: Map<string, number>; texts: string[]; people: Set<string>; last: string };
  const groups: G[] = [];
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    const keys = keyWords(it.text);
    if (!keys.length) continue;
    let best: G | null = null, bestScore = 0;
    for (const g of groups) {
      const shared = keys.filter((k) => g.keys.has(k)).length;
      const top = [...g.keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
      const score = shared / Math.min(keys.length, Math.max(1, top.length));
      if (shared >= 1 && score >= 0.5 && score > bestScore) { best = g; bestScore = score; }
    }
    const g = best ?? (groups[groups.push({ keys: new Map(), texts: [], people: new Set(), last: it.at }) - 1]);
    for (const k of keys) g.keys.set(k, (g.keys.get(k) ?? 0) + 1);
    g.texts.push(it.text.trim());
    g.people.add(it.userId);
    if (it.at > g.last) g.last = it.at;
  }
  return groups
    .filter((g) => g.people.size >= minPeople)
    .map((g) => ({
      label: [...g.keys.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k).join(', '),
      asked: g.texts.length,
      people: g.people.size,
      examples: [...new Set(g.texts)].sort((a, b) => a.length - b.length).slice(0, 3),
      last: g.last,
    }))
    .sort((a, b) => b.people - a.people || b.asked - a.asked || b.last.localeCompare(a.last));
}
