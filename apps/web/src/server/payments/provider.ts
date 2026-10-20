import prisma from '@/lib/db';
import { BadRequestException, HttpException, NotFoundException } from '../http';
import { donationPaid, donationRefunded } from '../donations';
import { ticketPaid, ticketRefunded } from '../event-tickets';
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

/**
 * Local test mode (`pnpm local:serve --payments-test` sets PAYMENTS_TEST_MODE=1): with no real
 * keys, orders use made-up gateway ids and "Simulate a test payment" completes them. Without it,
 * an order needs real keys, and a payment only counts once the gateway itself confirms it.
 */
export const paymentsTestMode = () => process.env.PAYMENTS_TEST_MODE === '1';
const TEST_STRIPE = 'sk_test_mock_secret', TEST_RZP_ID = 'rzp_test_mock_12345', TEST_RZP_SECRET = 'rzp_mock_secret';
const env = (k: string) => (process.env[k] ?? '').trim().replace(/^["']|["']$/g, '');

type OrgKeys = { razorpayKeyId?: string | null; razorpayKeySecret?: string | null; stripeSecretKey?: string | null; stripePublishableKey?: string | null } | null | undefined;
/** The gateway's keys (the school's own, else the site's), test ones only in test mode; null when not set up. */
export function gatewayKeys(org: OrgKeys, provider: PaymentProviderName) {
  if (provider === 'RAZORPAY') {
    const keyId = org?.razorpayKeyId || env('RAZORPAY_KEY_ID'), secret = org?.razorpayKeySecret || env('RAZORPAY_KEY_SECRET');
    if (keyId && secret) return { keyId, secret, test: false };
    return paymentsTestMode() ? { keyId: TEST_RZP_ID, secret: TEST_RZP_SECRET, test: true } : null;
  }
  const secret = org?.stripeSecretKey || env('STRIPE_SECRET_KEY');
  const keyId = org?.stripePublishableKey || env('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  if (secret) return { keyId, secret, test: false };
  return paymentsTestMode() ? { keyId: 'pk_test_mock_publishable', secret: TEST_STRIPE, test: true } : null;
}
const appUrl = (origin?: string) => (origin && /^https?:\/\/[^/]+$/.test(origin) ? origin : process.env.NEXT_PUBLIC_APP_URL || 'https://universeimpact.com');

export async function createUnifiedPaymentOrder(
  params: CreatePaymentOrderInput,
): Promise<PaymentOrderOutput> {
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
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

  const provider = params.provider ?? resolvePaymentProvider(org.paymentProvider, params.currency);
  const keys = gatewayKeys(org, provider);
  if (!keys) throw new HttpException(`Online payments aren’t set up yet (${provider === 'RAZORPAY' ? 'Razorpay' : 'Stripe'} keys are missing).`, 503);
  const orderReceipt = params.receiptNumber || `rcpt_${Date.now().toString(36)}`;

  // The order first, so the gateway can send the payer back to it.
  const created = await prisma.paymentOrder.create({
    data: {
      organizationId: params.orgId,
      userId: params.userId,
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      provider,
      purpose: params.purpose,
      invoiceId: params.purpose === 'FEE' ? params.targetId || null : null,
      orderRef: `pending_${Date.now().toString(36)}`,
      status: 'PENDING',
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
    select: { id: true },
  });

  let orderRef = '';
  let upiIntent: string | undefined;
  let checkoutUrl: string | undefined;
  const back = params.returnPath || '/student/fees';
  const sep = back.includes('?') ? '&' : '?';

  try {
    if (provider === 'RAZORPAY') {
      const rzpOrder = await createRazorpayOrder({
        keyId: keys.keyId,
        keySecret: keys.secret,
        amountMinor: params.amount,
        currency: params.currency,
        receipt: orderReceipt,
        notes: { orgId: params.orgId, userId: params.userId, purpose: params.purpose, paymentOrderId: created.id },
      });
      orderRef = rzpOrder.id;
      // A UPI link for QR codes and phones, to the school's own UPI id only (never a made-up one).
      const vpa = env('INSTITUTION_UPI_VPA');
      if (vpa && params.currency.toUpperCase() === 'INR') {
        upiIntent = generateUpiIntentUri({ payeeVpa: vpa, payeeName: org.name || 'UniVerse', amountMinor: params.amount, transactionRef: orderRef, note: params.description });
      }
    } else {
      const session = await createStripeSession({
        secretKey: keys.secret,
        amountMinor: params.amount,
        currency: params.currency,
        customerEmail: params.customerEmail,
        customerName: params.customerName,
        description: params.description,
        clientReferenceId: created.id,
        successUrl: `${appUrl(params.origin)}${back}${sep}paid=${created.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appUrl(params.origin)}${back}${sep}canceled=${created.id}`,
        metadata: { orgId: params.orgId, userId: params.userId, purpose: params.purpose, paymentOrderId: created.id, invoiceId: params.purpose === 'FEE' ? params.targetId || '' : '' },
        expiresInMinutes: params.expiresInMinutes,
      });
      orderRef = session.id;
      checkoutUrl = session.url;
    }
  } catch (e) {
    await prisma.paymentOrder.update({ where: { id: created.id }, data: { status: 'FAILED' } });
    throw e;
  }
  await prisma.paymentOrder.update({ where: { id: created.id }, data: { orderRef } });

  return {
    orderId: created.id,
    provider,
    orderRef,
    amount: params.amount,
    currency: params.currency.toUpperCase(),
    keyId: keys.keyId,
    upiIntent,
    checkoutUrl,
    testMode: keys.test,
  };
}

/** Asks Stripe itself whether a Checkout session was paid, for how much and in what currency. */
async function stripeSessionPaid(secret: string, sessionId: string) {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${secret}` } });
  if (!res.ok) return null;
  const s = (await res.json()) as { id: string; payment_status?: string; amount_total?: number; currency?: string; payment_intent?: string | null };
  return s.payment_status === 'paid' ? { paymentRef: s.payment_intent || s.id, amount: s.amount_total ?? -1, currency: (s.currency ?? '').toUpperCase() } : null;
}

/**
 * The payer's browser says it paid: check it with the gateway before anything counts. Stripe: the
 * Checkout session must be paid, for this order's amount and currency. Razorpay: the payment's
 * signature over this order's own reference. `userId`: only the person who made the order.
 */
export async function confirmUnifiedPayment(
  params: VerifyPaymentInput,
  userId?: string,
): Promise<VerifyPaymentOutput> {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    include: { organization: { select: { razorpayKeyId: true, razorpayKeySecret: true, stripeSecretKey: true, stripePublishableKey: true } } },
  });

  if (!order || (userId && order.userId !== userId)) throw new NotFoundException('Payment order not found.');
  if (order.status === 'COMPLETED') return completedResult(order.id);
  if (order.status !== 'PENDING') throw new BadRequestException('This payment was cancelled or refunded. Start a new one.');

  const provider = order.provider as PaymentProviderName;
  const keys = gatewayKeys(order.organization, provider);
  if (!keys) throw new HttpException('Online payments aren’t set up yet.', 503);

  let paymentRef = '';
  if (keys.test) {
    // Local test mode only (no real keys): the made-up checkout always "pays".
    paymentRef = `test_${order.id}`;
  } else if (provider === 'RAZORPAY') {
    if (!verifyRazorpaySignature(order.orderRef, params.paymentRef, params.signature, keys.secret)) throw new BadRequestException('Payment not confirmed by the gateway.');
    paymentRef = params.paymentRef;
  } else {
    const paid = await stripeSessionPaid(keys.secret, order.orderRef);
    if (!paid) throw new BadRequestException('Stripe hasn’t confirmed this payment yet. If you just paid, wait a moment and try again.');
    if (paid.amount !== order.amount || paid.currency !== order.currency.toUpperCase()) throw new BadRequestException('The amount paid doesn’t match this payment.');
    paymentRef = paid.paymentRef;
  }
  return completeOrder(order.id, provider, paymentRef, params.signature);
}

/**
 * A gateway's signed webhook says an order was paid (the caller checked the webhook signature).
 * The amount and currency must match the order.
 */
export async function confirmFromGateway(provider: PaymentProviderName, orderRef: string, paymentRef: string, amount: number, currency: string) {
  const order = await prisma.paymentOrder.findFirst({ where: { orderRef, provider }, select: { id: true, status: true, amount: true, currency: true } });
  if (!order) return null;
  if (order.status === 'COMPLETED') return completedResult(order.id);
  if (order.amount !== amount || order.currency.toUpperCase() !== currency.toUpperCase()) {
    console.error(`Payment ${order.id}: the gateway reported ${amount} ${currency}, expected ${order.amount} ${order.currency}.`);
    return null;
  }
  return completeOrder(order.id, provider, paymentRef, 'webhook');
}

async function completedResult(orderId: string): Promise<VerifyPaymentOutput> {
  const o = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, paymentRef: true, amount: true, currency: true, invoiceId: true } });
  const fee = o.invoiceId ? await prisma.feePayment.findFirst({ where: { orderId: o.id }, select: { seq: true } }) : null;
  return { success: true, orderId: o.id, paymentRef: o.paymentRef ?? '', amount: o.amount, currency: o.currency, invoiceId: o.invoiceId, receiptNumber: fee?.seq };
}

/** Marks an order paid exactly once (the browser and a webhook may both arrive), then what it paid for. */
async function completeOrder(orderId: string, provider: PaymentProviderName, paymentRef: string, signature: string): Promise<VerifyPaymentOutput> {
  const now = new Date();
  const { count } = await prisma.paymentOrder.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'COMPLETED', paymentRef, signature, paidAt: now },
  });
  if (count === 0) return completedResult(orderId);
  const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true } });

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
        method: provider === 'RAZORPAY' ? 'UPI' : 'CARD',
        gateway: provider,
        orderId: order.id,
        reference: paymentRef,
        note: `Online payment via ${provider} (${order.orderRef})`,
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

  // A donation to an NGO project (Stage 5 · Q16): its receipt number and the thank-you.
  if (order.purpose === 'DONATION') await donationPaid(order.id, now);
  // A paid event ticket (Stage 5 · Q17): the held seat becomes a ticket.
  if (order.purpose === 'EVENT') await ticketPaid(order.id);

  return {
    success: true,
    orderId: order.id,
    paymentRef,
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
    const keys = gatewayKeys(order.organization, 'RAZORPAY');
    if (!keys) throw new HttpException('Razorpay keys are missing.', 503);
    const { keyId, secret: keySecret } = keys;

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
    const keys = gatewayKeys(order.organization, 'STRIPE');
    if (!keys) throw new HttpException('Stripe keys are missing.', 503);
    const stripeSecret = keys.secret;

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

  if (order.purpose === 'DONATION') await donationRefunded(order.id);
  if (order.purpose === 'EVENT') await ticketRefunded(order.id);

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
