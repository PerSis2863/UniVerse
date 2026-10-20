import prisma from '@/lib/db';
import { isAppLanguage, languageInfo, type Language } from '@/lib/i18n';
import { CHUNKS, cleanChunk } from '@/lib/ui-dictionary';
import type { User } from '@prisma/client';
import { BadRequestException, HttpException } from './http';
import { geminiJson } from './gemini';
import { spendAi } from './ai-budget';
import { featureOff } from './moderation';

// The app's screens in other languages (Stage 5 · Q21; src/lib/ui-dictionary.ts). The owner console
// drafts them with the AI translator from public/i18n/catalog.json, a batch at a time, and saves
// each of a language's 32 parts here; anyone's browser downloads its language's parts in one go
// (GET /api/i18n/:lang) and swaps the English on screen for them.

const langOf = (raw: unknown): Language => {
  if (!isAppLanguage(raw) || raw === 'en') throw new BadRequestException('Unknown language.');
  return raw;
};

/**
 * GET /api/i18n/:lang: { v, chunks: [...] }, built by joining the stored parts' text (no parsing:
 * the Worker's CPU budget is small). `v` is the newest change; an unchanged copy answers 304.
 */
export async function dictionaryResponse(rawLang: string, ifNoneMatch: string | null): Promise<Response> {
  if (!isAppLanguage(rawLang) || rawLang === 'en') return new Response('{"v":"","chunks":[]}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  const rows = await prisma.$queryRawUnsafe<{ data: string; updatedAt: string }[]>('SELECT data, updatedAt FROM ui_translations WHERE lang = ? AND count > 0', rawLang);
  const v = rows.reduce((m, r) => (String(r.updatedAt) > m ? String(r.updatedAt) : m), '');
  const etag = `"${rawLang}-${v.replace(/[^0-9A-Za-z]/g, '')}-${rows.length}"`;
  const headers = { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'public, max-age=300' };
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers });
  return new Response(`{"v":${JSON.stringify(etag)},"chunks":[${rows.map((r) => r.data).join(',')}]}`, { headers });
}

/** Owner console: how far each language is (translated and checked by a person). */
export async function languageStatus() {
  const rows = await prisma.$queryRawUnsafe<{ lang: string; n: bigint | number; reviewed: bigint | number; updatedAt: string | null }[]>(
    'SELECT lang, SUM(count) AS n, SUM(reviewed) AS reviewed, MAX(updatedAt) AS updatedAt FROM ui_translations GROUP BY lang',
  );
  return { chunks: CHUNKS, languages: rows.map((r) => ({ lang: r.lang, translated: Number(r.n ?? 0), reviewed: Number(r.reviewed ?? 0), updatedAt: r.updatedAt })) };
}

/** One part, for the owner console to merge new translations into. */
export async function readChunk(rawLang: unknown, chunk: number) {
  const lang = langOf(rawLang);
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= CHUNKS) throw new BadRequestException('Unknown part.');
  const row = await prisma.uiTranslation.findUnique({ where: { lang_chunk: { lang, chunk } }, select: { data: true } });
  try {
    return cleanChunk(row ? JSON.parse(row.data) : null, chunk);
  } catch {
    return { s: {}, r: [] };
  }
}

/** PUT …/i18n/:lang/:chunk { s, r }: replaces one part (cleaned: only text that belongs in it). */
export async function saveChunk(rawLang: unknown, chunk: number, body: unknown) {
  const lang = langOf(rawLang);
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= CHUNKS) throw new BadRequestException('Unknown part.');
  const clean = cleanChunk(body, chunk);
  const data = JSON.stringify(clean);
  if (data.length > 400_000) throw new BadRequestException('This part is too big.');
  const count = Object.keys(clean.s).length;
  await prisma.uiTranslation.upsert({
    where: { lang_chunk: { lang, chunk } },
    create: { lang, chunk, data, count, reviewed: clean.r.length },
    update: { data, count, reviewed: clean.r.length },
  });
  return { ok: true, count, reviewed: clean.r.length };
}

/**
 * POST …/i18n/translate { lang, strings }: up to 80 pieces of screen text, translated by the AI
 * (owner only; counted like any AI use). Places such as {0} are kept.
 */
export async function translateBatch(user: User, b: Record<string, unknown>) {
  const lang = langOf(b.lang);
  const strings = Array.isArray(b.strings) ? b.strings.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 600).slice(0, 80) : [];
  if (!strings.length) throw new BadRequestException('Nothing to translate.');
  if (await featureOff('ai')) throw new HttpException('AI features are turned off on UniVerse for now.', 503);
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const { name } = languageInfo(lang);
  const res = await geminiJson<{ translations: string[] }>(
    `You translate the user interface of UniVerse, an app for schools and universities (students, teachers, parents), from English into ${name}. ` +
      'Translate each item on its own, short and natural like a well-made app in that language (buttons stay short). Keep placeholders such as {0} and {1} exactly, ' +
      'keep emoji, symbols (· … → %), numbers, URLs and the names UniVerse, Google, Microsoft, Stripe unchanged. Return exactly one translation per item, in the same order.',
    JSON.stringify(strings),
    { type: 'object', properties: { translations: { type: 'array', items: { type: 'string' } } }, required: ['translations'] },
    8000,
  );
  if (!res || !Array.isArray(res.translations) || res.translations.length !== strings.length) {
    throw new HttpException('The translator didn’t answer this batch properly. Try again.', 502);
  }
  return { translations: res.translations.map((t) => String(t ?? '').trim()) };
}
