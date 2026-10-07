'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle, Clock, XCircle, Award } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { promptDialog } from '@/components/ui/Dialogs';
import { SearchBox, matchesQuery, RoleChip, StatusChip, fmtDate, fmtAgo, shownSummary } from '@/components/impact/AdminPeople';

const fetcher = (url: string) => api.get(url).then(res => res.data);

interface PendingCertificate {
  id: string;
  title: string;
  user: {
    id?: string;
    name: string;
    email: string;
    role?: string;
    status?: string;
    createdAt?: string;
    lastSeenAt?: string | null;
    impactXP?: number;
    impactLevel?: number;
    studentProfile?: { department: string | null; year: number } | null;
    _count?: { impactCertificates: number };
  };
  createdAt: string;
}

export default function AdminCertificationsPage() {
  const { data: pendingRequests, mutate, isLoading } = useSWR<PendingCertificate[]>(`/impact/certificates/pending`, fetcher);
  const [approving, setApproving] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const all = useMemo(() => (Array.isArray(pendingRequests) ? pendingRequests : []), [pendingRequests]);
  const shown = useMemo(
    () => all.filter((r) => matchesQuery(q, r.title, r.user?.name, r.user?.email, r.user?.role, r.user?.studentProfile?.department)),
    [all, q],
  );

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      await api.post(`/impact/certificates/${id}/approve`);
      toast.success('Certificate approved successfully!');
      mutate();
    } catch {
      toast.error('Failed to approve certificate.');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (req: PendingCertificate) => {
    const reason = await promptDialog({
      title: `Turn down “${req.title}”?`,
      message: `${req.user.name} will be told, with your reason, and can request it again later.`,
      placeholder: 'Reason (optional), e.g. impact hours not yet verified',
      confirmLabel: 'Turn down',
      maxLength: 500,
    });
    if (reason === null) return;
    setApproving(req.id);
    try {
      await api.post(`/impact/certificates/${req.id}/reject`, { reason });
      toast.success('Request turned down. The student has been told.');
      mutate();
    } catch {
      toast.error('Could not turn down the request. Please try again.');
    } finally {
      setApproving(null);
    }
  };

  return (
    <>
      <Topbar
        title="Pending Certifications"
        subtitle="Review and approve student requests for Social Impact Certificates."
      />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Awaiting Approval ({all.length})
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Please verify the student&apos;s impact hours before approving their credential.
              </p>
            </div>
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search by name, email, department or certificate…"
              summary={all.length ? shownSummary(shown.length, all.length, 'request') : undefined}
            />
          </div>

          {isLoading ? (
            <ContentSkeleton variant="list" />
          ) : all.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">All caught up!</h3>
              <p className="text-zinc-500 dark:text-zinc-400">There are no pending certificate requests to review.</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="text-center p-10 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm text-zinc-500">
              No requests match “{q}”.
            </div>
          ) : (
            <div className="grid gap-4">
              {shown.map((req) => {
                const u = req.user;
                const facts = [
                  u.studentProfile?.department,
                  u.studentProfile?.year ? `Year ${u.studentProfile.year}` : null,
                  typeof u.impactXP === 'number' ? `Impact level ${u.impactLevel ?? 1} · ${u.impactXP.toLocaleString()} XP` : null,
                  typeof u._count?.impactCertificates === 'number' ? `${u._count.impactCertificates} verified credential${u._count.impactCertificates === 1 ? '' : 's'}` : null,
                  fmtDate(u.createdAt) ? `Joined ${fmtDate(u.createdAt)}` : null,
                  u.lastSeenAt ? `Last seen ${fmtAgo(u.lastSeenAt)}` : null,
                ].filter(Boolean);
                return (
                  <div key={req.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-6">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-12 h-12 shrink-0 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                          <Award className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-zinc-900 dark:text-white text-lg">{u.name}</h3>
                            <RoleChip role={u.role} />
                            <StatusChip status={u.status} />
                          </div>
                          <a href={`mailto:${u.email}`} className="text-xs font-mono text-zinc-500 dark:text-zinc-400 hover:text-indigo-500 break-all">{u.email}</a>
                          {facts.length > 0 && <p className="text-xs text-zinc-500 mt-1">{facts.join(' · ')}</p>}
                          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                            <span className="font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                              {req.title}
                            </span>
                            <span>Requested {fmtDate(req.createdAt) ?? 'on an unknown date'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 px-3 border text-rose-600 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          disabled={approving === req.id}
                          onClick={() => handleReject(req)}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white"
                          aria-busy={approving === req.id || undefined} disabled={approving === req.id}
                          onClick={() => handleApprove(req.id)}
                        >
                          {approving === req.id ? (
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Approving...</span>
                          ) : (
                            <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Approve</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
