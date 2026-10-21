'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Building2, Copy, Globe, GraduationCap, Inbox, Loader2, RefreshCw, Search, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { confirmDialog } from '@/components/ui/Dialogs';

// Approvals → Invited: everyone invited who hasn't signed up yet, with search, cancel, renew (another
// 30 days: "resend" without an email, since none is sent) and the sign-up link to share again.

interface Invitation { id: string; email: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN'; expiresAt: string; createdAt: string }
const ROLE = {
  STUDENT: { label: 'Student', icon: GraduationCap, cls: 'text-indigo-500' },
  TEACHER: { label: 'Staff', icon: Building2, cls: 'text-indigo-500' },
  ADMIN: { label: 'Organization', icon: Globe, cls: 'text-amber-500' },
} as const;
const fetcher = (url: string) => api.get(url).then((r) => r.data);

export function InvitationsPanel({ onBack, onInvite }: { onBack: () => void; onInvite: () => void }) {
  const { data, isLoading, error, mutate } = useSWR<{ items: Invitation[]; total: number }>('/users/invitations', fetcher);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | Invitation['role']>('');
  const items = useMemo(() => data?.items ?? [], [data]);
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => items.filter((i) => (!term || i.email.toLowerCase().includes(term)) && (!role || i.role === role)), [items, term, role]);

  const [renewing, setRenewing] = useState<string | null>(null);
  const renew = async (inv: Invitation) => {
    setRenewing(inv.id);
    try {
      await api.post(`/users/invitations/${inv.id}/renew`);
      toast.success(`Renewed for 30 days. Send ${inv.email} the sign-up link again.`);
      await mutate();
    } catch {
      toast.error('Could not renew the invitation.');
    } finally { setRenewing(null); }
  };
  const copyLink = async (inv: Invitation) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register`);
      toast.success(`Sign-up link copied. ${inv.email} is approved when they sign up with that address.`);
    } catch { toast.error('Copying isn’t allowed here. The link is your site address followed by /register.'); }
  };

  const cancel = async (inv: Invitation) => {
    if (!(await confirmDialog({ title: `Cancel the invitation for ${inv.email}?`, message: 'They can still sign up, but will need approval like anyone else.', destructive: true, confirmLabel: 'Cancel invitation' }))) return;
    try {
      await api.delete(`/users/invitations/${inv.id}`);
      toast.success('Invitation cancelled');
      await mutate();
    } catch {
      toast.error('Could not cancel the invitation.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><ArrowLeft className="w-4 h-4" /> Applications</button>
        <button onClick={onInvite} className="btn-primary btn-sm"><UserPlus className="w-4 h-4" /> Invite people</button>
      </div>
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Invited, not signed up yet</h2>
        <p className="text-sm text-zinc-500">They are approved automatically when they sign up with this address. Invitations last 30 days.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email" aria-label="Search invitations"
            className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 ps-9 pe-9 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400"><X className="w-4 h-4" /></button>}
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as '' | Invitation['role'])} aria-label="Filter by type"
          className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
          <option value="">Everyone</option>
          <option value="STUDENT">Students</option>
          <option value="TEACHER">Staff</option>
          <option value="ADMIN">Organizations</option>
        </select>
      </div>
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-900/50 overflow-hidden">
        {isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
        ) : error ? (
          <p className="p-10 text-center text-sm text-rose-500">Could not load invitations.</p>
        ) : !shown.length ? (
          <div className="p-10 text-center">
            <Inbox className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-500">{items.length ? 'No invitations match this search.' : 'No open invitations.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
            {shown.map((inv) => {
              const r = ROLE[inv.role];
              return (
                <li key={inv.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white break-all">{inv.email}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 flex flex-wrap gap-x-2">
                      <span className={cn('inline-flex items-center gap-1 font-semibold', r.cls)}><r.icon className="w-3 h-3" />{r.label}</span>
                      <span>invited {format(new Date(inv.createdAt), 'd MMM yyyy')}</span>
                      <span>· expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}</span>
                    </p>
                  </div>
                  <button type="button" onClick={() => void copyLink(inv)} className="p-2 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-500/10"><Copy className="w-4 h-4" /><span className="sr-only">Copy the sign-up link for {inv.email}</span></button>
                  <button type="button" onClick={() => void renew(inv)} disabled={renewing === inv.id} className="btn-secondary btn-sm">{renewing === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Renew<span className="sr-only"> the invitation for {inv.email}</span></button>
                  <button onClick={() => cancel(inv)} aria-label={`Cancel invitation for ${inv.email}`} className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!!items.length && <p className="text-xs text-zinc-500">{shown.length === items.length ? `${items.length} open invitation${items.length === 1 ? '' : 's'}` : `${shown.length} of ${items.length} invitations`}</p>}
    </div>
  );
}
