'use client';

import Link from '@/components/ui/Link';
import { m as motion } from 'framer-motion';
import { Lock, Sparkles, ArrowRight, Check } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { FEATURE_INFO, PLANS, formatPrice, type PremiumFeature } from '@/lib/plans';

/** Renders children only when the organization's plan unlocks `feature`; otherwise an upgrade panel. */
export function PremiumGate({ feature, children }: { feature: PremiumFeature; children: React.ReactNode }) {
  const { can, isLoading, error } = useSubscription();

  if (isLoading) {
    return (
      <div className="flex-1 p-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-3xl bg-zinc-100 dark:bg-white/[0.04] animate-pulse" />)}
      </div>
    );
  }
  if (error && (error as any).status !== 402) {
    return <div className="flex-1 p-8 text-sm text-zinc-500">Couldn&apos;t load your subscription: {(error as Error).message}</div>;
  }
  if (can(feature)) return <>{children}</>;

  const info = FEATURE_INFO[feature];
  const plan = PLANS[info.minPlan];
  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative max-w-2xl mx-auto overflow-hidden rounded-[2rem] border border-indigo-500/20 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 dark:from-indigo-950/40 dark:via-zinc-950 dark:to-fuchsia-950/30 p-8 md:p-12 text-center"
      >
        <motion.div
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-conic from-indigo-500/20 via-fuchsia-500/20 to-indigo-500/20 blur-3xl"
        />
        <div className="relative">
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 mb-4">
            <Sparkles className="w-3 h-3" /> {plan.name} feature
          </span>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white mb-3">{info.name}</h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-8">{info.description}</p>
          <ul className="inline-flex flex-col gap-2 text-left mb-8">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={plan.contactSales ? `/admin/billing?contact=${plan.id}` : `/admin/billing?plan=${plan.id}`}
              className="btn-primary btn-lg group rounded-full"
            >
              {plan.contactSales ? `Contact us about ${plan.name}` : 'Start 14-day free trial'} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/admin/billing" className="inline-flex items-center justify-center h-12 px-6 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
              Compare plans
            </Link>
          </div>
          <p className="mt-5 text-xs text-zinc-500">{plan.contactSales ? 'Priced for your institution · our team will get back to you' : `From ${formatPrice(plan.monthlyPrice.year)}/month billed yearly · cancel anytime`}</p>
        </div>
      </motion.div>
    </div>
  );
}

export function PlanBadge({ plan }: { plan: 'PRO' | 'ENTERPRISE' }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wider bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white">
      {plan === 'PRO' ? 'PRO' : 'ENT'}
    </span>
  );
}
