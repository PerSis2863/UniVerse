'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import type { E2EPayload } from '@/lib/e2e';
import { cn } from '@/lib/utils';
import { RichText } from './RichText';
import { decryptForChat } from './private-chat';

// A private (end-to-end encrypted) message, decrypted on this device (Stage 5 · B7.6). Sent
// before this device joined, or on a device whose key is gone: it says so, honestly.

export function PrivateText({ conversationId, me, messageId, payload, mine, onText }: { conversationId: string; me: string; messageId: string; payload: E2EPayload; mine: boolean; onText?: (text: string) => void }) {
  const [state, setState] = useState<{ text: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    decryptForChat(conversationId, me, messageId, payload).then(
      (text) => { if (live) { setState({ text }); onText?.(text); } },
      (e: Error) => { if (live) setState({ error: e.message }); },
    );
    return () => { live = false; };
  }, [conversationId, me, messageId, payload, onText]);
  if (!state) return <p className={cn('text-sm italic', mine ? 'text-white/70' : 'text-zinc-500')}>Decrypting…</p>;
  if ('error' in state) {
    return (
      <p className={cn('text-sm italic flex items-center gap-1.5', mine ? 'text-white/80' : 'text-zinc-500')}>
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
        {state.error === 'not-for-this-device' ? 'Sent before this device joined the private chat, so it can’t be read here.' : state.error === 'unsupported' ? 'This browser can’t open private messages.' : 'Couldn’t decrypt this message.'}
      </p>
    );
  }
  return <RichText text={state.text} mine={mine} />;
}
