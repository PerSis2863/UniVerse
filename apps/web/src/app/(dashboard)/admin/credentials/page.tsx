'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle, Clock, ExternalLink, Loader2, ShieldCheck, XCircle, History, Link2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';

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
  student: { id: string; name: string; email: string; avatar: string | null };
}

function apiErrorMessage(err: any, fallback: string): string {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  if (typeof msg === 'string') return msg;
  return fallback;
}

export default function AdminCredentialVerificationPage() {
  const { data, error, isLoading, mutate } = useSWR<PendingCredential[]>('/impact/blockchain-credentials/pending', fetcher);
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
      await mutate();
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

  const items = data ?? [];

  return (
    <>
      <Topbar title="Credential Verification" subtitle="Verify student impact before a credential is signed and made shareable." />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" /> Awaiting verification ({items.length})
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

          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
          ) : error ? (
            <div className="p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-300">
              {apiErrorMessage(error, 'Could not load pending credentials.')}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">All caught up</h3>
              <p className="text-sm text-zinc-500 mt-1">No credential requests are waiting for verification.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">{item.student.name} · {item.student.email}</p>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-1">{item.title}</h3>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400">{item.organization} — {item.projectName}</p>
                    </div>
                    <span className="text-xs text-zinc-500">Requested {new Date(item.requestedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex gap-6 mt-3 text-sm flex-wrap">
                    <span className="text-zinc-500">Hours <b className="text-zinc-900 dark:text-white">{item.hoursCompleted}</b></span>
                    <span className="text-zinc-500">People impacted <b className="text-zinc-900 dark:text-white">{item.peopleImpacted.toLocaleString()}</b></span>
                    {item.evidenceUrl && (
                      <a href={item.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1">
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
                    <button onClick={() => act(item.id, 'reject')} disabled={busyId === item.id}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button onClick={() => act(item.id, 'approve')} disabled={busyId === item.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                      {busyId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify & sign
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
