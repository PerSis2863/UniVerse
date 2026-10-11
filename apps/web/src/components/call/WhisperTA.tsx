'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookOpen, Ear, Loader2, MessageCircleQuestion, SendHorizontal, Sparkles, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useActivePoll } from '@/lib/realtime-client';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { SentLine } from '@/lib/whisper';

// Whisper TA (Stage 5 · D2; src/server/whisper.ts). Students in a class call ask quietly and get a
// short answer from the course materials and the last ten minutes of what was said (their browser
// sends the captions it received). The teacher sees topics and how many students asked, never who.

interface Question { id: string; question: string; answer: string | null; grounded: boolean; live: boolean; citations: { n: number; title: string }[]; addressed: boolean; at: string }
interface Topic { topic: string; students: number; latest: string; topics: string[] }

/** For students: the side panel to ask the TA. `heard` gives the last minutes of captions. */
export function WhisperPanel({ open, onClose, callId, heard }: { open: boolean; onClose: () => void; callId: string; heard: () => SentLine[] }) {
  const url = `/api/calls/${callId}/whisper`;
  const { data, mutate } = useSWR<{ questions: Question[] }>(open ? url : null, authedJson, { revalidateOnFocus: false });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [hearing, setHearing] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const questions = data?.questions ?? [];

  useEffect(() => {
    const el = listRef.current;
    if (el && open) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [questions.length, busy, open]);
  // Whether captions are reaching this device (the TA then knows what was just said).
  useEffect(() => {
    if (!open) return;
    const check = () => setHearing(heard().length > 0);
    const first = setTimeout(check, 0);
    const t = setInterval(check, 10_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [open, heard]);

  const ask = async () => {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    haptic('tap');
    setBusy(q);
    setText('');
    try {
      const got = await authedJson<Question>(url, { method: 'POST', body: JSON.stringify({ question: q, heard: heard() }) });
      await mutate((d) => ({ questions: [...(d?.questions ?? []), got] }), { revalidate: false });
    } catch (e) {
      setText(q);
      toast.error((e as Error).message || 'The TA couldn’t answer just now.');
    } finally { setBusy(null); }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="ta" role="dialog" aria-label="Ask the TA"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 h-[78vh] rounded-t-3xl sm:inset-x-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:h-auto sm:w-[22rem] sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-fuchsia-300" aria-hidden />Ask the TA</p>
                <p className="text-[11px] text-zinc-400">Only you see this. Your teacher sees only the topics people ask about, never who.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2" aria-live="polite">
              {!data && <div className="h-full grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" aria-label="Loading" /></div>}
              {data && questions.length === 0 && !busy && (
                <div className="h-full flex flex-col items-center justify-center text-center text-sm text-zinc-400 gap-2 px-6">
                  <MessageCircleQuestion className="w-8 h-8 text-zinc-600" aria-hidden />
                  Didn’t catch something? Ask quietly, like “what does she mean by a base case?” The TA answers from the course materials and what was just said.
                </div>
              )}
              {questions.map((q) => (
                <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className="space-y-1.5">
                  <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm bg-gradient-to-br from-indigo-500 to-fuchsia-500 whitespace-pre-wrap break-words">{q.question}</p></div>
                  {q.answer && (
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-sm bg-white/10 leading-snug">
                      <p className="whitespace-pre-wrap break-words">{q.answer}</p>
                      {(q.citations.length > 0 || q.live) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {q.live && <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 text-fuchsia-200 px-2 py-0.5 text-[10px] font-semibold"><Ear className="w-3 h-3" aria-hidden />In class</span>}
                          {q.citations.map((c) => <span key={c.n} className="inline-flex items-center gap-1 rounded-full bg-white/10 text-zinc-300 px-2 py-0.5 text-[10px] max-w-full truncate" title={c.title}><BookOpen className="w-3 h-3 shrink-0" aria-hidden />[{c.n}] {c.title}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                  {q.addressed && <p className="text-[11px] text-emerald-300 pl-1">Your teacher saw questions on this and went over it.</p>}
                </motion.div>
              ))}
              {busy && (
                <div className="space-y-1.5">
                  <div className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm bg-gradient-to-br from-indigo-500/60 to-fuchsia-500/60">{busy}</p></div>
                  <p className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs text-zinc-300"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />The TA is thinking…</p>
                </div>
              )}
            </div>
            {!hearing && <p className="px-4 pb-1 text-[11px] text-amber-200/90">Captions aren’t reaching you yet, so the TA answers from the course materials. They start when someone speaks.</p>}
            <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="p-3 pt-2 flex items-end gap-2 border-t border-white/[0.06]">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500} placeholder="Ask about the class…" aria-label="Your question"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } }}
                className="flex-1 min-w-0 resize-none max-h-28 rounded-2xl bg-white/[0.07] border border-white/10 px-3.5 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400/60" />
              <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={text.trim().length < 3 || !!busy} aria-label="Ask"
                className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center disabled:opacity-40"><SendHorizontal className="w-4 h-4" /></motion.button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** For students: the pill next to "I'm lost" / "Got it". */
export function WhisperPill({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={onOpen} aria-expanded={open}
      className={cn('pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold backdrop-blur-xl border transition-colors', open ? 'bg-fuchsia-500 border-fuchsia-400 text-white' : 'bg-black/40 border-white/10 text-zinc-100 hover:bg-white/10')}>
      <Sparkles className="w-4 h-4" aria-hidden />Ask the TA
    </motion.button>
  );
}

/** For the teacher: what students are asking the TA about, with a nudge to re-explain. */
export function WhisperTopics({ callId }: { callId: string }) {
  const url = `/api/calls/${callId}/whisper`;
  // New questions arrive as a live refresh; this is the fallback.
  const { data, mutate } = useSWR<{ topics: Topic[] }>(url, authedJson, { revalidateOnFocus: false, refreshInterval: useActivePoll(90_000), errorRetryCount: 2 });
  const [busy, setBusy] = useState<string | null>(null);
  const topics = (data?.topics ?? []).slice(0, 3);
  const done = async (t: Topic) => {
    setBusy(t.topic);
    try {
      await authedJson(url, { method: 'POST', body: JSON.stringify({ action: 'addressed', topics: t.topics }) });
      haptic('success');
      await mutate((d) => ({ topics: (d?.topics ?? []).filter((x) => x.topic !== t.topic) }), { revalidate: false });
    } catch (e) { toast.error((e as Error).message || 'Couldn’t update the TA.'); }
    finally { setBusy(null); }
  };
  return (
    <AnimatePresence>
      {topics.length > 0 && (
        <motion.div key="whisper" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.smooth}
          className="pointer-events-auto w-[min(92vw,20rem)] rounded-2xl bg-black/55 backdrop-blur-xl border border-white/10 px-3.5 py-2.5 shadow-xl" role="status" aria-label="What students are asking the TA">
          <p className="text-xs font-semibold text-zinc-100 inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-300" aria-hidden />Asked the TA</p>
          <ul className="mt-1.5 space-y-1.5">
            {topics.map((t) => (
              <li key={t.topic} className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-200 min-w-0"><span className="font-semibold tabular-nums">{t.students}</span> {t.students === 1 ? 'student' : 'students'} asked about <span className="font-semibold text-white">{t.topic}</span></span>
                <button type="button" onClick={() => void done(t)} disabled={busy === t.topic} className="shrink-0 rounded-full bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50" title="Tells them you went over it, and clears it here">
                  {busy === t.topic ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : 'Re-explained'}
                </button>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
