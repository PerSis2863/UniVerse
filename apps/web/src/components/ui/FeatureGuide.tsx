'use client';

import Link from '@/components/ui/Link';
import { m as motion } from 'framer-motion';
import { FlaskConical, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSampleMode } from '@/lib/sample-mode';
import { startSampleMode } from '@/components/SampleMode';

export interface FeatureGuideProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Short "how to use this" steps. */
  steps?: string[];
  /** Illustrative preview of what the page looks like once it has data (always labelled "Example"). */
  example?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

/**
 * Shown instead of fake data when a feature has nothing yet (e.g. for new users):
 * explains what the feature does, how to start, and shows a clearly-labelled example.
 */
export function FeatureGuide({ icon: Icon, title, description, steps, example, action, className }: FeatureGuideProps) {
  const ActionEl = action?.href ? Link : 'button';
  const sampleOn = useSampleMode();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative overflow-hidden rounded-3xl border border-dashed border-indigo-300/60 dark:border-indigo-400/25 bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl p-6 md:p-8',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.07] via-transparent to-fuchsia-500/[0.07] pointer-events-none" />
      <div className={cn('relative grid gap-8', example && 'lg:grid-cols-2 lg:items-center')}>
        <div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
            <Icon className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 dark:text-white">{title}</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-md leading-relaxed">{description}</p>
          {steps && steps.length > 0 && (
            <ol className="mt-5 space-y-2.5">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {action && (
              <ActionEl
                href={action.href as string}
                onClick={action.onClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white text-sm font-bold shadow-lg shadow-indigo-500/25 hover:opacity-95 transition"
              >
                {action.label}
              </ActionEl>
            )}
            {!sampleOn && (
              <button
                onClick={startSampleMode}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-400/60 bg-amber-400/10 text-amber-700 dark:text-amber-300 text-sm font-bold hover:bg-amber-400/20 transition"
              >
                <FlaskConical className="w-4 h-4" /> Try it with sample data
              </button>
            )}
          </div>
          {!sampleOn && <p className="mt-2 text-xs text-zinc-500">Fills the whole app with example data so you can click around. Nothing is saved.</p>}
        </div>
        {example && (
          <div className="relative">
            <span className="absolute -top-3 left-4 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400 text-amber-950 shadow">
              <Sparkles className="w-3 h-3" /> Example
            </span>
            <div aria-hidden className="pointer-events-none select-none rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-[#0f1322]/80 p-4 opacity-90">
              {example}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** A compact example row used inside FeatureGuide previews. */
export function ExampleRow({ title, meta, right, accent = 'from-indigo-500 to-violet-500' }: { title: string; meta?: string; right?: string; accent?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06] mb-2 last:mb-0">
      <span className={cn('w-9 h-9 rounded-xl bg-gradient-to-br shrink-0', accent)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{title}</p>
        {meta && <p className="text-xs text-zinc-500 truncate">{meta}</p>}
      </div>
      {right && <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 shrink-0">{right}</span>}
    </div>
  );
}
