'use client';

import { useState } from 'react';
import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { quickReplies } from '@/lib/quick-replies';
import { haptic } from '@/lib/haptics';
import type { ChatMessage, ThreadResponse } from './chat-client';

// M340 (the owner, 19 Nov: Messages' new features): above the message box,
// - quick replies: one-tap answers to the last message someone else sent (src/lib/quick-replies.ts; free, in the
//   browser), until something else is said or one is sent;
// - quiet hours: the other person won't be notified until their quiet hours end; "Send then" makes the next text
//   a scheduled one for that moment (the chat's own send-later).

const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ChatHints({ convo, last, me, quietSend, onQuietSend, onReply }: {
  convo: ThreadResponse['conversation']; last: ChatMessage | undefined; me: string;
  quietSend: boolean; onQuietSend: (on: boolean) => void; onReply: (text: string) => void;
}) {
  const [usedFor, setUsedFor] = useState<string | null>(null);
  const replies = !convo.private && !convo.isOfficial && !convo.self && last && last.senderId !== me && last.type === 'TEXT' && !last.pending && usedFor !== last.id && !last.metadata?.e2e
    ? quickReplies(last.body) : [];
  const quiet = !convo.isGroup && !convo.self && convo.quietUntil ? convo.quietUntil : null;
  if (!replies.length && !quiet) return null;
  const first = convo.title.split(' ')[0];
  return (
    <div className="px-3 sm:px-4 pt-2 space-y-2" data-no-arrange>
      {quiet && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-indigo-500/[0.07] dark:bg-indigo-400/10 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-200">
          <Moon className="w-4 h-4 shrink-0 text-indigo-500" aria-hidden />
          <span className="min-w-0 flex-1">{quietSend ? <>Your next message goes at <b>{at(quiet)}</b>, when {first}’s quiet hours end.</> : <>{first} is in quiet hours: no notification until <b>{at(quiet)}</b>.</>}</span>
          <button type="button" onClick={() => { haptic('tap'); onQuietSend(!quietSend); }} aria-pressed={quietSend}
            className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors', quietSend ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-500/20')}>
            {quietSend ? 'Send now instead' : 'Send then'}
          </button>
        </div>
      )}
      {replies.length > 0 && (
        <div role="group" aria-label="Quick replies" className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
          {replies.map((r) => (
            <button key={r} type="button" onClick={() => { haptic('tap'); setUsedFor(last!.id); onReply(r); }}
              className="shrink-0 rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.06] px-3.5 py-1.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors">
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
