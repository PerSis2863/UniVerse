'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Loader2, ShieldCheck, X } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

interface Me { name: string; email: string; phone: string | null; role: string; status: string; department: string | null }
const HIDE_KEY = 'universe-setup-card-hidden';

/**
 * "Finish setting up your account" checklist, shown on dashboards while something is incomplete.
 * Everything here is real: email verification comes from Firebase, the rest from the database.
 */
export function AccountSetupCard() {
  const { data, mutate } = useSWR<Me>('/api/me', authedJson);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState<'phone' | 'department' | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [checked, setChecked] = useState(false); // email check finished (the card appears once, complete)

  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { setHidden(false); }
    (async () => {
      try {
        // Demo and LMS sessions have no Firebase account: nothing to verify, and no need to load it.
        const token = localStorage.getItem('accessToken') ?? '';
        if (token.startsWith('mock-token-') || token.startsWith('ut1.')) { setEmailVerified(null); return; }
        const { auth } = await import('@/lib/firebase');
        await auth.authStateReady();
        await auth.currentUser?.reload().catch(() => {});
        setEmailVerified(auth.currentUser ? auth.currentUser.emailVerified : null);
      } catch {
        setEmailVerified(null);
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  if (!data || hidden || !checked) return null;

  const needsDepartment = data.role === 'STUDENT' || data.role === 'TEACHER';
  const steps = [
    emailVerified !== null && { key: 'email', label: 'Verify your email', done: emailVerified, hint: data.email },
    { key: 'phone', label: 'Add your phone number', done: !!data.phone, hint: data.phone || 'Used for account recovery and campus alerts' },
    needsDepartment && { key: 'department', label: 'Add your department', done: !!data.department, hint: data.department || 'Helps classmates and teachers find you' },
    data.role !== 'ADMIN' && { key: 'approval', label: 'Account approved', done: data.status === 'ACTIVE', hint: data.status === 'ACTIVE' ? 'Approved by your campus admin' : 'Waiting for your campus admin to approve' },
  ].filter(Boolean) as { key: string; label: string; done: boolean; hint: string }[];

  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const sendVerification = async () => {
    setBusy(true);
    try {
      const { auth } = await import('@/lib/firebase');
      const { sendEmailVerification } = await import('firebase/auth');
      if (!auth.currentUser) throw new Error('Please sign in again.');
      await sendEmailVerification(auth.currentUser);
      toast.success('Verification email sent', { description: `Check ${data.email} and click the link, then refresh this page.` });
    } catch (e: any) {
      toast.error(e?.code === 'auth/too-many-requests' ? 'Please wait a few minutes before requesting another email.' : e.message || 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!open || !value.trim()) return;
    setBusy(true);
    try {
      await authedJson('/api/me', { method: 'PATCH', body: JSON.stringify({ [open]: value.trim() }) });
      await mutate();
      toast.success(open === 'phone' ? 'Phone number saved' : 'Department saved');
      setOpen(null);
      setValue('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* storage unavailable */ }
  };

  const pct = Math.round((done / steps.length) * 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-indigo-200/70 dark:border-indigo-400/20 bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-5 md:p-6"
    >
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10 pointer-events-none" />
      <div className="relative flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg"><ShieldCheck className="w-5 h-5 text-white" /></span>
          <div>
            <h2 className="font-bold text-zinc-900 dark:text-white">Finish setting up your account</h2>
            <p className="text-xs text-zinc-500">{done} of {steps.length} done · unlocks collaboration features</p>
          </div>
        </div>
        <button onClick={hide} aria-label="Hide" className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="relative h-1.5 rounded-full bg-zinc-200 dark:bg-white/[0.08] overflow-hidden mb-4">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
      </div>
      <ul className="relative grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key} className={cn('p-3 rounded-2xl border', s.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-zinc-200 dark:border-white/[0.07] bg-white/50 dark:bg-white/[0.02]')}>
            <div className="flex items-start gap-3">
              {s.done ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', s.done ? 'text-zinc-500 line-through decoration-zinc-400/50' : 'text-zinc-900 dark:text-white')}>{s.label}</p>
                <p className="text-xs text-zinc-500 truncate">{s.hint}</p>
                {!s.done && s.key === 'email' && (
                  <button onClick={sendVerification} aria-busy={busy || undefined} disabled={busy} className="mt-2 text-xs font-semibold text-indigo-500 hover:text-indigo-400 disabled:opacity-50">Send verification email</button>
                )}
                {!s.done && (s.key === 'phone' || s.key === 'department') && open !== s.key && (
                  <button onClick={() => { setOpen(s.key as 'phone' | 'department'); setValue(''); }} className="mt-2 text-xs font-semibold text-indigo-500 hover:text-indigo-400">Add now</button>
                )}
              </div>
            </div>
            <AnimatePresence>
              {open === s.key && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="flex gap-2 mt-3">
                    <input
                      autoFocus
                      type={s.key === 'phone' ? 'tel' : 'text'}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      placeholder={s.key === 'phone' ? '+91 98765 43210' : 'e.g. Computer Science'}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                    <button onClick={save} disabled={busy || !value.trim()} className="btn-primary btn-sm">
                      {busy && <Loader2 className="w-3 h-3 animate-spin" />} Save
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
