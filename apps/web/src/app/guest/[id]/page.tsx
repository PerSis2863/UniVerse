'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { DoorOpen, Loader2, ShieldCheck, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { CallView } from '@/components/call/CallView';
import { spring } from '@/lib/motion';

// Joining a call link as a guest, without an account (Stage 4 · 2.11; src/server/calls.ts guest
// links): type your name, then wait until a host lets you in. The link was made by the call link's
// creator and expires; guests don't see the call's earlier chat.

const NAME_KEY = 'universe:guest-name';

function GuestJoin({ id }: { id: string }) {
  const token = useSearchParams().get('g') ?? '';
  const [state, setState] = useState<'checking' | 'ok' | 'bad'>('checking');
  const [name, setName] = useState('');
  const [guest, setGuest] = useState<{ token: string } | null>(null);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    let off = false;
    try { const saved = localStorage.getItem(NAME_KEY); if (saved) queueMicrotask(() => { if (!off) setName(saved); }); } catch { /* private mode */ }
    fetch(`/api/guest/link?call=${encodeURIComponent(id)}&g=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((r: { ok: boolean }) => { if (!off) setState(r.ok ? 'ok' : 'bad'); })
      .catch(() => { if (!off) setState('bad'); });
    return () => { off = true; };
  }, [id, token]);

  const join = () => {
    const clean = name.trim();
    if (clean.length < 2) return;
    try { localStorage.setItem(NAME_KEY, clean); } catch { /* private mode */ }
    setLeft(false);
    setGuest({ token });
  };

  if (guest && !left) return <CallView callId={id} myName={name.trim()} guest={guest} onLeave={() => setLeft(true)} />;

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#0b0e1a_60%)] text-white">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
        className="w-full max-w-sm rounded-3xl bg-white/[0.06] border border-white/10 backdrop-blur-xl p-6 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20"><Video className="w-6 h-6" /></div>
        {left ? (
          <>
            <h1 className="mt-4 text-xl font-semibold">You left the call</h1>
            <p className="mt-1 text-sm text-zinc-400">You can go back in while the link works. The host lets you in again.</p>
            <button type="button" onClick={join} className="mt-5 w-full h-11 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 font-semibold">Rejoin</button>
          </>
        ) : state === 'checking' ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-zinc-300"><Loader2 className="w-4 h-4 animate-spin" />Checking the link…</p>
        ) : state === 'bad' ? (
          <>
            <h1 className="mt-4 text-xl font-semibold">This link doesn’t work any more</h1>
            <p className="mt-1 text-sm text-zinc-400">Guest links expire. Ask whoever invited you for a new one.</p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold">Join the call as a guest</h1>
            <p className="mt-1 text-sm text-zinc-400">No account needed. Type your name; the host lets you in.</p>
            <form onSubmit={(e) => { e.preventDefault(); join(); }} className="mt-5 space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus placeholder="Your name" aria-label="Your name" autoComplete="name"
                className="w-full h-12 rounded-2xl bg-white/10 px-4 text-[15px] placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-indigo-400/60" />
              <button type="submit" disabled={name.trim().length < 2} className="w-full h-12 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"><DoorOpen className="w-4 h-4" />Join as guest</button>
            </form>
            <p className="mt-4 text-xs text-zinc-500 flex items-start gap-1.5"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />Everyone in the call sees “(guest)” next to your name. You won’t see messages from before you joined.</p>
            <p className="mt-3 text-xs text-zinc-500">Have a UniVerse account? <Link href={`/call/${id}`} className="text-indigo-300 hover:underline">Join signed in</Link></p>
          </>
        )}
      </motion.div>
    </main>
  );
}

export default function GuestJoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={null}><GuestJoin id={id} /></Suspense>;
}
