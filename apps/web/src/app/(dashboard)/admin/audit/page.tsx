'use client';

import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow as fromNow } from 'date-fns';
import { Activity, ChevronDown, Download, Loader2, Mail, Search, UserRound, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api, API_URL } from '@/lib/api';
import { authFetch } from '@/lib/auth-token';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { CardHead } from '@/components/ui/CardMenu';
import { Segmented, type Segment } from '@/components/ui/Segmented';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DayHourHeat } from '@/components/instruments/DayHourHeat';
import type { ActivityHeat } from '@/lib/activity-heat';
import { outcomeOf } from '@/lib/audit-outcome';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  summary: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata?: unknown;
  createdAt: string;
}
/** The person behind an entry as they are today (absent once their account is deleted). */
interface Actor { id: string; name: string; email: string; role: string; status: string; lastSeenAt: string | null }
interface Page {
  entries: AuditEntry[];
  nextCursor: string | null;
  actors?: Record<string, Actor>;
}

const AREA_LABELS: Record<string, string> = {
  user: 'Users',
  course: 'Courses',
  grade: 'Grades',
  credential: 'Credentials',
  certificate: 'Certificates',
  impact: 'Impact points',
  scholarship: 'Scholarships',
  project: 'Projects',
  safety: 'Safety',
};
/** Each area's dot (the log's first column, the totals' bar). */
const AREA_DOT: Record<string, string> = {
  user: 'bg-indigo-500',
  course: 'bg-cyan-500',
  grade: 'bg-emerald-500',
  credential: 'bg-amber-500',
  certificate: 'bg-orange-500',
  impact: 'bg-fuchsia-500',
  scholarship: 'bg-sky-500',
  project: 'bg-teal-500',
  safety: 'bg-rose-500',
};

const area = (action: string) => action.split('.')[0];
const LOG_COLS = 'lg:grid-cols-[8.5rem_minmax(0,1fr)_9rem_13rem_8rem]';
const input =
  'rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

export default function AdminAuditLog() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [more, setMore] = useState<AuditEntry[]>([]);
  const [moreActors, setMoreActors] = useState<Record<string, Actor>>({});
  const [actorFilter, setActorFilter] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set('q', debouncedQ);
    if (areaFilter) p.set('action', areaFilter);
    if (actorFilter) p.set('actorId', actorFilter.id);
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    return p.toString();
  }, [debouncedQ, areaFilter, actorFilter, from, to]);

  const { data, isLoading, error } = useSWR<Page>(`/audit?${params}`, (url: string) => api.get(url).then((r) => r.data), {
    revalidateOnFocus: true,
    onSuccess: (page) => {
      setMore([]);
      setMoreActors({});
      setCursor(page.nextCursor);
    },
  });
  // M141: the heatmap, the totals and the tabs' counts: these dates and this search, every area.
  const heatKey = useMemo(() => { const p = new URLSearchParams(params); p.delete('action'); return `/audit/heat?${p}`; }, [params]);
  const { data: heat } = useSWR<ActivityHeat>(heatKey, (url: string) => api.get(`${url}${url.endsWith('?') ? '' : '&'}tz=${-new Date().getTimezoneOffset()}`).then((r) => r.data));
  const areas = useMemo(() => Object.entries(heat?.areas ?? {}).sort((a, b) => b[1] - a[1]), [heat]);

  const entries = [...(data?.entries ?? []), ...more];
  const actors: Record<string, Actor> = { ...(data?.actors ?? {}), ...moreActors };
  const filtered = !!(debouncedQ || areaFilter || actorFilter || from || to);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data: page } = await api.get<Page>(`/audit?${params}${params ? '&' : ''}cursor=${encodeURIComponent(cursor)}`);
      setMore((m) => [...m, ...page.entries]);
      setMoreActors((a) => ({ ...a, ...(page.actors ?? {}) }));
      setCursor(page.nextCursor);
    } catch {
      toast.error('Could not load more activity');
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await authFetch(`${API_URL}/audit/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'universe-activity.csv';
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
      toast.success(`${name} downloaded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const clear = () => {
    setQ('');
    setAreaFilter('');
    setActorFilter(null);
    setFrom('');
    setTo('');
  };

  const total = heat?.total ?? 0;
  const tabs: Segment<string>[] = [
    { value: 'all', label: <span className="inline-flex items-center gap-1.5">All<span className="tab-count">{total}</span></span> },
    ...areas.map(([a, n]) => ({ value: a, label: <span className="inline-flex items-center gap-1.5">{AREA_LABELS[a] ?? a}<span className="tab-count">{n}</span></span> })),
  ];

  return (
    <>
      <Topbar title="Activity Log" subtitle="Who changed what: roles, accounts, grades, credentials and approvals" />

      <div className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input className={`${input} w-full ps-9`} placeholder="Search people, emails or descriptions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the activity" />
          </div>
          <DateRangePicker value={{ from, to }} onChange={(v) => { setFrom(v.from); setTo(v.to); }} clearable />
          {filtered && (
            <button onClick={clear} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
          <button onClick={exportCsv} aria-busy={exporting || undefined} disabled={exporting} className="btn-primary">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export CSV
          </button>
        </div>

        {actorFilter && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300 flex flex-wrap items-center gap-2">
            Showing only what <b className="text-zinc-900 dark:text-white">{actorFilter.name}</b> did
            <button onClick={() => setActorFilter(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300"><X className="w-3.5 h-3.5" /> Everyone</button>
          </p>
        )}

        {/* M141: the reels' Agent Activity: when things happen, and how many of each */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="card">
            <CardHead title="When things happen" sub={`By day and hour in your time zone${from || to ? ', in these dates' : ''}`} />
            {heat ? <DayHourHeat cells={heat.cells} /> : <div className="h-40 rounded-xl skeleton" />}
          </section>
          <section className="card">
            <CardHead title="Totals" sub={from || to ? 'In these dates' : 'Everything recorded'} />
            <p className="text-[28px] font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white leading-none">{total.toLocaleString()} <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">action{total === 1 ? '' : 's'}</span></p>
            {total > 0 && (
              <>
                <div className="flex h-2 mt-4 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.07]">
                  {areas.map(([a, n]) => <span key={a} className={cn('h-full', AREA_DOT[a] ?? 'bg-zinc-400')} style={{ width: `${(n / total) * 100}%` }} />)}
                </div>
                <ul className="mt-4 space-y-2">
                  {areas.slice(0, 5).map(([a, n]) => (
                    <li key={a} className="flex items-center gap-2 text-[13px]">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', AREA_DOT[a] ?? 'bg-zinc-400')} />
                      <span className="flex-1 text-zinc-700 dark:text-zinc-300">{AREA_LABELS[a] ?? a}</span>
                      <span className="tabular-nums text-zinc-900 dark:text-white font-medium">{n}</span>
                      <span className="w-10 text-end tabular-nums text-xs text-zinc-500 dark:text-zinc-400">{Math.round((n / total) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <section className="card overflow-hidden" style={{ padding: 0 }}>
          <div className="px-4 sm:px-6 pt-5">
            <CardHead title="Log" sub="Every change, newest first" />
            {tabs.length > 1 && (
              <div className="-mx-1 px-1 pb-1 overflow-x-auto">
                <Segmented segments={tabs} value={areaFilter || 'all'} onChange={(v) => setAreaFilter(v === 'all' ? '' : v)} label="Type of activity" className="w-max" />
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="p-12"><ContentSkeleton variant="table" /></div>
          ) : error ? (
            <p className="p-12 text-center text-sm text-rose-600 dark:text-rose-400">Could not load the activity log.</p>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center mb-3">
                <Activity className="w-6 h-6 text-zinc-500 dark:text-zinc-400" />
              </div>
              <p className="font-semibold text-zinc-900 dark:text-white">{filtered ? 'No activity matches these filters' : 'No activity recorded yet'}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Role and account changes, grades, credential decisions and deletions appear here.</p>
            </div>
          ) : (
            <>
              <div className={cn('hidden lg:grid gap-x-4 px-6 py-2.5 mt-3 border-y border-zinc-200/70 dark:border-white/[0.07] text-xs font-medium text-zinc-500 dark:text-zinc-400', LOG_COLS)} aria-hidden>
                <span>Area</span><span>What happened</span><span>Outcome</span><span>By</span><span>When</span>
              </div>
              <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06] max-lg:mt-3 max-lg:border-t max-lg:border-zinc-200/70 max-lg:dark:border-white/[0.07]">
                {entries.map((e) => {
                  const actor = e.actorId ? actors[e.actorId] : undefined;
                  const open = expanded === e.id;
                  const meta = e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata as object).length ? JSON.stringify(e.metadata, null, 2) : null;
                  const out = outcomeOf(e.action);
                  const where = (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-700 dark:text-zinc-300">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', AREA_DOT[area(e.action)] ?? 'bg-zinc-400')} />{AREA_LABELS[area(e.action)] ?? area(e.action)}
                    </span>
                  );
                  return (
                    <li key={e.id} className="log-row px-4 sm:px-6 py-3.5">
                      <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start lg:items-center lg:gap-x-4', LOG_COLS)}>
                        <span className="hidden lg:flex">{where}</span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-zinc-900 dark:text-white break-words">{e.summary}</p>
                          {e.targetType && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{e.targetType}{e.targetId ? ` · ${e.targetId}` : ''}</p>}
                        </div>
                        <span><StatusBadge tone={out.tone}>{out.label}</StatusBadge></span>
                        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:contents">
                          <span className="lg:hidden">{where}</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.08] flex items-center justify-center text-xs font-semibold text-zinc-700 dark:text-zinc-200" aria-hidden>{(e.actorName ?? '?').charAt(0).toUpperCase()}</span>
                            <span className="min-w-0 leading-tight">
                              <span className="block text-[13px] font-medium text-zinc-900 dark:text-white truncate">{e.actorName ?? 'System'}</span>
                              <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">{e.actorId && !actor ? 'account deleted' : (e.actorRole ?? '').toLowerCase()}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 lg:justify-between">
                            <time className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                              {fromNow(new Date(e.createdAt), { addSuffix: true })}
                            </time>
                            <button onClick={() => setExpanded(open ? null : e.id)} aria-expanded={open} aria-label={`Details: ${e.summary}`} className="btn-ghost btn-icon w-7 h-7 rounded-md">
                              <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
                            </button>
                          </div>
                        </div>
                      </div>
                      {open && (
                        <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] p-3 text-xs space-y-2 app-in">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                            <div><dt className="text-zinc-500 dark:text-zinc-400">When</dt><dd className="text-zinc-900 dark:text-zinc-100">{format(new Date(e.createdAt), 'd MMM yyyy, HH:mm:ss')}</dd></div>
                            <div><dt className="text-zinc-500 dark:text-zinc-400">Action</dt><dd className="text-zinc-900 dark:text-zinc-100 break-all">{e.action}</dd></div>
                            {e.ip && <div><dt className="text-zinc-500 dark:text-zinc-400">IP address</dt><dd className="text-zinc-900 dark:text-zinc-100 break-all">{e.ip}</dd></div>}
                            {actor && (
                              <div className="sm:col-span-2">
                                <dt className="text-zinc-500 dark:text-zinc-400">Who they are today</dt>
                                <dd className="text-zinc-900 dark:text-zinc-100 break-words">
                                  {actor.name} · <Mail className="w-3 h-3 inline -mt-0.5" aria-hidden /> <a href={`mailto:${actor.email}`} className="underline underline-offset-2">{actor.email}</a> · {actor.role.toLowerCase()} · {actor.status.toLowerCase()}
                                  {' · '}last active {actor.lastSeenAt ? fromNow(new Date(actor.lastSeenAt), { addSuffix: true }) : 'never'}
                                </dd>
                              </div>
                            )}
                          </dl>
                          {meta && <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-600 dark:text-zinc-400 max-h-48 overflow-auto">{meta}</pre>}
                          {e.actorId && actorFilter?.id !== e.actorId && (
                            <button onClick={() => setActorFilter({ id: e.actorId!, name: e.actorName ?? actor?.name ?? 'this person' })} className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-300">
                              <UserRound className="w-3.5 h-3.5" /> Everything by {e.actorName ?? actor?.name ?? 'this person'}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {cursor && entries.length > 0 && (
            <div className="p-4 border-t border-zinc-200/70 dark:border-white/[0.06] flex justify-center">
              <button onClick={loadMore} aria-busy={loadingMore || undefined} disabled={loadingMore} className="btn-secondary btn-sm">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
