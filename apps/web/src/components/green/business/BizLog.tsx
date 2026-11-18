'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Copy, History, Link2Off, ShieldCheck, ShieldAlert, Trash2, UserPlus, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { copy, linkOf } from './BizSuppliers';
import { field, h3, icon, label, muted, type Role, type SectionProps } from './shared';

// Green → Business → Log & sharing (M274, M269): who works on the footprint (owners, editors, viewers), the auditor's
// read-only link, and the change log: every change, chained by its fingerprint so a rewritten row shows.

type Audit = { auditCode: string | null; whole: boolean; count: number; head: string | null; rows: { id: string; action: string; detail: string; who: string | null; hash: string; createdAt: string }[] };
type Members = { members: { userId: string; name: string; role: Role; me: boolean }[]; consultancy: string | null };
const ROLE_TEXT: Record<Role, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export function BizLog({ org, role, onChanged, onPick }: SectionProps) {
  const { data: audit, mutate } = useSWR<Audit>(`/green/biz/${org.id}/audit`, fetcher);
  const { data: people, mutate: reload } = useSWR<Members>(`/green/biz/${org.id}/members`, fetcher);
  const [f, setF] = useState({ email: '', role: 'editor' });
  const owner = role === 'owner';
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post(`/green/biz/${org.id}/members`, f); setF({ email: '', role: 'editor' }); toast.success('Added.'); await reload(); await mutate(); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t add them.')); }
  };
  const remove = async (uid: string, me: boolean) => {
    if (!confirm(me ? 'Leave this company?' : 'Remove them?')) return;
    try { await api.delete(`/green/biz/${org.id}/members/${uid}`); if (me) onChanged(); else await reload(); } catch (err) { toast.error(errorMessage(err, 'Couldn’t do that.')); }
  };
  const auditLink = async (on: boolean) => {
    try { const r = await api.post<{ auditCode: string | null }>(`/green/biz/${org.id}/audit-link`, { on }); await mutate(); if (r.data.auditCode) void copy(linkOf(r.data.auditCode), 'The auditor’s link'); }
    catch (err) { toast.error(errorMessage(err, 'Couldn’t change the link.')); }
  };
  const del = async () => {
    if (prompt(`Type the company’s name to delete it and its whole footprint: ${org.name}`) !== org.name) return;
    try { await api.delete(`/green/biz/${org.id}`); toast.success('Deleted.'); onPick(''); onChanged(); } catch (err) { toast.error(errorMessage(err, 'Couldn’t delete it.')); }
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="ppl-h">
          <h3 id="ppl-h" className={h3}><Users className={icon} aria-hidden />People</h3>
          {people?.consultancy && <p className={`mt-1 ${muted}`}>Managed by <span translate="no">{people.consultancy}</span>: its team works on it too.</p>}
          <ul className="mt-3 divide-y divide-[var(--hairline)]">
            {people?.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 text-zinc-900 dark:text-white" translate="no">{m.name}{m.me ? ' (you)' : ''}</span>
                <span className="text-zinc-600 dark:text-zinc-300">{ROLE_TEXT[m.role]}</span>
                {(owner || m.me) && <button type="button" className="btn-ghost btn-icon" aria-label={m.me ? 'Leave' : `Remove ${m.name}`} onClick={() => void remove(m.userId, m.me)}><Trash2 className="h-4 w-4" aria-hidden /></button>}
              </li>
            ))}
          </ul>
          {owner && (
            <form onSubmit={(e) => void invite(e)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <label className={label}>Their UniVerse email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} /></label>
              <label className={label}>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={field}><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label>
              <button type="submit" className="btn-primary inline-flex items-center gap-1.5"><UserPlus className="h-4 w-4" aria-hidden />Add</button>
            </form>
          )}
        </section>
        <section className="panel p-5" aria-labelledby="aud-h">
          <h3 id="aud-h" className={h3}>{audit?.whole === false ? <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden /> : <ShieldCheck className={icon} aria-hidden />}Auditor’s link</h3>
          <p className={`mt-2 ${muted}`}>A read-only page for your auditor or a customer: the report, every factor’s source and the whole change log, with no names or emails. Turn it off when they’re done.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {audit?.auditCode ? (
              <>
                <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => void copy(linkOf(audit.auditCode!), 'The auditor’s link')}><Copy className="h-4 w-4" aria-hidden />Copy the link</button>
                {owner && <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={() => void auditLink(false)}><Link2Off className="h-4 w-4" aria-hidden />Turn it off</button>}
              </>
            ) : owner ? <button type="button" className="btn-primary" onClick={() => void auditLink(true)}>Make the auditor’s link</button> : <p className={muted}>Only the company’s owners make it.</p>}
          </div>
          {audit && <p className={`mt-4 text-sm font-medium ${audit.whole ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>{audit.whole ? `The log is whole: ${audit.count} changes, each fingerprint matching the one before.` : 'A row in the log doesn’t match its fingerprint: something was changed outside UniVerse.'}</p>}
        </section>
      </div>
      <section className="panel p-0 overflow-hidden" aria-labelledby="log-h">
        <h3 id="log-h" className={`${h3} px-5 pt-5`}><History className={icon} aria-hidden />Change log</h3>
        <ol className="mt-3 divide-y divide-[var(--hairline)]" data-no-motion>
          {audit?.rows.map((r) => (
            <li key={r.id} className="px-5 py-2.5 text-sm">
              <p className="text-zinc-900 dark:text-white">{r.detail}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{new Date(r.createdAt).toLocaleString()}{r.who ? <> · <span translate="no">{r.who}</span></> : ' · from a share link'} · <span className="font-mono">{r.hash.slice(0, 12)}</span></p>
            </li>
          ))}
        </ol>
      </section>
      {owner && <button type="button" className="btn-secondary text-red-600 dark:text-red-400" onClick={() => void del()}>Delete this company</button>}
    </div>
  );
}
