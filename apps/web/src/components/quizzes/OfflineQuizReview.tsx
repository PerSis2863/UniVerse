'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, CloudOff, Loader2, X } from 'lucide-react';
import { api, fetcher } from '@/lib/fetcher';
import { spring } from '@/lib/motion';

// Offline-first classroom (upgrade 4): quizzes a student took offline and finished after the due
// date (or after the quiz closed). They're scored but don't count until the teacher accepts them.

interface Pending {
  id: string; score: number | null; maxScore: number | null; submittedAt: string; offlineAt: string | null; offlineStartedAt: string | null;
  student: { id: string; name: string };
  quiz: { id: string; title: string; dueDate: string | null; course: { code: string } };
}
const when = (t: string) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function OfflineQuizReview() {
  const { data, mutate } = useSWR<Pending[]>('/quizzes/teacher/offline-pending', fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  if (!data?.length) return null;

  const decide = async (p: Pending, accept: boolean) => {
    setBusy(p.id);
    try {
      await api.post(`/quizzes/offline/${p.id}/decide`, { accept });
      mutate((cur) => cur?.filter((x) => x.id !== p.id), { revalidate: false });
      toast.success(accept ? `${p.student.name}’s quiz counts now.` : `Removed. ${p.student.name} has been told.`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3" aria-label="Quizzes taken offline">
      <div>
        <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><CloudOff className="w-4 h-4 text-amber-500" /> Taken offline, finished late ({data.length})</h2>
        <p className="text-xs text-zinc-500">These students had no connection and finished after the due date. The time comes from their device. Accept to count it, or remove it.</p>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {data.map((p) => (
            <motion.li key={p.id} layout exit={{ opacity: 0, height: 0 }} transition={spring.snappy} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 px-3 py-2">
              <span className="flex-1 min-w-0 text-sm">
                <b className="text-zinc-900 dark:text-white">{p.student.name}</b> · {p.quiz.course.code} · {p.quiz.title}
                <span className="block text-xs text-zinc-500">
                  {p.offlineStartedAt ? `Started ${when(p.offlineStartedAt)} · ` : ''}finished {p.offlineAt ? when(p.offlineAt) : '?'}{p.quiz.dueDate ? ` (due ${when(p.quiz.dueDate)})` : ''} · arrived {when(p.submittedAt)}
                  {p.score != null && p.maxScore ? ` · ${p.score}/${p.maxScore}` : ''}
                </span>
              </span>
              <button type="button" className="btn-secondary btn-sm inline-flex" disabled={busy === p.id} onClick={() => void decide(p, false)}><X className="w-3.5 h-3.5" /> Remove</button>
              <button type="button" className="btn-primary btn-sm inline-flex" disabled={busy === p.id} onClick={() => void decide(p, true)}>{busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept</button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
