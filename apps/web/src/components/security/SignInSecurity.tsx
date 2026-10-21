'use client';

import useSWR from 'swr';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Fingerprint, Laptop, Loader2, LogOut, MonitorSmartphone, Plus, Smartphone, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/components/ui/Dialogs';
import { addPasskey, passkeyError, usePasskeysSupported } from '@/lib/passkey-client';

// Settings → Privacy & Security (Stage 5 · A8): passkeys (sign in with the device's fingerprint,
// face or PIN) and the devices signed in to the account, each with "Sign out" (src/server/modules/auth.ts).

interface Passkey { id: string; name: string; createdAt: string; lastUsedAt: string | null }
interface Device { sessionAt: number; device: string | null; method: string | null; place: string | null; signedInAt: string; lastSeenAt: string; current: boolean }

const get = <T,>(url: string) => api.get<T>(url).then((r) => r.data);
const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });
const METHOD: Record<string, string> = { google: 'Google', password: 'email and password', phone: 'phone number', apple: 'Apple', microsoft: 'Microsoft', sso: 'school sign-in', passkey: 'a passkey', demo: 'demo account' };

export function Passkeys() {
  const { data, mutate, isLoading } = useSWR('/auth/passkeys', get<{ enabled: boolean; items: Passkey[] }>);
  const supported = usePasskeysSupported();
  const [busy, setBusy] = useState<string | null>(null);
  const titleId = useId(); // the settings page can show a section twice (phone layout)

  const add = async () => {
    setBusy('add');
    try {
      const key = await addPasskey();
      await mutate();
      toast.success('Passkey added', { description: `Next time, choose “Passkey” on the sign-in page (${key.name}).` });
    } catch (e) {
      toast.error(passkeyError(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (p: Passkey) => {
    if (!(await confirmDialog({ title: `Remove “${p.name}”?`, message: 'You won’t be able to sign in with it any more. Your other ways of signing in still work.', confirmLabel: 'Remove', destructive: true }))) return;
    setBusy(p.id);
    try {
      await api.delete(`/auth/passkeys/${p.id}`);
      await mutate();
      toast.success('Passkey removed');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 id={titleId} className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Fingerprint className="w-4 h-4 text-indigo-500" /> Passkeys</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Sign in with this device’s fingerprint, face or PIN: no password to type or steal. For admins it replaces the emailed code.</p>
      </div>
      {isLoading ? (
        <div className="h-12 rounded-xl skeleton" />
      ) : data && !data.enabled ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Passkeys aren’t switched on for this site yet.</p>
      ) : (
        <>
          {!!data?.items.length && (
            <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-200 dark:border-white/[0.06]">
              {data.items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <Fingerprint className="w-4 h-4 shrink-0 text-indigo-500" />
                  <div className="min-w-0 text-sm">
                    <p className="text-zinc-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Added {ago(p.createdAt)}{p.lastUsedAt ? ` · used ${ago(p.lastUsedAt)}` : ' · not used yet'}</p>
                  </div>
                  <button type="button" onClick={() => void remove(p)} disabled={!!busy} aria-label={`Remove ${p.name}`} className="ms-auto p-2 rounded-lg text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 min-w-11 min-h-11 inline-flex items-center justify-center">
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {supported === false ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">This browser can’t make passkeys. Try the UniVerse app or another browser on this device.</p>
          ) : (
            <button type="button" onClick={() => void add()} disabled={!!busy || supported === null} aria-busy={busy === 'add' || undefined} className="btn-secondary">
              {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add a passkey on this device
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function SignedInDevices() {
  const { data, mutate, isLoading, error } = useSWR('/auth/devices', get<Device[]>);
  const [busy, setBusy] = useState<number | null>(null);
  const titleId = useId();
  const signOut = async (d: Device) => {
    if (!(await confirmDialog({ title: `Sign out ${d.device ?? 'this device'}?`, message: 'It will have to sign in again to use your account. Other devices stay signed in.', confirmLabel: 'Sign out', destructive: true }))) return;
    setBusy(d.sessionAt);
    try {
      await api.post('/auth/devices/sign-out', { sessionAt: d.sessionAt });
      await mutate((list) => list?.filter((x) => x.sessionAt !== d.sessionAt), { revalidate: false });
      toast.success('Signed out', { description: 'That device has to sign in again (within a minute).' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div>
        <h3 id={titleId} className="font-semibold text-zinc-900 dark:text-white">Signed-in devices</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Each sign-in to your account. Sign out one you don’t recognise or no longer use.</p>
      </div>
      {isLoading ? (
        <div className="h-16 rounded-xl skeleton" />
      ) : error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load your devices.</p>
      ) : !data?.length ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No devices recorded yet. New sign-ins appear here.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05] rounded-xl border border-zinc-200 dark:border-white/[0.06]">
          {data.map((d) => {
            const Icon = /iPhone|Android/.test(d.device ?? '') ? Smartphone : /Windows|Mac|Linux|Chromebook/.test(d.device ?? '') ? Laptop : MonitorSmartphone;
            return (
              <li key={d.sessionAt} className="flex items-center gap-3 p-3">
                <Icon className="w-4 h-4 shrink-0 text-indigo-500" />
                <div className="min-w-0 text-sm">
                  <p className="text-zinc-900 dark:text-white">
                    {d.device ?? 'Unknown device'}
                    {d.current && <span className="ms-2 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">This device</span>}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {[d.place, `signed in ${ago(d.signedInAt)}${d.method ? ` with ${METHOD[d.method] ?? d.method}` : ''}`, `last seen ${ago(d.lastSeenAt)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!d.current && (
                  <button type="button" onClick={() => void signOut(d)} disabled={busy !== null} className="ms-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 min-h-11 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                    {busy === d.sessionAt ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
