'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Bot, CheckCircle2, Cpu, Loader2, Mic, Plus, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { card, errorMessage, fetcher } from './shared';

// Owner console → Server → AI models & agents: which Gemini models answer (src/server/ai-models.ts)
// and whether the repair agents are set up (src/server/repair-agents.ts).

interface ModelInfo { id: string; label: string; note: string }
interface AiData {
  models: { text: string[]; live: string };
  text: ModelInfo[];
  live: ModelInfo[];
  repair: { github: boolean; repo: string; agents: { id: string; label: string; maker: string; model: string; how: 'github' | 'copy'; note: string }[] };
}

const select = 'h-9 rounded-full bg-[var(--fill)] px-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 max-w-full';

export function AiModelsCard() {
  const { data, mutate } = useSWR<AiData>('/owner/ai', fetcher, { revalidateOnFocus: false });
  return (
    <div className={cn(card, 'p-6 space-y-5')}>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Cpu className="w-4 h-4 text-indigo-500" /> AI models & agents</h2>
        <p className="text-sm text-zinc-500 mt-1">Text answers try the models in order: when one is busy (its free per-minute limit is used up) the next answers, so more people can use AI at the same time.</p>
      </div>
      {!data ? <div className="h-40 rounded-xl skeleton" /> : <ModelsForm key={JSON.stringify(data.models)} data={data} onSaved={() => void mutate()} />}
      {data && <Agents data={data} />}
    </div>
  );
}

function ModelsForm({ data, onSaved }: { data: AiData; onSaved: () => void }) {
  const [text, setText] = useState(data.models.text);
  const [live, setLive] = useState(data.models.live);
  const [busy, setBusy] = useState(false);
  const info = (id: string) => data.text.find((m) => m.id === id);
  const changed = live !== data.models.live || text.join() !== data.models.text.join();
  const move = (i: number, by: number) => setText((t) => { const n = [...t]; [n[i], n[i + by]] = [n[i + by], n[i]]; return n; });

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/owner/ai', { models: { text, live } });
      toast.success('AI models saved', { description: 'They’re used within a minute.' });
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500">Text answers (tutor, summaries, grading drafts, translations), in order</p>
        <ol className="ios-list">
          <AnimatePresence initial={false}>
            {text.map((id, i) => (
              <motion.li key={id} layout transition={spring.smooth} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="ios-cell">
                <span className="w-6 h-6 rounded-full bg-[var(--fill)] text-xs font-semibold flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-zinc-900 dark:text-white">{info(id)?.label ?? id}</span>
                  <span className="block text-xs text-zinc-500 truncate">{info(id)?.note}</span>
                </span>
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="btn-ghost btn-icon rounded-full disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Move down" disabled={i === text.length - 1} onClick={() => move(i, 1)} className="btn-ghost btn-icon rounded-full disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label="Remove" disabled={text.length === 1} onClick={() => setText((t) => t.filter((x) => x !== id))} className="btn-ghost btn-icon rounded-full text-[var(--ios-red)] disabled:opacity-30"><X className="w-4 h-4" /></button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {text.length < 5 && data.text.some((m) => !text.includes(m.id)) && (
          <label className="flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4 text-tint-text" />
            <select aria-label="Add a model" value="" onChange={(e) => e.target.value && setText((t) => [...t, e.target.value])} className={select}>
              <option value="">Add a model…</option>
              {data.text.filter((m) => !text.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Voice tutor (spoken, real time)</p>
        <select aria-label="Voice tutor model" value={live} onChange={(e) => setLive(e.target.value)} className={cn(select, 'w-full')}>
          {data.live.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
        </select>
        <p className="text-xs text-zinc-500">Live models answer by voice only (no text), so they power the voice tutor, not the text features.</p>
      </section>

      <button type="button" onClick={() => void save()} disabled={!changed || busy} className="btn-primary btn-sm">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save models
      </button>
    </div>
  );
}

function Agents({ data }: { data: AiData }) {
  const [open, setOpen] = useState(false);
  const ok = data.repair.github;
  return (
    <section className="space-y-2 pt-1" style={{ boxShadow: 'inset 0 0.5px 0 var(--separator)' }}>
      <p className="pt-4 text-xs font-semibold text-zinc-500 flex items-center gap-1"><Bot className="w-3.5 h-3.5" /> Repair agents (Errors → Repair with…)</p>
      <ul className="text-sm space-y-1.5">
        <li className="flex items-start gap-2">{ok ? <CheckCircle2 className="w-4 h-4 text-[var(--ios-green)] mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />}<span><b className="font-semibold">Claude Code</b> (Opus 5.5, Sonnet 5.5, Haiku 4.5, Fable 5.1) and <b className="font-semibold">Jules</b> (Gemini) work from GitHub issues in {data.repair.repo}{ok ? '.' : ': needs the GITHUB_REPAIR_TOKEN secret.'}</span></li>
        <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-[var(--ios-green)] mt-0.5 shrink-0" /><span><b className="font-semibold">Antigravity</b>: always ready. It copies a repair brief to paste into Antigravity on your computer.</span></li>
      </ul>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-semibold text-tint-text">{open ? 'Hide setup' : 'How to set them up'}</button>
      {open && (
        <ol className="list-decimal pl-5 text-sm text-zinc-600 dark:text-zinc-300 space-y-1.5">
          <li>GitHub → Settings → Developer settings → Fine-grained tokens: a token for {data.repair.repo} with <b>Issues: read and write</b>. Add it in Cloudflare → universe-web → Settings → Variables and Secrets as the secret <code>GITHUB_REPAIR_TOKEN</code>.</li>
          <li>Claude Code: on a computer signed in to your Claude Pro or Max account, run <code>claude setup-token</code>, then add the token in GitHub → the repository → Settings → Secrets and variables → Actions as <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Repairs then run on your Claude subscription.</li>
          <li>Jules: sign in at jules.google with GitHub and give it access to {data.repair.repo}.</li>
          <li>Every agent only opens a pull request. You review it; merging deploys it as usual.</li>
        </ol>
      )}
    </section>
  );
}
