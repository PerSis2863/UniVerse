import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getStripe, requireAdmin } from '@/lib/billing';
import { PLANS, isPaidPlan, type BillingInterval } from '@/lib/plans';

// Starts a Stripe Checkout subscription for the admin's organization. Prices come from
// lib/plans.ts via inline price_data, so no products need to be pre-created in Stripe.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { user, org } = auth;

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Billing is not configured (missing STRIPE_SECRET_KEY).' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const planId = String(body.plan ?? '');
  const interval: BillingInterval = body.interval === 'year' ? 'year' : 'month';
  if (!isPaidPlan(planId)) return NextResponse.json({ error: 'Choose a paid plan.' }, { status: 400 });

  // An existing subscription is changed in the billing portal, not by stacking a second one.
  if (org.stripeSubscriptionId && org.subscriptionStatus && org.subscriptionStatus !== 'canceled') {
    return NextResponse.json({ error: 'You already have a subscription. Use "Manage billing" to change plans.', manage: true }, { status: 409 });
  }

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: org.name,
      metadata: { organizationId: org.id, ownerId: user.id },
    });
    customerId = customer.id;
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } });
  }

  const plan = PLANS[planId];
  const monthly = plan.monthlyPrice[interval];
  const origin = new URL(req.url).origin;
  const metadata = { organizationId: org.id, plan: plan.id };

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: interval === 'year' ? monthly * 12 : monthly,
        recurring: { interval },
        product_data: { name: `UniVerse ${plan.name}`, metadata: { plan: plan.id } },
      },
    }],
    subscription_data: { metadata, trial_period_days: 14 },
    metadata,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: `${origin}/admin/billing?status=success`,
    cancel_url: `${origin}/admin/billing?status=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
