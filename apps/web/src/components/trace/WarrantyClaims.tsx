'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { CLAIM_LABEL, isOpen, ownerMayWithdraw, type ClaimStatus, type TimelineEntry } from '@/lib/trace-claims';

// M309: warranty claims (API /trace/claims, src/server/trace-claims.ts). BrandClaims: the brand's queue on its
// Trace home. ClaimButton and MyClaim: the owner's side, on each unit in the vault.

type Claim = { id: string; code: string; issue: string; photoUrl: string | null; status: ClaimStatus; timeline: TimelineEntry[]; createdAt: string; product: string };
type BrandClaim = Claim & { owner: string; warrantyEnds: string | null; next: ClaimStatus[] };
const TONE = (s: ClaimStatus) => (s === 'REFUSED' ? 'badge-red' : s === 'CLOSED' || s === 'WITHDRAWN' ? '' : s === 'OPEN' ? 'badge-amber' : 'badge-green');

export function BrandClaims() {
  const [all, setAll] = useState(false);
  const { data, mutate } = useSWR<{ claims: BrandClaim[]; open: number }>(`/trace/claims${all ? '' : '?open=1'}`, fetcher);
  const [moving, setMoving] = useState<{ c: BrandClaim; to: ClaimStatus } | null>(null);
  if (!data || (!data.claims.length && !all)) return null;
  return (
    <section className="panel p-5 space-y-3" aria-labelledby="claims-h">
      <div className="flex items-center gap-2">
        <h2 id="claims-h" className="me-auto font-bold flex items-center gap-2 text-zinc-900 dark:text-white"><ShieldCheck className="w-4 h-4 text-pink-500" aria-hidden />Warranty claims{data.open ? ` · ${data.open} open` : ''}</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAll(!all)}>{all ? 'Open ones only' : 'All claims'}</button>
      </div>
      <ul className="space-y-2">
        {data.claims.map((c) => (
          <li key={c.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-white" translate="no">{c.product}</span>
              <span className={cn('badge', TONE(c.status))}>{CLAIM_LABEL[c.status]}</span>
              <span className="ms-auto text-xs text-zinc-500">{c.owner} · {new Date(c.createdAt).toLocaleDateString()}{c.warrantyEnds ? ` · warranty until ${new Date(c.warrantyEnds).toLocaleDateString()}` : ''}</span>
            </div>
            <p className="mt-1 text-zinc-700 dark:text-zinc-200" translate="no">{c.issue}</p>
            {c.photoUrl && <a href={c.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline dark:text-indigo-300">See the photo</a>}
            {c.next.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {c.next.map((to) => <button key={to} type="button" className={to === 'REFUSED' ? 'btn-ghost btn-sm' : 'btn-secondary btn-sm'} onClick={() => setMoving({ c, to })}>{CLAIM_LABEL[to]}</button>)}
              </div>
            )}
          </li>
        ))}
      </ul>
      {moving && <MoveSheet {...moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); void mutate(); }} />}
    </section>
  );
}

function MoveSheet({ c, to, onClose, onDone }: { c: BrandClaim; to: ClaimStatus; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/trace/claims/${c.id}/status`, { status: to, note }); toast.success(`Marked ${CLAIM_LABEL[to].toLowerCase()}`, { description: 'The owner was told in the app.' }); onDone(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t move the claim.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={`${CLAIM_LABEL[to]}: ${c.product}`} onClose={onClose} footer={
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy || (to === 'REFUSED' && !note.trim())} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}{CLAIM_LABEL[to]}</button></div>
    }>
      <Field label={to === 'REFUSED' ? 'Why (the owner sees this)' : 'A note for the owner (optional)'} max={1000} count={note.length}>{(p) => <textarea {...p} className="input min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={to === 'REPAIRED' ? 'Replaced the zip; it’s on its way back.' : to === 'APPROVED' ? 'Send it to our repair centre with this claim number.' : ''} />}</Field>
      {to === 'REPAIRED' && <p className="mt-2 text-xs text-zinc-500 inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" aria-hidden />It’s added to the product’s repair history on its passport.</p>}
    </Sheet>
  );
}

/** The owner's side for one unit: its claim's status and steps, or a button to claim. */
export function UnitClaim({ vaultId, code, product, warrantyActive }: { vaultId: string; code: string; product: string; warrantyActive: boolean }) {
  const { data, mutate } = useSWR<{ claims: Claim[] }>('/trace/claims/mine', fetcher);
  const [open, setOpen] = useState(false);
  const claim = data?.claims.find((c) => c.code === code && isOpen(c.status)) ?? data?.claims.find((c) => c.code === code);
  const withdraw = async () => {
    if (!claim) return;
    try { await api.post(`/trace/claims/${claim.id}/withdraw`, {}); toast.success('Claim withdrawn'); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t withdraw it.')); }
  };
  return (
    <div className="mt-3">
      {claim ? (
        <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
          <p className="font-medium text-zinc-900 dark:text-white">Warranty claim: {CLAIM_LABEL[claim.status]}</p>
          <ol className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
            {claim.timeline.map((t, i) => <li key={i}>{new Date(t.at).toLocaleDateString()} · {CLAIM_LABEL[t.status]}{t.note ? `: ${t.note}` : ''}</li>)}
          </ol>
          {ownerMayWithdraw(claim.status) && <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => void withdraw()}>Withdraw the claim</button>}
          {!isOpen(claim.status) && warrantyActive && <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setOpen(true)}>Claim again</button>}
        </div>
      ) : warrantyActive ? (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}><ShieldCheck className="w-4 h-4" aria-hidden />Claim on the warranty</button>
      ) : null}
      {open && <NewClaim vaultId={vaultId} product={product} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void mutate(); }} />}
    </div>
  );
}

function NewClaim({ vaultId, product, onClose, onDone }: { vaultId: string; product: string; onClose: () => void; onDone: () => void }) {
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post(`/trace/vault/${vaultId}/claim`, { issue }); toast.success('Claim sent', { description: 'You’ll hear in the app as the brand moves it on.' }); onDone(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t send the claim.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={`Warranty claim: ${product}`} onClose={onClose} footer={
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy || issue.trim().length < 10} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Send the claim</button></div>
    }>
      <Field label="What’s wrong" hint="When it started and what happens. The brand sees your first name, never your email." max={2000} count={issue.length}>{(p) => <textarea {...p} className="input min-h-32" maxLength={2000} value={issue} onChange={(e) => setIssue(e.target.value)} />}</Field>
    </Sheet>
  );
}
