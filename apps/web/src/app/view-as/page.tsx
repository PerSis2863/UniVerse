'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Eye } from 'lucide-react';
import Link from '@/components/ui/Link';
import { homeFor } from '@/lib/role-home';
import { startViewAs } from '@/lib/view-as';

// Stage 5 · Q19 "View as" (owner support): the owner console opens this page in a new tab with a
// 30-minute, read-only session token after the #. It is kept in this tab only (src/lib/view-as.ts),
// then the app opens as that person. Also the page shown when it ends or runs out.

type Me = { id: string; name?: string; email: string; role: string; status?: string; createdAt?: string; avatar?: string | null; permissions?: string[] };
const noopSubscribe = () => () => {};
// Read once: the token leaves the address bar as soon as it's read.
let opened: { state: string; token: string } | null = null;
const readOpened = () => {
  if (opened) return opened;
  const q = new URLSearchParams(location.search);
  const token = decodeURIComponent(location.hash.slice(1));
  opened = { state: q.has('expired') ? 'expired' : q.has('ended') ? 'ended' : token.startsWith('ut1.') ? 'opening' : 'none', token };
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return opened;
};
const readState = () => readOpened().state;

export default function ViewAsPage() {
  const state = useSyncExternalStore(noopSubscribe, readState, () => 'loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'opening') return;
    const { token } = readOpened();
    void (async () => {
      try {
        const res = await fetch('/api/core/users/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(res.status === 401 ? 'This link has run out. Open “View as” again from the console.' : 'Couldn’t open their account.');
        const me = (await res.json()) as Me;
        const account = {
          id: me.id, name: me.name || 'Student', email: me.email, role: me.role, status: me.status || 'ACTIVE',
          createdAt: me.createdAt || new Date().toISOString(), avatar: me.avatar || undefined, application: null, owner: false, permissions: me.permissions,
        };
        startViewAs(token, { name: account.name }, account);
        location.replace(homeFor(account));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [state]);

  const title = error ? 'Couldn’t open the view'
    : state === 'expired' ? 'The 30 minutes are up'
    : state === 'ended' ? 'View as has ended'
    : state === 'opening' ? 'Opening their view…'
    : 'View as';
  const text = error ?? (state === 'expired' || state === 'ended'
    ? 'This tab is back to your own account. You can close it, or open “View as” again from the console.'
    : state === 'opening' ? 'Read-only: you see what they see, but nothing can be changed and their private messages stay private.'
    : 'Open “View as” from a person or school in the owner console.');

  return (
    <main className="min-h-[100dvh] grid place-items-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/10">
        <Eye className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300" aria-live="polite">{text}</p>
        {state !== 'opening' || error ? (
          <Link href="/console" className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500">
            Back to the console
          </Link>
        ) : null}
      </div>
    </main>
  );
}
