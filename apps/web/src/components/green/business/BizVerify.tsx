'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { BadgeCheck, CircleHelp, MessageSquareReply, ShieldAlert, ShieldCheck, Signature } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { canEdit, catLabel, field, h3, icon, kgText, label, monthName, muted, tonnes, type Entry, type Role, type SectionProps } from './shared';

// Green → Business → Verify (M278): the honest way to "certified". UniVerse never certifies a footprint itself: the
// company invites an independent verifier (a person at an accredited firm, with a UniVerse account), who reads every
// line, asks questions on lines, and signs a statement (ISO 14064-3, ISAE 3410 or AA1000AS; limited or reasonable
// assurance; the scopes covered) over a snapshot of the numbers and the change log's fingerprint. The report then
// shows "Verified", and says so when the numbers move after it was signed.

type Query = { id: string; entryId: string | null; question: string; answer: string | null; status: 'open' | 'answered' | 'closed'; createdAt: string };
type V = {
  id: string; year: number; firm: string; verifier: string; mine: boolean; status: 'reviewing' | 'signed' | 'withdrawn'; standard: string | null; level: string | null;
  scopes: number[] | null; accreditation: string | null; opinion: string | null; snapshot: { kg: number; scope: Record<string, number>; lines: number; log: string | null } | null;
  signature: string | null; signedAt: string | null; createdAt: string; queries: Query[];
};
const STATUS = { reviewing: 'Reviewing', signed: 'Signed', withdrawn: 'Withdrawn' } as const;

export function BizVerify({ org, role, year }: SectionProps) {
  const { data, mutate } = useSWR<{ role: Role; verifications: V[] }>(`/green/biz/${org.id}/verifications`, fetcher, { keepPreviousData: true });
  const [f, setF] = useState({ email: '', firm: '', year: String(year) });
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post(`/green/biz/${org.id}/verifications`, { ...f, year: Number(f.year) }); setF({ ...f, email: '' }); await mutate(); toast.success('Invited: they’ll see it in their Green.'); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t invite them.')); }
  };
  if (!data) return <div className="h-72 rounded-[var(--radius-card)] skeleton" />;
  const list = role === 'verifier' ? data.verifications.filter((v) => v.mine) : data.verifications;
  return (
    <div className="space-y-6">
      {role !== 'verifier' && (
        <section className="panel p-5" aria-labelledby="vf-h">
          <h3 id="vf-h" className={h3}><ShieldCheck className={icon} aria-hidden />Independent verification</h3>
          <p className={`mt-2 max-w-3xl ${muted}`}>A footprint is “certified” when an independent, accredited verifier has checked it. Invite theirs here (they need a UniVerse account): they read every line and its evidence, ask questions you answer, and sign a statement over the numbers. Your report then carries it, and shows if anything changes after.</p>
          {role === 'owner' && (
            <form onSubmit={(e) => void invite(e)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_7rem_auto] sm:items-end">
              <label className={label}>Verifier’s UniVerse email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} /></label>
              <label className={label}>Their firm<input required maxLength={100} value={f.firm} onChange={(e) => setF({ ...f, firm: e.target.value })} placeholder="e.g. an accredited verification body" className={field} /></label>
              <label className={label}>Year<input type="number" min={2000} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} className={field} /></label>
              <button type="submit" className="btn-primary">Invite</button>
            </form>
          )}
        </section>
      )}
      {!list.length ? <p className={`panel p-5 ${muted}`}>{role === 'verifier' ? 'Nothing to review here.' : 'No verification yet.'}</p> : list.map((v) => <Review key={v.id} orgId={org.id} role={role} v={v} onChanged={() => void mutate()} />)}
    </div>
  );
}

function Review({ orgId, role, v, onChanged }: { orgId: string; role: Role; v: V; onChanged: () => void }) {
  const { data: lines } = useSWR<{ entries: Entry[] }>(v.mine && v.status === 'reviewing' ? `/green/biz/${orgId}/entries?year=${v.year}` : null, fetcher);
  const [ask, setAsk] = useState({ entryId: '', question: '' });
  const [sign, setSign] = useState({ standard: 'ISO 14064-3', level: 'limited', scopes: [1, 2] as number[], accreditation: '', opinion: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const base = `/green/biz/${orgId}/verifications/${v.id}`;
  const act = async (path: string, body?: unknown, ok?: string) => {
    try { await api.post(`${base}${path}`, body ?? {}); onChanged(); if (ok) toast.success(ok); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
  };
  const open = v.queries.filter((q) => q.status === 'open').length;
  const lineOf = (id: string | null) => lines?.entries.find((e) => e.id === id);
  return (
    <section className="panel p-5 space-y-4" aria-label={`Verification of ${v.year} by ${v.firm}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={h3}>{v.status === 'signed' ? <BadgeCheck className={icon} aria-hidden /> : <ShieldCheck className="h-5 w-5 text-zinc-500" aria-hidden />}{v.year}: <span translate="no">{v.firm}</span></h3>
          <p className={muted}><span translate="no">{v.verifier}</span> · {STATUS[v.status]}{v.status === 'reviewing' ? ` · ${v.queries.length} questions, ${open} waiting for an answer` : ''}</p>
        </div>
        {v.status !== 'withdrawn' && (v.mine || role === 'owner') && <button type="button" className="btn-secondary btn-sm" onClick={() => { if (confirm('End this review?')) void act('/withdraw', undefined, 'Ended.'); }}>{v.mine ? 'Withdraw' : 'End the review'}</button>}
      </header>

      {v.status === 'signed' && v.snapshot && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm">
          <p className="font-semibold text-zinc-900 dark:text-white">{v.level === 'reasonable' ? 'Reasonable' : 'Limited'} assurance, {v.standard}, scopes {v.scopes?.join(' + ')}{v.accreditation ? ` · accredited by ${v.accreditation}` : ''}</p>
          <p className="mt-1 whitespace-pre-line text-zinc-700 dark:text-zinc-200" translate="no">{v.opinion}</p>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Signed {v.signedAt ? new Date(v.signedAt).toLocaleString() : ''} over {tonnes(v.snapshot.kg)} in {v.snapshot.lines} lines · signature <span className="font-mono break-all">{v.signature?.slice(0, 24)}…</span></p>
        </div>
      )}

      {v.queries.length > 0 && (
        <ol className="space-y-3">
          {v.queries.map((q) => {
            const line = lineOf(q.entryId);
            return (
              <li key={q.id} className="rounded-2xl border border-[var(--hairline)] p-3">
                <p className="flex items-start gap-2 text-sm text-zinc-900 dark:text-white"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden /><span>{q.question}{line && <span className="block text-xs text-zinc-600 dark:text-zinc-400">On {catLabel(line.category)}, {monthName(line.period)}: {kgText(line.kg)}</span>}</span></p>
                {q.answer && <p className="mt-2 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200"><MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /><span translate="no">{q.answer}</span></p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', q.status === 'open' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : q.status === 'answered' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>{q.status === 'open' ? 'Waiting for an answer' : q.status === 'answered' ? 'Answered' : 'Closed'}</span>
                  {v.mine && q.status === 'answered' && v.status === 'reviewing' && <button type="button" className="btn-secondary btn-sm" onClick={() => void act(`/queries/${q.id}/close`)}>Close it</button>}
                </div>
                {canEdit(role) && q.status !== 'closed' && v.status === 'reviewing' && (
                  <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void act(`/queries/${q.id}/answer`, { answer: answers[q.id] }, 'Answer sent.'); }}>
                    <label className="min-w-[12rem] flex-1"><span className="sr-only">Your answer</span><input required maxLength={1500} value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer (and where the evidence is)" className={cn(field, 'mt-0')} /></label>
                    <button type="submit" className="btn-primary btn-sm">Answer</button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {v.mine && v.status === 'reviewing' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="space-y-3 rounded-2xl border border-[var(--hairline)] p-4" onSubmit={(e) => { e.preventDefault(); void act('/queries', { entryId: ask.entryId || null, question: ask.question }, 'Asked.').then(() => setAsk({ entryId: '', question: '' })); }}>
            <p className="font-semibold text-zinc-900 dark:text-white">Ask a question</p>
            <label className={label}>About<select value={ask.entryId} onChange={(e) => setAsk({ ...ask, entryId: e.target.value })} className={field}><option value="">The whole year</option>{lines?.entries.map((e) => <option key={e.id} value={e.id}>{monthName(e.period)}: {catLabel(e.category)}, {kgText(e.kg)}</option>)}</select></label>
            <label className={label}>Question<textarea required maxLength={800} rows={3} value={ask.question} onChange={(e) => setAsk({ ...ask, question: e.target.value })} className={field} /></label>
            <button type="submit" className="btn-secondary">Ask</button>
          </form>
          <form className="space-y-3 rounded-2xl border border-[var(--hairline)] p-4" onSubmit={(e) => { e.preventDefault(); void act('/sign', sign, 'Signed.'); }}>
            <p className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Signature className="h-4 w-4" aria-hidden />Sign your statement</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Standard<select value={sign.standard} onChange={(e) => setSign({ ...sign, standard: e.target.value })} className={field}><option>ISO 14064-3</option><option>ISAE 3410</option><option>AA1000AS v3</option></select></label>
              <label className={label}>Assurance<select value={sign.level} onChange={(e) => setSign({ ...sign, level: e.target.value })} className={field}><option value="limited">Limited</option><option value="reasonable">Reasonable</option></select></label>
            </div>
            <fieldset className="flex gap-4 text-sm text-zinc-700 dark:text-zinc-200"><legend className={`${label} mb-1`}>Scopes covered</legend>{[1, 2, 3].map((s) => <label key={s} className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={sign.scopes.includes(s)} onChange={(e) => setSign({ ...sign, scopes: e.target.checked ? [...sign.scopes, s] : sign.scopes.filter((x) => x !== s) })} />Scope {s}</label>)}</fieldset>
            <label className={label}>Accreditation (optional)<input maxLength={120} value={sign.accreditation} onChange={(e) => setSign({ ...sign, accreditation: e.target.value })} placeholder="e.g. the accreditation body and number" className={field} /></label>
            <label className={label}>Your opinion<textarea required maxLength={2000} rows={4} value={sign.opinion} onChange={(e) => setSign({ ...sign, opinion: e.target.value })} placeholder="e.g. Nothing has come to our attention that causes us to believe the statement is not fairly stated…" className={field} /></label>
            {open > 0 && <p className="flex items-center gap-1.5 text-sm text-amber-800 dark:text-amber-300"><ShieldAlert className="h-4 w-4" aria-hidden />{open} question{open === 1 ? '' : 's'} still waiting for an answer.</p>}
            <button type="submit" disabled={open > 0} className="btn-primary">Sign</button>
          </form>
        </div>
      )}
    </section>
  );
}
