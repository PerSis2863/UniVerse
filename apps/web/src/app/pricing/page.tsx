'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import { Check, Minus, ShieldCheck } from 'lucide-react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { PricingCards } from '@/components/billing/PricingCards';
import { PLAN_ORDER, PLANS, type BillingInterval, type PlanId } from '@/lib/plans';

type Row = { label: string; plans: PlanId[] | Partial<Record<PlanId, string>> };

const MATRIX: { group: string; rows: Row[] }[] = [
  {
    group: 'Core platform',
    rows: [
      { label: 'Student, teacher & admin portals', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'Courses, grades, attendance & timetable', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'Real-time messaging, groups & announcements', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'NGO project & internship marketplace', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'Blockchain-verified credentials', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'AI study assistant', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
      { label: 'Installable app (iOS, Android, desktop)', plans: ['STARTER', 'PRO', 'ENTERPRISE'] },
    ],
  },
  {
    group: 'Insights & reporting',
    rows: [
      { label: 'Advanced analytics dashboard', plans: ['PRO', 'ENTERPRISE'] },
      { label: 'CSV exports (members, impact, applications)', plans: ['PRO', 'ENTERPRISE'] },
      { label: 'AI executive impact reports', plans: ['ENTERPRISE'] },
    ],
  },
  {
    group: 'Support & billing',
    rows: [
      { label: 'Support', plans: { STARTER: 'Community', PRO: 'Priority email', ENTERPRISE: 'Priority + onboarding' } },
      { label: 'Invoiced billing', plans: ['ENTERPRISE'] },
    ],
  },
];

function Cell({ row, plan }: { row: Row; plan: PlanId }) {
  if (Array.isArray(row.plans)) {
    return row.plans.includes(plan)
      ? <Check className="w-4 h-4 text-indigo-400 mx-auto" strokeWidth={3} />
      : <Minus className="w-4 h-4 text-zinc-700 mx-auto" />;
  }
  return <span className="text-sm text-zinc-300">{row.plans[plan]}</span>;
}

export default function PricingPage() {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>('year');

  return (
    <MotionConfig reducedMotion="user">
      <div className="dark min-h-screen overflow-x-clip font-sans" style={{ backgroundColor: '#0a0d13', color: '#fff' }}>
        <div aria-hidden className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-35%] left-1/2 -translate-x-1/2 w-[110vw] h-[80vw]" style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.25), transparent)' }} />
        </div>
        <MarketingNav />

        <main className="relative z-10 px-6 pt-36 md:pt-44 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-center max-w-3xl mx-auto mb-14"
          >
            <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-4">Pricing</span>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">Plans for every organization</h1>
            <p className="text-zinc-400 text-lg mt-5">Free for students, forever. Start any paid plan with a 14-day free trial — cancel anytime.</p>
          </motion.div>

          <div className="max-w-6xl mx-auto">
            <PricingCards interval={interval} onIntervalChange={setInterval} onSelect={() => router.push('/register')} />
          </div>

          {/* Comparison table */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="max-w-5xl mx-auto mt-28"
          >
            <h2 className="text-2xl md:text-3xl font-black text-center mb-10">Compare plans</h2>
            <div className="overflow-x-auto rounded-3xl border border-white/[0.07] bg-white/[0.02]">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <th className="p-5 text-sm font-semibold text-zinc-500 w-2/5">Features</th>
                    {PLAN_ORDER.map((id) => (
                      <th key={id} className={`p-5 text-center text-sm font-black ${PLANS[id].highlight ? 'text-indigo-300' : 'text-white'}`}>{PLANS[id].name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((g) => (
                    <Fragment key={g.group}>
                      <tr><td colSpan={4} className="px-5 pt-7 pb-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{g.group}</td></tr>
                      {g.rows.map((r) => (
                        <tr key={r.label} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5 text-sm text-zinc-300">{r.label}</td>
                          {PLAN_ORDER.map((id) => <td key={id} className="px-5 py-3.5 text-center"><Cell row={r} plan={id} /></td>)}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secure payments by Stripe · Prices in USD, excluding applicable taxes
            </p>
          </motion.div>
        </main>

        <MarketingFooter />
      </div>
    </MotionConfig>
  );
}
