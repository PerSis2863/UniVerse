'use client';

import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';
import { Laptop, Loader2, LogIn, LogOut, MonitorSmartphone, Smartphone, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';

interface SignIn { id: string; kind: 'SIGN_IN' | 'SIGN_UP' | 'SESSION'; method: string | null; ip: string | null; country: string | null; city: string | null; device: string | null; createdAt: string }

const KIND = { SIGN_IN: 'Signed in', SIGN_UP: 'Created the account', SESSION: 'Opened UniVerse' } as const;
const METHOD: Record<string, string> = { google: 'with Google', password: 'with email and password', phone: 'with phone number', apple: 'with Apple', demo: '(demo account)' };
const regionName = (code: string | null) => {
  if (!code || code === 'XX' || code === 'T1') return null;
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** The signed-in person's own recent sign-ins, so they can spot any that weren't them. */
export function RecentSignIns() {
  const { data, isLoading, error } = useSWR<SignIn[]>('/auth/sessions', (url: string) => api.get(url).then((r) => r.data));
  const [busy, setBusy] = useState(false);
  // Every device, this one included, has to sign in again (src/server/modules/auth.ts).
  const signOutEverywhere = async () => {
    if (!(await confirmDialog({ title: 'Sign out on all devices?', message: 'Every phone, tablet and computer signed in to your account is signed out, including this one. Then sign in again.', confirmLabel: 'Sign out everywhere', destructive: true }))) return;
    setBusy(true);
    try {
      await api.post('/auth/sign-out-everywhere');
      const { auth } = await import('@/lib/firebase');
      await auth.signOut().catch(() => {});
      for (const k of ['accessToken', 'refreshToken', 'universe-auth', 'uv-pass']) localStorage.removeItem(k);
      window.location.href = '/login';
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-zinc-900 dark:text-white">Recent sign-ins</h3>
        <p className="text-sm text-zinc-500">If you see one that wasn&apos;t you, sign out everywhere and change your password.</p>
      </div>
      <button onClick={() => void signOutEverywhere()} disabled={busy} aria-busy={busy || undefined} className="btn-secondary">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Sign out on all devices
      </button>
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      ) : error ? (
        <p className="text-sm text-rose-500">Could not load your sign-ins.</p>
      ) : !data?.length ? (
        <p className="text-sm text-zinc-500">No sign-ins recorded yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-200 dark:border-white/[0.06]">
          {data.map((s) => {
            const Icon = s.kind === 'SIGN_UP' ? UserPlus : s.kind === 'SIGN_IN' ? LogIn : /iPhone|Android/.test(s.device ?? '') ? Smartphone : /Windows|Mac|Linux|Chromebook/.test(s.device ?? '') ? Laptop : MonitorSmartphone;
            const place = [s.city, regionName(s.country)].filter(Boolean).join(', ');
            return (
              <li key={s.id} className="flex gap-3 p-3">
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
                <div className="min-w-0 text-sm">
                  <p className="text-zinc-900 dark:text-white">
                    {KIND[s.kind] ?? s.kind}
                    {s.method && <span className="text-zinc-500"> {METHOD[s.method] ?? ''}</span>}
                  </p>
                  <p className="text-xs text-zinc-500">{[s.device, place, s.ip].filter(Boolean).join(' · ')}</p>
                </div>
                <time className="ml-auto shrink-0 text-xs text-zinc-400" dateTime={s.createdAt} title={new Date(s.createdAt).toLocaleString()}>
                  {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
