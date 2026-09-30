'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { CreditCard, Crown, Loader2, ShieldCheck, CalendarClock, AlertTriangle, FileText } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { PricingCards } from '@/components/billing/PricingCards';
import { SupportPanel } from '@/components/billing/SupportPanel';
import { ContactSalesDialog } from '@/components/billing/ContactSalesDialog';
import { useSubscription } from '@/hooks/useSubscription';
import { authedJson } from '@/lib/authed-fetch';
import { PLANS, isPaidPlan, type BillingInterval, type PlanId } from '@/lib/plans';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-emerald-500/10 text-emerald-500' },
  trialing: { label: 'Free trial', tone: 'bg-indigo-500/10 text-indigo-500' },
  past_due: { label: 'Payment failed', tone: 'bg-amber-500/10 text-amber-500' },
  unpaid: { label: 'Unpaid', tone: 'bg-rose-500/10 text-rose-500' },
  canceled: { label: 'Canceled', tone: 'bg-zinc-500/10 text-zinc-500' },
  incomplete: { label: 'Awaiting payment', tone: 'bg-amber-500/10 text-amber-500' },
};

function BillingContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { subscription, plan, isLoading, error, refresh } = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>('year');
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  // Plans we quote individually open a "Contact us" form (also from ?contact=ENTERPRISE links).
  const [contact, setContact] = useState<PlanId | null>(() => {
    const c = params.get('contact');
    return c && c in PLANS && PLANS[c as PlanId].contactSales ? (c as PlanId) : null;
  });
  const handledStatus = useRef(false);

  useEffect(() => {
    if (handledStatus.current) return;
    const status = params.get('status');
    if (status === 'success') {
      toast.success('Welcome aboard! Your subscription is being activated.', { description: 'Premium features unlock as soon as Stripe confirms — usually a few seconds.' });
      // The webhook may land a moment after the redirect; poll briefly.
      [2000, 5000, 10000].forEach((ms) => setTimeout(() => refresh(), ms));
    } else if (status === 'invoice') {
      toast.success('Enterprise plan activated — invoice billing is set up.', { description: 'Your 14-day trial has started. Stripe will email your first invoice (30-day terms) when it ends.' });
      refresh();
    } else if (status === 'canceled') {
      toast('Checkout canceled — no charge was made.');
    }
    if (status) {
      handledStatus.current = true;
      router.replace('/admin/billing');
    }
  }, [params, router, refresh]);

  const startCheckout = async (id: PlanId, payBy: 'card' | 'invoice' = 'card') => {
    if (!isPaidPlan(id)) return;
    setLoadingPlan(id);
    try {
      const { url } = await authedJson<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: id, interval, payBy }),
      });
      window.location.href = url;
    } catch (e: any) {
      if (e.body?.manage) return openPortal();
      toast.error(e.message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await authedJson<{ url: string }>('/api/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message);
      setPortalLoading(false);
    }
  };

  const status = subscription?.status ? STATUS_LABEL[subscription.status] : null;
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null;

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto space-y-10">
      {error && <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 text-sm">{(error as Error).message}</div>}

      {/* Current plan */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-zinc-200 dark:border-white/[0.06] bg-gradient-to-br from-white to-indigo-50/60 dark:from-zinc-900/70 dark:to-indigo-950/30 p-6 md:p-8"
      >
        <div aria-hidden className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{subscription?.organization.name ?? 'Your organization'}</div>
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-2xl font-black text-zinc-900 dark:text-white">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${PLANS[plan].name} plan`}
                </h2>
                {status && <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${status.tone}`}>{status.label}</span>}
              </div>
              {periodEnd && (
                <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {subscription?.cancelAtPeriodEnd ? `Access ends ${periodEnd}` : subscription?.status === 'trialing' ? `Trial ends ${periodEnd}` : `Renews ${periodEnd}`}
                  {subscription?.interval && ` · billed ${subscription.interval === 'year' ? 'yearly' : 'monthly'}`}
                </p>
              )}
            </div>
          </div>
          {subscription?.hasBillingAccount && (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Manage billing & invoices
            </button>
          )}
        </div>
        {(subscription?.status === 'past_due' || subscription?.status === 'unpaid') && (
          <div className="relative mt-6 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Your last payment failed. Update your card in “Manage billing” to keep premium features.
          </div>
        )}
      </motion.div>

      <PricingCards
        variant="dashboard"
        interval={interval}
        onIntervalChange={setInterval}
        currentPlan={plan}
        loadingPlan={loadingPlan}
        onSelect={(id) => (PLANS[id].contactSales ? setContact(id) : id === 'STARTER' || subscription?.hasBillingAccount && plan !== 'STARTER' ? openPortal() : startCheckout(id))}
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-5">
        <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
          <FileText className="w-5 h-5 text-fuchsia-500 shrink-0" />
          <span><strong className="text-zinc-900 dark:text-white">Need a custom plan or invoiced billing?</strong> We tailor Enterprise to your institution: campuses, number of students and how you pay.</span>
        </div>
        <button
          onClick={() => setContact('ENTERPRISE')}
          className="shrink-0 inline-flex items-center gap-2 h-10 px-5 rounded-full border border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-300 font-bold text-sm hover:bg-fuchsia-500/10"
        >
          Contact us
        </button>
      </div>

      <SupportPanel plan={plan} />
      {contact && <ContactSalesDialog plan={contact} onClose={() => setContact(null)} />}

      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500 pb-6">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Payments processed securely by Stripe</span>
        <span>14-day free trial on Pro</span>
        <span>Cancel anytime</span>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <>
      <Topbar title="Billing & Plans" subtitle="Manage your organization's subscription" />
      <Suspense fallback={<div className="flex-1 p-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>}>
        <BillingContent />
      </Suspense>
    </>
  );
}
