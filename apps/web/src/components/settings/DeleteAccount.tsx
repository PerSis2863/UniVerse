'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Loader2, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Req { id: string; status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED'; reason: string | null; note: string | null; createdAt: string; decidedAt: string | null }

/** Settings → Privacy: ask for the account to be deleted permanently (reviewed by the platform owner). */
export function DeleteAccount() {
  const { data: req, mutate } = useSWR<Req | null>('/users/me/deletion', (u: string) => api.get(u).then((r) => r.data));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/users/me/deletion', { reason, confirm });
      toast.success('Request sent. We’ll email you once it has been reviewed.');
      setOpen(false); setReason(''); setConfirm('');
      await mutate();
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Couldn’t send the request.');
    } finally { setBusy(false); }
  };
  const cancel = async () => {
    try { await api.delete('/users/me/deletion'); toast.success('Deletion request cancelled'); await mutate(); }
    catch { toast.error('Couldn’t cancel the request.'); }
  };

  return (
    <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-5">
      <p className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Trash2 className="w-4 h-4 text-rose-500" /> Delete my account</p>
      {req?.status === 'PENDING' ? (
        <div className="mt-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Requested on {new Date(req.createdAt).toLocaleDateString()} — being reviewed. You’ll get an email when it’s done.</p>
          <button onClick={cancel} className="mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">Cancel the request and keep my account</button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Permanently deletes your account and the personal data linked to it: profile, sign-in history, notifications, skills passport, flashcards. This can’t be undone. For your safety, each request is reviewed before the account is deleted (usually within a few days). Consider downloading your data first.</p>
          {req?.status === 'DECLINED' && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Your last request was declined{req.note ? `: ${req.note}` : '.'}</p>}
          {!open ? (
            <button onClick={() => setOpen(true)} className="mt-3 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold">Delete my account…</button>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Your courses, credentials, messages and everything else will be gone for you. Organizations and teachers keep only records they need, with your name removed.</div>
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">Why are you leaving? (optional)</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] p-3 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500/40" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">Type <b>DELETE</b> to confirm</span>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500/40" />
              </label>
              <div className="flex gap-2">
                <button onClick={submit} disabled={busy || confirm !== 'DELETE'} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Request deletion</button>
                <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-500 inline-flex items-center gap-1"><X className="w-4 h-4" /> Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
