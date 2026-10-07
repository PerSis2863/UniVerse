'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Headphones } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useActivePoll } from '@/lib/realtime-client';
import { cn } from '@/lib/utils';
import { chatJson } from './chat-client';

// Huddles (Stage 4 · 1.11, src/server/huddles.ts): a drop-in voice room in any chat. Who's in it
// is asked of the call room while a huddle may be going (its message is under 4 hours old), every
// 30 s while the app is in use (call rooms don't push their head count to chats).

const LIVE_MS = 4 * 3600_000;

export function useHuddlePeers(callId: string | null) {
  const poll = useActivePoll(30_000);
  return useSWR<{ count: number; names: string[] }>(callId ? `/api/calls/${callId}/peers` : null, authedJson, { refreshInterval: poll, revalidateOnFocus: true });
}

export const huddleMayBeLive = (createdAt: string, now: number) => now - new Date(createdAt).getTime() < LIVE_MS;

/** Starts (or joins) the chat's huddle, then opens it. */
export function useStartHuddle(conversationId: string) {
  const router = useRouter();
  return async () => {
    try {
      const r = await chatJson<{ callId: string }>(`/api/chat/conversations/${conversationId}/huddle`, { method: 'POST' });
      router.push(`/call/${r.callId}?kind=audio`);
    } catch (e) { toast.error((e as Error).message); }
  };
}

/** "Jane started a huddle" in the chat, with who's in it and Join. */
export function HuddleCard({ callId, by, mine, live }: { callId: string; by: string; mine: boolean; live: boolean }) {
  const router = useRouter();
  const { data } = useHuddlePeers(live ? callId : null);
  const on = live && (data?.count ?? 0) > 0;
  return (
    <div className="flex items-center gap-3 p-3 w-[17rem] max-w-full">
      <span className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', mine ? 'bg-white/15' : 'bg-emerald-500/15 text-emerald-500', on && 'animate-pulse')}><Headphones className="w-5 h-5" /></span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold leading-tight">{on ? `Huddle · ${data!.count}` : live && !data ? 'Huddle' : 'Huddle ended'}</span>
        <span className={cn('block text-[11px] truncate', mine ? 'text-white/70' : 'text-zinc-500')}>{on ? data!.names.slice(0, 3).join(', ') : `${mine ? 'You' : by.split(' ')[0]} started a huddle`}</span>
      </span>
      {on && (
        <button type="button" onClick={() => router.push(`/call/${callId}?kind=audio`)} className={cn('shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95', mine ? 'bg-white text-indigo-600' : 'bg-emerald-500 text-white')}>Join</button>
      )}
    </div>
  );
}
