'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Loader2, Lock, Plus, ShieldCheck, Trash2, Vote } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { ballotListText } from '@/lib/student-life';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Stage 5 · Q17: a club's elections. Members vote once, in secret, and get a receipt; after voting
// closes every ballot is listed by receipt, so voters find theirs and anyone can recount, and the
// list's SHA-256 fingerprint can be checked right here (src/server/club-governance.ts).

interface Candidate { id: string; name: string }
interface Election {
  id: string; title: string; candidates: Candidate[]; opensAt: string; closesAt: string; state: 'UPCOMING' | 'OPEN' | 'CLOSED'; voted: boolean; turnout: number;
  results: { counts: (Candidate & { votes: number })[]; total: number; winners: string[]; ballots: { receipt: string; choice: string }[]; fingerprint: string } | null;
}
interface Data { club: { id: string; name: string }; member: boolean; runs: boolean; members: number; elections: Election[] }
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const localInput = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function Results({ e }: { e: Election }) {
  const r = e.results!;
  const [find, setFind] = useState('');
  const [check, setCheck] = useState<null | boolean>(null);
  const most = Math.max(1, ...r.counts.map((c) => c.votes));
  const name = (id: string) => e.candidates.find((c) => c.id === id)?.name ?? id;
  const mine = find.trim().length >= 4 ? r.ballots.find((b) => b.receipt.replace(/-/g, '') === find.trim().toUpperCase().replace(/[-\s]/g, '')) : null;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {r.counts.map((c) => (
          <li key={c.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] sm:grid-cols-[12rem_1fr_auto] items-center gap-3 text-sm">
            <span className="text-zinc-900 dark:text-white break-words font-medium">{c.name}{r.winners.includes(c.id) && <span className="ml-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{r.winners.length > 1 ? 'tie' : 'elected'}</span>}</span>
            <span className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden" aria-hidden><span className="block h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(2, (c.votes / most) * 100)}%` }} /></span>
            <span className="tabular-nums text-zinc-700 dark:text-zinc-200">{c.votes}</span>
          </li>
        ))}
      </ul>
      <details className="rounded-2xl border border-zinc-200 dark:border-white/10 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-white inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" aria-hidden /> Check the count ({r.total} ballots)</summary>
        <div className="mt-3 space-y-3 text-sm">
          <Field label="Find my receipt">{(p) => <input {...p} className="input font-mono uppercase" value={find} onChange={(ev) => setFind(ev.target.value)} placeholder="K7QM-2XPA-9DTE" autoComplete="off" />}</Field>
          {find.trim().length >= 4 && <p role="status" className={mine ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-600 dark:text-zinc-400'}>{mine ? `Found: your vote for ${name(mine.choice)} was counted.` : 'Not found yet: check the receipt.'}</p>}
          <div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Fingerprint (SHA-256 of every ballot as “receipt:choice”, sorted, one a line):</p>
            <p className="font-mono text-xs break-all text-zinc-800 dark:text-zinc-200">{r.fingerprint}</p>
            <button type="button" className="btn-secondary btn-sm mt-2" onClick={async () => setCheck((await sha256(ballotListText(r.ballots))) === r.fingerprint)}>Check it on this device</button>
            {check !== null && <p role="status" className={cn('mt-1 text-sm font-semibold', check ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>{check ? 'It matches: this list is the one that was counted.' : 'It doesn’t match.'}</p>}
          </div>
          <ul className="max-h-56 overflow-y-auto font-mono text-xs divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {r.ballots.map((b) => <li key={b.receipt} className="py-1 flex justify-between gap-3"><span>{b.receipt}</span><span className="font-sans text-zinc-700 dark:text-zinc-300">{name(b.choice)}</span></li>)}
          </ul>
        </div>
      </details>
    </div>
  );
}

/** Shown once, right after voting (it isn't stored with the voter, so it can't be shown again). */
function ReceiptBox({ receipt }: { receipt: string }) {
  return (
    <div className="rounded-2xl bg-emerald-500/10 p-4 space-y-2" role="status">
      <p className="font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden /> Vote counted</p>
      <p className="text-sm text-zinc-700 dark:text-zinc-200">Your receipt: <strong className="font-mono">{receipt}</strong>. Keep it (it isn’t saved anywhere with your name): after voting closes, find it in the list to check your vote.</p>
      <button type="button" className="btn-secondary btn-sm" onClick={() => { void navigator.clipboard?.writeText(receipt); toast.success('Copied'); }}><Copy className="w-4 h-4" aria-hidden /> Copy</button>
    </div>
  );
}

function Ballot({ e, onVoted }: { e: Election; onVoted: (receipt: string) => void }) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const vote = async () => {
    const pick = e.candidates.find((c) => c.id === choice);
    if (!pick || !(await confirmDialog({ title: `Vote for ${pick.name}?`, message: 'You can vote once and can’t change it.', confirmLabel: 'Vote' }))) return;
    setBusy(true);
    try {
      const r = await authedJson<{ receipt: string }>(`/api/campus/elections/${e.id}/vote`, { method: 'POST', body: JSON.stringify({ choice }) });
      onVoted(r.receipt);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Candidates for {e.title}</legend>
      {e.candidates.map((c) => (
        <label key={c.id} className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 cursor-pointer text-sm', choice === c.id ? 'border-indigo-500 bg-indigo-500/[0.06]' : 'border-zinc-200 dark:border-white/10')}>
          <input type="radio" name={`vote-${e.id}`} value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-zinc-900 dark:text-white">{c.name}</span>
        </label>
      ))}
      <button type="button" className="btn-primary" disabled={!choice || busy} onClick={vote}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Vote className="w-4 h-4" aria-hidden />} Vote</button>
    </fieldset>
  );
}

function NewElection({ clubId, onDone }: { clubId: string; onDone: (d: Data) => void }) {
  const [title, setTitle] = useState('');
  const [names, setNames] = useState('');
  const [closes, setCloses] = useState(() => localInput(Date.now() + 3 * 86_400_000));
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      onDone(await authedJson<Data>(`/api/campus/clubs/${clubId}/elections`, { method: 'POST', body: JSON.stringify({ title, candidates: names.split('\n'), closesAt: new Date(closes).toISOString() }) }));
      toast.success('Election called: members have been told');
      setTitle(''); setNames('');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="What for">{(p) => <input {...p} className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="President 2026" />}</Field>
      <Field label="Voting closes">{(p) => <input {...p} className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />}</Field>
      <Field label="Candidates" hint="One a line, 2 to 10" className="sm:col-span-2">{(p) => <textarea {...p} className="input min-h-[90px]" value={names} onChange={(e) => setNames(e.target.value)} />}</Field>
      <div className="sm:col-span-2 flex justify-end"><button type="button" className="btn-primary" disabled={busy || title.trim().length < 3} onClick={create}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />} Open voting now</button></div>
    </div>
  );
}

export function ClubElections({ clubId }: { clubId: string }) {
  const key = `/api/campus/clubs/${encodeURIComponent(clubId)}/elections`;
  const { data, error, mutate } = useSWR<Data>(key, authedJson);
  const [creating, setCreating] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  if (error) return <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p>;
  if (!data) return <div className="skeleton h-40 rounded-3xl" />;
  const remove = async (e: Election) => {
    if (!(await confirmDialog({ title: `Remove “${e.title}”?`, confirmLabel: 'Remove', destructive: true }))) return;
    try { await mutate(await authedJson<Data>(`/api/campus/elections/${e.id}`, { method: 'DELETE' }), { revalidate: false }); } catch (err) { toast.error((err as Error).message); }
  };
  return (
    <motion.div variants={list} initial="hidden" animate="show" className="space-y-4">
      <motion.p variants={fadeUp} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5"><Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> Votes are secret: who voted and what was voted are kept apart. Results appear when voting closes, with every ballot listed by receipt.</motion.p>
      {data.runs && (
        <motion.section variants={fadeUp} className="panel p-4 sm:p-5">
          {creating ? <NewElection clubId={clubId} onDone={(d) => { void mutate(d, { revalidate: false }); setCreating(false); }} />
            : <button type="button" className="btn-secondary" onClick={() => setCreating(true)}><Plus className="w-4 h-4" aria-hidden /> Call an election</button>}
        </motion.section>
      )}
      {data.elections.length ? data.elections.map((e) => (
        <motion.section key={e.id} variants={fadeUp} className="panel p-4 sm:p-5 space-y-3" aria-labelledby={`el-${e.id}`}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 id={`el-${e.id}`} className="font-bold text-zinc-900 dark:text-white break-words">{e.title}</h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{e.state === 'UPCOMING' ? `Opens ${when(e.opensAt)}` : e.state === 'OPEN' ? `Closes ${when(e.closesAt)}` : `Closed ${when(e.closesAt)}`} · {e.turnout} of {data.members} voted</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', e.state === 'OPEN' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : e.state === 'UPCOMING' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-zinc-100 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-200')}>{e.state === 'OPEN' ? 'Voting open' : e.state === 'UPCOMING' ? 'Upcoming' : 'Closed'}</span>
            {data.runs && !e.turnout && <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Remove ${e.title}`} onClick={() => remove(e)}><Trash2 className="w-4 h-4" aria-hidden /></button>}
          </div>
          {receipts[e.id] ? <ReceiptBox receipt={receipts[e.id]} />
            : e.state === 'CLOSED' && e.results ? <Results e={e} />
            : e.state === 'OPEN' && data.member && !e.voted ? <Ballot e={e} onVoted={(rc) => { setReceipts((x) => ({ ...x, [e.id]: rc })); void mutate(); }} />
            : e.state === 'OPEN' && e.voted ? <p className="text-sm text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden /> You’ve voted. Results when voting closes.</p>
            : <p className="text-sm text-zinc-600 dark:text-zinc-400">Candidates: {e.candidates.map((c) => c.name).join(', ')}</p>}
        </motion.section>
      )) : <div className="panel"><EmptyState compact icon={Vote} title="No elections yet" hint={data.runs ? 'Call one when it’s time to choose the club’s officers.' : 'The founder calls elections; members get a notification.'} /></div>}
    </motion.div>
  );
}
