import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { getStripe } from '@/lib/billing';
import { recordError } from '@/server/errors';

const NOT_SET_UP = 'Online payments are not set up correctly yet. Please contact your administrator.';

/** Tells the owner (console → Errors) exactly what's wrong with the payment setup. */
function reportSetup(message: string, userId: string) {
  return recordError({ source: 'SERVER', kind: 'api', message: `Online payments: ${message}`, path: '/api/create-checkout-session', userId });
}

export async function POST(req: Request) {
  let userId = '';
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    userId = user.id;
    const stripe = getStripe();
    if (!stripe) {
      await reportSetup('the STRIPE_SECRET_KEY secret is not set on the Cloudflare Worker.', user.id);
      return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
    }

    const body = await req.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
    }

    const transaction = await prisma.payment.findUnique({
      where: { id: transactionId }
    });

    if (!transaction || (transaction.userId !== user.id && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (transaction.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Transaction already paid' }, { status: 400 });
    }

    const reqUrl = new URL(req.url);
    const origin = reqUrl.origin;

    // Create Checkout Sessions from DB properties
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (transaction.currency || 'USD').toLowerCase(),
            product_data: {
              name: transaction.description || 'Payment Balance',
            },
            unit_amount: Math.round(transaction.amount * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/student/administrative/accounting?success=true`,
      cancel_url: `${origin}/student/administrative/accounting?canceled=true`,
      client_reference_id: transactionId,
      metadata: {
        transactionId: transactionId,
      },
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (caught) {
    const err = caught as { type?: string; message?: string } | undefined;
    console.error('Checkout session failed:', err?.type, err?.message);
    if (err?.type === 'StripeAuthenticationError' || err?.type === 'StripePermissionError') {
      // Stripe's message names the key it saw (masked), e.g. "Invalid API Key provided: sk_live_****abcd".
      await reportSetup(`Stripe rejected the STRIPE_SECRET_KEY secret (${err?.message ?? err?.type}).`, userId);
      return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
    }
    await reportSetup(`checkout failed (${err?.type ?? 'Error'}: ${err?.message ?? String(caught)}).`, userId);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
