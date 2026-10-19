import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { NotFoundException } from '@/server/http';

// GET ?orderId=: is my payment through yet (a UPI payment is confirmed by the gateway's webhook)?
export const GET = (req: Request) => route(req, async (user) => {
  const id = new URL(req.url).searchParams.get('orderId') ?? '';
  const o = await prisma.paymentOrder.findFirst({ where: { id, userId: user.id }, select: { status: true, paidAt: true } });
  if (!o) throw new NotFoundException('Payment not found.');
  return o;
});
