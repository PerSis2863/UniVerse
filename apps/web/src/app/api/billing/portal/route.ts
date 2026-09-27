import { NextResponse } from 'next/server';
import { getStripe, requireAdmin } from '@/lib/billing';

// Stripe's hosted billing portal: change plan, update card, download invoices, cancel.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'Billing is not configured (missing STRIPE_SECRET_KEY).' }, { status: 503 });
  if (!auth.org.stripeCustomerId) return NextResponse.json({ error: 'No billing account yet — choose a plan first.' }, { status: 400 });

  const session = await stripe.billingPortal.sessions.create({
    customer: auth.org.stripeCustomerId,
    return_url: `${new URL(req.url).origin}/admin/billing`,
  });
  return NextResponse.json({ url: session.url });
}
