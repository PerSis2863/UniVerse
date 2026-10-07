import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/server-auth';
import { effectivePlan, hasFeature, FEATURE_INFO, type PlanId, type PremiumFeature } from '@/lib/plans';

let stripeClient: { key: string; client: Stripe } | null = null;

/** The Stripe secret key as saved on the Worker, without the spaces or line breaks a paste can add. */
export const stripeSecretKey = () => (process.env.STRIPE_SECRET_KEY ?? '').trim().replace(/^["']|["']$/g, '');

/** What's wrong with the saved key at a glance (the owner sees this in console → Errors), or null. */
export function stripeKeyProblem(): string | null {
  const key = stripeSecretKey();
  if (!key) return 'the STRIPE_SECRET_KEY secret is not set on the Cloudflare Worker (it must be a Secret, not a plain Variable, or the next deploy removes it).';
  if (key.startsWith('pk_')) return 'STRIPE_SECRET_KEY holds the publishable key (pk_…). Use the secret key (sk_live_…) from Stripe → Developers → API keys.';
  if (key.startsWith('whsec_')) return 'STRIPE_SECRET_KEY holds the webhook signing secret (whsec_…). That one belongs in STRIPE_WEBHOOK_SECRET; use the secret key (sk_live_…) here.';
  if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key)) return `STRIPE_SECRET_KEY doesn't look like a Stripe secret key (it should start with sk_live_ and have no spaces; it starts with "${key.slice(0, 8)}…").`;
  return null;
}

export function getStripe(): Stripe | null {
  const key = stripeSecretKey();
  if (!key) return null;
  // A new key (changed on the Worker) gets a new client.
  if (stripeClient?.key !== key) stripeClient = { key, client: new Stripe(key, { apiVersion: '2024-06-20' as unknown as Stripe.LatestApiVersion, httpClient: Stripe.createFetchHttpClient() }) };
  return stripeClient.client;
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
  // The owner has every paid feature without a subscription.
  return { user, org, plan: user.owner ? 'ENTERPRISE' : effectivePlan(org) };
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
  const periodEnd = (item as { current_period_end?: number } | undefined)?.current_period_end ?? sub.current_period_end;
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
