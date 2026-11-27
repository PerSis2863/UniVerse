'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';

// Aether → a guide → Ask Ghidra (M549b): a question about the place, answered from its own guide (sights, food, areas,
// getting around, customs). The answer says when the guide doesn't cover something.

const STARTERS = ['What should I eat here?', 'What are the must-see sights?', 'Which area should I stay in?', 'How do I get around?', 'Any customs I should know?'];

export function AskPlace({ place, name }: { place: string; name: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ q: string; answer: string; answered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async (question: string) => {
    if (busy || question.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ answer: string; answered: boolean }>('/travel/ask', { place, question });
      setSaid({ q: question, answer: r.data.answer, answered: r.data.answered });
      setQ('');
    } catch (e) { setError(errorMessage(e, 'Ghidra couldn’t answer just now.')); } finally { setBusy(false); }
  };
  return (
    <section className="panel space-y-3 p-6" aria-labelledby="ask-place">
      <h3 id="ask-place" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><Sparkles className="h-5 w-5 text-indigo-500" aria-hidden />Ask Ghidra about {name}</h3>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <label className="sr-only" htmlFor="ask-place-q">Your question about {name}</label>
        <input id="ask-place-q" className="input flex-1" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder={`Food, sights, areas, getting around ${name}…`} />
        <button type="submit" className="btn-primary" disabled={busy || q.trim().length < 3}>{busy ? 'Asking…' : 'Ask'}</button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {STARTERS.map((s) => <button key={s} type="button" className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/[0.06]" disabled={busy} onClick={() => void ask(s)}>{s}</button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {said && (
        <div className="rounded-xl bg-zinc-50 p-4 text-[15px] leading-relaxed text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-100" aria-live="polite">
          <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{said.q}</p>
          <p className="whitespace-pre-line">{said.answer}</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">From this guide (Wikivoyage){said.answered ? '' : ': it doesn’t cover all of that'}. Check opening hours and prices locally.</p>
        </div>
      )}
    </section>
  );
}
