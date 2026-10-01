'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle, Clock, ExternalLink, Loader2, ShieldCheck, XCircle, History, Link2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { safeHref } from '@/lib/safe-href';
import { SearchBox, matchesQuery, RoleChip, StatusChip, fmtDate, fmtAgo, shownSummary } from '@/components/impact/AdminPeople';

const fetcher = (url: string) => api.get(url).then(res => res.data);

interface PendingCredential {
  id: string;
  certificateCode: string;
  title: string;
  projectName: string;
  organization: string;
  hoursCompleted: number;
  peopleImpacted: number;
  description: string | null;
  evidenceUrl: string | null;
  requestedAt: string;
  student: {
    id: string; name: string; email: string; avatar: string | null;
    role?: string; status?: string; createdAt?: string; lastSeenAt?: string | null;
    impactXP?: number; impactLevel?: number;
    studentProfile?: { department: string | null; year: number } | null;
    _count?: { impactCertificates: number };
  };
}

interface Decision {
  id: string;
  title: string;
  organization: string;
  projectName: string;
  hoursCompleted: number;
  peopleImpacted: number;
  status: 'ISSUED' | 'REJECTED' | 'REVOKED' | 'UNVERIFIED_LEGACY';
  issuedAt: string | null;
  requestedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  verifiedByName: string | null;
  student: { id: string; name: string; email: string; role: string };
}

const DECISION_STYLE: Record<Decision['status'], { label: string; cls: string }> = {
  ISSUED: { label: 'Issued', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', cls: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
  REVOKED: { label: 'Revoked', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  UNVERIFIED_LEGACY: { label: 'Unverified (legacy)', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

function apiErrorMessage(err: any, fallback: string): string {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  return fallback;
}

export default function AdminCredentialVerificationPage() {
  const { data, error, isLoading, mutate } = useSWR<PendingCredential[]>('/impact/blockchain-credentials/pending', fetcher);
  const { data: recentData, error: recentError, mutate: mutateRecent } = useSWR<Decision[]>('/impact/blockchain-credentials/recent', fetcher);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [anchorBusy, setAnchorBusy] = useState(false);

  const retryAnchoring = async () => {
    setAnchorBusy(true);
    try {
      const res = await api.post('/impact/blockchain-credentials/anchor/retry');
      if (res.data?.enabled === false) toast.info('Blockchain anchoring is not configured on the server yet.');
      else toast.success(`${res.data?.queued ?? 0} credential(s) queued for blockchain anchoring`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not start anchoring'));
    } finally {
      setAnchorBusy(false);
    }
  };

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      if (action === 'approve') {
        await api.post(`/impact/blockchain-credentials/${id}/approve`);
        toast.success('Credential verified and signed');
      } else {
        const reason = rejectReason[id]?.trim();
        await api.post(`/impact/blockchain-credentials/${id}/reject`, reason ? { reason } : {});
        toast.success('Request rejected');
      }
      await Promise.all([mutate(), mutateRecent()]);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not ${action} this credential`));
    } finally {
      setBusyId(null);
    }
  };

  const sendLegacyToReview = async () => {
    setLegacyBusy(true);
    try {
      const res = await api.post('/impact/blockchain-credentials/legacy/send-to-review');
      toast.success(`${res.data?.movedToReview ?? 0} legacy credential(s) moved to the review queue`);
      await mutate();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not move legacy credentials'));
    } finally {
      setLegacyBusy(false);
    }
  };

  const allItems = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const items = useMemo(
    () => allItems.filter((i) => matchesQuery(q, i.title, i.organization, i.projectName, i.certificateCode, i.student?.name, i.student?.email, i.student?.studentProfile?.department)),
    [allItems, q],
  );
  const recentAll = useMemo(() => (Array.isArray(recentData) ? recentData : []), [recentData]);
  const recent = useMemo(
    () => recentAll.filter((d) => matchesQuery(q, d.title, d.organization, d.projectName, d.student?.name, d.student?.email, d.verifiedByName, DECISION_STYLE[d.status]?.label)),
    [recentAll, q],
  );

  return (
    <>
      <Topbar title="Credential Verification" subtitle="Verify student impact before a credential is signed and made shareable." />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" /> Awaiting verification ({allItems.length})
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Confirm the hours and impact with the partner organization before approving. Approved credentials are signed and publicly verifiable.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
            <button onClick={retryAnchoring} disabled={anchorBusy}
              title="Record issued credentials that are not yet on the blockchain (or failed) on Polygon."
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
              {anchorBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Anchor on blockchain
            </button>
            <button onClick={sendLegacyToReview} disabled={legacyBusy}
              title="Credentials created before verification existed were never checked. Move them here for review."
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">
              {legacyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />} Review legacy credentials
            </button>
            </div>
          </div>

          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search student, email, organization, project or verifier…"
            summary={allItems.length ? shownSummary(items.length, allItems.length, 'pending request') : undefined}
          />

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-300">
              {apiErrorMessage(error, 'Could not load pending credentials.')}
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">All caught up</h3>
              <p className="text-sm text-zinc-500 mt-1">No credential requests are waiting for verification.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center p-10 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm text-zinc-500">
              No pending requests match “{q}”.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{item.student.name}</p>
                        <RoleChip role={item.student.role} />
                        <StatusChip status={item.student.status} />
                      </div>
                      <a href={`mailto:${item.student.email}`} className="text-xs text-zinc-500 hover:text-indigo-500 break-all">{item.student.email}</a>
                      {studentFacts(item.student).length > 0 && <p className="text-[11px] text-zinc-500 mt-0.5">{studentFacts(item.student).join(' · ')}</p>}
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-1">{item.title}</h3>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400">{item.organization} — {item.projectName}</p>
                    </div>
                    <span className="text-xs text-zinc-500">Requested {fmtDate(item.requestedAt)}</span>
                  </div>
                  <div className="flex gap-6 mt-3 text-sm flex-wrap">
                    <span className="text-zinc-500">Hours <b className="text-zinc-900 dark:text-white">{item.hoursCompleted}</b></span>
                    <span className="text-zinc-500">People impacted <b className="text-zinc-900 dark:text-white">{item.peopleImpacted.toLocaleString()}</b></span>
                    {item.evidenceUrl && (
                      <a href={safeHref(item.evidenceUrl)} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1">
                        Evidence <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {item.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-3">{item.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <input
                      value={rejectReason[item.id] ?? ''}
                      onChange={e => setRejectReason(r => ({ ...r, [item.id]: e.target.value }))}
                      placeholder="Reason if rejecting (shown to the student)"
                      maxLength={500}
                      className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                    />
                    <button onClick={() => act(item.id, 'reject')} aria-busy={busyId === item.id || undefined} disabled={busyId === item.id}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button onClick={() => act(item.id, 'approve')} aria-busy={busyId === item.id || undefined} disabled={busyId === item.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                      {busyId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify & sign
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <section className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Recent decisions</h3>
              <p className="text-xs text-zinc-500 mt-0.5">The latest 60 credentials that were issued, rejected or revoked, with the student and the admin who verified them.</p>
            </div>
            {recentError ? (
              <p className="p-5 text-sm text-red-600 dark:text-red-300">{apiErrorMessage(recentError, 'Could not load recent decisions.')}</p>
            ) : !recentData ? (
              <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
            ) : recentAll.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">No credential has been issued, rejected or revoked yet.</p>
            ) : recent.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">No decisions match “{q}”.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                {recent.map((d) => {
                  const st = DECISION_STYLE[d.status] ?? { label: d.status, cls: 'bg-zinc-500/10 text-zinc-500' };
                  const when = d.status === 'ISSUED' ? d.issuedAt : d.revokedAt ?? d.requestedAt;
                  return (
                    <li key={d.id} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{d.title}</p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400">{d.organization} — {d.projectName}</p>
                        <p className="text-xs text-zinc-500 mt-1 break-words">
                          <span className="text-zinc-700 dark:text-zinc-300 font-medium">{d.student?.name}</span> · {d.student?.email}
                          {' · '}{d.hoursCompleted} h · {d.peopleImpacted.toLocaleString()} people
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {d.verifiedByName ? `Verified by ${d.verifiedByName}` : 'No verifying admin recorded'}
                          {d.revokedReason ? ` · Reason: ${d.revokedReason}` : ''}
                        </p>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        {fmtDate(when) && <span className="text-[11px] text-zinc-500">{fmtDate(when)}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function studentFacts(s: PendingCredential['student']) {
  return [
    s.studentProfile?.department,
    s.studentProfile?.year ? `Year ${s.studentProfile.year}` : null,
    typeof s.impactXP === 'number' ? `Impact level ${s.impactLevel ?? 1} · ${s.impactXP.toLocaleString()} XP` : null,
    typeof s._count?.impactCertificates === 'number' ? `${s._count.impactCertificates} verified credential${s._count.impactCertificates === 1 ? '' : 's'}` : null,
    s.createdAt ? `Joined ${fmtDate(s.createdAt)}` : null,
    s.lastSeenAt ? `Last seen ${fmtAgo(s.lastSeenAt)}` : null,
  ].filter(Boolean) as string[];
}
