import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyRazorpayWebhookSignature } from '@/server/payments/razorpay';
import { confirmUnifiedPayment } from '@/server/payments/provider';

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_rzp_universe';
  const isValid = verifyRazorpayWebhookSignature(payload, signature, secret);

  if (!isValid && !process.env.SKIP_WEBHOOK_VERIFY) {
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

    if (orderIdGateway && paymentIdGateway) {
      const orderRecord = await prisma.paymentOrder.findFirst({
        where: { orderRef: orderIdGateway },
      });

      if (orderRecord && orderRecord.status !== 'COMPLETED') {
        try {
          await confirmUnifiedPayment({
            orderId: orderRecord.id,
            provider: 'RAZORPAY',
            orderRef: orderIdGateway,
            paymentRef: paymentIdGateway,
            signature: signature || 'webhook_confirmed',
          });
        } catch (err: unknown) {
          console.error('Failed to confirm order from Razorpay webhook:', err);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
