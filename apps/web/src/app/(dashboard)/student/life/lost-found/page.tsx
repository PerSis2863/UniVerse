'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Loader2, MapPin, MessageCircle, PackageSearch, Plus, Trash2, X } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, LIFE_TABS } from '@/components/layout/SectionTabs';
import { confirmDialog } from '@/components/ui/Dialogs';
import { authedJson } from '@/lib/authed-fetch';
import { uploadChatFile } from '@/components/chat/chat-client';
import { useAuthStore } from '@/store/auth';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { LostFoundItem } from '@/components/campus/lost-found';

// Lost & found (upgrade 7): post something you lost or found (with a photo if you like). Posts show
// for 30 days. "Message them" opens a one-to-one chat with the person who posted it.


const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const input = 'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500';
const ago = (iso: string, now: number) => {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const TABS = [{ id: 'FOUND', label: 'Found' }, { id: 'LOST', label: 'Lost' }, { id: 'mine', label: 'My posts' }] as const;

export default function LostFoundPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('FOUND');
  const key = tab === 'mine' ? '/api/campus/lost-found?mine=1' : `/api/campus/lost-found?kind=${tab}`;
  const { data, isLoading, error, mutate } = useSWR<LostFoundItem[]>(key, authedJson);
  const [form, setForm] = useState(false);
  const [now] = useState(() => Date.now());

  const message = async (it: LostFoundItem) => {
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: it.reporter.id }) });
      router.push(`/student/inbox?c=${id}`);
    } catch (e) { toast.error((e as Error).message); }
  };
  const setStatus = async (it: LostFoundItem, status: 'OPEN' | 'RESOLVED') => {
    try { await authedJson(`/api/campus/lost-found/${it.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); void mutate(); toast.success(status === 'RESOLVED' ? 'Marked as sorted. Glad it worked out!' : 'Shown again for 30 days.'); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (it: LostFoundItem) => {
    if (!(await confirmDialog({ title: `Delete “${it.title}”?`, destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/campus/lost-found/${it.id}`, { method: 'DELETE' }); void mutate(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Topbar title="Lost & found" subtitle="Lost something on campus, or found something that isn’t yours?" />
      <SectionTabs tabs={LIFE_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-white/[0.05]" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('relative px-3 py-1.5 text-sm font-medium rounded-lg', tab === t.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-500')}>
                  {tab === t.id && <motion.span layoutId="lf-tab" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-white dark:bg-white/10 shadow-sm" />}
                  <span className="relative">{t.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary btn-sm rounded-full" onClick={() => setForm(true)}><Plus className="w-4 h-4" /> Post</button>
          </div>
          <AnimatePresence>{form && <ReportForm onClose={() => setForm(false)} onDone={(kind) => { setForm(false); setTab(kind); void mutate(); }} />}</AnimatePresence>
          {isLoading ? (
            <div className="grid sm:grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-2xl skeleton" />)}</div>
          ) : error ? (
            <p className="text-sm text-rose-500">{(error as Error).message}</p>
          ) : !data?.length ? (
            <div className={`${card} p-8 text-center space-y-2`}>
              <PackageSearch className="w-10 h-10 text-zinc-400 mx-auto" />
              <p className="font-semibold text-zinc-900 dark:text-white">{tab === 'mine' ? 'You haven’t posted anything' : tab === 'FOUND' ? 'Nothing found lately' : 'Nothing reported lost'}</p>
              <p className="text-sm text-zinc-500">Posts stay up for 30 days. Tap Post to add one.</p>
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              <AnimatePresence initial={false}>
                {data.map((it) => {
                  const mine = it.reporter.id === me;
                  return (
                    <motion.li key={it.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.smooth} className={`${card} overflow-hidden flex flex-col`}>
                      {it.photoUrl && (<>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a student's photo from our own storage; next/image can't optimise on Workers */}
                        <img src={it.photoUrl} alt="" loading="lazy" className="w-full h-40 object-cover bg-zinc-100 dark:bg-white/5" />
                      </>)}
                      <div className="p-4 space-y-2 flex-1 flex flex-col">
                        <div className="flex items-start gap-2">
                          <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', it.kind === 'FOUND' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>{it.kind === 'FOUND' ? 'Found' : 'Lost'}</span>
                          <p className="font-semibold text-zinc-900 dark:text-white flex-1">{it.title}</p>
                        </div>
                        {it.description && <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-line">{it.description}</p>}
                        <p className="text-xs text-zinc-500 flex flex-wrap gap-x-2">
                          {it.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{it.location}</span>}
                          <span>{mine ? 'You' : it.reporter.name} · {ago(it.createdAt, now)}</span>
                          {it.status !== 'OPEN' && <span className="font-semibold">{it.status === 'RESOLVED' ? 'Sorted' : 'Removed by an admin'}</span>}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                          {!mine && <button type="button" className="btn-secondary btn-sm rounded-full inline-flex" onClick={() => void message(it)}><MessageCircle className="w-4 h-4" /> Message them</button>}
                          {mine && it.status === 'OPEN' && <button type="button" className="btn-secondary btn-sm rounded-full inline-flex" onClick={() => void setStatus(it, 'RESOLVED')}><CheckCircle2 className="w-4 h-4" /> Sorted</button>}
                          {mine && it.status === 'RESOLVED' && <button type="button" className="btn-ghost btn-sm" onClick={() => void setStatus(it, 'OPEN')}>Show again</button>}
                          {mine && <button type="button" className="btn-ghost btn-sm text-rose-500 ml-auto" onClick={() => void remove(it)} aria-label={`Delete ${it.title}`}><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function ReportForm({ onClose, onDone }: { onClose: () => void; onDone: (kind: 'LOST' | 'FOUND') => void }) {
  const [kind, setKind] = useState<'LOST' | 'FOUND'>('FOUND');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setBusy(true);
    try {
      const photoUrl = photo ? await uploadChatFile(photo) : null;
      await authedJson('/api/campus/lost-found', { method: 'POST', body: JSON.stringify({ kind, title, description, location, photoUrl }) });
      toast.success('Posted. It shows for 30 days.');
      onDone(kind);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring.smooth} className="overflow-hidden">
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <div className="inline-flex gap-1">
            {(['FOUND', 'LOST'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium', kind === k ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300')}>{k === 'FOUND' ? 'I found something' : 'I lost something'}</button>)}
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel" className="p-1 text-zinc-500"><X className="w-4 h-4" /></button>
        </div>
        <input className={input} placeholder="What is it? e.g. Blue water bottle" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={`${input} min-h-[70px]`} placeholder="Details (no personal info like card numbers)" maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className={input} placeholder={kind === 'FOUND' ? 'Where you found it, and where it is now' : 'Where you last had it'} maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn-secondary btn-sm inline-flex" onClick={() => fileRef.current?.click()}><Camera className="w-4 h-4" /> {photo ? 'Change photo' : 'Add a photo'}</button>
          {photo && <span className="text-xs text-zinc-500 truncate">{photo.name}</span>}
          <button type="button" className="btn-primary btn-sm ml-auto" disabled={busy || title.trim().length < 2} onClick={() => void save()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Post</button>
        </div>
      </div>
    </motion.div>
  );
}
