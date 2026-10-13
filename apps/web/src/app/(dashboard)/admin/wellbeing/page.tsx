'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Eye, HeartHandshake } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, SAFETY_TABS } from '@/components/layout/SectionTabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// Wellbeing requests, for the school's counsellors (Stage 5 · D13; permission "wellbeing.counsel"):
// only what students chose to send. Their check-ins and notes stay private.

type Req = { id: string; reason: 'ASKED' | 'PATTERN'; message: string; status: 'OPEN' | 'SEEN' | 'CLOSED'; createdAt: string; handledAt: string | null; user: { id: string; name: string; email: string } };
const STATUS = {
  OPEN: { label: 'New', cls: 'bg-amber-500/10 text-amber-800 dark:text-amber-200' },
  SEEN: { label: 'Seen', cls: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-200' },
  CLOSED: { label: 'Closed', cls: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
} as const;

export default function WellbeingRequestsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const { data, error, mutate } = useSWR<{ requests: Req[] }>('/api/wellbeing/requests', authedJson);
  const act = async (id: string, action: 'seen' | 'close') => {
    try { await authedJson('/api/wellbeing/requests', { method: 'POST', body: JSON.stringify({ id, action }) }); toast.success(action === 'seen' ? 'Marked as seen. The student has been told.' : 'Closed'); await mutate(); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t update it.')); }
  };
  return (
    <>
      <Topbar title="Wellbeing requests" subtitle="Students who asked to talk, or agreed you may be told about a hard stretch" />
      {isAdmin && <SectionTabs tabs={SAFETY_TABS} />}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">You only see what students chose to send. Their check-ins and private notes never leave their account. Reach out kindly; “Mark as seen” tells the student someone will contact them.</p>
          {error && !data ? <p className="text-sm text-rose-600 dark:text-rose-400">{errorMessage(error, 'Couldn’t load the requests.')}</p>
            : !data ? <div className="h-40 rounded-2xl skeleton" />
            : !data.requests.length ? <EmptyState icon={HeartHandshake} title="No requests" hint="When a student asks to talk, it shows here and you get a notification." />
            : (
              <ul className="space-y-2">
                {data.requests.map((r) => (
                  <li key={r.id} className={cn('panel p-4 space-y-2', r.status === 'OPEN' && 'border-amber-500/40')}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-white">{r.user.name}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">{r.user.email} · {new Date(r.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">{r.reason === 'ASKED' ? 'Asked someone to reach out.' : 'Their check-ins show a hard stretch (they agreed you may be told).'}</p>
                    {r.message && <p className="text-sm rounded-xl bg-zinc-100 dark:bg-white/[0.05] px-3 py-2 text-zinc-800 dark:text-zinc-200">“{r.message}”</p>}
                    {r.status !== 'CLOSED' && (
                      <div className="flex gap-2">
                        {r.status === 'OPEN' && <button type="button" onClick={() => void act(r.id, 'seen')} className="btn-primary btn-sm"><Eye className="w-4 h-4" /> Mark as seen</button>}
                        <button type="button" onClick={() => void act(r.id, 'close')} className="btn-secondary btn-sm"><Check className="w-4 h-4" /> Close</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </>
  );
}
