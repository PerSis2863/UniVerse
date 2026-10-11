'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { VideoOff } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { Switch } from '@/components/ui/Switch';

// "Don't show me in call recordings" (Stage 5 · B8.9): whoever records a call gets my initials
// instead of my camera. My voice is still recorded if I speak.

type Me = { noRecording?: boolean };

export function RecordingPrivacy() {
  const { data, mutate } = useSWR<Me>('/api/me', authedJson);
  const on = data?.noRecording ?? false;
  const toggle = async () => {
    const next = !on;
    await mutate({ ...data, noRecording: next }, { revalidate: false });
    try {
      await authedJson('/api/me', { method: 'PATCH', body: JSON.stringify({ noRecording: next }) });
      toast.success(next ? 'You won’t be shown in call recordings' : 'You can be shown in call recordings again');
    } catch {
      await mutate({ ...data, noRecording: on }, { revalidate: false });
      toast.error('Could not save that');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--surface-2)] dark:bg-white/[0.04]">
      <div className="flex items-start gap-3 min-w-0">
        <VideoOff className="w-4 h-4 mt-0.5 text-tint-text shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white">Don’t show me in call recordings</p>
          <p className="text-xs text-zinc-500 mt-0.5">Recordings show your initials instead of your camera. Your voice is still recorded if you speak. Applies from your next call.</p>
        </div>
      </div>
      <Switch checked={on} label="Don’t show me in call recordings" disabled={!data} onChange={() => void toggle()} />
    </div>
  );
}
