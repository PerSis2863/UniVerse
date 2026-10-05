'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { SecurityEmailSchedule } from './email-schedule';
import { cn } from '@/lib/utils';
import { fetcher } from './shared';

// Health check: security and error checks across the app, ranked and explained by AI
// (src/server/owner-health.ts). Reads only; nothing here changes the site.

type Finding = { severity: 'high' | 'medium' | 'low'; area: string; title: string; detail: string; fix: string };
type Report = { checkedAt: string; score: number; summary: string; ai: boolean; findings: Finding[]; passed: string[] };

const TONE = {
  high: { pill: 'bg-rose-500/15 text-rose-600 dark:text-rose-300', dot: 'bg-rose-500', label: 'Fix now' },
  medium: { pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', label: 'Soon' },
  low: { pill: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', label: 'When you can' },
} as const;

export function HealthPanel() {
  const [fresh, setFresh] = useState(0);
  const { data, error, isValidating } = useSWR<Report>(`/owner/health${fresh ? `?fresh=1&n=${fresh}` : ''}`, fetcher, { revalidateOnFocus: false });
  const [open, setOpen] = useState<number | null>(0);
  const [showPassed, setShowPassed] = useState(false);

  if (error && !data) return <p className="text-sm text-rose-500">The health check couldn&apos;t run. Try again in a minute.</p>;
  if (!data) {
    return (
      <div className="tone-panel rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-8 flex flex-col items-center text-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
        <p className="font-semibold text-zinc-900 dark:text-white">Checking security and errors…</p>
        <p className="text-sm text-zinc-500">Looking at errors, sign-ins, accounts, settings and Cloudflare. AI then ranks what matters.</p>
      </div>
    );
  }

  const ring = data.score >= 85 ? 'from-emerald-400 to-teal-500' : data.score >= 60 ? 'from-amber-400 to-orange-500' : 'from-rose-500 to-fuchsia-500';
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of data.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 sm:p-7 text-white shadow-xl shadow-indigo-500/20">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className={cn('w-24 h-24 shrink-0 rounded-full p-1 bg-gradient-to-br', ring)}>
            <div className="w-full h-full rounded-full bg-indigo-950/80 flex flex-col items-center justify-center">
              <span className="text-3xl font-black leading-none">{data.score}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/70 mt-1">health</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] font-bold uppercase tracking-wider">
              {data.ai ? <><Sparkles className="w-3.5 h-3.5" /> AI review</> : <><ShieldCheck className="w-3.5 h-3.5" /> Automatic checks</>}
            </p>
            <p className="mt-2 text-sm sm:text-base leading-relaxed text-white/90">{data.summary}</p>
            <p className="mt-2 text-xs text-white/70">Checked {formatDistanceToNow(new Date(data.checkedAt), { addSuffix: true })} · {counts.high} to fix now · {counts.medium} soon · {counts.low} when you can</p>
          </div>
          <button onClick={() => setFresh((n) => n + 1)} disabled={isValidating}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-indigo-700 text-sm font-bold shadow-lg disabled:opacity-70">
            <RefreshCw className={cn('w-4 h-4', isValidating && 'animate-spin')} /> {isValidating ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>

      {data.findings.length === 0 ? (
        <div className="tone-panel rounded-3xl border border-zinc-200/80 dark:border-white/[0.06] p-6 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          <p className="font-semibold text-zinc-900 dark:text-white">Nothing needs you right now.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {data.findings.map((f, i) => {
            const t = TONE[f.severity] ?? TONE.low;
            const on = open === i;
            return (
              <li key={i} className="tone-panel rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] overflow-hidden">
                <button onClick={() => setOpen(on ? null : i)} className="w-full flex items-center gap-3 p-4 text-left">
                  <span className={cn('w-2.5 h-2.5 shrink-0 rounded-full', t.dot)} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-zinc-900 dark:text-white">{f.title}</span>
                    <span className="block text-xs text-zinc-500">{f.area}</span>
                  </span>
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold', t.pill)}>{t.label}</span>
                  <ChevronDown className={cn('w-4 h-4 shrink-0 text-zinc-400 transition-transform', on && 'rotate-180')} />
                </button>
                {on && (
                  <div className="px-4 pb-4 pl-[2.6rem] space-y-2 text-sm">
                    <p className="text-zinc-600 dark:text-zinc-300">{f.detail}</p>
                    <p className="flex gap-2 p-3 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 text-zinc-800 dark:text-zinc-100">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" /> <span><b>What to do:</b> {f.fix}</span>
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SecurityEmailSchedule />

      {data.passed.length > 0 && (
        <div className="tone-panel rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-4">
          <button onClick={() => setShowPassed((v) => !v)} className="w-full flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {data.passed.length} checks passed
            <ChevronDown className={cn('ml-auto w-4 h-4 text-zinc-400 transition-transform', showPassed && 'rotate-180')} />
          </button>
          {showPassed && (
            <ul className="mt-3 grid sm:grid-cols-2 gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              {data.passed.map((p) => <li key={p} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {p}</li>)}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-zinc-500">Only counts, error messages and page addresses are sent to AI, never people&apos;s personal details or secret values.</p>
    </div>
  );
}

