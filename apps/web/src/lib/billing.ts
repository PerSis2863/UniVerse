import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/server-auth';
import { effectivePlan, hasFeature, FEATURE_INFO, type PlanId, type PremiumFeature } from '@/lib/plans';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' as any });
  return stripeClient;
}

/** The organization owned by this admin, created on first use with the free Starter plan. */
export async function getOrCreateOrganization(user: SessionUser) {
  return prisma.organization.upsert({
    where: { ownerId: user.id },
    update: {},
    create: { ownerId: user.id, name: `${user.name}'s Organization` },
  });
}

type Authorized = { user: SessionUser; org: Awaited<ReturnType<typeof getOrCreateOrganization>>; plan: PlanId };

/** Signed-in admin + their organization, or an error response to return as-is. */
export async function requireAdmin(req: Request): Promise<Authorized | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only organization admins can manage billing.' }, { status: 403 });
  }
  const org = await getOrCreateOrganization(user);
  return { user, org, plan: effectivePlan(org) };
}

/** Like requireAdmin, but also rejects with 402 unless the organization's plan unlocks `feature`. */
export async function requireFeature(req: Request, feature: PremiumFeature): Promise<Authorized | NextResponse> {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  if (!hasFeature(auth.plan, feature)) {
    const info = FEATURE_INFO[feature];
    return NextResponse.json(
      { error: `${info.name} requires the ${info.minPlan === 'PRO' ? 'Pro' : 'Enterprise'} plan.`, upgradeRequired: true, minPlan: info.minPlan },
      { status: 402 },
    );
  }
  return auth;
}

/** Copies a Stripe subscription's state onto the organization it belongs to. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.organizationId;
  const plan = sub.metadata?.plan as PlanId | undefined;
  const where = orgId ? { id: orgId } : { stripeSubscriptionId: sub.id };
  const item = sub.items.data[0];
  // current_period_end moved from the subscription to its items in newer Stripe API versions.
  const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end;
  const ended = sub.status === 'canceled' || sub.status === 'incomplete_expired';

  await prisma.organization.updateMany({
    where,
    data: {
      plan: ended ? 'STARTER' : plan ?? undefined,
      subscriptionStatus: sub.status,
      billingInterval: item?.price?.recurring?.interval ?? null,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripeSubscriptionId: ended ? null : sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}
