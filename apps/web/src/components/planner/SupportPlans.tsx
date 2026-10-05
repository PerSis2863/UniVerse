'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Check, HeartHandshake } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Study planner → plans a teacher made for me (upgrade 3, early help). Written as encouragement:
// what to do this week, from whom; the student ticks steps off and the teacher sees progress.

interface MyPlan {
  id: string; course: { code: string; name: string } | null; from: string; message: string | null; stepsDone: number[]; active: boolean; createdAt: string;
  plan: { intro: string; steps: { title: string; detail: string; minutes: number }[]; closing: string };
}

export function SupportPlans() {
  const { data, mutate } = useSWR<{ plans: MyPlan[] }>('/api/student/support-plans', authedJson, { revalidateOnFocus: false });
  const plans = data?.plans ?? [];
  if (!plans.length) return null;

  const tick = async (p: MyPlan, step: number, done: boolean) => {
    const next = done ? [...p.stepsDone, step] : p.stepsDone.filter((x) => x !== step);
    await mutate((d) => d && { plans: d.plans.map((x) => (x.id === p.id ? { ...x, stepsDone: next } : x)) }, { revalidate: false });
    try {
      await authedJson(`/api/support-plans/${p.id}`, { method: 'PATCH', body: JSON.stringify({ step, done }) });
      if (done && next.length === p.plan.steps.length) toast.success('Every step done. Nice work!');
    } catch (e) { toast.error((e as Error).message); void mutate(); }
  };

  return (
    <section id="support" className="space-y-3 scroll-mt-20">
      {plans.map((p) => {
        const done = p.stepsDone.length;
        const total = p.plan.steps.length;
        return (
          <motion.article key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
            className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.07] via-white/60 to-fuchsia-500/[0.07] dark:via-white/[0.02] p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-fuchsia-500/20"><HeartHandshake className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{p.course?.code ?? 'Your course'} · from {p.from}</p>
                <h2 className="font-bold text-zinc-900 dark:text-white">Your plan for this week</h2>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{p.plan.intro}</p>
                {p.message && <p className="mt-2 text-sm italic text-zinc-600 dark:text-zinc-300">“{p.message}” — {p.from.split(' ')[0]}</p>}
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums text-zinc-500">{done}/{total}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-zinc-200/70 dark:bg-white/10 overflow-hidden">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={spring.smooth} />
            </div>
            <ol className="mt-4 space-y-2">
              {p.plan.steps.map((s, i) => {
                const on = p.stepsDone.includes(i);
                return (
                  <li key={i}>
                    <button type="button" onClick={() => p.active && void tick(p, i, !on)} disabled={!p.active} aria-pressed={on}
                      className={cn('w-full text-left flex items-start gap-3 rounded-2xl p-3 border transition-colors', on ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-zinc-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.03] hover:border-indigo-400/40')}>
                      <motion.span animate={{ scale: on ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.25 }}
                        className={cn('mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2', on ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-white/25')}>
                        {on && <Check className="w-3 h-3" />}
                      </motion.span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm font-semibold', on ? 'text-zinc-500 line-through decoration-emerald-500/50' : 'text-zinc-900 dark:text-white')}>{s.title}</span>
                        <span className="block text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{s.detail}</span>
                      </span>
                      <span className="text-[11px] text-zinc-500 shrink-0">{s.minutes} min</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {p.plan.closing && <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">{p.plan.closing}</p>}
          </motion.article>
        );
      })}
    </section>
  );
}
