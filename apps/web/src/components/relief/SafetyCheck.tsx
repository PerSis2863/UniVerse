'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LifeBuoy, Loader2, ShieldCheck, Siren } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useActivePoll } from '@/lib/realtime-client';

// M150: the "I'm safe" check-in. While an organisation has declared an emergency, Relief shows it at the
// top: "I'm safe" (tell the people you choose, only from your conversations) and "I need help" (a
// request on the map). People who told you they're safe are listed under it; nobody else sees.

export interface Incident {
  id: string; title: string; place: string | null; endsAt: string; org: { id: string; name: string } | null;
  safeAt: string | null; told: number; safeContacts: { name: string; at: string }[]; canEnd: boolean;
  /** M155: for its coordinators, how many said they're safe (never who); null for everyone else. */
  safeCount?: number | null;
}

export function SafetyCheck({ here, onNeedHelp }: { here: { lat: number; lng: number } | null; onNeedHelp: () => void }) {
  // Only the emergencies that concern this person (their organisations, their alert's area, where they
  // are when the browser already shared it, rounded here and again on the server).
  const key = here ? `/relief/incidents?lat=${here.lat.toFixed(2)}&lng=${here.lng.toFixed(2)}` : '/relief/incidents';
  const { data, mutate } = useSWR<{ incidents: Incident[] }>(key, fetcher, { refreshInterval: useActivePoll(60_000), keepPreviousData: true });
  const [telling, setTelling] = useState<Incident | null>(null);
  if (!data?.incidents.length) return null;
  return (
    <div className="space-y-3">
      {data.incidents.map((i) => (
        <section key={i.id} aria-label={`Emergency: ${i.title}`} className="drop-in rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="pulse-ring w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-rose-600 text-white" aria-hidden><Siren className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-900 dark:text-white">{i.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{[i.place, i.org ? `declared by ${i.org.name}` : null, `until ${format(new Date(i.endsAt), 'EEE d MMM, HH:mm')}`].filter(Boolean).join(' · ')}</p>
              {i.safeContacts.length > 0 && (
                <p className="mt-1.5 text-sm text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5"><ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  <span>{i.safeContacts.slice(0, 3).map((c) => c.name).join(', ')}{i.safeContacts.length > 3 ? ` and ${i.safeContacts.length - 3} more` : ''} told you they’re safe.</span>
                </p>
              )}
              {i.safeAt && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">You said you’re safe{i.told ? `; ${i.told} ${i.told === 1 ? 'person was' : 'people were'} told` : ''}.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTelling(i)} className={i.safeAt ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}><ShieldCheck className="w-4 h-4" aria-hidden />{i.safeAt ? 'Tell more people' : 'I’m safe'}</button>
              <button type="button" onClick={onNeedHelp} className="btn-secondary btn-sm"><LifeBuoy className="w-4 h-4" aria-hidden />I need help</button>
            </div>
          </div>
        </section>
      ))}
      {telling && <TellSheet incident={telling} onClose={() => setTelling(null)} onDone={() => { setTelling(null); void mutate(); }} />}
    </div>
  );
}

function TellSheet({ incident, onClose, onDone }: { incident: Incident; onClose: () => void; onDone: () => void }) {
  const { data } = useSWR<{ contacts: { id: string; name: string }[] }>('/relief/contacts', fetcher);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (data?.contacts ?? []).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const flip = (id: string) => setChosen((s) => { const t = new Set(s); if (t.has(id)) t.delete(id); else if (t.size < 20) t.add(id); return t; });
  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/relief/incidents/${incident.id}/safe`, { tell: [...chosen] });
      toast.success(chosen.size ? `Told ${chosen.size} ${chosen.size === 1 ? 'person' : 'people'} you’re safe` : 'Marked safe');
      onDone();
    } catch (err) { toast.error(errorMessage(err, 'Could not send it.')); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Tell people you’re safe" onClose={onClose} footer={
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-xs text-zinc-500 dark:text-zinc-400">Only the people you tick are told.</p>
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button type="button" onClick={() => void send()} disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}{chosen.size ? `Tell ${chosen.size}` : 'Just mark me safe'}</button>
      </div>
    }>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{incident.title}. Pick from the people you have a conversation with on UniVerse (20 at a time).</p>
      {!data ? <div className="mt-4 h-24 rounded-xl skeleton" /> : data.contacts.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">You have no conversations yet. Start one in Messages, or just mark yourself safe.</p>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone" className="input mt-4" />
          <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-zinc-200/70 dark:divide-white/[0.07]" tabIndex={0} aria-label="Your conversations">
            {list.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 py-2.5 px-1 cursor-pointer text-sm text-zinc-900 dark:text-white">
                  <input type="checkbox" checked={chosen.has(c.id)} onChange={() => flip(c.id)} className="w-4 h-4 accent-indigo-600" /><span translate="no">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
