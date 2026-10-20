// Careers (Stage 5 · Q15): the rules shared by the server, the pages and the tests. The application
// tracker's stages, interview-practice checks that need no AI (filler words, the STAR parts, length),
// built-in questions for when AI is off, and mentor slot limits.

// ── Application tracker ────────────────────────────────────────────────
export const STAGES = ['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { SAVED: 'Saved', APPLIED: 'Applied', INTERVIEW: 'Interview', OFFER: 'Offer', REJECTED: 'Not this time' };
export const isStage = (v: unknown): v is Stage => typeof v === 'string' && (STAGES as readonly string[]).includes(v);

/** An application made on UniVerse: its stage follows what the reviewer set. */
export function stageOfApplication(status: string): Stage {
  if (status === 'ACCEPTED') return 'OFFER';
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'REJECTED';
  return 'APPLIED';
}

export interface TrackerDoc { name: string; url: string }
/** Documents kept with an application: up to 8, each a name and a file from this app or an https link. */
export function cleanDocuments(raw: unknown, isAppFile: (u: string) => boolean): TrackerDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackerDoc[] = [];
  for (const d of raw.slice(0, 8)) {
    const o = (d ?? {}) as Partial<TrackerDoc>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 120) : '';
    if (!name || !url || url.length > 1000) continue;
    if (!isAppFile(url) && !/^https:\/\/[^\s]+$/i.test(url)) continue;
    out.push({ name, url });
  }
  return out;
}

/** An outside link the student saved: https only (or http, made https). */
export function cleanLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim().replace(/^http:\/\//i, 'https://'));
    return u.protocol === 'https:' ? u.toString().slice(0, 1000) : null;
  } catch { return null; }
}

// ── Interview practice ─────────────────────────────────────────────────
const FILLER_WORDS = ['um', 'umm', 'uh', 'uhh', 'erm', 'er', 'ah', 'hmm', 'basically', 'literally', 'actually'];
const FILLER_PHRASES = ['you know', 'i mean', 'sort of', 'kind of', 'you see'];

/** Filler words and phrases in an answer: the total and the most used. "like" counts only between pauses (", like,"). */
export function countFillers(text: string): { total: number; top: { word: string; n: number }[] } {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')} `;
  const counts = new Map<string, number>();
  const add = (w: string, n: number) => { if (n) counts.set(w, (counts.get(w) ?? 0) + n); };
  for (const p of FILLER_PHRASES) add(p, t.split(new RegExp(`\\b${p.replace(' ', '\\s')}\\b`, 'g')).length - 1);
  for (const w of FILLER_WORDS) add(w, (t.match(new RegExp(`\\b${w}\\b`, 'g')) ?? []).length);
  add('like', (t.match(/(^|[,.;!?…-]\s*)like\s*,/g) ?? []).length + (t.match(/\blike,\s*(um|uh|you know)\b/g) ?? []).length);
  const top = [...counts.entries()].map(([word, n]) => ({ word, n })).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word));
  return { total: top.reduce((s, x) => s + x.n, 0), top: top.slice(0, 5) };
}

const CUES: Record<'S' | 'T' | 'A' | 'R', RegExp> = {
  S: /\b(when i was|at my|during (my|a|the|our)|in my (first|second|third|final|last)|last (year|summer|semester|term)|there was a time|once,|the situation|in (a|my|our) (project|team|class|internship|job))\b/,
  T: /\b(my (task|job|role|goal|responsibility) was|i was (responsible|asked|in charge)|i (needed|had) to|we (needed|had) to|the (goal|aim|challenge|problem) was)\b/,
  A: /\b(so i|i (decided|built|created|led|organi[sz]ed|wrote|designed|implemented|made|set up|planned|spoke|talked|reached out|analy[sz]ed|fixed|tested|started|proposed|asked|taught|volunteered))\b/,
  R: /\b(as a result|the result|which (led|meant)|in the end|we (achieved|won|finished|delivered|raised|reduced|increased|improved)|(increased|reduced|improved|saved|grew) (by|the)|\d+\s?%|i learn(ed|t))\b/,
};
/** Which parts of a STAR answer (Situation, Task, Action, Result) the answer seems to have, e.g. "SAR". */
export function starParts(text: string): string {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  return (['S', 'T', 'A', 'R'] as const).filter((k) => CUES[k].test(t)).join('');
}
export const STAR_NAMES: Record<string, string> = { S: 'Situation', T: 'Task', A: 'Action', R: 'Result' };

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
/** Speaking time at about 130 words a minute; a good answer is roughly 1–2 minutes. */
export function lengthAdvice(words: number): string | null {
  if (words < 60) return 'A bit short: aim for one to two minutes (about 130–260 words) with an example.';
  if (words > 330) return 'Quite long: keep it to about two minutes by cutting the background and keeping the result.';
  return null;
}

/** Questions to practise with when AI is off or busy: general ones, plus two about the role. */
export function builtInQuestions(role: string): string[] {
  const r = role.trim() || 'this role';
  return [
    'Tell me about yourself.',
    `Why do you want to work as ${/^(a|an|the)\s/i.test(r) ? r : `a ${r}`}?`,
    'Tell me about a time you worked in a team to solve a problem.',
    'Describe a time you made a mistake. What did you do and what did you learn?',
    `Which of your skills would help you most in ${r}? Give an example.`,
    'Tell me about something you are proud of achieving.',
  ];
}

/** Questions the AI wrote: 4–8 short distinct questions. */
export function cleanQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((q) => (typeof q === 'string' ? q.replace(/\s+/g, ' ').trim().slice(0, 300) : ''))
    .filter((q) => q.length >= 8 && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
    .slice(0, 8);
}

// ── Mentor slots ───────────────────────────────────────────────────────
export const SLOT_MINUTES = [15, 30, 45, 60] as const;
export const MAX_SLOTS_AHEAD = 40;
export const SLOT_DAYS_AHEAD = 60;
export const MAX_BOOKINGS = 3;
/** Two slots overlap when one starts before the other ends. */
export const overlaps = (a: { startAt: Date; minutes: number }, b: { startAt: Date; minutes: number }) =>
  a.startAt.getTime() < b.startAt.getTime() + b.minutes * 60_000 && b.startAt.getTime() < a.startAt.getTime() + a.minutes * 60_000;
/** A graduation year to show: 1950 to five years from now. */
export const cleanGradYear = (v: unknown, now = new Date()) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1950 && n <= now.getFullYear() + 5 ? n : null;
};
