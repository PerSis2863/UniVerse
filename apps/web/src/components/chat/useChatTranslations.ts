'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { languageName } from '@/lib/languages';
import type { TranslationState } from './MessageBubble';
import type { ChatMessage } from './chat-client';

type Stored = { text: string; from: string; same: boolean };

const AUTO_BATCH = 40;
const AUTO_DELAY_MS = 350;

/**
 * Translations for the messages on screen. With auto-translate on (`autoTo`), other people's text
 * messages are translated as they arrive: ones already translated come with the page of messages
 * (no extra request); the rest are asked for together in one request. "Translate" on a single
 * message uses the same language, or the person's app language when auto-translate is off.
 */
export function useChatTranslations(opts: {
  conversationId: string;
  messages: ChatMessage[];
  me: string;
  fromServer?: Record<string, Stored>;
  autoTo: string | null;
  appLanguage: string;
}) {
  const { conversationId, messages, me, fromServer, autoTo, appLanguage } = opts;
  const [local, setLocal] = useState<Record<string, TranslationState>>({});
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [autoError, setAutoError] = useState<string | null>(null); // auto-translate failing (shown once, not on every message)
  const asked = useRef(new Set<string>()); // "<round>:<lang>:<id>" already requested
  const target = autoTo ?? appLanguage;

  // A different chat or language: start over (a new round, so earlier requests don't count).
  const scope = `${conversationId}|${autoTo ?? ''}`;
  const [round, setRound] = useState({ scope, n: 0 });
  if (round.scope !== scope) {
    setRound({ scope, n: round.n + 1 });
    setLocal({});
    setOriginal(new Set());
    setAutoError(null);
  }
  const askKey = useCallback((to: string, id: string) => `${round.n}:${to}:${id}`, [round.n]);

  const states = useMemo(() => {
    const out: Record<string, TranslationState> = {};
    if (autoTo && fromServer) for (const [id, t] of Object.entries(fromServer)) out[id] = { status: 'done', ...t };
    return { ...out, ...local };
  }, [fromServer, local, autoTo]);

  const request = useCallback(async (ids: string[], to: string, manual: boolean) => {
    const fresh = ids.filter((id) => !asked.current.has(askKey(to, id)) || manual);
    if (!fresh.length) return;
    fresh.forEach((id) => asked.current.add(askKey(to, id)));
    setLocal((s) => ({ ...s, ...Object.fromEntries(fresh.map((id) => [id, { status: 'pending' } as TranslationState])) }));
    try {
      const { translations } = await authedJson<{ translations: Record<string, Stored> }>(`/api/chat/conversations/${conversationId}/translate`, {
        method: 'POST',
        body: JSON.stringify({ ids: fresh, to }),
      });
      setLocal((s) => {
        const next = { ...s };
        for (const id of fresh) {
          if (translations[id]) next[id] = { status: 'done', ...translations[id] };
          else if (manual) next[id] = { status: 'error' };
          else delete next[id];
        }
        return next;
      });
      if (!manual) setAutoError(null);
      if (manual && fresh.length === 1 && translations[fresh[0]]?.same) toast(`This message is already in ${languageName(to)}.`);
    } catch (e) {
      const message = (e as Error).message;
      if (manual) {
        setLocal((s) => ({ ...s, [fresh[0]]: { status: 'error', message } }));
        toast.error(message);
      } else {
        // Auto-translate: leave the originals as they are and say so once (in the chat's banner).
        setLocal((s) => { const next = { ...s }; for (const id of fresh) delete next[id]; return next; });
        setAutoError(message);
      }
    }
  }, [conversationId, askKey]);

  // Auto-translate new messages from others, a moment after they appear, in one request.
  useEffect(() => {
    if (!autoTo || autoError) return; // after a failure, wait for "Try again"
    const todo = messages
      .filter((m) => m.senderId !== me && m.type === 'TEXT' && !m.pending && m.body?.trim() && !states[m.id] && !asked.current.has(askKey(autoTo, m.id)))
      .map((m) => m.id)
      .slice(-AUTO_BATCH);
    if (!todo.length) return;
    const t = setTimeout(() => void request(todo, autoTo, false), AUTO_DELAY_MS);
    return () => clearTimeout(t);
  }, [autoTo, autoError, messages, me, states, request, askKey]);

  // Languages other people write in here (most common first) — suggested when translating a draft.
  const detected = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of Object.values(states)) if (t.status === 'done' && t.from && t.from !== 'und') count.set(t.from, (count.get(t.from) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
  }, [states]);

  return {
    target,
    detected,
    autoError,
    /** Try the messages that failed to auto-translate again. */
    retryAuto: () => { setAutoError(null); setRound((r) => ({ ...r, n: r.n + 1 })); },
    get: (id: string) => states[id],
    showingOriginal: (id: string) => original.has(id),
    translate: (id: string) => {
      setOriginal((s) => { const n = new Set(s); n.delete(id); return n; });
      void request([id], target, true);
    },
    toggleOriginal: (id: string) => setOriginal((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
  };
}
