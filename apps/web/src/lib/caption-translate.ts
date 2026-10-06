'use client';

import { authedJson } from './authed-fetch';

// Translated captions (Stage 4 · 4.1), in the browser of the reader the call room asked to translate
// a sentence for everyone reading their language. On the device when the browser can (Chrome and
// Edge's built-in translator: free, private, no limit); otherwise through the server, a few
// sentences at a time (POST /api/calls/:id/captions, limited per call).

interface DeviceTranslator { translate(text: string): Promise<string> }
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<DeviceTranslator>;
}
const api = (): TranslatorApi | null => (typeof self !== 'undefined' && 'Translator' in self ? (self as unknown as { Translator: TranslatorApi }).Translator : null);

/** Whether this browser has a built-in translator (a language pair may still need a download first). */
export const canTranslateOnDevice = () => api() !== null;

const pairs = new Map<string, Promise<DeviceTranslator | null>>();
/** The device's translator for a pair, if it's ready to use (downloading needs a tap, so it's left out). */
function onDevice(from: string, to: string): Promise<DeviceTranslator | null> {
  const T = api();
  if (!T) return Promise.resolve(null);
  const key = `${from}>${to}`;
  let p = pairs.get(key);
  if (!p) {
    p = (async () => ((await T.availability({ sourceLanguage: from, targetLanguage: to })) === 'available' ? T.create({ sourceLanguage: from, targetLanguage: to }) : null))().catch(() => null);
    pairs.set(key, p);
  }
  return p;
}

const BATCH_MS = 3000;
const BATCH_LINES = 12;

/** One per call. `translate` resolves with the translation, or null if there's none. `server: false`
 *  (guests, who have no account): only on the device. */
export function captionTranslator(callId: string, onStopped: (why: string) => void, opts: { server?: boolean } = {}) {
  const queue = new Map<string, { id: string; text: string; done: (t: string | null) => void }[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let off = false;
  let stopped = false;

  const flush = async () => {
    timer = null;
    const batches = [...queue];
    queue.clear();
    for (const [to, lines] of batches) {
      for (let i = 0; i < lines.length; i += BATCH_LINES) {
        const part = lines.slice(i, i + BATCH_LINES);
        try {
          if (stopped || off) throw new Error('');
          const r = await authedJson<{ items: Record<string, string> }>(`/api/calls/${encodeURIComponent(callId)}/captions`, { method: 'POST', body: JSON.stringify({ to, lines: part.map(({ id, text }) => ({ id, text })) }) });
          for (const l of part) l.done(r.items[l.id] ?? null);
        } catch (e) {
          for (const l of part) l.done(null);
          // The call's limit for today, or AI unavailable: stop asking (and say so once).
          const msg = (e as Error).message;
          if (msg && !stopped && !off) { stopped = true; onStopped(msg); }
        }
      }
    }
  };

  return {
    async translate(id: string, text: string, from: string, to: string): Promise<string | null> {
      const device = await onDevice(from, to);
      if (device) {
        try { return (await device.translate(text)).trim() || null; } catch { /* the server, below */ }
      }
      if (stopped || off || opts.server === false) return null;
      return new Promise((done) => {
        queue.set(to, [...(queue.get(to) ?? []), { id, text, done }]);
        timer ??= setTimeout(() => void flush(), BATCH_MS);
      });
    },
    close() {
      off = true;
      if (timer) clearTimeout(timer);
      void flush();
    },
  };
}
