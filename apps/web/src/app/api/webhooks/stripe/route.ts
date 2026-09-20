import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20' as any,
});

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // Get transaction ID from metadata
    const transactionId = session.metadata?.transactionId;

    if (transactionId) {
      // Update transaction status
      try {
        const transaction = await prisma.transaction.update({
          where: { id: transactionId },
          data: { 
            status: 'PAID',
            stripeSessionId: session.id
          },
          include: { user: true }
        });
        
        console.log(`Payment confirmed for transaction ${transactionId}`);
        
        // Email functionality via Resend
        if (process.env.RESEND_API_KEY) {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'UniVerse Finance <finance@universe.edu>',
                to: [transaction.user.email],
                subject: 'Payment Confirmation - UniVerse',
                html: `<p>Dear ${transaction.user.name},</p><p>We have successfully received your payment of $${transaction.amount} for ${transaction.description}.</p><p>Thank you!</p>`
              })
            });
            if (res.ok) {
              console.log(`Sent confirmation email to student: ${transaction.user.email}`);
            } else {
              console.error('Failed to send email:', await res.text());
            }
          } catch (e) {
            console.error('Error sending email via Resend:', e);
          }
        } else {
          console.log(`Skipping email to ${transaction.user.email} (No RESEND_API_KEY)`);
        }
      } catch (err) {
        console.error('Error updating transaction:', err);
        return NextResponse.json({ error: 'Failed to update transaction in database' }, { status: 500 });
      }
    } else {
      console.warn('Checkout session completed but no transactionId found in metadata.');
    }
  }

  return NextResponse.json({ received: true });
}
