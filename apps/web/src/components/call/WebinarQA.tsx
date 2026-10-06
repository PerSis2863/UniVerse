'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check, ChevronUp, EyeOff, MessageCircleQuestion, Send, X } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Q&A in a webinar (Stage 4 · 2.10; cloudflare/worker.ts CallRoom): anyone asks (with their name or
// anonymously), everyone upvotes once per question, the most wanted rise to the top. Hosts mark a
// question answered (it moves down) or hide it. A side panel on computers, a sheet on phones.

export interface QaItem { id: string; by: string | null; text: string; at: number; votes: number; mine: boolean; own: boolean; answered: boolean }

export function WebinarQA({ open, onClose, items, canModerate, onAsk, onVote, onAnswer, onHide }: {
  open: boolean; onClose: () => void; items: QaItem[]; canModerate: boolean;
  onAsk: (text: string, anon: boolean) => void; onVote: (id: string, up: boolean) => void;
  onAnswer: (id: string, on: boolean) => void; onHide: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const ask = () => {
    const t = text.trim();
    if (!t) return;
    haptic('tap');
    onAsk(t, anon);
    setText('');
  };
  const open_ = items.filter((q) => !q.answered).length;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="qa" role="dialog" aria-label="Questions and answers"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl sm:inset-x-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:w-[22rem] sm:max-h-none sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="font-semibold flex items-center gap-2"><MessageCircleQuestion className="w-4 h-4 text-fuchsia-300" />Q&amp;A <span className="text-zinc-400 font-normal">· {open_} open</span></p>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <ul className="flex-1 overflow-y-auto px-3 space-y-2 pb-3" aria-label="Questions">
              {items.length === 0 && <li className="text-sm text-zinc-400 px-1 py-6 text-center">No questions yet. Ask the first one below.</li>}
              {items.map((q) => (
                <motion.li key={q.id} layout transition={spring.smooth} className={cn('rounded-2xl px-3 py-2.5 flex gap-2.5', q.answered ? 'bg-white/[0.03] opacity-70' : 'bg-white/[0.06]')}>
                  <button type="button" onClick={() => { haptic('tap'); onVote(q.id, !q.mine); }} disabled={q.answered} aria-pressed={q.mine} aria-label={`${q.mine ? 'Remove my upvote' : 'Upvote'}: ${q.votes}`}
                    className={cn('shrink-0 w-10 rounded-xl flex flex-col items-center justify-center py-1 text-xs font-bold tabular-nums transition-colors disabled:cursor-default', q.mine ? 'bg-gradient-to-b from-indigo-500 to-fuchsia-500 text-white' : 'bg-white/10 hover:bg-white/15 text-zinc-200')}>
                    <ChevronUp className="w-4 h-4" />{q.votes}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100 break-words">{q.text}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">{q.by ?? 'Anonymous'}{q.own ? ' (you)' : ''}{q.answered ? ' · answered' : ''}</p>
                    {canModerate && (
                      <div className="mt-1.5 flex gap-1.5">
                        <button type="button" onClick={() => onAnswer(q.id, !q.answered)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white/10 hover:bg-white/20"><Check className="w-3 h-3" />{q.answered ? 'Not answered' : 'Answered'}</button>
                        <button type="button" onClick={() => onHide(q.id)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white/10 hover:bg-white/20"><EyeOff className="w-3 h-3" />Hide</button>
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
            <div className="border-t border-white/10 p-3 space-y-2">
              <div className="flex items-end gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={1} placeholder="Ask a question"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
                  aria-label="Your question" className="flex-1 min-w-0 resize-none max-h-28 rounded-2xl bg-white/10 px-3.5 py-2.5 text-sm placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-indigo-400/50" />
                <button type="button" onClick={ask} disabled={!text.trim()} aria-label="Ask" className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4" /></button>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300 select-none">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="accent-fuchsia-500" /> Ask without my name
              </label>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
