'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';

// The page a parent or guardian opens from their emails (src/server/guardians.ts): confirm the
// updates, choose which ones, or stop them. No account needed; the link is their key.

interface State { student: string; email: string; confirmed: boolean; weeklyDigest: boolean; absenceAlerts: boolean }

export default function GuardianUpdatesPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/guardian-contact/${encodeURIComponent(token)}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || 'This link is no longer valid.'); setState(b); })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/guardian-contact/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Something went wrong.');
      if (b.stopped) setStopped(true); else setState(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-[#0b0b0d]">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 space-y-5 shadow-xl">
        <p className="text-base font-bold text-zinc-900 dark:text-white">UniVerse <span className="text-indigo-500">Impact</span></p>
        {error ? (
          <p className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400"><XCircle className="w-5 h-5 shrink-0" /> {error}</p>
        ) : stopped ? (
          <p className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> Done. You won&apos;t get any more emails about this student.</p>
        ) : !state ? (
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Mail className="w-6 h-6 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-zinc-900 dark:text-white">Updates about {state.student}</h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Sent to {state.email}</p>
              </div>
            </div>
            {state.confirmed ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> You&apos;re getting updates.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{state.student} added you as a parent or guardian. Confirm to get their weekly progress and absence alerts.</p>
                <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => send({ action: 'confirm' })}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm updates</button>
              </>
            )}
            {state.confirmed && (
              <div className="space-y-2 text-sm text-zinc-800 dark:text-zinc-200">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" disabled={busy} checked={state.weeklyDigest} onChange={(e) => send({ weeklyDigest: e.target.checked })} /> Weekly progress email</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" disabled={busy} checked={state.absenceAlerts} onChange={(e) => send({ absenceAlerts: e.target.checked })} /> Email me if they&apos;re marked absent</label>
              </div>
            )}
            <button type="button" className="text-sm text-zinc-500 hover:text-rose-500" disabled={busy} onClick={() => send({ action: 'stop' })}>{state.confirmed ? 'Stop all updates' : 'I don’t know this student'}</button>
          </>
        )}
      </div>
    </main>
  );
}
