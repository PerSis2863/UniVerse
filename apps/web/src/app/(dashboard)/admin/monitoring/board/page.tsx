'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, EyeOff, Flag, Trash2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, MONITORING_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirmDialog } from '@/components/ui/Dialogs';
import { money } from '@/components/fees/shared';
import { authedJson } from '@/lib/authed-fetch';
import { KIND_LABEL } from '@/lib/student-life';
import { fadeUp, list } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Stage 5 · Q17 (admins): campus board posts students reported. Three reports hide a post by itself;
// restore it (the reports are cleared), keep it hidden, or delete it.

interface Reported {
  id: string; kind: string; title: string; description: string | null; price: number | null; status: string; reports: number; createdAt: string;
  user: { id: string; name: string }; reportRows: { reason: string; createdAt: string }[];
}
const KEY = '/api/admin/campus-board';

export default function AdminBoardPage() {
  const { data, error, isLoading, mutate } = useSWR<{ listings: Reported[] }>(KEY, authedJson);
  const act = async (init: RequestInit, url = KEY, ok?: string) => {
    try { await mutate(await authedJson(url, init), { revalidate: false }); if (ok) toast.success(ok); } catch (e) { toast.error((e as Error).message); }
  };
  const rows = data?.listings ?? [];
  return (
    <>
      <Topbar title="Campus board" subtitle="Posts students reported" />
      <SectionTabs tabs={MONITORING_TABS} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto w-full min-w-0 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Students sell, swap and give things away, share rides and find rooms on the campus board. A post reported by three students is hidden until you look at it here.</p>
          {error ? <div className="panel p-5"><p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p></div>
            : isLoading || !data ? <ContentSkeleton variant="list" />
            : rows.length ? (
              <motion.ul variants={list} initial="hidden" animate="show" className="space-y-3">
                {rows.map((l) => (
                  <motion.li key={l.id} variants={fadeUp} className="panel p-4 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-white break-words">{l.title}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">{KIND_LABEL[l.kind] ?? l.kind}{l.price ? ` · ${money(l.price, 'INR')}` : ''} · by {l.user.name} · {new Date(l.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1', l.status === 'HIDDEN' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300')}><Flag className="w-3.5 h-3.5" aria-hidden /> {l.reports} report{l.reports === 1 ? '' : 's'}{l.status === 'HIDDEN' ? ' · hidden' : ''}</span>
                    </div>
                    {l.description && <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line break-words line-clamp-4">{l.description}</p>}
                    <ul className="text-sm text-zinc-700 dark:text-zinc-300 list-disc ps-5">{l.reportRows.map((r, i) => <li key={i} className="break-words">“{r.reason}”</li>)}</ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => act({ method: 'PATCH', body: JSON.stringify({ id: l.id, action: 'restore' }) }, KEY, 'Restored')}><Eye className="w-4 h-4" aria-hidden /> Restore</button>
                      {l.status !== 'HIDDEN' && <button type="button" className="btn-secondary btn-sm" onClick={() => act({ method: 'PATCH', body: JSON.stringify({ id: l.id, action: 'hide' }) }, KEY, 'Hidden')}><EyeOff className="w-4 h-4" aria-hidden /> Hide</button>}
                      <button type="button" className="btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: `Delete “${l.title}”?`, confirmLabel: 'Delete', destructive: true })) await act({ method: 'DELETE' }, `/api/campus/board/${l.id}`, 'Deleted'); }}><Trash2 className="w-4 h-4" aria-hidden /> Delete</button>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            ) : <div className="panel"><EmptyState icon={Flag} title="Nothing reported" hint="Posts students report appear here." /></div>}
        </div>
      </div>
    </>
  );
}
