import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { textHash } from '@/lib/text-hash';
import { courseAccess } from '@/lib/course-access';
import { materialSections } from '@/lib/material-sections';
import { LANGUAGES, isLanguage } from '@/lib/languages';
import { cleanTerms, isLevel, parseTerms, type Leveled, type Level, type Term } from '@/lib/reading-level';
import { AiLimitError, requireAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';
import { readable, type TextKind } from './text-translate';

// Reading-level adapter (Stage 5 · D9): a course material (a section at a time, "material-part"),
// assignment instructions, a teacher's feedback, an announcement (its body) or a quiz question,
// rewritten by AI for a reading level (Grade 8 or Grade 5), in its own language or the reader's,
// with its key terms explained (not for quiz questions: that could give the answer away). For
// dyslexic, younger and second-language students; the original is always one tap away. Only texts
// the reader may read (the same checks as translation); each is rewritten once per level and
// language and shared by everyone (an edited text is rewritten again). The course's teacher (or an
// announcement's author) can correct a version; students then see "checked by your teacher".
// Any other text on a page can be rewritten too, when the reader selects it ("text", by its hash).
// Asking the AI counts as one AI request.

export const LEVEL_KINDS = ['material-part', 'assignment', 'feedback', 'announcement', 'quiz-question'] as const satisfies readonly TextKind[];
type LevelKind = (typeof LEVEL_KINDS)[number];
const isLevelKind = (x: unknown): x is LevelKind => (LEVEL_KINDS as readonly unknown[]).includes(x);
const MAX_ITEMS = 6;
/** Longer texts (instructions) are rewritten in sections and joined; at most this many. */
const MAX_PARTS = 8;
const MAX_CHARS = 2000;
/** Characters per AI call, so the rewrite and its key terms fit in one answer. */
const PER_CALL = 4000;
/** The longest selected text that can be rewritten. */
export const MAX_SELECTION = 2000;
/** A teacher's own version can be this long. */
const MAX_EDIT = 12_000;

const AGE: Record<Level, string> = {
  g8: 'Grade 8 (about 13–14 years old): clear sentences of about 18 words or fewer, common words, and every technical word explained in simple words the first time it appears',
  g5: 'Grade 5 (about 10–11 years old): short sentences of about 12 words or fewer, one idea per sentence, everyday words, and every hard word replaced or explained',
};
const TERMS = 'For each text, also give up to 5 key terms: subject words the student needs to learn, written exactly as they appear in your rewrite, each with a one-sentence meaning at the same reading level and in the same language.';
const QUIZ = `These are quiz questions. Keep exactly what each question asks, including every word or idea it tests: make it easier to read, never easier to answer. Don't explain, define or hint at the answer, and give no key terms (an empty list).`;
export const system = (level: Level, lang: string, quiz: boolean) => `You rewrite study texts from UniVerse, a learning platform, so that students who read below their grade can understand them: younger students, students with dyslexia and students learning the language.
Reading level: ${AGE[level]}.
Keep every fact, number, date, name, formula, piece of code, link and instruction: use simpler words, never less information or a different meaning, and don't add facts. Keep lists as lists, keep the order, and keep line breaks between paragraphs. Don't mention the rewrite and don't add notes.
Write in ${lang ? `${LANGUAGES[lang].name} (${lang})` : 'the same language as the original'}.
${quiz ? QUIZ : TERMS}`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          text: { type: 'STRING', description: 'The rewritten text' },
          terms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, meaning: { type: 'STRING' } }, required: ['term', 'meaning'] } },
        },
        required: ['id', 'text', 'terms'],
      },
    },
  },
  required: ['items'],
};

const isQuiz = (key: string) => key.startsWith('quiz-question:');

/** One AI call: rewrites these texts (all quiz questions, or none). Missing ids failed. */
async function rewrite(items: { id: string; text: string }[], level: Level, lang: string, quiz: boolean) {
  const out = new Map<string, Leveled>();
  const chars = items.reduce((n, i) => n + i.text.length, 0);
  const got = await geminiJson<{ items: { id: string; text: string; terms: unknown }[] }>(system(level, lang, quiz), `Texts (JSON):\n${JSON.stringify(items)}`, SCHEMA, Math.min(8192, Math.max(1500, Math.round(chars / 1.5))), true);
  for (const r of got?.items ?? []) {
    if (!items.some((i) => i.id === r.id) || typeof r.text !== 'string' || !r.text.trim()) continue;
    const text = r.text.trim();
    out.set(r.id, { text, terms: quiz ? [] : cleanTerms(r.terms, text) });
  }
  return { out, failed: !got };
}

function parseLevel(b: Record<string, unknown>) {
  if (!isLevel(b.level)) throw new BadRequestException('Choose a reading level.');
  if (b.to != null && b.to !== '' && !isLanguage(b.to)) throw new BadRequestException('Choose a language.');
  return { level: b.level, lang: typeof b.to === 'string' ? b.to : '' };
}

/** Where rows for these "kind:id" keys are, for one query. */
const byKind = (keys: string[]) => {
  const kinds = [...new Set(keys.map((k) => k.slice(0, k.indexOf(':'))))];
  return kinds.map((kind) => ({ kind, refId: { in: keys.filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1)) } }));
};

/**
 * The rewrites of these texts (by "kind:id"): stored ones when the text hasn't changed since,
 * the rest from the AI (one AI request for `user`), which are then stored.
 */
async function rewrites(user: SessionUser, texts: Map<string, string>, level: Level, lang: string) {
  const keys = [...texts.keys()];
  const result: Record<string, Leveled> = {};
  if (!keys.length) return result;
  const stored = await prisma.leveledText.findMany({ where: { level, lang, OR: byKind(keys) }, select: { kind: true, refId: true, text: true, terms: true, srcHash: true, editedById: true } });
  for (const s of stored) {
    const key = `${s.kind}:${s.refId}`;
    if (texts.has(key) && s.srcHash === textHash(texts.get(key)!)) result[key] = { text: s.text, terms: parseTerms(s.terms, s.text), ...(s.editedById ? { edited: true } : {}) };
  }
  const todo = keys.filter((k) => !result[k]);
  if (!todo.length) return result;

  const partial = () => Object.keys(result).length > 0;
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) {
    if (partial()) return result;
    throw new HttpException('Simpler versions aren’t available right now. The original is still here.', 503);
  }
  try { await requireAi(user); } catch (e) {
    if (e instanceof AiLimitError) { if (partial()) return result; throw new HttpException(e.message, 429); }
    throw e;
  }

  // Long texts go in sections ("key#n") and are joined again, so nothing is cut off. Quiz questions
  // go in calls of their own (other rules).
  const parts = todo.flatMap((k) => {
    const t = texts.get(k)!;
    return t.length <= MAX_CHARS ? [{ id: k, text: t }] : materialSections(t).slice(0, MAX_PARTS).map((p, i) => ({ id: `${k}#${i}`, text: p }));
  });
  const calls: { quiz: boolean; items: typeof parts }[] = [];
  for (const p of parts) {
    const quiz = isQuiz(p.id);
    const last = calls.findLast((c) => c.quiz === quiz);
    if (last && last.items.reduce((n, x) => n + x.text.length, 0) + p.text.length <= PER_CALL) last.items.push(p);
    else calls.push({ quiz, items: [p] });
  }
  const got = new Map<string, Leveled>();
  let failed = false;
  for (const c of calls) {
    const r = await rewrite(c.items, level, lang, c.quiz);
    for (const [k, v] of r.out) got.set(k, v);
    if (r.failed) { failed = true; break; }
  }

  const fresh: { kind: string; refId: string; level: string; lang: string; text: string; terms: string; srcHash: string }[] = [];
  for (const k of todo) {
    let r = got.get(k);
    if (!r) {
      const mine = parts.filter((p) => p.id.startsWith(`${k}#`)).map((p) => got.get(p.id));
      if (!mine.length || mine.some((m) => !m)) continue; // a section failed: nothing rather than half of it
      const text = mine.map((m) => m!.text).join('\n\n');
      const terms: Term[] = cleanTerms(mine.flatMap((m) => m!.terms), text);
      r = { text, terms };
    }
    result[k] = r;
    const at = k.indexOf(':');
    fresh.push({ kind: k.slice(0, at), refId: k.slice(at + 1), level, lang, text: r.text, terms: JSON.stringify(r.terms), srcHash: textHash(texts.get(k)!) });
  }
  // Replaces any older (edited) versions, in two statements.
  if (fresh.length) {
    await prisma.leveledText.deleteMany({ where: { level, lang, OR: byKind(fresh.map((f) => `${f.kind}:${f.refId}`)) } });
    await prisma.leveledText.createMany({ data: fresh }).catch(() => {});
  }
  if (failed && !partial()) throw new HttpException('The AI couldn’t make a simpler version right now. Please try again.', 503);
  return result;
}

/** The texts these items rewrite, that this person may read: an announcement's body only (its title stays). */
async function sourceTexts(user: SessionUser, items: { kind: LevelKind; id: string }[]) {
  const texts = await readable(user, items);
  for (const [k, v] of texts) {
    if (!k.startsWith('announcement:')) continue;
    const at = v.indexOf('\n\n');
    texts.set(k, at >= 0 ? v.slice(at + 2) : v);
  }
  return texts;
}

/** Which of these the person may correct: the course's teacher (or an admin), an announcement's author. */
export async function editableKeys(user: SessionUser, keys: string[]) {
  const out = new Set<string>();
  if (user.role === 'ADMIN') { for (const k of keys) out.add(k); return out; }
  if (user.role !== 'TEACHER') return out;
  const ids = (kind: LevelKind) => keys.filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1));
  const sourceIds = [...new Set(ids('material-part').map((r) => r.slice(0, r.lastIndexOf('.'))))];
  const none = Promise.resolve([]);
  const [sources, assignments, subs, questions, anns] = await Promise.all([
    sourceIds.length ? prisma.courseSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, courseId: true } }) : none,
    ids('assignment').length ? prisma.assignment.findMany({ where: { id: { in: ids('assignment') } }, select: { id: true, courseId: true } }) : none,
    ids('feedback').length ? prisma.assignmentSubmission.findMany({ where: { id: { in: ids('feedback') } }, select: { id: true, assignment: { select: { courseId: true } } } }) : none,
    ids('quiz-question').length ? prisma.quizQuestion.findMany({ where: { id: { in: ids('quiz-question') } }, select: { id: true, quiz: { select: { courseId: true } } } }) : none,
    ids('announcement').length ? prisma.announcement.findMany({ where: { id: { in: ids('announcement') } }, select: { id: true, authorId: true, courseId: true } }) : none,
  ]);
  const course = new Map<string, string>(); // key → the course that decides
  for (const k of ids('material-part')) { const s = sources.find((x) => x.id === k.slice(0, k.lastIndexOf('.'))); if (s) course.set(`material-part:${k}`, s.courseId); }
  for (const a of assignments) course.set(`assignment:${a.id}`, a.courseId);
  for (const x of subs) course.set(`feedback:${x.id}`, x.assignment.courseId);
  for (const q of questions) course.set(`quiz-question:${q.id}`, q.quiz.courseId);
  for (const a of anns) {
    if (a.authorId === user.id) out.add(`announcement:${a.id}`);
    else if (a.courseId) course.set(`announcement:${a.id}`, a.courseId);
  }
  const manages = new Map<string, boolean>();
  for (const id of [...new Set(course.values())].slice(0, 5)) manages.set(id, !!(await courseAccess(id, user))?.canManage);
  for (const [k, c] of course) if (manages.get(c)) out.add(k);
  return out;
}

function parseItems(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_ITEMS).map((x) => (x ?? {}) as Record<string, unknown>)
    .flatMap((x) => (isLevelKind(x.kind) && typeof x.id === 'string' && x.id.length <= 64 ? [{ kind: x.kind, id: x.id }] : []));
}

/**
 * POST /api/reading-level { items: [{ kind, id }], level, to? }: rewrites by "kind:id" (missing ones
 * couldn't be read or rewritten; `edited`: checked by the teacher), and which of them this person may correct.
 */
export async function levelItems(user: SessionUser, b: Record<string, unknown>) {
  const { level, lang } = parseLevel(b);
  const items = parseItems(b.items);
  if (!items.length) return { levels: {}, editable: [] };
  const texts = await sourceTexts(user, items);
  if (!texts.size) return { levels: {}, editable: [] };
  const [levels, editable] = await Promise.all([rewrites(user, texts, level, lang), editableKeys(user, [...texts.keys()])]);
  return { levels, editable: [...editable] };
}

/** The one item a teacher corrects, after checking they may. */
async function forEditing(user: SessionUser, b: Record<string, unknown>) {
  const { level, lang } = parseLevel(b);
  const [item] = parseItems([{ kind: b.kind, id: b.id }]);
  if (!item) throw new BadRequestException('Unknown text.');
  const key = `${item.kind}:${item.id}`;
  if (!(await editableKeys(user, [key])).has(key)) throw new ForbiddenException('Only the teacher can change the simpler version.');
  const source = (await sourceTexts(user, [item])).get(key);
  if (source == null) throw new NotFoundException('Text not found.');
  return { ...item, level, lang, source };
}

/** PUT /api/reading-level { kind, id, level, to?, text, terms }: the teacher's own version, shown instead of the AI's. */
export async function editLevel(user: SessionUser, b: Record<string, unknown>) {
  const e = await forEditing(user, b);
  const text = typeof b.text === 'string' ? b.text.replace(/\r/g, '').trim() : '';
  if (!text) throw new BadRequestException('Write the simpler version first.');
  if (text.length > MAX_EDIT) throw new BadRequestException(`Keep it under ${MAX_EDIT.toLocaleString('en')} characters.`);
  const terms = e.kind === 'quiz-question' ? [] : cleanTerms(b.terms, text);
  const where = { kind_refId_level_lang: { kind: e.kind, refId: e.id, level: e.level, lang: e.lang } };
  const row = { text, terms: JSON.stringify(terms), srcHash: textHash(e.source), editedById: user.id, editedAt: new Date() };
  await prisma.leveledText.upsert({ where, create: { kind: e.kind, refId: e.id, level: e.level, lang: e.lang, ...row }, update: row });
  return { text, terms, edited: true };
}

/** DELETE /api/reading-level { kind, id, level, to? }: forget this version; the AI writes a new one when it's next opened. */
export async function resetLevel(user: SessionUser, b: Record<string, unknown>) {
  const e = await forEditing(user, b);
  await prisma.leveledText.deleteMany({ where: { kind: e.kind, refId: e.id, level: e.level, lang: e.lang } });
  return { ok: true };
}

/**
 * POST /api/reading-level/text { text, level, to? }: any text the reader selected on a page. It's
 * their own copy, so nothing to check; kept by the text's hash, so the same text is rewritten once.
 */
export async function levelText(user: SessionUser, b: Record<string, unknown>) {
  const { level, lang } = parseLevel(b);
  const text = typeof b.text === 'string' ? b.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim() : '';
  if (text.length < 3) throw new BadRequestException('Select some text first.');
  if (text.length > MAX_SELECTION) throw new BadRequestException('Select a shorter part (up to 2,000 characters).');
  const key = `text:${textHash(text)}`;
  const got = (await rewrites(user, new Map([[key, text]]), level, lang))[key];
  if (!got) throw new HttpException('The AI couldn’t make a simpler version right now. Please try again.', 503);
  return got;
}
