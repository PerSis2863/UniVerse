import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  resolvePaymentProvider,
  createUnifiedPaymentOrder,
  confirmUnifiedPayment,
} from './provider';
import {
  computeRazorpaySignature,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  generateUpiIntentUri,
} from './razorpay';

vi.mock('@/lib/db', () => ({
  default: {
    paymentOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    feePayment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    feeInvoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Stage 5 · C6: Unified Payments Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolvePaymentProvider', () => {
    it('defaults INR transactions to Razorpay (UPI, Netbanking, Rupay)', () => {
      expect(resolvePaymentProvider('AUTO', 'INR')).toBe('RAZORPAY');
      expect(resolvePaymentProvider(null, 'INR')).toBe('RAZORPAY');
      expect(resolvePaymentProvider(undefined, 'inr')).toBe('RAZORPAY');
    });

    it('defaults international currencies to Stripe', () => {
      expect(resolvePaymentProvider('AUTO', 'USD')).toBe('STRIPE');
      expect(resolvePaymentProvider(null, 'EUR')).toBe('STRIPE');
      expect(resolvePaymentProvider(undefined, 'GBP')).toBe('STRIPE');
    });

    it('honours explicit organization preferences', () => {
      expect(resolvePaymentProvider('RAZORPAY', 'USD')).toBe('RAZORPAY');
      expect(resolvePaymentProvider('STRIPE', 'INR')).toBe('STRIPE');
    });
  });

  describe('Razorpay HMAC & UPI Intent', () => {
    const orderId = 'order_DAv173eL841Klm';
    const paymentId = 'pay_29Sk178xX0841';
    const secret = 'rzp_test_secret_key_8410';

    it('generates and verifies valid payment signatures', () => {
      const sig = computeRazorpaySignature(orderId, paymentId, secret);
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
      expect(verifyRazorpaySignature(orderId, paymentId, sig, secret)).toBe(true);
    });

    it('rejects tampered signatures or mismatched keys', () => {
      const sig = computeRazorpaySignature(orderId, paymentId, secret);
      const tampered = `${sig.slice(0, -2)}00`;
      expect(verifyRazorpaySignature(orderId, paymentId, tampered, secret)).toBe(false);
      expect(verifyRazorpaySignature(orderId, paymentId, sig, 'wrong_secret')).toBe(false);
      expect(verifyRazorpaySignature('order_diff', paymentId, sig, secret)).toBe(false);
    });

    it('verifies webhook HMAC-SHA256 signatures', () => {
      const payload = JSON.stringify({ event: 'payment.captured', id: 'evt_123' });
      const whSecret = 'whsec_rzp_98412';
      const hmac = crypto.createHmac('sha256', whSecret).update(payload).digest('hex');
      expect(verifyRazorpayWebhookSignature(payload, hmac, whSecret)).toBe(true);
      expect(verifyRazorpayWebhookSignature(payload, 'wrong_sig', whSecret)).toBe(false);
    });

    it('generates standard NPCI UPI Intent URI for QR and mobile apps', () => {
      const uri = generateUpiIntentUri({
        payeeVpa: 'riverside@icici',
        payeeName: 'Riverside University',
        amountMinor: 250000, // 2500.00 INR
        transactionRef: 'order_123456',
        note: 'Semester 1 Tuition Fee',
      });

      expect(uri).toContain('upi://pay?');
      expect(uri).toContain('pa=riverside%40icici');
      expect(uri).toContain('pn=Riverside+University');
      expect(uri).toContain('am=2500.00');
      expect(uri).toContain('cu=INR');
      expect(uri).toContain('tr=order_123456');
    });
  });

  describe('Unified Order Creation & Confirmation', () => {
    const org = (keys: Record<string, string | null>) => ({
      id: 'org-1', name: 'Riverside Institute', paymentProvider: 'AUTO',
      razorpayKeyId: null, razorpayKeySecret: null, stripePublishableKey: null, stripeSecretKey: null, ...keys,
    }) as never;
    const input = { orgId: 'org-1', userId: 'usr-1', amount: 500000, currency: 'INR', purpose: 'FEE' as const, targetId: 'inv-1', customerName: 'Alex Chen', customerEmail: 'alex@example.com', description: 'Semester 1 Fee' };
    const pending = (extra: Record<string, unknown>) => ({
      id: 'po-1', status: 'PENDING', amount: 25000, currency: 'INR', provider: 'RAZORPAY', orderRef: 'order_DAv173', userId: 'usr-1', invoiceId: 'inv-1',
      organization: { razorpayKeyId: 'rzp_live_id', razorpayKeySecret: 'rzp_sec_key_456', stripeSecretKey: null, stripePublishableKey: null }, ...extra,
    }) as never;
    const reconcileMocks = () => {
      vi.mocked(prisma.paymentOrder.updateMany).mockResolvedValueOnce({ count: 1 } as never);
      vi.mocked(prisma.paymentOrder.findUniqueOrThrow).mockResolvedValueOnce({ id: 'po-1', amount: 25000, currency: 'INR', orderRef: 'order_DAv173', userId: 'usr-1', invoiceId: 'inv-1', purpose: 'FEE', invoice: { id: 'inv-1', amount: 25000, discount: 0, paid: 0, status: 'DUE' } } as never);
      vi.mocked(prisma.feePayment.findFirst).mockResolvedValueOnce({ seq: 42 } as never);
      vi.mocked(prisma.feePayment.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.feePayment.findMany).mockResolvedValueOnce([{ amount: 25000 }] as never);
      vi.mocked(prisma.feeInvoice.update).mockResolvedValueOnce({} as never);
    };

    it('creates a Razorpay order for INR, with a UPI link only to the school’s own UPI id', async () => {
      process.env.INSTITUTION_UPI_VPA = 'school@okbank';
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(org({ razorpayKeyId: 'rzp_test_mock_123', razorpayKeySecret: 'rzp_test_sec_123' }));
      vi.mocked(prisma.paymentOrder.create).mockResolvedValueOnce({ id: 'po-1' } as never);
      vi.mocked(prisma.paymentOrder.update).mockResolvedValueOnce({} as never);
      const res = await createUnifiedPaymentOrder(input);
      delete process.env.INSTITUTION_UPI_VPA;
      expect(res).toMatchObject({ orderId: 'po-1', provider: 'RAZORPAY', amount: 500000, currency: 'INR', testMode: false });
      expect(res.upiIntent).toContain('pa=school%40okbank');
      expect(prisma.paymentOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', userId: 'usr-1', amount: 500000, provider: 'RAZORPAY', invoiceId: 'inv-1' }) }));
    });

    it('refuses to take payments without real keys (no made-up gateway outside test mode)', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(org({}));
      await expect(createUnifiedPaymentOrder(input)).rejects.toThrow('Online payments aren’t set up yet');
      expect(prisma.paymentOrder.create).not.toHaveBeenCalled();
    });

    it('rejects non-positive payment order amounts', async () => {
      await expect(createUnifiedPaymentOrder({ ...input, amount: 0 })).rejects.toThrow('Payment amount must be greater than zero.');
    });

    it('throws NotFoundException on confirming unknown order', async () => {
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(null);
      await expect(confirmUnifiedPayment({ orderId: 'nope', provider: 'RAZORPAY', orderRef: 'order_123', paymentRef: 'pay_123', signature: 'sig_123' })).rejects.toThrow('Payment order not found.');
    });

    it('confirms a valid Razorpay payment and reconciles the fee bill', async () => {
      const sig = computeRazorpaySignature('order_DAv173', 'pay_29Sk178', 'rzp_sec_key_456');
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(pending({}));
      reconcileMocks();
      const res = await confirmUnifiedPayment({ orderId: 'po-1', provider: 'RAZORPAY', orderRef: 'ignored', paymentRef: 'pay_29Sk178', signature: sig }, 'usr-1');
      expect(res).toMatchObject({ success: true, orderId: 'po-1', receiptNumber: 43 });
      expect(prisma.feeInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv-1' }, data: expect.objectContaining({ paid: 25000, status: 'PAID' }) }));
    });

    it('refuses a signature made for another (smaller) order', async () => {
      const sig = computeRazorpaySignature('order_CHEAP', 'pay_29Sk178', 'rzp_sec_key_456');
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(pending({}));
      await expect(confirmUnifiedPayment({ orderId: 'po-1', provider: 'RAZORPAY', orderRef: 'order_CHEAP', paymentRef: 'pay_29Sk178', signature: sig }, 'usr-1')).rejects.toThrow('not confirmed');
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
    });

    it('refuses someone else’s order', async () => {
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(pending({}));
      await expect(confirmUnifiedPayment({ orderId: 'po-1', provider: 'RAZORPAY', orderRef: '', paymentRef: 'x', signature: 'y' }, 'usr-2')).rejects.toThrow('Payment order not found.');
    });

    it('asks Stripe: made-up strings never count, the amount must match, a paid session does', async () => {
      const stripeOrder = () => pending({ provider: 'STRIPE', currency: 'USD', orderRef: 'cs_live_1', organization: { stripeSecretKey: 'sk_live_x', stripePublishableKey: 'pk_live_x', razorpayKeyId: null, razorpayKeySecret: null } });
      const reply = (body: Record<string, unknown>) => vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(stripeOrder());
      reply({ id: 'cs_live_1', payment_status: 'unpaid', amount_total: 25000, currency: 'usd' });
      await expect(confirmUnifiedPayment({ orderId: 'po-1', provider: 'STRIPE', orderRef: '', paymentRef: 'pay_fake', signature: 'sig_verified_mock' }, 'usr-1')).rejects.toThrow('Stripe hasn’t confirmed');
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(stripeOrder());
      reply({ id: 'cs_live_1', payment_status: 'paid', amount_total: 100, currency: 'usd' });
      await expect(confirmUnifiedPayment({ orderId: 'po-1', provider: 'STRIPE', orderRef: '', paymentRef: '', signature: '' }, 'usr-1')).rejects.toThrow('doesn’t match');
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(stripeOrder());
      reply({ id: 'cs_live_1', payment_status: 'paid', amount_total: 25000, currency: 'usd', payment_intent: 'pi_1' });
      reconcileMocks();
      const res = await confirmUnifiedPayment({ orderId: 'po-1', provider: 'STRIPE', orderRef: '', paymentRef: '', signature: '' }, 'usr-1');
      expect(res.paymentRef).toBe('pi_1');
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'po-1', status: 'PENDING' } }));
      vi.restoreAllMocks();
    });
  });
});
