// Paper exams (M291): a printed exam built from a course's question bank, in up to four versions
// (A–D) so neighbours don't share a paper, with an answer key per version and a rubric for written
// questions. Pure logic shared by the server (src/server/exam-papers.ts), the builder and the marking
// sheet (src/components/quizzes/PaperExams.tsx).

export const VERSION_LABELS = ['A', 'B', 'C', 'D'] as const;
export const MAX_ITEMS = 60;
export const MAX_CRITERIA = 6;
const LETTERS = 'ABCDEFGHIJ';

/** One rubric row: what is looked for and the most it can earn. */
export interface Criterion { name: string; points: number }

/** A question as printed: lettered options for choice questions, a rubric for written ones. */
export interface PaperItem {
  id: string;
  question: string;
  /** CHOICE, TRUE_FALSE and MULTI are marked from the key; everything else by hand. */
  kind: 'choice' | 'multi' | 'number' | 'written';
  options: string[];
  /** For choice and multi: the right letters ("B" or "AC"); number: the value; written: a model answer. */
  key: string;
  points: number;
  rubric: Criterion[];
}

export interface PaperVersion { label: string; items: PaperItem[] }

export interface SourceQuestion { id: string; question: string; type: string; options: string[]; correctAnswer: string; points: number; rubric?: Criterion[] }

/** A small seeded generator (mulberry32 over a string hash): the same paper prints the same versions. */
function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], r: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const kindOf = (type: string): PaperItem['kind'] =>
  type === 'CHOICE' || type === 'TRUE_FALSE' ? 'choice' : type === 'MULTI' ? 'multi' : type === 'NUMBER' ? 'number' : 'written';

/** The right options' texts: a CHOICE stores one, a MULTI several separated by "|" or as JSON. */
function rightTexts(q: SourceQuestion): string[] {
  const raw = q.correctAnswer.trim();
  if (raw.startsWith('[')) { try { const v = JSON.parse(raw); if (Array.isArray(v)) return v.map(String); } catch { /* not JSON */ } }
  return raw.split('|').map((s) => s.trim()).filter(Boolean);
}

/** One version's item: options in this version's order, the key as letters in that order. */
function itemFor(q: SourceQuestion, r: () => number, shuffleOptions: boolean): PaperItem {
  const kind = kindOf(q.type);
  const rubric = (q.rubric ?? []).slice(0, MAX_CRITERIA);
  if (kind === 'choice' || kind === 'multi') {
    const options = shuffleOptions && q.type !== 'TRUE_FALSE' ? shuffled(q.options, r) : [...q.options];
    const right = new Set(rightTexts(q));
    const key = options.map((o, i) => (right.has(o) ? LETTERS[i] : '')).join('');
    return { id: q.id, question: q.question, kind, options: options.slice(0, LETTERS.length), key, points: q.points, rubric: [] };
  }
  const points = rubric.length ? rubric.reduce((s, c) => s + c.points, 0) : q.points;
  return { id: q.id, question: q.question, kind, options: [], key: q.correctAnswer, points, rubric };
}

/**
 * The versions of a paper. Version A keeps the teacher's order; the others shuffle the questions
 * (written questions stay at the end, where students expect them) and, if asked, each question's options.
 */
export function buildVersions(questions: SourceQuestion[], opts: { versions: number; shuffleOptions: boolean; seed: string }): PaperVersion[] {
  const n = Math.min(Math.max(Math.round(opts.versions) || 1, 1), VERSION_LABELS.length);
  const list = questions.slice(0, MAX_ITEMS);
  return VERSION_LABELS.slice(0, n).map((label, v) => {
    const r = random(`${opts.seed}:${label}`);
    const order = v === 0 ? list : [...shuffled(list.filter((q) => kindOf(q.type) !== 'written'), r), ...list.filter((q) => kindOf(q.type) === 'written')];
    return { label, items: order.map((q) => itemFor(q, r, v > 0 && opts.shuffleOptions)) };
  });
}

export const paperTotal = (v: PaperVersion) => v.items.reduce((s, i) => s + i.points, 0);

/** What a teacher records per question: the letters or number the student wrote, or the points per criterion. */
export type Marks = Record<string, { answer?: string; rubric?: number[]; points?: number }>;

const letters = (s: string) => [...new Set(s.toUpperCase().replace(/[^A-J]/g, ''))].sort().join('');

/** Points for one item: from the key for choice, multi and number; from the rubric or a hand mark otherwise. */
export function itemScore(item: PaperItem, mark: Marks[string] | undefined): number {
  if (!mark) return 0;
  if (item.kind === 'choice' || item.kind === 'multi') return mark.answer && letters(mark.answer) === letters(item.key) ? item.points : 0;
  if (item.kind === 'number') {
    const a = Number(mark.answer?.replace(',', '.')), k = Number(item.key);
    return mark.answer && Number.isFinite(a) && Number.isFinite(k) && Math.abs(a - k) <= Math.abs(k) * 0.001 + 1e-9 ? item.points : 0;
  }
  if (item.rubric.length && Array.isArray(mark.rubric)) return item.rubric.reduce((s, c, i) => s + Math.min(Math.max(Number(mark.rubric?.[i]) || 0, 0), c.points), 0);
  return Math.min(Math.max(Number(mark.points) || 0, 0), item.points);
}

export const paperScore = (v: PaperVersion, marks: Marks) => v.items.reduce((s, i) => s + itemScore(i, marks[i.id]), 0);

/** A rubric typed by the teacher, kept to sensible rows. */
export function cleanRubric(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    if (!c || typeof c !== 'object') return [];
    const name = typeof (c as Criterion).name === 'string' ? (c as Criterion).name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const points = Math.round(Math.min(Math.max(Number((c as Criterion).points) || 0, 0), 100) * 2) / 2;
    return name && points > 0 ? [{ name, points }] : [];
  }).slice(0, MAX_CRITERIA);
}

/** Marks as sent by the marking sheet, only for the paper's questions. */
export function cleanMarks(raw: unknown, items: PaperItem[]): Marks {
  const out: Marks = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const item of items) {
    const m = (raw as Record<string, unknown>)[item.id];
    if (!m || typeof m !== 'object') continue;
    const x = m as { answer?: unknown; rubric?: unknown; points?: unknown };
    out[item.id] = {
      ...(typeof x.answer === 'string' ? { answer: x.answer.slice(0, 20) } : {}),
      ...(Array.isArray(x.rubric) ? { rubric: x.rubric.slice(0, MAX_CRITERIA).map((n) => Number(n) || 0) } : {}),
      ...(x.points !== undefined ? { points: Number(x.points) || 0 } : {}),
    };
  }
  return out;
}
