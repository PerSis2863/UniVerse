import prisma from '@/lib/db';

/** A payment with its payer, for GET /api/receipts/[id] (the /receipt/[id] page). */
export async function getReceipt(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true } } },
  });
}
