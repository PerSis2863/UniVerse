'use client';

import { BadgeCheck, Clock, Quote, Send } from 'lucide-react';
import { ORAL_KINDS, type Criterion, type Line, type Score } from '@/lib/oral';
import { cn } from '@/lib/utils';
import type { AiReceipt } from '@/lib/ai-receipt';

// An oral's result (Stage 5 · D11): the score for each rubric criterion with the reason and the
// student's own words as evidence, a summary, strengths and next steps, and the transcript.

export interface OralView {
  id: string; kind: string; topic: string; status: string; durationSec: number; createdAt: string;
  rubric: Criterion[]; max: number; scores: Score[] | null; total: number | null;
  summary: { summary: string; strengths: string[]; nextSteps: string[] } | null;
  teacherComment: string | null; transcript?: Line[]; title?: string | null; note?: string;
  checkId?: string | null; aiReceipt?: AiReceipt | null;
}

const mins = (s: number) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const label = (k: string) => (k in ORAL_KINDS ? ORAL_KINDS[k as keyof typeof ORAL_KINDS].label : 'Oral');

/** One criterion: score bar, reason and quote. */
export function CriterionScore({ c, s, extra }: { c: Criterion; s?: Score; extra?: React.ReactNode }) {
  const pct = s ? Math.round((s.score / c.max) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{c.name}</p>
        {s && <p className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{s.score}<span className="text-zinc-500 dark:text-zinc-400 font-medium"> / {c.max}</span></p>}
        {extra}
      </div>
      {s && (
        <div className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden>
          <div className={cn('h-full rounded-full', pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {s?.reason && <p className="text-xs text-zinc-600 dark:text-zinc-400">{s.reason}</p>}
      {s?.quote && <p className="text-xs italic text-zinc-600 dark:text-zinc-400 flex gap-1.5"><Quote className="w-3 h-3 mt-0.5 shrink-0 text-indigo-500" aria-hidden /><span><span className="sr-only">You said: </span>“{s.quote}”</span></p>}
    </li>
  );
}

export function Transcript({ lines }: { lines: Line[] }) {
  if (!lines.length) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No words were picked up.</p>;
  return (
    <ol className="space-y-1.5 text-sm">
      {lines.map((l, i) => (
        <li key={i} className={cn('rounded-xl px-3 py-1.5', l.who === 'you' ? 'bg-indigo-500/10 text-zinc-900 dark:text-white' : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-700 dark:text-zinc-300')}>
          <span className="font-semibold">{l.who === 'you' ? 'You' : 'Examiner'}:</span> {l.text}
        </li>
      ))}
    </ol>
  );
}

export function OralResult({ data, who = 'You' }: { data: OralView; who?: string }) {
  const waiting = data.status === 'SUBMITTED' || data.status === 'STARTED';
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className={cn('w-20 h-20 rounded-2xl flex flex-col items-center justify-center shrink-0', data.total == null ? 'bg-zinc-100 dark:bg-white/[0.05]' : 'bg-indigo-500/10')}>
          {data.total == null ? (waiting ? <Send className="w-6 h-6 text-indigo-500" aria-hidden /> : <span className="text-xs text-zinc-500 dark:text-zinc-400 text-center px-1">No score</span>)
            : <><span className="text-2xl font-black tabular-nums text-zinc-900 dark:text-white">{data.total}</span><span className="text-xs text-zinc-700 dark:text-zinc-300">of {data.max}</span></>}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">{data.title ?? `${label(data.kind)} practice`}</p>
          <p className="font-semibold text-zinc-900 dark:text-white">{data.topic || 'Open topic'}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden /> {mins(data.durationSec)} · {new Date(data.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
          {data.status === 'CONFIRMED' && <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Checked by your teacher</p>}
        </div>
      </div>
      {waiting && <p className="rounded-xl bg-indigo-500/10 px-3 py-2 text-sm text-indigo-900 dark:text-indigo-100">Sent to your teacher. You’ll see your score here once they’ve checked it.</p>}
      {data.note && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">{data.note}</p>}
      {data.teacherComment && <p className="rounded-xl border border-emerald-500/30 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200"><span className="font-semibold">Your teacher: </span>{data.teacherComment}</p>}
      {data.scores && <ul className="space-y-3" aria-label="Scores">{data.rubric.map((c) => <CriterionScore key={c.id} c={c} s={data.scores!.find((s) => s.id === c.id)} />)}</ul>}
      {data.summary && (
        <div className="space-y-3">
          {data.summary.summary && <p className="text-sm text-zinc-800 dark:text-zinc-200">{data.summary.summary}</p>}
          {data.summary.strengths.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">What went well</p><ul className="mt-1 list-disc ps-5 text-sm text-zinc-700 dark:text-zinc-300 space-y-0.5">{data.summary.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {data.summary.nextSteps.length > 0 && <div><p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Try next time</p><ul className="mt-1 list-disc ps-5 text-sm text-zinc-700 dark:text-zinc-300 space-y-0.5">{data.summary.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        </div>
      )}
      {data.scores && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{data.status === 'CONFIRMED' ? 'Scores suggested by AI and confirmed by your teacher.' : 'Scored by AI from what it heard: a guide for practice, not a grade.'}</p>}
      {data.transcript && (
        <details className="rounded-xl border border-zinc-200 dark:border-white/[0.08] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Transcript ({who === 'You' ? 'what you and the examiner said' : `${who} and the examiner`})</summary>
          <div className="mt-2"><Transcript lines={data.transcript} /></div>
        </details>
      )}
    </div>
  );
}
