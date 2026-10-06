import prisma from '@/lib/db';
import { geminiJson } from './gemini';
import { requireAi } from './ai-budget';
import { LANGUAGES, isLanguage } from '@/lib/languages';

// Machine translation for chat messages (Gemini). Translations are stored per message and language
// and shared by everyone in the conversation, so each message is translated at most once per
// language. Messages already in the target language are remembered too (empty text), so they're
// never sent to the AI again.

export { isLanguage } from '@/lib/languages';

type AiUser = Parameters<typeof requireAi>[0];
const name = (code: string) => LANGUAGES[code].name;

export interface Translation { text: string; from: string; same: boolean }

const MAX_BATCH = 20;
const MAX_CHARS = 2000; // per message
const SYSTEM = `You translate chat messages between students, teachers and NGO staff on UniVerse, a university platform.
For each message: detect its language (ISO 639-1 code) and translate it into the target language.
Keep the meaning, tone and informality. Keep emoji, URLs, @mentions, numbers, names, and the chat formatting
markers *bold*, _italic_, ~strike~ and \`code\` exactly as they are. Don't add notes or explanations.
If a message is already in the target language (or has no words to translate, e.g. only emoji or a link),
return an empty translation for it.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          lang: { type: 'STRING', description: 'ISO 639-1 code of the original message' },
          text: { type: 'STRING', description: 'The translation, or empty if already in the target language' },
        },
        required: ['id', 'lang', 'text'],
      },
    },
  },
  required: ['items'],
};

/** Messages with nothing to translate: only emoji, punctuation, numbers or a link. */
function nothingToTranslate(text: string) {
  const letters = text.replace(/https?:\/\/\S+/g, '').replace(/[@#]\S+/g, '').replace(/[\p{P}\p{S}\p{N}\s]/gu, '');
  return letters.length < 2;
}

/** Translates up to 20 texts in one AI call. Returns null when AI isn't available. */
async function translateBatch(items: { id: string; text: string }[], to: string) {
  if (!items.length) return new Map<string, { lang: string; text: string }>();
  const prompt = `Target language: ${name(to)} (${to}).\nMessages (JSON):\n${JSON.stringify(items.map((i) => ({ id: i.id, text: i.text.slice(0, MAX_CHARS) })))}`;
  const out = await geminiJson<{ items: { id: string; lang: string; text: string }[] }>(SYSTEM, prompt, SCHEMA, 4096, true);
  if (!out?.items) return null;
  const map = new Map<string, { lang: string; text: string }>();
  for (const r of out.items) {
    if (!items.some((i) => i.id === r.id)) continue;
    const lang = String(r.lang || '').toLowerCase().slice(0, 5);
    const text = String(r.text ?? '').trim();
    map.set(r.id, { lang: lang || 'und', text: lang === to ? '' : text });
  }
  return map;
}

/**
 * Translations of these messages into `to`, from the store or (for the rest) the AI, which are then
 * stored. Only pass messages the caller may read. Missing entries mean translation failed. Asking
 * the AI counts as one AI request for `who` (null: the app itself, counted for the site only) and
 * throws AiLimitError when there's none left today.
 */
export async function translateMessages(messages: { id: string; body: string }[], to: string, who: AiUser = null): Promise<Record<string, Translation>> {
  const result: Record<string, Translation> = {};
  if (!messages.length) return result;
  const stored = await prisma.messageTranslation.findMany({ where: { messageId: { in: messages.map((m) => m.id) }, lang: to }, select: { messageId: true, sourceLang: true, text: true } });
  for (const s of stored) result[s.messageId] = { text: s.text, from: s.sourceLang, same: !s.text };

  const todo = messages.filter((m) => !result[m.id]);
  const skip = todo.filter((m) => nothingToTranslate(m.body));
  for (const m of skip) result[m.id] = { text: '', from: to, same: true };
  const ask = todo.filter((m) => !nothingToTranslate(m.body));

  const fresh: { messageId: string; lang: string; sourceLang: string; text: string }[] = skip.map((m) => ({ messageId: m.id, lang: to, sourceLang: to, text: '' }));
  if (ask.length) {
    try {
      await requireAi(who);
    } catch (e) {
      if (Object.keys(result).length) return result; // out of AI for today: hand back what's stored
      throw e;
    }
  }
  for (let i = 0; i < ask.length; i += MAX_BATCH) {
    const batch = ask.slice(i, i + MAX_BATCH);
    const got = await translateBatch(batch.map((m) => ({ id: m.id, text: m.body })), to);
    if (!got) break; // AI unavailable: return what we have
    for (const m of batch) {
      const r = got.get(m.id);
      if (!r) continue;
      result[m.id] = { text: r.text, from: r.lang, same: !r.text };
      fresh.push({ messageId: m.id, lang: to, sourceLang: r.lang, text: r.text });
    }
  }
  // Store (ignoring races where someone else stored the same translation meanwhile).
  await Promise.all(fresh.map((f) => prisma.messageTranslation.upsert({ where: { messageId_lang: { messageId: f.messageId, lang: f.lang } }, create: f, update: {} }).catch(() => {})));
  return result;
}

/** Stored translations only (no AI call), e.g. to include with a page of messages. */
export async function storedTranslations(messageIds: string[], to: string): Promise<Record<string, Translation>> {
  if (!messageIds.length) return {};
  const rows = await prisma.messageTranslation.findMany({ where: { messageId: { in: messageIds }, lang: to }, select: { messageId: true, sourceLang: true, text: true } });
  return Object.fromEntries(rows.map((r) => [r.messageId, { text: r.text, from: r.sourceLang, same: !r.text }]));
}

/**
 * When a message is sent, translate it up front into the languages that members of the chat have
 * auto-translate set to, so it arrives already translated (no extra request from each reader).
 * Gives up after `timeoutMs` so delivery is never held up for long.
 */
export async function pretranslate(conversationId: string, messageId: string, body: string, senderId: string, timeoutMs = 4000) {
  const langs = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId }, translateTo: { not: null } },
    select: { translateTo: true },
    distinct: ['translateTo'],
  });
  const targets = [...new Set(langs.map((l) => l.translateTo!).filter(isLanguage))].slice(0, 4);
  if (!targets.length || !process.env.GEMINI_API_KEY) return;
  await Promise.race([
    Promise.all(targets.map((to) => translateMessages([{ id: messageId, body }], to).catch(() => null))),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Translates a draft before it's sent (not stored). Counts as one AI request for `who`. */
export async function translateDraft(text: string, to: string, who: AiUser): Promise<{ text: string; from: string } | null> {
  await requireAi(who);
  const got = await translateBatch([{ id: 'draft', text: text.slice(0, MAX_CHARS) }], to);
  const r = got?.get('draft');
  if (!r) return null;
  return { text: r.text || text, from: r.lang };
}

const CAPTION_SYSTEM = `You translate live captions from a university class (automatic speech recognition: expect missing
words and small mistakes). Translate each line into the target language so a student can follow the class.
Keep it short and natural, keep names, numbers and technical terms. Don't add notes. If a line is already
in the target language, return it unchanged.`;
const CAPTION_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['id', 'text'] } } },
  required: ['items'],
};

/**
 * Live captions in a call (Stage 4 · 4.1), when no reader of `to` can translate on their device:
 * one AI request for a few sentences. It counts once for the call (as one staff member's daily
 * allowance, so one call can't use up the site's AI) and once for the site. Not stored: captions
 * are gone when the call ends.
 */
export async function translateCaptions(callId: string, lines: { id: string; text: string }[], to: string): Promise<Record<string, string>> {
  if (!lines.length) return {};
  await requireAi({ id: `cc:${callId}`, role: 'STAFF' });
  const prompt = `Target language: ${name(to)} (${to}).\nLines (JSON):\n${JSON.stringify(lines.map((l) => ({ id: l.id, text: l.text.slice(0, 300) })))}`;
  const out = await geminiJson<{ items: { id: string; text: string }[] }>(CAPTION_SYSTEM, prompt, CAPTION_SCHEMA, 2048, true);
  const result: Record<string, string> = {};
  for (const r of out?.items ?? []) if (lines.some((l) => l.id === r.id) && typeof r.text === 'string' && r.text.trim()) result[r.id] = r.text.trim().slice(0, 600);
  return result;
}
