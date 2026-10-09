'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, KeyRound, Loader2, Trash2, UserCheck, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';

// Student settings → Parent or guardian → parent accounts (Stage 5 · B16.1): make a one-time code
// for a parent's UniVerse account, and see or remove the parents linked to you.

type Link = { id: string; name: string; email: string; relation: string | null; createdAt: string };
type View = { links: Link[]; code: { code: string; expiresAt: string } | null };
const KEY = '/api/student/guardian-accounts';

export function GuardianAccountsCard() {
  const { data, mutate, isLoading } = useSWR<View>(KEY, authedJson);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const send = async (body: object, done?: string) => {
    setBusy(true);
    try {
      await mutate(await authedJson<View>(KEY, { method: 'POST', body: JSON.stringify(body) }), { revalidate: false });
      if (done) toast.success(done);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that right now.')); }
    finally { setBusy(false); }
  };

  const remove = async (l: Link) => {
    if (await confirmDialog({ title: `Remove ${l.name}?`, message: 'They’ll stop seeing your schoolwork straight away. They’re told in the app.', confirmLabel: 'Remove', destructive: true })) void send({ action: 'remove', linkId: l.id }, `${l.name} removed`);
  };

  const code = data?.code;
  const shown = code ? `${code.code.slice(0, 4)}-${code.code.slice(4)}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error('Couldn’t copy. Write the code down instead.'); }
  };

  return (
    <div className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
          <UserCheck className="w-6 h-6 text-white" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Link a parent’s account</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Your parent signs up on UniVerse as “Parent or guardian” and enters a code from you. They then see your grades, attendance, deadlines and report cards, never your messages. You can remove them at any time.
          </p>
        </div>
      </div>

      {isLoading && !data ? <div className="h-16 rounded-2xl skeleton" /> : (
        <>
          {code ? (
            <div className="rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] p-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Give this code to your parent. It works once, until {formatDistanceToNow(new Date(code.expiresAt), { addSuffix: false })} from now.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-zinc-900 dark:text-white" aria-label={`Code ${code.code.split('').join(' ')}`}>{shown}</span>
                <button type="button" onClick={() => void copy()} className="btn-secondary btn-sm">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy'}</button>
                <button type="button" onClick={() => void send({ action: 'cancel-code' }, 'Code cancelled')} disabled={busy} className="btn-ghost btn-sm"><X className="w-4 h-4" /> Cancel code</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => void send({ action: 'code' })} disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Make a code
            </button>
          )}

          {data && data.links.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-2">Linked parent accounts</h4>
              <ul className="space-y-2">
                {data.links.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{l.name}{l.relation ? ` · ${l.relation}` : ''}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{l.email} · linked {formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}</p>
                    </div>
                    <button type="button" onClick={() => void remove(l)} disabled={busy} aria-label={`Remove ${l.name}`} className="w-11 h-11 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
