import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';
import { createUnifiedPaymentOrder } from '@/server/payments/provider';
import type { PaymentPurpose } from '@/server/payments/types';

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : undefined;
  const purpose = (typeof body.purpose === 'string' ? body.purpose : 'FEE') as PaymentPurpose;

  let amount = typeof body.amount === 'number' ? body.amount : 0;
  let currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : 'INR';
  let description = typeof body.description === 'string' ? body.description : 'UniVerse Institutional Payment';
  let orgId = user.organizationId;

  if (invoiceId) {
    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: { select: { id: true, name: true, email: true, organizationId: true } },
      },
    });

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Ensure user is authorized to pay for this invoice (student themselves, or guardian, or admin)
    if (user.role === 'STUDENT' && invoice.studentId !== user.id) {
      return NextResponse.json({ error: 'Access denied to this fee invoice' }, { status: 403 });
    }

    const outstanding = Math.max(0, invoice.amount - invoice.discount - invoice.paid);
    if (outstanding <= 0) {
      return NextResponse.json({ error: 'Invoice is already fully paid or settled.' }, { status: 400 });
    }

    amount = outstanding;
    currency = invoice.currency;
    description = `Fee Payment: ${invoice.label} (Inv #${invoice.seq})`;
    if (invoice.student.organizationId) {
      orgId = invoice.student.organizationId;
    }
  }

  if (!orgId) {
    const fallbackOrg = await prisma.organization.findFirst({ select: { id: true } });
    orgId = fallbackOrg?.id;
  }

  if (!orgId) {
    return NextResponse.json({ error: 'No associated institution found' }, { status: 400 });
  }

  try {
    const order = await createUnifiedPaymentOrder({
      orgId,
      userId: user.id,
      amount,
      currency,
      purpose,
      targetId: invoiceId,
      customerName: user.name || 'Student',
      customerEmail: user.email || 'student@universeimpact.com',
      description,
    });

    return NextResponse.json(order, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not create payment order';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
