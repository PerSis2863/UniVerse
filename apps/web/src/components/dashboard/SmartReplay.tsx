'use client';

import { useEffect, useState, type RefObject } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { BookOpen, Check, ChevronDown, Clapperboard, ListChecks, Loader2, PlayCircle, Quote, Search, Sparkles, Star, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Smart replay (Stage 4 · 4.6): each class with class notes gets chapters, "find where it was
// explained", a two-minute recap and practice questions linked to the moment in the class. Made in
// the same AI request as the study pack (src/server/class-companion.ts); the search uses no AI.

export interface Chapter { t: number; title: string }
export interface Practice { question: string; options: string[]; answer: number; explain: string; t: number }

const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

/** The player, chapters, search and recap. `video` is shared with the practice questions ("watch this part"). */
export function ReplayPanel({ sessionId, chapters, recap, recordingUrl, canMakeReplay, video, seek, onMade }: {
  sessionId: string; chapters: Chapter[]; recap: string | null; recordingUrl: string | null; canMakeReplay: boolean;
  video: RefObject<HTMLVideoElement | null>; seek: (t: number) => void; onMade: () => void;
}) {
  const [current, setCurrent] = useState(-1);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ t: number; text: string; kind: 'said' | 'chapter' | 'moment' }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [making, setMaking] = useState(false);

  // "Find where it was explained": searched a moment after typing stops.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let off = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await authedJson<{ results: typeof found }>(`/api/class-sessions/${sessionId}/replay?q=${encodeURIComponent(query)}`);
        if (!off) setFound(r.results ?? []);
      } catch (e) { if (!off) toast.error((e as Error).message); } finally { if (!off) setSearching(false); }
    }, 400);
    return () => { off = true; clearTimeout(t); };
  }, [q, sessionId]);

  const make = async () => {
    setMaking(true);
    try {
      await authedJson(`/api/class-sessions/${sessionId}/replay`, { method: 'POST' });
      toast.success('The replay is ready: chapters, a recap and practice questions.');
      onMade();
    } catch (e) { toast.error((e as Error).message); } finally { setMaking(false); }
  };

  if (!recordingUrl && !chapters.length && !recap) {
    return canMakeReplay ? (
      <section className="rounded-xl bg-indigo-500/[0.06] border border-indigo-500/15 p-3 flex flex-wrap items-center gap-2">
        <Clapperboard className="w-4 h-4 text-indigo-500 shrink-0" />
        <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">Give this class a smart replay: chapters, a two-minute recap and practice questions for your students.</p>
        <button type="button" onClick={() => void make()} disabled={making} className="btn-primary btn-sm rounded-full inline-flex">{making ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Make replay</button>
      </section>
    ) : null;
  }

  const results = q.trim().length >= 2 ? found : null;
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 inline-flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" /> Replay</h4>
      {recordingUrl && (
        <video ref={video} src={recordingUrl} controls preload="metadata" playsInline className="w-full aspect-video rounded-xl bg-black"
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            let i = -1;
            for (let k = 0; k < chapters.length && chapters[k].t <= t + 0.5; k++) i = k;
            if (i !== current) setCurrent(i);
          }} />
      )}
      {chapters.length > 0 && (
        <ol className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={c.t} className="shrink-0">
              <button type="button" onClick={() => seek(c.t)} disabled={!recordingUrl} aria-current={i === current ? 'step' : undefined}
                className={cn('text-left w-44 rounded-xl border px-3 py-2 transition-colors disabled:cursor-default', i === current ? 'border-transparent bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-md' : 'border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] hover:border-indigo-300')}>
                <span className={cn('block font-mono text-[11px] tabular-nums', i === current ? 'text-white/80' : 'text-indigo-600 dark:text-indigo-300')}>{clock(c.t)}</span>
                <span className="block text-sm font-medium leading-snug line-clamp-2">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div>
        <label className="flex items-center gap-2 h-10 px-3 rounded-xl bg-zinc-100 dark:bg-white/[0.06]">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find where something was explained" aria-label="Find where something was explained"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500" />
          {searching ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : q && <button type="button" onClick={() => { setQ(''); setFound(null); }} aria-label="Clear search" className="text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>}
        </label>
        {results && (
          <ul className="mt-2 space-y-1" aria-label="Search results">
            {results.length === 0 && !searching && <li className="text-sm text-zinc-500 px-1">Nothing found. Try other words, or a chapter above.</li>}
            {results.map((r, i) => {
              const Icon = r.kind === 'chapter' ? BookOpen : r.kind === 'moment' ? Star : Quote;
              return (
                <li key={`${r.t}-${i}`}>
                  <button type="button" onClick={() => seek(r.t)} disabled={!recordingUrl} className="w-full flex items-start gap-2.5 text-left text-sm rounded-lg p-1.5 hover:bg-indigo-500/[0.06] disabled:cursor-default">
                    <span className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shrink-0">{clock(r.t)}</span>
                    <Icon className="w-3.5 h-3.5 mt-0.5 text-zinc-400 shrink-0" aria-label={r.kind === 'said' ? 'Said in class' : r.kind} />
                    <span className="min-w-0 text-zinc-700 dark:text-zinc-300">{r.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {recap && (
        <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.07] overflow-hidden">
          <button type="button" onClick={() => setRecapOpen((v) => !v)} aria-expanded={recapOpen} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-zinc-900 dark:text-white">
            <PlayCircle className="w-4 h-4 text-fuchsia-500" /> Two-minute recap
            <ChevronDown className={cn('ml-auto w-4 h-4 text-zinc-400 transition-transform', recapOpen && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {recapOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                <div className="px-3 pb-3 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {recap.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

/** Practice questions: pick an answer, see why, and watch the part of the class that explains it. */
export function PracticeQuestions({ practice, canWatch, seek }: { practice: Practice[]; canWatch: boolean; seek: (t: number) => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!practice.length) return null;
  const answered = Object.keys(picked).length;
  const right = practice.filter((q, i) => picked[i] === q.answer).length;
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500 inline-flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Practice questions <span className="font-normal normal-case">(not graded)</span></h4>
        {answered > 0 && <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 tabular-nums" role="status">{right} of {answered} right{answered === practice.length ? (right === practice.length ? ' · all right! 🎉' : '') : ''}</span>}
      </div>
      <ol className="space-y-3">
        {practice.map((q, i) => {
          const mine = picked[i];
          const done = mine !== undefined;
          return (
            <li key={i} className="rounded-xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02] p-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">{i + 1}. {q.question}</p>
              <div className="mt-2 grid gap-1.5">
                {q.options.map((o, k) => {
                  const correct = done && k === q.answer, wrong = done && k === mine && k !== q.answer;
                  return (
                    <button key={k} type="button" disabled={done} onClick={() => setPicked((p) => ({ ...p, [i]: k }))}
                      className={cn('w-full text-left text-sm rounded-lg px-3 py-2 border transition-colors flex items-center gap-2',
                        correct ? 'border-sky-600 bg-sky-600/10 text-sky-800 dark:text-sky-200' : wrong ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300' : done ? 'border-zinc-200 dark:border-white/10 text-zinc-500' : 'border-zinc-200 dark:border-white/10 hover:border-indigo-400 text-zinc-800 dark:text-zinc-200')}>
                      <span className="flex-1 min-w-0">{o}</span>
                      {correct && <Check className="w-4 h-4 shrink-0" aria-label="Right answer" />}
                      {wrong && <X className="w-4 h-4 shrink-0" aria-label="Your answer" />}
                    </button>
                  );
                })}
              </div>
              {done && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold">{mine === q.answer ? 'Right. ' : 'Not quite. '}</span>{q.explain}
                  {canWatch && <button type="button" onClick={() => seek(q.t)} className="ml-1.5 font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Watch where this was explained ({clock(q.t)})</button>}
                </motion.div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[11px] text-zinc-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Made by AI from what was said in class. It can be wrong: your teacher’s word wins.</p>
    </section>
  );
}
