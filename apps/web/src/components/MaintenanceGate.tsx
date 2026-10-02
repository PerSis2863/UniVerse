'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';

type Closed = { title: string; message: string; back: string | null };

/**
 * On the sign-in and sign-up pages: while UniVerse is in maintenance (or paused), shows that
 * instead of the form, so nobody signs in to an app that won't let them in. Asks the Worker
 * (cloudflare/usage-guard.ts), which answers without the database. /login?owner keeps the form.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [closed, setClosed] = useState<Closed | null>(null);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('owner')) return;
    let gone = false;
    fetch('/api/server-state', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ({ closed?: boolean } & Closed) | null) => {
        if (gone || !s?.closed) return;
        setClosed({ title: s.title, message: s.message, back: s.back });
      })
      .catch(() => {});
    return () => { gone = true; };
  }, []);

  if (!closed) return <>{children}</>;
  const back = closed.back ? new Date(closed.back) : null;
  return (
    <div className="w-full max-w-md mx-auto text-center">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-8 sm:p-10"
        style={{ background: 'radial-gradient(120% 70% at 0% 0%, rgba(99,102,241,0.32), transparent 70%), radial-gradient(120% 70% at 100% 100%, rgba(192,38,211,0.24), transparent 70%), #0d1020' }}>
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-indigo-500/30">
          <Wrench className="w-8 h-8 text-white" />
        </div>
        <p className="mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Server under maintenance
        </p>
        <h1 className="mt-4 text-2xl font-black text-white">{closed.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{closed.message}</p>
        <p className="mt-2 text-sm text-zinc-400">
          {back && !Number.isNaN(back.getTime())
            ? `Sign in and sign up open again by ${back.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
            : 'Sign in and sign up are closed until we’re done. Please try again a little later.'}
        </p>
        <button onClick={() => location.reload()} className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/25">
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    </div>
  );
}
