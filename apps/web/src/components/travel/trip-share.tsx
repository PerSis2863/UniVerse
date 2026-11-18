'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Copy, HeartHandshake, Link2, Link2Off, RefreshCw, Share2, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';

// M248: "Share my trip with family" (the trip page's Share part): a read-only live link to the plan (/journey/<code>)
// that anyone on the trip can turn on, renew or turn off, and "I'm safe" check-ins that reach the others on the trip
// and the family page (and, linked to Relief's check-in, mark you safe in an emergency declared around today's city).

interface Share { code: string | null; checkins: { id: string; by: string; note: string | null; place: string | null; at: string }[] }

export function TripShare({ tripId, name }: { tripId: string; name: string }) {
  const key = `/travel/trips/${tripId}/share`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<Share>(key, fetcher, { refreshInterval });
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const link = data?.code && typeof window !== 'undefined' ? `${location.origin}/journey/${data.code}` : '';
  const act = async (call: () => Promise<unknown>, ok?: string) => { try { await call(); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } await mutate(); };
  const safe = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post<{ place: string | null; relief: string[] }>(`/travel/trips/${tripId}/safe`, { note });
      setNote('');
      toast.success(`Checked in${r.place ? ` in ${r.place}` : ''}: everyone on the trip${data?.code ? ' and your family link' : ''} can see you’re safe.${r.relief.length ? ` Also marked safe in Relief’s “${r.relief[0]}”.` : ''}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t check in.')); }
    setBusy(false);
    await mutate();
  };
  const send = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: name, text: `Follow “${name}”: the plan and where we are`, url: link }); return; }
      await navigator.clipboard.writeText(link); toast.success('Link copied.');
    } catch { /* closed the share sheet */ }
  };
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="panel p-5" aria-labelledby="share-h">
        <h3 id="share-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><HeartHandshake className="h-5 w-5 text-indigo-500" aria-hidden />Share with family</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">A page for people at home: the cities, each day’s plan, where you are today, your check-ins and the journal entries you left in. Read-only, no sign-in, first names only.</p>
        {!data ? null : data.code ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 max-w-full truncate rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200">{link}</code>
              <button type="button" onClick={() => void send()} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Share2 className="h-4 w-4" aria-hidden />Send</button>
              <button type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success('Link copied.'))} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Copy className="h-4 w-4" aria-hidden />Copy</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => void act(() => api.post(key), 'New link made: the old one stopped working.')} className="btn-ghost btn-sm inline-flex items-center gap-1.5"><RefreshCw className="h-4 w-4" aria-hidden />New link</button>
              <button type="button" onClick={() => void act(() => api.delete(key), 'The family link is off.')} className="btn-ghost btn-sm inline-flex items-center gap-1.5 text-red-600 dark:text-red-400"><Link2Off className="h-4 w-4" aria-hidden />Turn off</button>
            </div>
          </>
        ) : <button type="button" onClick={() => void act(() => api.post(key), 'Family link on.')} className="btn-primary btn-sm mt-3 inline-flex items-center gap-1.5"><Link2 className="h-4 w-4" aria-hidden />Turn on the family link</button>}
      </section>

      <section className="panel p-5" aria-labelledby="safe-h">
        <h3 id="safe-h" className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white"><ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />I’m safe</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">One tap tells everyone on the trip{data?.code ? ' and your family link' : ''} you’re fine, with today’s city.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1"><span className="sr-only">A note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Landed, all good (optional)" className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" />
          </label>
          <button type="button" onClick={() => void safe()} disabled={busy} className="btn-primary inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden />{busy ? 'Checking in…' : 'I’m safe'}</button>
        </div>
        {data && (data.checkins.length ? (
          <ul className="mt-4 divide-y divide-zinc-200/70 dark:divide-white/10">
            {data.checkins.map((c) => (
              <li key={c.id} className="py-2 text-sm">
                <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{c.by}</span> <span className="text-zinc-600 dark:text-zinc-300">{c.by === 'You' ? 'are' : 'is'} safe{c.place ? ` in ${c.place}` : ''} · {formatDistanceToNow(new Date(c.at), { addSuffix: true })}</span>
                {c.note && <p className="text-zinc-700 dark:text-zinc-200" translate="no">{c.note}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No check-ins yet.</p>)}
      </section>
    </div>
  );
}
