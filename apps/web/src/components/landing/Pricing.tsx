'use client';

import { useState } from 'react';
import { m as motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Link from '@/components/ui/Link';
import { PLANS, PLAN_ORDER, type BillingInterval } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { Accent, EASE, Reveal, Tag, glass, primary, ghost } from './bits';

// "You pay per school, not per student": a slider for the number of students shows what Pro costs
// a student a month, with the three plans (from src/lib/plans.ts, the same prices as Billing).

const MIN = 50, MAX = 20000;
// The slider moves on a log scale: 50 → 20,000 in even steps.
const toStudents = (v: number) => Math.round(Math.exp(Math.log(MIN) + (v / 1000) * (Math.log(MAX) - Math.log(MIN))) / 10) * 10 || MIN;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function Pricing() {
  const [v, setV] = useState(420);
  const [interval, setBilling] = useState<BillingInterval>('year');
  const students = toStudents(v);
  const pro = PLANS.PRO.monthlyPrice[interval];
  const perStudent = pro / students; // cents

  return (
    <section id="pricing" data-no-motion className="relative px-6 py-28 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <Reveal><Tag>pricing</Tag></Reveal>
        <div className="mt-5 grid md:grid-cols-2 gap-8 items-end">
          <Reveal delay={0.05}><h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] text-white">You pay per school, <Accent>not per student.</Accent></h2></Reveal>
          <Reveal delay={0.1}><p className="text-zinc-400 md:max-w-md md:ms-auto">Students never pay. A school picks a plan, and every student, teacher and parent in it is included.</p></Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className={`${glass} mt-12 p-6 sm:p-8 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center`}>
            <div>
              <label htmlFor="students" className="text-sm text-zinc-300">How many students does your school have?</label>
              <p className="mt-3 text-5xl font-bold tracking-tight text-white tabular-nums">{students.toLocaleString('en-US')}{students >= MAX ? '+' : ''}</p>
              <input id="students" type="range" min={0} max={1000} value={v} onChange={(e) => setV(Number(e.target.value))}
                aria-valuetext={`${students} students`} className="pricing-range mt-6 w-full" />
              <div className="mt-2 flex justify-between font-mono text-xs text-zinc-400"><span>{MIN}</span><span>{MAX.toLocaleString('en-US')}+</span></div>
            </div>
            <div className="rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Pro, for the whole school</p>
                <div className="inline-flex rounded-full bg-black/30 p-0.5 text-xs" role="group" aria-label="Billing">
                  {(['month', 'year'] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setBilling(k)} aria-pressed={interval === k}
                      className={cn('h-7 px-3 rounded-full transition-colors', interval === k ? 'bg-white text-zinc-900 font-semibold' : 'text-zinc-300 hover:text-white')}>
                      {k === 'month' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-5xl font-bold text-white tabular-nums">{money(pro)}<span className="text-base font-medium text-zinc-300"> / month</span></p>
              <p className="mt-2 font-mono text-xs text-zinc-300">{interval === 'year' ? 'billed yearly' : 'billed monthly'} · about <motion.span key={students + interval} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="text-white">{perStudent < 100 ? `${Math.max(1, Math.round(perStudent))}¢` : money(Math.round(perStudent))}</motion.span> a student a month</p>
            </div>
          </div>
        </Reveal>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {PLAN_ORDER.map((id, i) => {
            const p = PLANS[id];
            const price = p.monthlyPrice[interval];
            return (
              <Reveal key={id} delay={i * 0.06}>
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.3, ease: EASE }}
                  className={cn(glass, 'h-full p-6 flex flex-col', p.highlight && 'border-fuchsia-400/30 shadow-[0_30px_80px_-40px_rgba(192,38,211,0.6)]')}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                    {p.highlight && <span className="font-mono text-[11px] text-fuchsia-200 border border-fuchsia-400/30 rounded-full px-2 py-0.5">most schools</span>}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{p.tagline}</p>
                  <p className="mt-5 text-3xl font-bold text-white">{p.contactSales ? 'Let’s talk' : price ? <>{money(price)}<span className="text-sm font-medium text-zinc-400"> / month</span></> : 'Free'}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-zinc-300 flex-1">
                    {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="w-4 h-4 mt-0.5 shrink-0 text-fuchsia-300" />{f}</li>)}
                  </ul>
                  <Link href={p.contactSales ? '/contact#sales' : '/register'} className={cn('mt-6 w-full', p.highlight ? primary : ghost)}>
                    {p.contactSales ? 'Talk to us' : p.monthlyPrice.month ? 'Start a 14-day trial' : 'Start free'}
                  </Link>
                </motion.div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
