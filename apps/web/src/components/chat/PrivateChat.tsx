'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { chatJson } from './chat-client';
import { chatDevices, myDevice } from './private-chat';
import { safetyCode } from '@/lib/e2e';

// Private chats (Stage 5 · B7.6): the note at the top of one, starting one from a normal chat,
// and the safety code to compare.

export function PrivateBanner() {
  return (
    <div className="mx-auto my-3 max-w-md rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-100 text-center space-y-1">
      <p className="font-semibold flex items-center justify-center gap-1.5"><Lock className="w-3.5 h-3.5" aria-hidden />Private chat · end-to-end encrypted</p>
      <p>Only your devices and theirs can read these messages, not UniVerse. That also means no search, translation, AI or message previews here, text only for now, and messages sent before a device joined can’t be read on it.</p>
    </div>
  );
}

/** In a normal one-to-one chat's info: start (or open) the private chat with them. */
export function StartPrivateChat({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await chatJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId, private: true }) }); onOpen(r.id); }
      catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    }} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/15 text-start">
      {busy ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden />}
      <span className="min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Private chat</span><span className="block text-xs text-zinc-500">End-to-end encrypted: only your devices and theirs can read it.</span></span>
    </button>
  );
}

/** In a private chat's info: the safety code both people can compare. */
export function SafetyCode({ conversationId, me }: { conversationId: string; me: string }) {
  const [code, setCode] = useState<{ code: string; devices: number } | null>(null);
  useEffect(() => {
    let live = true;
    void myDevice(me).then(() => chatDevices(conversationId, true)).then(async (d) => {
      if (live) setCode({ code: await safetyCode(d.map((x) => x.publicKey)), devices: d.length });
    }).catch(() => {});
    return () => { live = false; };
  }, [conversationId, me]);
  return (
    <div className="p-3 rounded-2xl bg-[var(--surface-2)] dark:bg-white/[0.04] space-y-1">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden />Safety code</p>
      {code ? <p className="font-mono text-base tracking-wider text-zinc-900 dark:text-white tabular-nums">{code.code}</p> : <div className="h-6 rounded skeleton" />}
      <p className="text-xs text-zinc-500">Compare it with theirs, in person or on a call. If it matches, nobody is reading in between.{code ? ` ${code.devices} device${code.devices === 1 ? '' : 's'} in this chat; it changes when a device joins.` : ''}</p>
    </div>
  );
}
