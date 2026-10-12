import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { confirmUnifiedPayment } from '@/server/payments/provider';
import type { PaymentProviderName } from '@/server/payments/types';

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const provider = (typeof body.provider === 'string' ? body.provider : 'RAZORPAY') as PaymentProviderName;
  const orderRef = typeof body.orderRef === 'string' ? body.orderRef : '';
  const paymentRef = typeof body.paymentRef === 'string' ? body.paymentRef : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';

  if (!orderId || !orderRef || !paymentRef || !signature) {
    return NextResponse.json({ error: 'Missing required payment verification parameters' }, { status: 400 });
  }

  try {
    const result = await confirmUnifiedPayment({
      orderId,
      provider,
      orderRef,
      paymentRef,
      signature,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
