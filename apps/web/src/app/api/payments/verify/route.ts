import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { confirmUnifiedPayment } from '@/server/payments/provider';

// The payer is back from the gateway: { orderId, paymentRef?, signature? } (Razorpay's checkout
// gives both; Stripe needs neither). The gateway is asked before anything counts, and only the
// person who made the order can confirm it (src/server/payments/provider.ts).
export const POST = (req: Request) => route(req, async (user) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  if (!orderId) throw new BadRequestException('Which payment?');
  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).slice(0, 200) : '');
  return confirmUnifiedPayment({ orderId, provider: 'STRIPE', orderRef: '', paymentRef: s('paymentRef'), signature: s('signature') }, user.id);
});
