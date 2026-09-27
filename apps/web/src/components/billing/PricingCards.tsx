'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { PLANS, PLAN_ORDER, formatPrice, type BillingInterval, type PlanId } from '@/lib/plans';
import { cn } from '@/lib/utils';

interface PricingCardsProps {
  interval: BillingInterval;
  onIntervalChange: (i: BillingInterval) => void;
  onSelect: (plan: PlanId) => void;
  currentPlan?: PlanId;
  loadingPlan?: PlanId | null;
  /** Dark marketing styling (landing / pricing) vs. theme-aware dashboard styling. */
  variant?: 'marketing' | 'dashboard';
}

export function IntervalToggle({ interval, onChange, dark }: { interval: BillingInterval; onChange: (i: BillingInterval) => void; dark?: boolean }) {
  return (
    <div className={cn('relative inline-flex p-1 rounded-full border', dark ? 'bg-white/[0.04] border-white/10' : 'bg-zinc-100 dark:bg-white/[0.04] border-zinc-200 dark:border-white/10')}>
      {(['month', 'year'] as const).map((i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={cn(
            'relative z-10 px-5 py-2 text-sm font-bold rounded-full transition-colors',
            interval === i ? 'text-white' : dark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white',
          )}
        >
          {interval === i && (
            <motion.span layoutId="interval-pill" className="absolute inset-0 -z-10 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
          )}
          {i === 'month' ? 'Monthly' : 'Yearly'}
          {i === 'year' && <span className="ml-1.5 text-[10px] font-black text-emerald-400">−20%</span>}
        </button>
      ))}
    </div>
  );
}

export function PricingCards({ interval, onIntervalChange, onSelect, currentPlan, loadingPlan, variant = 'marketing' }: PricingCardsProps) {
  const dark = variant === 'marketing';
  return (
    <div className="flex flex-col items-center gap-10 w-full">
      <IntervalToggle interval={interval} onChange={onIntervalChange} dark={dark} />
      <div className="grid w-full gap-6 lg:grid-cols-3 items-stretch">
        {PLAN_ORDER.map((id, idx) => {
          const plan = PLANS[id];
          const price = plan.monthlyPrice[interval];
          const isCurrent = currentPlan === id;
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: idx * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              className={cn(
                'relative flex flex-col rounded-[2rem] p-8 border transition-shadow',
                plan.highlight
                  ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/20'
                  : dark ? 'border-white/[0.08]' : 'border-zinc-200 dark:border-white/[0.08]',
                dark ? 'bg-white/[0.03] backdrop-blur-sm' : 'bg-white dark:bg-zinc-900/60',
              )}
            >
              {plan.highlight && (
                <>
                  <div aria-hidden className="absolute inset-0 rounded-[2rem] bg-gradient-to-b from-indigo-500/10 via-transparent to-fuchsia-500/5 pointer-events-none" />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg">
                    <Sparkles className="w-3 h-3" /> Most popular
                  </span>
                </>
              )}
              <div className="relative">
                <h3 className={cn('text-lg font-black', dark ? 'text-white' : 'text-zinc-900 dark:text-white')}>{plan.name}</h3>
                <p className={cn('text-sm mt-1 min-h-[40px]', dark ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-400')}>{plan.tagline}</p>
                <div className="mt-6 flex items-end gap-1 h-14">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`${id}-${interval}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.25 }}
                      className={cn('text-5xl font-black tracking-tight', dark ? 'text-white' : 'text-zinc-900 dark:text-white')}
                    >
                      {price === 0 ? 'Free' : formatPrice(price)}
                    </motion.span>
                  </AnimatePresence>
                  {price > 0 && <span className={cn('pb-2 text-sm', dark ? 'text-zinc-500' : 'text-zinc-500')}>/month</span>}
                </div>
                <p className="text-xs text-zinc-500 h-4">
                  {price === 0 ? 'Free forever' : interval === 'year' ? `${formatPrice(price * 12)} billed yearly` : 'Billed monthly'}
                </p>

                <button
                  onClick={() => onSelect(id)}
                  disabled={isCurrent || loadingPlan != null}
                  className={cn(
                    'mt-8 w-full h-12 rounded-full font-bold text-sm transition-all inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed',
                    isCurrent
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                      : plan.highlight
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 active:scale-[0.98]'
                        : dark
                          ? 'bg-white text-zinc-900 hover:bg-indigo-50 active:scale-[0.98]'
                          : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 active:scale-[0.98]',
                  )}
                >
                  {loadingPlan === id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCurrent ? 'Current plan' : id === 'STARTER' ? 'Get started free' : 'Start 14-day free trial'}
                </button>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className={cn('flex items-start gap-2.5 text-sm', dark ? 'text-zinc-300' : 'text-zinc-600 dark:text-zinc-300')}>
                      <span className="mt-0.5 w-4 h-4 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-indigo-400" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
