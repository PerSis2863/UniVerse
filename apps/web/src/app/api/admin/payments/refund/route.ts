import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { processUnifiedRefund } from '@/server/payments/provider';

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const amount = typeof body.amount === 'number' ? body.amount : undefined;
  const reason = typeof body.reason === 'string' ? body.reason : undefined;

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  try {
    const result = await processUnifiedRefund({
      orderId,
      amount,
      reason,
      actorId: auth.user.id,
    });

    audit(
      auth.user,
      {
        action: 'payment.refunded',
        summary: `Processed refund of ${(result.amount / 100).toFixed(2)} for order ${orderId}`,
        targetType: 'payment_order',
        targetId: orderId,
      },
      req,
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not process refund';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
