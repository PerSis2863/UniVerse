import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { org, plan } = auth;
  return NextResponse.json({
    organization: { id: org.id, name: org.name },
    plan,
    subscribedPlan: org.plan,
    status: org.subscriptionStatus,
    interval: org.billingInterval,
    currentPeriodEnd: org.currentPeriodEnd,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    hasBillingAccount: !!org.stripeCustomerId,
  });
}
