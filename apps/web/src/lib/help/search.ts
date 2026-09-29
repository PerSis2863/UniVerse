import { HELP, type HelpEntry, type Role } from './knowledge';

// Finds the built-in answer for a question, on the device (no network): words are normalised
// (lower case, accents and simple endings removed, synonyms merged), weighted by how rare they are
// across all answers, and small typos are forgiven.

const STOP = new Set('a an the i me my we our you your to of in on for with and or is are am be do does did can could how what where when who which why it this that there please help want need get my about from at by as if so just'.split(' '));

const SYNONYMS: Record<string, string> = {
  pwd: 'password', passcode: 'password', login: 'sign', logon: 'sign', signin: 'sign',
  mark: 'grade', marks: 'grade', result: 'grade', score: 'grade', gpa: 'grade',
  class: 'course', subject: 'course', module: 'course', enrol: 'enroll',
  exam: 'quiz', test: 'quiz', assessment: 'quiz',
  chat: 'message', dm: 'message', text: 'message', inbox: 'message',
  board: 'whiteboard', canvas: 'whiteboard', draw: 'whiteboard', sketch: 'whiteboard',
  picture: 'photo', image: 'photo', pic: 'photo', img: 'photo',
  certificate: 'credential', cert: 'credential', badge: 'credential',
  job: 'internship', placement: 'internship', work: 'internship',
  volunteer: 'ngo', charity: 'ngo',
  cancel: 'delete', remove: 'delete', erase: 'delete', close: 'delete',
  alert: 'notification', email: 'notification', emails: 'notification',
  plan: 'billing', pricing: 'billing', subscription: 'billing', price: 'billing', upgrade: 'billing',
  schedule: 'timetable', calendar: 'timetable',
  urgent: 'emergency', danger: 'emergency', unsafe: 'emergency',
  teacher: 'teacher', professor: 'teacher', lecturer: 'teacher', tutor: 'teacher',
};

function stem(w: string) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? stem(SYNONYMS[stem(w)] ?? w));
}

/** Levenshtein distance, stopping early once it can't be ≤ max. */
function close(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

interface Indexed { entry: HelpEntry; words: Set<string>; lead: Set<string> }
let index: { items: Indexed[]; idf: Map<string, number> } | null = null;

function build() {
  if (index) return index;
  const items = HELP.map((entry) => {
    const lead = new Set(entry.q.flatMap(tokens));
    const words = new Set([...lead, ...tokens(entry.tags ?? '')]);
    return { entry, words, lead };
  });
  const df = new Map<string, number>();
  for (const it of items) for (const w of it.words) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + items.length / n)]));
  index = { items, idf };
  return index;
}

export interface HelpMatch { entry: HelpEntry; score: number; coverage: number }

/** Best answers for a question, best first. `confident` answers can be shown without asking AI. */
export function searchHelp(question: string, role?: Role, limit = 3): { matches: HelpMatch[]; confident: boolean } {
  const { items, idf } = build();
  const q = [...new Set(tokens(question))];
  if (!q.length) return { matches: [], confident: false };
  const scored: HelpMatch[] = [];
  for (const it of items) {
    if (role && it.entry.roles && !it.entry.roles.includes(role)) continue;
    let score = 0;
    let hits = 0;
    for (const w of q) {
      let weight = 0;
      if (it.words.has(w)) weight = idf.get(w) ?? 1;
      else if (w.length >= 5) {
        for (const x of it.words) if (x.length >= 4 && close(w, x, w.length >= 8 ? 2 : 1)) { weight = (idf.get(x) ?? 1) * 0.8; break; }
      }
      if (weight) {
        hits++;
        score += weight * (it.lead.has(w) ? 1.25 : 1);
      }
    }
    if (hits) scored.push({ entry: it.entry, score: score * (hits / q.length) ** 0.5, coverage: hits / q.length });
  }
  scored.sort((a, b) => b.score - a.score);
  const [top, next] = scored;
  // Confident when the best answer is clearly relevant (strong match, or most of the question's
  // words match) and clearly ahead of the runner-up. Otherwise the question goes to the AI.
  const confident = !!top && top.score >= 2.2 && (top.score >= 5 || top.coverage >= 0.5) && (!next || top.score >= next.score * 1.15);
  return { matches: scored.slice(0, limit), confident };
}

export function suggestions(role?: Role, n = 4): HelpEntry[] {
  const pick = ['whiteboard-share', 'password', 'password-staff', 'grades', 'message', 'approve', 'teacher-grades', 'install', 'ngo'];
  return pick.map((id) => HELP.find((h) => h.id === id)!).filter((h) => h && (!role || !h.roles || h.roles.includes(role))).slice(0, n);
}
