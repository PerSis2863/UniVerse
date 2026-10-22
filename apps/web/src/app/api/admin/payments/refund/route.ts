import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/billing';
import { audit } from '@/server/audit';
import { str } from '@/server/body';
import { processUnifiedRefund } from '@/server/payments/provider';
import { inSchools, schoolsOf, usersIn } from '@/server/school-scope';

/**
 * Whether this admin may refund the order: it was paid to one of their schools (their own, or the
 * one they own), or, for an order with no school, the payer is in their school (school-scope.ts).
 */
async function refundable(user: Parameters<typeof schoolsOf>[0], orgId: string, orderId: string) {
  const schools = await schoolsOf(user);
  if (schools === 'all') return true;
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { organizationId: true, userId: true } });
  if (!order) return true; // processUnifiedRefund says it isn't found
  if (order.organizationId) return order.organizationId === orgId || inSchools(schools, order.organizationId);
  return !!order.userId && !!(await prisma.user.findFirst({ where: { id: order.userId, ...usersIn(schools) }, select: { id: true } }));
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = str(body.orderId) ?? '';
  const amount = typeof body.amount === 'number' ? body.amount : undefined;
  const reason = str(body.reason);

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }
  // Another school's order looks just like one that doesn't exist.
  if (!(await refundable(auth.user, auth.org.id, orderId))) {
    return NextResponse.json({ error: 'Payment order not found.' }, { status: 400 });
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
