'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Bot, CheckCircle2, ChevronDown, Copy, ExternalLink, EyeOff, Loader2, RotateCcw, Server, Monitor, Sparkles, User } from 'lucide-react';
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

export function ErrorsPanel({ onPerson, focus }: { onPerson?: (id: string) => void; focus?: { id: string; status: string } }) {
  // The console search opens one problem, in the list it belongs to.
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>(focus && (focus.status === 'RESOLVED' || focus.status === 'IGNORED') ? focus.status : 'OPEN');
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

      {sum && (
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4">
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Open problems', openCount, `${sum.openServer} server · ${sum.openBrowser} browser`],
              ['High severity', sum.openHigh, 'open, from AI diagnosis'],
              ['People affected', sum.peopleAffected, `${sum.timesSeen} times in total`],
              ['Seen today', sum.seenToday, `${sum.newToday} new today`],
            ] as const).map(([label, value, hint]) => (
              <div key={label} className={cn(card, 'p-4')}>
                <p className={cn('text-2xl font-bold', label === 'High severity' && value ? 'text-rose-500' : 'text-zinc-900 dark:text-white')}>{value}</p>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{label}</p>
                <p className="text-[11px] text-zinc-400">{hint}</p>
              </div>
            ))}
          </div>
          <div className={cn(card, 'p-4')}>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Problems per day · 14 days</p>
            <div className="mt-3 flex items-end gap-1 h-28" role="img" aria-label="Problems per day">
              {sum.perDay.map((d) => (
                <div key={d.day} className="flex-1 flex items-end gap-px h-full" title={`${format(new Date(d.day), 'd MMM')}: ${d.new} new, ${d.seen} still happening`}>
                  <div className="flex-1 rounded-t bg-rose-500/80" style={{ height: `${Math.max(d.new ? 6 : 2, (d.new / peak) * 100)}%`, opacity: d.new ? 1 : 0.25 }} />
                  <div className="flex-1 rounded-t bg-amber-400/80" style={{ height: `${Math.max(d.seen ? 6 : 2, (d.seen / peak) * 100)}%`, opacity: d.seen ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 flex gap-3"><span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500 mr-1" />new problems</span><span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />last seen that day</span></p>
          </div>
        </div>
      )}

      <SearchBox value={q} onChange={setQ} placeholder="Search errors (message, page, browser, person, diagnosis)" />
      <div className="flex flex-wrap gap-1 items-center">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn('relative isolate px-3.5 py-1.5 rounded-full text-sm font-semibold', filter === f.id ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{filter === f.id && <TabPill id="pill-7-0" />}
            {f.label}{f.id === 'OPEN' && openCount ? ` (${openCount})` : f.id !== 'OPEN' && data?.counts[f.id] ? ` (${data.counts[f.id]})` : ''}
          </button>
        ))}
        <span className="flex-1" />
        <select aria-label="Where" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm">
          <option value="ALL">Server and browser</option><option value="SERVER">Server only</option><option value="CLIENT">Browser only</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm">
          {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      {picked.size > 0 && (
        <div className={cn(card, 'p-3 flex flex-wrap items-center gap-2 sticky top-2 z-10')}>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white mr-auto">{picked.size} selected</span>
          {filter === 'OPEN' ? (
            <>
              <button onClick={() => bulk('RESOLVED')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold"><CheckCircle2 className="w-4 h-4" /> Resolve</button>
              <button onClick={() => bulk('IGNORED')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><EyeOff className="w-4 h-4" /> Ignore</button>
            </>
          ) : (
            <button onClick={() => bulk('NEW')} disabled={!!busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><RotateCcw className="w-4 h-4" /> Reopen</button>
          )}
          <button onClick={() => setPicked(new Set())} className="text-sm text-zinc-500 px-2">Clear</button>
        </div>
      )}

      {isLoading ? (
        <ContentSkeleton variant="list" />
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
            const title = titleOf(e);
            return (
              <div key={e.id} className={cn(card, 'flex items-start')}>
                <input type="checkbox" aria-label="Select" checked={picked.has(e.id)} className="mt-5 ml-4 shrink-0"
                  onChange={() => setPicked((cur) => { const next = new Set(cur); if (next.has(e.id)) next.delete(e.id); else next.add(e.id); return next; })} />
                <div className="min-w-0 flex-1">
                <button onClick={() => setOpen(expanded ? null : e.id)} className="w-full text-left p-4 flex items-start gap-3">
                  {e.source === 'SERVER' ? <Server className="w-4 h-4 mt-1 text-zinc-400 shrink-0" /> : <Monitor className="w-4 h-4 mt-1 text-zinc-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 dark:text-white break-words">{title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>{e.path ?? 'unknown page'}</span>
                      <span>{e.count}× · {e.users} {e.users === 1 ? 'person' : 'people'}</span>
                      <span>last {formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}</span>
                      {e.lastUser && <span>{e.lastUser.name}</span>}
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
                    <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      <div><dt className="text-xs text-zinc-500">What it means</dt><dd className="text-zinc-800 dark:text-zinc-200">{KIND[e.kind] ?? 'An error the app caught and recorded.'}</dd></div>
                      <div><dt className="text-xs text-zinc-500">Where</dt><dd className="text-zinc-800 dark:text-zinc-200 break-all">{e.source === 'SERVER' ? 'On the server' : 'In the browser'} · {e.path ?? 'unknown page'}</dd></div>
                      <div><dt className="text-xs text-zinc-500">How often</dt><dd className="text-zinc-800 dark:text-zinc-200">{e.count} {e.count === 1 ? 'time' : 'times'}, {e.users} {e.users === 1 ? 'person' : 'people'}</dd></div>
                      <div><dt className="text-xs text-zinc-500">First seen</dt><dd className="text-zinc-800 dark:text-zinc-200">{format(new Date(e.firstSeen), 'd MMM yyyy, HH:mm')}</dd></div>
                      <div><dt className="text-xs text-zinc-500">Last seen</dt><dd className="text-zinc-800 dark:text-zinc-200">{format(new Date(e.lastSeen), 'd MMM yyyy, HH:mm')}</dd></div>
                      <div><dt className="text-xs text-zinc-500">Device</dt><dd className="text-zinc-800 dark:text-zinc-200">{device(e.userAgent) ?? (e.source === 'SERVER' ? 'Server' : 'Unknown')}</dd></div>
                      {e.lastUser && (
                        <div><dt className="text-xs text-zinc-500">Last person</dt><dd>
                          <button onClick={() => onPerson?.(e.lastUser!.id)} disabled={!onPerson} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300 hover:underline"><User className="w-3.5 h-3.5" />{e.lastUser.name}</button>
                          <span className="text-xs text-zinc-500"> · {e.lastUser.role.toLowerCase()}</span>
                        </dd></div>
                      )}
                    </dl>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Error</p>
                      <pre className="text-xs whitespace-pre-wrap break-words rounded-xl bg-zinc-50 dark:bg-black/30 p-3 text-zinc-700 dark:text-zinc-300 max-h-64 overflow-auto">{e.message}{e.stack ? `\n\n${e.stack}` : ''}</pre>
                      <p className="mt-2 text-xs text-zinc-500">
                        {e.source === 'SERVER' ? 'Server' : 'Browser'} · {e.kind} · first seen {formatDistanceToNow(new Date(e.firstSeen), { addSuffix: true })}
                        {e.userAgent ? ` · ${e.userAgent.slice(0, 90)}` : ''}
                      </p>
                    </div>
                    <AiAgents e={e} busy={busy === e.id} onDiagnose={(model) => diagnose([e.id], model)} onRepaired={() => mutate()} />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void copy(e)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200"><Copy className="w-4 h-4" /> Copy details</button>
                      {e.source !== 'SERVER' && e.path && e.path.startsWith('/') && (
                        <a href={e.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200"><ExternalLink className="w-4 h-4" /> Open page</a>
                      )}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
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
      {chosen && <p className="text-xs text-zinc-500 pl-0 sm:pl-[6.5rem]">{chosen.maker} · {chosen.note}{chosen.how === 'github' && data && !data.repair.github ? ' · Needs the GITHUB_REPAIR_TOKEN secret first (Server → AI models).' : ''}</p>}
      {e.repairAgent && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300 pl-0 sm:pl-[6.5rem]">
          Asked {e.repairAgent}{e.repairAt ? ` ${formatDistanceToNow(new Date(e.repairAt), { addSuffix: true })}` : ''}.
          {e.repairUrl && <> <a href={e.repairUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-tint-text inline-flex items-center gap-0.5">Follow it on GitHub <ExternalLink className="w-3 h-3" /></a></>}
        </p>
      )}
    </div>
  );
}
