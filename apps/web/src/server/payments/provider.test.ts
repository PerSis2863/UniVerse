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
      findMany: vi.fn(),
      update: vi.fn(),
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
    it('creates Razorpay order for INR and generates UPI Intent', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        id: 'org-1',
        name: 'Riverside Institute',
        paymentProvider: 'AUTO',
        razorpayKeyId: 'rzp_test_mock_123',
        razorpayKeySecret: 'rzp_test_sec_123',
        stripePublishableKey: null,
        stripeSecretKey: null,
      } as never);

      vi.mocked(prisma.paymentOrder.create).mockResolvedValueOnce({
        id: 'po-1',
      } as never);

      const res = await createUnifiedPaymentOrder({
        orgId: 'org-1',
        userId: 'usr-1',
        amount: 500000,
        currency: 'INR',
        purpose: 'FEE',
        targetId: 'inv-1',
        customerName: 'Alex Chen',
        customerEmail: 'alex@example.com',
        description: 'Semester 1 Fee',
      });

      expect(res.orderId).toBe('po-1');
      expect(res.provider).toBe('RAZORPAY');
      expect(res.amount).toBe(500000);
      expect(res.currency).toBe('INR');
      expect(res.upiIntent).toContain('upi://pay?');
      expect(prisma.paymentOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'usr-1',
            amount: 500000,
            provider: 'RAZORPAY',
          }),
        }),
      );
    });

    it('rejects non-positive payment order amounts', async () => {
      await expect(
        createUnifiedPaymentOrder({
          orgId: 'org_1',
          userId: 'usr_1',
          amount: 0,
          currency: 'INR',
          purpose: 'FEE',
          customerName: 'Alex Chen',
          customerEmail: 'alex@example.com',
          description: 'Fee payment',
        }),
      ).rejects.toThrow('Payment amount must be greater than zero.');
    });

    it('throws NotFoundException on confirming unknown order', async () => {
      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce(null);

      await expect(
        confirmUnifiedPayment({
          orderId: 'non_existent_order_id',
          provider: 'RAZORPAY',
          orderRef: 'order_123',
          paymentRef: 'pay_123',
          signature: 'sig_123',
        }),
      ).rejects.toThrow('Payment order not found.');
    });

    it('confirms valid Razorpay payment and reconciles FeeInvoice', async () => {
      const orderRef = 'order_DAv173';
      const paymentRef = 'pay_29Sk178';
      const keySecret = 'rzp_sec_key_456';
      const sig = computeRazorpaySignature(orderRef, paymentRef, keySecret);

      vi.mocked(prisma.paymentOrder.findUnique).mockResolvedValueOnce({
        id: 'po-1',
        status: 'PENDING',
        amount: 25000,
        currency: 'INR',
        orderRef,
        userId: 'usr-1',
        invoiceId: 'inv-1',
        organization: {
          id: 'org-1',
          razorpayKeySecret: keySecret,
        },
        invoice: {
          id: 'inv-1',
          amount: 25000,
          discount: 0,
          paid: 0,
          status: 'DUE',
        },
      } as never);

      vi.mocked(prisma.paymentOrder.update).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.feePayment.findFirst).mockResolvedValueOnce({ seq: 42 } as never);
      vi.mocked(prisma.feePayment.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.feePayment.findMany).mockResolvedValueOnce([{ amount: 25000 }] as never);
      vi.mocked(prisma.feeInvoice.update).mockResolvedValueOnce({} as never);

      const res = await confirmUnifiedPayment({
        orderId: 'po-1',
        provider: 'RAZORPAY',
        orderRef,
        paymentRef,
        signature: sig,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe('po-1');
      expect(res.receiptNumber).toBe(43);
      expect(prisma.feeInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            paid: 25000,
            status: 'PAID',
          }),
        }),
      );
    });
  });
});
