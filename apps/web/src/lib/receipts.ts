import prisma from '@/lib/db';

/** Receipt lookup for the server-rendered /receipt/[id] page (not exposed as a server action). */
export async function getReceipt(id: string) {
  return prisma.payment.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true } } },
  });
}
