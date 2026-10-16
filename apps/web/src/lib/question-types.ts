// Quiz question types (Stage 5 · B4.1): one answer, true or false, several answers, short answer,
// fill in the blanks, matching, putting in order, a number within a tolerance, a maths expression,
// and tapping on a picture. Every place that marks or shows an answer goes through here, so each
// type is marked the same way everywhere. Pure; tested in question-types.test.ts.

import { isUploadedFileUrl } from './file-urls';
import { evaluate, letters, parseExpr, sameExpr } from './math-expr';
import { hash, seeded, shuffled } from './seeded-shuffle';

export const QUESTION_TYPES = ['CHOICE', 'TRUE_FALSE', 'MULTI', 'SHORT', 'BLANKS', 'MATCH', 'ORDER', 'NUMBER', 'MATH', 'HOTSPOT'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const isQuestionType = (v: unknown): v is QuestionType => typeof v === 'string' && (QUESTION_TYPES as readonly string[]).includes(v);

export const TYPE_LABELS: Record<QuestionType, string> = {
  CHOICE: 'One answer', TRUE_FALSE: 'True or false', MULTI: 'Several answers', SHORT: 'Short answer',
  BLANKS: 'Fill in the blanks', MATCH: 'Matching', ORDER: 'Put in order', NUMBER: 'Number',
  MATH: 'Maths expression', HOTSPOT: 'Tap on the picture',
};
/** Types whose answer is one of its options (the old multiple choice, polls, calls, retries). */
export const CHOICE_TYPES: readonly QuestionType[] = ['CHOICE', 'TRUE_FALSE'];

/** The answer key and settings, kept as JSON in `meta` (never sent to students). */
export interface Meta {
  /** MULTI: the right options; `partial`: credit for each right pick, less each wrong one. */
  correct?: string[]; partial?: boolean;
  /** SHORT: accepted answers (case, accents, spaces and end punctuation don't matter). MATH: the
   *  accepted expressions (any expression equal to one of them is right). */
  accepted?: string[];
  /** BLANKS: accepted answers for each blank, in order. */
  blanks?: string[][];
  /** MATCH: each prompt and its match. */
  pairs?: { left: string; right: string }[];
  /** ORDER: the items in the right order. */
  order?: string[];
  /** NUMBER: the answer, how far off still counts, a unit shown next to the box. */
  value?: number; tolerance?: number; unit?: string;
  /** NUMBER with numbers that change for each student (B4.2): each letter's range, and the answer's
   *  formula in those letters; the text shows them as {a}. */
  vars?: Record<string, Range>; formula?: string;
  /** HOTSPOT: the picture, and the areas that count (percent of its width and height). */
  image?: string; areas?: Area[];
  /** Any type (B4.4): a hint shown in practice after a wrong try, and an explanation shown with the
   *  answer (in practice, and in the quiz review once answers are shown). */
  hint?: string; explain?: string;
}
export interface Area { x: number; y: number; w: number; h: number }
export interface Range { min: number; max: number; step: number }

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
/** A NUMBER question whose numbers change for each student. */
export const isVariant = (m: Meta) => !!m.formula && !!m.vars && Object.keys(m.vars).length > 0;
/** The numbers one student gets (the same every time: seeded by the student and the question). */
export function valuesFor(m: Meta, who: string, questionId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(m.vars ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, r]) => {
    const count = Math.max(1, Math.floor((r.max - r.min) / r.step + 1e-9) + 1);
    const k = Math.floor(seeded(hash(`${who}:${questionId}:${name}`))() * count);
    return [name, Number((r.min + r.step * k).toFixed(Math.min(6, decimals(r.step) + decimals(r.min))))];
  }));
}
/** The text with each {a} replaced by the student's number. */
export const fillText = (text: string, values: Record<string, number>) => text.replace(/\{([a-z])\}/g, (all, n: string) => (n in values ? String(values[n]) : all));
/** The right number for one student (null when it can't be worked out). */
export function variantAnswer(m: Meta, who: string, questionId: string): number | null {
  const tree = m.formula ? parseExpr(m.formula) : null;
  if (!tree) return null;
  const v = evaluate(tree, valuesFor(m, who, questionId));
  return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : null;
}

/** A tapped point "x,y" (percent of the picture's width and height). */
export function readPoint(s: string): { x: number; y: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const x = Number(m[1]), y = Number(m[2]);
  return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
}
export const inArea = (p: { x: number; y: number }, a: Area) => p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h;

/** A question as stored: `options` JSON, `meta` JSON text. */
export interface StoredQuestion { id?: string; type?: string | null; question?: string; options: unknown; correctAnswer: string; meta?: string | null }
/** What a student gives: text, or one text per blank / prompt / place. */
export type Given = string | string[];

/** Where a blank goes in a fill-in-the-blanks question's text. */
export const BLANK = '_____';
export const BLANK_RE = /_{5}/g;

const MAX_TEXT = 300;
const cut = (v: unknown, n = MAX_TEXT) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const typeOf = (q: { type?: string | null }): QuestionType => (isQuestionType(q.type) ? q.type : 'CHOICE');
export const optionsOf = (q: { options: unknown }): string[] => (Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : []);
export function metaOf(q: { meta?: string | null }): Meta {
  try { const m = q.meta ? (JSON.parse(q.meta) as unknown) : null; return m && typeof m === 'object' ? (m as Meta) : {}; } catch { return {}; }
}

/** Text compared loosely: case, accents, spaces and end punctuation don't matter. */
export const loose = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?;:,]+$/, '');

/** A number as people type it: "3.5", "3,5", "-2", "1e3", "1,000.5", "12 cm". */
export function readNumber(s: string): number | null {
  let t = s.trim().replace(/\s+/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const m = /^[-+−]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(t);
  if (!m) return null;
  const n = Number(m[0].replace('−', '-'));
  return Number.isFinite(n) ? n : null;
}

const asList = (g: Given | null | undefined) => (Array.isArray(g) ? g : []);
const asText = (g: Given | null | undefined) => (typeof g === 'string' ? g : '');
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How much of a question's points an answer earns (0 to 1), and whether anything was given. `who`:
 * the student, for numbers that change per student (without it those can't be marked).
 */
export function markAnswer(q: StoredQuestion, given: Given | null | undefined, who?: string): { credit: number; answered: boolean } {
  const m = metaOf(q);
  switch (typeOf(q)) {
    case 'CHOICE': case 'TRUE_FALSE': {
      const g = asText(given);
      return { credit: g !== '' && g === q.correctAnswer ? 1 : 0, answered: g !== '' };
    }
    case 'MULTI': {
      const picked = new Set(asList(given));
      const right = new Set(m.correct ?? []);
      if (!picked.size) return { credit: 0, answered: false };
      const hits = [...picked].filter((x) => right.has(x)).length;
      const misses = picked.size - hits;
      if (m.partial) return { credit: right.size ? round2(Math.max(0, (hits - misses) / right.size)) : 0, answered: true };
      return { credit: hits === right.size && misses === 0 ? 1 : 0, answered: true };
    }
    case 'SHORT': {
      const g = loose(asText(given));
      return { credit: g && (m.accepted ?? []).some((a) => loose(a) === g) ? 1 : 0, answered: g !== '' };
    }
    case 'BLANKS': {
      const blanks = m.blanks ?? [];
      const g = asList(given);
      if (!blanks.length) return { credit: 0, answered: false };
      const right = blanks.filter((acc, k) => { const x = loose(g[k] ?? ''); return !!x && acc.some((a) => loose(a) === x); }).length;
      return { credit: round2(right / blanks.length), answered: g.some((x) => x.trim() !== '') };
    }
    case 'MATCH': {
      const pairs = m.pairs ?? [];
      const g = asList(given);
      if (!pairs.length) return { credit: 0, answered: false };
      return { credit: round2(pairs.filter((p, k) => g[k] === p.right).length / pairs.length), answered: g.some((x) => x !== '') };
    }
    case 'ORDER': {
      const order = m.order ?? [];
      const g = asList(given);
      if (!order.length || !g.length) return { credit: 0, answered: false };
      return { credit: round2(order.filter((x, k) => g[k] === x).length / order.length), answered: true };
    }
    case 'NUMBER': {
      const g = asText(given);
      const x = readNumber(g);
      const value = isVariant(m) ? (who && q.id ? variantAnswer(m, who, q.id) : null) : m.value;
      if (x == null || typeof value !== 'number') return { credit: 0, answered: g.trim() !== '' };
      return { credit: Math.abs(x - value) <= (m.tolerance ?? 0) + 1e-9 * Math.max(1, Math.abs(value)) ? 1 : 0, answered: true };
    }
    case 'MATH': {
      const g = asText(given);
      const mine = parseExpr(g);
      if (!mine) return { credit: 0, answered: g.trim() !== '' };
      return { credit: (m.accepted ?? []).some((a) => { const key = parseExpr(a); return !!key && sameExpr(key, mine); }) ? 1 : 0, answered: true };
    }
    case 'HOTSPOT': {
      const p = readPoint(asText(given));
      return { credit: p && (m.areas ?? []).some((a) => inArea(p, a)) ? 1 : 0, answered: !!p };
    }
  }
}

/** Fully right (for item analysis, mastery and second chances). */
export const isRight = (q: StoredQuestion, given: Given | null | undefined, who?: string) => markAnswer(q, given, who).credit >= 1;

/** A student's answer made safe to store (null: nothing usable). */
export function cleanGiven(q: StoredQuestion, raw: unknown): Given | null {
  const t = typeOf(q);
  if (t === 'CHOICE' || t === 'TRUE_FALSE' || t === 'SHORT' || t === 'NUMBER' || t === 'MATH' || t === 'HOTSPOT') return typeof raw === 'string' && raw.trim() ? raw.slice(0, 500) : null;
  if (!Array.isArray(raw)) return null;
  const list = raw.slice(0, 20).map((x) => (typeof x === 'string' ? x.slice(0, MAX_TEXT) : ''));
  return t === 'MULTI' ? [...new Set(list.filter(Boolean))] : list;
}

/** An answer in words, for reviews and the teacher. */
export function answerText(q: StoredQuestion, given: Given | null | undefined): string {
  if (given == null) return '';
  if (typeof given === 'string') return typeOf(q) === 'HOTSPOT' ? (readPoint(given) ? 'A point on the picture' : '') : given;
  const m = metaOf(q);
  switch (typeOf(q)) {
    case 'MATCH': return (m.pairs ?? []).map((p, k) => `${p.left} → ${given[k] || '—'}`).join('; ');
    case 'ORDER': return given.join(' → ');
    case 'BLANKS': return given.map((x) => x || '—').join(' · ');
    default: return given.join(', ');
  }
}

/** The right answer in words (what's kept in `correctAnswer` for the newer types). */
export function keyText(type: QuestionType, m: Meta, correctAnswer = ''): string {
  switch (type) {
    case 'CHOICE': case 'TRUE_FALSE': return correctAnswer;
    case 'MULTI': return (m.correct ?? []).join(', ');
    case 'SHORT': return (m.accepted ?? []).join(' / ');
    case 'BLANKS': return (m.blanks ?? []).map((a) => a.join(' / ')).join(' · ');
    case 'MATCH': return (m.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join('; ');
    case 'ORDER': return (m.order ?? []).join(' → ');
    case 'NUMBER': return `${isVariant(m) ? `= ${m.formula}` : m.value ?? ''}${m.tolerance ? ` (± ${m.tolerance})` : ''}${m.unit ? ` ${m.unit}` : ''}`;
    case 'MATH': return (m.accepted ?? []).join(' / ');
    case 'HOTSPOT': return (m.areas ?? []).length > 1 ? `One of the ${(m.areas ?? []).length} marked areas` : 'The marked area';
  }
}

/** The right answer in words for one student (their own number when the numbers change). */
export function keyFor(q: StoredQuestion, who?: string): string {
  const m = metaOf(q);
  if (typeOf(q) !== 'NUMBER' || !isVariant(m) || !who || !q.id) return q.correctAnswer;
  const v = variantAnswer(m, who, q.id);
  return `${v ?? '?'}${m.tolerance ? ` (± ${m.tolerance})` : ''}${m.unit ? ` ${m.unit}` : ''}`;
}

/** What a student may see of a question's settings (no answers). */
export interface Ask { many?: boolean; blanks?: number; lefts?: string[]; unit?: string; image?: string; math?: boolean }

/**
 * A question for a student: no answer key, options in their own order where that's safe, and their
 * own numbers in the text when the numbers change per student (`who`).
 */
export function forStudent<Q extends StoredQuestion & { id: string }>(q: Q, seed: string | null, who?: string): Omit<Q, 'correctAnswer' | 'meta'> & { type: QuestionType; options: string[]; ask: Ask } {
  // Everything but the key.
  const rest = Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'correctAnswer' && k !== 'meta')) as Omit<Q, 'correctAnswer' | 'meta'>;
  const t = typeOf(q);
  const m = metaOf(q);
  const opts = optionsOf(q);
  const mix = (xs: string[]) => (seed ? shuffled(xs, `${seed}:${q.id}`) : xs);
  const ask: Ask = {};
  let options = opts;
  if (t === 'CHOICE' || t === 'MULTI' || t === 'MATCH') options = mix(opts);
  // The items are kept scrambled already, and get each student's own order on top.
  if (t === 'ORDER') options = mix(opts);
  if (t === 'SHORT' || t === 'NUMBER' || t === 'BLANKS' || t === 'MATH' || t === 'HOTSPOT') options = [];
  if (t === 'MATH') ask.math = true;
  if (t === 'HOTSPOT' && m.image) ask.image = m.image;
  if (t === 'MULTI') ask.many = true;
  if (t === 'BLANKS') ask.blanks = (m.blanks ?? []).length;
  if (t === 'MATCH') ask.lefts = (m.pairs ?? []).map((p) => p.left);
  if (t === 'NUMBER' && m.unit) ask.unit = m.unit;
  const filled = t === 'NUMBER' && isVariant(m) && who && typeof q.question === 'string' ? { question: fillText(q.question, valuesFor(m, who, q.id)) } : {};
  return { ...rest, ...filled, type: t, options, ask };
}

/** The question as the teacher writes it, checked; or the reason it can't be saved. */
export interface QuestionInput {
  type?: unknown; question?: unknown; options?: unknown; correctAnswer?: unknown;
  correct?: unknown; partial?: unknown; accepted?: unknown; pairs?: unknown; extra?: unknown; items?: unknown;
  value?: unknown; tolerance?: unknown; unit?: unknown; image?: unknown; areas?: unknown;
  /** NUMBER with numbers that change: the formula, and [{ name, min, max, step }]. */
  formula?: unknown; vars?: unknown;
  /** Any type: a hint and an explanation (optional). */
  hint?: unknown; explain?: unknown;
}
export interface CleanQuestion { type: QuestionType; question: string; options: string[]; correctAnswer: string; meta: string | null }

const texts = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => cut(x)).filter(Boolean).slice(0, max);
const distinct = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length;

export function cleanQuestionInput(b: QuestionInput): CleanQuestion | string {
  const type: QuestionType = isQuestionType(b.type) ? b.type : 'CHOICE';
  let question = typeof b.question === 'string' ? b.question.trim().slice(0, 1000) : '';
  if (!question) return 'A question needs its text.';
  const hint = cut(b.hint, 500), explain = cut(b.explain, 1000);
  const done = (options: string[], meta: Meta | null, correctAnswer?: string): CleanQuestion => {
    const m: Meta | null = hint || explain ? { ...(meta ?? {}), ...(hint ? { hint } : {}), ...(explain ? { explain } : {}) } : meta;
    return { type, question, options, correctAnswer: correctAnswer ?? keyText(type, meta ?? {}), meta: m ? JSON.stringify(m) : null };
  };
  switch (type) {
    case 'CHOICE': {
      const options = texts(b.options, 99);
      if (options.length < 2 || options.length > 6) return 'Give 2 to 6 answer options.';
      if (!distinct(options)) return 'Answer options must be different.';
      const c = cut(b.correctAnswer);
      const right = options.find((o) => o === c) ?? options.find((o) => o.toLowerCase() === c.toLowerCase());
      if (!right) return 'The right answer must be one of the options.';
      return done(options, null, right);
    }
    case 'TRUE_FALSE': {
      const c = cut(b.correctAnswer).toLowerCase();
      if (c !== 'true' && c !== 'false') return 'Say whether the statement is true or false.';
      return done(['True', 'False'], null, c === 'true' ? 'True' : 'False');
    }
    case 'MULTI': {
      const options = texts(b.options, 99);
      if (options.length < 2 || options.length > 8) return 'Give 2 to 8 answer options.';
      if (!distinct(options)) return 'Answer options must be different.';
      const correct = options.filter((o) => texts(b.correct, 8).some((c) => c.toLowerCase() === o.toLowerCase()));
      if (!correct.length) return 'Tick at least one right option.';
      return done(options, { correct, ...(b.partial === true ? { partial: true } : {}) });
    }
    case 'SHORT': {
      const accepted = [...new Set(texts(b.accepted, 10))];
      if (!accepted.length) return 'Give at least one accepted answer.';
      return done([], { accepted });
    }
    case 'BLANKS': {
      // The teacher writes the blanks in the text: "Water boils at [[100]] °C at [[sea level|sea-level]]."
      const blanks: string[][] = [];
      question = question.replace(BLANK_RE, '____').replace(/\[\[([^\]]{1,200})\]\]/g, (_, inner: string) => {
        blanks.push([...new Set(inner.split('|').map((x) => cut(x)).filter(Boolean))].slice(0, 6));
        return BLANK;
      });
      if (!blanks.length) return 'Put each blank’s answer in double brackets, like [[Paris]].';
      if (blanks.length > 10) return 'A question can have up to 10 blanks.';
      if (blanks.some((a) => !a.length)) return 'Each blank needs an answer.';
      return done([], { blanks });
    }
    case 'MATCH': {
      const raw = Array.isArray(b.pairs) ? b.pairs.slice(0, 8) : [];
      const pairs = raw.map((p) => { const o = (p && typeof p === 'object' ? p : {}) as { left?: unknown; right?: unknown }; return { left: cut(o.left), right: cut(o.right) }; }).filter((p) => p.left && p.right);
      if (pairs.length < 2) return 'Give at least 2 pairs to match.';
      if (!distinct(pairs.map((p) => p.left))) return 'Each prompt must be different.';
      const extra = texts(b.extra, 4).filter((x) => !pairs.some((p) => p.right.toLowerCase() === x.toLowerCase()));
      const pool = [...new Set([...pairs.map((p) => p.right), ...extra])];
      return done(shuffled(pool, question), { pairs });
    }
    case 'ORDER': {
      const order = texts(b.items, 8);
      if (order.length < 2) return 'Give 2 to 8 items to put in order.';
      if (!distinct(order)) return 'Each item must be different.';
      // Kept scrambled, so the stored options never give the order away.
      let options = shuffled(order, question);
      if (options.every((x, k) => x === order[k])) options = [...order.slice(1), order[0]];
      return done(options, { order });
    }
    case 'NUMBER': {
      const tol = b.tolerance == null || b.tolerance === '' ? 0 : typeof b.tolerance === 'number' ? b.tolerance : readNumber(String(b.tolerance));
      if (tol == null || tol < 0) return 'The tolerance must be 0 or more.';
      const unit = cut(b.unit, 20);
      const extra = { ...(tol ? { tolerance: tol } : {}), ...(unit ? { unit } : {}) };
      const formula = cut(b.formula, 200);
      if (formula) {
        // Numbers that change for each student: each letter's range, and the answer's formula.
        const num = (v: unknown) => (typeof v === 'number' ? v : readNumber(String(v ?? '')));
        const vars: Record<string, Range> = {};
        for (const raw of (Array.isArray(b.vars) ? b.vars : []).slice(0, 5)) {
          const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          const name = cut(o.name, 1).toLowerCase();
          const min = num(o.min), max = num(o.max), step = num(o.step) ?? 1;
          if (!/^[a-z]$/.test(name) || name === 'e') return 'Each changing number needs a one-letter name (not e).';
          if (min == null || max == null || !(step > 0) || max < min) return `Give “${name}” a range: from, to and a step above 0.`;
          if ((max - min) / step > 10_000) return `“${name}” has too many values: use a bigger step.`;
          vars[name] = { min, max, step };
        }
        if (!Object.keys(vars).length) return 'Add at least one number that changes.';
        const tree = parseExpr(formula);
        if (!tree) return 'The answer’s formula can’t be read.';
        const unknown = [...letters(tree)].find((l) => !(l in vars));
        if (unknown) return `The formula uses “${unknown}”, which isn’t one of the changing numbers.`;
        const missing = Object.keys(vars).find((n) => !question.includes(`{${n}}`));
        if (missing) return `Put {${missing}} in the question where its number goes.`;
        const at = Object.fromEntries(Object.entries(vars).map(([n, r]) => [n, r.min]));
        if (!Number.isFinite(evaluate(tree, at))) return 'The formula can’t be worked out for the smallest numbers (dividing by 0?).';
        return done([], { formula, vars, ...extra });
      }
      const value = typeof b.value === 'number' ? b.value : readNumber(String(b.value ?? ''));
      if (value == null) return 'Give the right number.';
      return done([], { value, ...extra });
    }
    case 'MATH': {
      const accepted = [...new Set((Array.isArray(b.accepted) ? b.accepted : []).map((x) => cut(x, 200)).filter(Boolean))].slice(0, 6);
      if (!accepted.length) return 'Give the answer as a maths expression, like 2x^2 + 3x.';
      const unread = accepted.find((a) => !parseExpr(a));
      if (unread) return `“${unread}” can’t be read as a maths expression.`;
      return done([], { accepted });
    }
    case 'HOTSPOT': {
      const image = typeof b.image === 'string' ? b.image.trim().slice(0, 600) : '';
      if (!image || !isUploadedFileUrl(image)) return 'Upload the picture first.';
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : NaN);
      const areas = (Array.isArray(b.areas) ? b.areas.slice(0, 6) : []).map((a) => {
        const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        return { x: num(o.x), y: num(o.y), w: num(o.w), h: num(o.h) };
      }).filter((a) => a.x >= 0 && a.y >= 0 && a.w >= 1 && a.h >= 1 && a.x + a.w <= 100.05 && a.y + a.h <= 100.05);
      if (!areas.length) return 'Mark the right area on the picture.';
      return done([], { image, areas });
    }
  }
}

/** A stored question back in the teacher's words (to edit it, or save it to the bank). */
export function toInput(q: StoredQuestion): QuestionInput {
  const m = metaOf(q);
  return { ...inputOf(q), ...(m.hint ? { hint: m.hint } : {}), ...(m.explain ? { explain: m.explain } : {}) };
}

function inputOf(q: StoredQuestion): QuestionInput {
  const t = typeOf(q);
  const m = metaOf(q);
  const options = optionsOf(q);
  switch (t) {
    case 'CHOICE': case 'TRUE_FALSE': return { type: t, question: q.question, options, correctAnswer: q.correctAnswer };
    case 'MULTI': return { type: t, question: q.question, options, correct: m.correct ?? [], partial: !!m.partial };
    case 'SHORT': return { type: t, question: q.question, accepted: m.accepted ?? [] };
    case 'BLANKS': { let k = 0; return { type: t, question: (q.question ?? '').replace(BLANK_RE, () => `[[${(m.blanks?.[k++] ?? []).join('|')}]]`) }; }
    case 'MATCH': return { type: t, question: q.question, pairs: m.pairs ?? [], extra: options.filter((o) => !(m.pairs ?? []).some((p) => p.right === o)) };
    case 'ORDER': return { type: t, question: q.question, items: m.order ?? [] };
    case 'NUMBER': return isVariant(m)
      ? { type: t, question: q.question, formula: m.formula, vars: Object.entries(m.vars ?? {}).map(([name, r]) => ({ name, ...r })), tolerance: m.tolerance ?? 0, unit: m.unit ?? '' }
      : { type: t, question: q.question, value: m.value, tolerance: m.tolerance ?? 0, unit: m.unit ?? '' };
    case 'MATH': return { type: t, question: q.question, accepted: m.accepted ?? [] };
    case 'HOTSPOT': return { type: t, question: q.question, image: m.image, areas: m.areas ?? [] };
  }
}
