import prisma from '@/lib/db';

// Which Gemini models answer, chosen in owner console → Server → AI models.
//
// Text features (tutor, summaries, grading drafts, translations…) go through a chain of text
// models. Each model has its own free allowance per minute, so when one is busy (429) the next one
// answers, and the busy one is skipped for a minute instead of being asked again first every time.
// More models in the chain = more people can use AI at the same moment.
//
// The voice tutor uses a Live model (spoken, real-time). Live native-audio models only answer with
// audio, so they can't do the text features.

export interface ModelInfo { id: string; label: string; note: string }

/** Text models offered in the owner console (free limits as shown in Google AI Studio, Oct 2026). */
export const TEXT_MODELS: ModelInfo[] = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Best answers · free: 5 requests/min' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fast, cheap · free: 15 requests/min' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Newer Flash' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Newest Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'Older Lite: extra spare allowance' },
];

/** Live (voice) models. */
export const LIVE_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Native Audio', note: 'Natural voice · free: unlimited requests/min, 1M tokens/min' },
  { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live', note: 'Newest · free: unlimited requests/min, 65K tokens/min' },
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live', note: 'Older' },
];

export interface AiModels { text: string[]; live: string }

const known = (list: ModelInfo[], id: unknown): id is string => typeof id === 'string' && list.some((m) => m.id === id);

export function defaultModels(): AiModels {
  const envText = [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL].filter((m): m is string => !!m);
  return {
    text: envText.length ? [...new Set(envText)] : ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
    live: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025',
  };
}

/** The owner's choice, made safe: known models only, at least one text model, up to five. */
export function parseModels(raw: string | null | undefined): AiModels {
  const d = defaultModels();
  try {
    const v = raw ? (JSON.parse(raw) as Partial<AiModels>) : {};
    const text = Array.isArray(v.text) ? [...new Set(v.text.filter((m) => known(TEXT_MODELS, m)))].slice(0, 5) : [];
    return { text: text.length ? text : d.text, live: known(LIVE_MODELS, v.live) ? v.live : d.live };
  } catch {
    return d;
  }
}

let cache: { at: number; models: AiModels } | null = null;

/** The models in use, read at most once a minute. */
export async function aiModels(): Promise<AiModels> {
  if (cache && Date.now() - cache.at < 60_000) return cache.models;
  const row = await prisma.serverControl.findUnique({ where: { id: 'main' }, select: { aiModels: true } }).catch(() => null);
  cache = { at: Date.now(), models: parseModels(row?.aiModels) };
  return cache.models;
}

/** Saves the owner's choice (the server_control row must exist: owner.ts serverControl() makes it). */
export async function saveModels(input: unknown): Promise<AiModels> {
  const models = parseModels(JSON.stringify(input ?? {}));
  await prisma.serverControl.update({ where: { id: 'main' }, data: { aiModels: JSON.stringify(models) } });
  cache = { at: Date.now(), models };
  return models;
}

// ─── Busy models ─────────────────────────────────────────────────────────────────────────────

/** Models to skip until a time (per Worker instance): busy (429) a minute, missing (404) an hour. */
const restUntil = new Map<string, number>();

function rest(model: string, status: number) {
  const ms = status === 429 ? 60_000 : status === 404 ? 3_600_000 : 20_000;
  restUntil.set(model, Date.now() + ms);
}

/**
 * The text models to try, in order: lite jobs (translation, short drafts) start with the lighter
 * models so the main model's allowance lasts longer. Resting models go last, not away: if every
 * model is resting, they're still tried.
 */
export async function textChain(lite = false): Promise<string[]> {
  const { text } = await aiModels();
  const ordered = lite ? [...text.filter((m) => m.includes('lite')), ...text.filter((m) => !m.includes('lite'))] : text;
  const now = Date.now();
  return [...ordered.filter((m) => (restUntil.get(m) ?? 0) <= now), ...ordered.filter((m) => (restUntil.get(m) ?? 0) > now)];
}

/**
 * Calls `send(model)` down the chain until one answers (at most three tries, to stay inside the
 * Worker's subrequest budget). Busy, missing or failing models are rested and the next is asked.
 * Returns the last response (so callers can read the error) or null when there's no model.
 */
export async function withTextModels(lite: boolean, send: (model: string) => Promise<Response>): Promise<Response | null> {
  const chain = (await textChain(lite)).slice(0, 3);
  let res: Response | null = null;
  for (const model of chain) {
    res = await send(model);
    if (res.ok) return res;
    if (res.status === 404 || res.status === 400 || res.status === 429 || res.status >= 500) {
      rest(model, res.status);
      continue;
    }
    return res;
  }
  return res;
}
