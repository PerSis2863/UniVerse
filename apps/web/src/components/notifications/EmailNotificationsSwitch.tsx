'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/Switch';

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
    <div className={cn('flex items-center justify-between gap-3', compact ? 'px-5 py-3' : 'p-4 rounded-2xl bg-[var(--surface-2)] dark:bg-white/[0.04]')}>
      <div className="flex items-start gap-3 min-w-0">
        <Mail className="w-4 h-4 mt-0.5 text-tint-text shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">Email notifications</p>
          {!compact && <p className="text-xs text-zinc-500 mt-0.5">New grades, credential decisions, messages you miss and quizzes due tomorrow.</p>}
        </div>
      </div>
      <Switch checked={on} label="Email notifications" disabled={!data} onChange={() => void toggle()} />
    </div>
  );
}
