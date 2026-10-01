'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow as fromNow } from 'date-fns';
import { Activity, ChevronDown, Download, Loader2, Mail, Search, UserRound, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api, API_URL } from '@/lib/api';
import { authFetch } from '@/lib/auth-token';

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
const AREA_COLORS: Record<string, string> = {
  user: 'bg-indigo-500/10 text-indigo-500',
  course: 'bg-cyan-500/10 text-cyan-500',
  grade: 'bg-emerald-500/10 text-emerald-500',
  credential: 'bg-amber-500/10 text-amber-500',
  certificate: 'bg-amber-500/10 text-amber-500',
  impact: 'bg-fuchsia-500/10 text-fuchsia-500',
  scholarship: 'bg-sky-500/10 text-sky-500',
  project: 'bg-teal-500/10 text-teal-500',
  safety: 'bg-rose-500/10 text-rose-500',
};

const area = (action: string) => action.split('.')[0];
const verb = (action: string) => action.split('.').slice(1).join(' ').replace(/_/g, ' ');
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
  const { data: actions } = useSWR<{ action: string; count: number }[]>('/audit/actions', (url: string) => api.get(url).then((r) => r.data));

  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actions ?? []) counts.set(area(a.action), (counts.get(area(a.action)) ?? 0) + a.count);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [actions]);

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

  return (
    <>
      <Topbar title="Activity Log" subtitle="Who changed what: roles, accounts, grades, credentials and approvals" />

      <div className="flex-1 p-4 sm:p-8 overflow-y-auto space-y-6">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input className={`${input} w-full pl-9`} placeholder="Search people, emails or descriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={input} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Type of activity">
            <option value="">All activity</option>
            {areas.map(([a, n]) => (
              <option key={a} value={a}>
                {AREA_LABELS[a] ?? a} ({n})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-zinc-400 text-sm">–</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          {filtered && (
            <button onClick={clear} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
          <button
            onClick={exportCsv}
            aria-busy={exporting || undefined} disabled={exporting}
            className="btn-primary"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export CSV
          </button>
        </div>

        {actorFilter && (
          <p className="text-sm text-zinc-600 dark:text-zinc-300 flex flex-wrap items-center gap-2">
            Showing only what <b className="text-zinc-900 dark:text-white">{actorFilter.name}</b> did
            <button onClick={() => setActorFilter(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-500"><X className="w-3.5 h-3.5" /> Everyone</button>
          </p>
        )}

        <div className="rounded-3xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <p className="p-12 text-center text-sm text-rose-500">Could not load the activity log.</p>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-3">
                <Activity className="w-6 h-6 text-indigo-500" />
              </div>
              <p className="font-semibold text-zinc-900 dark:text-white">{filtered ? 'No activity matches these filters' : 'No activity recorded yet'}</p>
              <p className="text-sm text-zinc-500 mt-1">Role and account changes, grades, credential decisions and deletions appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {entries.map((e) => {
                const actor = e.actorId ? actors[e.actorId] : undefined;
                const open = expanded === e.id;
                const meta = e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata as object).length ? JSON.stringify(e.metadata, null, 2) : null;
                return (
                <li key={e.id} className="p-4 sm:px-6 flex gap-4 items-start">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-600 dark:text-zinc-300">
                    {(e.actorName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-white flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{e.actorName ?? 'System'}</span>
                      {e.actorRole && <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{e.actorRole}</span>}
                      {actor && <a href={`mailto:${actor.email}`} className="text-xs text-zinc-500 hover:text-indigo-500 break-all">{actor.email}</a>}
                      {e.actorId && !actor && <span className="text-xs text-zinc-400">account deleted</span>}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-0.5 break-words">{e.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${AREA_COLORS[area(e.action)] ?? 'bg-zinc-500/10 text-zinc-500'}`}>
                        {AREA_LABELS[area(e.action)] ?? area(e.action)} · {verb(e.action)}
                      </span>
                      <time className="text-xs text-zinc-400" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                        {fromNow(new Date(e.createdAt), { addSuffix: true })}
                      </time>
                      <button onClick={() => setExpanded(open ? null : e.id)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-xs font-semibold text-indigo-500">
                        Details <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {open && (
                      <div className="mt-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] p-3 text-xs space-y-2">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                          <div><dt className="text-zinc-500">When</dt><dd className="text-zinc-900 dark:text-zinc-100">{format(new Date(e.createdAt), 'd MMM yyyy, HH:mm:ss')}</dd></div>
                          <div><dt className="text-zinc-500">Action</dt><dd className="text-zinc-900 dark:text-zinc-100 break-all">{e.action}</dd></div>
                          {e.targetType && <div><dt className="text-zinc-500">Target</dt><dd className="text-zinc-900 dark:text-zinc-100 break-all">{e.targetType}{e.targetId ? ` · ${e.targetId}` : ''}</dd></div>}
                          {e.ip && <div><dt className="text-zinc-500">IP address</dt><dd className="text-zinc-900 dark:text-zinc-100 break-all">{e.ip}</dd></div>}
                          {actor && (
                            <div className="sm:col-span-2">
                              <dt className="text-zinc-500">Actor today</dt>
                              <dd className="text-zinc-900 dark:text-zinc-100 break-words">
                                {actor.name} · <Mail className="w-3 h-3 inline -mt-0.5" /> {actor.email} · {actor.role.toLowerCase()} · {actor.status.toLowerCase()}
                                {' · '}last active {actor.lastSeenAt ? fromNow(new Date(actor.lastSeenAt), { addSuffix: true }) : 'never'}
                              </dd>
                            </div>
                          )}
                        </dl>
                        {meta && <pre className="whitespace-pre-wrap break-all text-[11px] text-zinc-600 dark:text-zinc-400 max-h-48 overflow-auto">{meta}</pre>}
                        {e.actorId && actorFilter?.id !== e.actorId && (
                          <button onClick={() => setActorFilter({ id: e.actorId!, name: e.actorName ?? actor?.name ?? 'this person' })} className="inline-flex items-center gap-1 font-semibold text-indigo-500">
                            <UserRound className="w-3.5 h-3.5" /> Everything by {e.actorName ?? actor?.name ?? 'this person'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
          {cursor && entries.length > 0 && (
            <div className="p-4 border-t border-zinc-100 dark:border-white/[0.05] flex justify-center">
              <button onClick={loadMore} aria-busy={loadingMore || undefined} disabled={loadingMore} className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-500 disabled:opacity-60">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
