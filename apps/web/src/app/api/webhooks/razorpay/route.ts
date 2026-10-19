import { NextResponse } from 'next/server';
import { verifyRazorpayWebhookSignature } from '@/server/payments/razorpay';
import { confirmFromGateway } from '@/server/payments/provider';

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  // No secret, no webhook: never a default one (anyone could sign with it).
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET ?? '').trim();
  if (!secret) return NextResponse.json({ error: 'Razorpay webhooks aren’t set up.' }, { status: 503 });
  if (!verifyRazorpayWebhookSignature(payload, signature, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let eventData: Record<string, unknown>;
  try {
    eventData = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const eventType = String(eventData.event || '');

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payloadObj = (eventData.payload || {}) as Record<string, unknown>;
    const paymentObj = ((payloadObj.payment || {}) as Record<string, unknown>).entity as Record<string, unknown> | undefined;
    const orderIdGateway = typeof paymentObj?.order_id === 'string' ? paymentObj.order_id : null;
    const paymentIdGateway = typeof paymentObj?.id === 'string' ? paymentObj.id : null;

    const amount = Number(paymentObj?.amount), currency = typeof paymentObj?.currency === 'string' ? paymentObj.currency : '';
    if (orderIdGateway && paymentIdGateway && Number.isInteger(amount)) {
      try {
        await confirmFromGateway('RAZORPAY', orderIdGateway, paymentIdGateway, amount, currency);
      } catch (err: unknown) {
        console.error('Failed to confirm order from Razorpay webhook:', err);
        return NextResponse.json({ error: 'Not recorded yet' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
