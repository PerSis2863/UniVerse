import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20' as any,
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

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
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
