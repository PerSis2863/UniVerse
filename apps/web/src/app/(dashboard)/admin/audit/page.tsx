'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Download, Loader2, Search, X } from 'lucide-react';
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
  createdAt: string;
}
interface Page {
  entries: AuditEntry[];
  nextCursor: string | null;
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
    if (from) p.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) p.set('to', new Date(`${to}T23:59:59.999`).toISOString());
    return p.toString();
  }, [debouncedQ, areaFilter, from, to]);

  const { data, isLoading, error } = useSWR<Page>(`/audit?${params}`, (url: string) => api.get(url).then((r) => r.data), {
    revalidateOnFocus: true,
    onSuccess: (page) => {
      setMore([]);
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
  const filtered = !!(debouncedQ || areaFilter || from || to);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data: page } = await api.get<Page>(`/audit?${params}${params ? '&' : ''}cursor=${encodeURIComponent(cursor)}`);
      setMore((m) => [...m, ...page.entries]);
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
            <input className={`${input} w-full pl-9`} placeholder="Search people or descriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export CSV
          </button>
        </div>

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
              {entries.map((e) => (
                <li key={e.id} className="p-4 sm:px-6 flex gap-4 items-start">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-sm font-bold text-zinc-600 dark:text-zinc-300">
                    {(e.actorName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-white">
                      <span className="font-semibold">{e.actorName ?? 'System'}</span>
                      {e.actorRole && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{e.actorRole}</span>}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-0.5 break-words">{e.summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${AREA_COLORS[area(e.action)] ?? 'bg-zinc-500/10 text-zinc-500'}`}>
                        {AREA_LABELS[area(e.action)] ?? area(e.action)} · {verb(e.action)}
                      </span>
                      <time className="text-xs text-zinc-400" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                        {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                      </time>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cursor && entries.length > 0 && (
            <div className="p-4 border-t border-zinc-100 dark:border-white/[0.05] flex justify-center">
              <button onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-500 disabled:opacity-60">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
