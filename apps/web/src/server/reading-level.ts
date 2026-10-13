import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { textHash } from '@/lib/text-hash';
import { materialSections } from '@/lib/material-sections';
import { LANGUAGES, isLanguage } from '@/lib/languages';
import { cleanTerms, isLevel, parseTerms, type Leveled, type Level, type Term } from '@/lib/reading-level';
import { AiLimitError, requireAi } from './ai-budget';
import { geminiJson } from './gemini';
import { BadRequestException, HttpException } from './http';
import { featureOff } from './moderation';
import { readable, type TextKind } from './text-translate';

// Reading-level adapter (Stage 5 · D9): a course material (a section at a time, "material-part") or
// assignment instructions, rewritten by AI for a reading level (Grade 8 or
// Grade 5), in its own language or the reader's, with its key terms explained. For dyslexic,
// younger and second-language students; the original is always one tap away. Only texts the reader
// may read (the same checks as translation); each is rewritten once per level and language and
// shared by everyone (an edited text is rewritten again). Asking the AI counts as one AI request.

export const LEVEL_KINDS = ['material-part', 'assignment'] as const satisfies readonly TextKind[];
type LevelKind = (typeof LEVEL_KINDS)[number];
const MAX_ITEMS = 6;
/** Longer texts (instructions) are rewritten in sections and joined; at most this many. */
const MAX_PARTS = 8;
const MAX_CHARS = 2000;
/** Characters per AI call, so the rewrite and its key terms fit in one answer. */
const PER_CALL = 4000;

const AGE: Record<Level, string> = {
  g8: 'Grade 8 (about 13–14 years old): clear sentences of about 18 words or fewer, common words, and every technical word explained in simple words the first time it appears',
  g5: 'Grade 5 (about 10–11 years old): short sentences of about 12 words or fewer, one idea per sentence, everyday words, and every hard word replaced or explained',
};
const system = (level: Level, lang: string) => `You rewrite study texts from UniVerse, a learning platform, so that students who read below their grade can understand them: younger students, students with dyslexia and students learning the language.
Reading level: ${AGE[level]}.
Keep every fact, number, date, name, formula, piece of code, link and instruction: use simpler words, never less information or a different meaning, and don't add facts. Keep lists as lists, keep the order, and keep line breaks between paragraphs. Don't mention the rewrite and don't add notes.
Write in ${lang ? `${LANGUAGES[lang].name} (${lang})` : 'the same language as the original'}.
For each text, also give up to 5 key terms: subject words the student needs to learn, written exactly as they appear in your rewrite, each with a one-sentence meaning at the same reading level and in the same language.`;

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

/** One AI call: rewrites these texts. Missing ids failed. */
async function rewrite(items: { id: string; text: string }[], level: Level, lang: string) {
  const out = new Map<string, Leveled>();
  const chars = items.reduce((n, i) => n + i.text.length, 0);
  const got = await geminiJson<{ items: { id: string; text: string; terms: unknown }[] }>(system(level, lang), `Texts (JSON):\n${JSON.stringify(items)}`, SCHEMA, Math.min(8192, Math.max(1500, Math.round(chars / 1.5))), true);
  for (const r of got?.items ?? []) {
    if (!items.some((i) => i.id === r.id) || typeof r.text !== 'string' || !r.text.trim()) continue;
    const text = r.text.trim();
    out.set(r.id, { text, terms: cleanTerms(r.terms, text) });
  }
  return { out, failed: !got };
}

/** POST /api/reading-level { items: [{ kind, id }], level, to? }: rewrites by "kind:id" (missing ones couldn't be read or rewritten). */
export async function levelItems(user: SessionUser, b: Record<string, unknown>) {
  if (!isLevel(b.level)) throw new BadRequestException('Choose a reading level.');
  const level = b.level;
  if (b.to != null && b.to !== '' && !isLanguage(b.to)) throw new BadRequestException('Choose a language.');
  const lang = typeof b.to === 'string' ? b.to : '';
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, MAX_ITEMS).map((x) => (x ?? {}) as Record<string, unknown>)
    .flatMap((x) => ((LEVEL_KINDS as readonly string[]).includes(x.kind as string) && typeof x.id === 'string' && x.id.length <= 64 ? [{ kind: x.kind as LevelKind, id: x.id }] : []));
  if (!items.length) return { levels: {} };
  const texts = await readable(user, items);
  const keys = [...texts.keys()];
  if (!keys.length) return { levels: {} };

  const result: Record<string, Leveled> = {};
  const byKind = (list: string[]) => LEVEL_KINDS.filter((k) => list.some((key) => key.startsWith(`${k}:`))).map((k) => ({ kind: k, refId: { in: list.filter((key) => key.startsWith(`${k}:`)).map((key) => key.slice(k.length + 1)) } }));
  const stored = await prisma.leveledText.findMany({ where: { level, lang, OR: byKind(keys) }, select: { kind: true, refId: true, text: true, terms: true, srcHash: true } });
  for (const s of stored) {
    const key = `${s.kind}:${s.refId}`;
    if (texts.has(key) && s.srcHash === textHash(texts.get(key)!)) result[key] = { text: s.text, terms: parseTerms(s.terms, s.text) };
  }
  const todo = keys.filter((k) => !result[k]);
  if (!todo.length) return { levels: result };

  const partial = () => Object.keys(result).length > 0;
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) {
    if (partial()) return { levels: result };
    throw new HttpException('Simpler versions aren’t available right now. The original is still here.', 503);
  }
  try { await requireAi(user); } catch (e) {
    if (e instanceof AiLimitError) { if (partial()) return { levels: result }; throw new HttpException(e.message, 429); }
    throw e;
  }

  // Long texts go in sections ("key#n") and are joined again, so nothing is cut off.
  const parts = todo.flatMap((k) => {
    const t = texts.get(k)!;
    return t.length <= MAX_CHARS ? [{ id: k, text: t }] : materialSections(t).slice(0, MAX_PARTS).map((p, i) => ({ id: `${k}#${i}`, text: p }));
  });
  const calls: (typeof parts)[] = [];
  for (const p of parts) {
    const last = calls[calls.length - 1];
    if (last && last.reduce((n, x) => n + x.text.length, 0) + p.text.length <= PER_CALL) last.push(p);
    else calls.push([p]);
  }
  const got = new Map<string, Leveled>();
  let failed = false;
  for (const c of calls) {
    const r = await rewrite(c, level, lang);
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
  return { levels: result };
}
