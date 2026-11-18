'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BedDouble, CalendarRange, Check, Lock, MapPin, Plus, Trash2, Unlock, Vote, X } from 'lucide-react';
import { Fill } from '@/components/ui/Fill';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { cn } from '@/lib/utils';

// M243: a trip's group polls (the trip page's Votes part): ask the others which place, which dates, which stay; tap to
// vote, see who chose what, the leading choice; everyone's page updates at once.

type Kind = 'place' | 'date' | 'stay' | 'other';
interface Poll { id: string; kind: Kind; question: string; multi: boolean; closed: boolean; by: string; mine: boolean; options: { text: string; voters: string[] }[]; chosen: number[]; people: number }
const KINDS: { value: Kind; label: string; icon: typeof MapPin; ask: string }[] = [
  { value: 'place', label: 'A place', icon: MapPin, ask: 'Which place should we see?' },
  { value: 'date', label: 'Dates', icon: CalendarRange, ask: 'Which dates work for you?' },
  { value: 'stay', label: 'A stay', icon: BedDouble, ask: 'Where should we stay?' },
  { value: 'other', label: 'Anything', icon: Vote, ask: '' },
];

export function TripPolls({ tripId, ideas, owner }: { tripId: string; ideas: { place: string[]; date: string[] }; owner: boolean }) {
  const key = `/travel/trips/${tripId}/polls`;
  const refreshInterval = useLiveInterval(30_000, 0);
  const { data, mutate } = useSWR<{ polls: Poll[] }>(key, fetcher, { refreshInterval });
  const polls = useMemo(() => data?.polls ?? [], [data]);

  const vote = async (p: Poll, i: number) => {
    if (p.closed) return;
    const has = p.chosen.includes(i);
    const chosen = p.multi ? (has ? p.chosen.filter((c) => c !== i) : [...p.chosen, i]) : has ? [] : [i];
    // Shown at once: my name moves to the new choices.
    const next = polls.map((x) => (x.id !== p.id ? x : { ...x, chosen, options: x.options.map((o, j) => ({ ...o, voters: [...o.voters.filter((v) => v !== 'You'), ...(chosen.includes(j) ? ['You'] : [])] })) }));
    await mutate({ polls: next }, { revalidate: false });
    try { await api.post(`${key}/${p.id}/vote`, { choices: chosen }); } catch (e) { toast.error(errorMessage(e, 'Couldn’t vote.')); }
    await mutate();
  };
  const act = async (call: () => Promise<unknown>) => { try { await call(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } await mutate(); };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <NewPoll key={polls.length} url={key} ideas={ideas} onDone={() => void mutate()} />
      <div className="space-y-4">
        {!polls.length && data && <p className="panel p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">No polls yet. Ask the group: which day trip, which dates, which stay.</p>}
        {polls.map((p) => {
          const top = Math.max(0, ...p.options.map((o) => o.voters.length));
          const leaders = p.options.filter((o) => o.voters.length === top).length;
          const K = KINDS.find((k) => k.value === p.kind) ?? KINDS[3];
          return (
            <section key={p.id} data-key={p.id} className="panel p-5" aria-labelledby={`poll-${p.id}`}>
              <div className="flex items-start gap-3">
                <K.icon className="mt-1 h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 id={`poll-${p.id}`} className="text-lg font-semibold text-zinc-900 dark:text-white" translate="no">{p.question}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{p.by === 'You' ? 'You asked' : `${p.by} asked`} · {p.people} {p.people === 1 ? 'vote' : 'votes'}{p.multi ? ' · pick any' : ''}{p.closed ? ' · closed' : ''}</p>
                </div>
                {(p.mine || owner) && <>
                  <button type="button" className="btn-ghost btn-sm p-2" aria-label={p.closed ? 'Open the poll again' : 'Close the poll'} onClick={() => void act(() => api.patch(`${key}/${p.id}`, { closed: !p.closed }))}>{p.closed ? <Unlock className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}</button>
                  <button type="button" className="btn-ghost btn-sm p-2 text-red-600 dark:text-red-400" aria-label="Remove the poll" onClick={() => { if (confirm('Remove this poll and its votes?')) void act(() => api.delete(`${key}/${p.id}`)); }}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </>}
              </div>
              <ul className="mt-3 space-y-2">
                {p.options.map((o, i) => {
                  const on = p.chosen.includes(i), lead = top > 0 && o.voters.length === top && leaders === 1;
                  return (
                    <li key={i}>
                      <button type="button" disabled={p.closed} aria-pressed={on} onClick={() => void vote(p, i)}
                        className={cn('relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-start transition-[border-color] duration-150', on ? 'border-indigo-500' : 'border-zinc-200 dark:border-white/10', !p.closed && 'hover:border-indigo-400')}>
                        <span className="absolute inset-0 overflow-hidden" aria-hidden><Fill value={p.people ? o.voters.length / p.people : 0} className="bg-indigo-500 opacity-15" quick /></span>
                        <span className="relative flex items-center gap-2">
                          <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border', p.multi ? 'rounded-md' : 'rounded-full', on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-white/25')} aria-hidden>{on && <Check className="h-3.5 w-3.5" />}</span>
                          <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{o.text}</span>
                          {lead && <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{p.closed ? 'Chosen' : 'Leading'}</span>}
                          <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{o.voters.length}</span>
                        </span>
                        {o.voters.length > 0 && <span className="relative mt-1 block text-xs text-zinc-600 dark:text-zinc-300" translate="no">{o.voters.join(', ')}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NewPoll({ url, ideas, onDone }: { url: string; ideas: { place: string[]; date: string[] }; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('place');
  const [question, setQuestion] = useState(KINDS[0].ask), [options, setOptions] = useState<string[]>(['', '']), [multi, setMulti] = useState(false), [busy, setBusy] = useState(false);
  const pickKind = (k: Kind) => { setKind(k); setQuestion(KINDS.find((x) => x.value === k)!.ask); setMulti(k === 'date'); };
  const suggestions = (kind === 'place' ? ideas.place : kind === 'date' ? ideas.date : []).filter((s) => !options.includes(s)).slice(0, 8);
  const add = (text: string) => setOptions((o) => { const i = o.findIndex((x) => !x.trim()); return i >= 0 ? o.map((x, j) => (j === i ? text : x)) : o.length < 8 ? [...o, text] : o; });
  const send = async () => {
    setBusy(true);
    try { await api.post(url, { kind, question, options: options.filter((o) => o.trim()), multi }); toast.success('Poll sent to everyone on the trip.'); onDone(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t ask that.')); }
    setBusy(false);
  };
  return (
    <section className="panel space-y-3 p-5 xl:self-start" aria-labelledby="poll-new">
      <h3 id="poll-new" className="text-lg font-semibold text-zinc-900 dark:text-white">Ask the group</h3>
      <Segmented<Kind> label="What about" value={kind} onChange={pickKind} className="max-w-full overflow-x-auto" segments={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Question
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} className="mt-1 block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" placeholder="Ask anything" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Choices</legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input aria-label={`Choice ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-white" placeholder={kind === 'date' ? 'e.g. 8–12 April' : `Choice ${i + 1}`} />
            {options.length > 2 && <button type="button" className="btn-ghost btn-sm p-2" aria-label={`Remove choice ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}><X className="h-4 w-4" aria-hidden /></button>}
          </div>
        ))}
        {options.length < 8 && <button type="button" className="btn-ghost btn-sm inline-flex items-center gap-1.5" onClick={() => setOptions([...options, ''])}><Plus className="h-4 w-4" aria-hidden />Another choice</button>}
      </fieldset>
      {suggestions.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Ideas from the trip">{suggestions.map((s) => <button key={s} type="button" onClick={() => add(s)} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200" translate="no">+ {s}</button>)}</div>}
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4 accent-indigo-500" />People can pick more than one</label>
      <button type="button" onClick={() => void send()} disabled={busy || !question.trim() || options.filter((o) => o.trim()).length < 2} className="btn-primary w-full">{busy ? 'Asking…' : 'Ask everyone'}</button>
    </section>
  );
}
