'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, motion } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from './MessageBubble';
import { useLiveInterval } from '@/lib/realtime-client';

type IncomingCallItem = {
  id: string;
  conversationId: string;
  metadata: { kind?: 'audio' | 'video'; url?: string } | null;
  createdAt: string;
  sender: { name: string; avatar: string | null };
  conversation: { isGroup: boolean; name: string | null };
};

const DISMISSED_KEY = 'universe-dismissed-calls';

function readDismissed(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}

/** Shows a ringing card anywhere in the app when someone starts a call in one of your chats. */
export function IncomingCall({ inboxPath }: { inboxPath: string }) {
  const refreshInterval = useLiveInterval(8000, 30_000);
  const { data } = useSWR<IncomingCallItem[]>('/api/chat/incoming', authedJson, { refreshInterval, revalidateOnFocus: true, shouldRetryOnError: false });
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(readDismissed()), []);

  const call = (data ?? []).find((c) => !dismissed.includes(c.id) && Date.now() - new Date(c.createdAt).getTime() < 45_000);

  useEffect(() => {
    if (call && 'vibrate' in navigator) navigator.vibrate?.([300, 200, 300]);
  }, [call?.id]);

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const video = call?.metadata?.kind === 'video';
  return (
    <AnimatePresence>
      {call && (
        <motion.div
          key={call.id}
          initial={{ opacity: 0, y: -30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,380px)] rounded-3xl bg-[#11152a]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-indigo-900/40 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping" />
              <Avatar name={call.sender.name} src={call.sender.avatar} size={48} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate">{call.sender.name}</p>
              <p className="text-xs text-zinc-400 truncate">
                Incoming {video ? 'video' : 'voice'} call{call.conversation.isGroup && call.conversation.name ? ` · ${call.conversation.name}` : ''}
              </p>
            </div>
            <button onClick={() => dismiss(call.id)} aria-label="Decline" className="w-11 h-11 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center">
              <PhoneOff className="w-5 h-5" />
            </button>
            <a
              href={call.metadata?.url || `${inboxPath}?c=${call.conversationId}`}
              target={call.metadata?.url ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => dismiss(call.id)}
              aria-label="Join call"
              className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center"
            >
              {video ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
