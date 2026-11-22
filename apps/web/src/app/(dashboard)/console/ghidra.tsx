'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Segmented } from '@/components/ui/Segmented';
import { card } from './shared';
import type { GhidraMeta } from '@/lib/ghidra';

// Owner console → Server → Usage: try Ghidra (M362), UniVerse's own GPT, trained from nothing (scripts/ai/train-ghidra.py).
// It runs in this browser on a background thread (src/lib/ghidra.worker.ts), started only when Write is pressed.

const STARTS = ['Once upon a time', 'Your class', 'Lily wanted to'];
const QUESTIONS = ['What is Relief?', 'How do I join a course?', 'Who are you?'];

export function GhidraCard() {
  const [mode, setMode] = useState<'ask' | 'write'>('ask');
  const [prompt, setPrompt] = useState(QUESTIONS[0]);
  const [heat, setHeat] = useState(0.8);
  const [out, setOut] = useState<{ start: string; text: string } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'writing'>('idle');
  const [meta, setMeta] = useState<GhidraMeta | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const go = () => {
    if (state !== 'idle') { worker.current?.postMessage({ stop: true }); return; }
    if (!worker.current) {
      const w = new Worker(new URL('../../../lib/ghidra.worker.ts', import.meta.url));
      w.onmessage = (e: MessageEvent<{ meta?: GhidraMeta; text?: string; done?: boolean; error?: boolean }>) => {
        if (e.data.meta) { setMeta(e.data.meta); setState('writing'); }
        if (e.data.text) { const t = e.data.text; setOut((o) => (o ? { ...o, text: o.text + t } : o)); }
        if (e.data.done) setState('idle');
        if (e.data.error) { setError('Ghidra couldn’t load. Check the connection and try again.'); setState('idle'); }
      };
      worker.current = w;
    }
    const start = prompt.trim() || (mode === 'ask' ? QUESTIONS[0] : STARTS[0]);
    setError('');
    setOut({ start: mode === 'ask' ? '' : start, text: '' });
    setState(meta ? 'writing' : 'loading');
    worker.current.postMessage({ prompt: start, heat, max: mode === 'ask' ? 300 : 600, ask: mode === 'ask' });
  };

  return (
    <div className={cn(card, 'p-6 space-y-4')}>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" aria-hidden /> Ghidra, our own AI</h2>
        <p className="text-sm text-zinc-500 mt-1">A GPT that UniVerse trained itself, from nothing, on UniVerse’s own sentences and simple English stories. It runs on this device: nothing is sent anywhere. Ask it about UniVerse, or start a story and it writes on. It is small and still learning: it answers well only what it was taught, so check what it says.</p>
      </div>
      <Segmented label="What Ghidra does" value={mode} onChange={(m) => { setMode(m); setPrompt(m === 'ask' ? QUESTIONS[0] : STARTS[0]); setOut(null); }} segments={[{ value: 'ask', label: 'Ask' }, { value: 'write', label: 'Write on' }]} />
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="block"><span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{mode === 'ask' ? 'Your question' : 'Start it off with'}</span>
          <input value={prompt} maxLength={200} onChange={(e) => setPrompt(e.target.value)} className="input mt-1" />
        </label>
        <div className="flex flex-wrap gap-2">
          {(mode === 'ask' ? QUESTIONS : STARTS).map((s) => <button key={s} type="button" onClick={() => setPrompt(s)} className="btn-secondary btn-sm">{s}</button>)}
        </div>
        {mode === 'write' && <label className="flex flex-wrap items-center gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <span>Careful</span>
          <input type="range" min={0.2} max={1.4} step={0.1} value={heat} onChange={(e) => setHeat(Number(e.target.value))} className="flex-1 min-w-32 accent-indigo-500" aria-label="How adventurous" />
          <span>Adventurous</span>
        </label>}
        <button type="submit" className="btn-primary">
          {state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : state === 'writing' ? <Square className="w-4 h-4" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
          {state === 'loading' ? 'Loading (2.8 MB)… Stop' : state === 'writing' ? 'Stop' : mode === 'ask' ? 'Ask' : 'Write'}
        </button>
      </form>
      {error && <p className="text-sm text-rose-600 dark:text-rose-300" role="alert">{error}</p>}
      {out && (
        <p className="rounded-2xl bg-[var(--fill)] p-4 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap" aria-live="polite" data-no-motion>
          <span className="text-zinc-500 dark:text-zinc-400">{out.start}</span>{out.text}
        </p>
      )}
      {meta && (
        <p className="text-xs text-zinc-500">
          {(meta.params / 1e6).toFixed(1)} million numbers learned · from {(meta.trainedOn / 1e6).toFixed(0)} million letters · {meta.layers} layers, {meta.steps.toLocaleString()} training steps · after Andrej Karpathy’s nanoGPT
        </p>
      )}
    </div>
  );
}
