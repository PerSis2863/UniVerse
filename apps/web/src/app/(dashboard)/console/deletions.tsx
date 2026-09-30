'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { card, fetcher } from './shared';

interface Req {
  id: string; email: string; name: string; reason: string | null; status: string; note: string | null; createdAt: string; decidedAt: string | null;
  user: { id: string; role: string; status: string; createdAt: string; lastSeenAt: string | null; _count: { loginEvents: number } };
}

/** Owner console → Deletion requests: approve (the account is erased) or decline (with a reason). */
export function DeletionsPanel({ onOpenPerson }: { onOpenPerson: (id: string) => void }) {
  const [view, setView] = useState<'PENDING' | 'all'>('PENDING');
  const { data, mutate, isLoading } = useSWR<Req[]>(`/owner/deletion-requests?status=${view}`, fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = async (r: Req, decision: 'approve' | 'decline') => {
    if (decision === 'approve' && !window.confirm(`Permanently delete ${r.name}'s account (${r.email})? This can't be undone.`)) return;
    setBusy(r.id);
    try {
      await api.patch(`/owner/deletion-requests/${r.id}`, { decision, note: notes[r.id] ?? '' });
      toast.success(decision === 'approve' ? 'Account deleted — they were emailed' : 'Request declined — they were notified');
      await mutate();
    } catch (e) { toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(['PENDING', 'all'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn('px-3 py-1.5 rounded-full text-sm font-semibold', view === v ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]')}>{v === 'PENDING' ? 'Waiting for you' : 'All'}</button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">Check that the request is genuine (e.g. recent sign-ins from the person’s usual devices, or contact them) before approving. Approving erases the account; the person gets an email first.</p>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> : !data?.length ? (
        <div className={cn(card, 'p-8 text-center text-sm text-zinc-500')}>No {view === 'PENDING' ? 'pending ' : ''}deletion requests.</div>
      ) : data.map((r) => (
        <div key={r.id} className={cn(card, 'p-4 sm:p-5')}>
          <div className="flex flex-wrap items-start gap-3">
            <Trash2 className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[14rem]">
              <p className="font-semibold text-zinc-900 dark:text-white">{r.name} <span className="font-normal text-zinc-500">· {r.email}</span></p>
              <p className="text-xs text-zinc-500">{r.user.role.toLowerCase()} · joined {formatDistanceToNow(new Date(r.user.createdAt), { addSuffix: true })} · last seen {r.user.lastSeenAt ? formatDistanceToNow(new Date(r.user.lastSeenAt), { addSuffix: true }) : 'never'} · {r.user._count.loginEvents} sign-ins · asked {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
              {r.reason && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">“{r.reason}”</p>}
              {r.status !== 'PENDING' && <p className="mt-2 text-xs font-semibold text-zinc-500">{r.status}{r.note ? ` — ${r.note}` : ''}</p>}
            </div>
            <button onClick={() => onOpenPerson(r.user.id)} className="text-xs font-semibold text-indigo-500 hover:underline">View account</button>
          </div>
          {r.status === 'PENDING' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Note to the person if you decline (optional)" className="flex-1 min-w-[14rem] rounded-xl bg-zinc-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-zinc-900 dark:text-white outline-none" />
              <button onClick={() => decide(r, 'decline')} aria-busy={busy === r.id || undefined} disabled={busy === r.id} className="px-3 py-2 rounded-xl text-sm font-semibold bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 inline-flex items-center gap-1"><X className="w-4 h-4" /> Decline</button>
              <button onClick={() => decide(r, 'approve')} aria-busy={busy === r.id || undefined} disabled={busy === r.id} className="btn-danger">{busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve & delete</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
