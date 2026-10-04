'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle, Loader2, MapPin, ShieldAlert, UserX } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { SearchBox, matchesQuery, RoleChip, fmtAgo, fmtDate, shownSummary } from '@/components/impact/AdminPeople';

interface SafetyReport {
  id: string;
  title: string;
  description: string;
  location: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isAnonymous: boolean;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  reporter: { id: string; name: string; email: string; role: string } | null;
}

const SEVERITY_STYLE: Record<SafetyReport['severity'], string> = {
  CRITICAL: 'bg-rose-600 text-white border-rose-600',
  HIGH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  LOW: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20',
};

const SEVERITY_RANK: Record<SafetyReport['severity'], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const fetcher = (url: string) => api.get(url).then((r) => r.data);

/** BeeSafe reports from students and staff (student/beesafe), open ones first. */
export default function AdminSafetyPage() {
  const { data, isLoading, mutate } = useSWR<SafetyReport[]>('/safety', fetcher);
  const [q, setQ] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const open = all.filter((r) => !r.isResolved);
  // Open before resolved, most urgent first, then newest (the list arrives newest first).
  const shown = all
    .filter((r) => (showResolved || !r.isResolved) && matchesQuery(q, r.title, r.description, r.location, r.severity, r.reporter?.name, r.reporter?.email))
    .sort((a, b) => Number(a.isResolved) - Number(b.isResolved) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const resolve = async (id: string) => {
    setResolving(id);
    try {
      await api.patch(`/safety/${id}/resolve`);
      await mutate((list) => list?.map((r) => (r.id === id ? { ...r, isResolved: true, resolvedAt: new Date().toISOString() } : r)), { revalidate: false });
      toast.success('Marked as resolved');
    } catch {
      toast.error('Could not update the report. Please try again.');
    } finally {
      setResolving(null);
    }
  };

  return (
    <>
      <Topbar title="Safety reports" subtitle="BeeSafe reports sent by students and staff. Every new report alerts all admins." />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" /> Open reports ({open.length})
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex-1">
                <SearchBox value={q} onChange={setQ} placeholder="Search reports, places or reporters…" summary={all.length ? shownSummary(shown.length, showResolved ? all.length : open.length, 'report') : undefined} />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl skeleton" />)}</div>
          ) : shown.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{q ? `No reports match “${q}”` : 'No open reports'}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Reports sent from BeeSafe appear here, and every admin is notified.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {shown.map((r) => (
                <article key={r.id} className={`p-5 rounded-2xl border bg-white dark:bg-zinc-900/50 ${r.isResolved ? 'border-zinc-200 dark:border-zinc-800 opacity-70' : 'border-zinc-200 dark:border-zinc-800'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[r.severity]}`}>{r.severity}</span>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">{r.title}</h3>
                        {r.isResolved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Resolved {fmtDate(r.resolvedAt) ?? ''}</span>}
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line break-words">{r.description}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                        {r.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{r.location}</span>}
                        <span title={new Date(r.createdAt).toLocaleString()}>Sent {fmtAgo(r.createdAt)}</span>
                        {r.isAnonymous || !r.reporter ? (
                          <span className="inline-flex items-center gap-1"><UserX className="w-3.5 h-3.5" />Anonymous</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {r.reporter.name} <RoleChip role={r.reporter.role} />
                            <a href={`mailto:${r.reporter.email}?subject=${encodeURIComponent(`Your BeeSafe report: ${r.title}`)}`} className="text-indigo-500 hover:text-indigo-400">{r.reporter.email}</a>
                          </span>
                        )}
                      </div>
                    </div>
                    {!r.isResolved && (
                      <button type="button" className="btn-secondary shrink-0" disabled={resolving === r.id} aria-busy={resolving === r.id || undefined} onClick={() => resolve(r.id)}>
                        {resolving === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Mark resolved
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
