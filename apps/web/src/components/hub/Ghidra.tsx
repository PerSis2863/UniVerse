'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Check, ChevronRight, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import Link from '@/components/ui/Link';
import { MathText } from '@/components/ui/MathText';
import { api, errorMessage } from '@/lib/api';
import { ASK_PAGES, type AskPlan, type AskTurn } from '@/lib/ask';
import { inboxFor, settingsFor } from '@/lib/apps';
import { spring } from '@/lib/motion';
import { cleanCode } from '@/lib/trace';
import { cn } from '@/lib/utils';

// Ghidra, the assistant (M363; "Ask UniVerse", M30, until then; src/lib/ask.ts): a short chat. Each request gets one
// reply: an answer, a list of the person's own things ('show': what's due, Green numbers), or one proposed action as a
// card that does nothing until confirmed. Confirming calls the app's own route (the same checks as doing it by hand).
// The last turns go back with the next question so follow-ups work. Search (⌘K) hands a sentence over here through
// sessionStorage "uv-ask".

const EXAMPLES = ['What’s due this week?', 'How am I doing in Green?', 'I cycled 8 km to school', 'We need drinking water for 4 people'];

type Reply = AskPlan & { note?: string };
interface Turn { id: number; q: string; reply: Reply | null; done?: 'done' | 'cancelled' }

const home = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');
function pageHref(page: keyof typeof ASK_PAGES, role: string) {
  if (page === 'inbox') return inboxFor(role);
  if (page === 'settings') return settingsFor(role);
  return ASK_PAGES[page].href.replace(':home', home(role));
}
const here = () => new Promise<{ lat: number; lng: number } | null>((done) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 6000, maximumAge: 600_000 }) : done(null)));
const confirmLabel = (p: Reply) => (p.action === 'green_log' ? 'Log it' : p.action === 'relief_post' ? 'Post it' : p.action === 'trace_check' ? 'Check it' : 'Open');
const acts = (p: Reply) => p.action === 'green_log' || p.action === 'relief_post' || p.action === 'trace_check' || p.action === 'open';

export function Ghidra({ role }: { role: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<'ask' | number | null>(null);
  const next = useRef(1);
  const list = useRef<HTMLOListElement>(null);

  const ask = useCallback(async (q: string, before: Turn[]) => {
    if (!q.trim()) return;
    const id = next.current++;
    const history: AskTurn[] = before.slice(-3).flatMap((t) => [{ who: 'me' as const, text: t.q }, ...(t.reply ? [{ who: 'ghidra' as const, text: t.reply.say }] : [])]);
    setTurns([...before, { id, q, reply: null }].slice(-8));
    setText('');
    setBusy('ask');
    try {
      const reply = (await api.post<Reply>('/ask', { text: q, history })).data;
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, reply } : t)));
    } catch (err) {
      toast.error(errorMessage(err, 'Ghidra couldn’t answer right now.'));
      setTurns((ts) => ts.filter((t) => t.id !== id));
      setText(q);
    } finally { setBusy(null); }
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

  const settle = (id: number, done: Turn['done']) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, done } : t)));
  const confirm = async (turn: Turn) => {
    const plan = turn.reply;
    if (!plan) return;
    setBusy(turn.id);
    try {
      if (plan.action === 'green_log') {
        await api.post('/green/actions', { kind: plan.kind, amount: plan.amount, note: plan.note });
        toast.success('Logged in Green.', { action: { label: 'Open Green', onClick: () => router.push('/green') } });
        void mutate('/hub/wallet');
      } else if (plan.action === 'relief_post') {
        const pos = await here();
        if (!pos) { toast.error('Relief needs your location to put it on the map. Allow it, or post it from the Relief map.'); router.push('/relief'); return; }
        await api.post('/relief/posts', { type: plan.type, kind: plan.kind, title: plan.title, people: plan.people, urgency: plan.urgency, ...pos });
        toast.success('Posted on Relief. Helpers nearby can see it now.', { action: { label: 'Open Relief', onClick: () => router.push('/relief/mine') } });
      } else if (plan.action === 'trace_check') {
        router.push(`/t/${cleanCode(plan.code)}`);
      } else if (plan.action === 'open') {
        router.push(pageHref(plan.page, role));
      }
      settle(turn.id, 'done');
    } catch (err) { toast.error(errorMessage(err, 'That didn’t work.')); } finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="ghidra-h" className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="ghidra-h" className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white"><Sparkles className="w-5 h-5 text-fuchsia-500" aria-hidden />Ghidra</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Your UniVerse assistant. Ask what’s due, how you’re doing, or say what you want to do in any app. You’ll see exactly what will happen before anything is done.</p>
        </div>
        {turns.length > 0 && <button type="button" onClick={() => setTurns([])} disabled={busy !== null} className="btn-secondary btn-sm shrink-0"><RotateCcw className="w-4 h-4" aria-hidden />New chat</button>}
      </div>

      {turns.length > 0 && (
        <ol ref={list} className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain" aria-live="polite">
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.li key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className="space-y-2">
                <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-zinc-900 px-3.5 py-2 text-sm text-white dark:bg-white dark:text-zinc-900" translate="no">{t.q}</p>
                {!t.reply ? (
                  <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Ghidra is thinking…</p>
                ) : (
                  <div className={cn('max-w-[92%] rounded-2xl rounded-es-md border p-3.5', acts(t.reply) && !t.done ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.06]' : 'border-zinc-200 bg-[var(--fill)] dark:border-white/10')}>
                    <div className="text-sm text-zinc-800 dark:text-zinc-100" translate="no"><MathText text={t.reply.say} /></div>
                    {t.reply.action === 'show' && t.reply.items.length > 0 && (
                      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-white/10">
                        {t.reply.items.map((i, n) => {
                          const body = <><span className="min-w-0 flex-1"><span className="block truncate font-medium text-zinc-900 dark:text-white" translate="no">{i.title}</span><span className="block truncate text-xs text-zinc-600 dark:text-zinc-300">{i.sub}</span></span>{i.href && <ChevronRight className="w-4 h-4 shrink-0 text-zinc-400 rtl:rotate-180" aria-hidden />}</>;
                          return <li key={n}>{i.href ? <Link href={i.href} className="flex items-center gap-2 py-2 text-sm">{body}</Link> : <span className="flex items-center gap-2 py-2 text-sm">{body}</span>}</li>;
                        })}
                      </ul>
                    )}
                    {t.reply.note && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{t.reply.note}</p>}
                    {acts(t.reply) && (t.done ? (
                      <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t.done === 'done' ? 'Done.' : 'Cancelled.'}</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void confirm(t)} disabled={busy !== null} className="btn-primary btn-sm">{busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}{confirmLabel(t.reply)}</button>
                        <button type="button" onClick={() => settle(t.id, 'cancelled')} className="btn-secondary btn-sm"><X className="w-4 h-4" aria-hidden />Cancel</button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void ask(text, turns); }} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="ghidra-input">Ask Ghidra</label>
        <input id="ghidra-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder={turns.length ? 'Ask a follow-up…' : 'What’s due this week?'} className="input flex-1" />
        <button type="submit" disabled={busy !== null || !text.trim()} className="btn-primary shrink-0">{busy === 'ask' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden />}<span className="max-sm:sr-only">Ask</span></button>
      </form>
      {!turns.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => void ask(e, [])} className="rounded-full border border-zinc-200 dark:border-white/10 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:border-fuchsia-400/60 transition-colors">{e}</button>)}
        </div>
      )}
    </section>
  );
}
