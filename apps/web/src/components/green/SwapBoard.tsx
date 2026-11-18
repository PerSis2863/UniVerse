'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Flag, Loader2, MessageSquare, Plus, Recycle, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { authedJson } from '@/lib/authed-fetch';
import { currentAppNow } from '@/lib/current-app';
import { inboxFor } from '@/lib/apps';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { SWAP_CATEGORIES, SWAP_KINDS, type SwapCategory, type SwapKind } from '@/lib/green-swap';
import { Neighbourhood } from './Neighbourhood';

// M320: Green → Swap & repair (API /green/swaps, src/server/green-swaps.ts): give, swap, lend or look for things,
// offer or ask for a repair, in my neighbourhood and the squares around it; reach people by message only.

type Post = { id: string; kind: SwapKind; category: SwapCategory; title: string; details: string | null; status: string; createdAt: string; mine: boolean; by: string; userId: string | null; reported: boolean; here: boolean };
type Data = { area: { lat: number; lng: number } | null; posts: Post[]; kept: number };

export function SwapBoard() {
  const [kind, setKind] = useState<SwapKind | ''>('');
  const key = `/green/swaps${kind ? `?kind=${kind}` : ''}`;
  const { data, mutate } = useSWR<Data>(key, fetcher);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  if (!data) return <div className="h-48 rounded-[var(--radius-card)] skeleton" />;
  if (!data.area) return <div className="max-w-xl"><Neighbourhood /></div>;
  const act = async (call: () => Promise<{ data: Data } | unknown>, ok: string) => { try { await call(); toast.success(ok); void mutate(); } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); } };
  const message = async (p: Post) => {
    if (!p.userId) return;
    try { const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: p.userId, app: currentAppNow() }) }); router.push(`${inboxFor(role)}?c=${encodeURIComponent(id)}`); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t open the chat.')); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm text-zinc-600 dark:text-zinc-300"><Recycle className="me-1 inline w-4 h-4 text-emerald-600" aria-hidden />{data.kept} {data.kept === 1 ? 'thing' : 'things'} kept in use around here this month</p>
        <select aria-label="Show" className="input w-auto py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as SwapKind | '')}>
          <option value="">Everything</option>
          {(Object.keys(SWAP_KINDS) as SwapKind[]).map((k) => <option key={k} value={k}>{SWAP_KINDS[k]}</option>)}
        </select>
        <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4" aria-hidden />Post</button>
      </div>
      {!data.posts.length ? <p className="panel p-6 text-center text-sm text-zinc-600 dark:text-zinc-300">Nothing posted near you yet. Give away something you don’t use, or say what needs fixing.</p> : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.posts.map((p) => (
            <li key={p.id} className={cn('panel p-4', p.status === 'DONE' && 'opacity-70')}>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{SWAP_KINDS[p.kind]} · {SWAP_CATEGORIES[p.category] ?? 'Other'}{p.status === 'DONE' ? ' · done' : ''}</p>
              <p className="mt-1 font-semibold text-zinc-900 dark:text-white" translate="no">{p.title}</p>
              {p.details && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line" translate="no">{p.details}</p>}
              <p className="mt-2 text-xs text-zinc-500">{p.by} · {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{p.here ? '' : ' · nearby'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.mine ? (
                  <>
                    {p.status === 'OPEN' && <button type="button" className="btn-secondary btn-sm" onClick={() => void act(() => api.post(`/green/swaps/${p.id}/done`, {}), 'Marked done: thank you for keeping it in use')}><Check className="w-4 h-4" aria-hidden />Done</button>}
                    <button type="button" className="btn-ghost btn-sm" aria-label={`Remove “${p.title}”`} onClick={() => void act(() => api.delete(`/green/swaps/${p.id}`), 'Removed')}><Trash2 className="w-4 h-4" aria-hidden /></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => void message(p)}><MessageSquare className="w-4 h-4" aria-hidden />Message</button>
                    {!p.reported && <button type="button" className="btn-ghost btn-sm" aria-label={`Report “${p.title}”`} onClick={() => void act(() => api.post(`/green/swaps/${p.id}/report`, {}), 'Reported: thank you')}><Flag className="w-4 h-4" aria-hidden /></button>}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-500">Meet in a public place; never share your address on a post. Posts close after 30 days.</p>
      {adding && <NewPost onClose={() => setAdding(false)} onDone={() => { setAdding(false); void mutate(); }} />}
    </div>
  );
}

function NewPost({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: 'GIVE' as SwapKind, category: 'other' as SwapCategory, title: '', details: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post('/green/swaps', f); toast.success('Posted for your neighbours'); onDone(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t post it.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Post on the swap and repair board" onClose={onClose} footer={<div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn-primary btn-sm" disabled={busy || f.title.trim().length < 3} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Post</button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="I’m…">{(p) => <select {...p} className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SwapKind })}>{(Object.keys(SWAP_KINDS) as SwapKind[]).map((k) => <option key={k} value={k}>{SWAP_KINDS[k]}</option>)}</select>}</Field>
          <Field label="What kind of thing">{(p) => <select {...p} className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as SwapCategory })}>{(Object.keys(SWAP_CATEGORIES) as SwapCategory[]).map((k) => <option key={k} value={k}>{SWAP_CATEGORIES[k]}</option>)}</select>}</Field>
        </div>
        <Field label="What it is">{(p) => <input {...p} className="input" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.kind === 'REPAIR_OFFER' ? 'I fix punctures and brakes' : 'Kids’ bike, 16 inch'} />}</Field>
        <Field label="Details (optional)" hint="Its state, size, when you’re free. Not your address.">{(p) => <textarea {...p} className="input min-h-20" maxLength={600} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />}</Field>
      </div>
    </Sheet>
  );
}
