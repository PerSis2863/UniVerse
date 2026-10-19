import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { BadRequestException, ForbiddenException, NotFoundException } from '@/server/http';
import { createUnifiedPaymentOrder } from '@/server/payments/provider';

// Pay a fee bill online: { invoiceId }. The amount is what's still owed on the bill (never what
// the browser sends). Donations have their own route (/api/impact/donations).
export const POST = (req: Request) => route(req, async (user) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : '';
  if (!invoiceId) throw new BadRequestException('Which bill?');

  const invoice = await prisma.feeInvoice.findUnique({
    where: { id: invoiceId },
    include: { student: { select: { id: true, name: true, email: true, organizationId: true } } },
  });
  if (!invoice) throw new NotFoundException('Invoice not found');
  // A student pays only their own bills (a parent or the office may pay for them).
  if (user.role === 'STUDENT' && invoice.studentId !== user.id) throw new ForbiddenException('Access denied to this fee invoice');

  const amount = Math.max(0, invoice.amount - invoice.discount - invoice.paid);
  if (amount <= 0) throw new BadRequestException('Invoice is already fully paid or settled.');

  const orgId = invoice.student.organizationId ?? user.organizationId ?? (await prisma.organization.findFirst({ select: { id: true } }))?.id;
  if (!orgId) throw new BadRequestException('No associated institution found');

  const order = await createUnifiedPaymentOrder({
    orgId,
    userId: user.id,
    amount,
    currency: invoice.currency,
    purpose: 'FEE',
    targetId: invoice.id,
    customerName: user.name || 'Student',
    customerEmail: user.email || 'student@universeimpact.com',
    description: `Fee Payment: ${invoice.label} (Inv #${invoice.seq})`,
    origin: new URL(req.url).origin,
  });
  return Response.json(order, { status: 201 });
});
