'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Activity, AlertTriangle, BarChart3, Bot, Bug, CheckCircle2, ChevronLeft, ChevronRight, Copy, ExternalLink, EyeOff, Lightbulb, Loader2, RotateCcw, Search, Server, Monitor, ShieldCheck, Sparkles, User, Users, Wrench } from 'lucide-react';
import { unsupportedBrowser } from '@/lib/browser-support';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SearchBox, card, fetcher, matches } from './shared';
import { useActivePoll } from '@/lib/realtime-client';
import { TabPill } from '@/components/ui/Glide';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

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
  lastUser: { id: string; name: string; email: string; role: string } | null;
  repairAgent: string | null;
  repairUrl: string | null;
  repairAt: string | null;
}

interface AiSetup {
  text: { id: string; label: string; note: string }[];
  models: { text: string[] };
  repair: { github: boolean; repo: string; agents: { id: string; label: string; maker: string; model: string; how: 'github' | 'copy'; note: string }[] };
}

interface Summary {
  seenToday: number; newToday: number; openServer: number; openBrowser: number; openHigh: number; peopleAffected: number; timesSeen: number;
  perDay: { day: string; new: number; seen: number }[];
}

// What each kind of problem means, in plain words.
const KIND: Record<string, string> = {
  chunk: 'An old copy of the app tried to load a file that an update replaced. The page reloads itself, so this usually needs no fix.',
  api: 'A request to the server failed, so something on the page could not load or save.',
  render: 'Part of a page crashed while it was being drawn. The person saw an error screen there.',
  promise: 'Something the page was waiting for (usually a server answer) failed and nothing handled it.',
  runtime: 'A script error in the browser while the page was running.',
};

/** "Chrome on Android" from a user agent. */
function device(ua: string | null) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} on ${os}` : browser;
}

const titleOf = (e: ErrorReport) => {
  const t = e.diagnosis?.match(/^\*\*(.+?)\*\*/)?.[1] ?? e.message;
  return !t || t === 'undefined' || t === 'null' ? `Unknown ${e.source === 'SERVER' ? 'server' : 'browser'} error (no message)` : t;
};

const SORTS = [
  { id: 'latest', label: 'Latest' },
  { id: 'often', label: 'Most often' },
  { id: 'people', label: 'Most people' },
] as const;

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

/** The AI diagnosis' parts ("**Likely cause:** …"), when it has the usual shape. */
function diagnosisParts(text: string | null) {
  if (!text) return null;
  const part = (label: string) => new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`).exec(text)?.[1]?.trim() ?? null;
  const cause = part('Likely cause'), where = part('Where to look'), fix = part('Suggested fix');
  return cause || where || fix ? { cause, where, fix } : null;
}

const STATUS: Record<ErrorReport['status'], { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' },
  DIAGNOSED: { label: 'Diagnosed', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  RESOLVED: { label: 'Resolved', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  IGNORED: { label: 'Ignored', cls: 'bg-zinc-500/10 text-zinc-500' },
};
const DOT: Record<string, string> = { high: 'bg-rose-500', medium: 'bg-amber-400', low: 'bg-zinc-400' };
const chip = 'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full';
const action = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold disabled:opacity-60';

export function ErrorsPanel({ onPerson, focus }: { onPerson?: (id: string) => void; focus?: { id: string; status: string } }) {
  // The console search opens one problem, in the list it belongs to.
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>(focus && (focus.status === 'RESOLVED' || focus.status === 'IGNORED') ? focus.status : 'OPEN');
  // The problem shown in detail (on a phone the details replace the list until "All problems").
  const [open, setOpen] = useState<string | null>(focus?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'ALL' | 'SERVER' | 'CLIENT'>('ALL');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('latest');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data, mutate, isLoading } = useSWR<{ items: ErrorReport[]; counts: Record<string, number>; summary?: Summary }>(`/owner/errors?status=${filter}`, fetcher, { refreshInterval: useActivePoll(60_000) });
  const openCount = (data?.counts.NEW ?? 0) + (data?.counts.DIAGNOSED ?? 0);
  const items = (data?.items ?? [])
    .filter((e) => (source === 'ALL' || e.source === source) && matches(q, e.message, e.path, e.kind, e.source, e.diagnosis, e.userAgent, e.severity, e.lastUser?.name, e.lastUser?.email))
    .sort((a, b) => (sort === 'often' ? b.count - a.count : sort === 'people' ? b.users - a.users : 0));
  const sum = data?.summary;
  const peak = Math.max(1, ...(sum?.perDay ?? []).map((d) => Math.max(d.new, d.seen)));
  // On a computer the first problem is shown when none is chosen.
  const current = items.find((e) => e.id === open) ?? items[0] ?? null;

  const bulk = async (status: 'RESOLVED' | 'IGNORED' | 'NEW') => {
    setBusy('bulk');
    try {
      const { data: r } = await api.post('/owner/errors/bulk', { ids: [...picked], status });
      toast.success(`${r.updated} updated`);
      setPicked(new Set());
      mutate();
    } catch {
      toast.error('Could not update');
    } finally {
      setBusy(null);
    }
  };
  const copy = async (e: ErrorReport) => {
    const text = [`${titleOf(e)}`, `Where: ${e.path ?? 'unknown'} (${e.source === 'SERVER' ? 'server' : 'browser'}, ${e.kind})`, `Seen ${e.count} times by ${e.users} people, first ${e.firstSeen}, last ${e.lastSeen}`, e.userAgent ? `Browser: ${e.userAgent}` : '', '', e.message, e.stack ?? '', e.diagnosis ? `\nDiagnosis:\n${e.diagnosis}` : ''].filter((x) => x !== null).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied. Paste it to Claude to get it fixed.');
    } catch {
      toast.error('Could not copy');
    }
  };

  const diagnose = async (ids?: string[], model?: string) => {
    setBusy(ids?.[0] ?? 'all');
    try {
      const { data: r } = await api.post('/owner/errors/diagnose', { ...(ids ? { ids } : {}), ...(model ? { model } : {}) });
      const filed = r.filed ? ` · ${r.filed} from outdated browsers or bots filed as ignored` : '';
      toast.success((r.diagnosed ? `Diagnosed ${r.diagnosed} problem${r.diagnosed === 1 ? '' : 's'}` : 'Nothing new to diagnose') + filed);
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
      if (open === id) setOpen(null);
      mutate();
    } catch {
      toast.error('Could not update');
    } finally {
      setBusy(null);
    }
  };

  const kpis = sum ? ([
    { label: 'Open problems', value: openCount, hint: `${sum.openServer} server · ${sum.openBrowser} browser`, icon: Bug, tone: 'ink' },
    { label: 'High severity', value: sum.openHigh, hint: 'open, from the AI diagnosis', icon: AlertTriangle, tone: sum.openHigh ? 'alert' : 'soft' },
    { label: 'People affected', value: sum.peopleAffected, hint: `${sum.timesSeen} times in total`, icon: Users, tone: 'plain' },
    { label: 'Seen today', value: sum.seenToday, hint: `${sum.newToday} new today`, icon: Activity, tone: 'plain' },
  ] as const) : [];

  return (
    <div className="space-y-4">
      {/* The headline: what this is, and the one action that matters most. */}
      <div className={cn(card, 'p-5 flex flex-col sm:flex-row sm:items-center gap-4')}>
        <div className="w-11 h-11 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shrink-0"><Bot className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Error monitoring</p>
          <p className="font-semibold text-zinc-900 dark:text-white">{openCount ? `${openCount} open problem${openCount === 1 ? '' : 's'} to look at` : 'Nothing open: everything people ran into has been dealt with'}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Crashes in browsers and on the server are collected and grouped. Each day AI diagnoses the new ones; outdated browsers and bots are filed as ignored by themselves.</p>
        </div>
        <button onClick={() => diagnose()} disabled={!!busy} className="btn-primary shrink-0">
          {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Diagnose new
        </button>
      </div>

      {sum && (
        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4">
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className={cn('rounded-2xl p-4 border', k.tone === 'ink' ? 'bg-zinc-900 dark:bg-white border-transparent text-white dark:text-zinc-900' : k.tone === 'alert' ? 'bg-rose-500/[0.08] border-rose-500/20' : k.tone === 'soft' ? 'bg-indigo-500/[0.07] border-indigo-500/15' : 'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-white/[0.06]')}>
                <p className={cn('flex items-center gap-1.5 text-xs font-medium', k.tone === 'ink' ? 'text-[#d1d1d6] dark:text-[#48484a]' : 'text-zinc-500')}>
                  <span className={cn('w-6 h-6 rounded-lg flex items-center justify-center', k.tone === 'ink' ? 'bg-white/10 dark:bg-zinc-900/10' : 'bg-zinc-900/[0.05] dark:bg-white/[0.06]')}><k.icon className="w-3.5 h-3.5" /></span>{k.label}
                </p>
                <p className={cn('mt-3 text-3xl font-bold tabular-nums tracking-tight', k.tone === 'alert' ? 'text-rose-600 dark:text-rose-400' : k.tone === 'ink' ? '' : 'text-zinc-900 dark:text-white')}>{k.value}</p>
                <p className={cn('mt-1 text-[11px]', k.tone === 'ink' ? 'text-[#aeaeb2] dark:text-[#5c5c61]' : 'text-zinc-500')}>{k.hint}</p>
              </div>
            ))}
          </div>
          <div className={cn(card, 'p-4 flex flex-col')}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-zinc-400" /> Problems per day</p>
              <span className="text-[11px] text-zinc-500">last 14 days</span>
            </div>
            <div className="mt-3 flex-1 min-h-28 flex items-end gap-1" role="img" aria-label={`Problems per day: ${sum.perDay.reduce((n, d) => n + d.new, 0)} new in 14 days`}>
              {sum.perDay.map((d) => (
                <div key={d.day} className="group relative flex-1 flex items-end gap-px h-full">
                  <div className="flex-1 rounded-t-md bg-rose-500/85" style={{ height: `${Math.max(d.new ? 6 : 2, (d.new / peak) * 100)}%`, opacity: d.new ? 1 : 0.2 }} />
                  <div className="flex-1 rounded-t-md bg-amber-400/85" style={{ height: `${Math.max(d.seen ? 6 : 2, (d.seen / peak) * 100)}%`, opacity: d.seen ? 1 : 0.2 }} />
                  <span className="pointer-events-none absolute bottom-full mb-1 start-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900 text-white text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">{format(new Date(d.day), 'd MMM')}: {d.new} new · {d.seen} seen</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-400 tabular-nums" aria-hidden>
              {sum.perDay.length > 0 && <><span>{format(new Date(sum.perDay[0].day), 'd MMM')}</span><span>{format(new Date(sum.perDay[sum.perDay.length - 1].day), 'd MMM')}</span></>}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 flex gap-3"><span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500 me-1" />new problems</span><span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400 me-1" />still happening that day</span></p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] gap-4 items-start">
        {/* The list */}
        <div className={cn('space-y-3 min-w-0', open && 'hidden lg:block')}>
          <div className="flex flex-wrap gap-1 items-center">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => { setFilter(f.id); setOpen(null); setPicked(new Set()); }} className={cn('relative isolate px-3.5 py-1.5 rounded-full text-sm font-semibold', filter === f.id ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{filter === f.id && <TabPill id="pill-7-0" />}
                {f.label}{f.id === 'OPEN' && openCount ? ` (${openCount})` : f.id !== 'OPEN' && data?.counts[f.id] ? ` (${data.counts[f.id]})` : ''}
              </button>
            ))}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Search message, page, browser, person" />
          <div className="flex gap-2">
            <select aria-label="Where" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={cn(select, 'flex-1')}>
              <option value="ALL">Server and browser</option><option value="SERVER">Server only</option><option value="CLIENT">Browser only</option>
            </select>
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={cn(select, 'flex-1')}>
              {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
          {picked.size > 0 && (
            <div className={cn(card, 'p-2.5 flex flex-wrap items-center gap-2 sticky top-2 z-10')}>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white me-auto ps-1">{picked.size} selected</span>
              {filter === 'OPEN' ? (
                <>
                  <button onClick={() => bulk('RESOLVED')} disabled={!!busy} className={cn(action, 'bg-emerald-600 text-white')}><CheckCircle2 className="w-4 h-4" /> Resolve</button>
                  <button onClick={() => bulk('IGNORED')} disabled={!!busy} className={cn(action, 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}><EyeOff className="w-4 h-4" /> Ignore</button>
                </>
              ) : (
                <button onClick={() => bulk('NEW')} disabled={!!busy} className={cn(action, 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}><RotateCcw className="w-4 h-4" /> Reopen</button>
              )}
              <button onClick={() => setPicked(new Set())} className="text-sm text-zinc-500 px-2">Clear</button>
            </div>
          )}

          {isLoading ? (
            <ContentSkeleton variant="list" />
          ) : data?.items.length && !items.length ? (
            <p className="text-sm text-zinc-500 px-1">No problems match.</p>
          ) : !data?.items.length ? (
            <div className={cn(card, 'p-10 text-center')}>
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="mt-3 font-semibold text-zinc-900 dark:text-white">{filter === 'OPEN' ? 'No open problems' : 'Nothing here'}</p>
              <p className="text-sm text-zinc-500">{filter === 'OPEN' ? 'Everything people ran into has been dealt with.' : ''}</p>
            </div>
          ) : (
            <ul className={cn(card, 'divide-y divide-zinc-100 dark:divide-white/[0.05] overflow-hidden')}>
              {items.map((e) => {
                const on = current?.id === e.id;
                const bot = e.source === 'CLIENT' && !!unsupportedBrowser(e.userAgent);
                return (
                  <li key={e.id} className={cn('relative flex items-start gap-2 ps-3 pe-2 transition-colors', on ? 'bg-indigo-500/[0.06] dark:bg-white/[0.04]' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]')}>
                    {on && <span aria-hidden className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-indigo-500" />}
                    <input type="checkbox" aria-label={`Select: ${titleOf(e)}`} checked={picked.has(e.id)} className="mt-4 shrink-0"
                      onChange={() => setPicked((cur) => { const next = new Set(cur); if (next.has(e.id)) next.delete(e.id); else next.add(e.id); return next; })} />
                    <button onClick={() => setOpen(e.id)} aria-current={on ? 'true' : undefined} className="min-w-0 flex-1 text-start py-3 flex items-start gap-2.5">
                      <span aria-hidden className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', DOT[e.severity ?? ''] ?? 'bg-zinc-300 dark:bg-zinc-600')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-white line-clamp-2 break-words">{titleOf(e)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                          {e.source === 'SERVER' ? <Server className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                          <span className="truncate max-w-[10rem]">{e.path ?? 'unknown page'}</span>
                          <span className="tabular-nums">{e.count}× · {e.users} {e.users === 1 ? 'person' : 'people'}</span>
                          <span>{formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}</span>
                          {e.status === 'NEW' && <span className={cn(chip, STATUS.NEW.cls)}>New</span>}
                          {bot && <span className={cn(chip, 'bg-zinc-500/10 text-zinc-500')}>Old browser or bot</span>}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 mt-1 text-zinc-300 dark:text-zinc-600 shrink-0 lg:hidden" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* The details of the chosen problem */}
        <div className={cn('min-w-0 lg:sticky lg:top-20', !open && 'hidden lg:block')}>
          {current ? (
            <ErrorDetail key={current.id} e={current} busy={busy} onBack={() => setOpen(null)} onPerson={onPerson}
              onStatus={(st) => void setStatus(current.id, st)} onCopy={() => void copy(current)} onDiagnose={(model) => diagnose([current.id], model)} onRepaired={() => mutate()} />
          ) : !isLoading && (
            <div className={cn(card, 'p-10 text-center text-sm text-zinc-500 hidden lg:block')}>Choose a problem to see its details.</div>
          )}
        </div>
      </div>
      <CspReports />
    </div>
  );
}

/** One problem in detail: what happened, the AI's reading of it, the technical record, and what to do. */
function ErrorDetail({ e, busy, onBack, onPerson, onStatus, onCopy, onDiagnose, onRepaired }: {
  e: ErrorReport; busy: string | null; onBack: () => void; onPerson?: (id: string) => void;
  onStatus: (status: 'RESOLVED' | 'IGNORED' | 'NEW') => void; onCopy: () => void; onDiagnose: (model?: string) => void; onRepaired: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'technical' | 'fix'>('overview');
  const parts = diagnosisParts(e.diagnosis);
  const bot = e.source === 'CLIENT' ? unsupportedBrowser(e.userAgent) : null;
  const closed = e.status === 'RESOLVED' || e.status === 'IGNORED';
  const facts: [string, React.ReactNode][] = [
    ['Times seen', <span key="c" className="tabular-nums">{e.count}</span>],
    ['People', <span key="u" className="tabular-nums">{e.users}</span>],
    ['First seen', format(new Date(e.firstSeen), 'd MMM yyyy, HH:mm')],
    ['Last seen', `${format(new Date(e.lastSeen), 'd MMM, HH:mm')} · ${formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}`],
    ['Where', `${e.source === 'SERVER' ? 'Server' : 'Browser'} · ${e.path ?? 'unknown page'}`],
    ['Device', device(e.userAgent) ?? (e.source === 'SERVER' ? 'Server' : 'Unknown')],
  ];
  return (
    <article className={cn(card, 'overflow-hidden')} aria-label={titleOf(e)}>
      <header className="p-5 border-b border-zinc-100 dark:border-white/[0.06] space-y-3">
        <button type="button" onClick={onBack} className="lg:hidden -ms-1 inline-flex items-center gap-1 text-sm font-semibold text-tint-text"><ChevronLeft className="w-4 h-4" /> All problems</button>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(chip, STATUS[e.status].cls)}>{STATUS[e.status].label}</span>
          {e.severity && <span className={cn(chip, 'uppercase', SEVERITY[e.severity])}>{e.severity}</span>}
          <span className={cn(chip, 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>{e.source === 'SERVER' ? <Server className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}{e.source === 'SERVER' ? 'Server' : 'Browser'} · {e.kind}</span>
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white break-words leading-snug">{titleOf(e)}</h3>
        <div className="flex flex-wrap gap-2">
          {!closed ? (
            <>
              <button onClick={() => onStatus('RESOLVED')} disabled={!!busy} className={cn(action, 'bg-emerald-600 hover:bg-emerald-500 text-white')}><CheckCircle2 className="w-4 h-4" /> Mark resolved</button>
              <button onClick={() => onStatus('IGNORED')} disabled={!!busy} className={cn(action, 'bg-[var(--fill)] text-zinc-700 dark:text-zinc-200')}><EyeOff className="w-4 h-4" /> Ignore</button>
            </>
          ) : (
            <button onClick={() => onStatus('NEW')} disabled={!!busy} className={cn(action, 'bg-[var(--fill)] text-zinc-700 dark:text-zinc-200')}><RotateCcw className="w-4 h-4" /> Reopen</button>
          )}
          <button onClick={onCopy} className={cn(action, 'bg-[var(--fill)] text-zinc-700 dark:text-zinc-200')}><Copy className="w-4 h-4" /> Copy details</button>
          {e.source !== 'SERVER' && e.path && e.path.startsWith('/') && (
            <a href={e.path} target="_blank" rel="noopener noreferrer" className={cn(action, 'bg-[var(--fill)] text-zinc-700 dark:text-zinc-200')}><ExternalLink className="w-4 h-4" /> Open page</a>
          )}
        </div>
      </header>

      {bot && (
        <p className="mx-5 mt-4 rounded-xl bg-zinc-500/[0.07] p-3 text-sm text-zinc-700 dark:text-zinc-300 flex gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
          <span>This came from {bot}, not from a fault in UniVerse. {closed ? '' : 'It can be ignored safely.'}</span>
        </p>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-zinc-100 dark:bg-white/[0.05] mt-4 border-y border-zinc-100 dark:border-white/[0.05]">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-white dark:bg-zinc-900 px-4 py-3 min-w-0">
            <dt className="text-[11px] font-medium text-zinc-500">{k}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-white break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="px-5 pt-4" role="tablist" aria-label="Problem details">
        <div className="inline-flex rounded-full bg-[var(--fill)] p-1 gap-1">
          {([['overview', 'Overview'], ['technical', 'Technical'], ['fix', 'Fix with AI']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={cn('px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors', tab === id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-600 dark:text-zinc-300')}>{label}</button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4" role="tabpanel">
        {tab === 'overview' && (
          <>
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">What it means</h4>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{KIND[e.kind] ?? 'An error the app caught and recorded.'}</p>
            </section>
            {e.diagnosis ? (
              <section className="rounded-2xl bg-indigo-500/[0.05] border border-indigo-500/15 p-4">
                <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI diagnosis</h4>
                {parts ? (
                  <div className="grid gap-3">
                    {([['Likely cause', parts.cause, Lightbulb], ['Where to look', parts.where, Search], ['Suggested fix', parts.fix, Wrench]] as const).filter(([, v]) => v).map(([label, text, Icon]) => (
                      <div key={label} className="flex gap-3">
                        <span className="w-7 h-7 rounded-lg bg-white dark:bg-white/[0.06] text-indigo-500 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" /></span>
                        <div className="min-w-0"><p className="text-xs font-semibold text-zinc-500">{label}</p><p className="text-sm text-zinc-800 dark:text-zinc-200 break-words">{text}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <Diagnosis text={e.diagnosis} />}
              </section>
            ) : (
              <p className="text-sm text-zinc-500">Not diagnosed yet. Open “Fix with AI” to diagnose it now.</p>
            )}
            {e.lastUser && (
              <section>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Last person who ran into it</h4>
                <button onClick={() => onPerson?.(e.lastUser!.id)} disabled={!onPerson} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"><User className="w-4 h-4" />{e.lastUser.name}</button>
                <span className="text-xs text-zinc-500"> · {e.lastUser.role.toLowerCase()} · {e.lastUser.email}</span>
              </section>
            )}
          </>
        )}
        {tab === 'technical' && (
          <>
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Error and stack</h4>
              <pre className="text-xs whitespace-pre-wrap break-words rounded-xl bg-zinc-950 text-zinc-100 p-3 max-h-80 overflow-auto font-mono">{e.message}{e.stack ? `\n\n${e.stack}` : '\n\n(no stack trace)'}</pre>
            </section>
            <dl className="grid gap-2 text-sm">
              <div><dt className="text-[11px] font-medium text-zinc-500">Kind</dt><dd className="text-zinc-800 dark:text-zinc-200">{e.source === 'SERVER' ? 'Server' : 'Browser'} · {e.kind}</dd></div>
              <div><dt className="text-[11px] font-medium text-zinc-500">Page</dt><dd className="text-zinc-800 dark:text-zinc-200 break-all font-mono text-xs">{e.path ?? 'unknown'}</dd></div>
              {e.userAgent && <div><dt className="text-[11px] font-medium text-zinc-500">Browser signature</dt><dd className="text-zinc-800 dark:text-zinc-200 break-all font-mono text-xs">{e.userAgent}</dd></div>}
            </dl>
          </>
        )}
        {tab === 'fix' && <AiAgents e={e} busy={busy === e.id} onDiagnose={onDiagnose} onRepaired={onRepaired} />}
      </div>
    </article>
  );
}

interface CspReport { id: string; directive: string; blocked: string; page: string; sample: string | null; count: number; firstAt: string; lastAt: string }

/**
 * What browsers refused to load or run under the site's Content-Security-Policy (security-headers.ts),
 * one line per kind. Usually an extension or a third-party script; a sudden new one on a UniVerse
 * page can mean injected code, or a feature that needs its address added to the policy.
 */
function CspReports() {
  const { data } = useSWR<CspReport[]>('/owner/csp-reports', fetcher);
  if (!data?.length) return null;
  return (
    <details className={cn(card, 'p-4')}>
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white">Blocked by the browser’s safety rules ({data.length})</summary>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">What the site’s Content-Security-Policy stopped. Browser extensions cause most of these; a new one on a UniVerse page can mean injected code, or a feature whose address needs adding to the policy.</p>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.05]">
        {data.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p className="text-zinc-900 dark:text-white break-all"><b>{r.directive}</b> blocked {r.blocked}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">on {r.page} · {r.count}× · last {formatDistanceToNow(new Date(r.lastAt), { addSuffix: true })}{r.sample ? ` · “${r.sample}”` : ''}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

const select = 'h-9 rounded-full bg-[var(--fill)] px-3 text-sm font-medium text-zinc-800 dark:text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 max-w-full';

/**
 * Diagnose with a chosen Gemini model, or hand the problem to an AI agent that opens a pull request
 * (Claude Code with a chosen model, Jules) or gives a brief to paste (Antigravity).
 */
function AiAgents({ e, busy, onDiagnose, onRepaired }: { e: ErrorReport; busy: boolean; onDiagnose: (model?: string) => void; onRepaired: () => void }) {
  const { data } = useSWR<AiSetup>('/owner/ai', fetcher, { revalidateOnFocus: false });
  const [model, setModel] = useState('');
  const [agent, setAgent] = useState('claude-sonnet');
  const [starting, setStarting] = useState(false);
  const chosen = data?.repair.agents.find((a) => a.id === agent);

  const repair = async () => {
    if (!chosen) return;
    setStarting(true);
    try {
      const { data: r } = await api.post(`/owner/errors/${e.id}/repair`, { agent });
      if (r.brief) {
        await navigator.clipboard.writeText(r.brief).catch(() => {});
        toast.success('Repair brief copied', { description: 'Open the project in Antigravity, paste it into the agent and pick the model there.' });
      } else {
        toast.success(`${r.agent} is on it`, { description: 'It opens a pull request on GitHub when it has a fix. Nothing changes until you merge it.' });
      }
      onRepaired();
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not start the repair');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[var(--surface-2)] dark:bg-white/[0.04] p-3.5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500 w-24 shrink-0 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Diagnose</span>
        <select aria-label="Gemini model for the diagnosis" value={model} onChange={(ev) => setModel(ev.target.value)} className={select}>
          <option value="">Usual models{data ? ` (${data.text.find((m) => m.id === data.models.text[0])?.label ?? data.models.text[0]} first)` : ''}</option>
          {data?.text.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button type="button" onClick={() => onDiagnose(model || undefined)} disabled={busy} className="btn-secondary btn-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {e.diagnosis ? 'Diagnose again' : 'Diagnose'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500 w-24 shrink-0 flex items-center gap-1"><Bot className="w-3.5 h-3.5" /> Repair with</span>
        <select aria-label="AI agent for the repair" value={agent} onChange={(ev) => setAgent(ev.target.value)} className={select}>
          {(data?.repair.agents ?? []).map((a) => <option key={a.id} value={a.id}>{a.label} · {a.model}</option>)}
        </select>
        <button type="button" onClick={() => void repair()} disabled={starting || !chosen || (chosen.how === 'github' && !data?.repair.github)} className="btn-primary btn-sm">
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : chosen?.how === 'copy' ? <Copy className="w-4 h-4" /> : <Bot className="w-4 h-4" />} {chosen?.how === 'copy' ? 'Copy brief' : 'Start repair'}
        </button>
      </div>
      {chosen && <p className="text-xs text-zinc-500 ps-0 sm:ps-[6.5rem]">{chosen.maker} · {chosen.note}{chosen.how === 'github' && data && !data.repair.github ? ' · Needs the GITHUB_REPAIR_TOKEN secret first (Server → AI models).' : ''}</p>}
      {e.repairAgent && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300 ps-0 sm:ps-[6.5rem]">
          Asked {e.repairAgent}{e.repairAt ? ` ${formatDistanceToNow(new Date(e.repairAt), { addSuffix: true })}` : ''}.
          {e.repairUrl && <> <a href={e.repairUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-tint-text inline-flex items-center gap-0.5">Follow it on GitHub <ExternalLink className="w-3 h-3" /></a></>}
        </p>
      )}
    </div>
  );
}
