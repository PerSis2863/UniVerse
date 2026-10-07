'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, MapPin, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, MONITORING_TABS } from '@/components/layout/SectionTabs';
import { confirmDialog } from '@/components/ui/Dialogs';
import { AdminSearch } from '@/components/admin/AdminPeople';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { LostFoundItem } from '@/components/campus/lost-found';

// Lost & found moderation (upgrade 7): every post, including sorted and expired ones. Hiding a post
// tells the person who posted it (in the app, never by email).


export default function AdminLostFoundPage() {
  const { data, isLoading, mutate } = useSWR<LostFoundItem[]>('/api/campus/lost-found?all=1', authedJson);
  const [q, setQ] = useState('');
  const [now] = useState(() => Date.now());
  const term = q.trim().toLowerCase();
  const rows = (data ?? []).filter((it) => !term || `${it.title} ${it.description ?? ''} ${it.location ?? ''} ${it.reporter.name}`.toLowerCase().includes(term));

  const setStatus = async (it: LostFoundItem, status: 'OPEN' | 'HIDDEN') => {
    try { await authedJson(`/api/campus/lost-found/${it.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); void mutate(); toast.success(status === 'HIDDEN' ? 'Hidden. The person who posted it was told.' : 'Shown again for 30 days.'); }
    catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (it: LostFoundItem) => {
    if (!(await confirmDialog({ title: `Delete “${it.title}”?`, destructive: true, confirmLabel: 'Delete' }))) return;
    try { await authedJson(`/api/campus/lost-found/${it.id}`, { method: 'DELETE' }); void mutate(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Topbar title="Lost & found" subtitle="Everything students have posted, and hiding what shouldn’t be there" />
      <SectionTabs tabs={MONITORING_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <AdminSearch value={q} onChange={setQ} placeholder="Search items, places or who posted them…" />
          {isLoading ? <div className="h-32 rounded-2xl skeleton" /> : !rows.length ? (
            <p className={`panel p-6 text-sm text-zinc-500 text-center`}>{data?.length ? `Nothing matches “${q}”.` : 'No posts yet.'}</p>
          ) : (
            <ul className={`panel divide-y divide-zinc-100 dark:divide-white/[0.05]`}>
              <AnimatePresence initial={false}>
                {rows.map((it) => (
                  <motion.li key={it.id} layout exit={{ opacity: 0, height: 0 }} transition={spring.snappy} className="p-3 flex items-center gap-3">
                    {it.photoUrl ? (<>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a student's photo from our own storage; next/image can't optimise on Workers */}
                      <img src={it.photoUrl} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    </>) : <span className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-white/5 shrink-0" />}
                    <span className="flex-1 min-w-0 text-sm">
                      <span className={cn('text-[10px] font-bold uppercase mr-1.5', it.kind === 'FOUND' ? 'text-emerald-500' : 'text-amber-500')}>{it.kind}</span>
                      <b className="text-zinc-900 dark:text-white">{it.title}</b>
                      <span className="block text-xs text-zinc-500 truncate">
                        {it.reporter.name} · {new Date(it.createdAt).toLocaleDateString()}{it.location ? <> · <MapPin className="inline w-3 h-3" /> {it.location}</> : null} · {it.status === 'OPEN' ? (Date.parse(it.expiresAt) < now ? 'expired' : 'open') : it.status.toLowerCase()}
                      </span>
                    </span>
                    {it.status === 'HIDDEN'
                      ? <button type="button" className="btn-ghost btn-sm" onClick={() => void setStatus(it, 'OPEN')} aria-label={`Show ${it.title} again`}><Eye className="w-4 h-4" /></button>
                      : <button type="button" className="btn-ghost btn-sm" onClick={() => void setStatus(it, 'HIDDEN')} aria-label={`Hide ${it.title}`}><EyeOff className="w-4 h-4" /></button>}
                    <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => void remove(it)} aria-label={`Delete ${it.title}`}><Trash2 className="w-4 h-4" /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
