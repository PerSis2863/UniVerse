'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { GhidraReply, type GhidraPlan, type Settled } from '@/components/ui/GhidraReply';
import { api, errorMessage } from '@/lib/api';
import type { AskTurn } from '@/lib/ask';
import { pop } from '@/lib/motion';

// Ghidra, the assistant (M422; "Ask UniVerse", M30, until then; src/lib/ask.ts): a short chat on the hub. Each request
// gets one reply (GhidraReply: an answer, a list of the person's own things, or one action to confirm). The last turns go
// back with the next question so follow-ups work. Search (⌘K) hands a sentence over here through sessionStorage "uv-ask".
// The same Ghidra answers on every page in the corner assistant (AIStudyAssistant, M423).

const EXAMPLES = ['What’s due this week?', 'How am I doing in Green?', 'I cycled 8 km to school', 'We need drinking water for 4 people'];

interface Turn { id: number; q: string; reply: GhidraPlan | null; done?: Settled }

export function Ghidra({ role }: { role: string }) {
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const next = useRef(1);
  const list = useRef<HTMLOListElement>(null);

  const ask = useCallback(async (q: string, before: Turn[]) => {
    if (!q.trim()) return;
    const id = next.current++;
    const history: AskTurn[] = before.slice(-3).flatMap((t) => [{ who: 'me' as const, text: t.q }, ...(t.reply ? [{ who: 'ghidra' as const, text: t.reply.say }] : [])]);
    setTurns([...before, { id, q, reply: null }].slice(-8));
    setText('');
    setBusy(true);
    try {
      const reply = (await api.post<GhidraPlan>('/ask', { text: q, history })).data;
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, reply } : t)));
    } catch (err) {
      toast.error(errorMessage(err, 'Ghidra couldn’t answer right now.'));
      setTurns((ts) => ts.filter((t) => t.id !== id));
      setText(q);
    } finally { setBusy(false); }
  }, []);

  // A sentence typed in search arrives here.
  useEffect(() => {
    let q: string | null = null;
    try { q = sessionStorage.getItem('uv-ask'); sessionStorage.removeItem('uv-ask'); } catch { /* storage unavailable */ }
    if (!q) return;
    const t = setTimeout(() => void ask(q!, []), 0);
    return () => clearTimeout(t);
  }, [ask]);

  // The newest reply stays in view.
  useEffect(() => { list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }, [turns]);

  const settle = (id: number, done: Settled) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, done } : t)));

  return (
    <section aria-labelledby="ghidra-h" className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ghidra-h" className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white"><Sparkles className="w-5 h-5 text-fuchsia-500" aria-hidden />Ghidra</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Your UniVerse assistant. Ask what’s due, how you’re doing, or say what you want to do in any app. You’ll see exactly what will happen before anything is done.</p>
        </div>
        {turns.length > 0 && <button type="button" onClick={() => setTurns([])} disabled={busy} className="btn-secondary btn-sm shrink-0"><RotateCcw className="w-4 h-4" aria-hidden />New chat</button>}
      </div>

      {turns.length > 0 && (
        <ol ref={list} className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain" aria-live="polite">
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.li key={t.id} initial={{ opacity: 0, transform: 'translateY(8px)' }} animate={{ opacity: 1, transform: 'translateY(0px)' }} transition={pop.spring} className="space-y-2">
                <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-zinc-900 px-3.5 py-2 text-sm text-white dark:bg-white dark:text-zinc-900" translate="no">{t.q}</p>
                {!t.reply ? (
                  <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Ghidra is thinking…</p>
                ) : (
                  <GhidraReply plan={t.reply} role={role} settled={t.done} onSettle={(d) => settle(t.id, d)} className="max-w-[92%]" question={t.q} />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void ask(text, turns); }} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="ghidra-input">Ask Ghidra</label>
        <input id="ghidra-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder={turns.length ? 'Ask a follow-up…' : 'What’s due this week?'} className="input flex-1" />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden />}<span className="max-sm:sr-only">Ask</span></button>
      </form>
      {!turns.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => void ask(e, [])} className="rounded-full border border-zinc-200 dark:border-white/10 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:border-fuchsia-400/60 transition-colors">{e}</button>)}
        </div>
      )}
    </section>
  );
}
