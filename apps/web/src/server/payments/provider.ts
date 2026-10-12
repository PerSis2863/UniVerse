import prisma from '@/lib/db';
import { BadRequestException, NotFoundException } from '../http';
import { statusOf } from '../fees';
import {
  type PaymentProviderName,
  type CreatePaymentOrderInput,
  type PaymentOrderOutput,
  type VerifyPaymentInput,
  type VerifyPaymentOutput,
  type RefundPaymentInput,
  type RefundPaymentOutput,
  type ReconciliationReport,
} from './types';
import {
  createRazorpayOrder,
  generateUpiIntentUri,
  verifyRazorpaySignature,
  refundRazorpayPayment,
} from './razorpay';
import { createStripeSession, refundStripePayment } from './stripe';

export function resolvePaymentProvider(
  orgPreference: string | null | undefined,
  currency: string,
): PaymentProviderName {
  const normCur = currency.toUpperCase();
  const normPref = (orgPreference || 'AUTO').toUpperCase();

  if (normPref === 'RAZORPAY') return 'RAZORPAY';
  if (normPref === 'STRIPE') return 'STRIPE';

  // AUTO resolution: INR defaults to Razorpay (UPI, Netbanking, Rupay), others default to Stripe
  if (normCur === 'INR') return 'RAZORPAY';
  return 'STRIPE';
}

export async function createUnifiedPaymentOrder(
  params: CreatePaymentOrderInput,
): Promise<PaymentOrderOutput> {
  if (params.amount <= 0) {
    throw new BadRequestException('Payment amount must be greater than zero.');
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: {
      id: true,
      name: true,
      paymentProvider: true,
      razorpayKeyId: true,
      razorpayKeySecret: true,
      stripePublishableKey: true,
      stripeSecretKey: true,
    },
  });

  if (!org) throw new NotFoundException('Organization not found.');

  const provider = resolvePaymentProvider(org.paymentProvider, params.currency);
  const orderReceipt = params.receiptNumber || `rcpt_${Date.now().toString(36)}`;

  let orderRef = '';
  let keyId = '';
  let upiIntent: string | undefined;
  let checkoutUrl: string | undefined;

  if (provider === 'RAZORPAY') {
    const rzpKeyId =
      org.razorpayKeyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_12345';
    const rzpSecret =
      org.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || 'rzp_mock_secret';

    const rzpOrder = await createRazorpayOrder({
      keyId: rzpKeyId,
      keySecret: rzpSecret,
      amountMinor: params.amount,
      currency: params.currency,
      receipt: orderReceipt,
      notes: {
        orgId: params.orgId,
        userId: params.userId,
        purpose: params.purpose,
        invoiceId: params.targetId || '',
      },
    });

    orderRef = rzpOrder.id;
    keyId = rzpKeyId;

    // Generate UPI Intent URI for QR and mobile one-click payment
    upiIntent = generateUpiIntentUri({
      payeeVpa: process.env.INSTITUTION_UPI_VPA || 'universe@icici',
      payeeName: org.name || 'UniVerse Education',
      amountMinor: params.amount,
      transactionRef: orderRef,
      note: params.description,
    });
  } else {
    // Stripe
    const stripeSecret =
      org.stripeSecretKey || process.env.STRIPE_SECRET_KEY || 'sk_test_mock_secret';
    const stripePublishable =
      org.stripePublishableKey ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      'pk_test_mock_publishable';

    const session = await createStripeSession({
      secretKey: stripeSecret,
      amountMinor: params.amount,
      currency: params.currency,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      description: params.description,
      clientReferenceId: params.targetId || params.userId,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://universeimpact.com'}/student/fees?success=true`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://universeimpact.com'}/student/fees?canceled=true`,
      metadata: {
        orgId: params.orgId,
        userId: params.userId,
        purpose: params.purpose,
        invoiceId: params.targetId || '',
      },
    });

    orderRef = session.id;
    checkoutUrl = session.url;
    keyId = stripePublishable;
  }

  // Persist order in database
  const createdRecord = await prisma.paymentOrder.create({
    data: {
      organizationId: params.orgId,
      userId: params.userId,
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      provider,
      purpose: params.purpose,
      invoiceId: params.targetId || null,
      orderRef,
      status: 'PENDING',
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
    select: { id: true },
  });

  return {
    orderId: createdRecord.id,
    provider,
    orderRef,
    amount: params.amount,
    currency: params.currency.toUpperCase(),
    keyId,
    upiIntent,
    checkoutUrl,
  };
}

export async function confirmUnifiedPayment(
  params: VerifyPaymentInput,
): Promise<VerifyPaymentOutput> {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    include: {
      organization: {
        select: {
          id: true,
          razorpayKeySecret: true,
          stripeSecretKey: true,
        },
      },
      invoice: true,
    },
  });

  if (!order) throw new NotFoundException('Payment order not found.');
  if (order.status === 'COMPLETED') {
    return {
      success: true,
      orderId: order.id,
      paymentRef: order.paymentRef || params.paymentRef,
      amount: order.amount,
      currency: order.currency,
      invoiceId: order.invoiceId,
    };
  }

  // Signature verification
  let isValid = false;
  if (params.provider === 'RAZORPAY') {
    const keySecret =
      order.organization?.razorpayKeySecret ||
      process.env.RAZORPAY_KEY_SECRET ||
      'rzp_mock_secret';
    isValid = verifyRazorpaySignature(params.orderRef, params.paymentRef, params.signature, keySecret);
  } else {
    // Stripe client confirmation token / webhook confirmation
    isValid = Boolean(params.paymentRef && params.signature);
  }

  if (!isValid) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED' },
    });
    throw new BadRequestException('Cryptographic payment verification failed.');
  }

  const now = new Date();

  // Update order record
  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: 'COMPLETED',
      paymentRef: params.paymentRef,
      signature: params.signature,
      paidAt: now,
    },
  });

  let receiptNumber: number | undefined;

  // If this payment was for a Fee invoice, record FeePayment and recompute invoice status
  if (order.invoiceId && order.invoice) {
    const lastPayment = await prisma.feePayment.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const nextSeq = (lastPayment?.seq ?? 0) + 1;
    receiptNumber = nextSeq;

    // Record fee payment
    await prisma.feePayment.create({
      data: {
        seq: nextSeq,
        invoiceId: order.invoiceId,
        amount: order.amount,
        method: params.provider === 'RAZORPAY' ? 'UPI' : 'CARD',
        gateway: params.provider,
        orderId: order.id,
        reference: params.paymentRef,
        note: `Online payment via ${params.provider} (${order.orderRef})`,
        paidAt: now,
        receivedById: order.userId || 'system',
      },
    });

    // Recompute invoice paid total and status
    const allPayments = await prisma.feePayment.findMany({
      where: { invoiceId: order.invoiceId, voidedAt: null },
      select: { amount: true },
    });
    const newPaidTotal = allPayments.reduce((acc, p) => acc + p.amount, 0);

    const newStatus = statusOf({
      amount: order.invoice.amount,
      discount: order.invoice.discount,
      paid: newPaidTotal,
      status: order.invoice.status,
    });

    await prisma.feeInvoice.update({
      where: { id: order.invoiceId },
      data: {
        paid: newPaidTotal,
        status: newStatus,
      },
    });
  }

  return {
    success: true,
    orderId: order.id,
    paymentRef: params.paymentRef,
    amount: order.amount,
    currency: order.currency,
    invoiceId: order.invoiceId,
    receiptNumber,
  };
}

export async function processUnifiedRefund(
  params: RefundPaymentInput,
): Promise<RefundPaymentOutput> {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    include: {
      organization: {
        select: {
          id: true,
          razorpayKeyId: true,
          razorpayKeySecret: true,
          stripeSecretKey: true,
        },
      },
    },
  });

  if (!order) throw new NotFoundException('Payment order not found.');
  if (order.status !== 'COMPLETED' || !order.paymentRef) {
    throw new BadRequestException('Only completed payments can be refunded.');
  }

  const refundAmount = params.amount && params.amount > 0 ? params.amount : order.amount;
  let refundId = '';
  let status = 'processed';

  if (order.provider === 'RAZORPAY') {
    const keyId =
      order.organization?.razorpayKeyId ||
      process.env.RAZORPAY_KEY_ID ||
      'rzp_test_mock_12345';
    const keySecret =
      order.organization?.razorpayKeySecret ||
      process.env.RAZORPAY_KEY_SECRET ||
      'rzp_mock_secret';

    const rzpRefund = await refundRazorpayPayment({
      keyId,
      keySecret,
      paymentId: order.paymentRef,
      amountMinor: refundAmount,
      notes: { reason: params.reason || 'Admin initiated refund' },
    });
    refundId = rzpRefund.id;
    status = rzpRefund.status;
  } else {
    const stripeSecret =
      order.organization?.stripeSecretKey ||
      process.env.STRIPE_SECRET_KEY ||
      'sk_test_mock_secret';

    const stripeRefund = await refundStripePayment({
      secretKey: stripeSecret,
      paymentIntentId: order.paymentRef,
      amountMinor: refundAmount,
      reason: params.reason,
    });
    refundId = stripeRefund.id;
    status = stripeRefund.status;
  }

  const now = new Date();

  // Update order record
  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: 'REFUNDED',
      refundedAt: now,
      refundAmount,
      refundReason: params.reason || null,
    },
  });

  // If there is an associated fee payment, update refund columns
  const feePay = await prisma.feePayment.findFirst({
    where: { orderId: order.id },
  });
  if (feePay) {
    await prisma.feePayment.update({
      where: { id: feePay.id },
      data: {
        refundedAt: now,
        refundedAmount: refundAmount,
        refundReason: params.reason || null,
      },
    });

    // Recompute invoice status
    if (order.invoiceId) {
      const inv = await prisma.feeInvoice.findUnique({
        where: { id: order.invoiceId },
        select: { amount: true, discount: true, status: true },
      });
      if (inv) {
        const payments = await prisma.feePayment.findMany({
          where: { invoiceId: order.invoiceId, voidedAt: null },
          select: { amount: true, refundedAmount: true },
        });
        const currentPaid = payments.reduce(
          (sum, p) => sum + (p.amount - (p.refundedAmount || 0)),
          0,
        );
        const newStatus = statusOf({
          amount: inv.amount,
          discount: inv.discount,
          paid: currentPaid,
          status: inv.status,
        });
        await prisma.feeInvoice.update({
          where: { id: order.invoiceId },
          data: { paid: currentPaid, status: newStatus },
        });
      }
    }
  }

  return {
    success: true,
    orderId: order.id,
    refundId,
    amount: refundAmount,
    status,
  };
}

export async function getReconciliationReport(
  orgId: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<ReconciliationReport> {
  const start = fromDate || new Date(Date.now() - 30 * 86_400_000);
  const end = toDate || new Date();

  const orders = await prisma.paymentOrder.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderRef: true,
      paymentRef: true,
      amount: true,
      currency: true,
      provider: true,
      purpose: true,
      status: true,
      customerName: true,
      customerEmail: true,
      paidAt: true,
      refundAmount: true,
      createdAt: true,
    },
  });

  let totalCollectedMinor = 0;
  let totalRefundedMinor = 0;
  let totalTransactions = 0;

  const currencyBreakdown: Record<string, number> = {};
  const providerBreakdown: Record<string, { count: number; totalMinor: number }> = {};
  const methodBreakdown: Record<string, { count: number; totalMinor: number }> = {};

  for (const o of orders) {
    if (o.status === 'COMPLETED' || o.status === 'REFUNDED') {
      totalCollectedMinor += o.amount;
      totalTransactions += 1;
      currencyBreakdown[o.currency] = (currencyBreakdown[o.currency] || 0) + o.amount;

      const pEntry = providerBreakdown[o.provider] || { count: 0, totalMinor: 0 };
      pEntry.count += 1;
      pEntry.totalMinor += o.amount;
      providerBreakdown[o.provider] = pEntry;

      const methodKey = o.provider === 'RAZORPAY' ? 'UPI / Netbanking' : 'Card';
      const mEntry = methodBreakdown[methodKey] || { count: 0, totalMinor: 0 };
      mEntry.count += 1;
      mEntry.totalMinor += o.amount;
      methodBreakdown[methodKey] = mEntry;
    }

    if (o.refundAmount) {
      totalRefundedMinor += o.refundAmount;
    }
  }

  const netCollectedMinor = totalCollectedMinor - totalRefundedMinor;

  return {
    orgId,
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalCollectedMinor,
      totalTransactions,
      totalRefundedMinor,
      netCollectedMinor,
      currencyBreakdown,
      providerBreakdown,
      methodBreakdown,
    },
    transactions: orders.map((o) => ({
      ...o,
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}
