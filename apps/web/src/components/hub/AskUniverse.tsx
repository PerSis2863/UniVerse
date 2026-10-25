'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { MathText } from '@/components/ui/MathText';
import { api, errorMessage } from '@/lib/api';
import { ASK_PAGES, type AskPlan } from '@/lib/ask';
import { inboxFor, settingsFor } from '@/lib/apps';
import { spring } from '@/lib/motion';
import { cleanCode } from '@/lib/trace';

// "Ask UniVerse" (M30, src/lib/ask.ts): say what you want to do, in any app; it proposes one action
// as a card and nothing happens until you confirm. Confirming calls the app's own route (the same
// checks as doing it by hand). Search (⌘K) hands a sentence over here through sessionStorage "uv-ask".

const EXAMPLES = ['I cycled 8 km to school', 'We need drinking water for 4 people', 'Open my Green teams'];

const home = (role: string) => (role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : '/student');
function pageHref(page: keyof typeof ASK_PAGES, role: string) {
  if (page === 'inbox') return inboxFor(role);
  if (page === 'settings') return settingsFor(role);
  return ASK_PAGES[page].href.replace(':home', home(role));
}
const here = () => new Promise<{ lat: number; lng: number } | null>((done) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition((g) => done({ lat: g.coords.latitude, lng: g.coords.longitude }), () => done(null), { timeout: 6000, maximumAge: 600_000 }) : done(null)));

export function AskUniverse({ role }: { role: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<(AskPlan & { note?: string }) | null>(null);
  const [busy, setBusy] = useState<'ask' | 'do' | null>(null);

  const ask = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setBusy('ask'); setPlan(null);
    try { setPlan((await api.post<AskPlan & { note?: string }>('/ask', { text: q })).data); } catch (err) { toast.error(errorMessage(err, 'Could not ask right now.')); } finally { setBusy(null); }
  }, []);

  // A sentence typed in search arrives here.
  useEffect(() => {
    let q: string | null = null;
    try { q = sessionStorage.getItem('uv-ask'); sessionStorage.removeItem('uv-ask'); } catch { /* storage unavailable */ }
    if (!q) return;
    const t = setTimeout(() => { setText(q!); void ask(q!); }, 0);
    return () => clearTimeout(t);
  }, [ask]);

  const confirm = async () => {
    if (!plan) return;
    setBusy('do');
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
      setPlan(null); setText('');
    } catch (err) { toast.error(errorMessage(err, 'That didn’t work.')); } finally { setBusy(null); }
  };

  const confirmLabel = plan?.action === 'green_log' ? 'Log it' : plan?.action === 'relief_post' ? 'Post it' : plan?.action === 'trace_check' ? 'Check it' : 'Open';
  return (
    <section aria-labelledby="ask-h" className="panel p-5 sm:p-6">
      <h2 id="ask-h" className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white"><Sparkles className="w-5 h-5 text-fuchsia-500" aria-hidden />Ask UniVerse</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Say what you want to do in any app. You’ll see exactly what will happen before anything is done.</p>
      <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="ask-input">What would you like to do?</label>
        <input id="ask-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="I recycled 3 kg today" className="input flex-1" />
        <button type="submit" disabled={busy !== null || !text.trim()} className="btn-primary shrink-0">{busy === 'ask' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" aria-hidden />}<span className="max-sm:sr-only">Ask</span></button>
      </form>
      {!plan && busy !== 'ask' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => { setText(e); void ask(e); }} className="rounded-full border border-zinc-200 dark:border-white/10 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-200 hover:border-fuchsia-400/60 transition-colors">{e}</button>)}
        </div>
      )}
      <AnimatePresence mode="wait">
        {plan && (
          <motion.div key={plan.say} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }} transition={spring.snappy}
            className="mt-4 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/[0.06] p-4" role="status">
            <div className="text-sm text-zinc-800 dark:text-zinc-100" translate="no"><MathText text={plan.say} /></div>
            {plan.note && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{plan.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.action !== 'answer' && <button type="button" onClick={() => void confirm()} disabled={busy !== null} className="btn-primary btn-sm">{busy === 'do' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden />}{confirmLabel}</button>}
              <button type="button" onClick={() => setPlan(null)} className="btn-secondary btn-sm"><X className="w-4 h-4" aria-hidden />{plan.action === 'answer' ? 'Close' : 'Cancel'}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
