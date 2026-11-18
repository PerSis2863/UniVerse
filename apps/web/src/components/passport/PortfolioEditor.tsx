'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Copy, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { confirmDialog } from '@/components/ui/Dialogs';
import { api, fetcher } from '@/lib/fetcher';
import { errorMessage } from '@/lib/api';
import { shareLink } from '@/lib/share-link';

// Portfolio work and private share links (M296; API /portfolio, src/server/portfolio.ts), on the student's
// passport page. `onChanged` refreshes the preview beside it.

type Work = { id: string; kind: string; title: string; body: string | null; url: string | null; course: string | null; grade: string | null };
type Share = { token: string; label: string | null; url: string; expiresAt: string; expired: boolean; views: number };
type Data = { work: Work[]; shares: Share[]; handIns: { id: string; title: string; course: string; grade: string | null }[]; shareDays: number[] };

export function PortfolioEditor({ onChanged }: { onChanged: () => void }) {
  const { data, mutate } = useSWR<Data>('/portfolio', fetcher);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const done = () => { void mutate(); onChanged(); };
  if (!data) return null;
  const move = async (w: Work, dir: 'up' | 'down') => { try { await api.patch(`/portfolio/items/${w.id}`, { move: dir }); done(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t move it.')); } };
  const remove = async (w: Work) => {
    if (!(await confirmDialog({ title: `Remove “${w.title}”?`, message: 'It no longer shows on your passport.', destructive: true }))) return;
    try { await api.delete(`/portfolio/items/${w.id}`); done(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove it.')); }
  };
  const unshare = async (s: Share) => {
    if (!(await confirmDialog({ title: 'Stop this link?', message: 'Anyone who has it can no longer open your passport.', destructive: true }))) return;
    try { await api.delete(`/portfolio/shares/${s.token}`); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t stop it.')); }
  };
  const copy = async (s: Share) => {
    const r = await shareLink('My portfolio', s.url);
    if (r === 'copied') { setCopied(s.token); setTimeout(() => setCopied(null), 1600); }
    if (r === 'failed') toast.error('Couldn’t copy. Select the link and copy it.');
  };

  return (
    <>
      <section aria-labelledby="pf-work-title" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="pf-work-title" className="me-auto font-bold text-zinc-900 dark:text-white">My work</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Add</button>
        </div>
        {!data.work.length ? <p className="text-sm text-zinc-600 dark:text-zinc-300">Show what you made: a graded hand-in, a project or a link, with a few words on what you did and learnt.</p> : (
          <ul className="space-y-1">
            {data.work.map((w, i) => (
              <li key={w.id} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-white/5">
                <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-100" translate="no">{w.title}</span>
                <button type="button" className="btn-ghost btn-sm" disabled={i === 0} aria-label={`Move “${w.title}” up`} onClick={() => void move(w, 'up')}><ArrowUp className="w-4 h-4" aria-hidden /></button>
                <button type="button" className="btn-ghost btn-sm" disabled={i === data.work.length - 1} aria-label={`Move “${w.title}” down`} onClick={() => void move(w, 'down')}><ArrowDown className="w-4 h-4" aria-hidden /></button>
                <button type="button" className="btn-ghost btn-sm" aria-label={`Remove “${w.title}”`} onClick={() => void remove(w)}><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pf-share-title" className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="pf-share-title" className="me-auto font-bold text-zinc-900 dark:text-white">Private links</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setSharing(true)}><Link2 className="w-4 h-4" aria-hidden />New link</button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">For an application: the link opens your passport and work even while it isn’t public, until it expires.</p>
        {data.shares.length > 0 && (
          <ul className="space-y-1">
            {data.shares.map((s) => (
              <li key={s.token} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-800 dark:text-zinc-100" translate="no">{s.label || 'Private link'}</span>
                  <span className="block text-xs text-zinc-500 tabular-nums">{s.expired ? 'Expired' : `Until ${new Date(s.expiresAt).toLocaleDateString()}`} · {s.views} {s.views === 1 ? 'view' : 'views'}</span>
                </span>
                {!s.expired && <button type="button" className="btn-ghost btn-sm" onClick={() => void copy(s)}>{copied === s.token ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied === s.token ? 'Copied' : 'Copy'}</button>}
                <button type="button" className="btn-ghost btn-sm" aria-label={`Stop the link ${s.label ?? ''}`} onClick={() => void unshare(s)}><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && <AddWork handIns={data.handIns} onClose={() => setAdding(false)} onDone={() => { setAdding(false); done(); }} />}
      {sharing && <NewShare days={data.shareDays} onClose={() => setSharing(false)} onDone={() => { setSharing(false); void mutate(); }} />}
    </>
  );
}

function AddWork({ handIns, onClose, onDone }: { handIns: Data['handIns']; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'WORK' | 'PROJECT' | 'LINK'>(handIns.length ? 'WORK' : 'PROJECT');
  const [f, setF] = useState({ submissionId: handIns[0]?.id ?? '', title: '', body: '', url: '', showGrade: true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('/portfolio/items', { kind, ...f }); toast.success('Added to your portfolio'); onDone(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t add it.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Add to my portfolio" onClose={onClose} footer={
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Add</button></div>
    }>
      <div className="space-y-4">
        <Segmented<'WORK' | 'PROJECT' | 'LINK'> label="What it is" value={kind} onChange={setKind} segments={[...(handIns.length ? [{ value: 'WORK' as const, label: 'A graded hand-in' }] : []), { value: 'PROJECT', label: 'A project' }, { value: 'LINK', label: 'A link' }]} />
        {kind === 'WORK' && (
          <>
            <Field label="Hand-in">{(p) => <select {...p} className="input" value={f.submissionId} onChange={(e) => setF({ ...f, submissionId: e.target.value })}>{handIns.map((h) => <option key={h.id} value={h.id}>{h.course}: {h.title}</option>)}</select>}</Field>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={f.showGrade} onChange={(e) => setF({ ...f, showGrade: e.target.checked })} />Show the grade</label>
          </>
        )}
        <Field label={kind === 'WORK' ? 'Title (optional)' : 'Title'}>{(p) => <input {...p} className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="What you did and learnt" max={2000} count={f.body.length}>{(p) => <textarea {...p} className="input min-h-24" maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
        <Field label={kind === 'LINK' ? 'Link' : 'Link (optional)'} hint="A page that starts with https://">{(p) => <input {...p} className="input" type="url" maxLength={500} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" />}</Field>
      </div>
    </Sheet>
  );
}

function NewShare({ days, onClose, onDone }: { days: number[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ label: '', days: '30' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>('/portfolio/shares', { label: f.label, days: Number(f.days) });
      const shared = await shareLink('My portfolio', r.data.url);
      toast.success(shared === 'copied' ? 'Link made and copied' : 'Link made', { description: r.data.url });
      onDone();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t make the link.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="New private link" onClose={onClose} footer={
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Make the link</button></div>
    }>
      <div className="space-y-4">
        <Field label="Who it’s for (only you see this)">{(p) => <input {...p} className="input" maxLength={80} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Internship at Acme" />}</Field>
        <Field label="Works for">{(p) => <select {...p} className="input" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>{days.map((d) => <option key={d} value={d}>{d} days</option>)}</select>}</Field>
      </div>
    </Sheet>
  );
}
