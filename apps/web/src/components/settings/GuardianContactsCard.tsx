'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Loader2, Mail, Trash2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog } from '@/components/ui/Dialogs';

// Student settings → Parent or guardian: people who get a weekly progress email and absence
// alerts (src/server/guardians.ts). They confirm from the first email before anything else is sent.

interface Contact { id: string; email: string; name: string | null; confirmedAt: string | null; weeklyDigest: boolean; absenceAlerts: boolean; lastDigestAt: string | null }


export function GuardianContactsCard() {
  const { data: res, mutate: refresh, isLoading } = useSWR<{ enabled: boolean; contacts: Contact[] }>('/api/student/guardians', authedJson);
  const data = res?.contacts;
  const mutate = async (update?: (list: Contact[] | undefined) => Contact[] | undefined, opts?: { revalidate: boolean }) =>
    refresh(update ? (r) => (r ? { ...r, contacts: update(r.contacts) ?? [] } : r) : undefined, opts);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ emailSent: boolean }>('/api/student/guardians', { method: 'POST', body: JSON.stringify({ email, name }) });
      toast.success(r.emailSent ? `We emailed ${email} to confirm.` : 'Added. The confirmation email couldn’t be sent right now; remove and add them again later.');
      setEmail(''); setName('');
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Contact, key: 'weeklyDigest' | 'absenceAlerts') => {
    const next = !c[key];
    await mutate((list) => list?.map((x) => (x.id === c.id ? { ...x, [key]: next } : x)), { revalidate: false });
    try {
      await authedJson(`/api/student/guardians/${c.id}`, { method: 'PATCH', body: JSON.stringify({ [key]: next }) });
    } catch (err) {
      toast.error((err as Error).message);
      mutate();
    }
  };

  const remove = async (c: Contact) => {
    if (!(await confirmDialog({ title: `Stop updating ${c.name || c.email}?`, message: 'They won’t get any more emails from UniVerse about you.', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await authedJson(`/api/student/guardians/${c.id}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Hidden until the school switches guardian emails on (they all go out by email).
  if (res && !res.enabled) return null;

  return (
    <div className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
          <Mail className="w-6 h-6 text-white" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Keep a parent or guardian updated</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            They get a short weekly email (grades, attendance, what&apos;s due) and an email if you&apos;re marked absent. They confirm first, and you or they can stop it at any time.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-16 rounded-2xl skeleton" />
      ) : (
        !!data?.length && (
          <ul className="space-y-3">
            {data.map((c) => (
              <li key={c.id} className="rounded-2xl border border-zinc-200 dark:border-white/10 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-white truncate">{c.name || c.email}</p>
                    {c.name && <p className="text-xs text-zinc-500 truncate">{c.email}</p>}
                    <p className={`text-xs mt-1 flex items-center gap-1 ${c.confirmedAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {c.confirmedAt ? <><CheckCircle2 className="w-3.5 h-3.5" /> Confirmed</> : <><Clock className="w-3.5 h-3.5" /> Waiting for them to confirm from their email</>}
                    </p>
                  </div>
                  <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c.name || c.email}`} className="p-2 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={c.weeklyDigest} onChange={() => toggle(c, 'weeklyDigest')} /> Weekly progress email</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={c.absenceAlerts} onChange={() => toggle(c, 'absenceAlerts')} /> Absence alerts</label>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {(data?.length ?? 0) < 3 && (
        <form onSubmit={add} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input aria-label="Their name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name (optional)" className="input" />
          <input aria-label="Their email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="parent@example.com" className="input" />
          <button type="submit" className="btn-primary" disabled={busy} aria-busy={busy || undefined}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add</button>
        </form>
      )}
    </div>
  );
}
