'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Bot, CheckCircle2, ChevronDown, EyeOff, Loader2, RotateCcw, Server, Monitor, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SearchBox, card, fetcher, matches } from './shared';

// Errors tab: problems collected automatically from browsers and the server (src/server/errors.ts),
// grouped, with an AI diagnosis. Mark them resolved once fixed; if one happens again it comes back.

interface ErrorReport {
  id: string;
  source: 'CLIENT' | 'SERVER';
  kind: string;
  message: string;
  stack: string | null;
  path: string | null;
  userAgent: string | null;
  count: number;
  users: number;
  status: 'NEW' | 'DIAGNOSED' | 'RESOLVED' | 'IGNORED';
  diagnosis: string | null;
  severity: 'low' | 'medium' | 'high' | null;
  firstSeen: string;
  lastSeen: string;
}

const FILTERS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'IGNORED', label: 'Ignored' },
] as const;

const SEVERITY: Record<string, string> = {
  high: 'bg-rose-500/10 text-rose-500',
  medium: 'bg-amber-500/10 text-amber-500',
  low: 'bg-zinc-500/10 text-zinc-500',
};

/** Renders the diagnosis' **bold** markers and paragraphs without an HTML parser. */
function Diagnosis({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') ? <strong key={j} className="text-zinc-900 dark:text-white">{part.slice(2, -2)}</strong> : part))}
        </p>
      ))}
    </div>
  );
}

export function ErrorsPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('OPEN');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const { data, mutate, isLoading } = useSWR<{ items: ErrorReport[]; counts: Record<string, number> }>(`/owner/errors?status=${filter}`, fetcher, { refreshInterval: 60_000 });
  const openCount = (data?.counts.NEW ?? 0) + (data?.counts.DIAGNOSED ?? 0);
  const items = (data?.items ?? []).filter((e) => matches(q, e.message, e.path, e.kind, e.source, e.diagnosis, e.userAgent, e.severity));

  const diagnose = async (ids?: string[]) => {
    setBusy(ids?.[0] ?? 'all');
    try {
      const { data: r } = await api.post('/owner/errors/diagnose', ids ? { ids } : {});
      toast.success(r.diagnosed ? `Diagnosed ${r.diagnosed} problem${r.diagnosed === 1 ? '' : 's'}` : 'Nothing new to diagnose');
      mutate();
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Diagnosis failed');
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (id: string, status: 'RESOLVED' | 'IGNORED' | 'NEW') => {
    setBusy(id);
    try {
      await api.patch(`/owner/errors/${id}`, { status });
      toast.success(status === 'RESOLVED' ? 'Marked resolved. It will reopen if it happens again.' : status === 'IGNORED' ? 'Ignored' : 'Reopened');
      mutate();
    } catch {
      toast.error('Could not update');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={cn(card, 'p-5 flex flex-col sm:flex-row sm:items-center gap-4')}>
        <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><Bot className="w-5 h-5" /></div>
        <div className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-semibold text-zinc-900 dark:text-white">Automatic error monitoring</p>
          Crashes in browsers, the app and on the server are collected and grouped. Each day, AI diagnoses new problems and you get an email digest.
          Pages that break after an update reload themselves.
        </div>
        <button onClick={() => diagnose()} disabled={!!busy} className="btn-primary shrink-0">
          {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Diagnose new
        </button>
      </div>

      <SearchBox value={q} onChange={setQ} placeholder="Search errors (message, page, browser, diagnosis)" />
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn('px-3.5 py-1.5 rounded-full text-sm font-semibold', filter === f.id ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>
            {f.label}{f.id === 'OPEN' && openCount ? ` (${openCount})` : f.id !== 'OPEN' && data?.counts[f.id] ? ` (${data.counts[f.id]})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      ) : data?.items.length && !items.length ? (
        <p className="text-sm text-zinc-500">No errors match.</p>
      ) : !data?.items.length ? (
        <div className={cn(card, 'p-10 text-center')}>
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
          <p className="mt-3 font-semibold text-zinc-900 dark:text-white">{filter === 'OPEN' ? 'No open problems' : 'Nothing here'}</p>
          <p className="text-sm text-zinc-500">{filter === 'OPEN' ? 'Everything people ran into has been dealt with.' : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => {
            const expanded = open === e.id;
            const title = e.diagnosis?.match(/^\*\*(.+?)\*\*/)?.[1] ?? e.message;
            return (
              <div key={e.id} className={card}>
                <button onClick={() => setOpen(expanded ? null : e.id)} className="w-full text-left p-4 flex items-start gap-3">
                  {e.source === 'SERVER' ? <Server className="w-4 h-4 mt-1 text-zinc-400 shrink-0" /> : <Monitor className="w-4 h-4 mt-1 text-zinc-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white break-words">{title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{e.path ?? 'unknown page'}</span>
                      <span>{e.count}× · {e.users} {e.users === 1 ? 'person' : 'people'}</span>
                      <span>last {formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}</span>
                      {e.status === 'NEW' && <span className="font-semibold text-indigo-500">New</span>}
                    </p>
                  </div>
                  {e.severity && <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0', SEVERITY[e.severity])}>{e.severity}</span>}
                  <ChevronDown className={cn('w-4 h-4 text-zinc-400 shrink-0 transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 dark:border-white/[0.06] pt-4">
                    {e.diagnosis ? (
                      <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-500 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI diagnosis</p>
                        <Diagnosis text={e.diagnosis} />
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500">Not diagnosed yet.</p>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Error</p>
                      <pre className="text-xs whitespace-pre-wrap break-words rounded-xl bg-zinc-50 dark:bg-black/30 p-3 text-zinc-700 dark:text-zinc-300 max-h-64 overflow-auto">{e.message}{e.stack ? `\n\n${e.stack}` : ''}</pre>
                      <p className="mt-2 text-xs text-zinc-500">
                        {e.source === 'SERVER' ? 'Server' : 'Browser'} · {e.kind} · first seen {formatDistanceToNow(new Date(e.firstSeen), { addSuffix: true })}
                        {e.userAgent ? ` · ${e.userAgent.slice(0, 90)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => diagnose([e.id])} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-60">
                        {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {e.diagnosis ? 'Diagnose again' : 'Diagnose'}
                      </button>
                      {e.status !== 'RESOLVED' && e.status !== 'IGNORED' ? (
                        <>
                          <button onClick={() => setStatus(e.id, 'RESOLVED')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"><CheckCircle2 className="w-4 h-4" /> Resolved</button>
                          <button onClick={() => setStatus(e.id, 'IGNORED')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60"><EyeOff className="w-4 h-4" /> Ignore</button>
                        </>
                      ) : (
                        <button onClick={() => setStatus(e.id, 'NEW')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60"><RotateCcw className="w-4 h-4" /> Reopen</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
