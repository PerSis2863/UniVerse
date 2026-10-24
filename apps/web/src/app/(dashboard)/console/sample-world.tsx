'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Database, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fmt } from '@/lib/instruments';
import { cn } from '@/lib/utils';
import { card, errorMessage, fetcher } from './shared';

// "Sample data" on the console's Overview (src/server/sample-world.ts): fills the app with a made-up
// world (300 people and their activity, 20 brands with thousands of scans, Relief and Green) one step
// per request, with a progress bar, and removes exactly that data again.

type Status = { people: number; brands: number; scans: number; relief: number; green: number; steps: string[] };

export function SampleWorldCard() {
  const { data: s, mutate } = useSWR<Status>('/owner/sample-world', fetcher);
  const { mutate: refresh } = useSWRConfig();
  const [run, setRun] = useState<{ step: number; of: number; label: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const filled = !!s && s.people > 0;

  const fill = async () => {
    if (!s) return;
    try {
      for (let i = 0; i < s.steps.length; i++) {
        setRun({ step: i, of: s.steps.length, label: s.steps[i] });
        await api.post(`/owner/sample-world/step/${i}`);
      }
      toast.success('Sample data is in', { description: 'Every section of the console now has data to look at.' });
    } catch (e) {
      toast.error(errorMessage(e), { description: 'Press Fill again to carry on: steps already done are skipped.' });
    } finally {
      setRun(null);
      await mutate();
      refresh(() => true);
    }
  };

  const remove = async () => {
    if (!confirm('Remove all sample data? Real people and brands stay as they are.')) return;
    setRemoving(true);
    try {
      const { data } = await api.post<{ removed: number }>('/owner/sample-world/clear');
      toast.success(`Sample data removed (${data.removed} sample people)`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(false);
      await mutate();
      refresh(() => true);
    }
  };

  const pct = run ? ((run.step + 0.5) / run.of) * 100 : 0;
  return (
    <section className={cn(card, 'p-5')} aria-labelledby="sample-world">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-500 text-white"><Database className="h-5 w-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <h2 id="sample-world" className="text-sm font-semibold text-zinc-900 dark:text-white">Sample data</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {filled
              ? `In now: ${fmt(s.people)} sample people, ${s.brands} brands, ${fmt(s.scans)} scans, ${fmt(s.relief)} Relief posts, ${fmt(s.green)} Green actions.`
              : 'Fill every app and every console section with a made-up world, to see how it looks busy. You can remove it again in one click.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={fill} disabled={!s || !!run || removing} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-150 hover:bg-indigo-500 active:scale-[0.97] disabled:opacity-50">
            {run ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {filled ? 'Fill again' : 'Fill with sample data'}
          </button>
          {filled && (
            <button type="button" onClick={remove} disabled={!!run || removing} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition-[transform,background-color] duration-150 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-[0.97] disabled:opacity-50">
              {removing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove sample data
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {run && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }} className="overflow-hidden">
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={run.of} aria-valuenow={run.step} aria-label="Filling sample data">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500" animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }} />
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-500" aria-live="polite">Step {run.step + 1} of {run.of} · {run.label}…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
