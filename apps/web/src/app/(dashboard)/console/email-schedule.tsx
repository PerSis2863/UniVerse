'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { OWNER_EMAILS, parseEmailSchedule, type EmailEvery, type OwnerEmail } from '@/lib/feature-switches';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { errorMessage, fetcher } from './shared';

// How often the owner's emails come (src/lib/feature-switches.ts OWNER_EMAILS): daily, weekly
// (Mondays), monthly (the 1st) or off. Weekly and monthly emails cover the whole period.

const WORD: Record<EmailEvery, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', off: 'Off' };

function useSchedule() {
  const { data, mutate } = useSWR<{ control: { switches: string | null } }>('/owner/server', fetcher);
  const schedule = parseEmailSchedule(data?.control.switches);
  const set = async (id: OwnerEmail['id'], every: EmailEvery) => {
    await api.post('/owner/server', { emails: { [id]: every } });
    await mutate();
  };
  return { ready: !!data, schedule, set };
}

/** One email's daily / weekly / monthly / off choice. */
export function EmailEvery({ email, value, onPick }: { email: OwnerEmail; value: EmailEvery; onPick: (v: EmailEvery) => Promise<void> }) {
  const [busy, setBusy] = useState<EmailEvery | null>(null);
  const pick = async (v: EmailEvery) => {
    if (v === value || busy) return;
    setBusy(v);
    try {
      await onPick(v);
      toast.success(v === 'off' ? `${email.label} email turned off` : `${email.label} email: ${WORD[v].toLowerCase()}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex p-1 rounded-xl bg-zinc-100 dark:bg-white/[0.05]" role="radiogroup" aria-label={`${email.label} email`}>
      {email.options.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => void pick(v)}
          className={cn('relative flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors', value === v ? (v === 'off' ? 'text-rose-600 dark:text-rose-300' : 'text-white') : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white')}>
          {value === v && <motion.span layoutId={`every-${email.id}`} transition={spring.snappy} className={cn('absolute inset-0 rounded-lg shadow-sm', v === 'off' ? 'bg-white dark:bg-white/10' : 'bg-indigo-600')} />}
          <span className="relative inline-flex items-center justify-center gap-1">{busy === v && <Loader2 className="w-3 h-3 animate-spin" />}{WORD[v]}</span>
        </button>
      ))}
    </div>
  );
}

/** Server tab: all the owner's emails and how often each comes. */
export function EmailScheduleCard({ className }: { className?: string }) {
  const { ready, schedule, set } = useSchedule();
  return (
    <div className={className}>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Mail className="w-4 h-4 text-indigo-500" /> Your emails</h2>
      <p className="text-sm text-zinc-500 mt-1 mb-4">How often each email comes to you. Weekly ones arrive on Mondays and monthly ones on the 1st, covering the whole period. Fewer emails also save your Resend allowance.</p>
      {!ready ? <div className="space-y-3">{OWNER_EMAILS.map((e) => <div key={e.id} className="h-16 rounded-xl skeleton" />)}</div> : (
        <ul className="space-y-3">
          {OWNER_EMAILS.map((e) => (
            <li key={e.id} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-zinc-900 dark:text-white">{e.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{e.hint}</p>
              </div>
              <div className="sm:w-64 shrink-0"><EmailEvery email={e} value={schedule[e.id]} onPick={(v) => set(e.id, v)} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Health tab: just the security email. */
export function SecurityEmailSchedule() {
  const { ready, schedule, set } = useSchedule();
  if (!ready) return null;
  const email = OWNER_EMAILS.find((e) => e.id === 'security')!;
  return (
    <div className="tone-panel rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center"><Mail className="w-5 h-5 text-white" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">Security email</p>
        <p className="text-xs text-zinc-500">This check, emailed to you weekly (Mondays) or monthly (the 1st).</p>
      </div>
      <div className="sm:w-56 shrink-0"><EmailEvery email={email} value={schedule.security} onPick={(v) => set('security', v)} /></div>
    </div>
  );
}
