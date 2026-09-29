'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

type Me = { emailNotifications?: boolean };

/** The signed-in user's "email me" setting, saved straight away. Works for every role. */
export function EmailNotificationsSwitch({ compact = false }: { compact?: boolean }) {
  const { data, mutate } = useSWR<Me>('/api/me', authedJson);
  const on = data?.emailNotifications ?? true;

  const toggle = async () => {
    const next = !on;
    await mutate({ ...data, emailNotifications: next }, { revalidate: false });
    try {
      await authedJson('/api/me', { method: 'PATCH', body: JSON.stringify({ emailNotifications: next }) });
      toast.success(next ? 'Email notifications turned on' : 'Email notifications turned off');
    } catch {
      await mutate({ ...data, emailNotifications: on }, { revalidate: false });
      toast.error('Could not save your email preference');
    }
  };

  return (
    <div className={cn('flex items-center justify-between gap-3', compact ? 'px-6 py-3 border-t border-zinc-200/70 dark:border-white/[0.06]' : 'p-4 rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.02]')}>
      <div className="flex items-start gap-3 min-w-0">
        <Mail className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">Email notifications</p>
          {!compact && <p className="text-xs text-zinc-500 mt-0.5">New grades, credential decisions, messages you miss and quizzes due tomorrow.</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Email notifications"
        disabled={!data}
        onClick={toggle}
        className={cn('relative w-11 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-white/10')}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
      </button>
    </div>
  );
}
