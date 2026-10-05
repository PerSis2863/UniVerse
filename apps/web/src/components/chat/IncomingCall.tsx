'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { ringtone } from '@/lib/call-sounds';
import { spring } from '@/lib/motion';
import { Avatar } from './MessageBubble';
import { useLiveInterval } from '@/lib/realtime-client';
import { useCalls } from '@/store/calls';
import { haptic } from '@/lib/haptics';

type IncomingCallItem = {
  id: string;
  conversationId: string;
  metadata: { kind?: 'audio' | 'video'; inApp?: boolean; endedAt?: string } | null;
  createdAt: string;
  sender: { name: string; avatar: string | null };
  conversation: { isGroup: boolean; name: string | null };
  /** I'm in Focus (Busy, In class, Sleeping) and the caller isn't a favourite: show it, don't ring. */
  quiet?: boolean;
};

const DISMISSED_KEY = 'universe-dismissed-calls';

function readDismissed(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}

/** Rings anywhere in the app when someone starts a UniVerse call in one of your chats. */
export function IncomingCall({ inboxPath }: { inboxPath: string }) {
  const router = useRouter();
  const refreshInterval = useLiveInterval(15_000, 0);
  const { data } = useSWR<IncomingCallItem[]>('/api/chat/incoming', authedJson, { refreshInterval, revalidateOnFocus: true, shouldRetryOnError: false });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);

  // Only UniVerse's own calls ring (calls from before, with outside links, never did after 45 s anyway).
  const call = (data ?? []).find((c) => c.metadata?.inApp && !c.metadata.endedAt && !dismissed.includes(c.id) && Date.now() - new Date(c.createdAt).getTime() < 45_000);

  // Already on a call (call waiting): hold it or end it to answer this one.
  const onCall = useCalls((st) => st.active);

  useEffect(() => {
    if (!call || call.quiet) return;
    if ('vibrate' in navigator) navigator.vibrate?.(onCall ? [120, 120, 120] : [300, 200, 300, 200, 300]);
    // On a call, a soft beep instead of the full ringtone (like call waiting).
    const stop = onCall ? ringtone(true) : ringtone();
    // Stop ringing when the caller's 45 seconds are up.
    const t = setTimeout(stop, Math.max(0, 45_000 - (Date.now() - new Date(call.createdAt).getTime())));
    return () => { stop(); clearTimeout(t); };
  }, [call?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const decline = (c: IncomingCallItem) => {
    dismiss(c.id);
    // One-to-one: the caller sees "Declined" straight away. In a group the call carries on.
    if (!c.conversation.isGroup) void authedJson(`/api/calls/${c.id}/decline`, { method: 'POST' }).catch(() => {});
  };

  const answer = (c: IncomingCallItem, endCurrent = false) => {
    dismiss(c.id);
    haptic('success');
    const st = useCalls.getState();
    if (endCurrent && st.active) st.enders[st.active]?.();
    // Otherwise the current call goes on hold (CallHost) while you take this one.
    router.push(`/call/${c.id}`);
  };

  const video = call?.metadata?.kind === 'video';
  return (
    <AnimatePresence>
      {call && (
        <motion.div
          key={call.id}
          initial={{ opacity: 0, y: -40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.94 }}
          transition={spring.smooth}
          role="alertdialog"
          aria-label={`Incoming ${video ? 'video' : 'voice'} call from ${call.sender.name}`}
          className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 z-[200] w-[min(94vw,400px)] rounded-[28px] bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-indigo-900/50 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute -inset-1 rounded-full bg-emerald-500/30 animate-ping" />
              <span className="absolute -inset-2 rounded-full border border-emerald-400/30 animate-pulse" />
              <Avatar name={call.sender.name} src={call.sender.avatar} size={52} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate">{call.conversation.isGroup && call.conversation.name ? call.conversation.name : call.sender.name}</p>
              {call.quiet && <p className="text-[10px] font-bold uppercase tracking-wide text-violet-300">Focus · silent</p>}
              <p className="text-xs text-zinc-400 truncate flex items-center gap-1">
                {video ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                {call.conversation.isGroup ? `${call.sender.name.split(' ')[0]} started a ${video ? 'video' : 'voice'} call` : `Incoming ${video ? 'video' : 'voice'} call`}
              </p>
            </div>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => decline(call)} aria-label="Decline" className="w-12 h-12 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
              <PhoneOff className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.88 }}
              animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.8 }}
              onClick={() => answer(call)}
              aria-label="Answer"
              className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
            >
              {video ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </motion.button>
          </div>
          {onCall ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => answer(call)} className="py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white">Hold & answer</button>
              <button type="button" onClick={() => answer(call, true)} className="py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white">End & answer</button>
            </div>
          ) : (
            <button type="button" onClick={() => { dismiss(call.id); router.push(`${inboxPath}?c=${call.conversationId}`); }} className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-white transition-colors">
              Open the chat instead
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
